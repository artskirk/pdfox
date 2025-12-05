/**
 * PDFOX Annotation Styles Module
 * Handles annotation styling (color, fill, opacity, line style, size)
 * Single Responsibility: Annotation style management
 */

const PDFoxAnnotationStyles = (function() {
    'use strict';

    const core = PDFoxCore;

    // Current style state
    let currentStyles = {
        strokeColor: '#E50914',
        fillColor: '#E50914',
        fillEnabled: false,
        opacity: 100,
        lineStyle: 'solid', // solid, dashed, dotted
        size: 3
    };

    // DOM element references
    let panel, strokeColorPicker, fillColorPicker, fillToggle, fillStyleGroup;
    let opacitySlider, opacityValue, sizeSlider, sizeValueDisplay;
    let lineButtons;

    // Tools that show the style panel
    const ANNOTATION_TOOLS = ['draw', 'rectangle', 'circle'];
    const SHAPE_TOOLS = ['rectangle', 'circle'];

    /**
     * Initialize the annotation styles module
     */
    function init() {
        // Get DOM references
        panel = document.getElementById('annotationStylePanel');
        strokeColorPicker = document.getElementById('annotationStrokeColor');
        fillColorPicker = document.getElementById('annotationFillColor');
        fillToggle = document.getElementById('fillToggle');
        fillStyleGroup = document.getElementById('fillStyleGroup');
        opacitySlider = document.getElementById('annotationOpacity');
        opacityValue = document.getElementById('opacityValue');
        sizeSlider = document.getElementById('annotationSize');
        sizeValueDisplay = document.getElementById('sizeValueDisplay');
        lineButtons = document.querySelectorAll('.style-line-btn');

        if (!panel) return;

        // Setup event listeners
        setupEventListeners();

        // Subscribe to tool changes
        core.on('currentTool:changed', ({ value }) => {
            if (ANNOTATION_TOOLS.includes(value)) {
                show(value);
            } else {
                hide();
            }
        });

        // Also update legacy hidden inputs for backwards compatibility
        syncLegacyInputs();
    }

    /**
     * Setup event listeners for style controls
     */
    function setupEventListeners() {
        // Stroke color
        if (strokeColorPicker) {
            strokeColorPicker.addEventListener('input', (e) => {
                currentStyles.strokeColor = e.target.value;
                syncLegacyInputs();
            });
        }

        // Fill color
        if (fillColorPicker) {
            fillColorPicker.addEventListener('input', (e) => {
                currentStyles.fillColor = e.target.value;
            });
        }

        // Opacity slider
        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                currentStyles.opacity = parseInt(e.target.value);
                if (opacityValue) {
                    opacityValue.textContent = currentStyles.opacity + '%';
                }
            });
        }

        // Size slider
        if (sizeSlider) {
            sizeSlider.addEventListener('input', (e) => {
                currentStyles.size = parseInt(e.target.value);
                if (sizeValueDisplay) {
                    sizeValueDisplay.textContent = currentStyles.size + 'px';
                }
                syncLegacyInputs();
            });
        }
    }

    /**
     * Sync with legacy hidden inputs for backwards compatibility
     */
    function syncLegacyInputs() {
        const legacyColorPicker = document.getElementById('colorPicker');
        const legacyBrushSize = document.getElementById('brushSize');
        const legacySizeValue = document.getElementById('sizeValue');

        if (legacyColorPicker) legacyColorPicker.value = currentStyles.strokeColor;
        if (legacyBrushSize) legacyBrushSize.value = currentStyles.size;
        if (legacySizeValue) legacySizeValue.textContent = currentStyles.size;
    }

    /**
     * Show the style panel
     * @param {string} tool - Current tool
     */
    function show(tool) {
        if (!panel) return;

        // Show/hide fill options based on tool
        if (fillStyleGroup) {
            if (SHAPE_TOOLS.includes(tool)) {
                fillStyleGroup.style.display = 'flex';
            } else {
                fillStyleGroup.style.display = 'none';
            }
        }

        // Animate in
        panel.style.display = 'flex';
        requestAnimationFrame(() => {
            panel.classList.add('visible');
        });
    }

    /**
     * Hide the style panel
     */
    function hide() {
        if (!panel) return;
        panel.classList.remove('visible');
        setTimeout(() => {
            if (!panel.classList.contains('visible')) {
                panel.style.display = 'none';
            }
        }, 300);
    }

    /**
     * Toggle fill on/off
     */
    function toggleFill() {
        currentStyles.fillEnabled = !currentStyles.fillEnabled;

        if (fillToggle) {
            fillToggle.classList.toggle('active', currentStyles.fillEnabled);
            // Update icon to filled/unfilled
            if (currentStyles.fillEnabled) {
                fillToggle.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                    </svg>
                `;
            } else {
                fillToggle.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
                    </svg>
                `;
            }
        }

        if (fillColorPicker) {
            fillColorPicker.disabled = !currentStyles.fillEnabled;
            fillColorPicker.style.opacity = currentStyles.fillEnabled ? 1 : 0.4;
        }
    }

    /**
     * Set line style
     * @param {string} style - Line style (solid, dashed, dotted)
     */
    function setLineStyle(style) {
        currentStyles.lineStyle = style;

        // Update button states
        lineButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lineStyle === style);
        });
    }

    /**
     * Get line dash array based on current style
     * @param {number} size - Line size for scaling
     * @returns {number[]} Dash array
     */
    function getLineDash(size = currentStyles.size) {
        switch (currentStyles.lineStyle) {
            case 'dashed':
                return [size * 3, size * 2];
            case 'dotted':
                return [size, size * 1.5];
            default:
                return [];
        }
    }

    /**
     * Get current styles
     * @returns {Object} Current style settings
     */
    function getStyles() {
        return {
            ...currentStyles,
            lineDash: getLineDash()
        };
    }

    /**
     * Get RGBA color with opacity
     * @param {string} hexColor - Hex color
     * @param {number} opacity - Opacity 0-100
     * @returns {string} RGBA color string
     */
    function getRGBA(hexColor, opacity = currentStyles.opacity) {
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
    }

    /**
     * Apply styles to canvas context
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} customStyles - Optional custom styles to override
     */
    function applyToContext(ctx, customStyles = {}) {
        const styles = { ...currentStyles, ...customStyles };

        ctx.strokeStyle = getRGBA(styles.strokeColor, styles.opacity);
        ctx.lineWidth = styles.size;
        ctx.setLineDash(getLineDash(styles.size));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (styles.fillEnabled) {
            ctx.fillStyle = getRGBA(styles.fillColor, styles.opacity * 0.3);
        }
    }

    return {
        init,
        show,
        hide,
        toggleFill,
        setLineStyle,
        getStyles,
        getRGBA,
        getLineDash,
        applyToContext
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxAnnotationStyles;
}
