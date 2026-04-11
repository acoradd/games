import { useState, useEffect, useRef } from "react";
import type { Room } from "@colyseus/sdk";
import type { LobbyPlayer, LobbyState, ChatMsg, GenericGameState } from "../../models/Lobby";
import Avatar from "../Avatar";
import { X, Send, Play, Eye, Trophy, WifiOff, Crown, LogOut, SkipForward } from "lucide-react";

interface Props {
    room: Room<LobbyState>;
    chatMessages: ChatMsg[];
    myUsername: string;
    /** username → gravatarUrl */
    playerAvatars?: Record<string, string>;
    genericState: GenericGameState;
    players: LobbyPlayer[];
    sessionId: string;
    /** Game-specific header content (name, round counter, color indicator…) */
    header: React.ReactNode;
    /** The actual game area (canvas or card grid) */
    children: React.ReactNode;
    /** true → overflow-y-auto + items-start (Memory) ; false → flex-center (canvas games) */
    gameScrollable?: boolean;
    /** Canvas games pass their containerRef for ResizeObserver anchoring */
    containerRef?: React.RefObject<HTMLDivElement | null>;
    /** Called when the mobile tab changes */
    onTabChange?: (tab: "jeu" | "scores" | "chat") => void;
    /**
     * Extra content shown below the player list in the sidebar.
     * Can be a plain ReactNode or a render-prop receiving `openConfirm` to
     * trigger the shared confirmation popup.
     */
    scoreboardFooter?: React.ReactNode | ((openConfirm: (label: string, action: () => void) => void) => React.ReactNode);
    /** Extra content shown at the top of round-end and end overlays (e.g. Motus secret word) */
    overlayTopContent?: React.ReactNode;
    /** Whether to show the forfeit button for the local player (default true) */
    canForfeit?: boolean;
}

