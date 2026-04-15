-- AddColumn display_name: defaults to username for existing rows, then adds UNIQUE constraint
ALTER TABLE "games"."players" ADD COLUMN "display_name" TEXT;
UPDATE "games"."players" SET "display_name" = "username" WHERE "display_name" IS NULL;
ALTER TABLE "games"."players" ALTER COLUMN "display_name" SET NOT NULL;
ALTER TABLE "games"."players" ADD CONSTRAINT "players_display_name_key" UNIQUE ("display_name");
