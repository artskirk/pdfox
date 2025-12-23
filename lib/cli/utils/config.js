/**
 * Configuration utilities for PDFOX CLI
 */

'use strict';

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

const PATHS = {
    root: PROJECT_ROOT,
    env: path.join(PROJECT_ROOT, '.env'),
    data: path.join(PROJECT_ROOT, 'data'),
    proAccess: path.join(PROJECT_ROOT, 'data', 'pro-access.json'),
    shareMetadata: path.join(PROJECT_ROOT, 'data', 'share-metadata.json'),
    shares: path.join(PROJECT_ROOT, 'data', 'shares'),
    uploads: path.join(PROJECT_ROOT, 'uploads'),
    outputs: path.join(PROJECT_ROOT, 'outputs')
};

/**
 * Get current configuration from environment
 */
function getConfig() {
    return {
        APP_ENV: process.env.APP_ENV || 'prod',
        APP_DEBUG: process.env.APP_DEBUG === '1',
        PORT: process.env.PORT || 3000,
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
        STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
        JWT_SECRET: process.env.JWT_SECRET,
        PAYMENT_AMOUNT: parseInt(process.env.PAYMENT_AMOUNT) || 299,
        PRO_PAYMENT_AMOUNT: parseInt(process.env.PRO_PAYMENT_AMOUNT) || 899,
        PAYMENT_CURRENCY: process.env.PAYMENT_CURRENCY || 'eur',
        PRO_ACCESS_DURATION: 24 * 60 * 60 * 1000, // 24 hours in ms
        SHARE_EXPIRY_DURATION: 24 * 60 * 60 * 1000 // 24 hours in ms
    };
}

/**
 * Read .env file as key-value pairs
 */
function readEnvFile() {
    const envPath = PATHS.env;
    if (!fs.existsSync(envPath)) {
        return {};
    }

    const content = fs.readFileSync(envPath, 'utf8');
    const result = {};

    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            result[key] = value;
        }
    });

    return result;
}

/**
 * Update a value in .env file
 */
function updateEnvFile(key, value) {
    const envPath = PATHS.env;
    let content = '';

    if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf8');
    }

    const regex = new RegExp(`^${key}=.*$`, 'm');
    const newLine = `${key}=${value}`;

    if (regex.test(content)) {
        content = content.replace(regex, newLine);
    } else {
        content = content.trim() + '\n' + newLine + '\n';
    }

    fs.writeFileSync(envPath, content);
}

/**
 * Ensure data directories exist
 */
function ensureDataDirectories() {
    [PATHS.data, PATHS.shares, PATHS.uploads, PATHS.outputs].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

module.exports = {
    PATHS,
    getConfig,
    readEnvFile,
    updateEnvFile,
    ensureDataDirectories
};
