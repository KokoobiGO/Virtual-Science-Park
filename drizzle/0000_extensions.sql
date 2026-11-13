-- pgvector for the 1024-dimension voyage-4 embeddings.
-- Supabase keeps extensions in their own schema, which is on the search path.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
