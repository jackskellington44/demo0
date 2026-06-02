// Load backend/.env with override so system env vars don't shadow our config.
require('dotenv').config({ path: require('path').resolve(__dirname, '.env'), override: true });

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || null;

if (connectionString) {
  const safe = connectionString.replace(/:([^:@]+)@/, ':***@');
  console.log('[db] Using DATABASE_URL:', safe);
} else {
  console.log('[db] Using discrete PG* env vars — host:', process.env.PGHOST || '127.0.0.1', 'port:', process.env.PGPORT || 5432);
}

const pool = new Pool(
  connectionString
    ? { connectionString, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined }
    : {
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'postgres',
        ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
      }
);

async function query(text, params = []) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  query
};
