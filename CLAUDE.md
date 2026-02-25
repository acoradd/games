# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Private multiplayer mini-games portal. Monorepo with:
- **/server** — Colyseus.js (TypeScript) authoritative game server, port 2567
- **/client** — Phaser 3 + React + Tailwind + Vite frontend, port 8080
- **/examples/gamemode** — Reference HTML prototypes (WebRTC-based) of games to migrate to Colyseus

## Commands

### Root (monorepo)
```bash
# Launch server + client concurrently
npm run dev

# Install all dependencies
npm run install:all
```

### Server (`/server`)
```bash
# Development (hot-reload via tsx watch)
npm run dev

# Run tests (Mocha + @colyseus/testing)
npm test

# Run a single test file
npx mocha -r tsx test/MyRoom.test.ts --exit --timeout 15000

# Load testing
npm run loadtest

# Production build
npm run build

# Database migrations
npx prisma migrate dev --name <description>

# Seed database (4 game modes: tron, bomberman, memory, motus)
npm run seed
```

### Client (`/client`)
```bash
# Development
npm run dev

# Production build
npm run build
```

## Server Architecture

**Entry point:** `server/src/index.ts` → calls `listen(app)` from `@colyseus/tools`

**Configuration:** `server/src/app.config.ts`
- Rooms are registered here with `defineRoom()`
- Express routes mounted here: `/api` (REST API), `/monitor`, `/` (playground)
- `/monitor` = Colyseus monitoring panel (protect with password in production)
- Playground is disabled in production

**REST API** (`server/src/`):
- `lib/prisma.ts` — singleton PrismaClient
- `services/` — business logic (gameMode.service.ts, player.service.ts)
- `controllers/` — Express request handlers
- `routes/` — Express routers (`index.ts` mounts everything under `/api`)
- `middleware/auth.middleware.ts` — JWT Bearer token verification

