import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";

/**
 * /join/:roomCode redirects to /lobby/:roomCode.
 * LobbyPage handles the actual connection.
 */
export default function JoinLobbyPage() {
    const { roomCode = "" } = useParams<{ roomCode: string }>();
    const navigate = useNavigate();
    const redirected = useRef(false);

    useEffect(() => {
        if (redirected.current) return;
        redirected.current = true;
        navigate(`/lobby/${roomCode}`, { replace: true });
    }, [roomCode, navigate]);

    return (
        <div className="h-dvh bg-gray-950 text-white flex items-center justify-center">
            <p className="text-gray-400">Redirection…</p>
        </div>
    );
}
