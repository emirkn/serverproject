# Supabase setup and migration

This repository now includes a SQL migration to create the `customers` table used by the app.

Files added:
- `supabase/init.sql` — SQL to create the `customers` table.
- `scripts/run_migration.js` — helper that prints instructions and the SQL.

How to create the table (recommended):

1) In Supabase Console
- Go to https://app.supabase.com and open your project.
- Open **SQL Editor** → **New query**.
- Open `supabase/init.sql` in this repo and paste its contents into the SQL editor.
- Run the query.

2) Or run locally using `psql` if you have a Postgres connection string

- Get the Postgres connection string from Supabase Project → Settings → Database → Connection string.
- Run locally (example):

  ```bash
  export SUPABASE_DB_URL="postgres://user:pass@host:5432/dbname"
  psql "$SUPABASE_DB_URL" -f supabase/init.sql
  ```

3) Optional: run `node scripts/run_migration.js` to print the SQL and guidance.

After creating the table, set the following environment variables on Render (or your host):

- `SUPABASE_URL` = your Supabase Project URL (e.g. https://xyz.supabase.co)
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase Service Role Key (keep secret)
- `BACKUP_TOKEN` = (optional) random token for admin export endpoints

Notes
- The app uses the `customers` table with a `records jsonb` column (default `[]`).
- Do NOT share your `SUPABASE_SERVICE_ROLE_KEY` publicly.

Temporary .env added
- Per your request I added a temporary `.env` file at the repository root containing the `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` you supplied. This is intended as a short-term convenience only — replace or remove these values before sharing the repo or pushing to a public remote.

