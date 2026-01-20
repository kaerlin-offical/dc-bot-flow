import { mkdirSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

const LOG_DIR = './logs';

// Create logs directory if it doesn't exist
if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Get current timestamp in readable format
 */
function getTimestamp() {
    return new Date().toISOString();
}

/**
 * Get log file path for current date
 */
function getLogFilePath() {
    const date = new Date().toISOString().split('T')[0];
    return join(LOG_DIR, `${date}.log`);
}

/**
 * Write log to file and console
 */
function writeLog(level, message, data = null) {
    const timestamp = getTimestamp();
    const logEntry = {
        timestamp,
        level,
        message,
        ...(data && { data })
    };

    const logString = JSON.stringify(logEntry);
    const consoleString = `[${timestamp}] [${level}] ${message}`;

    // Console output with colors
    const colors = {
        INFO: '\x1b[36m',    // Cyan
        SUCCESS: '\x1b[32m', // Green
        WARNING: '\x1b[33m', // Yellow
        ERROR: '\x1b[31m',   // Red
        DEBUG: '\x1b[90m'    // Gray
    };
    const reset = '\x1b[0m';

    console.log(`${colors[level] || ''}${consoleString}${reset}`);

    // File output
    try {
        appendFileSync(getLogFilePath(), logString + '\n');
    } catch (error) {
        console.error('Failed to write to log file:', error);
    }
}

/**
 * Logger object with different log levels
 */
export const logger = {
    info: (message, data) => writeLog('INFO', message, data),
    success: (message, data) => writeLog('SUCCESS', message, data),
    warning: (message, data) => writeLog('WARNING', message, data),
    error: (message, data) => writeLog('ERROR', message, data),
    debug: (message, data) => writeLog('DEBUG', message, data),

    /**
     * Log command execution
     */
    command: (userId, username, command, success, error = null) => {
        writeLog('INFO', `Command executed: /${command}`, {
            userId,
            username,
            success,
            ...(error && { error })
        });
    },

    /**
     * Log download request
     */
    download: (userId, username) => {
        writeLog('INFO', 'Download requested', {
            userId,
            username
        });
    },

    /**
     * Log license creation
     */
    licenseCreated: (key, createdBy) => {
        writeLog('INFO', 'License created', {
            key,
            createdBy
        });
    },

    /**
     * Log license redemption
     */
    licenseRedeemed: (key, userId) => {
        writeLog('INFO', 'License redeemed', {
            key,
            userId
        });
    },

    /**
     * Log user registration
     */
    userRegistered: (userId, username) => {
        writeLog('SUCCESS', 'User registered', {
            userId,
            username
        });
    }
};

export default logger;
