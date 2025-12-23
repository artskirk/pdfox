/**
 * PDFOX Logger - Structured logging with pretty formatting
 * Supports file output, log levels, and context tracking
 */

'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

// Log levels with priority
const LOG_LEVELS = {
    debug: { priority: 0, color: '\x1b[36m', label: 'DEBUG', icon: '🔍' },
    info:  { priority: 1, color: '\x1b[32m', label: 'INFO ', icon: '✓' },
    warn:  { priority: 2, color: '\x1b[33m', label: 'WARN ', icon: '⚠' },
    error: { priority: 3, color: '\x1b[31m', label: 'ERROR', icon: '✗' }
};

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

class Logger {
    constructor(options = {}) {
        this.logDir = options.logDir || path.join(process.cwd(), 'logs');
        this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
        this.maxFiles = options.maxFiles || 5;
        this.isProduction = options.isProduction ?? (process.env.APP_ENV === 'prod');
        this.debugEnabled = options.debugEnabled ?? (process.env.APP_DEBUG === '1');
        this.minLevel = this.debugEnabled ? 'debug' : 'info';
        this.prettyPrint = options.prettyPrint ?? !this.isProduction;

        // Ensure log directory exists
        this._ensureLogDir();

        // Current log file streams
        this.streams = {
            app: null,
            error: null
        };

        this._openStreams();
    }

    _ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    _openStreams() {
        const appLogPath = path.join(this.logDir, 'app.log');
        const errorLogPath = path.join(this.logDir, 'error.log');

        this.streams.app = fs.createWriteStream(appLogPath, { flags: 'a' });
        this.streams.error = fs.createWriteStream(errorLogPath, { flags: 'a' });
    }

    _rotateIfNeeded(logType) {
        const logPath = path.join(this.logDir, `${logType}.log`);

        try {
            const stats = fs.statSync(logPath);
            if (stats.size >= this.maxFileSize) {
                this._rotateLog(logType);
            }
        } catch (err) {
            // File doesn't exist, no rotation needed
        }
    }

    _rotateLog(logType) {
        const basePath = path.join(this.logDir, logType);

        // Close current stream
        if (this.streams[logType]) {
            this.streams[logType].end();
        }

        // Rotate existing files
        for (let i = this.maxFiles - 1; i >= 1; i--) {
            const oldPath = `${basePath}.${i}.log`;
            const newPath = `${basePath}.${i + 1}.log`;
            if (fs.existsSync(oldPath)) {
                if (i === this.maxFiles - 1) {
                    fs.unlinkSync(oldPath); // Delete oldest
                } else {
                    fs.renameSync(oldPath, newPath);
                }
            }
        }

        // Rename current to .1
        const currentPath = `${basePath}.log`;
        if (fs.existsSync(currentPath)) {
            fs.renameSync(currentPath, `${basePath}.1.log`);
        }

        // Reopen stream
        this.streams[logType] = fs.createWriteStream(currentPath, { flags: 'a' });
    }

    _shouldLog(level) {
        const levelConfig = LOG_LEVELS[level];
        const minConfig = LOG_LEVELS[this.minLevel];
        return levelConfig && minConfig && levelConfig.priority >= minConfig.priority;
    }

    _formatTimestamp() {
        const now = new Date();
        return now.toISOString();
    }

    _formatTimestampPretty() {
        const now = new Date();
        const time = now.toLocaleTimeString('en-US', { hour12: false });
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        return `${time}.${ms}`;
    }

    _formatContext(context) {
        if (!context || Object.keys(context).length === 0) return '';

        const parts = [];
        if (context.sessionId) parts.push(`sid:${context.sessionId.substring(0, 8)}`);
        if (context.email) parts.push(`email:${context.email}`);
        if (context.requestId) parts.push(`req:${context.requestId.substring(0, 8)}`);
        if (context.ip) parts.push(`ip:${context.ip}`);
        if (context.method) parts.push(`${context.method}`);
        if (context.path) parts.push(`${context.path}`);

        return parts.length > 0 ? `[${parts.join(' ')}]` : '';
    }

