# Contributing to AccoGames

Thank you for your interest in contributing!

---

## Table of contents

- [Getting started](#getting-started)
- [Development workflow](#development-workflow)
- [Adding a new game](#adding-a-new-game)
- [Commit conventions](#commit-conventions)
- [Pull request process](#pull-request-process)

---

## Getting started

```bash
git clone https://github.com/accoradd/accoradd-games.git
cd accoradd-games
npm run install:all
cp server/.env.example server/.env  # set DATABASE_URL
cd server && npx prisma migrate dev && npm run seed && cd ..
npm run dev
```

See the [README](README.md) for the full setup guide.

---

## Development workflow

```bash
# Run tests (server only)
cd server && npm test

# Run a single test file
cd server && npx mocha -r tsx test/MyRoom.test.ts --exit --timeout 15000

# Type-check client
cd client && npx tsc --noEmit
```

---

## Adding a new game

Follow these steps to add a new game mode end-to-end.

### 1. Database

Add a row in `server/prisma/seed.ts` and re-seed:

```bash
cd server && npm run seed
```

### 2. Server — `server/src/rooms/LobbyRoom.ts`

- Add an `init<Game>(state)` function that writes the initial `gameStateJson`
- Add action message handlers (e.g. `this.onMessage("myAction", ...)`)
- Mutate `gameStateJson` on each action: parse → update → re-serialize

### 3. Client component — `client/src/components/games/<Game>.tsx`

Props received:
```ts
{ room, sessionId, gameState, players, chatMessages }
```

### 4. GamePage — `client/src/pages/GamePage.tsx`

Add a `slug === "<game>"` branch in the render section.

### 5. LobbyPage — `client/src/pages/LobbyPage.tsx`

Add a gradient + emoji entry in the `SLUG_STYLE` map.

---

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org):

```
<type>(scope): short description

feat(memory): add turn timeout option
fix(lobby): prevent duplicate sessionId on reconnect
chore(docker): upgrade to node 24
docs: update contributing guide
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `style`, `ci`

---

## Pull request process

1. Fork the repository and create a branch from `master`
2. Make your changes and add tests if applicable
3. Ensure `cd server && npm test` passes
4. Open a pull request — fill in the PR template
5. A maintainer will review and merge

Please keep PRs focused on a single concern.

---

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be respectful and constructive.
