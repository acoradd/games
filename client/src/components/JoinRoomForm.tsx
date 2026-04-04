import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function JoinRoomForm() {
    const [code, setCode] = useState("");
    const navigate = useNavigate();

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = code.trim();
        if (trimmed) {
            navigate(`/lobby/${trimmed}`);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex gap-2 w-full">
            <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Code de room"
                maxLength={12}
                className="flex-1 bg-gray-800 border border-gray-600 text-white placeholder-gray-500 rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500"
            />
            <button
                type="submit"
                disabled={!code.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
            >
                Rejoindre
            </button>
        </form>
    );
}
