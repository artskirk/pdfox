/**
 * Log management commands for PDFOX CLI
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');
const { PATHS } = require('../utils/config');
const { success, error, warn, info, header, formatJson } = require('../utils/output');

const LOGS_DIR = path.join(PATHS.root, 'logs');

// Log level colors for pretty printing
const LEVEL_STYLES = {
    debug: { color: chalk.cyan, icon: '🔍', label: 'DEBUG' },
    info:  { color: chalk.green, icon: '✓', label: 'INFO ' },
    warn:  { color: chalk.yellow, icon: '⚠', label: 'WARN ' },
    error: { color: chalk.red, icon: '✗', label: 'ERROR' }
};

function formatLogEntry(entry, options = {}) {
    const style = LEVEL_STYLES[entry.level] || LEVEL_STYLES.info;
    const timestamp = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false });

    let contextParts = [];
    if (entry.sessionId) contextParts.push(chalk.dim(`sid:${entry.sessionId.substring(0, 8)}`));
    if (entry.email) contextParts.push(chalk.cyan(entry.email));
    if (entry.requestId) contextParts.push(chalk.dim(`req:${entry.requestId.substring(0, 8)}`));
    if (entry.method && entry.path) contextParts.push(chalk.dim(`${entry.method} ${entry.path}`));
    if (entry.statusCode) contextParts.push(entry.statusCode >= 400 ? chalk.red(entry.statusCode) : chalk.green(entry.statusCode));
    if (entry.duration) contextParts.push(chalk.dim(`${entry.duration}ms`));
    if (entry.ip && options.showIp) contextParts.push(chalk.dim(entry.ip));

    const contextStr = contextParts.length > 0 ? `[${contextParts.join(' ')}] ` : '';

    return `${chalk.dim(timestamp)} ${style.color(`${style.icon} ${style.label}`)} ${contextStr}${entry.message}`;
}

function matchesFilter(entry, filter) {
    if (!filter) return true;

    const filterLower = filter.toLowerCase();

    // Match by session ID
    if (entry.sessionId && entry.sessionId.toLowerCase().includes(filterLower)) {
        return true;
    }

    // Match by email
    if (entry.email && entry.email.toLowerCase().includes(filterLower)) {
        return true;
    }

    // Match by request ID
    if (entry.requestId && entry.requestId.toLowerCase().includes(filterLower)) {
        return true;
    }

    // Match by message content
    if (entry.message && entry.message.toLowerCase().includes(filterLower)) {
        return true;
    }

    // Match by IP
    if (entry.ip && entry.ip.includes(filter)) {
        return true;
    }

    return false;
}

async function tailFile(filePath, options) {
    const { lines = 50, follow = false, filter = null, level = null, showIp = false, json = false } = options;

    if (!fs.existsSync(filePath)) {
        error(`Log file not found: ${filePath}`);
        return;
    }

    // Read last N lines
    const content = fs.readFileSync(filePath, 'utf8');
    const allLines = content.trim().split('\n').filter(l => l.trim());

    // Parse and filter lines
    let entries = [];
    for (const line of allLines) {
        try {
            const entry = JSON.parse(line);

            // Apply level filter
            if (level && entry.level !== level) continue;

            // Apply search filter
            if (!matchesFilter(entry, filter)) continue;

            entries.push(entry);
        } catch (e) {
            // Skip malformed lines
        }
    }

    // Get last N entries
    const lastEntries = entries.slice(-lines);

    if (json) {
        console.log(formatJson(lastEntries));
        return;
    }

    // Print entries
    if (lastEntries.length === 0) {
        info('No matching log entries found');
        if (filter) {
            console.log(chalk.dim(`  Filter: "${filter}"`));
        }
        return;
    }

    for (const entry of lastEntries) {
        console.log(formatLogEntry(entry, { showIp }));
    }

    console.log(chalk.dim(`\n─── Showing ${lastEntries.length} of ${entries.length} entries ───`));
    if (filter) {
        console.log(chalk.dim(`Filter: "${filter}"`));
    }

    // Follow mode
    if (follow) {
        console.log(chalk.dim('\nWatching for new entries... (Ctrl+C to stop)\n'));

        let lastSize = fs.statSync(filePath).size;

        const watcher = fs.watch(filePath, (eventType) => {
            if (eventType === 'change') {
                const currentSize = fs.statSync(filePath).size;
                if (currentSize > lastSize) {
                    // Read new content
                    const stream = fs.createReadStream(filePath, {
                        start: lastSize,
                        encoding: 'utf8'
                    });

                    let buffer = '';
                    stream.on('data', (chunk) => {
                        buffer += chunk;
                        const lines = buffer.split('\n');
                        buffer = lines.pop(); // Keep incomplete line in buffer

                        for (const line of lines) {
                            if (!line.trim()) continue;
                            try {
                                const entry = JSON.parse(line);
                                if (level && entry.level !== level) continue;
                                if (!matchesFilter(entry, filter)) continue;
                                console.log(formatLogEntry(entry, { showIp }));
                            } catch (e) {
                                // Skip malformed lines
                            }
                        }
                    });

                    lastSize = currentSize;
                }
            }
        });

        // Handle Ctrl+C
        process.on('SIGINT', () => {
            watcher.close();
            console.log(chalk.dim('\nStopped watching logs.'));
            process.exit(0);
        });

        // Keep process alive
        await new Promise(() => {});
    }
}

module.exports = function(program) {
    // logs:tail - View and filter logs
    program
        .command('logs:tail [filter]')
        .description('View application logs with optional filtering by session ID or email')
        .option('-n, --lines <n>', 'Number of lines to show', '50')
        .option('-f, --follow', 'Follow log output in real-time', false)
        .option('-l, --level <level>', 'Filter by log level (debug, info, warn, error)')
        .option('-e, --errors', 'Show only errors (shortcut for --level error)', false)
        .option('--app', 'Show app.log (default)', true)
        .option('--error-log', 'Show error.log instead of app.log', false)
        .option('--ip', 'Show IP addresses', false)
        .action(async function(filter, options) {
            const isJson = program.opts().json;

            // Determine log file
            const logFile = options.errorLog ? 'error.log' : 'app.log';
            const logPath = path.join(LOGS_DIR, logFile);

            // Handle --errors shortcut
            const level = options.errors ? 'error' : options.level;

            if (!isJson) {
                header(`Log Viewer - ${logFile}`);
                if (filter) {
                    console.log(chalk.dim(`Filtering by: "${filter}"\n`));
                }
            }

            await tailFile(logPath, {
                lines: parseInt(options.lines),
                follow: options.follow,
                filter: filter,
                level: level,
                showIp: options.ip,
                json: isJson
            });
        });

    // logs:search - Search through all logs
    program
        .command('logs:search <query>')
        .description('Search through all log files')
        .option('-l, --level <level>', 'Filter by log level')
        .option('--all', 'Search all log files including rotated', false)
        .action(async function(query, options) {
            const isJson = program.opts().json;

            if (!fs.existsSync(LOGS_DIR)) {
                error('Logs directory not found');
                return;
            }

            // Get log files to search
            let logFiles = ['app.log', 'error.log'];

            if (options.all) {
                const allFiles = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.log'));
                logFiles = allFiles;
            }

            const results = [];

            for (const file of logFiles) {
                const filePath = path.join(LOGS_DIR, file);
                if (!fs.existsSync(filePath)) continue;

                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.trim().split('\n').filter(l => l.trim());

                for (const line of lines) {
                    try {
                        const entry = JSON.parse(line);

                        if (options.level && entry.level !== options.level) continue;
                        if (!matchesFilter(entry, query)) continue;

                        results.push({ file, ...entry });
                    } catch (e) {
                        // Skip malformed lines
                    }
                }
            }

            if (isJson) {
                console.log(formatJson(results));
                return;
            }

            if (results.length === 0) {
                info(`No results found for: "${query}"`);
                return;
            }

            header(`Search Results for "${query}"`);
            console.log('');

            // Group by file
            const grouped = {};
            for (const entry of results) {
                if (!grouped[entry.file]) grouped[entry.file] = [];
                grouped[entry.file].push(entry);
            }

            for (const [file, entries] of Object.entries(grouped)) {
                console.log(chalk.bold.underline(file));
                for (const entry of entries.slice(-20)) { // Limit per file
                    console.log('  ' + formatLogEntry(entry));
                }
                if (entries.length > 20) {
                    console.log(chalk.dim(`  ... and ${entries.length - 20} more`));
                }
                console.log('');
            }

            console.log(chalk.dim(`Total: ${results.length} matching entries`));
        });

    // logs:clear - Clear log files
    program
        .command('logs:clear')
        .description('Clear all log files')
        .action(async function() {
            const isJson = program.opts().json;

            if (!fs.existsSync(LOGS_DIR)) {
                if (isJson) {
                    console.log(formatJson({ success: true, message: 'No logs to clear' }));
                } else {
                    info('No logs directory found');
                }
                return;
            }

            if (!program.opts().force) {
                const { confirmDestructive } = require('../utils/prompts');
                const confirmed = await confirmDestructive('Clear logs', 'all log files');
                if (!confirmed) {
                    info('Operation cancelled.');
                    return;
                }
            }

            const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.log'));
            let cleared = 0;

            for (const file of files) {
                const filePath = path.join(LOGS_DIR, file);
                fs.unlinkSync(filePath);
                cleared++;
            }

            if (isJson) {
                console.log(formatJson({ success: true, cleared }));
            } else {
                success(`Cleared ${cleared} log file(s)`);
            }
        });

    // logs:stats - Show log statistics
    program
        .command('logs:stats')
        .description('Show log file statistics')
        .action(async function() {
            const isJson = program.opts().json;

            if (!fs.existsSync(LOGS_DIR)) {
                if (isJson) {
                    console.log(formatJson({ exists: false }));
                } else {
                    info('No logs directory found');
                }
                return;
            }

            const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.log'));
            const stats = {
                totalFiles: files.length,
                totalSize: 0,
                files: [],
                levelCounts: { debug: 0, info: 0, warn: 0, error: 0 }
            };

            for (const file of files) {
                const filePath = path.join(LOGS_DIR, file);
                const fileStat = fs.statSync(filePath);

                stats.files.push({
                    name: file,
                    size: fileStat.size,
                    modified: fileStat.mtime
                });
                stats.totalSize += fileStat.size;

                // Count levels in main app.log
                if (file === 'app.log') {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const lines = content.trim().split('\n').filter(l => l.trim());

                    for (const line of lines) {
                        try {
                            const entry = JSON.parse(line);
                            if (stats.levelCounts[entry.level] !== undefined) {
                                stats.levelCounts[entry.level]++;
                            }
                        } catch (e) {}
                    }
                }
            }

            if (isJson) {
                console.log(formatJson(stats));
                return;
            }

            header('Log Statistics');
            console.log('');

            console.log(chalk.bold('Files:'));
            for (const file of stats.files) {
                const sizeKB = (file.size / 1024).toFixed(1);
                const modified = new Date(file.modified).toLocaleString();
                console.log(`  ${chalk.white(file.name.padEnd(20))} ${chalk.dim(sizeKB + ' KB'.padStart(10))} ${chalk.dim(modified)}`);
            }

            console.log('');
            console.log(chalk.bold('Total Size:'), ((stats.totalSize / 1024).toFixed(1)) + ' KB');

            console.log('');
            console.log(chalk.bold('Log Levels (app.log):'));
            console.log(`  ${chalk.cyan('DEBUG')}: ${stats.levelCounts.debug}`);
            console.log(`  ${chalk.green('INFO')}:  ${stats.levelCounts.info}`);
            console.log(`  ${chalk.yellow('WARN')}:  ${stats.levelCounts.warn}`);
            console.log(`  ${chalk.red('ERROR')}: ${stats.levelCounts.error}`);

            console.log('');
        });
};
