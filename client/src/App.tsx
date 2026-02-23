import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import CreateLobbyPage from "./pages/CreateLobbyPage";
import LobbyPage from "./pages/LobbyPage";
import JoinLobbyPage from "./pages/JoinLobbyPage";
import GamePage from "./pages/GamePage";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/lobby/new" element={<CreateLobbyPage />} />
                <Route path="/lobby/:roomId" element={<LobbyPage />} />
                <Route path="/join/:roomCode" element={<JoinLobbyPage />} />
                <Route path="/game/:slug/play/:roomId" element={<GamePage />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