export default function GameShell({
    room, chatMessages, myUsername, playerAvatars = {},
    genericState, players, sessionId,
    header, children, gameScrollable = false,
    containerRef, onTabChange, scoreboardFooter, overlayTopContent,
    canForfeit = true,
}: Props) {
    const {
        phase, playerOrder, playerNames, roundPoints, roundWinnerIds,
        currentRound, maxRounds, activePlayerIds = [], playerData = {},
        roundWinnerSubtitle, preserveOrder = false,
    } = genericState;

    const isHost         = players.find((p) => p.id === sessionId)?.isHost ?? false;
    const spectatorCount = players.filter((p) => p.isSpectator).length;
    const playerById     = new Map(players.map((p) => [p.id, p]));

    const myPlayer      = players.find((p) => p.id === sessionId);
    const myIsElim      = myPlayer?.isEliminated ?? false;
    const myIsSpectator = myPlayer?.isSpectator  ?? false;
    const showForfeit   = canForfeit && phase === "playing" && !myIsElim && !myIsSpectator;
    const showForceEnd  = isHost && (phase === "playing" || phase === "roundEnd");

    const [mobileTab,  setMobileTab]  = useState<"jeu" | "scores" | "chat">("jeu");
    const [chatInput,  setChatInput]  = useState("");
    const [confirm,    setConfirm]    = useState<null | { label: string; action: () => void }>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

    useEffect(() => { setConfirm(null); }, [phase]);

    // Keep the screen awake while in the game
    useEffect(() => {
        if (!("wakeLock" in navigator)) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let sentinel: any = null;
        async function request() {
            try { sentinel = await (navigator as any).wakeLock.request("screen"); } catch { /* ignore */ }
        }
        const onVisibility = () => { if (document.visibilityState === "visible") void request(); };
        void request();
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            document.removeEventListener("visibilitychange", onVisibility);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            void sentinel?.release();
        };
    }, []);

    function changeTab(tab: "jeu" | "scores" | "chat") {
        setMobileTab(tab);
        onTabChange?.(tab);
    }

    function handleChat(e: React.FormEvent) {
        e.preventDefault();
        if (!chatInput.trim()) return;
        room.send("chat", { text: chatInput.trim() });
        setChatInput("");
    }

    // ── Generic scoreboard ────────────────────────────────────────────────────
    const rankedByPoints = preserveOrder
        ? [...playerOrder]
        : [...playerOrder].sort((a, b) => (roundPoints[b] ?? 0) - (roundPoints[a] ?? 0));
    const multiRound = maxRounds > 1;

    const scoreboard = (
        <>
            <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">
                {multiRound ? "Points" : "Joueurs"}
            </p>
            <ul className="flex flex-col gap-2">
                {rankedByPoints.map((id) => {
                    const lp        = playerById.get(id);
                    const data      = playerData[id];
                    const name      = playerNames[id] ?? id;
                    const isMe      = id === sessionId;
                    const isElim    = lp?.isEliminated ?? false;
                    const isConn    = lp?.isConnected ?? true;
                    const isActive  = activePlayerIds.includes(id);
                    const pts       = roundPoints[id] ?? 0;
                    const color     = data?.color;
                    const isAlive   = data?.isAlive;
                    const roundScore = data?.roundScore;
                    const scoreUnit  = data?.roundScoreUnit;

                    const isHost = lp?.isHost ?? false;

                    return (
                        <li key={id} className={`flex items-center justify-between gap-2 text-sm ${
                            isElim ? "text-gray-600" : isActive ? "text-violet-300" : "text-gray-200"
                        }`}>
                            <span className={`truncate flex items-center gap-2 min-w-0 ${isElim ? "line-through" : ""}`}>
                                <div className="relative shrink-0">
                                    <Avatar username={name} gravatarUrl={lp?.gravatarUrl || null} size="sm" />
                                    {/* game color or connection dot at bottom-right */}
                                    {color ? (
                                        <span
                                            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-950"
                                            style={{ backgroundColor: color, opacity: isConn ? 1 : 0.4 }}
                                        />
                                    ) : (
                                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-950 ${isConn ? "bg-emerald-400" : "bg-gray-600"}`} />
                                    )}
                                    {/* host crown at top-left */}
                                    {isHost && (
                                        <span className="absolute -top-1 -left-1 bg-gray-950 rounded-full p-0.5">
                                            <Crown className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
                                        </span>
                                    )}
                                </div>
                                <span className="flex items-center gap-1 truncate min-w-0">
                                    {isActive && !isElim && <Play className="w-3 h-3 text-violet-400 shrink-0 fill-violet-400" />}
                                    {!isConn && <WifiOff className="w-3 h-3 text-red-500 shrink-0" title="Déconnecté" />}
                                    <span className="truncate">{name}</span>
                                    {isMe && <span className="text-gray-600 text-xs shrink-0">(vous)</span>}
                                    {isElim && <X className="w-3 h-3 text-gray-600 ml-1 shrink-0" />}
                                    {isAlive === false && !isElim && <span className="text-gray-600 text-xs ml-1 shrink-0">mort</span>}
                                </span>
                            </span>
                            <span className="shrink-0 font-bold text-indigo-400 tabular-nums">
                                {multiRound
                                    ? `${pts}pt`
                                    : roundScore !== undefined
                                        ? `${roundScore}${scoreUnit ? ` ${scoreUnit}` : ""}`
                                        : `${pts}pt`
                                }
                            </span>
                        </li>
                    );
                })}
            </ul>
            {spectatorCount > 0 && (
                <p className="text-xs text-gray-600 mt-3 flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    <span>{spectatorCount} spectateur{spectatorCount > 1 ? "s" : ""}</span>
                </p>
            )}
        </>
    );

    // ── Generic overlays ──────────────────────────────────────────────────────
    const maxPts      = Math.max(0, ...rankedByPoints.map(id => roundPoints[id] ?? 0));
    const winnerName  = roundWinnerIds.length === 1
        ? (playerNames[roundWinnerIds[0]!] ?? roundWinnerIds[0])
        : null;

    const standingsList = (highlightWinners: boolean) => (
        <ul className="flex flex-col gap-1 mb-4 text-left">
            {rankedByPoints.map((id, i) => {
                const lp         = playerById.get(id);
                const data       = playerData[id];
                const isElim     = lp?.isEliminated ?? false;
                const pts        = roundPoints[id] ?? 0;
                const isMe       = id === sessionId;
                const isChampion = pts === maxPts && maxPts > 0;
                const isWinner   = roundWinnerIds.includes(id);
                const color      = data?.color;
                return (
                    <li key={id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                            {i !== undefined && <span className="text-gray-500 w-4">{i + 1}.</span>}
                            {color && (
                                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            )}
                            <span className={`${isElim ? "line-through text-gray-500" : highlightWinners && isWinner ? "text-indigo-300 font-semibold" : isChampion && i === 0 ? "text-yellow-400 font-bold" : "text-gray-300"}`}>
                                {playerNames[id] ?? id}
                                {isMe && <span className="text-gray-600 text-xs ml-1">(vous)</span>}
                            </span>
                        </span>
                        <span className="font-bold text-white">{pts} pt{pts !== 1 ? "s" : ""}</span>
                    </li>
                );
            })}
        </ul>
    );

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="h-dvh bg-gray-950 text-white flex flex-col">

            <header className="border-b border-gray-800 px-4 py-3 flex items-center gap-3 shrink-0">
                {header}
            </header>

            {/* Mobile tabs */}
            <div className="lg:hidden flex border-b border-gray-800 shrink-0">
                {(["jeu", "scores", "chat"] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => changeTab(tab)}
                        className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                            mobileTab === tab
                                ? "border-b-2 border-indigo-500 text-white"
                                : "text-gray-500 hover:text-gray-300"
                        }`}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* Game area */}
                <main
                    ref={containerRef}
                    className={`${mobileTab !== "jeu" ? "hidden lg:flex" : "flex"} flex-1 min-w-0 ${
                        gameScrollable
                            ? "overflow-y-auto p-4 items-start justify-center"
                            : "items-center justify-center p-4"
                    }`}
                >
                    {children}
                </main>

                {/* Sidebar */}
                <aside className={`${mobileTab === "jeu" ? "hidden lg:flex" : "flex"} w-full lg:w-56 shrink-0 flex-col lg:border-l lg:border-gray-800`}>

                    <div className={`${mobileTab === "chat" ? "hidden lg:block" : ""} p-4 border-b border-gray-800 shrink-0`}>
                        {scoreboard}
                        {typeof scoreboardFooter === "function"
                            ? scoreboardFooter((label, action) => setConfirm({ label, action }))
                            : scoreboardFooter}

                        {/* Forfeit / force-end buttons */}
                        {(showForfeit || showForceEnd) && (
                            <div className="mt-3 border-t border-gray-800 pt-3 flex flex-col gap-2">
                                {showForfeit && (
                                    <button
                                        onClick={() => setConfirm({ label: "Déclarer forfait ?", action: () => room.send("forfeit") })}
                                        className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-red-400 border border-gray-800 hover:border-red-900/60 rounded-lg py-1.5 transition-colors"
                                    >
                                        <LogOut className="w-3 h-3" />
                                        Déclarer forfait
                                    </button>
                                )}
                                {showForceEnd && (
                                    <button
                                        onClick={() => setConfirm({ label: "Terminer la partie et revenir au lobby ?", action: () => room.send("forceReturnToLobby") })}
                                        className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-orange-400 border border-gray-800 hover:border-orange-900/60 rounded-lg py-1.5 transition-colors"
                                    >
                                        <SkipForward className="w-3 h-3" />
                                        Terminer la partie
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className={`${mobileTab === "scores" ? "hidden lg:flex" : "flex"} flex-col flex-1 min-h-0`}>
                        <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold px-4 pt-3 pb-2 shrink-0">Chat</p>
                        <div className="flex-1 overflow-y-auto px-3 pb-2 flex flex-col gap-2 min-h-0">
                            {chatMessages.length === 0 && (
                                <p className="text-gray-700 text-xs text-center mt-4">Aucun message.</p>
                            )}
                            {chatMessages.map((msg, i) => {
                                const isMine     = msg.username === myUsername;
                                const gravatarUrl = playerAvatars[msg.username] || null;
                                return (
                                    <div key={i} className={`flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"} items-end`}>
                                        {!isMine && (
                                            <div className="shrink-0 mb-0.5">
                                                <Avatar username={msg.username} gravatarUrl={gravatarUrl} size="sm" />
                                            </div>
                                        )}
                                        <div className={`flex flex-col gap-0.5 max-w-[80%] ${isMine ? "items-end" : "items-start"}`}>
                                            {!isMine && <span className="text-xs text-gray-500 px-1">{msg.username}</span>}
                                            <div className={`px-3 py-1.5 rounded-2xl text-sm break-words ${
                                                isMine
                                                    ? "bg-indigo-600 text-white rounded-tr-sm"
                                                    : "bg-gray-700 text-gray-100 rounded-tl-sm"
                                            }`}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={chatEndRef} />
                        </div>
                        <form onSubmit={handleChat} className="flex gap-2 p-3 border-t border-gray-800 shrink-0">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Message…"
                                maxLength={200}
                                autoComplete="off"
                                className="flex-1 min-w-0 bg-gray-800 border border-gray-700 text-white placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                            />
                            <button
                                type="submit"
                                disabled={!chatInput.trim()}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-3 py-2 rounded-lg transition-colors"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </form>
                    </div>
                </aside>
            </div>

            {/* Round-end overlay */}
            {phase === "roundEnd" && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
                        <h2 className="text-lg font-bold text-white mb-1">
                            Manche {currentRound}/{maxRounds} terminée !
                        </h2>
                        {overlayTopContent}
                        {winnerName ? (
                            <>
                                <p className="text-indigo-400 font-semibold flex items-center justify-center gap-2"><Trophy className="w-4 h-4" /> {winnerName}</p>
                                {roundWinnerSubtitle && (
                                    <p className="text-gray-500 text-xs mb-4">{roundWinnerSubtitle}</p>
                                )}
                                {!roundWinnerSubtitle && <div className="mb-4" />}
                            </>
                        ) : (
                            <p className="text-gray-400 mb-4">Égalité !</p>
                        )}
                        <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Classement général</p>
                        {standingsList(true)}
                        {isHost ? (
                            <button
                                onClick={() => room.send("nextRound")}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition-colors mt-2"
                            >
                                Manche suivante →
                            </button>
                        ) : (
                            <p className="text-gray-500 text-sm mt-2">En attente de la manche suivante…</p>
                        )}
                    </div>
                </div>
            )}

            {/* Confirmation popup */}
            {confirm && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20" onClick={() => setConfirm(null)}>
                    <div
                        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-xs w-full mx-4 text-center shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-white font-semibold mb-5">{confirm.label}</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirm(null)}
                                className="flex-1 py-2 rounded-lg text-sm text-gray-400 border border-gray-700 hover:border-gray-500 hover:text-gray-200 transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={() => { confirm.action(); setConfirm(null); }}
                                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-red-700 hover:bg-red-600 transition-colors"
                            >
                                Confirmer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* End overlay */}
            {phase === "ended" && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
                        <h2 className="text-xl font-bold text-white mb-1">Partie terminée !</h2>
                        <p className="text-gray-400 text-sm mb-4">
                            {maxRounds > 1 ? `${maxRounds} manches jouées` : "Classement final"}
                        </p>
                        {overlayTopContent}
                        {standingsList(false)}
                        {isHost ? (
                            <button
                                onClick={() => room.send("returnToLobby")}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition-colors mt-2"
                            >
                                Retour au lobby →
                            </button>
                        ) : (
                            <p className="text-gray-500 text-sm mt-2">En attente du retour au lobby…</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
