/**
 * Admin database query functions
 */

import { saveAdminDatabase } from './admin_schema.js';

// ==================== ADMIN ACTIONS ====================

export function logAdminAction(dbObj, adminId, adminUsername, actionType, targetType = null, targetId = null, details = null, ipAddress = null) {
    const { db, dbPath } = dbObj;
    db.run(`
    INSERT INTO admin_actions (admin_id, admin_username, action_type, target_type, target_id, details, timestamp, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [adminId, adminUsername, actionType, targetType, targetId, details, Date.now(), ipAddress]);

    saveAdminDatabase(db, dbPath);
    return { changes: 1 };
}

export function getAdminActions(dbObj, limit = 100, offset = 0) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM admin_actions ORDER BY timestamp DESC LIMIT ? OFFSET ?');
    stmt.bind([limit, offset]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function getAdminActionsByAdmin(dbObj, adminId, limit = 50) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM admin_actions WHERE admin_id = ? ORDER BY timestamp DESC LIMIT ?');
    stmt.bind([adminId, limit]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

// ==================== LICENSE GENERATION HISTORY ====================

export function logLicenseGeneration(dbObj, adminId, adminUsername, licenseType, amount, durationHours) {
    const { db, dbPath } = dbObj;
    db.run(`
    INSERT INTO license_generation_history (admin_id, admin_username, license_type, amount, duration_hours, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [adminId, adminUsername, licenseType, amount, durationHours, Date.now()]);

    saveAdminDatabase(db, dbPath);
    return { changes: 1 };
}

export function getLicenseGenerationHistory(dbObj, limit = 100) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM license_generation_history ORDER BY timestamp DESC LIMIT ?');
    stmt.bind([limit]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function getLicenseGenerationStats(dbObj) {
    const { db } = dbObj;
    const stmt = db.prepare(`
    SELECT 
      license_type,
      COUNT(*) as generation_count,
      SUM(amount) as total_licenses,
      MAX(timestamp) as last_generated
    FROM license_generation_history
    GROUP BY license_type
  `);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

// ==================== API ACCESS LOGS ====================

export function logApiAccess(dbObj, endpoint, method, licenseKey, ipAddress, userAgent, responseStatus, responseTimeMs) {
    const { db, dbPath } = dbObj;
    db.run(`
    INSERT INTO api_access_logs (endpoint, method, license_key, ip_address, user_agent, response_status, response_time_ms, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [endpoint, method, licenseKey, ipAddress, userAgent, responseStatus, responseTimeMs, Date.now()]);

    saveAdminDatabase(db, dbPath);
    return { changes: 1 };
}

export function getApiAccessLogs(dbObj, limit = 100) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM api_access_logs ORDER BY timestamp DESC LIMIT ?');
    stmt.bind([limit]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function getApiAccessByLicense(dbObj, licenseKey, limit = 50) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM api_access_logs WHERE license_key = ? ORDER BY timestamp DESC LIMIT ?');
    stmt.bind([licenseKey, limit]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

// ==================== API KEYS ====================

export function createApiKey(dbObj, key, name, createdBy, permissions = 'read', rateLimit = 100) {
    const { db, dbPath } = dbObj;
    db.run(`
    INSERT INTO api_keys (key, name, created_by, creation_date, permissions, rate_limit)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [key, name, createdBy, Date.now(), permissions, rateLimit]);

    saveAdminDatabase(db, dbPath);
    return { changes: 1 };
}

export function getApiKeyByKey(dbObj, key) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM api_keys WHERE key = ? AND is_active = 1');
    stmt.bind([key]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
}

export function updateApiKeyLastUsed(dbObj, key) {
    const { db, dbPath } = dbObj;
    db.run('UPDATE api_keys SET last_used = ? WHERE key = ?', [Date.now(), key]);
    saveAdminDatabase(db, dbPath);
    return { changes: 1 };
}

export function getAllApiKeys(dbObj) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM api_keys ORDER BY creation_date DESC');
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function revokeApiKey(dbObj, key) {
    const { db, dbPath } = dbObj;
    db.run('UPDATE api_keys SET is_active = 0 WHERE key = ?', [key]);
    saveAdminDatabase(db, dbPath);
    return { changes: 1 };
}

// ==================== SYSTEM STATS ====================

export function updateSystemStat(dbObj, key, value) {
    const { db, dbPath } = dbObj;
    // First try to update
    db.run(`UPDATE system_stats SET stat_value = ?, last_updated = ? WHERE stat_key = ?`,
        [JSON.stringify(value), Date.now(), key]);

    // If no rows affected, insert
    const stmt = db.prepare('SELECT COUNT(*) as count FROM system_stats WHERE stat_key = ?');
    stmt.bind([key]);
    stmt.step();
    const count = stmt.getAsObject().count;
    stmt.free();

    if (count === 0) {
        db.run(`INSERT INTO system_stats (stat_key, stat_value, last_updated) VALUES (?, ?, ?)`,
            [key, JSON.stringify(value), Date.now()]);
    }

    saveAdminDatabase(db, dbPath);
    return { changes: 1 };
}

export function getSystemStat(dbObj, key) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM system_stats WHERE stat_key = ?');
    stmt.bind([key]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (result) {
        result.stat_value = JSON.parse(result.stat_value);
    }
    return result;
}

export function getAllSystemStats(dbObj) {
    const { db } = dbObj;
    const stmt = db.prepare('SELECT * FROM system_stats');
    const results = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        row.stat_value = JSON.parse(row.stat_value);
        results.push(row);
    }
    stmt.free();
    return results;
}
