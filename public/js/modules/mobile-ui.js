/**
 * PDFOX Mobile UI Module
 * Handles mobile-specific UI components and touch interactions
 */

(function() {
    'use strict';

    // Check if we're on a mobile/tablet device
    const isMobile = () => window.innerWidth <= 768;
    const isTouch = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Mobile UI state
    const state = {
        sidebarOpen: false,
        toolDrawerOpen: false,
        notificationDismissed: localStorage.getItem('pdfox_mobile_notification_dismissed') === 'true'
    };

    // DOM elements cache
    let elements = {};

    /**
     * Initialize mobile UI
     */
    function init() {
        // Cache DOM elements
        cacheElements();

        // Create mobile UI components if they don't exist
        createMobileComponents();

        // Bind event listeners
        bindEvents();

        // Handle initial state
        handleResize();

        // Show notification on mobile if not dismissed
        if (isMobile() && !state.notificationDismissed) {
            showNotification();
        }

        // Initialize mobile PDF viewing (pinch-zoom, scroll fix, auto-fit)
        initMobilePDFViewing();

        console.log('Mobile UI initialized');
    }

    /**
     * Cache DOM elements
     */
    function cacheElements() {
        elements = {
            body: document.body,
            header: document.querySelector('.header'),
            sidebar: document.querySelector('.sidebar'),
            toolbar: document.querySelector('.toolbar'),
            canvasContainer: document.querySelector('.canvas-container')
        };
    }

    /**
     * Create mobile UI components
     */
    function createMobileComponents() {
        // Mobile notification banner
        if (!document.querySelector('.mobile-notification')) {
            const notification = document.createElement('div');
            notification.className = 'mobile-notification';
            notification.innerHTML = `
                <div class="mobile-notification-content">
                    <div class="mobile-notification-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 2.75c1.24 0 2.25 1.01 2.25 2.25s-1.01 2.25-2.25 2.25S9.75 10.24 9.75 9 10.76 6.75 12 6.75zM17 17H7v-1.5c0-1.67 3.33-2.5 5-2.5s5 .83 5 2.5V17z"/>
                        </svg>
                    </div>
                    <div class="mobile-notification-text">
                        <strong>Mobile Mode</strong>
                        For the full experience with all tools, visit PDFOX on desktop.
                    </div>
                    <button class="mobile-notification-close" aria-label="Dismiss">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            `;
            document.body.insertBefore(notification, document.body.firstChild);
        }

        // Mobile menu toggle button (hamburger)
        if (!document.querySelector('.mobile-menu-toggle') && elements.header) {
            const menuToggle = document.createElement('button');
            menuToggle.className = 'mobile-menu-toggle';
            menuToggle.setAttribute('aria-label', 'Open sidebar');
            menuToggle.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 12h18M3 6h18M3 18h18"/>
                </svg>
            `;
            const headerLogoLink = elements.header.querySelector('.header-logo-link');
            if (headerLogoLink) {
                headerLogoLink.parentNode.insertBefore(menuToggle, headerLogoLink);
            }
        }

        // Sidebar backdrop
        if (!document.querySelector('.sidebar-backdrop')) {
            const backdrop = document.createElement('div');
            backdrop.className = 'sidebar-backdrop';
            document.body.appendChild(backdrop);
        }

        // Sidebar close button
        if (elements.sidebar && !elements.sidebar.querySelector('.sidebar-close-btn')) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'sidebar-close-btn';
            closeBtn.setAttribute('aria-label', 'Close sidebar');
            closeBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            `;
            elements.sidebar.insertBefore(closeBtn, elements.sidebar.firstChild);
        }

        // Mobile tool FAB
        if (!document.querySelector('.mobile-tool-fab')) {
            const fab = document.createElement('button');
            fab.className = 'mobile-tool-fab';
            fab.setAttribute('aria-label', 'Open tools');
            fab.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
            `;
            document.body.appendChild(fab);
        }

        // Mobile tool drawer
        if (!document.querySelector('.mobile-tool-drawer')) {
            const drawer = document.createElement('div');
            drawer.className = 'mobile-tool-drawer';
            drawer.innerHTML = `
                <div class="mobile-tool-drawer-handle"></div>
                <div class="mobile-tool-drawer-header">
                    <span class="mobile-tool-drawer-title">Tools</span>
                    <button class="mobile-tool-drawer-close" aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="mobile-tool-grid">
                    ${generateToolGridItems()}
                </div>
            `;
            document.body.appendChild(drawer);
        }

        // Mobile page bar
        if (!document.querySelector('.mobile-page-bar')) {
            const pageBar = document.createElement('div');
            pageBar.className = 'mobile-page-bar';
            pageBar.innerHTML = `
                <div class="mobile-page-bar-content">
                    <button class="mobile-page-btn" id="mobilePrevPage" aria-label="Previous page">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M15 18l-6-6 6-6"/>
                        </svg>
                    </button>
                    <div class="mobile-page-info">
                        Page <strong id="mobileCurrentPage">1</strong> of <span id="mobileTotalPages">1</span>
                    </div>
                    <div class="mobile-zoom-controls">
                        <button class="mobile-page-btn" id="mobileZoomOut" aria-label="Zoom out">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M8 11h6"/>
                            </svg>
                        </button>
                        <button class="mobile-page-btn" id="mobileZoomIn" aria-label="Zoom in">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/>
                            </svg>
                        </button>
                    </div>
                    <button class="mobile-page-btn" id="mobileNextPage" aria-label="Next page">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 18l6-6-6-6"/>
                        </svg>
                    </button>
                </div>
            `;
            document.body.appendChild(pageBar);
        }

        // Update cached elements
        elements.notification = document.querySelector('.mobile-notification');
        elements.menuToggle = document.querySelector('.mobile-menu-toggle');
        elements.sidebarBackdrop = document.querySelector('.sidebar-backdrop');
        elements.sidebarCloseBtn = document.querySelector('.sidebar-close-btn');
        elements.toolFab = document.querySelector('.mobile-tool-fab');
        elements.toolDrawer = document.querySelector('.mobile-tool-drawer');
        elements.pageBar = document.querySelector('.mobile-page-bar');
    }

    /**
     * Generate tool grid items for mobile drawer
     */
    function generateToolGridItems() {
        const tools = [
            { id: 'select', icon: 'M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z', name: 'Select' },
            { id: 'draw', icon: 'M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-1.5M2 21l3-9 6 6-9 3zM14 4l3-3 6 6-3 3-6-6z', name: 'Draw' },
            { id: 'text', icon: 'M4 7V4h16v3M9 20h6M12 4v16', name: 'Text' },
            { id: 'signature', icon: 'M17.5 3A3.5 3.5 0 0 1 21 6.5c0 .753-.249 1.451-.668 2.018L9.414 19.414c-.252.252-.563.431-.903.517l-4.085 1.022a.5.5 0 0 1-.607-.607l1.022-4.085c.086-.34.265-.651.517-.903L16.276 4.42A3.479 3.479 0 0 1 17.5 3z', name: 'Sign' },
            { id: 'highlight', icon: 'M9 11h6M9 7h6M9 15h6M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', name: 'Highlight' },
            { id: 'shapes', icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', name: 'Shapes' },
            { id: 'stamp', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5', name: 'Stamp' },
            { id: 'redact', icon: 'M2 12h20M2 6h20M2 18h20', name: 'Redact' },
            { id: 'ocr', icon: 'M4 7V4h4M20 4v3M4 17v3h4M20 20v-3M9 9h6v6H9V9z', name: 'OCR' },
            { id: 'image', icon: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm11 10H5l4-8 3 5 2-3 5.5 6z', name: 'Image' },
            { id: 'undo', icon: 'M3 7v6h6M3 13a9 9 0 1 0 2.636-6.364L3 9', name: 'Undo' },
            { id: 'redo', icon: 'M21 7v6h-6M21 13a9 9 0 1 1-2.636-6.364L21 9', name: 'Redo' }
        ];

        return tools.map(tool => `
            <div class="mobile-tool-item" data-tool="${tool.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="${tool.icon}"/>
                </svg>
                <span>${tool.name}</span>
            </div>
        `).join('');
    }

    /**
     * Bind event listeners
     */
    function bindEvents() {
        // Window resize
        window.addEventListener('resize', debounce(handleResize, 150));

        // Notification close
        const notificationClose = document.querySelector('.mobile-notification-close');
        if (notificationClose) {
            notificationClose.addEventListener('click', dismissNotification);
        }

        // Menu toggle (open sidebar)
        if (elements.menuToggle) {
            elements.menuToggle.addEventListener('click', toggleSidebar);
        }

        // Sidebar backdrop (close sidebar)
        if (elements.sidebarBackdrop) {
            elements.sidebarBackdrop.addEventListener('click', closeSidebar);
        }

        // Sidebar close button
        if (elements.sidebarCloseBtn) {
            elements.sidebarCloseBtn.addEventListener('click', closeSidebar);
        }

        // Tool FAB
        if (elements.toolFab) {
            elements.toolFab.addEventListener('click', toggleToolDrawer);
        }

        // Tool drawer close
        const drawerClose = document.querySelector('.mobile-tool-drawer-close');
        if (drawerClose) {
            drawerClose.addEventListener('click', closeToolDrawer);
        }

        // Tool drawer items
        document.querySelectorAll('.mobile-tool-item').forEach(item => {
            item.addEventListener('click', handleToolSelect);
        });

        // Mobile page controls
        bindPageControls();

        // Handle touch gestures on drawer handle
        const drawerHandle = document.querySelector('.mobile-tool-drawer-handle');
        if (drawerHandle) {
            drawerHandle.addEventListener('touchstart', handleDrawerSwipe, { passive: true });
        }

        // Escape key to close overlays
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (state.sidebarOpen) closeSidebar();
                if (state.toolDrawerOpen) closeToolDrawer();
            }
        });
    }

    /**
     * Bind mobile page controls
     */
    function bindPageControls() {
        const prevBtn = document.getElementById('mobilePrevPage');
        const nextBtn = document.getElementById('mobileNextPage');
        const zoomInBtn = document.getElementById('mobileZoomIn');
        const zoomOutBtn = document.getElementById('mobileZoomOut');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (typeof PDFoxApp !== 'undefined' && PDFoxApp.prevPage) {
                    PDFoxApp.prevPage();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (typeof PDFoxApp !== 'undefined' && PDFoxApp.nextPage) {
                    PDFoxApp.nextPage();
                }
            });
        }

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                if (typeof PDFoxApp !== 'undefined' && PDFoxApp.zoomIn) {
                    PDFoxApp.zoomIn();
                }
            });
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                if (typeof PDFoxApp !== 'undefined' && PDFoxApp.zoomOut) {
                    PDFoxApp.zoomOut();
                }
            });
        }

        // Update page info when page changes
        document.addEventListener('pageChanged', updateMobilePageInfo);
        document.addEventListener('pdfLoaded', updateMobilePageInfo);
    }

    /**
     * Update mobile page info display
     */
    function updateMobilePageInfo() {
        const currentPageEl = document.getElementById('mobileCurrentPage');
        const totalPagesEl = document.getElementById('mobileTotalPages');
        const desktopCurrentPage = document.getElementById('currentPage');
        const desktopTotalPages = document.getElementById('totalPages');

        if (currentPageEl && desktopCurrentPage) {
            currentPageEl.textContent = desktopCurrentPage.textContent;
        }
        if (totalPagesEl && desktopTotalPages) {
            totalPagesEl.textContent = desktopTotalPages.textContent;
        }
    }

    /**
     * Handle window resize
     */
    function handleResize() {
        const mobile = isMobile();

        // Close overlays when switching to desktop
        if (!mobile) {
            if (state.sidebarOpen) closeSidebar();
            if (state.toolDrawerOpen) closeToolDrawer();
        }

        // Update body padding for notification
        if (mobile && !state.notificationDismissed && elements.notification) {
            const notificationHeight = elements.notification.offsetHeight;
            document.body.style.paddingTop = notificationHeight + 'px';
        } else {
            document.body.style.paddingTop = '';
        }
    }

    /**
     * Show mobile notification
     */
    function showNotification() {
        if (elements.notification) {
            elements.notification.style.display = 'block';
            handleResize();
        }
    }

    /**
     * Dismiss mobile notification
     */
    function dismissNotification() {
        state.notificationDismissed = true;
        localStorage.setItem('pdfox_mobile_notification_dismissed', 'true');
        document.body.classList.add('notification-dismissed');

        if (elements.notification) {
            elements.notification.style.display = 'none';
        }

        document.body.style.paddingTop = '';
    }

    /**
     * Toggle sidebar
     */
    function toggleSidebar() {
        if (state.sidebarOpen) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    /**
     * Open sidebar
     */
    function openSidebar() {
        state.sidebarOpen = true;

        if (elements.sidebar) {
            elements.sidebar.classList.add('open');
        }
        if (elements.sidebarBackdrop) {
            elements.sidebarBackdrop.classList.add('visible');
        }

        document.body.style.overflow = 'hidden';
    }

    /**
     * Close sidebar
     */
    function closeSidebar() {
        state.sidebarOpen = false;

        if (elements.sidebar) {
            elements.sidebar.classList.remove('open');
        }
        if (elements.sidebarBackdrop) {
            elements.sidebarBackdrop.classList.remove('visible');
        }

        document.body.style.overflow = '';
    }

    /**
     * Toggle tool drawer
     */
    function toggleToolDrawer() {
        if (state.toolDrawerOpen) {
            closeToolDrawer();
        } else {
            openToolDrawer();
        }
    }

    /**
     * Open tool drawer
     */
    function openToolDrawer() {
        state.toolDrawerOpen = true;

        if (elements.toolDrawer) {
            elements.toolDrawer.classList.add('open');
        }
    }

    /**
     * Close tool drawer
     */
    function closeToolDrawer() {
        state.toolDrawerOpen = false;

        if (elements.toolDrawer) {
            elements.toolDrawer.classList.remove('open');
        }
    }

    /**
     * Handle tool selection from mobile drawer
     */
    function handleToolSelect(e) {
        const toolItem = e.currentTarget;
        const toolId = toolItem.dataset.tool;

        // Remove active from all items
        document.querySelectorAll('.mobile-tool-item').forEach(item => {
            item.classList.remove('active');
        });

        // Add active to selected
        toolItem.classList.add('active');

        // Trigger tool selection in main app
        selectTool(toolId);

        // Close drawer after selection (except for undo/redo)
        if (toolId !== 'undo' && toolId !== 'redo') {
            setTimeout(closeToolDrawer, 150);
        }
    }

    /**
     * Select a tool in the main application
     */
    function selectTool(toolId) {
        // Handle undo/redo separately
        if (toolId === 'undo') {
            if (typeof PDFoxApp !== 'undefined' && PDFoxApp.undo) {
                PDFoxApp.undo();
            }
            return;
        }

        if (toolId === 'redo') {
            if (typeof PDFoxApp !== 'undefined' && PDFoxApp.redo) {
                PDFoxApp.redo();
            }
            return;
        }

        // Map mobile tool IDs to desktop tool button IDs
        const toolMap = {
            'select': 'selectTool',
            'draw': 'drawTool',
            'text': 'textTool',
            'signature': 'signatureTool',
            'highlight': 'highlightTool',
            'shapes': 'shapeTool',
            'stamp': 'stampTool',
            'redact': 'redactTool',
            'ocr': 'ocrTool',
            'image': 'imageTool'
        };

        const desktopToolId = toolMap[toolId];
        if (desktopToolId) {
            const toolBtn = document.getElementById(desktopToolId);
            if (toolBtn) {
                toolBtn.click();
            }
        }
    }

    /**
     * Handle drawer swipe gestures
     */
    function handleDrawerSwipe(e) {
        const startY = e.touches[0].clientY;
        let currentY = startY;

        const onMove = (moveEvent) => {
            currentY = moveEvent.touches[0].clientY;
        };

        const onEnd = () => {
            const diff = currentY - startY;
            if (diff > 50) {
                closeToolDrawer();
            }
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
        };

        document.addEventListener('touchmove', onMove, { passive: true });
        document.addEventListener('touchend', onEnd, { passive: true });
    }

    // =======================================================================
    // MOBILE PDF VIEWING - Pinch-to-zoom, auto-fit, scroll fix
    // =======================================================================

    /**
     * Pinch-to-zoom state
     */
    const pinchState = {
        active: false,
        initialDistance: 0,
        initialScale: 1,
        lastScale: 1
    };

    /**
     * Check if pinch gesture is currently active
     * Used by annotations module to prevent tool activation during pinch-to-zoom
     */
    function isPinchActive() {
        return pinchState.active;
    }

    /**
     * Initialize mobile PDF viewing features
     */
    function initMobilePDFViewing() {
        if (!isMobile() && !isTouch()) return;

        const canvasContainer = document.querySelector('.canvas-container');
        if (!canvasContainer) return;

        // Enable native scrolling on canvas container
        canvasContainer.style.overflow = 'auto';
        canvasContainer.style.webkitOverflowScrolling = 'touch';

        // Setup pinch-to-zoom
        setupPinchToZoom(canvasContainer);

        // Auto-fit width when PDF loads
        document.addEventListener('pdfLoaded', handlePDFLoaded);

        // Fix touch behavior - prevent addText on scroll/pan
        setupTouchScrollFix(canvasContainer);

        console.log('Mobile PDF viewing initialized');
    }

    /**
     * Handle PDF loaded - auto-fit to width on mobile
     */
    function handlePDFLoaded() {
        if (!isMobile()) return;

        // Small delay to ensure PDF is rendered
        setTimeout(() => {
            if (typeof PDFoxApp !== 'undefined' && PDFoxApp.zoomFitWidth) {
                PDFoxApp.zoomFitWidth();
                console.log('Auto-fitted PDF to width for mobile');
            }
        }, 100);
    }

    /**
     * Setup pinch-to-zoom gesture handling
     */
    function setupPinchToZoom(container) {
        const pdfViewer = document.getElementById('pdfViewer');
        if (!pdfViewer) return;

        // Track touch points
        let touches = [];

        pdfViewer.addEventListener('touchstart', (e) => {
            touches = Array.from(e.touches);

            // Set pinch active immediately when 2+ touches detected
            // This helps prevent addText popup during pinch gestures
            if (touches.length >= 2) {
                // Two fingers - start pinch
                e.preventDefault();
                pinchState.active = true;
                pinchState.initialDistance = getDistance(touches[0], touches[1]);
                pinchState.initialScale = (typeof PDFoxCore !== 'undefined') ? PDFoxCore.get('scale') : 1;
            }
        }, { passive: false });

        // Also listen on the annotation canvas for early multi-touch detection
        const annotationCanvas = document.getElementById('annotationCanvas');
        if (annotationCanvas) {
            annotationCanvas.addEventListener('touchstart', (e) => {
                if (e.touches.length >= 2) {
                    pinchState.active = true;
                }
            }, { passive: true });
        }

        pdfViewer.addEventListener('touchmove', (e) => {
            if (!pinchState.active || e.touches.length !== 2) return;

            e.preventDefault();
            touches = Array.from(e.touches);

            const currentDistance = getDistance(touches[0], touches[1]);
            const scaleFactor = currentDistance / pinchState.initialDistance;
            let newScale = pinchState.initialScale * scaleFactor;

            // Clamp scale between 0.5 and 3.0
            newScale = Math.max(0.5, Math.min(3.0, newScale));

            // Only update if scale changed significantly
            if (Math.abs(newScale - pinchState.lastScale) > 0.02) {
                pinchState.lastScale = newScale;
                applyPinchZoom(newScale);
            }
        }, { passive: false });

        pdfViewer.addEventListener('touchend', (e) => {
            if (pinchState.active && e.touches.length < 2) {
                pinchState.active = false;

                // Reset CSS transform
                pdfViewer.style.transform = '';
                pdfViewer.style.transformOrigin = '';

                // Finalize zoom by re-rendering at new scale
                if (typeof PDFoxCore !== 'undefined') {
                    PDFoxCore.set('scale', pinchState.lastScale);
                    if (typeof PDFoxApp !== 'undefined' && PDFoxApp.renderCurrentPage) {
                        PDFoxApp.renderCurrentPage();
                    }
                    // Update zoom display
                    if (typeof PDFoxApp !== 'undefined' && PDFoxApp.updateZoomDisplay) {
                        PDFoxApp.updateZoomDisplay();
                    }
                }
            }
            touches = Array.from(e.touches);
        }, { passive: true });
    }

    /**
     * Calculate distance between two touch points
     */
    function getDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Apply pinch zoom visually (CSS transform for smooth feedback)
     */
    function applyPinchZoom(scale) {
        const pdfViewer = document.getElementById('pdfViewer');
        if (!pdfViewer) return;

        // Use CSS transform for smooth visual feedback during pinch
        const currentScale = (typeof PDFoxCore !== 'undefined') ? PDFoxCore.get('scale') : 1;
        const visualScale = scale / currentScale;

        pdfViewer.style.transform = `scale(${visualScale})`;
        pdfViewer.style.transformOrigin = 'center center';
    }

    /**
     * Fix touch scroll - prevent tool activation during scroll/pan
     */
    function setupTouchScrollFix(container) {
        let touchStartTime = 0;
        let touchStartPos = { x: 0, y: 0 };
        let isTouchScrolling = false;

        container.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                touchStartTime = Date.now();
                touchStartPos = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY
                };
                isTouchScrolling = false;
            }
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                const dx = Math.abs(e.touches[0].clientX - touchStartPos.x);
                const dy = Math.abs(e.touches[0].clientY - touchStartPos.y);

                // If moved more than 10px, it's a scroll not a tap
                if (dx > 10 || dy > 10) {
                    isTouchScrolling = true;
                }
            }
        }, { passive: true });

        // Intercept clicks on pdf viewer during scroll
        const pdfViewer = document.getElementById('pdfViewer');
        if (pdfViewer) {
            pdfViewer.addEventListener('click', (e) => {
                const touchDuration = Date.now() - touchStartTime;

                // If it was a scroll gesture or long press, prevent tool activation
                if (isTouchScrolling || touchDuration > 300) {
                    e.stopPropagation();
                    e.preventDefault();
                    return false;
                }
            }, { capture: true });
        }
    }

    /**
     * Debounce function
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

    // Expose public API
    window.MobileUI = {
        init,
        isMobile,
        isTouch,
        isPinchActive,
        openSidebar,
        closeSidebar,
        toggleSidebar,
        openToolDrawer,
        closeToolDrawer,
        toggleToolDrawer,
        dismissNotification,
        updateMobilePageInfo,
        initMobilePDFViewing
    };

    // Alias for header button onclick
    window.PDFoxMobileUI = {
        toggleToolsDrawer: toggleToolDrawer,
        toggleSidebar: toggleSidebar
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
