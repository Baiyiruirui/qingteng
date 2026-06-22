CREATE TABLE "quiz_blueprints" (
	"poem_id" text PRIMARY KEY NOT NULL,
	"points" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD COLUMN "version" text DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD COLUMN "point_type" text;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD COLUMN "point_id" text;--> statement-breakpoint
ALTER TABLE "quiz_blueprints" ADD CONSTRAINT "quiz_blueprints_poem_id_poems_id_fk" FOREIGN KEY ("poem_id") REFERENCES "public"."poems"("id") ON DELETE no action ON UPDATE no action;