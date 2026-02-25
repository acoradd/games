-- CreateTable
CREATE TABLE "games"."words" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "length" INTEGER NOT NULL,
    "frequency" DOUBLE PRECISION NOT NULL,
    "isGuessable" BOOLEAN NOT NULL,

    CONSTRAINT "words_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "words_text_key" ON "games"."words"("text");

-- CreateIndex
CREATE INDEX "words_length_isGuessable_frequency_idx" ON "games"."words"("length", "isGuessable", "frequency");
