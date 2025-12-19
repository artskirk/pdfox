/**
 * PDFOX Share Viewer
 * View-only interface for shared documents
 */
const ShareViewer = (function() {
    'use strict';

    // PDF.js configuration
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // State
    let hash = null;
    let metadata = null;
    let pdfDoc = null;
    let currentPage = 1;
    let totalPages = 0;
    let scale = 1.0;
    let isPasswordVerified = false;

    // DOM Elements
    const elements = {};

    /**
     * Initialize the viewer
     */
    async function init() {
        // Cache DOM elements
        cacheElements();

        // Extract hash from URL
        const pathParts = window.location.pathname.split('/share/');
        hash = pathParts[1];

        if (!hash) {
            showNotFound();
            return;
        }

        try {
            // Fetch share metadata
            const response = await fetch(`/api/v1/share/${hash}`);

            if (!response.ok) {
                showNotFound();
                return;
            }

            metadata = await response.json();

            // Update document name
            if (elements.docName) {
                elements.docName.textContent = metadata.fileName || 'Shared Document';
            }

            // Check if password protected
            if (metadata.hasPassword) {
                showPasswordPrompt();
            } else {
                await loadDocument();
            }

        } catch (error) {
            console.error('Error initializing viewer:', error);
            showNotFound();
        }
    }

    /**
     * Cache DOM elements
     */
    function cacheElements() {
        elements.loadingState = document.getElementById('loadingState');
        elements.notFoundState = document.getElementById('notFoundState');
        elements.passwordState = document.getElementById('passwordState');
        elements.pdfViewer = document.getElementById('pdfViewer');
        elements.pdfCanvas = document.getElementById('pdfCanvas');
        elements.pageControls = document.getElementById('pageControls');
        elements.docName = document.getElementById('docName');
        elements.downloadBtn = document.getElementById('downloadBtn');
        elements.currentPage = document.getElementById('currentPage');
        elements.totalPages = document.getElementById('totalPages');
        elements.prevBtn = document.getElementById('prevBtn');
        elements.nextBtn = document.getElementById('nextBtn');
        elements.zoomLevel = document.getElementById('zoomLevel');
        elements.passwordInput = document.getElementById('passwordInput');
        elements.passwordError = document.getElementById('passwordError');
    }

    /**
     * Show loading state
     */
    function showLoading() {
        hideAllStates();
        if (elements.loadingState) elements.loadingState.style.display = 'flex';
    }

    /**
     * Show not found state
     */
    function showNotFound() {
        hideAllStates();
        if (elements.notFoundState) elements.notFoundState.style.display = 'flex';
        if (elements.downloadBtn) elements.downloadBtn.style.display = 'none';
    }

    /**
     * Show password prompt
     */
    function showPasswordPrompt() {
        hideAllStates();
        if (elements.passwordState) elements.passwordState.style.display = 'flex';
        if (elements.downloadBtn) elements.downloadBtn.style.display = 'none';
        if (elements.passwordInput) elements.passwordInput.focus();
    }

    /**
     * Show PDF viewer
     */
    function showViewer() {
        hideAllStates();
        if (elements.pdfViewer) elements.pdfViewer.style.display = 'flex';
        if (elements.pageControls) elements.pageControls.style.display = 'flex';
        if (elements.downloadBtn) elements.downloadBtn.style.display = 'flex';
    }

    /**
     * Hide all states
     */
    function hideAllStates() {
        if (elements.loadingState) elements.loadingState.style.display = 'none';
        if (elements.notFoundState) elements.notFoundState.style.display = 'none';
        if (elements.passwordState) elements.passwordState.style.display = 'none';
        if (elements.pdfViewer) elements.pdfViewer.style.display = 'none';
        if (elements.pageControls) elements.pageControls.style.display = 'none';
    }

    // Lockout state
    let lockoutTimer = null;

    /**
     * Verify password
     */
    async function verifyPassword(event) {
        event.preventDefault();

        const password = elements.passwordInput?.value;
        if (!password) return;

        // Clear previous error
        if (elements.passwordError) {
            elements.passwordError.textContent = '';
        }

        // Disable form while verifying
        const submitBtn = document.querySelector('.share-password-btn');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const response = await fetch(`/api/v1/share/${hash}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            const data = await response.json();

            if (response.ok && data.verified) {
                isPasswordVerified = true;
                await loadDocument();
            } else if (data.locked) {
                // User is locked out
                startLockoutCountdown(data.remainingSeconds || 300);
            } else {
                if (elements.passwordError) {
                    elements.passwordError.textContent = data.message || 'Invalid password';
                    // Use warning orange for attempts remaining, red when almost locked
                    elements.passwordError.style.color = data.attemptsRemaining <= 1 ? '#ff4444' : '#ff9800';
                }
                if (elements.passwordInput) {
                    elements.passwordInput.select();
                }
                if (submitBtn) submitBtn.disabled = false;
            }

        } catch (error) {
            console.error('Error verifying password:', error);
            if (elements.passwordError) {
                elements.passwordError.textContent = 'Failed to verify password. Please try again.';
                elements.passwordError.style.color = '#ff9800';
            }
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    /**
     * Start lockout countdown
     */
    function startLockoutCountdown(seconds) {
        const submitBtn = document.querySelector('.share-password-btn');

        // Disable inputs
        if (elements.passwordInput) {
            elements.passwordInput.disabled = true;
            elements.passwordInput.value = '';
        }
        if (submitBtn) submitBtn.disabled = true;

        // Clear any existing timer
        if (lockoutTimer) clearInterval(lockoutTimer);

        let remaining = seconds;
        updateLockoutMessage(remaining);

        lockoutTimer = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(lockoutTimer);
                lockoutTimer = null;
                // Re-enable form
                if (elements.passwordInput) {
                    elements.passwordInput.disabled = false;
                    elements.passwordInput.focus();
                }
                if (submitBtn) submitBtn.disabled = false;
                if (elements.passwordError) {
                    elements.passwordError.textContent = 'You can try again now.';
                    elements.passwordError.style.color = '#4CAF50';
                    setTimeout(() => {
                        if (elements.passwordError) {
                            elements.passwordError.textContent = '';
                            elements.passwordError.style.color = '';
                        }
                    }, 3000);
                }
            } else {
                updateLockoutMessage(remaining);
            }
        }, 1000);
    }

    /**
     * Update lockout message with countdown
     */
    function updateLockoutMessage(seconds) {
        if (!elements.passwordError) return;
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const timeStr = minutes > 0
            ? `${minutes}:${secs.toString().padStart(2, '0')}`
            : `${secs}s`;
        elements.passwordError.textContent = `Too many failed attempts. Try again in ${timeStr}`;
        elements.passwordError.style.color = '#ff6b6b';
    }

    /**
     * Load and render the PDF document
     */
    async function loadDocument() {
        showLoading();

        try {
            // Fetch PDF data
            const response = await fetch(`/api/v1/share/${hash}/view`);

            if (!response.ok) {
                showNotFound();
                return;
            }

            const pdfData = await response.arrayBuffer();

            // Load PDF with PDF.js
            pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
            totalPages = pdfDoc.numPages;

            // Update UI
            if (elements.totalPages) elements.totalPages.textContent = totalPages;
            updatePageControls();

            // Render first page
            showViewer();
            await renderPage(1);

            // Handle window resize
            window.addEventListener('resize', debounce(() => renderPage(currentPage), 200));

        } catch (error) {
            console.error('Error loading document:', error);
            showNotFound();
        }
    }

    /**
     * Render a specific page
     */
    async function renderPage(pageNum) {
        if (!pdfDoc || pageNum < 1 || pageNum > totalPages) return;

        currentPage = pageNum;

        try {
            const page = await pdfDoc.getPage(pageNum);

            // Calculate scale to fit container
            const container = elements.pdfViewer;
            const containerWidth = container ? container.clientWidth - 40 : 800;
            const containerHeight = window.innerHeight - 200;

            const viewport = page.getViewport({ scale: 1 });
            const scaleX = containerWidth / viewport.width;
            const scaleY = containerHeight / viewport.height;
            const fitScale = Math.min(scaleX, scaleY, 2); // Max 2x

            const finalScale = fitScale * scale;
            const scaledViewport = page.getViewport({ scale: finalScale });

            // Setup canvas
            const canvas = elements.pdfCanvas;
            const context = canvas.getContext('2d');

            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;

            // Render
            await page.render({
                canvasContext: context,
                viewport: scaledViewport
            }).promise;

            // Update page info
            if (elements.currentPage) elements.currentPage.textContent = pageNum;
            updatePageControls();

        } catch (error) {
            console.error('Error rendering page:', error);
        }
    }

    /**
     * Update page navigation controls
     */
    function updatePageControls() {
        if (elements.prevBtn) {
            elements.prevBtn.disabled = currentPage <= 1;
        }
        if (elements.nextBtn) {
            elements.nextBtn.disabled = currentPage >= totalPages;
        }
        if (elements.zoomLevel) {
            elements.zoomLevel.textContent = Math.round(scale * 100) + '%';
        }
    }

    /**
     * Go to previous page
     */
    function prevPage() {
        if (currentPage > 1) {
            renderPage(currentPage - 1);
        }
    }

    /**
     * Go to next page
     */
    function nextPage() {
        if (currentPage < totalPages) {
            renderPage(currentPage + 1);
        }
    }

    /**
     * Zoom in
     */
    function zoomIn() {
        if (scale < 3) {
            scale = Math.min(scale + 0.25, 3);
            renderPage(currentPage);
        }
    }

    /**
     * Zoom out
     */
    function zoomOut() {
        if (scale > 0.25) {
            scale = Math.max(scale - 0.25, 0.25);
            renderPage(currentPage);
        }
    }

    /**
     * Download the document
     */
    function download() {
        if (!hash) return;

        const link = document.createElement('a');
        link.href = `/api/v1/share/${hash}/download`;
        link.download = metadata?.fileName || 'document.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Debounce helper
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', init);

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (elements.passwordState?.style.display === 'flex') return; // Ignore if password prompt is shown

        switch (e.key) {
            case 'ArrowLeft':
                prevPage();
                break;
            case 'ArrowRight':
                nextPage();
                break;
            case '+':
            case '=':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    zoomIn();
                }
                break;
            case '-':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    zoomOut();
                }
                break;
        }
    });

    // Public API
    return {
        init,
        verifyPassword,
        prevPage,
        nextPage,
        zoomIn,
        zoomOut,
        download
    };
})();
