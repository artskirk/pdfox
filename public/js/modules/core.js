/**
 * PDFOX Core Module
 * Central state management and event system following SOLID principles
 * Single Responsibility: State management and event bus
 */

const PDFoxCore = (function() {
    'use strict';

    // Detect mobile device for default tool selection
    const isMobileDevice = () => window.innerWidth <= 768 || ('ontouchstart' in window && navigator.maxTouchPoints > 0);

    // Private state
    const state = {
        pdfDoc: null,
        currentPage: 1,
        totalPages: 0,
        scale: 1.0,
        currentTool: isMobileDevice() ? 'moveText' : 'addText',
        textEdits: [],
        textOverlays: [],
        signatures: [],
        annotations: [],
        actionHistory: [],
        redoHistory: [],
        pageRotations: {},
        selectedOverlay: null,
        selectedSignature: null,
        selectedLayerId: null,
        isDrawing: false,
        pdfBytes: null,
        isImageBasedPDF: false
    };

    // Event subscribers
    const subscribers = {};

    // Public API
    return {
        /**
         * Get current state value
         * @param {string} key - State key to retrieve
         * @returns {*} State value
         */
        get(key) {
            return key ? state[key] : { ...state };
        },

        /**
         * Set state value and notify subscribers
         * @param {string} key - State key to update
         * @param {*} value - New value
         */
        set(key, value) {
            const oldValue = state[key];
            state[key] = value;
            this.emit(`${key}:changed`, { key, value, oldValue });
        },

        /**
         * Update multiple state values
         * @param {Object} updates - Key-value pairs to update
         */
        update(updates) {
            Object.entries(updates).forEach(([key, value]) => {
                this.set(key, value);
            });
        },

        /**
         * Subscribe to events
         * @param {string} event - Event name
         * @param {Function} callback - Callback function
         * @returns {Function} Unsubscribe function
         */
        on(event, callback) {
            if (!subscribers[event]) {
                subscribers[event] = [];
            }
            subscribers[event].push(callback);

            // Return unsubscribe function
            return () => {
                subscribers[event] = subscribers[event].filter(cb => cb !== callback);
            };
        },

        /**
         * Emit event to all subscribers
         * @param {string} event - Event name
         * @param {*} data - Event data
         */
        emit(event, data) {
            if (subscribers[event]) {
                subscribers[event].forEach(callback => {
                    try {
                        callback(data);
                    } catch (error) {
                        console.error(`Error in event handler for ${event}:`, error);
                    }
                });
            }
        },

        /**
         * Add item to array state
         * @param {string} key - State key (must be array)
         * @param {*} item - Item to add
         */
        push(key, item) {
            if (Array.isArray(state[key])) {
                state[key].push(item);
                this.emit(`${key}:added`, { key, item, index: state[key].length - 1 });
                this.emit(`${key}:changed`, { key, value: state[key] });
            }
        },

        /**
         * Remove item from array state by index
         * @param {string} key - State key (must be array)
         * @param {number} index - Index to remove
         * @returns {*} Removed item
         */
        removeAt(key, index) {
            if (Array.isArray(state[key]) && index >= 0 && index < state[key].length) {
                const [removed] = state[key].splice(index, 1);
                this.emit(`${key}:removed`, { key, item: removed, index });
                this.emit(`${key}:changed`, { key, value: state[key] });
                return removed;
            }
            return null;
        },

        /**
         * Find and remove item from array state
         * @param {string} key - State key (must be array)
         * @param {Function} predicate - Function to find item
         * @returns {*} Removed item
         */
        remove(key, predicate) {
            if (Array.isArray(state[key])) {
                const index = state[key].findIndex(predicate);
                if (index !== -1) {
                    return this.removeAt(key, index);
                }
            }
            return null;
        },

        /**
         * Update item in array state
         * @param {string} key - State key (must be array)
         * @param {number} index - Index to update
         * @param {*} newValue - New value
         */
        updateAt(key, index, newValue) {
            if (Array.isArray(state[key]) && index >= 0 && index < state[key].length) {
                const oldValue = state[key][index];
                state[key][index] = newValue;
                this.emit(`${key}:updated`, { key, index, oldValue, newValue });
                this.emit(`${key}:changed`, { key, value: state[key] });
            }
        },

        /**
         * Reset state to initial values
         */
        reset() {
            state.textEdits = [];
            state.textOverlays = [];
            state.signatures = [];
            state.annotations = [];
            state.actionHistory = [];
            state.selectedOverlay = null;
            state.selectedSignature = null;
            state.selectedLayerId = null;
            this.emit('state:reset', state);
        },

        /**
         * Add action to history for undo support
         * @param {Object} action - Action object with type and data
         */
        addToHistory(action) {
            state.actionHistory.push(action);
            // Clear redo history when new action is added
            state.redoHistory = [];
            this.emit('history:added', action);
        },

        /**
         * Pop last action from history
         * @returns {Object|null} Last action or null
         */
        popHistory() {
            const action = state.actionHistory.pop();
            if (action) {
                this.emit('history:popped', action);
            }
            return action || null;
        },

        /**
         * Add action to redo history
         * @param {Object} action - Action object with type and data
         */
        addToRedoHistory(action) {
            state.redoHistory.push(action);
            this.emit('redoHistory:added', action);
        },

        /**
         * Pop last action from redo history
         * @returns {Object|null} Last action or null
         */
        popRedoHistory() {
            const action = state.redoHistory.pop();
            if (action) {
                this.emit('redoHistory:popped', action);
            }
            return action || null;
        },

        /**
         * Check if redo is available
         * @returns {boolean}
         */
        canRedo() {
            return state.redoHistory.length > 0;
        }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxCore;
}
