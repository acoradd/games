ALTER TABLE "games"."game_sessions" ADD COLUMN "game_id" TEXT NOT NULL DEFAULT '';
CREATE INDEX "game_sessions_game_id_idx" ON "games"."game_sessions"("game_id");
