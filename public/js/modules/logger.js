/**
 * PDFOX Production-Safe Logger
 * Disables console output based on APP_ENV and APP_DEBUG from server config
 * Compliant with security requirements - no console output in production
 *
 * This script should be loaded FIRST before any other scripts
 */
(function() {
    'use strict';

    // Default to production mode (safe default)
    let isDebugEnabled = false;

    // Check if config was injected by server
    if (window.PDFOX_CONFIG) {
        isDebugEnabled = window.PDFOX_CONFIG.env === 'dev' || window.PDFOX_CONFIG.debug === true;
    }

    // In production (debug disabled), override console methods with no-ops
    if (!isDebugEnabled) {
        const noop = function() {};

        // Store original console for critical errors if needed
        window._originalConsole = {
            log: console.log,
            info: console.info,
            debug: console.debug,
            warn: console.warn,
            error: console.error,
            trace: console.trace
        };

        // Override console methods
        console.log = noop;
        console.info = noop;
        console.debug = noop;
        console.warn = noop;
        console.error = noop;
        console.trace = noop;
    }

    // Expose logger utility for explicit logging needs
    window.PDFoxLogger = {
        isDebugEnabled: isDebugEnabled,
        log: isDebugEnabled ? console.log.bind(console) : function() {},
        info: isDebugEnabled ? console.info.bind(console) : function() {},
        debug: isDebugEnabled ? console.debug.bind(console) : function() {},
        warn: isDebugEnabled ? console.warn.bind(console) : function() {},
        error: isDebugEnabled ? console.error.bind(console) : function() {},

        // For critical errors that need to be reported even in production
        critical: function(message, error) {
            if (window._originalConsole) {
                window._originalConsole.error('[PDFOX Critical]', message, error);
            }
        }
    };
})();
