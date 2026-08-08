const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const sqlPath = path.join(__dirname, '..', 'supabase', 'init.sql');
if (!fs.existsSync(sqlPath)) {
  console.error('supabase init.sql not found at', sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');

const conn = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!conn) {
  console.error('No SUPABASE_DB_URL or DATABASE_URL found in env. Set the Postgres connection string.');
  console.error('Example (locally): export SUPABASE_DB_URL="postgres://user:pass@host:5432/dbname"');
  process.exit(1);
}

(async () => {
  const client = new Client({ connectionString: conn });
  try {
    await client.connect();
    console.log('Connected to Postgres, running migration...');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration applied successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message || err);
    try { await client.query('ROLLBACK'); } catch (_) {}
    process.exit(1);
  } finally {
    await client.end();
  }
})();
