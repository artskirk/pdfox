/**
 * PDFOX Toolbar Module
 * Handles responsive toolbar with overflow menu
 * Single Responsibility: Toolbar overflow management
 */

const PDFoxToolbar = (function() {
    'use strict';

    let toolbar, toolbarVisible, overflowGroup, overflowBtn, overflowDropdown, overflowBadge;
    let toolGroups = [];
    let hiddenGroups = [];
    let isOverflowOpen = false;
    let resizeTimeout = null;

    /**
     * Initialize toolbar overflow handling
     */
    function init() {
        toolbar = document.getElementById('toolbar');
        toolbarVisible = document.getElementById('toolbarVisible');
        overflowGroup = document.getElementById('toolbarOverflowGroup');
        overflowBtn = document.getElementById('toolbarOverflowBtn');
        overflowDropdown = document.getElementById('toolbarOverflowDropdown');
        overflowBadge = document.getElementById('overflowBadge');

        if (!toolbar || !toolbarVisible || !overflowBtn || !overflowDropdown || !overflowGroup) {
            console.warn('Toolbar elements not found');
            return;
        }

        // Get all tool groups (keep original DOM order)
        toolGroups = Array.from(toolbarVisible.querySelectorAll('.tool-group'));

        // Initial check
        checkOverflow();

        // Listen for resize
        window.addEventListener('resize', () => {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            resizeTimeout = setTimeout(checkOverflow, 100);
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (isOverflowOpen && !overflowDropdown.contains(e.target) && !overflowBtn.contains(e.target)) {
                closeOverflow();
            }
        });

        // Close dropdown on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOverflowOpen) {
                closeOverflow();
            }
        });

        // Handle overflow button click directly
        overflowBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleOverflow();
        });
    }

    /**
     * Check if toolbar overflows and manage visibility
     */
    function checkOverflow() {
        if (!toolbar || !toolbarVisible) return;

        // First, show all groups to measure
        toolGroups.forEach(group => {
            group.classList.remove('hidden-in-toolbar');
        });
        hiddenGroups = [];

        // Get available width (toolbar width minus overflow button and padding)
        const toolbarRect = toolbar.getBoundingClientRect();
        const overflowBtnWidth = 80; // Approximate width of overflow button
        const padding = 60; // Extra padding
        const availableWidth = toolbarRect.width - overflowBtnWidth - padding;

        // Calculate total width of all groups
        let totalWidth = 0;
        const groupWidths = toolGroups.map(group => {
            const rect = group.getBoundingClientRect();
            return rect.width;
        });

        // Calculate initial total width
        toolGroups.forEach((group, index) => {
            totalWidth += groupWidths[index];
        });

        // Hide groups from LEFT side first (index 0, 1, 2, ...)
        // This keeps rightmost tools visible longest
        // EXCEPT: Never hide primary-tools group
        for (let i = 0; i < toolGroups.length; i++) {
            if (totalWidth <= availableWidth) break;

            const group = toolGroups[i];

            // Never hide primary tools
            if (group.classList.contains('primary-tools')) {
                continue;
            }

            totalWidth -= groupWidths[i];
            group.classList.add('hidden-in-toolbar');
            hiddenGroups.push(group);
        }

        // Update overflow group visibility and badge
        // Always show overflow menu button for quick access to FINALIZE tools
        overflowGroup.classList.add('has-overflow');
        updateOverflowDropdown();

        if (hiddenGroups.length > 0) {
            overflowBadge.textContent = hiddenGroups.length;
            overflowBadge.style.display = 'flex';
        } else {
            // No hidden groups, but still show menu for FINALIZE access
            overflowBadge.style.display = 'none';
        }
    }

    /**
     * Update overflow dropdown content
     */
    function updateOverflowDropdown() {
        if (!overflowDropdown) return;

        // Clear existing content
        overflowDropdown.innerHTML = '';

        // Clone hidden groups into dropdown (already in left-to-right order)
        hiddenGroups.forEach(group => {
            // Skip groups that are intentionally hidden (like SELECT/AI Text)
            if (group.style.display === 'none') {
                return;
            }

            const clone = group.cloneNode(true);
            clone.classList.remove('hidden-in-toolbar');
            // Remove any inline display:none that might have been copied
            clone.style.removeProperty('display');

            // For zoom controls, replace complex dropdown with simple display
            const zoomControls = clone.querySelector('.zoom-controls');
            const zoomContainer = clone.querySelector('.zoom-dropdown-container');

            if (zoomControls && zoomContainer) {
                // Get current zoom value from the original display
                const originalDisplay = document.getElementById('zoomDisplay');
                const currentZoom = originalDisplay ? originalDisplay.textContent : '100%';

                // Create simple zoom display element
                const simpleDisplay = document.createElement('span');
                simpleDisplay.className = 'zoom-display-simple';
                simpleDisplay.id = 'zoomDisplayOverflow';
                simpleDisplay.textContent = currentZoom;

                // Replace the complex dropdown with simple display
                zoomContainer.replaceWith(simpleDisplay);
            }

            overflowDropdown.appendChild(clone);
        });

        // Always add FINALIZE tools section at the end for easy access
        // This ensures Sign, Fill, Patch are always accessible from Menu
        addPermanentFinalizeSection();
    }

    /**
     * Add permanent FINALIZE section to overflow menu
     * This ensures Sign, Fill, Patch tools are always accessible from Menu
     */
    function addPermanentFinalizeSection() {
        // Check if FINALIZE is already in hidden groups
        const hasFinalizeInHidden = hiddenGroups.some(g => g.dataset.group === 'finalize');
        if (hasFinalizeInHidden) return; // Already included

        // Create FINALIZE section
        const finalizeSection = document.createElement('div');
        finalizeSection.className = 'tool-group overflow-permanent-section';
        finalizeSection.innerHTML = `
            <span class="tool-group-label">Finalize</span>
            <div class="tool-buttons">
                <button class="tool-btn" onclick="PDFoxSignatures.openModal(); PDFoxToolbar.closeOverflow();" data-tooltip="Add signature">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M3 17c3.5-3.5 7-7 11-4s3 6-1 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        <path d="M17 22l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <small>Sign</small>
                </button>
                <button class="tool-btn" onclick="PDFoxApp.setTool('fill'); PDFoxToolbar.closeOverflow();" data-tooltip="Fill area with selected color (6)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M3.5 19.5L9 8l8.5 4.5-5.5 11.5z" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.1" stroke-linejoin="round"/>
                        <ellipse cx="12.5" cy="6.5" rx="4.5" ry="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
                        <path d="M16 8c1 1.5 2.5 4 2.5 6 0 1.5-1 2.5-2 2.5s-2-1-2-2.5c0-2 1.5-4.5 2.5-6z" fill="currentColor" opacity="0.6"/>
                    </svg>
                    <small>Fill</small>
                </button>
                <button class="tool-btn" onclick="PDFoxApp.setTool('patch'); PDFoxToolbar.closeOverflow();" data-tooltip="Patch tool - copy area to cover content (P)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <rect x="2" y="8" width="20" height="8" rx="2" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.1"/>
                        <line x1="8" y1="8" x2="8" y2="16" stroke="currentColor" stroke-width="1.5"/>
                        <line x1="16" y1="8" x2="16" y2="16" stroke="currentColor" stroke-width="1.5"/>
                        <circle cx="5" cy="12" r="1" fill="currentColor"/>
                        <circle cx="12" cy="12" r="1" fill="currentColor"/>
                        <circle cx="19" cy="12" r="1" fill="currentColor"/>
                    </svg>
                    <small>Patch</small>
                </button>
            </div>
        `;

        overflowDropdown.appendChild(finalizeSection);
    }

    /**
     * Toggle overflow dropdown
     */
    function toggleOverflow() {
        if (isOverflowOpen) {
            closeOverflow();
        } else {
            openOverflow();
        }
    }

    /**
     * Open overflow dropdown
     */
    function openOverflow() {
        isOverflowOpen = true;
        overflowDropdown.classList.add('open');
        overflowBtn.classList.add('active');
    }

    /**
     * Close overflow dropdown
     */
    function closeOverflow() {
        isOverflowOpen = false;
        overflowDropdown.classList.remove('open');
        if (overflowBtn) {
            overflowBtn.classList.remove('active');
        }
    }

    /**
     * Force refresh of overflow state
     */
    function refresh() {
        checkOverflow();
    }

    return {
        init,
        toggleOverflow,
        openOverflow,
        closeOverflow,
        refresh
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxToolbar;
}
