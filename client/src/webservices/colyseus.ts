import { Client } from "@colyseus/sdk";
import { env } from "./env.ts";

export const colyseusClient = new Client(env.colyseusUrl);
