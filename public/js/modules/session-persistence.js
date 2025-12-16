/**
 * PDFOX Session Persistence Module
 * Automatically saves and restores user editing state
 */

const PDFoxSessionPersistence = (function() {
    'use strict';

    const STORAGE_KEY = 'pdfox_session_state';
    const VERSION = 1;
    const AUTOSAVE_DELAY = 1000; // 1 second debounce

    let core = null;
    let saveTimeout = null;
    let isRestoring = false;
    let pdfHash = null;

    /**
     * Initialize the session persistence module
     */
    function init() {
        core = PDFoxCore;

        // Subscribe to state changes for auto-save
        subscribeToChanges();

        console.log('[SessionPersistence] Initialized');
    }

    /**
     * Subscribe to core state changes for auto-save
     */
    function subscribeToChanges() {
        const eventsToWatch = [
            'textEdits:changed',
            'textOverlays:changed',
            'annotations:changed',
            'signatures:changed',
            'currentPage:changed',
            'scale:changed',
            'currentTool:changed'
        ];

        eventsToWatch.forEach(event => {
            core.on(event, () => {
                if (!isRestoring) {
                    debouncedSave();
                }
            });
        });

        // Also watch stamps and patches via their events
        core.on('stamps:changed', () => {
            if (!isRestoring) debouncedSave();
        });
        core.on('patches:changed', () => {
            if (!isRestoring) debouncedSave();
        });
    }

    /**
     * Debounced save to avoid too frequent writes
     */
    function debouncedSave() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(() => {
            save();
        }, AUTOSAVE_DELAY);
    }

    /**
     * Generate a simple hash of PDF bytes for identification
     */
    function generatePdfHash(pdfBytes) {
        if (!pdfBytes) return null;

        // Simple hash: use first 1000 bytes + length
        const sample = pdfBytes.slice(0, 1000);
        let hash = pdfBytes.length;
        for (let i = 0; i < sample.length; i++) {
            hash = ((hash << 5) - hash) + sample[i];
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(16);
    }

    /**
     * Save current state to localStorage
     */
    function save() {
        try {
            const pdfBytes = core.get('pdfBytes');
            if (!pdfBytes) {
                // No PDF loaded, nothing to save
                return;
            }

            // Generate PDF hash for later verification
            pdfHash = generatePdfHash(pdfBytes);

            // Get stamps and patches from their modules
            let stamps = [];
            let patches = [];

            if (typeof PDFoxStamps !== 'undefined' && PDFoxStamps.getStamps) {
                stamps = PDFoxStamps.getStamps();
            }
            if (typeof PDFoxPatch !== 'undefined' && PDFoxPatch.getPatches) {
                patches = PDFoxPatch.getPatches();
            }

            // Get filename from DOM
            const docNameEl = document.getElementById('docName');
            const pdfFileName = docNameEl ? docNameEl.textContent : 'document.pdf';

            const sessionState = {
                version: VERSION,
                timestamp: Date.now(),
                pdfHash: pdfHash,
                pdfFileName: pdfFileName,
                currentPage: core.get('currentPage'),
                scale: core.get('scale'),
                currentTool: core.get('currentTool'),
                textEdits: core.get('textEdits') || [],
                textOverlays: core.get('textOverlays') || [],
                annotations: core.get('annotations') || [],
                signatures: core.get('signatures') || [],
                stamps: stamps,
                patches: patches,
                pageRotations: core.get('pageRotations') || {}
            };

            localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionState));
            console.log('[SessionPersistence] State saved');
        } catch (error) {
            console.error('[SessionPersistence] Error saving state:', error);
        }
    }

    /**
     * Check if a saved session exists
     */
    function hasSession() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored !== null;
        } catch {
            return false;
        }
    }

    /**
     * Get stored session data
     */
    function getSession() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return null;

            const session = JSON.parse(stored);

            // Version check
            if (session.version !== VERSION) {
                console.warn('[SessionPersistence] Session version mismatch, clearing');
                clear();
                return null;
            }

            return session;
        } catch (error) {
            console.error('[SessionPersistence] Error reading session:', error);
            clear();
            return null;
        }
    }

    /**
     * Restore session state after PDF is loaded
     * @param {Uint8Array} loadedPdfBytes - The loaded PDF bytes to verify against
     * @returns {boolean} Whether restoration was successful
     */
    function restore(loadedPdfBytes) {
        try {
            const session = getSession();
            if (!session) {
                console.log('[SessionPersistence] No session to restore');
                return false;
            }

            // Verify PDF hash matches
            const loadedHash = generatePdfHash(loadedPdfBytes);
            if (session.pdfHash && loadedHash !== session.pdfHash) {
                console.log('[SessionPersistence] PDF hash mismatch, different file loaded');
                clear();
                return false;
            }

            console.log('[SessionPersistence] Restoring session...');
            isRestoring = true;

            // Restore core state
            if (session.textEdits && session.textEdits.length > 0) {
                core.set('textEdits', session.textEdits);
            }
            if (session.textOverlays && session.textOverlays.length > 0) {
                core.set('textOverlays', session.textOverlays);
            }
            if (session.annotations && session.annotations.length > 0) {
                core.set('annotations', session.annotations);
            }
            if (session.signatures && session.signatures.length > 0) {
                core.set('signatures', session.signatures);
            }
            if (session.pageRotations) {
                core.set('pageRotations', session.pageRotations);
            }

            // Restore stamps
            if (session.stamps && session.stamps.length > 0 && typeof PDFoxStamps !== 'undefined') {
                session.stamps.forEach(stamp => {
                    if (PDFoxStamps.restoreStamp) {
                        PDFoxStamps.restoreStamp(stamp);
                    }
                });
            }

            // Restore patches
            if (session.patches && session.patches.length > 0 && typeof PDFoxPatch !== 'undefined') {
                session.patches.forEach(patch => {
                    if (PDFoxPatch.restore) {
                        PDFoxPatch.restore(patch);
                    }
                });
            }

            // Restore view state
            if (session.currentPage) {
                core.set('currentPage', session.currentPage);
            }
            if (session.scale) {
                core.set('scale', session.scale);
            }
            if (session.currentTool) {
                core.set('currentTool', session.currentTool);
            }

            isRestoring = false;
            console.log('[SessionPersistence] Session restored successfully');

            // Emit event for other modules to react
            core.emit('session:restored', session);

            return true;
        } catch (error) {
            console.error('[SessionPersistence] Error restoring session:', error);
            isRestoring = false;
            return false;
        }
    }

    /**
     * Clear saved session
     */
    function clear() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log('[SessionPersistence] Session cleared');
        } catch (error) {
            console.error('[SessionPersistence] Error clearing session:', error);
        }
    }

    /**
     * Force save (bypass debounce)
     */
    function forceSave() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        save();
    }

    // Public API
    return {
        init,
        save: forceSave,
        restore,
        clear,
        hasSession,
        getSession
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxSessionPersistence;
}
