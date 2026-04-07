import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import CreateLobbyPage from "./pages/CreateLobbyPage";
import LobbyPage from "./pages/LobbyPage";
import JoinLobbyPage from "./pages/JoinLobbyPage";
import GamePage from "./pages/GamePage";
import MentionsLegalesPage from "./pages/MentionsLegalesPage";
import ConfidentialitePage from "./pages/ConfidentialitePage";
import CguPage from "./pages/CguPage";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/lobby/new" element={<CreateLobbyPage />} />
                <Route path="/lobby/:roomId" element={<LobbyPage />} />
                <Route path="/join/:roomCode" element={<JoinLobbyPage />} />
                <Route path="/game/:slug/play/:roomId" element={<GamePage />} />
                <Route path="/mentions-legales" element={<MentionsLegalesPage />} />
                <Route path="/confidentialite" element={<ConfidentialitePage />} />
                <Route path="/cgu" element={<CguPage />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
