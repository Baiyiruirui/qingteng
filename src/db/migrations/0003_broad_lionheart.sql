CREATE TABLE "immersion_scripts" (
	"poem_id" text PRIMARY KEY NOT NULL,
	"difficulty" text NOT NULL,
	"role" text NOT NULL,
	"scene" text NOT NULL,
	"teaching_goals" jsonb NOT NULL,
	"opening_move" text NOT NULL,
	"key_beats" jsonb NOT NULL,
	"exit_condition" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "immersion_scripts" ADD CONSTRAINT "immersion_scripts_poem_id_poems_id_fk" FOREIGN KEY ("poem_id") REFERENCES "public"."poems"("id") ON DELETE no action ON UPDATE no action;