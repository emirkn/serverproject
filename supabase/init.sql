-- Supabase initialization SQL
-- Creates the customers table used by the app

create table if not exists public.customers (
  id text primary key,
  name text not null,
  address text,
  phone text,
  province text,
  district text,
  phone2 text,
  note text,
  records jsonb default '[]'::jsonb
);