    _formatMessage(args) {
        return args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                if (arg instanceof Error) {
                    return arg.stack || arg.message;
                }
                return util.inspect(arg, { depth: 3, colors: this.prettyPrint });
            }
            return String(arg);
        }).join(' ');
    }

    _formatPretty(level, message, context) {
        const levelConfig = LOG_LEVELS[level];
        const timestamp = this._formatTimestampPretty();
        const contextStr = this._formatContext(context);

        let output = `${DIM}${timestamp}${RESET} `;
        output += `${levelConfig.color}${levelConfig.icon} ${levelConfig.label}${RESET} `;
        if (contextStr) {
            output += `${DIM}${contextStr}${RESET} `;
        }
        output += message;

        return output;
    }

    _formatJson(level, message, context) {
        const entry = {
            timestamp: this._formatTimestamp(),
            level: level,
            message: message,
            ...context
        };
        return JSON.stringify(entry);
    }

    _log(level, args, context = {}) {
        if (!this._shouldLog(level)) return;

        const message = this._formatMessage(args);
        const timestamp = this._formatTimestamp();

        // Console output (pretty or JSON based on environment)
        if (this.prettyPrint) {
            console.log(this._formatPretty(level, message, context));
        } else {
            console.log(this._formatJson(level, message, context));
        }

        // File output (always JSON for parsing)
        const logEntry = {
            timestamp,
            level,
            message,
            ...context
        };
        const logLine = JSON.stringify(logEntry) + '\n';

        // Rotate if needed
        this._rotateIfNeeded('app');

        // Write to app.log
        if (this.streams.app) {
            this.streams.app.write(logLine);
        }

        // Also write errors to error.log
        if (level === 'error' || level === 'warn') {
            this._rotateIfNeeded('error');
            if (this.streams.error) {
                this.streams.error.write(logLine);
            }
        }
    }

    // Public logging methods
    debug(...args) {
        this._log('debug', args);
    }

    info(...args) {
        this._log('info', args);
    }

    warn(...args) {
        this._log('warn', args);
    }

    error(...args) {
        this._log('error', args);
    }

    // Contextual logging - returns a child logger with context
    child(context) {
        const childLogger = Object.create(this);
        childLogger._context = { ...this._context, ...context };

        childLogger.debug = (...args) => this._log('debug', args, childLogger._context);
        childLogger.info = (...args) => this._log('info', args, childLogger._context);
        childLogger.warn = (...args) => this._log('warn', args, childLogger._context);
        childLogger.error = (...args) => this._log('error', args, childLogger._context);
        childLogger.child = (ctx) => this.child({ ...childLogger._context, ...ctx });

        return childLogger;
    }

    // HTTP request logging middleware
    requestLogger() {
        return (req, res, next) => {
            const startTime = Date.now();
            const requestId = this._generateRequestId();

            // Attach logger to request
            req.log = this.child({
                requestId,
                method: req.method,
                path: req.path,
                ip: req.ip || req.connection?.remoteAddress
            });

            // Extract session/email from various sources
            if (req.body?.email) req.log._context.email = req.body.email;
            if (req.body?.fingerprint) req.log._context.sessionId = req.body.fingerprint;
            if (req.query?.session_id) req.log._context.sessionId = req.query.session_id;

            // Log request completion
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                const level = res.statusCode >= 500 ? 'error' :
                              res.statusCode >= 400 ? 'warn' : 'info';

                this._log(level, [`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`], {
                    requestId,
                    method: req.method,
                    path: req.originalUrl,
                    statusCode: res.statusCode,
                    duration,
                    ip: req.ip || req.connection?.remoteAddress,
                    email: req.log?._context?.email,
                    sessionId: req.log?._context?.sessionId
                });
            });

            next();
        };
    }

    _generateRequestId() {
        return Math.random().toString(36).substring(2, 15);
    }

    // Close streams gracefully
    close() {
        if (this.streams.app) this.streams.app.end();
        if (this.streams.error) this.streams.error.end();
    }
}

// Singleton instance
let instance = null;

function createLogger(options = {}) {
    if (!instance) {
        instance = new Logger(options);
    }
    return instance;
}

function getLogger() {
    if (!instance) {
        instance = new Logger();
    }
    return instance;
}

module.exports = {
    Logger,
    createLogger,
    getLogger,
    LOG_LEVELS
};
