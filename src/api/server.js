import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { getLicenseByKey } from '../database/queries.js';
import { getApiKeyByKey, updateApiKeyLastUsed, logApiAccess } from '../database/admin_queries.js';
import { logger } from '../utils/logger.js';

const API_PORT = parseInt(process.env.API_PORT) || 3000;
const API_ENABLED = process.env.API_ENABLED === 'true';

/**
 * Initialize and start API server
 */
export function startApiServer(userDb, adminDb) {
    if (!API_ENABLED) {
        logger.info('API server is disabled');
        return null;
    }

    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Trust proxy for correct IP addresses
    app.set('trust proxy', 1);

    // Rate limiting
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        message: { error: 'Too many requests, please try again later' }
    });
    app.use(limiter);

    // Request logging middleware
    app.use((req, res, next) => {
        const startTime = Date.now();

        res.on('finish', () => {
            const responseTime = Date.now() - startTime;
            const licenseKey = req.body?.license_key || req.query?.license_key || null;

            logApiAccess(
                adminDb,
                req.path,
                req.method,
                licenseKey,
                req.ip,
                req.get('user-agent'),
                res.statusCode,
                responseTime
            );
        });

        next();
    });

    // API Key authentication middleware
    const authenticateApiKey = (req, res, next) => {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'API key required',
                message: 'Please provide an API key in the X-API-Key header'
            });
        }

        const keyData = getApiKeyByKey(adminDb, apiKey);

        if (!keyData) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key',
                message: 'The provided API key is invalid or has been revoked'
            });
        }

        // Update last used timestamp
        updateApiKeyLastUsed(adminDb, apiKey);

        // Attach key data to request
        req.apiKeyData = keyData;
        next();
    };

    // ==================== ROUTES ====================

    /**
     * Health check endpoint
     */
    app.get('/health', (req, res) => {
        res.json({
            success: true,
            status: 'operational',
            timestamp: Date.now(),
            version: '1.0.0'
        });
    });

    /**
     * Validate license key
     * POST /api/validate
     * Body: { license_key: string }
     */
    app.post('/api/validate', authenticateApiKey, (req, res) => {
        try {
            const { license_key } = req.body;

            if (!license_key) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing license_key',
                    message: 'Please provide a license_key in the request body'
                });
            }

            const license = getLicenseByKey(userDb, license_key);

            if (!license) {
                return res.json({
                    success: true,
                    valid: false,
                    reason: 'License key does not exist'
                });
            }

            // Check if revoked
            if (license.status === 'revoked') {
                return res.json({
                    success: true,
                    valid: false,
                    reason: 'License has been revoked',
                    details: {
                        revoked_by: license.revoked_by,
                        revoke_reason: license.revoke_reason
                    }
                });
            }

            // Check if not redeemed
            if (license.status !== 'redeemed') {
                return res.json({
                    success: true,
                    valid: false,
                    reason: 'License has not been activated yet'
                });
            }

            // Check if expired
            if (license.expiry_date && license.expiry_date < Date.now()) {
                return res.json({
                    success: true,
                    valid: false,
                    reason: 'License has expired',
                    details: {
                        expiry_date: license.expiry_date,
                        expired_at: new Date(license.expiry_date).toISOString()
                    }
                });
            }

            // License is valid
            res.json({
                success: true,
                valid: true,
                license: {
                    key: license.key,
                    status: license.status,
                    discord_id: license.discord_id,
                    redemption_date: license.redemption_date,
                    expiry_date: license.expiry_date,
                    expires_at: license.expiry_date ? new Date(license.expiry_date).toISOString() : null,
                    is_lifetime: !license.expiry_date
                }
            });

        } catch (error) {
            logger.error('API validation error', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'An error occurred while validating the license'
            });
        }
    });

    /**
     * Get license information
     * GET /api/license/:key
     */
    app.get('/api/license/:key', authenticateApiKey, (req, res) => {
        try {
            const { key } = req.params;

            const license = getLicenseByKey(userDb, key);

            if (!license) {
                return res.status(404).json({
                    success: false,
                    error: 'License not found',
                    message: 'The specified license key does not exist'
                });
            }

            // Calculate time remaining if applicable
            let timeRemaining = null;
            if (license.expiry_date) {
                const remaining = license.expiry_date - Date.now();
                timeRemaining = {
                    milliseconds: remaining,
                    hours: Math.floor(remaining / (1000 * 60 * 60)),
                    days: Math.floor(remaining / (1000 * 60 * 60 * 24))
                };
            }

            res.json({
                success: true,
                license: {
                    key: license.key,
                    status: license.status,
                    discord_id: license.discord_id,
                    creation_date: license.creation_date,
                    redemption_date: license.redemption_date,
                    expiry_date: license.expiry_date,
                    created_at: new Date(license.creation_date).toISOString(),
                    redeemed_at: license.redemption_date ? new Date(license.redemption_date).toISOString() : null,
                    expires_at: license.expiry_date ? new Date(license.expiry_date).toISOString() : null,
                    is_lifetime: !license.expiry_date,
                    time_remaining: timeRemaining,
                    is_valid: license.status === 'redeemed' && (!license.expiry_date || license.expiry_date > Date.now())
                }
            });

        } catch (error) {
            logger.error('API license info error', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    /**
     * Batch validate multiple licenses
     * POST /api/validate/batch
     * Body: { license_keys: string[] }
     */
    app.post('/api/validate/batch', authenticateApiKey, (req, res) => {
        try {
            const { license_keys } = req.body;

            if (!Array.isArray(license_keys)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid input',
                    message: 'license_keys must be an array'
                });
            }

            if (license_keys.length > 100) {
                return res.status(400).json({
                    success: false,
                    error: 'Too many keys',
                    message: 'Maximum 100 keys per batch request'
                });
            }

            const results = license_keys.map(key => {
                const license = getLicenseByKey(userDb, key);

                if (!license) {
                    return { key, valid: false, reason: 'Does not exist' };
                }

                if (license.status === 'revoked') {
                    return { key, valid: false, reason: 'Revoked' };
                }

                if (license.status !== 'redeemed') {
                    return { key, valid: false, reason: 'Not activated' };
                }

                if (license.expiry_date && license.expiry_date < Date.now()) {
                    return { key, valid: false, reason: 'Expired' };
                }

                return { key, valid: true };
            });

            res.json({
                success: true,
                total: license_keys.length,
                valid_count: results.filter(r => r.valid).length,
                invalid_count: results.filter(r => !r.valid).length,
                results
            });

        } catch (error) {
            logger.error('API batch validation error', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    /**
     * 404 handler
     */
    app.use((req, res) => {
        res.status(404).json({
            success: false,
            error: 'Endpoint not found',
            message: `The endpoint ${req.method} ${req.path} does not exist`
        });
    });

    // Start server
    const server = app.listen(API_PORT, () => {
        logger.success(`API server running on port ${API_PORT}`);
        logger.info('Available endpoints:');
        logger.info('  GET  /health - Health check');
        logger.info('  POST /api/validate - Validate single license');
        logger.info('  GET  /api/license/:key - Get license info');
        logger.info('  POST /api/validate/batch - Validate multiple licenses');
    });

    return server;
}

export default startApiServer;
