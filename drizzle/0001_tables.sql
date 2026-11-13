CREATE TYPE "public"."brief_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."claim_author" AS ENUM('profiler', 'user');--> statement-breakpoint
CREATE TYPE "public"."claim_review_state" AS ENUM('active', 'suggested', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('stated', 'inferred', 'missing', 'user_confirmed', 'user_corrected');--> statement-breakpoint
CREATE TYPE "public"."eligibility" AS ENUM('potential_match');--> statement-breakpoint
CREATE TYPE "public"."feedback_kind" AS ENUM('useful', 'not_relevant');--> statement-breakpoint
CREATE TYPE "public"."handoff_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."match_mode" AS ENUM('personal', 'public');--> statement-breakpoint
CREATE TYPE "public"."opportunity_format" AS ENUM('online', 'in_person', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."opportunity_kind" AS ENUM('funding', 'testbed', 'event', 'news');--> statement-breakpoint
CREATE TYPE "public"."profile_field" AS ENUM('summary', 'offerings', 'technologies', 'applicationAreas', 'markets', 'geography', 'statedPriorities', 'inferredInterests');--> statement-breakpoint
CREATE TYPE "public"."quote_lang" AS ENUM('sv', 'en', 'other');--> statement-breakpoint
CREATE TYPE "public"."scope_label" AS ENUM('in_scope', 'unclear', 'out_of_scope', 'override_attempt');--> statement-breakpoint
CREATE TYPE "public"."source_state" AS ENUM('live', 'cached', 'simulated');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"question" text NOT NULL,
	"status" "brief_status" DEFAULT 'running' NOT NULL,
	"brief" jsonb,
	"search_count" integer DEFAULT 0 NOT NULL,
	"prerun" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" text NOT NULL,
	"scope_label" "scope_label",
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"field" "profile_field" NOT NULL,
	"value" jsonb,
	"status" "claim_status" NOT NULL,
	"confidence" real NOT NULL,
	"updated_by" "claim_author" NOT NULL,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"review_state" "claim_review_state" DEFAULT 'active' NOT NULL,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_confidence_range" CHECK ("claims"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"website_missing" boolean DEFAULT false NOT NULL,
	"member_page" text NOT NULL,
	"bsp_description" text,
	"industry" text,
	"employees" text,
	"founded_year" integer,
	"town" text,
	"is_gold" boolean DEFAULT false NOT NULL,
	"public_embedding" vector(1024),
	"last_profiled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "company_private" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"user_priorities" text[] DEFAULT '{}'::text[] NOT NULL,
	"personal_embedding" vector(1024),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"git_sha" text,
	"summary" jsonb NOT NULL,
	"details" jsonb,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"url" text NOT NULL,
	"quote" text NOT NULL,
	"quote_lang" "quote_lang" NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"quote_checked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"kind" "feedback_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_company_opportunity_user_key" UNIQUE("company_id","opportunity_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"message" text NOT NULL,
	"contact_route" text NOT NULL,
	"status" "handoff_status" DEFAULT 'open' NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"trigger" text,
	"status" "job_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(10, 4),
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"mode" "match_mode" NOT NULL,
	"score" real NOT NULL,
	"score_breakdown" jsonb NOT NULL,
	"matched_on" text[] DEFAULT '{}'::text[] NOT NULL,
	"rank" integer,
	"why" text,
	"next_step" text,
	"uncertainties" text[] DEFAULT '{}'::text[] NOT NULL,
	"eligibility" "eligibility" DEFAULT 'potential_match' NOT NULL,
	"rejected" boolean DEFAULT false NOT NULL,
	"rejection_reason" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"judged_at" timestamp with time zone,
	CONSTRAINT "matches_company_opportunity_mode_key" UNIQUE("company_id","opportunity_id","mode"),
	CONSTRAINT "matches_score_range" CHECK ("matches"."score" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "opportunity_kind" NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"published_at" timestamp with time zone,
	"opens_at" timestamp with time zone,
	"deadline" timestamp with time zone,
	"event_date" timestamp with time zone,
	"format" "opportunity_format",
	"audience" text,
	"eligibility_text" text,
	"contact" text,
	"verified" boolean,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"embedding" vector(1024),
	"snapshot_id" uuid,
	"retrieved_at" timestamp with time zone NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_source_external_id_key" UNIQUE("source","external_id")
);
--> statement-breakpoint
CREATE TABLE "saved_items" (
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_items_company_id_opportunity_id_pk" PRIMARY KEY("company_id","opportunity_id")
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"content_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"lang" "quote_lang",
	"http_status" integer,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_status" (
	"source" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"state" "source_state" NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"cached_at" timestamp with time zone,
	"item_count" integer,
	"message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_supersedes_id_claims_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_private" ADD CONSTRAINT "company_private_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "briefs_company_created_idx" ON "briefs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "chats_company_thread_idx" ON "chats" USING btree ("company_id","thread_id","created_at");--> statement-breakpoint
CREATE INDEX "claims_company_field_idx" ON "claims" USING btree ("company_id","field");--> statement-breakpoint
CREATE INDEX "eval_runs_kind_ran_idx" ON "eval_runs" USING btree ("kind","ran_at");--> statement-breakpoint
CREATE INDEX "evidence_claim_idx" ON "evidence" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "job_runs_job_started_idx" ON "job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "matches_company_mode_rank_idx" ON "matches" USING btree ("company_id","mode","rank");--> statement-breakpoint
CREATE INDEX "opportunities_deadline_idx" ON "opportunities" USING btree ("deadline");--> statement-breakpoint
CREATE INDEX "opportunities_embedding_hnsw_idx" ON "opportunities" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "snapshots_url_retrieved_idx" ON "snapshots" USING btree ("url","retrieved_at");