/**
 * Data file operations for PDFOX CLI
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PATHS, ensureDataDirectories } = require('./config');

/**
 * Load Pro access data
 */
function loadProAccess() {
    ensureDataDirectories();

    try {
        if (fs.existsSync(PATHS.proAccess)) {
            const content = fs.readFileSync(PATHS.proAccess, 'utf8');
            return JSON.parse(content);
        }
    } catch (err) {
        console.error('Error loading pro-access.json:', err.message);
    }
    return [];
}

/**
 * Save Pro access data
 */
function saveProAccess(data) {
    ensureDataDirectories();
    fs.writeFileSync(PATHS.proAccess, JSON.stringify(data, null, 2));
}

/**
 * Load share metadata
 */
function loadShareMetadata() {
    ensureDataDirectories();

    try {
        if (fs.existsSync(PATHS.shareMetadata)) {
            const content = fs.readFileSync(PATHS.shareMetadata, 'utf8');
            return JSON.parse(content);
        }
    } catch (err) {
        console.error('Error loading share-metadata.json:', err.message);
    }
    return { shares: {} };
}

/**
 * Save share metadata
 */
function saveShareMetadata(data) {
    ensureDataDirectories();
    fs.writeFileSync(PATHS.shareMetadata, JSON.stringify(data, null, 2));
}

/**
 * Get list of share PDF files
 */
function getShareFiles() {
    ensureDataDirectories();

    if (!fs.existsSync(PATHS.shares)) {
        return [];
    }

    return fs.readdirSync(PATHS.shares)
        .filter(f => f.endsWith('.pdf'))
        .map(f => {
            const filePath = path.join(PATHS.shares, f);
            const stats = fs.statSync(filePath);
            return {
                hash: f.replace('.pdf', ''),
                fileName: f,
                path: filePath,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime
            };
        });
}

/**
 * Delete a share (metadata + file)
 */
function deleteShare(hash) {
    const metadata = loadShareMetadata();
    const filePath = path.join(PATHS.shares, hash + '.pdf');

    let deletedMetadata = false;
    let deletedFile = false;

    if (metadata.shares[hash]) {
        delete metadata.shares[hash];
        saveShareMetadata(metadata);
        deletedMetadata = true;
    }

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deletedFile = true;
    }

    return { deletedMetadata, deletedFile };
}

/**
 * Get files from a directory with stats
 */
function getDirectoryFiles(dirPath) {
    if (!fs.existsSync(dirPath)) {
        return [];
    }

    return fs.readdirSync(dirPath)
        .filter(f => !f.startsWith('.'))
        .map(f => {
            const filePath = path.join(dirPath, f);
            try {
                const stats = fs.statSync(filePath);
                return {
                    name: f,
                    path: filePath,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime,
                    isDirectory: stats.isDirectory()
                };
            } catch (err) {
                return null;
            }
        })
        .filter(f => f !== null);
}

/**
 * Get directory size recursively
 */
function getDirectorySize(dirPath) {
    if (!fs.existsSync(dirPath)) {
        return 0;
    }

    let size = 0;
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
            size += getDirectorySize(filePath);
        } else {
            size += stats.size;
        }
    }

    return size;
}

/**
 * Delete files older than specified hours
 */
function deleteOldFiles(dirPath, maxAgeHours, dryRun = false) {
    if (!fs.existsSync(dirPath)) {
        return { deleted: [], errors: [] };
    }

    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const now = Date.now();
    const deleted = [];
    const errors = [];

    const files = getDirectoryFiles(dirPath);

    for (const file of files) {
        if (file.isDirectory) continue;

        const age = now - file.modified.getTime();
        if (age > maxAgeMs) {
            if (!dryRun) {
                try {
                    fs.unlinkSync(file.path);
                    deleted.push(file);
                } catch (err) {
                    errors.push({ file, error: err.message });
                }
            } else {
                deleted.push(file);
            }
        }
    }

    return { deleted, errors };
}

module.exports = {
    loadProAccess,
    saveProAccess,
    loadShareMetadata,
    saveShareMetadata,
    getShareFiles,
    deleteShare,
    getDirectoryFiles,
    getDirectorySize,
    deleteOldFiles
};
