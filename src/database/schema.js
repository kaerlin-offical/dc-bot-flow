import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let SQL;
let db;

/**
 * Initialize and return database connection
 */
export async function initDatabase() {
    const dbPath = process.env.DATABASE_PATH || './data/bot.db';
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
    if (existsSync(dbPath)) {
        const buffer = readFileSync(dbPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    createTables(db);

    // Save database to disk
    saveDatabase(db, dbPath);

    return { db, dbPath };
}

/**
 * Save database to disk
 */
export function saveDatabase(database, path) {
    const data = database.export();
    const buffer = Buffer.from(data);
    writeFileSync(path, buffer);
}

/**
 * Create all necessary database tables
 */
function createTables(db) {
    // Users table
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      license_key TEXT UNIQUE NOT NULL,
      registration_date INTEGER NOT NULL,
      last_download INTEGER DEFAULT 0,
      FOREIGN KEY (license_key) REFERENCES licenses(key)
    )
  `);

    // Licenses table
    db.run(`
    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'unused',
      discord_id TEXT DEFAULT NULL,
      creation_date INTEGER NOT NULL,
      redemption_date INTEGER DEFAULT NULL,
      expiry_date INTEGER DEFAULT NULL,
      created_by TEXT DEFAULT NULL,
      revoked_by TEXT DEFAULT NULL,
      revoke_reason TEXT DEFAULT NULL,
      CHECK (status IN ('unused', 'redeemed', 'revoked'))
    )
  `);

    // Download logs table
    db.run(`
    CREATE TABLE IF NOT EXISTS download_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      username TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      ip_address TEXT DEFAULT NULL
    )
  `);

    // Command logs table
    db.run(`
    CREATE TABLE IF NOT EXISTS command_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      username TEXT NOT NULL,
      command TEXT NOT NULL,
      success INTEGER NOT NULL,
      error_message TEXT DEFAULT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

    // Create indexes for better performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_license_key ON users(license_key)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(key)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_licenses_discord_id ON licenses(discord_id)`);

    console.log('✅ Database tables created successfully');
}

export default initDatabase;
