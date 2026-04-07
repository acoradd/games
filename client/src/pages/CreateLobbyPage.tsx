import {useEffect, useRef} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {createLobby} from '../services/lobbyService';
import {getStoredPlayer} from '../services/playerService';
import {setCurrentRoom} from '../webservices/currentLobbyRoom';

export default function CreateLobbyPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const creating = useRef(false);

    useEffect(() => {
        if (creating.current) return;
        creating.current = true;

        if (!getStoredPlayer()) {
            navigate('/auth', {state: {returnTo: '/lobby/new'}});
            return;
        }

        const gameSlug = (location.state as { gameSlug?: string } | null)?.gameSlug;

        createLobby()
            .then((room) => {
                if (gameSlug) room.send('selectGame', {slug: gameSlug});
                setCurrentRoom(room);
                navigate(`/lobby/${room.roomId}`, {replace: true});
            })
            .catch((err) => {
                console.error(err);
                navigate('/');
            });
    }, [navigate]);

    return (
        <div className="h-dvh bg-gray-950 text-white flex items-center justify-center">
            <p className="text-gray-400">Création du lobby…</p>
        </div>
    );
}
