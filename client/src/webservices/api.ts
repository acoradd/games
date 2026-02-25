import axios from "axios";
import { env } from "./env.ts";

const api = axios.create({
    baseURL: env.apiUrl,
    headers: {
        "Content-Type": "application/json",
    },
    withCredentials: false
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
