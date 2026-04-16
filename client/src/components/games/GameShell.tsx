import type {Room} from '@colyseus/sdk';
import {Crown, Eye, Flag, LogOut, Play, Send, SkipForward, Trophy, UserPlus, VolumeX, WifiOff, X} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import type {ChatMsg, GenericGameState, LobbyPlayer, LobbyState, VoteState} from '../../models/Lobby';
import Avatar from '../Avatar';

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
    /** Whether spectators can join as players and players can switch to spectator (default false) */
    canToggleSpectator?: boolean;
}

// ── VoteTimer ─────────────────────────────────────────────────────────────────

function VoteTimer({ deadline }: { deadline: number }) {
    const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    useEffect(() => {
        const iv = setInterval(() => {
            const r = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            setRemaining(r);
            if (r <= 0) clearInterval(iv);
        }, 500);
        return () => clearInterval(iv);
    }, [deadline]);
    return <span className="shrink-0 text-xs tabular-nums text-gray-500">{remaining}s</span>;
}

export default function GameShell({
    room, chatMessages, myUsername, playerAvatars = {},
    genericState, players, sessionId,
    header, children, gameScrollable = false,
    containerRef, onTabChange, scoreboardFooter, overlayTopContent,
    canForfeit = true, canToggleSpectator = false,
}: Props) {
    const {
        phase, playerOrder, playerNames, roundPoints, roundWinnerIds,
        currentRound, maxRounds, activePlayerIds = [], playerData = {},
        roundWinnerSubtitle, preserveOrder = false,
    } = genericState;

    const isHost     = players.find((p) => p.id === sessionId)?.isHost ?? false;
    const playerById = new Map(players.map((p) => [p.id, p]));

    const myPlayer      = players.find((p) => p.id === sessionId);
    const myIsElim      = myPlayer?.isEliminated ?? false;
    const myIsSpectator = myPlayer?.isSpectator  ?? false;
    const showForfeit        = canForfeit && phase === "playing" && !myIsElim && !myIsSpectator;
    const showForceEndRound  = isHost && phase === "playing";
    const showForceReturn    = isHost && (phase === "playing" || phase === "roundEnd");
    const showJoinAsPlayer   = canToggleSpectator && myIsSpectator && !myIsElim && phase === "playing";
    const showGoSpectator    = canToggleSpectator && !myIsSpectator && !myIsElim && phase === "playing";
    const showWantToPlay     = myIsSpectator && !myIsElim && phase !== "ended";

    const [mobileTab,   setMobileTab]  = useState<"jeu" | "scores" | "chat">("jeu");
    const [chatInput,   setChatInput]  = useState("");
    const [confirm,     setConfirm]    = useState<null | { label: string; action: () => void }>(null);
    const [activeVotes, setActiveVotes] = useState<VoteState[]>([]);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

    useEffect(() => { setConfirm(null); }, [phase]);

    // ── Vote event listeners ──────────────────────────────────────────────────
    useEffect(() => {
        const onStart = (data: Omit<VoteState, 'myChoice'>) => {
            setActiveVotes(prev => {
                if (prev.some(v => v.voteId === data.voteId)) return prev;
                return [...prev, { ...data, myChoice: null }];
            });
        };
        const onUpdate = (data: { voteId: string; yesCount: number; noCount: number }) => {
            setActiveVotes(prev => prev.map(v =>
                v.voteId === data.voteId ? { ...v, yesCount: data.yesCount, noCount: data.noCount } : v
            ));
        };
        const onEnd = (data: { voteId: string }) => {
            setActiveVotes(prev => prev.filter(v => v.voteId !== data.voteId));
        };
        const onCancel = (data: { voteId: string }) => {
            setActiveVotes(prev => prev.filter(v => v.voteId !== data.voteId));
        };

        room.onMessage("vote:start",  onStart);
        room.onMessage("vote:update", onUpdate);
        room.onMessage("vote:end",    onEnd);
        room.onMessage("vote:cancel", onCancel);

        // Ask server to replay current vote states (handles reconnects and late page loads)
        room.send("vote:sync");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room]);

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

    function castVote(voteId: string, choice: boolean) {
        const vote = activeVotes.find(v => v.voteId === voteId);
        if (!vote || vote.myChoice !== null) return;
        const isEligible = !!players.find(p => p.id === sessionId && p.isConnected);
        if (!isEligible) return;
        room.send("vote:cast", { voteId, choice });
        setActiveVotes(prev => prev.map(v => v.voteId === voteId ? { ...v, myChoice: choice } : v));
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

                    const isMuted = lp?.isMuted ?? false;
                    return (
                        <li key={id} className={`group flex items-center justify-between gap-2 text-sm ${
                            isActive ? "text-violet-300" : "text-gray-200"
                        }`}>
                            <span className="truncate flex items-center gap-2 min-w-0">
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
                                    {!isConn && <span title="Déconnecté"><WifiOff className="w-3 h-3 text-red-500 shrink-0" /></span>}
                                    <span className={`truncate ${isElim ? "line-through" : ""}`}>{name}</span>
                                    {isMe && <span className="text-gray-600 text-xs shrink-0">(vous)</span>}
                                    {isElim && <X className="w-3 h-3 text-gray-600 ml-1 shrink-0" />}
                                    {isAlive === false && !isElim && <span className="text-gray-600 text-xs ml-1 shrink-0">mort</span>}
                                </span>
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0">
                                {!isMe && (
                                    <button
                                        onClick={() => room.send("vote:initiate", { type: isMuted ? "unmute_player" : "mute_player", targetPlayerId: id })}
                                        title={isMuted ? "Voter pour débloquer le chat" : "Voter pour bloquer le chat"}
                                        className={isMuted
                                            ? "text-red-500 hover:text-emerald-400 transition-colors"
                                            : "opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400"}
                                    >
                                        <VolumeX className="w-3 h-3" />
                                    </button>
                                )}
                                <span className="font-bold text-indigo-400 tabular-nums">
                                    {multiRound
                                        ? `${pts}pt`
                                        : roundScore !== undefined
                                            ? `${roundScore}${scoreUnit ? ` ${scoreUnit}` : ""}`
                                            : `${pts}pt`
                                    }
                                </span>
                            </span>
                        </li>
                    );
                })}
            </ul>
            {players.some((p) => p.isSpectator) && (
                <div className="mt-3 border-t border-gray-800 pt-3">
                    <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-2 flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        Spectateurs
                    </p>
                    <ul className="flex flex-col gap-1.5">
                        {players.filter((p) => p.isSpectator).map((p) => {
                            const isMe = p.id === sessionId;
                            return (
                                <li key={p.id} className="group flex items-center justify-between gap-2 text-sm text-gray-500">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="relative shrink-0">
                                            <Avatar username={p.username} gravatarUrl={p.gravatarUrl || null} size="sm" />
                                            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-950 ${p.isConnected ? "bg-emerald-400" : "bg-gray-600"}`} />
                                        </div>
                                        <span className="flex items-center gap-1 truncate min-w-0">
                                            <span className="truncate">
                                                {p.username}
                                                {isMe && <span className="text-gray-600 text-xs ml-1">(vous)</span>}
                                            </span>
                                            {!isMe && p.wantsToPlay && (
                                                <UserPlus className="w-3 h-3 text-indigo-400 shrink-0" title="Veut jouer la prochaine manche" />
                                            )}
                                        </span>
                                    </div>
                                    {!isMe && (
                                        <button
                                            onClick={() => room.send("vote:initiate", { type: p.isMuted ? "unmute_player" : "mute_player", targetPlayerId: p.id })}
                                            title={p.isMuted ? "Voter pour débloquer le chat" : "Voter pour bloquer le chat"}
                                            className={p.isMuted
                                                ? "shrink-0 text-red-500 hover:text-emerald-400 transition-colors"
                                                : "shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400"}
                                        >
                                            <VolumeX className="w-3 h-3" />
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
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
                {(showForceEndRound || showForceReturn) && (
                    <div className="ml-auto flex items-center gap-1 shrink-0">
                        {showForceEndRound && (
                            <button
                                onClick={() => setConfirm({ label: "Terminer la manche en cours ?", action: () => room.send("forceEndRound") })}
                                title="Terminer la manche"
                                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-orange-400 border border-gray-800 hover:border-orange-900/60 rounded-lg px-2.5 py-1.5 transition-colors"
                            >
                                <Flag className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Manche</span>
                            </button>
                        )}
                        {showForceReturn && (
                            <button
                                onClick={() => setConfirm({ label: "Terminer la partie et revenir au lobby ?", action: () => room.send("forceReturnToLobby") })}
                                title="Terminer la partie"
                                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 border border-gray-800 hover:border-red-900/60 rounded-lg px-2.5 py-1.5 transition-colors"
                            >
                                <SkipForward className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Partie</span>
                            </button>
                        )}
                    </div>
                )}
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

                        {/* Boutons joueur */}
                        {(showJoinAsPlayer || showGoSpectator || showForfeit || showWantToPlay) && (
                            <div className="mt-3 border-t border-gray-800 pt-3 flex flex-col gap-2">
                                {showJoinAsPlayer && (
                                    <button
                                        onClick={() => room.send("spectator:set", { spectator: false })}
                                        className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-emerald-400 border border-gray-800 hover:border-emerald-900/60 rounded-lg py-1.5 transition-colors"
                                    >
                                        <Play className="w-3 h-3" />
                                        Rejoindre la partie
                                    </button>
                                )}
                                {showWantToPlay && (
                                    <button
                                        onClick={() => room.send("spectator:wantToPlay")}
                                        className={`w-full flex items-center justify-center gap-1.5 text-xs border rounded-lg py-1.5 transition-colors ${
                                            myPlayer?.wantsToPlay
                                                ? "text-indigo-300 border-indigo-800/60 bg-indigo-950/40 hover:border-red-900/60 hover:text-red-400"
                                                : "text-gray-500 border-gray-800 hover:text-indigo-300 hover:border-indigo-800/60"
                                        }`}
                                    >
                                        <UserPlus className="w-3 h-3" />
                                        {myPlayer?.wantsToPlay ? "Inscrit · prochaine manche" : "Jouer la prochaine manche"}
                                    </button>
                                )}
                                {showGoSpectator && (
                                    <button
                                        onClick={() => setConfirm({ label: "Passer en mode spectateur ?", action: () => room.send("spectator:set", { spectator: true }) })}
                                        className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-sky-400 border border-gray-800 hover:border-sky-900/60 rounded-lg py-1.5 transition-colors"
                                    >
                                        <Eye className="w-3 h-3" />
                                        Passer spectateur
                                    </button>
                                )}
                                {showForfeit && (
                                    <button
                                        onClick={() => setConfirm({ label: "Déclarer forfait ?", action: () => room.send("forfeit") })}
                                        className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-amber-400 border border-gray-800 hover:border-amber-900/60 rounded-lg py-1.5 transition-colors"
                                    >
                                        <LogOut className="w-3 h-3" />
                                        Déclarer forfait
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
                                const sender = !isMine ? players.find(p => p.username === msg.username && p.id !== sessionId) : undefined;
                                return (
                                    <div key={i} className={`group flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"} items-end`}>
                                        {!isMine && (
                                            <div className="shrink-0 mb-0.5">
                                                <Avatar username={msg.username} gravatarUrl={gravatarUrl} size="sm" />
                                            </div>
                                        )}
                                        <div className={`flex flex-col gap-0.5 max-w-[80%] ${isMine ? "items-end" : "items-start"}`}>
                                            {!isMine && (
                                                <div className="flex items-center gap-1">
                                                    <span className="text-xs text-gray-500 px-1">{msg.username}</span>
                                                    {sender && (sender.isMuted ? (
                                                        <button
                                                            onClick={() => room.send("vote:initiate", { type: "unmute_player", targetPlayerId: sender.id })}
                                                            className="text-red-500 hover:text-emerald-400 transition-colors"
                                                            title="Voter pour débloquer le chat"
                                                        >
                                                            <VolumeX className="w-2.5 h-2.5" />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => room.send("vote:initiate", { type: "mute_player", targetPlayerId: sender.id })}
                                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400"
                                                            title="Voter pour bloquer le chat"
                                                        >
                                                            <VolumeX className="w-2.5 h-2.5" />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
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
                        {myPlayer?.isMuted ? (
                            <div className="flex items-center justify-center gap-2 p-3 border-t border-gray-800 shrink-0">
                                <VolumeX className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                <span className="text-xs text-gray-500">Votre chat est bloqué.</span>
                            </div>
                        ) : (
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
                        )}
                    </div>
                </aside>
            </div>

            {/* ── Votes flottants ────────────────────────────────────────────── */}
            {activeVotes.some(v => v.myChoice === null) && (
                <div className="fixed bottom-4 left-2 right-2 lg:left-4 lg:right-auto lg:w-72 flex flex-col gap-2 z-30 max-h-[55vh] overflow-y-auto pointer-events-none">
                    {activeVotes.filter(v => v.myChoice === null).map((vote) => (
                        <div key={vote.voteId} className="pointer-events-auto rounded-xl border border-indigo-800/60 bg-gray-950/95 backdrop-blur-sm shadow-xl p-3 flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold text-indigo-200 leading-snug">{vote.question}</p>
                                <VoteTimer deadline={vote.deadline} />
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                <span className="text-emerald-400 font-semibold tabular-nums">{vote.yesCount}</span>
                                <div className="flex-1 h-1 rounded-full bg-gray-800 overflow-hidden">
                                    {vote.yesCount + vote.noCount > 0 && (
                                        <div
                                            className="h-full bg-emerald-500 transition-all"
                                            style={{ width: `${(vote.yesCount / (vote.yesCount + vote.noCount)) * 100}%` }}
                                        />
                                    )}
                                </div>
                                <span className="text-red-400 font-semibold tabular-nums">{vote.noCount}</span>
                            </div>
                            {vote.targetPlayerId === sessionId ? (
                                <p className="text-xs text-gray-500 text-center italic">Vous êtes concerné par ce vote.</p>
                            ) : vote.myChoice === null ? (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => castVote(vote.voteId, true)}
                                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700/40 hover:bg-emerald-700/70 text-emerald-300 border border-emerald-800/60 transition-colors"
                                    >
                                        {vote.yesLabel}
                                    </button>
                                    <button
                                        onClick={() => castVote(vote.voteId, false)}
                                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-red-900/40 hover:bg-red-900/70 text-red-300 border border-red-900/60 transition-colors"
                                    >
                                        {vote.noLabel}
                                    </button>
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500 text-center">
                                    Vote envoyé : <span className={vote.myChoice ? "text-emerald-400" : "text-red-400"}>
                                        {vote.myChoice ? vote.yesLabel : vote.noLabel}
                                    </span>
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}

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
