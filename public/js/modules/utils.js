/**
 * PDFOX Utilities Module
 * Common utility functions
 * Single Responsibility: Helper functions and DOM utilities
 */

const PDFoxUtils = (function() {
    'use strict';

    return {
        /**
         * Create DOM element with attributes
         * @param {string} tag - HTML tag name
         * @param {Object} attrs - Attributes to set
         * @param {string|Element|Array} children - Child content
         * @returns {HTMLElement}
         */
        createElement(tag, attrs = {}, children = null) {
            const el = document.createElement(tag);

            Object.entries(attrs).forEach(([key, value]) => {
                if (key === 'className') {
                    el.className = value;
                } else if (key === 'style' && typeof value === 'object') {
                    Object.assign(el.style, value);
                } else if (key.startsWith('on') && typeof value === 'function') {
                    el.addEventListener(key.slice(2).toLowerCase(), value);
                } else if (key === 'dataset') {
                    Object.entries(value).forEach(([dataKey, dataValue]) => {
                        el.dataset[dataKey] = dataValue;
                    });
                } else {
                    el.setAttribute(key, value);
                }
            });

            if (children) {
                if (Array.isArray(children)) {
                    children.forEach(child => {
                        if (typeof child === 'string') {
                            el.appendChild(document.createTextNode(child));
                        } else if (child instanceof Element) {
                            el.appendChild(child);
                        }
                    });
                } else if (typeof children === 'string') {
                    el.textContent = children;
                } else if (children instanceof Element) {
                    el.appendChild(children);
                }
            }

            return el;
        },

        /**
         * Query selector shorthand
         * @param {string} selector - CSS selector
         * @param {Element} context - Context element
         * @returns {Element|null}
         */
        $(selector, context = document) {
            return context.querySelector(selector);
        },

        /**
         * Query selector all shorthand
         * @param {string} selector - CSS selector
         * @param {Element} context - Context element
         * @returns {NodeList}
         */
        $$(selector, context = document) {
            return context.querySelectorAll(selector);
        },

        /**
         * Debounce function execution
         * @param {Function} fn - Function to debounce
         * @param {number} delay - Delay in milliseconds
         * @returns {Function}
         */
        debounce(fn, delay = 300) {
            let timeoutId;
            return function(...args) {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => fn.apply(this, args), delay);
            };
        },

        /**
         * Throttle function execution
         * @param {Function} fn - Function to throttle
         * @param {number} limit - Limit in milliseconds
         * @returns {Function}
         */
        throttle(fn, limit = 100) {
            let inThrottle;
            return function(...args) {
                if (!inThrottle) {
                    fn.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        /**
         * Convert rgba color to hex
         * @param {string} rgba - RGBA color string
         * @returns {string} Hex color
         */
        rgbaToHex(rgba) {
            const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (!match) return '#ffffff';
            const r = parseInt(match[1]).toString(16).padStart(2, '0');
            const g = parseInt(match[2]).toString(16).padStart(2, '0');
            const b = parseInt(match[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        },

        /**
         * Convert hex to rgba
         * @param {string} hex - Hex color
         * @param {number} alpha - Alpha value (0-1)
         * @returns {string} RGBA color string
         */
        hexToRgba(hex, alpha = 1) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        },

        /**
         * Generate unique ID
         * @param {string} prefix - ID prefix
         * @returns {string}
         */
        generateId(prefix = 'id') {
            return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        },

        /**
         * Clamp number between min and max
         * @param {number} value - Value to clamp
         * @param {number} min - Minimum value
         * @param {number} max - Maximum value
         * @returns {number}
         */
        clamp(value, min, max) {
            return Math.min(Math.max(value, min), max);
        },

        /**
         * Deep clone object
         * @param {*} obj - Object to clone
         * @returns {*}
         */
        deepClone(obj) {
            return JSON.parse(JSON.stringify(obj));
        },

        /**
         * Format file size
         * @param {number} bytes - Size in bytes
         * @returns {string}
         */
        formatFileSize(bytes) {
            const units = ['B', 'KB', 'MB', 'GB'];
            let unitIndex = 0;
            let size = bytes;

            while (size >= 1024 && unitIndex < units.length - 1) {
                size /= 1024;
                unitIndex++;
            }

            return `${size.toFixed(1)} ${units[unitIndex]}`;
        },

        /**
         * Escape HTML special characters
         * @param {string} str - String to escape
         * @returns {string}
         */
        escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        /**
         * Request animation frame with promise
         * @returns {Promise}
         */
        nextFrame() {
            return new Promise(resolve => requestAnimationFrame(resolve));
        },

        /**
         * Wait for specified milliseconds
         * @param {number} ms - Milliseconds to wait
         * @returns {Promise}
         */
        wait(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxUtils;
}
