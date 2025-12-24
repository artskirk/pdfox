/**
 * PDFOX Editor Analytics Module
 * Tracks user interactions within the PDF editor
 */

const EditorAnalytics = (function() {
    'use strict';

    // Debounce timers
    const debounceTimers = {};
    const DEBOUNCE_DELAY = 2000; // 2 seconds between same events

    // Track recently sent events to avoid duplicates
    const recentEvents = new Set();
    const EVENT_COOLDOWN = 5000; // 5 seconds cooldown for same event

    /**
     * Send tracking event to server
     */
    function send(event, details = {}) {
        // Create event key for deduplication
        const eventKey = `${event}:${JSON.stringify(details)}`;

        // Skip if recently sent
        if (recentEvents.has(eventKey)) {
            return;
        }

        // Add to recent events
        recentEvents.add(eventKey);
        setTimeout(() => recentEvents.delete(eventKey), EVENT_COOLDOWN);

        // Send to server
        fetch('/api/v1/analytics/editor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, details })
        }).catch(() => {});
    }

    /**
     * Debounced send (for frequent events)
     */
    function sendDebounced(event, details = {}) {
        const key = event;

        if (debounceTimers[key]) {
            clearTimeout(debounceTimers[key]);
        }

        debounceTimers[key] = setTimeout(() => {
            send(event, details);
            delete debounceTimers[key];
        }, DEBOUNCE_DELAY);
    }

    /**
     * Format file size
     */
    function formatFileSize(bytes) {
        if (!bytes) return 'N/A';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    /**
     * Track file upload
     */
    function trackFileUpload(file, pageCount) {
        send('file_uploaded', {
            fileName: file?.name || 'document.pdf',
            fileSize: formatFileSize(file?.size),
            pageCount: pageCount || 'Unknown'
        });
    }

    /**
     * Track tool selection
     */
    function trackToolUsed(toolName, action = 'Selected') {
        sendDebounced('tool_used', {
            tool: toolName,
            action: action
        });
    }

    /**
     * Track document save
     */
    function trackDocumentSaved(fileName, fileSize) {
        send('document_saved', {
            fileName: fileName || 'document.pdf',
            fileSize: formatFileSize(fileSize)
        });
    }

    /**
     * Track document export
     */
    function trackDocumentExported(fileName, format) {
        send('document_exported', {
            fileName: fileName || 'document.pdf',
            format: format || 'PDF'
        });
    }

    /**
     * Track share initiated
     */
    function trackShareInitiated(fileName, method) {
        send('share_initiated', {
            fileName: fileName || 'document.pdf',
            method: method || 'Share Dialog'
        });
    }

    /**
     * Track generic button/action
     */
    function trackButtonClick(buttonName, category = 'button') {
        sendDebounced('button_click', {
            event: buttonName,
            category: category,
            target: buttonName
        });
    }

    /**
     * Initialize tracking listeners
     */
    function init() {
        // Hook into PDFEditorApp if available
        if (typeof window.PDFEditorApp !== 'undefined') {
            hookIntoEditor();
        } else {
            // Wait for editor to load
            window.addEventListener('load', () => {
                setTimeout(hookIntoEditor, 500);
            });
        }

        // Track toolbar button clicks
        document.addEventListener('click', handleClick, true);
    }

    /**
     * Handle click events
     */
    function handleClick(e) {
        const target = e.target;

        // Toolbar buttons
        if (target.closest('.tool-button')) {
            const btn = target.closest('.tool-button');
            const toolName = btn.dataset.tool || btn.textContent?.trim() || 'Unknown Tool';
            trackToolUsed(toolName, 'Clicked');
            return;
        }

        // Save button
        if (target.closest('#saveButton, [data-action="save"], .save-btn')) {
            const fileName = window.PDFEditorApp?.currentFileName || 'document.pdf';
            trackDocumentSaved(fileName);
            return;
        }

        // Share button
        if (target.closest('#shareButton, [data-action="share"], .share-btn, #shareDocument')) {
            const fileName = window.PDFEditorApp?.currentFileName || 'document.pdf';
            trackShareInitiated(fileName, 'Share Button');
            return;
        }

        // Export/Download buttons
        if (target.closest('#downloadButton, [data-action="download"], [data-action="export"], .download-btn')) {
            const fileName = window.PDFEditorApp?.currentFileName || 'document.pdf';
            trackDocumentExported(fileName, 'PDF');
            return;
        }

        // Pro feature buttons
        if (target.closest('.pro-feature, [data-pro="true"]')) {
            trackButtonClick('Pro Feature Attempted', 'feature');
            return;
        }

        // Page navigation
        if (target.closest('.page-nav, .prev-page, .next-page')) {
            trackButtonClick('Page Navigation', 'navigation');
            return;
        }

        // Zoom controls
        if (target.closest('.zoom-in, .zoom-out, [data-action="zoom"]')) {
            trackToolUsed('Zoom', 'Used');
            return;
        }
    }

    /**
     * Hook into the PDF Editor application
     */
    function hookIntoEditor() {
        const app = window.PDFEditorApp;
        if (!app) return;

        // Hook file upload
        const originalLoadPDF = app.loadPDF;
        if (originalLoadPDF) {
            app.loadPDF = function(file) {
                const result = originalLoadPDF.apply(this, arguments);

                // Track after load
                if (result && result.then) {
                    result.then(() => {
                        const pageCount = app.pdfDoc?.numPages || app.totalPages || 'Unknown';
                        trackFileUpload(file, pageCount);
                    });
                } else {
                    setTimeout(() => {
                        const pageCount = app.pdfDoc?.numPages || app.totalPages || 'Unknown';
                        trackFileUpload(file, pageCount);
                    }, 1000);
                }

                return result;
            };
        }

        // Hook tool selection
        const originalSetTool = app.setActiveTool || app.setCurrentTool;
        if (originalSetTool) {
            const toolSetter = originalSetTool.bind(app);
            app.setActiveTool = app.setCurrentTool = function(tool) {
                trackToolUsed(tool, 'Selected');
                return toolSetter(tool);
            };
        }

        // Hook save function
        const originalSave = app.savePDF || app.save;
        if (originalSave) {
            const saveFn = originalSave.bind(app);
            app.savePDF = app.save = function() {
                trackDocumentSaved(app.currentFileName);
                return saveFn.apply(this, arguments);
            };
        }

        // Hook export function
        const originalExport = app.exportPDF || app.download;
        if (originalExport) {
            const exportFn = originalExport.bind(app);
            app.exportPDF = app.download = function() {
                trackDocumentExported(app.currentFileName, 'PDF');
                return exportFn.apply(this, arguments);
            };
        }
    }

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    return {
        trackFileUpload,
        trackToolUsed,
        trackDocumentSaved,
        trackDocumentExported,
        trackShareInitiated,
        trackButtonClick,
        send
    };
})();

// Make available globally
window.EditorAnalytics = EditorAnalytics;
