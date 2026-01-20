import bcrypt from 'bcrypt';
import { nanoid, customAlphabet } from 'nanoid';

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

/**
 * License tier definitions
 */
export const LICENSE_TIERS = {
    '12H': { name: '12 Hours', hours: 12, code: '12H' },
    '24H': { name: '24 Hours', hours: 24, code: '24H' },
    '7D': { name: '7 Days', hours: 168, code: '7D' },
    '1M': { name: '1 Month', hours: 720, code: '1M' },
    'QUARTERLY': { name: 'Quarterly (3 Months)', hours: 2160, code: 'QUARTERLY' },
    'LIFETIME': { name: 'Lifetime', hours: null, code: 'LIFETIME' }
};

/**
 * Calculate expiry timestamp from license tier
 */
export function calculateExpiryFromTier(tier) {
    const tierInfo = LICENSE_TIERS[tier];
    if (!tierInfo || !tierInfo.hours) {
        return null; // Lifetime
    }
    return Date.now() + (tierInfo.hours * 60 * 60 * 1000);
}

/**
 * Get license tier from hours
 */
export function getTierFromHours(hours) {
    if (!hours) return 'LIFETIME';

    for (const [key, value] of Object.entries(LICENSE_TIERS)) {
        if (value.hours === hours) {
            return key;
        }
    }
    return 'CUSTOM';
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password) {
    return await bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

/**
 * Generate a secure license key
 * Format: XXXX-XXXX-XXXX-XXXX (16 characters, alphanumeric uppercase)
 */
export function generateLicenseKey() {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nanoidCustom = customAlphabet(alphabet, 4);

    const parts = [
        nanoidCustom(),
        nanoidCustom(),
        nanoidCustom(),
        nanoidCustom()
    ];

    return parts.join('-');
}

/**
 * Validate license key format
 */
export function isValidLicenseKeyFormat(key) {
    // Format: XXXX-XXXX-XXXX-XXXX
    const pattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    return pattern.test(key);
}

/**
 * Validate username format
 * - 3-20 characters
 * - Alphanumeric and underscores only
 */
export function isValidUsername(username) {
    const pattern = /^[a-zA-Z0-9_]{3,20}$/;
    return pattern.test(username);
}

/**
 * Validate password strength
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 */
export function isValidPassword(password) {
    if (password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    return true;
}

/**
 * Check if user is admin
 */
export function isAdmin(userId) {
    const adminIds = process.env.ADMIN_IDS?.split(',').map(id => id.trim()) || [];
    return adminIds.includes(userId);
}

/**
 * Sanitize input to prevent injection attacks
 */
export function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>]/g, '');
}
