/**
 * Statistics commands for PDFOX CLI
 */

'use strict';

const chalk = require('chalk');
const { PATHS, getConfig } = require('../utils/config');
const {
    loadProAccess, loadShareMetadata, getShareFiles,
    getDirectoryFiles, getDirectorySize
} = require('../utils/data');
const {
    success, error, warn, info, header, divider,
    formatTable, formatJson, formatSize, formatDate,
    formatCurrency, printKeyValue
} = require('../utils/output');

module.exports = function(program) {
    // stats - Show usage dashboard
    program
        .command('stats')
        .description('Show usage statistics dashboard')
        .action(async function() {
            const isJson = program.opts().json;
            const now = Date.now();
            const config = getConfig();

            // Pro access stats
            const proData = loadProAccess();
            const activePro = proData.filter(e => e.expiresAt > now && !e.isRevoked);
            const expiredPro = proData.filter(e => e.expiresAt <= now);
            const revokedPro = proData.filter(e => e.isRevoked);

            // Share stats
            const shareMetadata = loadShareMetadata();
            const shares = Object.entries(shareMetadata.shares || {});
            const activeShares = shares.filter(([, d]) => d.expiresAt > now);
            const expiredShares = shares.filter(([, d]) => d.expiresAt <= now);
            const protectedShares = shares.filter(([, d]) => d.passwordHash);

            // Storage stats
            const shareFiles = getShareFiles();
            const uploadFiles = getDirectoryFiles(PATHS.uploads);
            const outputFiles = getDirectoryFiles(PATHS.outputs);

            const shareDirSize = getDirectorySize(PATHS.shares);
            const uploadDirSize = getDirectorySize(PATHS.uploads);
            const outputDirSize = getDirectorySize(PATHS.outputs);
            const totalStorage = shareDirSize + uploadDirSize + outputDirSize;

            const result = {
                environment: {
                    mode: config.APP_ENV,
                    debug: config.APP_DEBUG
                },
                proAccess: {
                    total: proData.length,
                    active: activePro.length,
                    expired: expiredPro.length,
                    revoked: revokedPro.length
                },
                shares: {
                    total: shares.length,
                    active: activeShares.length,
                    expired: expiredShares.length,
                    protected: protectedShares.length
                },
                storage: {
                    shares: { files: shareFiles.length, bytes: shareDirSize },
                    uploads: { files: uploadFiles.length, bytes: uploadDirSize },
                    outputs: { files: outputFiles.length, bytes: outputDirSize },
                    total: { bytes: totalStorage }
                }
            };

            if (isJson) {
                console.log(formatJson(result));
                return;
            }

            // ASCII Dashboard
            console.log('');
            console.log(chalk.cyan.bold('  ╔═══════════════════════════════════════════════════╗'));
            console.log(chalk.cyan.bold('  ║           PDFOX Admin Dashboard                  ║'));
            console.log(chalk.cyan.bold('  ╚═══════════════════════════════════════════════════╝'));
            console.log('');

            // Environment
            console.log(chalk.bold('  Environment'));
            console.log(chalk.gray('  ─────────────────────────────────────────────────────'));
            console.log(`    Mode: ${config.APP_ENV === 'prod' ? chalk.green('Production') : chalk.yellow('Development')}    Debug: ${config.APP_DEBUG ? chalk.yellow('ON') : chalk.green('OFF')}`);
            console.log('');

            // Pro Access
            console.log(chalk.bold('  Pro Access'));
            console.log(chalk.gray('  ─────────────────────────────────────────────────────'));
            console.log(`    ${chalk.green('●')} Active: ${chalk.bold(activePro.length)}    ${chalk.red('●')} Expired: ${expiredPro.length}    ${chalk.gray('●')} Revoked: ${revokedPro.length}    ${chalk.blue('●')} Total: ${proData.length}`);
            console.log('');

            // Shares
            console.log(chalk.bold('  Document Shares'));
            console.log(chalk.gray('  ─────────────────────────────────────────────────────'));
            console.log(`    ${chalk.green('●')} Active: ${chalk.bold(activeShares.length)}    ${chalk.red('●')} Expired: ${expiredShares.length}    ${chalk.yellow('●')} Protected: ${protectedShares.length}    ${chalk.blue('●')} Total: ${shares.length}`);
            console.log('');

            // Storage
            console.log(chalk.bold('  Storage'));
            console.log(chalk.gray('  ─────────────────────────────────────────────────────'));
            console.log(`    Shares:  ${chalk.cyan(formatSize(shareDirSize).padEnd(10))} (${shareFiles.length} files)`);
            console.log(`    Uploads: ${chalk.cyan(formatSize(uploadDirSize).padEnd(10))} (${uploadFiles.length} files)`);
            console.log(`    Outputs: ${chalk.cyan(formatSize(outputDirSize).padEnd(10))} (${outputFiles.length} files)`);
            console.log(chalk.gray('    ─────────────────────────────'));
            console.log(`    Total:   ${chalk.bold.cyan(formatSize(totalStorage))}`);
            console.log('');

            // Quick Actions
            console.log(chalk.gray('  Quick Actions: cleanup:status | pro:list --active | share:list'));
            console.log('');
        });

    // stats:pro - Pro access statistics
    program
        .command('stats:pro')
        .description('Show Pro access statistics')
        .action(async function() {
            const isJson = program.opts().json;
            const now = Date.now();
            const proData = loadProAccess();

            // Time-based analysis
            const last24h = proData.filter(e => e.createdAt > now - 24 * 60 * 60 * 1000);
            const last7d = proData.filter(e => e.createdAt > now - 7 * 24 * 60 * 60 * 1000);
            const last30d = proData.filter(e => e.createdAt > now - 30 * 24 * 60 * 60 * 1000);

            const activePro = proData.filter(e => e.expiresAt > now && !e.isRevoked);
            const expiredPro = proData.filter(e => e.expiresAt <= now);
            const revokedPro = proData.filter(e => e.isRevoked);
            const cliGranted = proData.filter(e => e.stripeSessionId && e.stripeSessionId.startsWith('cli-grant'));

            const result = {
                current: {
                    active: activePro.length,
                    expired: expiredPro.length,
                    revoked: revokedPro.length,
                    total: proData.length
                },
                timeframe: {
                    last24h: last24h.length,
                    last7d: last7d.length,
                    last30d: last30d.length
                },
                sources: {
                    stripe: proData.length - cliGranted.length,
                    cliGranted: cliGranted.length
                }
            };

            if (isJson) {
                console.log(formatJson(result));
                return;
            }

            header('Pro Access Statistics');

            console.log('\n' + chalk.bold('Current Status:'));
            console.log(`  ${chalk.green('Active:')} ${activePro.length}`);
            console.log(`  ${chalk.red('Expired:')} ${expiredPro.length}`);
            console.log(`  ${chalk.gray('Revoked:')} ${revokedPro.length}`);
            console.log(`  ${chalk.blue('Total:')} ${proData.length}`);

            console.log('\n' + chalk.bold('New Registrations:'));
            console.log(`  Last 24 hours: ${last24h.length}`);
            console.log(`  Last 7 days: ${last7d.length}`);
            console.log(`  Last 30 days: ${last30d.length}`);

            console.log('\n' + chalk.bold('Access Sources:'));
            console.log(`  Stripe payments: ${proData.length - cliGranted.length}`);
            console.log(`  CLI granted: ${cliGranted.length}`);

            if (activePro.length > 0) {
                console.log('\n' + chalk.bold('Active Users:'));
                activePro.slice(0, 5).forEach(e => {
                    const timeLeft = e.expiresAt - now;
                    const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
                    console.log(`  ${chalk.gray('-')} ${e.email} (${hoursLeft}h remaining)`);
                });
                if (activePro.length > 5) {
                    console.log(chalk.gray(`  ... and ${activePro.length - 5} more`));
                }
            }

            console.log('');
        });

    // stats:shares - Share statistics
    program
        .command('stats:shares')
        .description('Show share statistics')
        .action(async function() {
            const isJson = program.opts().json;
            const now = Date.now();

            const shareMetadata = loadShareMetadata();
            const shares = Object.entries(shareMetadata.shares || {});
            const shareFiles = getShareFiles();

            const activeShares = shares.filter(([, d]) => d.expiresAt > now);
            const expiredShares = shares.filter(([, d]) => d.expiresAt <= now);
            const protectedShares = shares.filter(([, d]) => d.passwordHash);

            // File size analysis
            const totalSize = shareFiles.reduce((sum, f) => sum + f.size, 0);
            const avgSize = shareFiles.length > 0 ? totalSize / shareFiles.length : 0;
            const largestFile = shareFiles.reduce((max, f) => f.size > max.size ? f : max, { size: 0 });

            // Time-based
            const last24h = shares.filter(([, d]) => d.createdAt > now - 24 * 60 * 60 * 1000);
            const last7d = shares.filter(([, d]) => d.createdAt > now - 7 * 24 * 60 * 60 * 1000);

            const result = {
                current: {
                    active: activeShares.length,
                    expired: expiredShares.length,
                    protected: protectedShares.length,
                    total: shares.length
                },
                files: {
                    count: shareFiles.length,
                    totalSize,
                    avgSize,
                    largestFile: largestFile.size > 0 ? { name: largestFile.fileName, size: largestFile.size } : null
                },
                timeframe: {
                    last24h: last24h.length,
                    last7d: last7d.length
                }
            };

            if (isJson) {
                console.log(formatJson(result));
                return;
            }

            header('Share Statistics');

            console.log('\n' + chalk.bold('Current Status:'));
            console.log(`  ${chalk.green('Active:')} ${activeShares.length}`);
            console.log(`  ${chalk.red('Expired:')} ${expiredShares.length}`);
            console.log(`  ${chalk.yellow('Protected:')} ${protectedShares.length}`);
            console.log(`  ${chalk.blue('Total:')} ${shares.length}`);

            console.log('\n' + chalk.bold('File Storage:'));
            console.log(`  Files: ${shareFiles.length}`);
            console.log(`  Total size: ${formatSize(totalSize)}`);
            console.log(`  Average size: ${formatSize(avgSize)}`);
            if (largestFile.size > 0) {
                console.log(`  Largest: ${largestFile.fileName} (${formatSize(largestFile.size)})`);
            }

            console.log('\n' + chalk.bold('Created:'));
            console.log(`  Last 24 hours: ${last24h.length}`);
            console.log(`  Last 7 days: ${last7d.length}`);

            console.log('');
        });

    // stats:storage - Storage statistics
    program
        .command('stats:storage')
        .description('Show storage usage statistics')
        .action(async function() {
            const isJson = program.opts().json;

            const shareFiles = getShareFiles();
            const uploadFiles = getDirectoryFiles(PATHS.uploads);
            const outputFiles = getDirectoryFiles(PATHS.outputs);

            const shareDirSize = getDirectorySize(PATHS.shares);
            const uploadDirSize = getDirectorySize(PATHS.uploads);
            const outputDirSize = getDirectorySize(PATHS.outputs);
            const totalSize = shareDirSize + uploadDirSize + outputDirSize;

            const result = {
                shares: {
                    path: PATHS.shares,
                    files: shareFiles.length,
                    size: shareDirSize
                },
                uploads: {
                    path: PATHS.uploads,
                    files: uploadFiles.length,
                    size: uploadDirSize
                },
                outputs: {
                    path: PATHS.outputs,
                    files: outputFiles.length,
                    size: outputDirSize
                },
                total: {
                    files: shareFiles.length + uploadFiles.length + outputFiles.length,
                    size: totalSize
                }
            };

            if (isJson) {
                console.log(formatJson(result));
                return;
            }

            header('Storage Usage');

            const rows = [
                ['Shares', PATHS.shares, shareFiles.length.toString(), formatSize(shareDirSize)],
                ['Uploads', PATHS.uploads, uploadFiles.length.toString(), formatSize(uploadDirSize)],
                ['Outputs', PATHS.outputs, outputFiles.length.toString(), formatSize(outputDirSize)]
            ];

            console.log('\n' + formatTable(
                ['Directory', 'Path', 'Files', 'Size'],
                rows
            ));

            console.log(`\n${chalk.bold('Total:')} ${shareFiles.length + uploadFiles.length + outputFiles.length} files, ${chalk.cyan(formatSize(totalSize))}`);
            console.log('');
        });
};
