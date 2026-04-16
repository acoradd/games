-- DropForeignKey
ALTER TABLE "games"."game_sessions" DROP CONSTRAINT "game_sessions_player_id_fkey";

-- AlterTable
ALTER TABLE "games"."game_sessions" ALTER COLUMN "game_id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "games"."game_sessions" ADD CONSTRAINT "game_sessions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "games"."players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
