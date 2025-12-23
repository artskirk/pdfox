/**
 * Pro access management commands for PDFOX CLI
 */

'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const chalk = require('chalk');
const { getConfig } = require('../utils/config');
const { loadProAccess, saveProAccess } = require('../utils/data');
const {
    success, error, warn, info, header,
    formatTable, formatJson, formatStatus, formatDate,
    formatRelativeTime, truncate, printKeyValue
} = require('../utils/output');
const { hashToken, isValidEmail, isValidUUID } = require('../utils/security');
const { confirm, confirmDestructive } = require('../utils/prompts');

module.exports = function(program) {
    // pro:list - List all Pro access entries
    program
        .command('pro:list')
        .description('List all Pro access entries')
        .option('--active', 'Show only active entries')
        .option('--expired', 'Show only expired entries')
        .option('--revoked', 'Show only revoked entries')
        .action(async function(options) {
            const data = loadProAccess();
            const now = Date.now();
            const isJson = program.opts().json;

            let filtered = data;

            if (options.active) {
                filtered = data.filter(e => e.expiresAt > now && !e.isRevoked);
            } else if (options.expired) {
                filtered = data.filter(e => e.expiresAt <= now);
            } else if (options.revoked) {
                filtered = data.filter(e => e.isRevoked);
            }

            if (isJson) {
                console.log(formatJson(filtered));
                return;
            }

            if (filtered.length === 0) {
                warn('No Pro access entries found');
                return;
            }

            const rows = filtered.map(entry => {
                const isActive = entry.expiresAt > now && !entry.isRevoked;
                return [
                    truncate(entry.id, 8),
                    entry.email || chalk.gray('N/A'),
                    formatStatus(entry.expiresAt > now, entry.isRevoked),
                    formatDate(entry.createdAt),
                    formatRelativeTime(entry.expiresAt)
                ];
            });

            console.log(formatTable(
                ['ID', 'Email', 'Status', 'Created', 'Expires'],
                rows
            ));

            const active = data.filter(e => e.expiresAt > now && !e.isRevoked).length;
            const expired = data.filter(e => e.expiresAt <= now).length;
            const revoked = data.filter(e => e.isRevoked).length;

            console.log(`\n${chalk.gray('Total:')} ${filtered.length} | ${chalk.green('Active:')} ${active} | ${chalk.red('Expired:')} ${expired} | ${chalk.gray('Revoked:')} ${revoked}`);
        });

    // pro:info - Show details for a specific user
    program
        .command('pro:info <identifier>')
        .description('Show details for a Pro access entry (by ID or email)')
        .action(async function(identifier) {
            const data = loadProAccess();
            const isJson = program.opts().json;

            const entry = data.find(e =>
                e.id === identifier ||
                e.id.startsWith(identifier) ||
                e.email === identifier ||
                (e.email && e.email.includes(identifier))
            );

            if (!entry) {
                error(`No Pro access found for: ${identifier}`);
                process.exit(1);
            }

            if (isJson) {
                console.log(formatJson(entry));
                return;
            }

            const now = Date.now();
            const isActive = entry.expiresAt > now && !entry.isRevoked;

            header('Pro Access Details');

            console.log('');
            printKeyValue('ID', entry.id);
            printKeyValue('Email', entry.email || chalk.gray('N/A'));
            printKeyValue('Status', formatStatus(entry.expiresAt > now, entry.isRevoked));
            printKeyValue('Fingerprint', entry.fingerprint ? truncate(entry.fingerprint, 20) : chalk.gray('N/A'));
            printKeyValue('Created', formatDate(entry.createdAt));
            printKeyValue('Expires', `${formatDate(entry.expiresAt)} (${formatRelativeTime(entry.expiresAt)})`);
            printKeyValue('Stripe Session', entry.stripeSessionId ? truncate(entry.stripeSessionId, 30) : chalk.gray('N/A'));
            printKeyValue('Receipt', entry.receiptNumber || chalk.gray('N/A'));
            printKeyValue('Token Hash', entry.tokenHash ? truncate(entry.tokenHash, 16) + '...' : chalk.gray('N/A'));
            console.log('');
        });

    // pro:grant - Grant Pro access
    program
        .command('pro:grant <email>')
        .description('Grant Pro access to a user')
        .option('-f, --fingerprint <fp>', 'Device fingerprint', 'cli-granted')
        .option('-d, --duration <hours>', 'Duration in hours', '24')
        .action(async function(email, options) {
            if (!isValidEmail(email)) {
                error('Invalid email format');
                process.exit(1);
            }

            const config = getConfig();
            if (!config.JWT_SECRET) {
                error('JWT_SECRET is not configured. Cannot generate token.');
                process.exit(1);
            }

            const data = loadProAccess();
            const duration = parseInt(options.duration) * 60 * 60 * 1000;
            const now = Date.now();
            const expiresAt = now + duration;

            // Check for existing active access
            const existing = data.find(e =>
                e.email === email &&
                e.expiresAt > now &&
                !e.isRevoked
            );

            if (existing) {
                warn(`User ${email} already has active Pro access until ${formatDate(existing.expiresAt)}`);
                const confirmed = await confirm('Create a new access entry anyway?');
                if (!confirmed) {
                    info('Operation cancelled.');
                    return;
                }
            }

            // Generate JWT token
            const token = jwt.sign({
                email,
                fingerprint: options.fingerprint,
                exp: Math.floor(expiresAt / 1000)
            }, config.JWT_SECRET);

            const entry = {
                id: crypto.randomUUID(),
                email,
                fingerprint: options.fingerprint,
                stripeSessionId: 'cli-grant-' + now,
                receiptNumber: null,
                tokenHash: hashToken(token),
                createdAt: now,
                expiresAt,
                isRevoked: false
            };

            data.push(entry);
            saveProAccess(data);

            success(`Pro access granted to ${email}`);
            printKeyValue('ID', entry.id);
            printKeyValue('Expires', formatDate(expiresAt));
            printKeyValue('Duration', options.duration + ' hours');

            if (program.opts().json) {
                console.log(formatJson({ ...entry, token }));
            } else {
                console.log(chalk.gray('\nToken (provide to user):'));
                console.log(chalk.cyan(token));
            }
        });

    // pro:revoke - Revoke Pro access
    program
        .command('pro:revoke <identifier>')
        .description('Revoke Pro access by ID or email')
        .action(async function(identifier) {
            const data = loadProAccess();
            const now = Date.now();

            const entry = data.find(e =>
                (e.id === identifier || e.id.startsWith(identifier) || e.email === identifier) &&
                !e.isRevoked
            );

            if (!entry) {
                error(`No active Pro access found for: ${identifier}`);
                process.exit(1);
            }

            if (!program.opts().force) {
                const confirmed = await confirmDestructive(
                    'Revoke Pro access',
                    `${entry.email} (ID: ${truncate(entry.id, 8)})`
                );
                if (!confirmed) {
                    warn('Operation cancelled');
                    return;
                }
            }

            entry.isRevoked = true;
            saveProAccess(data);
            success(`Pro access revoked for ${entry.email}`);
        });

    // pro:extend - Extend Pro access duration
    program
        .command('pro:extend <identifier>')
        .description('Extend Pro access duration')
        .requiredOption('--hours <hours>', 'Hours to extend')
        .action(async function(identifier, options) {
            const data = loadProAccess();

            const entry = data.find(e =>
                e.id === identifier ||
                e.id.startsWith(identifier) ||
                e.email === identifier
            );

            if (!entry) {
                error(`No Pro access found for: ${identifier}`);
                process.exit(1);
            }

            if (entry.isRevoked) {
                error('Cannot extend revoked access. Use pro:grant to create new access.');
                process.exit(1);
            }

            const hours = parseInt(options.hours);
            if (isNaN(hours) || hours <= 0) {
                error('Hours must be a positive number');
                process.exit(1);
            }

            const oldExpiry = entry.expiresAt;
            const now = Date.now();
            // Extend from current time if expired, otherwise from current expiry
            const baseTime = entry.expiresAt > now ? entry.expiresAt : now;
            entry.expiresAt = baseTime + (hours * 60 * 60 * 1000);

            saveProAccess(data);

            success(`Pro access extended for ${entry.email}`);
            printKeyValue('Old expiry', formatDate(oldExpiry));
            printKeyValue('New expiry', formatDate(entry.expiresAt));
            printKeyValue('Extended by', hours + ' hours');
        });

    // pro:clean - Remove expired entries
    program
        .command('pro:clean')
        .description('Remove expired Pro access entries')
        .option('--dry-run', 'Show what would be deleted without deleting')
        .action(async function(options) {
            const data = loadProAccess();
            const now = Date.now();

            const expired = data.filter(e => e.expiresAt <= now);
            const active = data.filter(e => e.expiresAt > now);

            if (expired.length === 0) {
                success('No expired entries to clean');
                return;
            }

            console.log(`Found ${expired.length} expired entries:`);
            expired.forEach(e => {
                console.log(`  ${chalk.gray('-')} ${e.email} (expired ${formatRelativeTime(e.expiresAt)})`);
            });

            if (options.dryRun) {
                warn('\nDry run - no changes made');
                return;
            }

            if (!program.opts().force) {
                const confirmed = await confirm(`\nRemove ${expired.length} expired entries?`);
                if (!confirmed) {
                    info('Operation cancelled.');
                    return;
                }
            }

            saveProAccess(active);
            success(`Removed ${expired.length} expired entries`);
        });
};