**Endpoints:**
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/game-modes` | List active game modes |
| GET | `/api/game-modes/:slug` | Get game mode by slug |
| POST | `/api/players/anonymous` | Create anonymous player → `{ player, token }` |

**Database:** PostgreSQL via Prisma — schema `games`, models: `GameMode`, `Player`

**Room architecture** (`server/src/rooms/`):
- Currently one `LobbyRoom` handles all game modes via a generic JSON state field
- `LobbyState` schema (`schema/LobbyState.ts`): `hostId`, `isStarted`, `status`, `selectedGameSlug`, `gameOptionsJson`, `gameStateJson`, `players` (MapSchema), `chatHistory` (ArraySchema)
- `LobbyPlayer` schema fields: `id`, `username`, `isHost`, `isReady`, `isConnected`, `isEliminated`
- Game-specific logic lives entirely in `gameStateJson: string` (parsed/mutated/re-serialized on each action)
- `onAuth` verifies JWT token and blocks duplicate connections via `playerIdMap: Map<playerId, sessionId>`
- `async onLeave`: unexpected disconnect → `allowReconnection(client, 30)` → timeout → `eliminatePlayer`; consented leave during game → `eliminatePlayer`; lobby → `removePlayer`
- Message handlers: `ready`, `selectGame`, `setOptions`, `chat`, `start`, `flipCard`, `returnToLobby`

**State synchronization:** `@colyseus/schema` decorators (`@type(...)`) mark fields for automatic delta sync to all clients.

**Testing pattern** (`server/test/`):
- Use `@colyseus/testing`: `boot(appConfig)` + `colyseus.createRoom()` + `colyseus.connectTo()`
- `room.waitForNextPatch()` to await state sync before asserting

## Client Architecture

**Stack:** React 19 + Vite + Tailwind CSS v3 + react-router-dom + axios + @colyseus/sdk

**Structure** (`client/src/`):
- `models/` — TypeScript interfaces: `Lobby.ts` (LobbyPlayer, ChatMsg, LobbyState, MemoryGameState, MemoryCard), `GameMode.ts`
- `webservices/api.ts` — axios instance with baseURL from `VITE_API_URL` env var
- `webservices/colyseus.ts` — Colyseus client singleton
- `webservices/currentLobbyRoom.ts` — in-memory store for the active Room object (cross-page hand-off)
- `services/` — API calls (gameModeService, playerService, lobbyService)
- `components/` — Reusable UI (GameCard, JoinRoomForm, UsernameModal) + `components/games/` (MemoryGame)
- `pages/` — HomePage, LobbyPage, GamePage
- `App.tsx` — BrowserRouter + Routes

**Routes:**
| Path | Page |
|------|------|
| `/` | HomePage |
| `/lobby/new` | LobbyPage (creates room) |
| `/lobby/:roomId` | LobbyPage (joins room) |
| `/game/:slug/play/:roomId` | GamePage |

**Auth:** Anonymous mode — POST `/api/players/anonymous` → `{ player, token }` stored in `localStorage` under key `"player"`. The JWT `token` is also passed as an option when joining a Colyseus room (`joinById` / `create`) so `onAuth` can verify identity and block duplicates.

**Unauthenticated access:** `LobbyPage` and `GamePage` redirect to `"/"` with `{ state: { returnTo: location.pathname } }` if no stored player. `HomePage` navigates back to `returnTo` after successful login.

## Lobby → Game Navigation

1. All clients call `setCurrentRoom(room)` when they connect to the lobby (not just host)
2. Host sends `start` → server broadcasts `game:start` to all
3. Each client sets `startingGameRef.current = true` then navigates to `/game/:slug/play/:roomId`
4. LobbyPage cleanup: if `startingGameRef.current`, skip `room.leave()` + `clearCurrentRoom()` — keeps connection alive
5. GamePage picks up the existing room via `getCurrentRoom(roomId)` — same sessionId, no reconnect

## GamePage Reconnection

- `room.reconnectionToken` persisted in `localStorage` (key: `reconnect_${roomId}`) so it survives page close
- `room.onLeave` (code ≠ 4000/1000) → `setReconnecting(true)` → `attemptReconnect(token)` (3 attempts × 3s)
- On success: re-bind handlers, re-open BroadcastChannel, clear reconnecting overlay
- On failure: `clearToken`, `navigate("/")`
- **Multi-tab protection:** before attempting `reconnect(token)`, broadcasts "check" via `BroadcastChannel`. If another tab responds "active" within 200ms, skip reconnect and go to `joinLobby` (blocked server-side by 409 if already connected)

## Game State Pattern (Generic JSON)

- `LobbyState.gameStateJson` holds the entire game state as a serialized JSON string
- Server parses, mutates, re-serializes on each player action
- Client parses in `onStateChange` and passes the typed object to the game component
- This avoids adding `@colyseus/schema` fields per game mode

## Memory Game

- **Options:** `pairs` (8/12/16/24, default 12), `turnTimeout` (10/15/30/60/0=∞, default 30s)
- **Turns:** match → same player plays again; no-match → 1500ms reveal delay, then unflip, next turn
- **Turn timer:** `startTurnTimer` / `clearTurnTimer` using `this.clock.setTimeout`; `turnDeadline` (ms timestamp) synced to client for countdown display
- **Elimination:** disconnected >30s or voluntary leave during game → `eliminatePlayer` → removed from rotation, score frozen, visible in scoreboard
- **`nextTurn`** filters by `scores` keys (original participants only) AND `!isEliminated`
- **`playerNames`** snapshot (sessionId → username) captured at game start — scoreboard uses this so eliminated/departed players remain visible
- **End:** all pairs matched OR 0 active players remaining → `phase = "ended"`
- **Return to lobby:** host-only button → `room.send("returnToLobby")` → server resets state, broadcasts `lobby:return` → all GamePage instances navigate to `/lobby/:roomId`

## Adding a New Game Mode

1. **DB** — Add row in `server/prisma/scripts/seed.ts` and run `npm run seed`
2. **Server** — Add message handlers to `LobbyRoom.ts`: `init<Game>()`, action handlers, `gameStateJson` mutations
3. **Client** — Create `client/src/components/games/<Game>.tsx` component; receive `room`, `sessionId`, `gameState`, `players`, `chatMessages` as props
4. **GamePage** — Add `slug === "<game>"` branch in the render section
5. **LobbyPage** — Add gradient/emoji entry in `SLUG_STYLE`

## Key Conventions

- Server uses ES modules (`"type": "module"`) — imports must include `.js` extension even for `.ts` source files
- `tsx` is used for running TypeScript directly (not `ts-node`)
- Production deployment uses PM2 via `ecosystem.config.cjs` (fork mode, one process per CPU)
- Node.js >= 20.9.0 required
- JWT secret is read from `JWT_SECRET` env var (default: `"changeme_dev"` in development)
