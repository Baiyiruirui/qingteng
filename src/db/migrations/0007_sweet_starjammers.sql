CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"poem_id" text NOT NULL,
	"session_id" text NOT NULL,
	"user_answer" text NOT NULL,
	"is_correct" boolean,
	"hit_points" jsonb,
	"missed_points" jsonb,
	"feedback" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wrong_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"poem_id" text NOT NULL,
	"wrong_count" integer DEFAULT 1 NOT NULL,
	"last_wrong_at" timestamp DEFAULT now(),
	"resolved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD COLUMN "scoring_points" jsonb;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_question_id_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wrong_questions" ADD CONSTRAINT "wrong_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wrong_questions" ADD CONSTRAINT "wrong_questions_question_id_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wrong_questions_user_question_idx" ON "wrong_questions" USING btree ("user_id","question_id");