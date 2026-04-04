ALTER TABLE "Room"
ADD COLUMN "game_type" TEXT,
ADD COLUMN "game_status" TEXT,
ADD COLUMN "game_state" JSONB,
ADD COLUMN "game_turn_user_id" TEXT,
ADD COLUMN "game_winner_user_id" TEXT,
ADD COLUMN "game_updated_at" TIMESTAMP(3);
