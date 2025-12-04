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
        for (let i = 0; i < toolGroups.length; i++) {
            if (totalWidth <= availableWidth) break;

            const group = toolGroups[i];
            totalWidth -= groupWidths[i];
            group.classList.add('hidden-in-toolbar');
            hiddenGroups.push(group);
        }

        // Update overflow group visibility and badge
        if (hiddenGroups.length > 0) {
            overflowGroup.classList.add('has-overflow');
            overflowBadge.textContent = hiddenGroups.length;
            overflowBadge.style.display = 'flex';
            updateOverflowDropdown();
        } else {
            overflowGroup.classList.remove('has-overflow');
            overflowBadge.style.display = 'none';
            closeOverflow();
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
            const clone = group.cloneNode(true);
            clone.classList.remove('hidden-in-toolbar');

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
        if (hiddenGroups.length === 0) return;

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
