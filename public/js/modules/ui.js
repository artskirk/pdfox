/**
 * PDFOX UI Module
 * Handles modals, notifications, and UI components
 * Single Responsibility: UI interactions and feedback
 */

const PDFoxUI = (function() {
    'use strict';

    const { $, createElement } = PDFoxUtils;

    // Loading overlay reference
    let loadingOverlay = null;

    return {
        /**
         * Show loading overlay
         * @param {string} message - Loading message
         */
        showLoading(message = 'Loading...') {
            if (loadingOverlay) {
                loadingOverlay.querySelector('div:last-child').textContent = message;
                return;
            }

            loadingOverlay = createElement('div', { className: 'loading', id: 'loadingOverlay' }, [
                createElement('div', { className: 'loading-content' }, [
                    createElement('div', { className: 'spinner' }),
                    createElement('div', {}, message)
                ])
            ]);

            document.body.appendChild(loadingOverlay);
        },

        /**
         * Hide loading overlay
         */
        hideLoading() {
            if (loadingOverlay) {
                loadingOverlay.remove();
                loadingOverlay = null;
            }
        },

        /**
         * Show notification message
         * @param {string} message - Message to show
         * @param {string} type - Type: 'success', 'error', 'warning', 'info'
         * @param {number} duration - Duration in milliseconds
         */
        showNotification(message, type = 'info', duration = 3000) {
            const colors = {
                success: '#4CAF50',
                error: '#E50914',
                warning: '#ff9800',
                info: '#2196F3'
            };

            const icons = {
                success: '✓',
                error: '✕',
                warning: '⚠',
                info: 'ℹ'
            };

            const notification = createElement('div', {
                style: {
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    background: '#1a1a1a',
                    color: '#ffffff',
                    padding: '16px 24px',
                    borderRadius: '10px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                    zIndex: '10001',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    animation: 'slideUp 0.3s ease-out',
                    borderLeft: `4px solid ${colors[type]}`,
                    maxWidth: '400px'
                }
            }, [
                createElement('span', {
                    style: {
                        fontSize: '20px',
                        color: colors[type]
                    }
                }, icons[type]),
                createElement('span', {}, message)
            ]);

            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.animation = 'fadeIn 0.3s ease-out reverse';
                setTimeout(() => notification.remove(), 300);
            }, duration);
        },

        /**
         * Show alert modal
         * @param {string} message - Alert message
         * @param {string} type - Type: 'success', 'error', 'warning', 'info'
         * @returns {Promise}
         */
        showAlert(message, type = 'info') {
            return new Promise(resolve => {
                const colors = {
                    success: '#4CAF50',
                    error: '#E50914',
                    warning: '#ff9800',
                    info: '#2196F3'
                };

                const icons = {
                    success: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="${colors[type]}" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M9 12l2 2 4-4"/>
                    </svg>`,
                    error: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="${colors[type]}" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M15 9l-6 6M9 9l6 6"/>
                    </svg>`,
                    warning: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="${colors[type]}" stroke-width="2">
                        <path d="M12 9v4M12 17h.01"/>
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    </svg>`,
                    info: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="${colors[type]}" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 16v-4M12 8h.01"/>
                    </svg>`
                };

                const modal = createElement('div', {
                    className: 'custom-modal',
                    id: 'alertModal'
                });

                // Make modal visible (CSS has display: none by default)
                modal.style.display = 'flex';

                modal.innerHTML = `
                    <div class="custom-modal-content">
                        <div class="modal-icon">${icons[type]}</div>
                        <div class="modal-message">${message}</div>
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn-primary" id="alertOkBtn">OK</button>
                        </div>
                    </div>
                `;

                document.body.appendChild(modal);

                const okBtn = modal.querySelector('#alertOkBtn');
                const closeModal = () => {
                    document.removeEventListener('keydown', escHandler);
                    modal.remove();
                    resolve();
                };

                okBtn.addEventListener('click', closeModal);
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) closeModal();
                });

                // Escape key to close
                const escHandler = (e) => {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        closeModal();
                    }
                };
                document.addEventListener('keydown', escHandler);
            });
        },

        /**
         * Show confirmation modal
         * @param {string} message - Confirmation message
         * @param {Function} callback - Callback with result (true/false)
         */
        showConfirm(message, callback) {
            // Prevent multiple modals
            const existingModal = document.getElementById('confirmModal');
            if (existingModal) {
                existingModal.remove();
            }

            const modal = createElement('div', {
                className: 'custom-modal',
                id: 'confirmModal'
            });

            // Make modal visible (CSS has display: none by default)
            modal.style.display = 'flex';

            modal.innerHTML = `
                <div class="custom-modal-content">
                    <div class="modal-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ff9800" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 8v4M12 16h.01"/>
                        </svg>
                    </div>
                    <div class="modal-message">${message}</div>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn-secondary" id="confirmCancelBtn">Cancel</button>
                        <button class="modal-btn modal-btn-primary" id="confirmOkBtn">Confirm</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Escape key handler (declared early so closeModal can reference it)
            let escHandler;

            const closeModal = (result) => {
                document.removeEventListener('keydown', escHandler);
                modal.remove();
                // Use setTimeout to prevent click events from falling through to elements beneath
                if (callback) {
                    setTimeout(() => callback(result), 0);
                }
            };

            modal.querySelector('#confirmOkBtn').addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                closeModal(true);
            });
            modal.querySelector('#confirmCancelBtn').addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                closeModal(false);
            });
            modal.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.target === modal) closeModal(false);
            });

            // Keyboard handler for Escape (cancel) and Enter (confirm)
            escHandler = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    closeModal(false);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    closeModal(true);
                }
            };
            document.addEventListener('keydown', escHandler);

            // Focus the confirm button for better accessibility
            modal.querySelector('#confirmOkBtn').focus();
        },

        /**
         * Set font size for input and display elements
         * @param {string} inputId - Input element ID
         * @param {string} displayId - Display element ID
         * @param {number} size - Font size value
         */
        setFontSize(inputId, displayId, size) {
            const input = document.getElementById(inputId);
            const display = document.getElementById(displayId);
            if (input) input.value = size;
            if (display) display.textContent = size + 'px';
        },

        /**
         * Update tool button active state
         * @param {string} tool - Tool name
         */
        setActiveTool(tool) {
            const buttons = document.querySelectorAll('.tool-btn');
            buttons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tool === tool);
            });
        },

        /**
         * Update page info display
         * @param {number} current - Current page
         * @param {number} total - Total pages
         */
        updatePageInfo(current, total) {
            const pageInfo = document.getElementById('pageInfo');
            if (pageInfo) {
                pageInfo.textContent = `Page ${current} of ${total}`;
            }

            const prevBtn = document.getElementById('prevPage');
            const nextBtn = document.getElementById('nextPage');

            if (prevBtn) prevBtn.disabled = current <= 1;
            if (nextBtn) nextBtn.disabled = current >= total;
        },

        /**
         * Show/hide element
         * @param {string|Element} el - Element or selector
         * @param {boolean} show - Show or hide
         */
        toggle(el, show) {
            const element = typeof el === 'string' ? document.querySelector(el) : el;
            if (element) {
                element.style.display = show ? '' : 'none';
            }
        }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxUI;
}
