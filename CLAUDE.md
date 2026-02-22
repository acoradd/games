# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Private multiplayer mini-games portal. Monorepo with:
- **/server** — Colyseus.js (TypeScript) authoritative game server, port 2567
- **/client** — (planned) Phaser 3 + React + Tailwind + Vite frontend
- **/examples/gamemode** — Reference HTML prototypes (WebRTC-based) of games to migrate to Colyseus

## Commands

All commands run from the `/server` directory unless noted.

```bash
# Development (hot-reload via tsx watch)
npm start

# Run tests (Mocha + @colyseus/testing)
npm test

# Run a single test file
npx mocha -r tsx test/MyRoom.test.ts --exit --timeout 15000

# Load testing
npm run loadtest

# Production build
npm run build

# Database migrations (once Prisma is added)
npx prisma migrate dev
```

Root-level (once the client is added): `npm run dev` launches both client and server via `concurrently`.

## Server Architecture

**Entry point:** `server/src/index.ts` → calls `listen(app)` from `@colyseus/tools`

**Configuration:** `server/src/app.config.ts`
- Rooms are registered here with `defineRoom()`
- Express routes (including `/monitor` and `/` playground) configured here
- `/monitor` = Colyseus monitoring panel (protect with password in production)
- Playground is disabled in production

**Room pattern** (`server/src/rooms/`):
- Each game mode = one `Room` class extending `colyseus.Room`
- Room state = a `Schema` class in `server/src/rooms/schema/`
- Lifecycle hooks: `onCreate`, `onJoin`, `onLeave`, `onDispose`
- Message handlers declared in `messages` object (typed via client's `room.send()`)

**State synchronization:** `@colyseus/schema` decorators (`@type(...)`) mark fields for automatic delta sync to all clients.

**Testing pattern** (`server/test/`):
- Use `@colyseus/testing`: `boot(appConfig)` + `colyseus.createRoom()` + `colyseus.connectTo()`
- `room.waitForNextPatch()` to await state sync before asserting

## Adding a New Game Mode

Workflow for migrating a game from `examples/gamemode/` to Colyseus:

1. **DB** — Add the game mode entry to the Prisma `GameMode` schema
2. **Schema** — Create `server/src/rooms/schema/<GameSchema>.ts` with `@type` decorators for all synchronized state (positions, scores, etc.)
3. **Room** — Create `server/src/rooms/<GameRoom>.ts`:
   - Extract collision/movement logic from the reference HTML file
   - Implement authoritative server-side loop using `this.setSimulationInterval()`
   - Handle client input via `messages` handlers (client sends `room.send("move", direction)`)
4. **Register** — Add `<game_id>: defineRoom(<GameRoom>)` in `app.config.ts`
5. **Client** — Create Phaser scene that reads room state changes, binds keyboard to `room.send()`

## Key Conventions

- Server uses ES modules (`"type": "module"`) — imports must include `.js` extension even for `.ts` source files
- `tsx` is used for running TypeScript directly (not `ts-node`)
- Production deployment uses PM2 via `ecosystem.config.cjs` (fork mode, one process per CPU)
- Node.js >= 20.9.0 required