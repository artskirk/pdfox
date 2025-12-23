/**
 * Output formatting utilities for PDFOX CLI
 */

'use strict';

const chalk = require('chalk');
const Table = require('cli-table3');

/**
 * Format data as a table
 */
function formatTable(headers, rows, options = {}) {
    const table = new Table({
        head: headers.map(h => chalk.cyan.bold(h)),
        style: { head: [], border: ['grey'] },
        chars: {
            'top': '-', 'top-mid': '+', 'top-left': '+', 'top-right': '+',
            'bottom': '-', 'bottom-mid': '+', 'bottom-left': '+', 'bottom-right': '+',
            'left': '|', 'left-mid': '+', 'mid': '-', 'mid-mid': '+',
            'right': '|', 'right-mid': '+', 'middle': '|'
        },
        ...options
    });
    rows.forEach(row => table.push(row));
    return table.toString();
}

/**
 * Format data as JSON
 */
function formatJson(data) {
    return JSON.stringify(data, null, 2);
}

/**
 * Success message
 */
function success(message) {
    console.log(chalk.green('✓'), message);
}

/**
 * Error message
 */
function error(message) {
    console.error(chalk.red('✗'), message);
}

/**
 * Warning message
 */
function warn(message) {
    console.log(chalk.yellow('!'), message);
}

/**
 * Info message
 */
function info(message) {
    console.log(chalk.blue('i'), message);
}

/**
 * Header/title
 */
function header(message) {
    console.log('\n' + chalk.bold.cyan(message));
    console.log(chalk.gray('-'.repeat(message.length)));
}

/**
 * Format status (active/expired/revoked)
 */
function formatStatus(isActive, isRevoked = false) {
    if (isRevoked) return chalk.gray('revoked');
    return isActive ? chalk.green('active') : chalk.red('expired');
}

/**
 * Format date from timestamp
 */
function formatDate(timestamp) {
    if (!timestamp) return chalk.gray('N/A');
    return new Date(timestamp).toLocaleString();
}

/**
 * Format relative time
 */
function formatRelativeTime(timestamp) {
    if (!timestamp) return chalk.gray('N/A');

    const now = Date.now();
    const diff = timestamp - now;
    const absDiff = Math.abs(diff);

    const hours = Math.floor(absDiff / (1000 * 60 * 60));
    const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));

    let timeStr;
    if (hours > 24) {
        const days = Math.floor(hours / 24);
        timeStr = `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
        timeStr = `${hours}h ${minutes}m`;
    } else {
        timeStr = `${minutes}m`;
    }

    if (diff > 0) {
        return chalk.green(`in ${timeStr}`);
    } else {
        return chalk.red(`${timeStr} ago`);
    }
}

/**
 * Truncate string with ellipsis
 */
function truncate(str, len = 20) {
    if (!str) return '';
    if (str.length <= len) return str;
    return str.slice(0, len - 3) + '...';
}

/**
 * Format file size
 */
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

/**
 * Format currency amount (cents to display)
 */
function formatCurrency(cents, currency = 'EUR') {
    const amount = (cents / 100).toFixed(2);
    const symbols = { eur: '\u20AC', usd: '$', gbp: '\u00A3' };
    const symbol = symbols[currency.toLowerCase()] || currency.toUpperCase() + ' ';
    return symbol + amount;
}

/**
 * Print key-value pair
 */
function printKeyValue(key, value, indent = 2) {
    const spaces = ' '.repeat(indent);
    console.log(`${spaces}${chalk.gray(key + ':')} ${value}`);
}

/**
 * Print a divider line
 */
function divider(char = '-', length = 50) {
    console.log(chalk.gray(char.repeat(length)));
}

module.exports = {
    formatTable,
    formatJson,
    success,
    error,
    warn,
    info,
    header,
    formatStatus,
    formatDate,
    formatRelativeTime,
    truncate,
    formatSize,
    formatCurrency,
    printKeyValue,
    divider
};
