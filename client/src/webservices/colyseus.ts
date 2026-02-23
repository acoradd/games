import { Client } from "@colyseus/sdk";

export const colyseusClient = new Client(
    import.meta.env.VITE_COLYSEUS_URL ?? "ws://localhost:2567"
);
