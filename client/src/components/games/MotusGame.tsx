import { useState, useEffect, useRef } from "react";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState, MotusGameState, MotusGuess, MotusLetterResult } from "../../models/Lobby";
import type { ChatMsg } from "../../models/Lobby";
import GameShell from "./GameShell";

interface Props {
    room: Room<LobbyState>;
    sessionId: string;
    gameState: MotusGameState;
    players: LobbyPlayer[];
    chatMessages: ChatMsg[];
}

// ── Letter cell ──────────────────────────────────────────────────────────────

function LetterCell({ letter, result, isFirst }: { letter: string; result: MotusLetterResult | null; isFirst: boolean }) {
    const base = "w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded font-bold text-sm sm:text-base uppercase border select-none";

    let bg: string;
    if (isFirst && !letter) {
        bg = "bg-red-700/40 border-red-600 text-red-300";
    } else if (!letter) {
        bg = "bg-gray-800 border-gray-700 text-transparent";
    } else if (!result) {
        bg = "bg-gray-700 border-gray-500 text-white";
    } else if (result === "correct") {
        bg = "bg-red-600 border-red-500 text-white";
    } else if (result === "misplaced") {
        bg = "bg-amber-500 border-amber-400 text-white";
    } else {
        bg = "bg-gray-700 border-gray-600 text-gray-400";
    }

    return (
        <div className={`${base} ${bg}`}>
            {letter || (isFirst ? "?" : "")}
        </div>
    );
}

// ── One guess row ────────────────────────────────────────────────────────────

function GuessRow({ guess, wordLength, firstLetter }: { guess: MotusGuess | null; wordLength: number; firstLetter: string }) {
    const letters = Array.from({ length: wordLength }, (_, i) => guess?.word[i] ?? "");
    const results: (MotusLetterResult | null)[] = Array.from({ length: wordLength }, (_, i) => guess?.result[i] ?? null);

    return (
        <div className="flex gap-1">
            {letters.map((letter, i) => (
                <LetterCell
                    key={i}
                    letter={i === 0 && !guess ? firstLetter : letter}
                    result={results[i]}
                    isFirst={i === 0 && !guess}
                />
            ))}
        </div>
    );
}

// ── Grid (full grid with empty rows) ────────────────────────────────────────

function MotusGrid({
    guesses,
    wordLength,
    firstLetter,
    maxAttempts,
    currentInput,
    isActive,
}: {
    guesses: MotusGuess[];
    wordLength: number;
    firstLetter: string;
    maxAttempts: number;
    currentInput?: string;
    isActive?: boolean;
}) {
    const rows = maxAttempts > 0 ? maxAttempts : Math.max(guesses.length + 1, 6);

    return (
        <div className="flex flex-col gap-1">
            {Array.from({ length: rows }, (_, i) => {
                const pastGuess = guesses[i] ?? null;
                // current input row
                if (!pastGuess && i === guesses.length && isActive && currentInput !== undefined) {
                    const padded = currentInput.padEnd(wordLength, "");
                    // show partial input without results
                    return (
                        <div key={i} className="flex gap-1">
                            {Array.from({ length: wordLength }, (_, j) => (
                                <LetterCell
                                    key={j}
                                    letter={j === 0 && !padded[j] ? firstLetter : (padded[j] ?? "")}
                                    result={null}
                                    isFirst={j === 0 && !padded[j]}
                                />
                            ))}
                        </div>
                    );
                }
                // empty rows beyond
                if (!pastGuess) {
                    return <GuessRow key={i} guess={null} wordLength={wordLength} firstLetter={firstLetter} />;
                }
                return <GuessRow key={i} guess={pastGuess} wordLength={wordLength} firstLetter={firstLetter} />;
            })}
        </div>
    );
}

// ── Mini grid for other VS players ──────────────────────────────────────────

