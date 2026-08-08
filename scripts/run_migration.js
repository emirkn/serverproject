const fs = require('fs');
const path = require('path');

const sqlPath = path.join(__dirname, '..', 'supabase', 'init.sql');
if (!fs.existsSync(sqlPath)) {
  console.error('supabase init.sql not found at', sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');

console.log('\n=== Supabase Migration Helper ===\n');

if (process.env.SUPABASE_DB_URL) {
  console.log('Found SUPABASE_DB_URL in env. You can run the following command locally to apply the migration:\n');
  console.log('psql "$SUPABASE_DB_URL" -f supabase/init.sql\n');
  console.log('Or install the node postgres client and run this script with a small edit to execute it programmatically.');
  process.exit(0);
}

console.log('No SUPABASE_DB_URL provided. To create the table in your Supabase project, do one of the following:');
console.log('\nOption A — Supabase SQL editor (recommended)');
console.log('1) Open your project at https://app.supabase.com');
console.log('2) Go to SQL Editor → New query');
console.log('3) Paste the contents of supabase/init.sql and run it.');

console.log('\nOption B — Run locally via psql using a Postgres connection string');
console.log('1) Obtain a Postgres connection string from Supabase Project → Settings → Database → Connection string');
console.log('2) Export it as SUPABASE_DB_URL and run:');
console.log('   psql "$SUPABASE_DB_URL" -f supabase/init.sql');

console.log('\n--- SQL to run (preview) ---\n');
console.log(sql);
