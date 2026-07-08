CREATE TABLE "poem_embeddings" (
	"poem_id" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"model" text DEFAULT 'BAAI/bge-m3' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "poem_embeddings" ADD CONSTRAINT "poem_embeddings_poem_id_poems_id_fk" FOREIGN KEY ("poem_id") REFERENCES "public"."poems"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "poem_embeddings_embedding_idx" ON "poem_embeddings" USING hnsw ("embedding" vector_cosine_ops);
