CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poem_id" text NOT NULL,
	"type" text NOT NULL,
	"stem" text NOT NULL,
	"options" jsonb,
	"answer" text NOT NULL,
	"explanation" text NOT NULL,
	"evidence_lines" jsonb NOT NULL,
	"difficulty" text NOT NULL,
	"quality_score" real,
	"prompt_version" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_poem_id_poems_id_fk" FOREIGN KEY ("poem_id") REFERENCES "public"."poems"("id") ON DELETE no action ON UPDATE no action;