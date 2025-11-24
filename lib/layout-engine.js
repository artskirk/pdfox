/**
 * Layout Engine - Text measurement and reflow calculation
 * Can run in both browser and Node.js
 */

class LayoutEngine {
    constructor() {
        // Create canvas for text measurement
        if (typeof document !== 'undefined') {
            // Browser environment
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d');
        } else {
            // Node.js environment - use canvas npm package
            try {
                const { createCanvas } = require('canvas');
                this.canvas = createCanvas(100, 100);
                this.ctx = this.canvas.getContext('2d');
            } catch (e) {
                console.warn('Canvas not available in Node.js - install "canvas" package for server-side layout');
            }
        }
    }

    /**
     * Measure text dimensions with given style
     */
    measureText(text, style) {
        if (!this.ctx) {
            // Fallback estimation
            return {
                width: text.length * style.fontSize * 0.6,
                height: style.fontSize * style.lineHeight
            };
        }

        this.ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
        const metrics = this.ctx.measureText(text);

        return {
            width: metrics.width,
            height: style.fontSize * style.lineHeight
        };
    }

    /**
     * Break text into lines that fit within maxWidth
     */
    breakIntoLines(content, blockStyle, maxWidth) {
        const lines = [];
        let currentLine = [];
        let currentX = 0;
        let currentY = 0;
        const lineHeight = blockStyle.fontSize * blockStyle.lineHeight;

        for (const span of content) {
            const style = { ...blockStyle, ...(span.style || {}) };
            const words = span.text.split(' ');

            for (let i = 0; i < words.length; i++) {
                const word = words[i];
                const wordText = i < words.length - 1 ? word + ' ' : word;
                const metrics = this.measureText(wordText, style);

                // Check if word exceeds line width
                if (currentX + metrics.width > maxWidth && currentLine.length > 0) {
                    // Start new line
                    lines.push({
                        spans: currentLine,
                        y: currentY,
                        height: lineHeight,
                        baseline: currentY + blockStyle.fontSize * 0.8
                    });
                    currentLine = [];
                    currentX = 0;
                    currentY += lineHeight;
                }

                currentLine.push({
                    text: wordText,
                    x: currentX,
                    width: metrics.width,
                    style: style
                });
                currentX += metrics.width;
            }
        }

        // Add final line
        if (currentLine.length > 0) {
            lines.push({
                spans: currentLine,
                y: currentY,
                height: lineHeight,
                baseline: currentY + blockStyle.fontSize * 0.8
            });
        }

        return lines;
    }

    /**
     * Compute layout for all blocks in a container
     */
    reflowContainer(container, containerWidth) {
        const positioned = [];
        let currentY = container.style.padding.top;

        for (const block of container.blocks) {
            // Add top margin
            currentY += block.style.marginTop;

            // Calculate available width
            const maxWidth = containerWidth -
                container.style.padding.left -
                container.style.padding.right;

            // Break block text into lines
            const lines = this.breakIntoLines(block.content, block.style, maxWidth);

            const blockHeight = lines.reduce((sum, line) => sum + line.height, 0);

            // Debug logging for export
            const textPreview = block.content.map(s => s.text).join('').substring(0, 50);
            console.log(`Layout block: "${textPreview}..." → ${lines.length} lines (maxWidth: ${maxWidth})`);

            positioned.push({
                blockId: block.id,
                x: container.bounds.x + container.style.padding.left,
                y: container.bounds.y + currentY,
                width: maxWidth,
                height: blockHeight,
                lines: lines
            });

            currentY += blockHeight + block.style.marginBottom;
        }

        return positioned;
    }

    /**
     * Layout entire page
     */
    layoutPage(page) {
        const positionedBlocks = [];

        for (const container of page.containers) {
            const containerBlocks = this.reflowContainer(
                container,
                container.bounds.width
            );
            positionedBlocks.push(...containerBlocks);
        }

        // Check for overflow
        const maxY = positionedBlocks.length > 0
            ? Math.max(...positionedBlocks.map(b => b.y + b.height))
            : 0;
        const overflow = maxY > page.height;

        return {
            positionedBlocks: positionedBlocks,
            overflow: overflow,
            totalHeight: maxY
        };
    }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LayoutEngine };
}
