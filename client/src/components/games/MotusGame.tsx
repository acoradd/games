import type {Room} from '@colyseus/sdk';
import {Type} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import { useNotifications } from '../../hooks/useNotifications';
import NotificationBanner from '../NotificationBanner';
import { getStoredPlayer } from '../../services/playerService';
import type {
    ChatMsg,
    GenericGameState,
    LobbyPlayer,
    LobbyState,
    MotusGameState,
    MotusGuess,
    MotusLetterResult
} from '../../models/Lobby';
import Avatar from '../Avatar';
import GameShell from './GameShell';

// ── AZERTY layout ─────────────────────────────────────────────────────────────

const AZERTY_ROWS = [
    ["a","z","e","r","t","y","u","i","o","p"],
    ["q","s","d","f","g","h","j","k","l","m"],
    ["w","x","c","v","b","n"],
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

const RESULT_PRIORITY: Record<MotusLetterResult, number> = { correct: 3, misplaced: 2, absent: 1 };

function motusColors(colorblind: boolean) {
    return {
        correct:     colorblind ? "bg-blue-500 border-blue-400 text-white"    : "bg-green-600 border-green-500 text-white",
        correctLock: colorblind ? "bg-blue-700 border-blue-500 text-white"    : "bg-green-700 border-green-500 text-white",
        misplaced:   colorblind ? "bg-orange-500 border-orange-400 text-white" : "bg-amber-500 border-amber-400 text-white",
        correctDot:  colorblind ? "bg-blue-500"    : "bg-green-600",
        misplacedDot: colorblind ? "bg-orange-500" : "bg-amber-500",
    };
}

function computeLetterStates(guesses: MotusGuess[]): Record<string, MotusLetterResult> {
    const states: Record<string, MotusLetterResult> = {};
    for (const { word, result } of guesses) {
        for (let i = 0; i < word.length; i++) {
            const l = word[i]!;
            const r = result[i]!;
            if (!states[l] || RESULT_PRIORITY[r] > RESULT_PRIORITY[states[l]!]) states[l] = r;
        }
    }
    return states;
}

// ── LetterCell ────────────────────────────────────────────────────────────────

function LetterCell({
    letter, result, locked, cursor, colorblind = false,
}: {
    letter:     string;
    result?:    MotusLetterResult | null;
    locked?:    boolean;
    cursor?:    boolean;
    colorblind?: boolean;
}) {
    const c = motusColors(colorblind);
    let bg: string;
    if (locked) {
        bg = c.correctLock;
    } else if (result === "correct") {
        bg = c.correct;
    } else if (result === "misplaced") {
        bg = c.misplaced;
    } else if (result === "absent") {
        bg = "bg-gray-700 border-gray-600 text-gray-400";
    } else if (letter) {
        bg = "bg-gray-700 border-gray-400 text-white";
    } else if (cursor) {
        bg = "bg-gray-800 border-indigo-400 text-transparent";
    } else {
        bg = "bg-gray-800 border-gray-700 text-transparent";
    }

    return (
        <div
            className={`flex-1 aspect-square flex items-center justify-center rounded-md font-bold uppercase border-2 select-none transition-colors duration-100 ${bg} ${cursor ? "animate-pulse" : ""}`}
            style={{ fontSize: "clamp(0.9rem, 4vw, 1.8rem)" }}
        >
            {letter}
        </div>
    );
}

// ── MotusGrid ─────────────────────────────────────────────────────────────────

function MotusGrid({
    guesses, wordLength, firstLetter, maxAttempts, typedInput, isActive, shake, playerInfo, colorblind,
}: {
    guesses:      MotusGuess[];
    wordLength:   number;
    firstLetter:  string;
    maxAttempts:  number;
    typedInput:   string;
    isActive:     boolean;
    shake:        boolean;
    playerInfo?:  Record<string, { username: string; gravatarUrl: string }>;
    colorblind?:  boolean;
}) {
    const rows       = maxAttempts > 0 ? maxAttempts : Math.max(guesses.length + 1, 6);
    const currentRow = guesses.length;
    const showAvatars = !!playerInfo;

    return (
        <div className="w-full flex flex-col gap-1" style={{ maxWidth: `min(100%, ${wordLength * 4.25 + (showAvatars ? 2.25 : 0)}rem)` }}>
            {Array.from({ length: rows }, (_, rowIdx) => {
                const guess        = guesses[rowIdx] ?? null;
                const isCurrentRow = rowIdx === currentRow && isActive;
                const isShaking    = isCurrentRow && shake;
                const info         = guess?.guesserId ? playerInfo?.[guess.guesserId] : undefined;

                return (
                    <div key={rowIdx} className="flex items-center gap-2">
                        {showAvatars && (
                            <div className="w-7 h-7 shrink-0">
                                {info && (
                                    <Avatar
                                        username={info.username}
                                        gravatarUrl={info.gravatarUrl || null}
                                        size="sm"
                                    />
                                )}
                            </div>
                        )}
                        <div className={`flex flex-auto gap-1 ${isShaking ? "animate-shake" : ""}`}>
                            {Array.from({ length: wordLength }, (_, colIdx) => {
                                if (guess) {
                                    return (
                                        <LetterCell
                                            key={colIdx}
                                            letter={guess.word[colIdx] ?? ""}
                                            result={guess.result[colIdx] ?? null}
                                            colorblind={colorblind}
                                        />
                                    );
                                }
                                if (colIdx === 0) {
                                    return <LetterCell key={colIdx} letter={firstLetter} locked colorblind={colorblind} />;
                                }
                                if (!isCurrentRow) {
                                    return <LetterCell key={colIdx} letter="" />;
                                }
                                const typedIdx = colIdx - 1;
                                const letter   = typedInput[typedIdx] ?? "";
                                const isCursor = typedIdx === typedInput.length && typedInput.length < wordLength - 1;
                                return <LetterCell key={colIdx} letter={letter} cursor={isCursor} />;
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}


// ── AZERTY keyboard ───────────────────────────────────────────────────────────

function AzertyKeyboard({ letterStates, onKey, onBackspace, onEnter, disabled, colorblind = false }: {
    letterStates: Record<string, MotusLetterResult>;
    onKey:        (letter: string) => void;
    onBackspace:  () => void;
    onEnter:      () => void;
    disabled:     boolean;
    colorblind?:  boolean;
}) {
    const c = motusColors(colorblind);
    function keyStyle(letter: string): string {
        const s = letterStates[letter];
        if (s === "correct")   return c.correct;
        if (s === "misplaced") return c.misplaced;
        if (s === "absent")    return "bg-gray-900 border-gray-800 text-gray-600";
        return "bg-gray-700 border-gray-500 text-white hover:bg-gray-600 active:bg-gray-500";
    }

    const keyFont: React.CSSProperties = { fontSize: "clamp(0.8rem, 2.8vw, 1.1rem)" };

    return (
        <div
            className={`w-full flex flex-col gap-1 select-none ${disabled ? "opacity-65 pointer-events-none" : ""}`}
            style={{ maxWidth: "min(100%, 38rem)" }}
        >
            {AZERTY_ROWS.map((row, ri) => (
                <div key={ri} className="flex gap-1">

                    {ri === 2 && (
                        <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={onEnter}
                            style={{ flex: "1.6", ...keyFont }}
                            className="h-14 rounded font-bold bg-indigo-700 border border-indigo-500 text-white hover:bg-indigo-600 active:bg-indigo-500 transition-colors"
                        >
                            ↵
                        </button>
                    )}

                    {row.map((letter) => (
                        <button
                            key={letter}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onKey(letter)}
                            style={{ flex: "1", ...keyFont }}
                            className={`min-w-0 h-14 rounded font-bold uppercase border transition-colors ${keyStyle(letter)}`}
                        >
                            {letter.toUpperCase()}
                        </button>
                    ))}

                    {ri === 2 && (
                        <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={onBackspace}
                            style={{ flex: "1.6", ...keyFont }}
                            className="h-14 rounded font-bold bg-gray-700 border border-gray-600 text-gray-200 hover:bg-gray-600 active:bg-gray-500 transition-colors"
                        >
                            ←
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
    room:         Room<LobbyState>;
    sessionId:    string;
    gameState:    MotusGameState;
    players:      LobbyPlayer[];
    chatMessages: ChatMsg[];
}

export default function MotusGame({ room, sessionId, gameState, players, chatMessages }: Props) {
    const {
        phase, mode, wordLength, firstLetter, secretWord, maxAttempts,
        roundDeadline, players: gsPlayers, sharedGuesses,
        currentTurnId, playerNames, currentRound, maxRounds,
        roundPoints, roundWinnerIds, roundStartedAt,
    } = gameState;

    const myState      = gsPlayers[sessionId];
    const isMyTurn     = mode === "coop" ? sessionId === currentTurnId : true;
    const colorblind   = getStoredPlayer()?.player.colorblindMode ?? false;
    const colors       = motusColors(colorblind);

    // VS: own guesses arrive via private message (words never in shared state)
    const [myPrivateGuesses, setMyPrivateGuesses] = useState<MotusGuess[]>([]);
    const myGuesses = mode === "coop" ? sharedGuesses : myPrivateGuesses;
    const isSolved     = myState?.solved ?? false;
    const isEliminated = myState?.eliminated ?? false;

    const canGuess =
        phase === "playing" &&
        !isEliminated &&
        isMyTurn &&
        !isSolved &&
        (maxAttempts === 0 || myGuesses.length < maxAttempts);

    const [typedInput, setTypedInput] = useState("");
    const [invalidMsg, setInvalidMsg] = useState<string | null>(null);
    const [shake,      setShake]      = useState(false);
    const containerRef                = useRef<HTMLDivElement>(null);

    // Reset typed input whenever a guess is accepted (myGuesses grows)
    const prevGuessCount = useRef(myGuesses.length);
    useEffect(() => {
        if (myGuesses.length !== prevGuessCount.current) {
            setTypedInput("");
            prevGuessCount.current = myGuesses.length;
        }
    }, [myGuesses.length]);

    // Also reset + refocus when it becomes our turn (coop) or new round starts
    useEffect(() => {
        if (canGuess) {
            setTypedInput("");
            containerRef.current?.focus();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canGuess, currentTurnId, myGuesses.length === 0]);

    // Notifications (coop only — in VS it's always your turn)
    const { notify, alreadyAsked, requestAndEnable, permission, supported: notifSupported } = useNotifications();
    const [showNotifBanner, setShowNotifBanner] = useState(false);
    const prevTurnIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (mode === "coop" && phase === "playing" && !alreadyAsked && notifSupported && permission !== 'denied') {
            setShowNotifBanner(true);
        }
    }, [phase]);

    useEffect(() => {
        if (mode === "coop" && prevTurnIdRef.current !== null && prevTurnIdRef.current !== currentTurnId && isMyTurn) {
            notify("Motus — c'est ton tour !");
        }
        prevTurnIdRef.current = currentTurnId;
    }, [currentTurnId, isMyTurn, mode, notify]);

    // Round countdown
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    useEffect(() => {
        if (!roundDeadline) { setTimeLeft(null); return; }
        const tick = () => setTimeLeft(Math.max(0, Math.ceil((roundDeadline - Date.now()) / 1000)));
        tick();
        const id = setInterval(tick, 500);
        return () => clearInterval(id);
    }, [roundDeadline]);

    // Coop: live typing visible to other players
    const [opponentInput, setOpponentInput] = useState("");

    useEffect(() => { setOpponentInput(""); }, [currentTurnId, sharedGuesses.length]);

    useEffect(() => {
        if (mode === "coop" && canGuess) {
            room.send("motus:typing", { input: typedInput });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [typedInput]);

    useEffect(() => {
        room.onMessage("motus:myGuesses", (guesses: MotusGuess[]) => {
            setMyPrivateGuesses(guesses);
        });
        room.onMessage("motus:typing", ({ input }: { input: string }) => {
            setOpponentInput(input);
        });
        // Request private guesses in case we reconnected mid-game
        if (mode === "vs" && phase === "playing") {
            room.send("motus:requestGuesses");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room]);

    useEffect(() => {
        setMyPrivateGuesses([]);
    }, [currentRound]);

    useEffect(() => {
        const handler = () => {
            setInvalidMsg("Mot inconnu");
            setShake(true);
            setTimeout(() => { setInvalidMsg(null); setShake(false); }, 1200);
        };
        room.onMessage("motus:invalid", handler);
    }, [room]);

    // ── Input actions ──────────────────────────────────────────────────────
    function addLetter(char: string) {
        if (!canGuess) return;
        setTypedInput((v) => v.length < wordLength - 1 ? v + char : v);
    }

    function removeLetter() {
        if (!canGuess) return;
        setTypedInput((v) => v.slice(0, -1));
    }

    function submitGuess() {
        if (!canGuess) return;
        if (typedInput.length < wordLength - 1) return;
        room.send("motus:guess", { word: firstLetter + typedInput });
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (!canGuess) return;
        if (e.key === "Backspace") { e.preventDefault(); removeLetter(); return; }
        if (e.key === "Enter")     { e.preventDefault(); submitGuess();  return; }
        const char = e.key.toLowerCase();
        if (/^[a-z]$/.test(char)) addLetter(char);
    }

    // ── Derived data ───────────────────────────────────────────────────────
    const letterStates   = computeLetterStates(myGuesses);
    const participantIds = gameState.playerOrder ?? Object.keys(playerNames ?? {});
    const isMyCoopTurn   = mode === "coop" && sessionId === currentTurnId;
    const currentTurnName = playerNames[currentTurnId] ?? "";

    // ── GenericGameState ───────────────────────────────────────────────────
    const genericState: GenericGameState = {
        phase,
        playerOrder:    participantIds,
        playerNames,
        roundPoints,
        roundWinnerIds: roundWinnerIds ?? [],
        currentRound,
        maxRounds,
        activePlayerIds: mode === "coop"
            ? [currentTurnId]
            : participantIds.filter(id => !(gsPlayers[id]?.eliminated ?? false) && !(gsPlayers[id]?.solved ?? false)),
        playerData: Object.fromEntries(
            participantIds.map(id => [id, {
                roundScore:     mode === "vs" ? (gsPlayers[id]?.guesses.length ?? 0) : undefined,
                roundScoreUnit: mode === "vs" ? "essais" : undefined,
            }])
        ),
        roundWinnerSubtitle: (roundWinnerIds ?? []).length === 1 ? "a trouvé !" : undefined,
        preserveOrder: mode === "coop",
    };

    // ── Scoreboard footer (VS guess dots + coop vote skip turn) ───────────────
    const scoreboardFooter = (openConfirm: (label: string, action: () => void) => void) => (
        <>
            {mode === "vs" && phase === "playing" && (
                <div className="mt-3 border-t border-gray-800 pt-3 flex flex-col gap-2">
                    {participantIds.map(id => {
                        const ps = gsPlayers[id];
                        if (!ps || ps.eliminated) return null;
                        const guessCount = ps.guesses.length;
                        const lastGuess  = ps.guesses[guessCount - 1] ?? null;
                        const solved     = ps.solved;
                        const elapsedSec = solved && roundStartedAt && ps.solvedAt
                            ? Math.round((ps.solvedAt - roundStartedAt) / 1000)
                            : null;
                        return (
                            <div key={id} className="flex flex-col gap-0.5">
                                <span className="text-xs text-gray-500">
                                    <span className="text-gray-400">{playerNames[id] ?? id}</span>
                                    {" — "}
                                    {guessCount > 0
                                        ? `${guessCount} essai${guessCount > 1 ? "s" : ""}${elapsedSec !== null ? ` · ${elapsedSec}s` : ""}`
                                        : "Aucune tentative"}
                                    {solved && <span className="text-green-400 ml-1">✓</span>}
                                </span>
                                {lastGuess && (
                                    <div className="flex gap-0.5">
                                        {lastGuess.result.map((r, i) => (
                                            <div key={i} className={`w-3 h-3 rounded-sm shrink-0 ${
                                                r === "correct"   ? colors.correctDot :
                                                r === "misplaced" ? colors.misplacedDot :
                                                "bg-gray-600"
                                            }`} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {mode === "coop" && phase === "playing" && gameState.currentTurnId && gameState.currentTurnId !== sessionId && (
                <div className="mt-3 border-t border-gray-800 pt-3">
                    <button
                        onClick={() => openConfirm(
                            `Voter pour passer le tour de ${playerNames[gameState.currentTurnId] ?? "ce joueur"} ?`,
                            () => room.send("vote:initiate", { type: "skip_turn", targetPlayerId: gameState.currentTurnId })
                        )}
                        className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-sky-400 border border-gray-800 hover:border-sky-900/60 rounded-lg py-1.5 transition-colors"
                    >
                        Voter pour passer le tour
                    </button>
                </div>
            )}
        </>
    );

    // ── Overlay top content (secret word reveal) ───────────────────────────
    const overlayTopContent = secretWord ? (
        <p className="text-2xl font-bold tracking-widest text-white mb-3">
            {secretWord.toUpperCase()}
        </p>
    ) : null;

    // ── Header ─────────────────────────────────────────────────────────────
    return (
        <>
        {showNotifBanner && (
            <NotificationBanner
                onAccept={async () => { await requestAndEnable(); setShowNotifBanner(false); }}
                onDismiss={() => { localStorage.setItem('notif-asked', 'true'); setShowNotifBanner(false); }}
            />
        )}
        <GameShell
            room={room}
            chatMessages={chatMessages}
            myUsername={playerNames[sessionId] ?? ""}
            playerAvatars={Object.fromEntries(players.map((p) => [p.username, p.gravatarUrl]))}
            genericState={genericState}
            players={players}
            sessionId={sessionId}
            gameScrollable
            canToggleSpectator
            scoreboardFooter={scoreboardFooter}
            overlayTopContent={overlayTopContent}
            header={
                <>
                    <Type className="w-5 h-5 text-gray-400" />
                    <span className="font-bold text-white">Motus</span>
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                        {mode === "coop" ? "Coop" : "VS"}
                    </span>
                    {maxRounds > 1 && (
                        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                            Manche {currentRound}/{maxRounds}
                        </span>
                    )}
                    <span className="text-gray-600 text-sm">|</span>
                    {phase === "playing" && (
                        <span className="text-sm text-gray-400 flex items-center gap-2">
                            {mode === "coop" ? (
                                isMyCoopTurn
                                    ? <span className="text-indigo-400 font-semibold">Votre tour</span>
                                    : <span>Tour de <span className="text-white font-medium">{currentTurnName}</span></span>
                            ) : (
                                isSolved
                                    ? <span className="text-green-400 font-semibold">Trouvé !</span>
                                    : isEliminated
                                    ? <span className="text-gray-500">Éliminé</span>
                                    : <span className="text-white font-medium">{wordLength} lettres</span>
                            )}
                            {timeLeft !== null && (
                                <span className={`font-mono font-bold text-sm ${timeLeft <= 10 ? "text-red-400" : "text-gray-400"}`}>
                                    {timeLeft}s
                                </span>
                            )}
                        </span>
                    )}
                </>
            }
        >
            {/* Focusable container — captures physical keyboard events */}
            <div
                ref={containerRef}
                tabIndex={canGuess ? 0 : -1}
                onKeyDown={handleKeyDown}
                className="h-full w-full flex flex-col justify-between items-center outline-none"
            >
                {/* Main grid */}
                <MotusGrid
                    guesses={myGuesses}
                    wordLength={wordLength}
                    firstLetter={firstLetter}
                    maxAttempts={maxAttempts}
                    typedInput={canGuess ? typedInput : opponentInput}
                    isActive={canGuess || (mode === "coop" && phase === "playing" && !isSolved && !isEliminated)}
                    shake={shake}
                    playerInfo={mode === "coop" ? gameState.playerAvatars : undefined}
                    colorblind={colorblind}
                />

                {/* Error message */}
                <div className="h-5">
                    {invalidMsg && (
                        <p className="text-red-400 text-sm font-semibold text-center">{invalidMsg}</p>
                    )}
                </div>

                {/* Coop: waiting indicator */}
                {mode === "coop" && phase === "playing" && !isMyCoopTurn && !isSolved && (
                    <p className="text-gray-400 text-sm">
                        En attente de <span className="text-white font-medium">{currentTurnName}</span>…
                    </p>
                )}

                {/* AZERTY keyboard */}
                {phase === "playing" && !isSolved && !isEliminated && (
                    <AzertyKeyboard
                        letterStates={letterStates}
                        onKey={addLetter}
                        onBackspace={removeLetter}
                        onEnter={submitGuess}
                        disabled={!canGuess}
                        colorblind={colorblind}
                    />
                )}

                {/* Solved */}
                {isSolved && phase === "playing" && (
                    <p className="text-green-400 font-semibold text-lg">Bravo, vous avez trouvé !</p>
                )}

                {/* Secret word revealed mid-round (if server sends it) */}
                {secretWord && phase === "playing" && (
                    <p className="text-gray-300 text-xl font-bold tracking-widest">
                        {secretWord.toUpperCase()}
                    </p>
                )}
            </div>
        </GameShell>
        </>
    );
}
