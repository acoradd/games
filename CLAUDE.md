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

**Room pattern** (`server/src/rooms/`):
- Each game mode = one `Room` class extending `colyseus.Room`
- Room state = a `Schema` class in `server/src/rooms/schema/`
- Lifecycle hooks: `onCreate`, `onJoin`, `onLeave`, `onDispose`
- Message handlers declared in `messages` object (typed via client's `room.send()`)

**State synchronization:** `@colyseus/schema` decorators (`@type(...)`) mark fields for automatic delta sync to all clients.

**Testing pattern** (`server/test/`):
- Use `@colyseus/testing`: `boot(appConfig)` + `colyseus.createRoom()` + `colyseus.connectTo()`
- `room.waitForNextPatch()` to await state sync before asserting

## Client Architecture

**Stack:** React 19 + Vite + Tailwind CSS v3 + react-router-dom + axios

**Structure** (`client/src/`):
- `models/` — TypeScript interfaces (GameMode, Player)
- `webservices/api.ts` — axios instance with baseURL from `VITE_API_URL` env var
- `services/` — API calls (gameModeService, playerService)
- `components/` — Reusable UI (GameCard, JoinRoomForm, UsernameModal)
- `pages/` — Route pages (HomePage)
- `App.tsx` — BrowserRouter + Routes

**Auth:** Anonymous mode — POST `/api/players/anonymous` → JWT stored in `localStorage` under key `"player"`.

## Adding a New Game Mode

Workflow for migrating a game from `examples/gamemode/` to Colyseus:

1. **DB** — Add the game mode row via `npm run seed` or direct Prisma upsert
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
- JWT secret is read from `JWT_SECRET` env var (default: `"changeme_dev"` in development)
