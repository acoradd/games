import { useState, useEffect, useRef } from "react";
import type { Room } from "@colyseus/sdk";
import type {
    LobbyPlayer, LobbyState,
    MotusGameState, MotusGuess, MotusLetterResult,
    ChatMsg,
} from "../../models/Lobby";
import GameShell from "./GameShell";

// ── AZERTY layout ─────────────────────────────────────────────────────────────

const AZERTY_ROWS = [
    ["a","z","e","r","t","y","u","i","o","p"],
    ["q","s","d","f","g","h","j","k","l","m"],
    ["w","x","c","v","b","n"],
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

const RESULT_PRIORITY: Record<MotusLetterResult, number> = { correct: 3, misplaced: 2, absent: 1 };

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

/** Tailwind classes for cell size, responsive to word length. */
function cellSizeClass(wordLength: number): string {
    if (wordLength <= 6)  return "w-14 h-14 text-xl";
    if (wordLength <= 8)  return "w-12 h-12 text-lg";
    if (wordLength <= 10) return "w-11 h-11 text-base";
    return "w-9 h-9 text-sm";
}

// ── LetterCell ────────────────────────────────────────────────────────────────

function LetterCell({
    letter, result, locked, cursor, sizeClass,
}: {
    letter:    string;
    result?:   MotusLetterResult | null;
    locked?:   boolean;   // first letter of empty / active row
    cursor?:   boolean;   // next position to type
    sizeClass: string;
}) {
    let style: string;
    if (locked) {
        style = "bg-green-700 border-green-500 text-white";
    } else if (result === "correct") {
        style = "bg-green-600 border-green-500 text-white";
    } else if (result === "misplaced") {
        style = "bg-amber-500 border-amber-400 text-white";
    } else if (result === "absent") {
        style = "bg-gray-700 border-gray-600 text-gray-400";
    } else if (letter) {
        style = "bg-gray-700 border-gray-400 text-white";
    } else if (cursor) {
        style = "bg-gray-800 border-indigo-400 text-transparent";
    } else {
        style = "bg-gray-800 border-gray-700 text-transparent";
    }

    return (
        <div className={`${sizeClass} flex items-center justify-center rounded-md font-bold uppercase border-2 select-none transition-colors duration-100 ${style} ${cursor ? "animate-pulse" : ""}`}>
            {letter}
        </div>
    );
}

// ── MotusGrid ─────────────────────────────────────────────────────────────────

function MotusGrid({
    guesses, wordLength, firstLetter, maxAttempts, typedInput, isActive, shake,
}: {
    guesses:     MotusGuess[];
    wordLength:  number;
    firstLetter: string;
    maxAttempts: number;
    typedInput:  string;
    isActive:    boolean;
    shake:       boolean;
}) {
    const rows      = maxAttempts > 0 ? maxAttempts : Math.max(guesses.length + 1, 6);
    const sizeClass = cellSizeClass(wordLength);
    const currentRow = guesses.length;

    return (
        <div className="flex flex-col gap-2">
            {Array.from({ length: rows }, (_, rowIdx) => {
                const guess        = guesses[rowIdx] ?? null;
                const isCurrentRow = rowIdx === currentRow && isActive;
                const isShaking    = isCurrentRow && shake;

                return (
                    <div key={rowIdx} className={`flex gap-1.5 ${isShaking ? "animate-shake" : ""}`}>
                        {Array.from({ length: wordLength }, (_, colIdx) => {
                            // ── past guess row ──
                            if (guess) {
                                return (
                                    <LetterCell
                                        key={colIdx}
                                        letter={guess.word[colIdx] ?? ""}
                                        result={guess.result[colIdx] ?? null}
                                        sizeClass={sizeClass}
                                    />
                                );
                            }

                            // ── col 0: always show first letter as locked ──
                            if (colIdx === 0) {
                                return (
                                    <LetterCell
                                        key={colIdx}
                                        letter={firstLetter}
                                        locked
                                        sizeClass={sizeClass}
                                    />
                                );
                            }

                            // ── future empty row ──
                            if (!isCurrentRow) {
                                return <LetterCell key={colIdx} letter="" sizeClass={sizeClass} />;
                            }

                            // ── active row: show typed letters + cursor ──
                            const typedIdx = colIdx - 1;
                            const letter   = typedInput[typedIdx] ?? "";
                            const isCursor = typedIdx === typedInput.length && typedInput.length < wordLength - 1;

                            return (
                                <LetterCell
                                    key={colIdx}
                                    letter={letter}
                                    cursor={isCursor}
                                    sizeClass={sizeClass}
                                />
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}

// ── MiniGrid (VS — colors only, letters hidden) ───────────────────────────────

function MiniGrid({ guesses, wordLength, name, isSolved }: {
    guesses:    MotusGuess[];
    wordLength: number;
    name:       string;
    isSolved:   boolean;
}) {
    return (
        <div className="flex flex-col gap-1 min-w-0">
            <p className={`text-xs font-semibold mb-0.5 truncate max-w-[8rem] ${isSolved ? "text-green-400" : "text-gray-400"}`}>
                {name}{isSolved ? " ✓" : guesses.length > 0 ? ` · ${guesses.length} essai${guesses.length > 1 ? "s" : ""}` : ""}
            </p>
            {guesses.map((g, i) => (
                <div key={i} className="flex gap-0.5">
                    {Array.from({ length: wordLength }, (_, j) => {
                        const r = g.result[j] ?? "absent";
                        return (
                            <div key={j} className={`w-4 h-4 rounded-sm ${
                                r === "correct"   ? "bg-green-600" :
                                r === "misplaced" ? "bg-amber-500" :
                                "bg-gray-600"
                            }`} />
                        );
                    })}
                </div>
            ))}
            {guesses.length === 0 && <p className="text-[10px] text-gray-600">En cours…</p>}
        </div>
    );
}

// ── AZERTY keyboard ───────────────────────────────────────────────────────────

function AzertyKeyboard({ letterStates, onKey, onBackspace, onEnter, disabled }: {
    letterStates: Record<string, MotusLetterResult>;
    onKey:        (letter: string) => void;
    onBackspace:  () => void;
    onEnter:      () => void;
    disabled:     boolean;
}) {
    function keyStyle(letter: string): string {
        const s = letterStates[letter];
        if (s === "correct")   return "bg-green-600 border-green-500 text-white";
        if (s === "misplaced") return "bg-amber-500 border-amber-400 text-white";
        if (s === "absent")    return "bg-gray-600 border-gray-500 text-gray-400";
        return "bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600 active:bg-gray-500";
    }

    return (
        <div className={`flex flex-col gap-1.5 items-center select-none ${disabled ? "opacity-30 pointer-events-none" : ""}`}>
            {AZERTY_ROWS.map((row, ri) => (
                <div key={ri} className="flex gap-1 items-center">

                    {ri === 2 && (
                        <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={onEnter}
                            className="h-10 px-3 rounded font-bold text-sm bg-indigo-700 border border-indigo-500 text-white hover:bg-indigo-600 active:bg-indigo-500 transition-colors"
                        >
                            ↵
                        </button>
                    )}

                    {row.map((letter) => (
                        <button
                            key={letter}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onKey(letter)}
                            className={`w-9 h-10 rounded font-bold uppercase text-sm border transition-colors ${keyStyle(letter)}`}
                        >
                            {letter.toUpperCase()}
                        </button>
                    ))}

                    {ri === 2 && (
                        <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={onBackspace}
                            className="h-10 px-3 rounded font-bold text-sm bg-gray-700 border border-gray-600 text-gray-200 hover:bg-gray-600 active:bg-gray-500 transition-colors"
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
        roundDeadline, players: gsPlayers, playerOrder, sharedGuesses,
        currentTurnId, playerNames, currentRound, maxRounds,
        roundPoints, roundWinnerIds,
    } = gameState;

    const isHost   = players.find((p) => p.id === sessionId)?.isHost ?? false;
    const myState  = gsPlayers[sessionId];
    const isMyTurn = mode === "coop" ? sessionId === currentTurnId : true;

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

    // typedInput = letters for positions 1+ (position 0 is always firstLetter)
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

    // Reset opponent input when turn changes or a guess lands
    useEffect(() => { setOpponentInput(""); }, [currentTurnId, sharedGuesses.length]);

    // Send our own typing to others in coop
    useEffect(() => {
        if (mode === "coop" && canGuess) {
            room.send("motus:typing", { input: typedInput });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [typedInput]);

    // VS: receive own full guess history (words hidden in shared state)
    useEffect(() => {
        room.onMessage("motus:myGuesses", (guesses: MotusGuess[]) => {
            setMyPrivateGuesses(guesses);
        });
        room.onMessage("motus:typing", ({ input }: { input: string }) => {
            setOpponentInput(input);
        });
    }, [room]);

    // Reset private guesses on new round (currentRound changes)
    useEffect(() => {
        setMyPrivateGuesses([]);
    }, [currentRound]);

    // Listen for invalid word from server
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
    const participantIds = Object.keys(playerNames ?? {});
    const rankedByPoints = [...participantIds].sort(
        (a, b) => (roundPoints[b] ?? 0) - (roundPoints[a] ?? 0)
    );
    const playerById         = new Map(players.map((p) => [p.id, p]));
    const isMyCoopTurn       = mode === "coop" && sessionId === currentTurnId;
    const currentTurnName    = playerNames[currentTurnId] ?? "";
    const roundWinnerNames   = (roundWinnerIds ?? []).map((id) => playerNames[id] ?? id).join(", ");

    // ── Scoreboard ─────────────────────────────────────────────────────────
    const scoreboard = (
        <>
            <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">
                {maxRounds > 1 ? "Points" : "Joueurs"}
            </p>
            <ul className="flex flex-col gap-2">
                {rankedByPoints.map((id) => {
                    const p            = playerById.get(id);
                    const isElim       = gsPlayers[id]?.eliminated ?? p?.isEliminated ?? false;
                    const isConnected  = p?.isConnected ?? true;
                    const isMe         = id === sessionId;
                    const solved       = gsPlayers[id]?.solved ?? false;
                    const pts          = roundPoints[id] ?? 0;
                    const isCoopTurn   = mode === "coop" && id === currentTurnId;

                    return (
                        <li key={id} className={`flex items-center justify-between gap-1 text-sm ${
                            isElim ? "text-gray-600" : isCoopTurn ? "text-indigo-300" : "text-gray-300"
                        }`}>
                            <span className={`truncate flex items-center gap-1 ${isElim ? "line-through" : ""}`}>
                                {isCoopTurn  && <span className="text-indigo-400">▶</span>}
                                {solved && !isElim && <span className="text-green-400">✓</span>}
                                {!isConnected && !isElim && <span title="Reconnexion…">🔴</span>}
                                {playerNames[id] ?? id}
                                {isMe   && <span className="text-gray-600 text-xs">(vous)</span>}
                                {isElim && <span className="text-gray-600 text-xs ml-1">(éliminé)</span>}
                            </span>
                            {maxRounds > 1 && (
                                <span className="font-bold shrink-0 text-indigo-400">{pts}pt</span>
                            )}
                        </li>
                    );
                })}
            </ul>
        </>
    );

    // ── Round end ──────────────────────────────────────────────────────────
    const pointsStandings = (
        <ul className="flex flex-col gap-1 mb-4 text-left">
            {rankedByPoints.map((id) => {
                const pts      = roundPoints[id] ?? 0;
                const isMe     = id === sessionId;
                const isWinner = (roundWinnerIds ?? []).includes(id);
                return (
                    <li key={id} className="flex items-center justify-between text-sm">
                        <span className={isWinner ? "text-indigo-300 font-semibold" : "text-gray-300"}>
                            {playerNames[id] ?? id}
                            {isMe && <span className="text-gray-600 text-xs ml-1">(vous)</span>}
                        </span>
                        <span className="font-bold text-white">{pts} pt{pts !== 1 ? "s" : ""}</span>
                    </li>
                );
            })}
        </ul>
    );

    const roundEndContent = (
        <div className="text-center">
            {secretWord && (
                <p className="text-2xl font-bold tracking-widest text-white mb-1">
                    {secretWord.toUpperCase()}
                </p>
            )}
            {roundWinnerNames ? (
                <p className="text-indigo-300 font-semibold mb-3">
                    {(roundWinnerIds ?? []).length === 1
                        ? `${roundWinnerNames} a trouvé !`
                        : `Ex-aequo : ${roundWinnerNames}`}
                </p>
            ) : (
                <p className="text-gray-400 mb-3">Personne n'a trouvé.</p>
            )}
            {maxRounds > 1 && (
                <>
                    <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-2">Scores</p>
                    {pointsStandings}
                </>
            )}
        </div>
    );

    const endContent = (
        <div className="text-center">
            <p className="text-gray-400 mb-4">Partie terminée !</p>
            <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-2">Classement final</p>
            <ul className="flex flex-col gap-1 mb-4 text-left">
                {rankedByPoints.map((id, rank) => {
                    const pts  = roundPoints[id] ?? 0;
                    const isMe = id === sessionId;
                    return (
                        <li key={id} className="flex items-center justify-between text-sm gap-2">
                            <span className="text-gray-500 w-5 shrink-0">#{rank + 1}</span>
                            <span className="flex-1 text-gray-300">
                                {playerNames[id] ?? id}
                                {isMe && <span className="text-gray-600 text-xs ml-1">(vous)</span>}
                            </span>
                            <span className="font-bold text-white">{pts} pt{pts !== 1 ? "s" : ""}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );

    // ── Header ─────────────────────────────────────────────────────────────
    const header = (
        <>
            <span className="text-xl">🔤</span>
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
    );

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <GameShell
            room={room}
            chatMessages={chatMessages}
            myUsername={playerNames[sessionId] ?? ""}
            phase={phase}
            isHost={isHost}
            gameScrollable
            header={header}
            scoreboard={scoreboard}
            roundEndContent={roundEndContent}
            endContent={endContent}
        >
            {/* Focusable container — captures physical keyboard events */}
            <div
                ref={containerRef}
                tabIndex={canGuess ? 0 : -1}
                onKeyDown={handleKeyDown}
                className="w-full max-w-2xl flex flex-col gap-5 items-center outline-none"
            >
                {/* VS mode: other players' mini-grids (colors only, no letters) */}
                {mode === "vs" && playerOrder.filter((id) => id !== sessionId).length > 0 && (
                    <div className="w-full flex flex-wrap gap-5 justify-center">
                        {playerOrder
                            .filter((id) => id !== sessionId)
                            .map((id) => {
                                const ps = gsPlayers[id];
                                if (!ps) return null;
                                return (
                                    <MiniGrid
                                        key={id}
                                        guesses={ps.guesses}
                                        wordLength={wordLength}
                                        name={playerNames[id] ?? id}
                                        isSolved={ps.solved}
                                    />
                                );
                            })}
                    </div>
                )}

                {/* Main grid */}
                <MotusGrid
                    guesses={myGuesses}
                    wordLength={wordLength}
                    firstLetter={firstLetter}
                    maxAttempts={maxAttempts}
                    typedInput={canGuess ? typedInput : opponentInput}
                    isActive={canGuess || (mode === "coop" && phase === "playing" && !isSolved && !isEliminated)}
                    shake={shake}
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
    );
}
