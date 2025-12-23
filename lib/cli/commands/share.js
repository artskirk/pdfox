/**
 * Share management commands for PDFOX CLI
 */

'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { PATHS } = require('../utils/config');
const { loadShareMetadata, saveShareMetadata, getShareFiles, deleteShare } = require('../utils/data');
const {
    success, error, warn, info, header,
    formatTable, formatJson, formatStatus, formatDate,
    formatRelativeTime, formatSize, truncate, printKeyValue
} = require('../utils/output');
const { isValidShareHash } = require('../utils/security');
const { confirm, confirmDestructive } = require('../utils/prompts');

module.exports = function(program) {
    // share:list - List all shares
    program
        .command('share:list')
        .description('List all document shares')
        .option('--active', 'Show only active shares')
        .option('--expired', 'Show only expired shares')
        .action(async function(options) {
            const metadata = loadShareMetadata();
            const files = getShareFiles();
            const now = Date.now();
            const isJson = program.opts().json;

            // Combine metadata with file info
            const shares = Object.entries(metadata.shares || {}).map(([hash, data]) => {
                const file = files.find(f => f.hash === hash);
                return {
                    hash,
                    ...data,
                    fileExists: !!file,
                    fileSize: file ? file.size : 0
                };
            });

            let filtered = shares;
            if (options.active) {
                filtered = shares.filter(s => s.expiresAt > now);
            } else if (options.expired) {
                filtered = shares.filter(s => s.expiresAt <= now);
            }

            if (isJson) {
                console.log(formatJson(filtered));
                return;
            }

            if (filtered.length === 0) {
                warn('No shares found');
                return;
            }

            const rows = filtered.map(share => [
                truncate(share.hash, 8),
                truncate(share.fileName || 'Unknown', 25),
                share.passwordHash ? chalk.yellow('Yes') : chalk.gray('No'),
                formatStatus(share.expiresAt > now),
                formatSize(share.fileSize),
                formatRelativeTime(share.expiresAt)
            ]);

            console.log(formatTable(
                ['Hash', 'Filename', 'Protected', 'Status', 'Size', 'Expires'],
                rows
            ));

            const active = shares.filter(s => s.expiresAt > now).length;
            const expired = shares.filter(s => s.expiresAt <= now).length;
            const totalSize = shares.reduce((sum, s) => sum + s.fileSize, 0);

            console.log(`\n${chalk.gray('Total:')} ${filtered.length} | ${chalk.green('Active:')} ${active} | ${chalk.red('Expired:')} ${expired} | ${chalk.blue('Size:')} ${formatSize(totalSize)}`);
        });

    // share:info - Show share details
    program
        .command('share:info <hash>')
        .description('Show details for a share')
        .action(async function(hash) {
            const metadata = loadShareMetadata();
            const files = getShareFiles();
            const isJson = program.opts().json;

            // Support partial hash matching
            let matchedHash = hash;
            if (!metadata.shares[hash]) {
                const match = Object.keys(metadata.shares).find(h => h.startsWith(hash));
                if (match) {
                    matchedHash = match;
                }
            }

            const share = metadata.shares[matchedHash];

            if (!share) {
                error(`Share not found: ${hash}`);
                process.exit(1);
            }

            const file = files.find(f => f.hash === matchedHash);
            const now = Date.now();

            const result = {
                hash: matchedHash,
                ...share,
                fileExists: !!file,
                fileSize: file ? file.size : 0,
                filePath: file ? file.path : null
            };

            if (isJson) {
                console.log(formatJson(result));
                return;
            }

            header('Share Details');

            console.log('');
            printKeyValue('Hash', matchedHash);
            printKeyValue('Filename', share.fileName || chalk.gray('Unknown'));
            printKeyValue('Status', formatStatus(share.expiresAt > now));
            printKeyValue('Password Protected', share.passwordHash ? chalk.yellow('Yes') : chalk.gray('No'));
            printKeyValue('Created', formatDate(share.createdAt));
            printKeyValue('Expires', `${formatDate(share.expiresAt)} (${formatRelativeTime(share.expiresAt)})`);

            console.log('');
            printKeyValue('File Exists', file ? chalk.green('Yes') : chalk.red('No'));
            if (file) {
                printKeyValue('File Size', formatSize(file.size));
                printKeyValue('File Path', file.path);
            }

            console.log('');
            printKeyValue('Share URL', chalk.cyan(`/share/${matchedHash}`));
            printKeyValue('Short URL', chalk.cyan(`/s/${matchedHash}`));
            console.log('');
        });

    // share:delete - Delete a share
    program
        .command('share:delete <hash>')
        .description('Delete a share (metadata and file)')
        .action(async function(hash) {
            const metadata = loadShareMetadata();

            // Support partial hash matching
            let matchedHash = hash;
            if (!metadata.shares[hash]) {
                const match = Object.keys(metadata.shares).find(h => h.startsWith(hash));
                if (match) {
                    matchedHash = match;
                }
            }

            const share = metadata.shares[matchedHash];

            if (!share) {
                error(`Share not found: ${hash}`);
                process.exit(1);
            }

            if (!program.opts().force) {
                const confirmed = await confirmDestructive(
                    'Delete share',
                    `${share.fileName} (${truncate(matchedHash, 8)})`
                );
                if (!confirmed) {
                    warn('Operation cancelled');
                    return;
                }
            }

            const result = deleteShare(matchedHash);

            if (result.deletedMetadata || result.deletedFile) {
                success(`Share deleted: ${matchedHash}`);
                if (result.deletedMetadata) info('  Removed metadata entry');
                if (result.deletedFile) info('  Removed PDF file');
            } else {
                warn('No data was deleted');
            }
        });

    // share:clean - Remove expired shares
    program
        .command('share:clean')
        .description('Remove expired shares')
        .option('--dry-run', 'Show what would be deleted without deleting')
        .action(async function(options) {
            const metadata = loadShareMetadata();
            const now = Date.now();

            const expired = Object.entries(metadata.shares || {})
                .filter(([, data]) => data.expiresAt <= now)
                .map(([hash, data]) => ({ hash, ...data }));

            if (expired.length === 0) {
                success('No expired shares to clean');
                return;
            }

            console.log(`Found ${expired.length} expired shares:`);
            expired.forEach(share => {
                console.log(`  ${chalk.gray('-')} ${share.fileName} (${truncate(share.hash, 8)}, expired ${formatRelativeTime(share.expiresAt)})`);
            });

            if (options.dryRun) {
                warn('\nDry run - no changes made');
                return;
            }

            if (!program.opts().force) {
                const confirmed = await confirm(`\nRemove ${expired.length} expired shares?`);
                if (!confirmed) {
                    info('Operation cancelled.');
                    return;
                }
            }

            let deleted = 0;
            for (const share of expired) {
                deleteShare(share.hash);
                deleted++;
            }

            success(`Removed ${deleted} expired shares`);
        });

    // share:orphans - Find orphaned files or metadata
    program
        .command('share:orphans')
        .description('Find orphaned share files or metadata')
        .option('--fix', 'Remove orphaned entries')
        .action(async function(options) {
            const metadata = loadShareMetadata();
            const files = getShareFiles();
            const isJson = program.opts().json;

            const metadataHashes = Object.keys(metadata.shares || {});
            const fileHashes = files.map(f => f.hash);

            // Files without metadata
            const orphanFiles = files.filter(f => !metadataHashes.includes(f.hash));

            // Metadata without files
            const orphanMetadata = metadataHashes.filter(h => !fileHashes.includes(h));

            if (isJson) {
                console.log(formatJson({ orphanFiles, orphanMetadata }));
                return;
            }

            if (orphanFiles.length === 0 && orphanMetadata.length === 0) {
                success('No orphaned data found');
                return;
            }

            if (orphanFiles.length > 0) {
                console.log(chalk.yellow(`\nOrphaned files (${orphanFiles.length}):`));
                orphanFiles.forEach(f => {
                    console.log(`  ${chalk.gray('-')} ${f.fileName} (${formatSize(f.size)})`);
                });
            }

            if (orphanMetadata.length > 0) {
                console.log(chalk.yellow(`\nOrphaned metadata (${orphanMetadata.length}):`));
                orphanMetadata.forEach(hash => {
                    const data = metadata.shares[hash];
                    console.log(`  ${chalk.gray('-')} ${data.fileName} (${truncate(hash, 8)})`);
                });
            }

            if (options.fix) {
                if (!program.opts().force) {
                    const confirmed = await confirm('\nRemove orphaned entries?');
                    if (!confirmed) {
                        info('Operation cancelled.');
                        return;
                    }
                }

                // Remove orphan files
                for (const file of orphanFiles) {
                    fs.unlinkSync(file.path);
                }

                // Remove orphan metadata
                for (const hash of orphanMetadata) {
                    delete metadata.shares[hash];
                }
                saveShareMetadata(metadata);

                success(`Removed ${orphanFiles.length} files and ${orphanMetadata.length} metadata entries`);
            }
        });
};
