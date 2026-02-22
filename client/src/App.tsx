import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/join/:roomCode" element={<div className="text-white p-8">Rejoindre la room — à implémenter</div>} />
                <Route path="/game/:slug/new" element={<div className="text-white p-8">Créer une partie — à implémenter</div>} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
