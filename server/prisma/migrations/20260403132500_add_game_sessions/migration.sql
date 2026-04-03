-- CreateTable
CREATE TABLE "games"."game_sessions" (
    "id" SERIAL NOT NULL,
    "player_id" INTEGER NOT NULL,
    "game_mode_slug" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "played_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "games"."game_sessions" ADD CONSTRAINT "game_sessions_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "games"."players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
