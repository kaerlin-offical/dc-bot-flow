/**
 * Database query functions
 * All database operations are centralized here for maintainability
 */

import { saveDatabase } from './schema.js';

// ==================== USER QUERIES ====================

export function createUser(dbObj, discordId, username, passwordHash, licenseKey) {
    const { db, dbPath } = dbObj;
    db.run(`
    INSERT INTO users (discord_id, username, password_hash, license_key, registration_date)
    VALUES (?, ?, ?, ?, ?)
  `, [discordId, username, passwordHash, licenseKey, Date.now()]);

    saveDatabase(db, dbPath);
    return { changes: 1 };
}

export function getUserByDiscordId(dbObj, discordId) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM users WHERE discord_id = ?');
    stmt.bind([discordId]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
}

export function getUserByUsername(dbObj, username) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    stmt.bind([username]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
}

export function getUserByLicenseKey(dbObj, licenseKey) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM users WHERE license_key = ?');
    stmt.bind([licenseKey]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
}

export function getAllUsers(dbObj) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM users ORDER BY registration_date DESC');
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function updateUserLastDownload(dbObj, discordId, timestamp) {
    const { db, dbPath } = dbObj;
    db.run('UPDATE users SET last_download = ? WHERE discord_id = ?', [timestamp, discordId]);
    saveDatabase(db, dbPath);
    return { changes: 1 };
}

// ==================== LICENSE QUERIES ====================

export function createLicense(dbObj, key, createdBy, expiryDate = null) {
    const { db, dbPath } = dbObj;
    db.run(`
    INSERT INTO licenses (key, status, creation_date, created_by, expiry_date)
    VALUES (?, 'unused', ?, ?, ?)
  `, [key, Date.now(), createdBy, expiryDate]);

    saveDatabase(db, dbPath);
    return { changes: 1 };
}

export function getLicenseByKey(dbObj, key) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM licenses WHERE key = ?');
    stmt.bind([key]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
}

export function redeemLicense(dbObj, key, discordId) {
    const { db, dbPath } = dbObj;
    db.run(`
    UPDATE licenses 
    SET status = 'redeemed', discord_id = ?, redemption_date = ?
    WHERE key = ? AND status = 'unused'
  `, [discordId, Date.now(), key]);

    saveDatabase(db, dbPath);
    return { changes: 1 };
}

export function revokeLicense(dbObj, key, revokedBy, reason = null) {
    const { db, dbPath } = dbObj;
    db.run(`
    UPDATE licenses 
    SET status = 'revoked', revoked_by = ?, revoke_reason = ?
    WHERE key = ?
  `, [revokedBy, reason, key]);

    saveDatabase(db, dbPath);
    return { changes: 1 };
}

export function getAllLicenses(dbObj) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM licenses ORDER BY creation_date DESC');
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function getLicensesByStatus(dbObj, status) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM licenses WHERE status = ? ORDER BY creation_date DESC');
    stmt.bind([status]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function getLicensesByDiscordId(dbObj, discordId) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM licenses WHERE discord_id = ?');
    stmt.bind([discordId]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

// ==================== LOG QUERIES ====================

export function logDownload(dbObj, discordId, username, ipAddress = null) {
    const { db, dbPath } = dbObj;
    db.run(`
    INSERT INTO download_logs (discord_id, username, timestamp, ip_address)
    VALUES (?, ?, ?, ?)
  `, [discordId, username, Date.now(), ipAddress]);

    saveDatabase(db, dbPath);
    return { changes: 1 };
}

export function logCommand(dbObj, discordId, username, command, success, errorMessage = null) {
    const { db, dbPath } = dbObj;
    db.run(`
    INSERT INTO command_logs (discord_id, username, command, success, error_message, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [discordId, username, command, success ? 1 : 0, errorMessage, Date.now()]);

    saveDatabase(db, dbPath);
    return { changes: 1 };
}

export function getRecentDownloads(dbObj, limit = 50) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM download_logs ORDER BY timestamp DESC LIMIT ?');
    stmt.bind([limit]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function getRecentCommands(dbObj, limit = 100) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM command_logs ORDER BY timestamp DESC LIMIT ?');
    stmt.bind([limit]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function getUserDownloadHistory(dbObj, discordId) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM download_logs WHERE discord_id = ? ORDER BY timestamp DESC');
    stmt.bind([discordId]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}
