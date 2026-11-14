CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_a_id" uuid NOT NULL,
	"company_b_id" uuid NOT NULL,
	"basis" text NOT NULL,
	"shared_on" text[] DEFAULT '{}'::text[] NOT NULL,
	"score" real NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_pair_key" UNIQUE("company_a_id","company_b_id"),
	CONSTRAINT "connections_pair_order" CHECK ("connections"."company_a_id" < "connections"."company_b_id")
);
--> statement-breakpoint
CREATE TABLE "trend_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area" text NOT NULL,
	"week_of" date NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trend_notes_area_week_key" UNIQUE("area","week_of")
);
--> statement-breakpoint
CREATE TABLE "week_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"week_of" date NOT NULL,
	"position" integer NOT NULL,
	"kind" text DEFAULT 'match' NOT NULL,
	"opportunity_id" uuid,
	"trend_note_id" uuid,
	"title" text NOT NULL,
	"why" text NOT NULL,
	"next_step" text NOT NULL,
	"uncertainties" text[] DEFAULT '{}'::text[] NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "week_cards_company_week_position_key" UNIQUE("company_id","week_of","position")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_company_a_id_companies_id_fk" FOREIGN KEY ("company_a_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_company_b_id_companies_id_fk" FOREIGN KEY ("company_b_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_cards" ADD CONSTRAINT "week_cards_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_cards" ADD CONSTRAINT "week_cards_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_cards" ADD CONSTRAINT "week_cards_trend_note_id_trend_notes_id_fk" FOREIGN KEY ("trend_note_id") REFERENCES "public"."trend_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Row-level security for the new tables (same rules as drizzle/0002_rls.sql).
alter table week_cards enable row level security;--> statement-breakpoint
alter table trend_notes enable row level security;--> statement-breakpoint
alter table connections enable row level security;--> statement-breakpoint

-- Your-week cards come from personal matches: the company's own eyes only.
create policy week_cards_own_read on week_cards
  for select to authenticated
  using (company_id = (select app.company_id()));--> statement-breakpoint

-- Trend notes are built from public news and calls.
create policy trend_notes_read on trend_notes
  for select to authenticated using (true);--> statement-breakpoint

-- Suggested connections are for BSP staff. Members never see them.
create policy connections_staff_read on connections
  for select to authenticated using ((select app.is_staff()));
