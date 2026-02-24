import { useState, useEffect, useRef } from "react";
import type { Room } from "@colyseus/sdk";
import type { LobbyState, ChatMsg } from "../../models/Lobby";

interface Props {
    room: Room<LobbyState>;
    chatMessages: ChatMsg[];
    myUsername: string;
    /** "roundEnd" triggers the between-rounds overlay; "ended" triggers the final overlay */
    phase: string;
    isHost: boolean;
    /** Contenu de la balise <header> */
    header: React.ReactNode;
    /** Zone de jeu principale (canvas ou grille de cartes) */
    children: React.ReactNode;
    /** true → overflow-y-auto + items-start (Memory) ; false → flex-center (canvas) */
    gameScrollable?: boolean;
    /** Canvas games passent leur containerRef pour que le <main> serve d'ancre au ResizeObserver */
    containerRef?: React.RefObject<HTMLDivElement | null>;
    /** Appelé quand l'onglet change */
    onTabChange?: (tab: "jeu" | "scores" | "chat") => void;
    /** Contenu du panneau latéral */
    scoreboard: React.ReactNode;
    /** Contenu de la modale de fin de manche (affiché quand phase === "roundEnd") — le bouton "Manche suivante" est ajouté par GameShell */
    roundEndContent?: React.ReactNode;
    /** Contenu de la modale de fin de partie (affiché quand phase === "ended") — le bouton "Retour" est ajouté par GameShell */
    endContent: React.ReactNode;
}

export default function GameShell({
    room, chatMessages, myUsername, phase, isHost,
    header, children, gameScrollable = false,
    containerRef, onTabChange,
    scoreboard, roundEndContent, endContent,
}: Props) {
    const [mobileTab, setMobileTab] = useState<"jeu" | "scores" | "chat">("jeu");
    const [chatInput, setChatInput] = useState("");
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

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

    return (
        <div className="h-dvh bg-gray-950 text-white flex flex-col">

            <header className="border-b border-gray-800 px-4 py-3 flex items-center gap-3 shrink-0">
                {header}
            </header>

            {/* Onglets mobiles */}
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

                {/* Zone de jeu */}
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

                {/* Panneau latéral */}
                <aside className={`${mobileTab === "jeu" ? "hidden lg:flex" : "flex"} w-full lg:w-56 shrink-0 flex-col lg:border-l lg:border-gray-800`}>

                    <div className={`${mobileTab === "chat" ? "hidden lg:block" : ""} p-4 border-b border-gray-800 shrink-0`}>
                        {scoreboard}
                    </div>

                    <div className={`${mobileTab === "scores" ? "hidden lg:flex" : "flex"} flex-col flex-1 min-h-0`}>
                        <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold px-4 pt-3 pb-2 shrink-0">Chat</p>
                        <div className="flex-1 overflow-y-auto px-3 pb-2 flex flex-col gap-2 min-h-0">
                            {chatMessages.length === 0 && (
                                <p className="text-gray-700 text-xs text-center mt-4">Aucun message.</p>
                            )}
                            {chatMessages.map((msg, i) => {
                                const isMine = msg.username === myUsername;
                                return (
                                    <div key={i} className={`flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
                                        {!isMine && <span className="text-xs text-gray-500 px-1">{msg.username}</span>}
                                        <div className={`max-w-[90%] px-3 py-1.5 rounded-2xl text-sm break-words ${
                                            isMine
                                                ? "bg-indigo-600 text-white rounded-tr-sm"
                                                : "bg-gray-700 text-gray-100 rounded-tl-sm"
                                        }`}>
                                            {msg.text}
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

            {/* Overlay fin de manche */}
            {phase === "roundEnd" && roundEndContent && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
                        {roundEndContent}
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

            {/* Overlay fin de partie */}
            {phase === "ended" && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
                        {endContent}
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
