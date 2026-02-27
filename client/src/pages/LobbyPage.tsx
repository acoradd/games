import type {Room} from '@colyseus/sdk';
import {useCallback, useEffect, useRef, useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import type {GameMode, GameOptionsValues} from '../models/GameMode';
import type {ChatMsg, LobbyPlayer, LobbyState} from '../models/Lobby';
import {getGameModes} from '../services/gameModeService';
import {joinLobby} from '../services/lobbyService';
import {getStoredPlayer} from '../services/playerService';
import {clearCurrentRoom, getCurrentRoom, setCurrentRoom} from '../webservices/currentLobbyRoom';

function getThumbnailUrl(slug: string) {
    return `/assets/games/${slug}/thumbnail.png`;
}

// ── Composant options ─────────────────────────────────────────────────────────
function GameOptions({
                         game,
                         values,
                         isHost,
                         onChange
                     }: {
    game: GameMode;
    values: GameOptionsValues;
    isHost: boolean;
    onChange: (key: string, value: number | string | boolean) => void;
}) {
    if (!game.options || Object.keys(game.options).length === 0) return null;

    return (
        <div className="mt-4 flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Options</p>
            {Object.entries(game.options).map(([key, def]) => {
                const current = key in values ? values[key] : def.default;
                return (
                    <div key={key} className="flex items-center justify-between gap-4">
                        <label className="text-sm text-gray-300 shrink-0">{def.label}</label>
                        {def.type === 'range' && (
                            <div className="flex items-center gap-2 flex-1 justify-end">
                                <input
                                    type="range"
                                    min={def.min}
                                    max={def.max}
                                    step={def.step ?? 1}
                                    value={current as number}
                                    disabled={!isHost}
                                    onChange={(e) => onChange(key, Number(e.target.value))}
                                    className="w-28 accent-indigo-500 disabled:opacity-50"
                                />
                                <span className="text-white text-sm w-6 text-right">{current}</span>
                            </div>
                        )}
                        {def.type === 'select' && (
                            <select
                                value={current as string}
                                disabled={!isHost}
                                onChange={(e) => onChange(key, e.target.value)}
                                className="bg-gray-800 border border-gray-600 text-white text-sm rounded-lg px-2 py-1 disabled:opacity-50"
                            >
                                {def.options?.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        )}
                        {def.type === 'toggle' && (
                            <button
                                disabled={!isHost}
                                onClick={() => isHost && onChange(key, !current)}
                                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${
                                    current
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-gray-700 text-gray-400'
                                }`}
                            >
                                {current ? 'Activé' : 'Désactivé'}
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function LobbyPage() {
    const {roomId = ''} = useParams<{ roomId: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    const roomRef = useRef<Room<LobbyState> | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const startingGameRef = useRef(false);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [sessionId, setSessionId] = useState('');
    const [players, setPlayers] = useState<LobbyPlayer[]>([]);
    const [hostId, setHostId] = useState('');
    const [selectedSlug, setSelectedSlug] = useState('');
    const [gameOptions, setGameOptions] = useState<GameOptionsValues>({});
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);

    const [gameModes, setGameModes] = useState<GameMode[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [copied, setCopied] = useState<'code' | 'link' | null>(null);
    const [mobileTab, setMobileTab] = useState<'jeu' | 'joueurs' | 'chat'>('jeu');

    const isHost = sessionId !== '' && sessionId === hostId;
    const selectedGame = gameModes.find((g) => g.slug === selectedSlug) ?? null;

    // ── Sync state depuis Colyseus ──────────────────────────────────────────
    // MapSchema côté client peut être un Map, un MapSchema, ou un objet plain — on accepte les trois.
    const syncState = useCallback((state: unknown) => {
        if (!state) return;
        const s = state as Record<string, unknown>;

        // Players
        const list: LobbyPlayer[] = [];
        const playersRaw = s['players'];
        if (playersRaw) {
            if (typeof (playersRaw as Map<string, unknown>).forEach === 'function') {
                (playersRaw as Map<string, LobbyPlayer>).forEach((p) =>
                    list.push({
                        id: p.id, username: p.username, isHost: p.isHost, isReady: p.isReady,
                        isConnected: p.isConnected ?? true, isEliminated: p.isEliminated ?? false
                    })
                );
            } else {
                // fallback plain object
                Object.values(playersRaw as Record<string, LobbyPlayer>).forEach((p) =>
                    list.push({
                        id: p.id, username: p.username, isHost: p.isHost, isReady: p.isReady,
                        isConnected: p.isConnected ?? true, isEliminated: p.isEliminated ?? false
                    })
                );
            }
        }
        setPlayers(list);
        setHostId((s['hostId'] as string) ?? '');
        setSelectedSlug((s['selectedGameSlug'] as string) ?? '');

        try {
            setGameOptions(JSON.parse((s['gameOptionsJson'] as string) ?? '{}') as GameOptionsValues);
        } catch {
            setGameOptions({});
        }

        // Chat
        const chat: ChatMsg[] = [];
        const historyRaw = s['chatHistory'];
        if (historyRaw) {
            const iter = typeof (historyRaw as { forEach?: unknown }).forEach === 'function'
                ? historyRaw as Iterable<{ username: string; text: string; timestamp: number }>
                : Object.values(historyRaw as object) as { username: string; text: string; timestamp: number }[];
            for (const m of iter as { username: string; text: string; timestamp: number }[]) {
                chat.push({username: m.username, text: m.text, ts: m.timestamp});
            }
        }
        setChatMessages(chat);
    }, []);

    // ── Connexion à la room ─────────────────────────────────────────────────
    useEffect(() => {
        if (!roomId) return;
        let cancelled = false;

        if (!getStoredPlayer()) {
            navigate('/', {state: {returnTo: location.pathname}});
            return;
        }

        async function connect() {
            try {
                let room = getCurrentRoom(roomId);
                if (!room) {
                    room = await joinLobby(roomId);
                }
                if (cancelled) {
                    room.leave();
                    return;
                }

                roomRef.current = room;
                setCurrentRoom(room);
                setSessionId(room.sessionId);

                // Sync initial state immediately (room from store already has state)
                if (room.state) {
                    syncState(room.state as unknown as LobbyState);
                }

                room.onStateChange((state) => {
                    syncState(state as unknown as LobbyState);
                });

                room.onMessage('game:start', ({gameSlug, roomId: gRoomId}: { gameSlug: string; roomId: string }) => {
                    startingGameRef.current = true;
                    navigate(`/game/${gameSlug}/play/${gRoomId}`);
                });

                setLoading(false);
            } catch (err: unknown) {
                console.error('[LobbyPage] connect error:', err);
                if (!cancelled) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setError(`Erreur de connexion — ${msg}`);
                    setLoading(false);
                }
            }
        }

        connect();
        getGameModes().then(setGameModes);

        return () => {
            cancelled = true;
            if (roomRef.current) {
                if (startingGameRef.current) {
                    // Keep room alive for GamePage to pick up
                } else {
                    roomRef.current.leave();
                    clearCurrentRoom();
                }
                roomRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId]);

    // ── Auto-scroll chat ────────────────────────────────────────────────────
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [chatMessages]);

    // ── Actions ─────────────────────────────────────────────────────────────
    function handleSelectGame(slug: string) {
        roomRef.current?.send('selectGame', {slug});
    }

    function handleOptionChange(key: string, value: number | string | boolean) {
        const next = {...gameOptions, [key]: value};
        setGameOptions(next);
        roomRef.current?.send('setOptions', {options: next});
    }

    function handleReady() {
        roomRef.current?.send('ready');
    }

    function handleStart() {
        roomRef.current?.send('start');
    }

    function handleChat(e: React.FormEvent) {
        e.preventDefault();
        if (!chatInput.trim()) return;
        roomRef.current?.send('chat', {text: chatInput.trim()});
        setChatInput('');
    }

    async function handleCopy(type: 'code' | 'link') {
        const text = type === 'code'
            ? roomId
            : `${window.location.origin}/lobby/${roomId}`;
        await navigator.clipboard.writeText(text);
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
    }

    const me = players.find((p) => p.id === sessionId);
    const allReady = players.length > 0 && players.every((p) => p.isReady);

    // ── États de chargement / erreur ────────────────────────────────────────
    if (loading) {
        return (
            <div className="h-dvh bg-gray-950 text-white flex items-center justify-center">
                <p className="text-gray-400">Connexion au lobby…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-dvh bg-gray-950 text-white flex items-center justify-center p-4">
                <div className="text-center">
                    <p className="text-red-400 mb-4">{error}</p>
                    <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white underline text-sm">
                        Retour à l'accueil
                    </button>
                </div>
            </div>
        );
    }

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="h-dvh bg-gray-950 text-white flex flex-col">

            {/* ── Header ── */}
            <header className="border-b border-gray-800 px-6 py-3 flex items-center gap-4 flex-wrap">
                <button onClick={() => navigate('/')}
                        className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
                    ← Accueil
                </button>
                <span className="text-gray-700">|</span>
                <span className="font-bold text-white">Lobby</span>
                <div className="ml-auto flex items-center gap-3 flex-wrap">
                    {/* Code + QR code au survol */}
                    <div className="relative group">
                        <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 cursor-default">
                            <span className="text-gray-500 text-xs">Code</span>
                            <span className="font-mono font-bold text-white tracking-widest text-sm">{roomId}</span>
                            <button
                                onClick={() => handleCopy('code')}
                                className="text-gray-400 hover:text-white text-xs transition-colors"
                                title="Copier le code"
                            >
                                {copied === 'code' ? '✓' : '📋'}
                            </button>
                        </div>
                        {/* QR code popup */}
                        <div className="absolute right-0 top-full mt-2 z-50 hidden group-hover:flex flex-col items-center gap-2 bg-gray-950 border border-gray-800 rounded-xl p-3 shadow-2xl">
                            <QRCodeSVG
                                value={`${window.location.origin}/lobby/${roomId}`}
                                size={160}
                                bgColor="#030712"
                                fgColor="#ffffff"
                            />
                            <span className="text-gray-500 text-xs font-mono">{roomId}</span>
                        </div>
                    </div>
                    {/* Lien */}
                    <button
                        onClick={() => handleCopy('link')}
                        className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 text-sm transition-colors"
                    >
                        🔗 {copied === 'link' ? 'Lien copié ✓' : 'Copier le lien'}
                    </button>
                </div>
            </header>

            {/* ── Onglets mobiles ── */}
            <div className="lg:hidden flex border-b border-gray-800 shrink-0">
                {(['jeu', 'joueurs', 'chat'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setMobileTab(tab)}
                        className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                            mobileTab === tab
                                ? 'border-b-2 border-indigo-500 text-white'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        {tab === 'joueurs' ? `Joueurs (${players.length})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            {/* ── Body ── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* ── Panneau gauche : sélection / info du jeu ── */}
                <main
                    className={`${mobileTab !== 'jeu' ? 'hidden lg:block' : 'block'} flex-1 overflow-y-auto p-4 lg:p-6 lg:border-r lg:border-gray-800`}>
                    {!selectedSlug ? (
                        /* Sélection du jeu */
                        <div>
                            <h2 className="text-lg font-semibold text-gray-300 mb-4">
                                {isHost ? 'Choisissez un jeu' : 'En attente du choix de l\'hôte…'}
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {gameModes.map((gm) => {
                                    return (
                                        <button
                                            key={gm.slug}
                                            disabled={!isHost}
                                            onClick={() => handleSelectGame(gm.slug)}
                                            className={`text-left rounded-xl overflow-hidden border border-gray-700 hover:border-indigo-500 transition-colors disabled:cursor-default disabled:hover:border-gray-700 group`}
                                        >
                                            <img
                                                src={getThumbnailUrl(gm.slug)}
                                                alt={gm.name}
                                                className="h-36 flex object-cover rounded-lg w-full"
                                            />
                                            <div className="p-4 bg-gray-900">
                                                <p className="font-bold text-white">{gm.name}</p>
                                                <p className="text-gray-400 text-xs mt-1 line-clamp-2">{gm.description}</p>
                                                <p className="text-gray-600 text-xs mt-2">{gm.minPlayers}–{gm.maxPlayers} joueurs</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        /* Info du jeu sélectionné */
                        <div>
                            {selectedGame && (
                                <div>
                                    {/* Bannière du jeu */}
                                    <div
                                        className={`rounded-xl h-40 mb-5 relative`}
                                        style={{backgroundImage: getThumbnailUrl(selectedGame.slug)}}
                                    >
                                        <img
                                            src={getThumbnailUrl(selectedGame.slug)}
                                            alt={selectedGame.name}
                                            className="rounded-xl h-full object-cover w-full absolute top-0 right-0 left-0"
                                        />
                                        <p className="absolute bottom-3 left-3 bg-black/40 p-1 rounded-lg text-white font-bold text-2xl">{selectedGame.name}</p>
                                        <p className="absolute bottom-3 right-3 bg-black/40 p-1 rounded-lg text-white/70 text-sm">{selectedGame.minPlayers}–{selectedGame.maxPlayers} joueurs</p>

                                        {isHost && (
                                            <button
                                                onClick={() => handleSelectGame('')}
                                                className="absolute top-3 right-3 bg-black/40 hover:bg-black/60 text-white text-xs px-2 py-1 rounded-lg transition-colors"
                                            >
                                                Changer
                                            </button>
                                        )}
                                    </div>

                                    {/* Description */}
                                    <p className="text-gray-300 mb-4">{selectedGame.description}</p>

                                    {/* Options */}
                                    <GameOptions
                                        game={selectedGame}
                                        values={gameOptions}
                                        isHost={isHost}
                                        onChange={handleOptionChange}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </main>

                {/* ── Panneau droit : joueurs + chat ── */}
                <aside
                    className={`${mobileTab === 'jeu' ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 flex-col lg:border-l lg:border-gray-800 shrink-0`}>

                    {/* Joueurs */}
                    <div className={`p-4 border-b border-gray-800 ${mobileTab === 'chat' ? 'hidden lg:block' : ''}`}>
                        <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">
                            Joueurs ({players.length})
                        </p>
                        <ul className="flex flex-col gap-2">
                            {players.map((p) => (
                                <li key={p.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`w-2 h-2 rounded-full shrink-0 ${p.isReady ? 'bg-emerald-400' : 'bg-gray-600'}`}/>
                                        <span className="text-sm font-medium truncate max-w-28">
                                            {p.username}
                                            {p.id === sessionId && (
                                                <span className="text-gray-600 text-xs ml-1">(vous)</span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs shrink-0">
                                        {p.isHost && (
                                            <span
                                                className="bg-indigo-900/60 text-indigo-300 px-1.5 py-0.5 rounded">host</span>
                                        )}
                                        <span className={p.isReady ? 'text-emerald-400' : 'text-gray-600'}>
                                            {p.isReady ? 'prêt' : 'attente'}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Chat */}
                    <div className={`flex-1 flex flex-col min-h-0 ${mobileTab === 'joueurs' ? 'hidden lg:flex' : ''}`}>
                        <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold px-4 pt-3 pb-2">Chat</p>

                        <div className="flex-1 overflow-y-auto px-3 pb-2 flex flex-col gap-2 min-h-0">
                            {chatMessages.length === 0 && (
                                <p className="text-gray-700 text-xs text-center mt-4">Aucun message.</p>
                            )}
                            {chatMessages.map((msg, i) => {
                                const isMine = msg.username === players.find((p) => p.id === sessionId)?.username;
                                return (
                                    <div key={i}
                                         className={`flex flex-col gap-0.5 ${isMine ? 'items-end' : 'items-start'}`}>
                                        {!isMine && (
                                            <span className="text-xs text-gray-500 px-1">{msg.username}</span>
                                        )}
                                        <div className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-sm break-words ${
                                            isMine
                                                ? 'bg-indigo-600 text-white rounded-tr-sm'
                                                : 'bg-gray-700 text-gray-100 rounded-tl-sm'
                                        }`}>
                                            {msg.text}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={chatEndRef}/>
                        </div>

                        <form onSubmit={handleChat} className="flex gap-2 p-3 border-t border-gray-800">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Message…"
                                maxLength={200}
                                className="flex-1 min-w-0 bg-gray-800 border border-gray-700 text-white placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                            />
                            <button
                                type="submit"
                                disabled={!chatInput.trim()}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-3 py-2 rounded-lg transition-colors text-sm"
                            >
                                ↑
                            </button>
                        </form>
                    </div>
                </aside>
            </div>

            {/* ── Footer actions ── */}
            <footer
                className="border-t border-gray-800 px-4 lg:px-6 py-3 flex items-center justify-between gap-3 shrink-0 flex-wrap">
                <button
                    onClick={handleReady}
                    className={`px-5 py-2 rounded-lg font-semibold transition-colors ${
                        me?.isReady
                            ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                            : 'bg-gray-700 hover:bg-gray-600 text-white'
                    }`}
                >
                    {me?.isReady ? '✓ Prêt' : 'Prêt ?'}
                </button>

                {isHost && (
                    <button
                        onClick={handleStart}
                        disabled={!selectedSlug || !allReady}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                    >
                        {!selectedSlug
                            ? 'Choisissez un jeu'
                            : !allReady
                                ? 'En attente des joueurs…'
                                : `Lancer ${selectedGame?.name ?? ''} →`}
                    </button>
                )}
            </footer>
        </div>
    );
}
