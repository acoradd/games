import {Auth, Client} from '@colyseus/sdk';
import {HTTP} from '@colyseus/sdk/HTTP';
import { env } from "./env.ts";

export const colyseusClient = createColyseusClient();


function createColyseusClient() {
    const client = new Client(env.colyseusUrl);
    client.http = new HTTP(client, {
        headers: {},
        credentials: 'omit'
    });
    client.auth = new Auth(client.http);
    return client;
}
