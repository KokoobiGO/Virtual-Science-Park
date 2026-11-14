CREATE TYPE "public"."profile_status" AS ENUM('profiled', 'thin', 'failed');--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "profile_status" "profile_status";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "profile_note" text;