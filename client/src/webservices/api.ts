import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:2567",
    headers: {
        "Content-Type": "application/json",
    },
});

api.interceptors.request.use((config) => {
    const raw = localStorage.getItem("player");
    if (raw) {
        try {
            const { token } = JSON.parse(raw) as { token: string };
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        } catch {
            // ignore malformed storage
        }
    }
    return config;
});

export default api;
