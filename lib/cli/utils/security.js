/**
 * Security utilities for PDFOX CLI
 */

'use strict';

const crypto = require('crypto');

/**
 * Mask sensitive values for display
 */
function maskSecret(value, showChars = 4) {
    if (!value) return chalk.gray('(not set)');
    if (typeof value !== 'string') return '****';
    if (value.length <= showChars * 2) return '****';
    return value.slice(0, showChars) + '****' + value.slice(-showChars);
}

// Import chalk for maskSecret
const chalk = require('chalk');

/**
 * Hash token (matching server.js implementation)
 */
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Hash password (matching server.js implementation)
 */
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Generate random hex string
 */
function generateRandomHex(length = 32) {
    return crypto.randomBytes(length / 2).toString('hex');
}

/**
 * Validate email format
 */
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validate share hash format (32 hex characters)
 */
function isValidShareHash(hash) {
    if (!hash || typeof hash !== 'string') return false;
    return /^[a-f0-9]{32}$/.test(hash);
}

/**
 * Validate Stripe session ID format
 */
function isValidStripeSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return false;
    return /^cs_[a-zA-Z0-9_]+$/.test(sessionId) && sessionId.length <= 200;
}

/**
 * Validate fingerprint format
 */
function isValidFingerprint(fp) {
    if (!fp || typeof fp !== 'string') return false;
    return /^[a-zA-Z0-9_-]+$/.test(fp) && fp.length <= 64;
}

/**
 * Validate UUID format
 */
function isValidUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

/**
 * Sanitize filename (prevent path traversal)
 */
function sanitizeFilename(filename) {
    if (!filename) return '';
    return filename
        .replace(/\.\./g, '')
        .replace(/[/\\]/g, '')
        .replace(/[<>:"|?*]/g, '')
        .trim();
}

module.exports = {
    maskSecret,
    hashToken,
    hashPassword,
    generateRandomHex,
    isValidEmail,
    isValidShareHash,
    isValidStripeSessionId,
    isValidFingerprint,
    isValidUUID,
    sanitizeFilename
};
