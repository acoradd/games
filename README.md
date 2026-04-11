# AccoGames

A self-hosted multiplayer mini-games portal. Create private rooms, invite friends, and play together in real time.

[![CI](https://github.com/acoradd/games/actions/workflows/ci.yml/badge.svg)](https://github.com/acoradd/games/actions/workflows/ci.yml)
[![Docker](https://github.com/acoradd/games/actions/workflows/docker.yml/badge.svg)](https://github.com/acoradd/games/actions/workflows/docker.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Games

| Game | Players | Description |
|------|---------|-------------|
| Memory | 2–4 | Flip cards to find matching pairs |
| Motus | 2–4 | Guess the hidden word |
| Tron | 2–4 | *(coming soon)* |
| Bomberman | 2–4 | *(coming soon)* |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Server | [Colyseus.js](https://colyseus.io) (TypeScript) — authoritative game server |
| Client | [React 19](https://react.dev) + [Tailwind CSS v3](https://tailwindcss.com) + [Vite](https://vite.dev) |
| Database | PostgreSQL via [Prisma ORM](https://prisma.io) |
| Auth | Anonymous JWT (no account required) |
| Realtime | WebSocket via Colyseus SDK |

---

## Getting Started

### Prerequisites

- Node.js >= 20.9.0
- PostgreSQL 16

### Local development

```bash
# 1. Clone
git clone https://github.com/accoradd/accoradd-games.git
cd accoradd-games

# 2. Install all dependencies (root + server + client)
npm run install:all

# 3. Configure environment
cp server/.env.example server/.env
# Edit server/.env — set DATABASE_URL

# 4. Run migrations & seed game modes
cd server
npx prisma migrate dev
npm run seed
cd ..

# 5. Start server + client (hot-reload)
npm run dev
```

- Client: http://localhost:8080
- Server: http://localhost:2567
- Colyseus monitor: http://localhost:2567/monitor

### Environment variables

**`server/.env`**

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_SECRET` | `changeme_dev` | JWT signing secret |
| `PORT` | `2567` | Server port |

**`client/.env`** (optional — defaults to localhost)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `localhost:2567` | API host (no protocol) |

---

## Docker deployment

Images are published on Docker Hub: [`accoradd/games-server`](https://hub.docker.com/r/accoradd/games-server) and [`accoradd/games-client`](https://hub.docker.com/r/accoradd/games-client).

```bash
# Create a .env file
cat > .env << 'EOF'
POSTGRES_PASSWORD=change_me
JWT_SECRET=change_me
API_URL=your-domain.com:2567
EOF

# Pull and start
docker compose up -d
```

The client reads `API_URL` at container startup (no rebuild needed to change the URL).

| Service | Port |
|---------|------|
| Client (nginx) | 5010 |
| Server (Colyseus) | 2567 |
| PostgreSQL | internal only |

### Build locally

```bash
docker build -f server/Dockerfile -t games-server .
docker build -f client/Dockerfile -t games-client .
```

---

## Project structure

```
accoradd-games/
├── server/                  # Colyseus + Express + Prisma
│   ├── src/
│   │   ├── rooms/           # LobbyRoom, schema
│   │   ├── services/        # Business logic
│   │   ├── controllers/     # Express handlers
│   │   └── routes/          # REST API
│   ├── prisma/              # Schema + migrations + seed
│   └── test/                # Mocha + @colyseus/testing
├── client/                  # React + Tailwind
│   ├── src/
│   │   ├── components/games/ # One component per game
│   │   ├── pages/            # HomePage, AuthPage, LobbyPage, GamePage, …
│   │   ├── services/         # API calls
│   │   └── webservices/      # axios, Colyseus client, env
│   └── public/
├── examples/gamemode/       # WebRTC prototypes (reference only)
└── docker-compose.yml
```

---

## Adding a new game

See [CONTRIBUTING.md](CONTRIBUTING.md#adding-a-new-game).

---

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) — © accoradd
