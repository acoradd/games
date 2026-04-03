-- Purge all existing players (anonymous accounts no longer supported)
DELETE FROM "games"."players";

-- Drop is_anonymous column
ALTER TABLE "games"."players" DROP COLUMN "is_anonymous";

-- Make password_hash NOT NULL (all accounts now require a password)
ALTER TABLE "games"."players" ALTER COLUMN "password_hash" SET NOT NULL;

-- Add unique constraint on username
CREATE UNIQUE INDEX "players_username_key" ON "games"."players"("username");
