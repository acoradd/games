import {
    defineServer,
    defineRoom,
    monitor,
    playground,
} from "colyseus";
import express from "express";

/**
 * Import your Room files
 */
import { MyRoom } from "./rooms/MyRoom.js";
import { LobbyRoom } from "./rooms/LobbyRoom.js";

/**
 * Import API routes
 */
import apiRouter from "./routes/index.js";

const server = defineServer({
    /**
     * Define your room handlers:
     */
    rooms: {
        my_room: defineRoom(MyRoom),
        lobby: defineRoom(LobbyRoom),
    },

    /**
     * Bind your custom express routes here:
     * Read more: https://expressjs.com/en/starter/basic-routing.html
     */
    express: (app) => {
        app.use(express.json());

        // Mount REST API
        app.use("/api", apiRouter);

        /**
         * Use @colyseus/monitor
         * It is recommended to protect this route with a password
         * Read more: https://docs.colyseus.io/tools/monitoring/#restrict-access-to-the-panel-using-a-password
         */
        app.use("/monitor", monitor());

        /**
         * Use @colyseus/playground
         * (It is not recommended to expose this route in a production environment)
         */
        if (process.env.NODE_ENV !== "production") {
            app.use("/", playground());
        }
    }

});

export default server;
