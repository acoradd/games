import {
    defineServer,
    defineRoom,
    monitor,
    playground,
} from "colyseus";
import express from "express";
import cors from "cors";

/**
 * Import your Room files
 */
import { MyRoom } from "./rooms/MyRoom.js";
import { LobbyRoom } from "./rooms/LobbyRoom.js";

/**
 * Import API routes
 */
import apiRouter from "./routes/index.js";
import healthRouter from "./routes/health.routes.js";

const server = defineServer({
    /**
     * Define your room handlers:
     */
    rooms: {
        my_room: defineRoom(MyRoom),
        lobby: defineRoom(LobbyRoom),
    },

    express: (app) => {
        // Configure CORS
        const corsOrigin = process.env.CORS_ORIGIN || "*";
        app.use(cors({
            origin: corsOrigin === "*" ? "*" : corsOrigin.split(","),
            credentials: true,
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowedHeaders: ["Content-Type", "Authorization"]
        }));

        app.use(express.json());

        // Mount health check endpoints
        app.use("/health", healthRouter);

        // Mount REST API
        app.use("/api", apiRouter);

        if (process.env.NODE_ENV !== "production") {
            app.use("/monitor", monitor());
            app.use("/", playground());
        }
    }

});

export default server;