function MiniGrid({ guesses, wordLength, name, isSolved }: {
    guesses: MotusGuess[];
    wordLength: number;
    firstLetter?: string;
    name: string;
    isSolved: boolean;
}) {
    return (
        <div className="flex flex-col gap-1">
            <p className={`text-xs font-semibold mb-0.5 truncate ${isSolved ? "text-emerald-400" : "text-gray-400"}`}>
                {name} {isSolved ? "✓" : ""}
            </p>
            {guesses.slice(0, 3).map((g, i) => (
                <div key={i} className="flex gap-0.5">
                    {Array.from({ length: wordLength }, (_, j) => {
                        const r = g.result[j] ?? "absent";
                        const l = g.word[j] ?? "";
                        const bg =
                            r === "correct" ? "bg-red-600" :
                            r === "misplaced" ? "bg-amber-500" :
                            "bg-gray-700";
                        return (
                            <div key={j} className={`w-4 h-4 rounded-sm text-[8px] flex items-center justify-center font-bold uppercase text-white ${bg}`}>
                                {l}
                            </div>
                        );
                    })}
                </div>
            ))}
            {guesses.length > 3 && (
                <p className="text-[10px] text-gray-600">+{guesses.length - 3} essais</p>
            )}
            {guesses.length === 0 && <p className="text-[10px] text-gray-600">Aucun essai</p>}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MotusGame({ room, sessionId, gameState, players, chatMessages }: Props) {
    const {
        phase, mode, wordLength, firstLetter, secretWord, maxAttempts,
        roundDeadline, players: gsPlayers, playerOrder, sharedGuesses,
        currentTurnId, playerNames, currentRound, maxRounds,
        roundPoints, roundWinnerIds,
    } = gameState;

    const isHost = players.find((p) => p.id === sessionId)?.isHost ?? false;
    const myState = gsPlayers[sessionId];
    const myGuesses = mode === "coop" ? sharedGuesses : (myState?.guesses ?? []);
    const isMyTurn = mode === "coop" ? sessionId === currentTurnId : true;
    const isSolved = myState?.solved ?? false;
    const isEliminated = myState?.eliminated ?? false;

    const canGuess =
        phase === "playing" &&
        !isEliminated &&
        isMyTurn &&
        !isSolved &&
        (maxAttempts === 0 || myGuesses.length < maxAttempts);

    const [inputValue, setInputValue] = useState("");
    const [invalidMsg, setInvalidMsg] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Round countdown
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    useEffect(() => {
        if (!roundDeadline) { setTimeLeft(null); return; }
        const tick = () => setTimeLeft(Math.max(0, Math.ceil((roundDeadline - Date.now()) / 1000)));
        tick();
        const id = setInterval(tick, 500);
        return () => clearInterval(id);
    }, [roundDeadline]);

    // Listen for invalid word
    useEffect(() => {
        const handler = (_: unknown) => {
            setInvalidMsg("Mot inconnu");
            setTimeout(() => setInvalidMsg(null), 2000);
        };
        room.onMessage("motus:invalid", handler);
        // Colyseus SDK does not return an unsubscribe — we rely on component unmount
    }, [room]);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canGuess) return;
        const word = inputValue.trim().toLowerCase();
        if (word.length !== wordLength) return;
        if (word[0] !== firstLetter) {
            setInvalidMsg(`Le mot doit commencer par "${firstLetter.toUpperCase()}"`);
            setTimeout(() => setInvalidMsg(null), 2000);
            return;
        }
        room.send("motus:guess", { word });
        setInputValue("");
    }

    const participantIds = Object.keys(playerNames ?? {});
    const rankedByPoints = [...participantIds].sort(
        (a, b) => (roundPoints[b] ?? 0) - (roundPoints[a] ?? 0)
    );

    const playerById = new Map(players.map((p) => [p.id, p]));

    const roundWinnerNames = (roundWinnerIds ?? [])
        .map((id) => playerNames[id] ?? id)
        .join(", ");

    // ── Scoreboard ────────────────────────────────────────────────────────
    const scoreboard = (
        <>
            <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">
                {maxRounds > 1 ? "Points" : "Joueurs"}
            </p>
            <ul className="flex flex-col gap-2">
                {rankedByPoints.map((id) => {
                    const name = playerNames[id] ?? id;
                    const p = playerById.get(id);
                    const isElim = gsPlayers[id]?.eliminated ?? p?.isEliminated ?? false;
                    const isConnected = p?.isConnected ?? true;
                    const isMe = id === sessionId;
                    const solved = gsPlayers[id]?.solved ?? false;
                    const pts = roundPoints[id] ?? 0;
                    const isCurrentTurn = mode === "coop" && id === currentTurnId;

                    return (
                        <li key={id} className={`flex items-center justify-between gap-1 text-sm ${isElim ? "text-gray-600" : isCurrentTurn ? "text-indigo-300" : "text-gray-300"}`}>
                            <span className={`truncate flex items-center gap-1 ${isElim ? "line-through" : ""}`}>
                                {isCurrentTurn && <span className="text-indigo-400">▶</span>}
                                {solved && !isElim && <span className="text-emerald-400">✓</span>}
                                {!isConnected && !isElim && <span title="Reconnexion…">🔴</span>}
                                {name}
                                {isMe && <span className="text-gray-600 text-xs">(vous)</span>}
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

    // ── End-of-round content ──────────────────────────────────────────────
    const pointsStandings = (
        <ul className="flex flex-col gap-1 mb-4 text-left">
            {rankedByPoints.map((id) => {
                const pts = roundPoints[id] ?? 0;
                const isMe = id === sessionId;
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
            <p className="text-2xl mb-1">
                {secretWord ? secretWord.toUpperCase() : ""}
            </p>
            {roundWinnerNames ? (
                <p className="text-indigo-300 font-semibold mb-3">
                    {(roundWinnerIds ?? []).length === 1 ? `${roundWinnerNames} a trouvé !` : `Ex-aequo : ${roundWinnerNames}`}
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
                    const pts = roundPoints[id] ?? 0;
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

    // ── Header ────────────────────────────────────────────────────────────
    const currentTurnName = playerNames[currentTurnId] ?? "";
    const isMyCoopTurn = mode === "coop" && sessionId === currentTurnId;

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
                            ? <span className="text-emerald-400 font-semibold">Trouvé !</span>
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

    // ── Main game area ────────────────────────────────────────────────────

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
            <div className="w-full max-w-2xl flex flex-col gap-6 items-center">

                {/* VS: other players' mini-grids */}
                {mode === "vs" && playerOrder.length > 1 && (
                    <div className="w-full flex flex-wrap gap-4 justify-center">
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
                                        firstLetter={firstLetter}
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
                    currentInput={canGuess ? inputValue : undefined}
                    isActive={canGuess}
                />

                {/* Coop: turn indicator */}
                {mode === "coop" && phase === "playing" && !isMyCoopTurn && (
                    <p className="text-gray-400 text-sm">
                        En attente de <span className="text-white font-medium">{currentTurnName}</span>…
                    </p>
                )}

                {/* Input */}
                {canGuess && (
                    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-2 w-full max-w-xs">
                        <div className="flex gap-2 w-full">
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={(e) => {
                                    const v = e.target.value.toLowerCase().replace(/[^a-z]/g, "");
                                    if (v.length <= wordLength) setInputValue(v);
                                }}
                                placeholder={`${firstLetter.toUpperCase()}${"_".repeat(wordLength - 1)}`}
                                maxLength={wordLength}
                                autoFocus
                                className="flex-1 bg-gray-800 border border-gray-600 text-white text-center font-mono text-lg uppercase rounded-lg px-3 py-2 tracking-widest focus:outline-none focus:border-indigo-500"
                            />
                            <button
                                type="submit"
                                disabled={inputValue.length !== wordLength}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                            >
                                OK
                            </button>
                        </div>
                        {invalidMsg && (
                            <p className="text-red-400 text-sm animate-pulse">{invalidMsg}</p>
                        )}
                        <p className="text-xs text-gray-600">
                            {inputValue.length}/{wordLength} lettres · commence par {firstLetter.toUpperCase()}
                        </p>
                    </form>
                )}

                {/* Solved message */}
                {isSolved && phase === "playing" && mode === "vs" && (
                    <p className="text-emerald-400 font-semibold">Bravo, vous avez trouvé !</p>
                )}

                {/* Secret word revealed (playing phase, after solve) */}
                {secretWord && phase === "playing" && (
                    <p className="text-gray-300 text-lg font-bold tracking-widest">
                        {secretWord.toUpperCase()}
                    </p>
                )}
            </div>
        </GameShell>
    );
}
