/**
 * Cleanup/maintenance commands for PDFOX CLI
 */

'use strict';

const chalk = require('chalk');
const ora = require('ora');
const { PATHS } = require('../utils/config');
const {
    loadProAccess, saveProAccess,
    loadShareMetadata, deleteShare, getShareFiles,
    getDirectoryFiles, getDirectorySize, deleteOldFiles
} = require('../utils/data');
const {
    success, error, warn, info, header,
    formatTable, formatJson, formatSize, formatDate,
    formatRelativeTime, truncate
} = require('../utils/output');
const { confirm } = require('../utils/prompts');

module.exports = function(program) {
    // cleanup:status - Show cleanup preview
    program
        .command('cleanup:status')
        .description('Show what can be cleaned up')
        .action(async function() {
            const isJson = program.opts().json;
            const now = Date.now();

            // Check Pro access
            const proData = loadProAccess();
            const expiredPro = proData.filter(e => e.expiresAt <= now);

            // Check shares
            const shareMetadata = loadShareMetadata();
            const expiredShares = Object.entries(shareMetadata.shares || {})
                .filter(([, data]) => data.expiresAt <= now);

            // Check uploads (older than 24h)
            const uploads = getDirectoryFiles(PATHS.uploads);
            const oldUploads = uploads.filter(f => {
                const age = now - f.modified.getTime();
                return age > 24 * 60 * 60 * 1000;
            });

            // Check outputs (older than 24h)
            const outputs = getDirectoryFiles(PATHS.outputs);
            const oldOutputs = outputs.filter(f => {
                const age = now - f.modified.getTime();
                return age > 24 * 60 * 60 * 1000;
            });

            const result = {
                expiredPro: {
                    count: expiredPro.length,
                    items: expiredPro.map(e => ({ email: e.email, expiresAt: e.expiresAt }))
                },
                expiredShares: {
                    count: expiredShares.length,
                    items: expiredShares.map(([hash, data]) => ({
                        hash: hash.slice(0, 8),
                        fileName: data.fileName,
                        expiresAt: data.expiresAt
                    }))
                },
                oldUploads: {
                    count: oldUploads.length,
                    totalSize: oldUploads.reduce((sum, f) => sum + f.size, 0)
                },
                oldOutputs: {
                    count: oldOutputs.length,
                    totalSize: oldOutputs.reduce((sum, f) => sum + f.size, 0)
                }
            };

            if (isJson) {
                console.log(formatJson(result));
                return;
            }

            header('Cleanup Status');

            console.log('\n' + chalk.bold('Expired Pro Access:'));
            if (expiredPro.length > 0) {
                expiredPro.slice(0, 5).forEach(e => {
                    console.log(`  ${chalk.gray('-')} ${e.email} (expired ${formatRelativeTime(e.expiresAt)})`);
                });
                if (expiredPro.length > 5) {
                    console.log(chalk.gray(`  ... and ${expiredPro.length - 5} more`));
                }
            } else {
                console.log(chalk.gray('  None'));
            }

            console.log('\n' + chalk.bold('Expired Shares:'));
            if (expiredShares.length > 0) {
                expiredShares.slice(0, 5).forEach(([hash, data]) => {
                    console.log(`  ${chalk.gray('-')} ${data.fileName} (${truncate(hash, 8)})`);
                });
                if (expiredShares.length > 5) {
                    console.log(chalk.gray(`  ... and ${expiredShares.length - 5} more`));
                }
            } else {
                console.log(chalk.gray('  None'));
            }

            console.log('\n' + chalk.bold('Old Uploads (>24h):'));
            console.log(`  ${oldUploads.length} files (${formatSize(result.oldUploads.totalSize)})`);

            console.log('\n' + chalk.bold('Old Outputs (>24h):'));
            console.log(`  ${oldOutputs.length} files (${formatSize(result.oldOutputs.totalSize)})`);

            const totalCleanable = expiredPro.length + expiredShares.length + oldUploads.length + oldOutputs.length;
            console.log('\n' + chalk.gray('-'.repeat(40)));
            console.log(`${chalk.bold('Total cleanable items:')} ${totalCleanable}`);

            if (totalCleanable > 0) {
                console.log(chalk.cyan('\nRun "pdfox cleanup:all" to clean all items'));
            }
            console.log('');
        });

    // cleanup:all - Full cleanup
    program
        .command('cleanup:all')
        .description('Clean all expired data and old files')
        .option('--dry-run', 'Show what would be deleted without deleting')
        .action(async function(options) {
            const spinner = ora('Analyzing cleanup targets...').start();
            const now = Date.now();

            // Collect targets
            const proData = loadProAccess();
            const expiredPro = proData.filter(e => e.expiresAt <= now);

            const shareMetadata = loadShareMetadata();
            const expiredShares = Object.entries(shareMetadata.shares || {})
                .filter(([, data]) => data.expiresAt <= now);

            const uploadResult = deleteOldFiles(PATHS.uploads, 24, true); // dry run
            const outputResult = deleteOldFiles(PATHS.outputs, 24, true); // dry run

            spinner.stop();

            const totalItems = expiredPro.length + expiredShares.length +
                uploadResult.deleted.length + outputResult.deleted.length;

            if (totalItems === 0) {
                success('Nothing to clean up');
                return;
            }

            console.log('\nCleanup targets:');
            console.log(`  ${chalk.yellow(expiredPro.length)} expired Pro access entries`);
            console.log(`  ${chalk.yellow(expiredShares.length)} expired shares`);
            console.log(`  ${chalk.yellow(uploadResult.deleted.length)} old upload files`);
            console.log(`  ${chalk.yellow(outputResult.deleted.length)} old output files`);

            if (options.dryRun) {
                warn('\nDry run - no changes made');
                return;
            }

            if (!program.opts().force) {
                const confirmed = await confirm(`\nDelete ${totalItems} items?`);
                if (!confirmed) {
                    info('Operation cancelled.');
                    return;
                }
            }

            const cleanSpinner = ora('Cleaning up...').start();

            // Clean Pro access
            const activePro = proData.filter(e => e.expiresAt > now);
            saveProAccess(activePro);

            // Clean shares
            for (const [hash] of expiredShares) {
                deleteShare(hash);
            }

            // Clean uploads
            deleteOldFiles(PATHS.uploads, 24, false);

            // Clean outputs
            deleteOldFiles(PATHS.outputs, 24, false);

            cleanSpinner.stop();

            success(`Cleanup complete!`);
            console.log(`  ${chalk.green('✓')} ${expiredPro.length} Pro access entries removed`);
            console.log(`  ${chalk.green('✓')} ${expiredShares.length} shares removed`);
            console.log(`  ${chalk.green('✓')} ${uploadResult.deleted.length} upload files removed`);
            console.log(`  ${chalk.green('✓')} ${outputResult.deleted.length} output files removed`);
        });

    // cleanup:uploads - Clean uploads directory
    program
        .command('cleanup:uploads')
        .description('Clean old upload files')
        .option('--older-than <hours>', 'Delete files older than N hours', '24')
        .option('--dry-run', 'Show what would be deleted without deleting')
        .action(async function(options) {
            const hours = parseInt(options.olderThan);
            const result = deleteOldFiles(PATHS.uploads, hours, options.dryRun);

            if (result.deleted.length === 0) {
                success(`No upload files older than ${hours}h found`);
                return;
            }

            console.log(`Found ${result.deleted.length} files older than ${hours}h:`);
            result.deleted.forEach(f => {
                console.log(`  ${chalk.gray('-')} ${f.name} (${formatSize(f.size)})`);
            });

            if (options.dryRun) {
                warn('\nDry run - no changes made');
            } else {
                success(`\nDeleted ${result.deleted.length} files`);
            }
        });

    // cleanup:outputs - Clean outputs directory
    program
        .command('cleanup:outputs')
        .description('Clean old output files')
        .option('--older-than <hours>', 'Delete files older than N hours', '24')
        .option('--dry-run', 'Show what would be deleted without deleting')
        .action(async function(options) {
            const hours = parseInt(options.olderThan);
            const result = deleteOldFiles(PATHS.outputs, hours, options.dryRun);

            if (result.deleted.length === 0) {
                success(`No output files older than ${hours}h found`);
                return;
            }

            console.log(`Found ${result.deleted.length} files older than ${hours}h:`);
            result.deleted.forEach(f => {
                console.log(`  ${chalk.gray('-')} ${f.name} (${formatSize(f.size)})`);
            });

            if (options.dryRun) {
                warn('\nDry run - no changes made');
            } else {
                success(`\nDeleted ${result.deleted.length} files`);
            }
        });
};
