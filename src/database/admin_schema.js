import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let SQL;

/**
 * Initialize admin-only database
 * Separate from user database for security and data isolation
 */
export async function initAdminDatabase() {
  const dbPath = process.env.ADMIN_DATABASE_PATH || './data/admin.db';
  const dbDir = dirname(dbPath);

  // Create data directory if it doesn't exist
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Initialize SQL.js
  if (!SQL) {
    SQL = await initSqlJs();
  }

  // Load existing database or create new one
  let db;
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  createAdminTables(db);

  // Save database to disk
  saveAdminDatabase(db, dbPath);

  return { db, dbPath };
}

/**
 * Save admin database to disk
 */
export function saveAdminDatabase(database, path) {
  const data = database.export();
  const buffer = Buffer.from(data);
  writeFileSync(path, buffer);
}

/**
 * Create admin database tables
 */
function createAdminTables(db) {
  // Admin actions log
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id TEXT NOT NULL,
      admin_username TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      timestamp INTEGER NOT NULL,
      ip_address TEXT
    )
  `);

  // License generation history
  db.run(`
    CREATE TABLE IF NOT EXISTS license_generation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id TEXT NOT NULL,
      admin_username TEXT NOT NULL,
      license_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      duration_hours INTEGER,
      timestamp INTEGER NOT NULL
    )
  `);

  // API access logs
  db.run(`
    CREATE TABLE IF NOT EXISTS api_access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      license_key TEXT,
      ip_address TEXT,
      user_agent TEXT,
      response_status INTEGER,
      response_time_ms INTEGER,
      timestamp INTEGER NOT NULL
    )
  `);

  // API keys for external applications
  db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL,
      creation_date INTEGER NOT NULL,
      last_used INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      permissions TEXT DEFAULT 'read',
      rate_limit INTEGER DEFAULT 100
    )
  `);

  // System statistics cache
  db.run(`
    CREATE TABLE IF NOT EXISTS system_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stat_key TEXT UNIQUE NOT NULL,
      stat_value TEXT NOT NULL,
      last_updated INTEGER NOT NULL
    )
  `);

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin_actions(admin_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_admin_actions_timestamp ON admin_actions(timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_api_logs_timestamp ON api_access_logs(timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_api_logs_license ON api_access_logs(license_key)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key)`);

  console.log('✅ Admin database tables created successfully');
}

export default initAdminDatabase;
