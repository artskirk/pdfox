/**
 * PDF Exporter - Generate PDF from document model using pdf-lib
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { LayoutEngine } = require('./layout-engine');

class PDFExporter {
    constructor() {
        this.layoutEngine = new LayoutEngine();
    }

    /**
     * Export document to PDF bytes
     * Supports both preserve and reflow modes
     */
    async exportToPDF(document) {
        const pdfDoc = await PDFDocument.create();

        const isPreserveMode = document.metadata?.mode === 'preserve';

        for (const page of document.pages) {
            // Create PDF page
            const pdfPage = pdfDoc.addPage([page.width, page.height]);

            if (isPreserveMode && page.elements) {
                // Preserve mode: render elements at exact positions
                await this.exportPreserveMode(pdfPage, page);
            } else {
                // Reflow mode: use layout engine
                await this.exportReflowMode(pdfPage, page);
            }
        }

        return await pdfDoc.save();
    }

    /**
     * Export preserve mode page with exact positioning
     * Renders each element at its exact position - NO grouping or merging
     */
    async exportPreserveMode(pdfPage, page) {
        console.log(`Exporting page with ${page.elements.length} elements in preserve mode`);

        // Render all elements at their exact positions
        for (const element of page.elements) {
            if (element.elementType === 'text') {
                await this.drawPreserveText(pdfPage, element, page.height);
            } else if (element.elementType === 'image') {
                await this.drawPreserveImage(pdfPage, element, page.height);
            } else if (element.elementType === 'graphic') {
                await this.drawPreserveGraphic(pdfPage, element, page.height);
            }
        }
    }

    /**
     * Group consecutive text elements into unified paragraph blocks
     * Same logic as UI rendering to ensure PDF matches preview
     */
    groupIntoParagraphs(elements) {
        const paragraphs = [];
        let currentParagraph = null;

        for (const element of elements) {
            const xPos = element.xPosition || 72;
            const yPos = element.yPosition || 0;
            const fontSize = element.style?.fontSize || 12;

            if (!currentParagraph) {
                // Start new paragraph
                currentParagraph = {
                    id: element.id,
                    elementType: 'text',
                    xPosition: xPos,
                    yPosition: yPos,
                    lastYPosition: yPos, // Track last line's Y position
                    style: element.style,
                    content: [...element.content] // Create new array to avoid reference issues
                };
            } else {
                // Check if this element should be combined with current paragraph
                // Compare against the LAST line's Y position, not the first
                const xDiff = Math.abs(xPos - currentParagraph.xPosition);
                const yDiff = yPos - currentParagraph.lastYPosition;
                const expectedLineGap = fontSize * 1.5;

                // Combine if same X position and reasonable Y gap (looks like same paragraph)
                if (xDiff < 5 && yDiff > 0 && yDiff < expectedLineGap * 2) {
                    // Add space and append text
                    currentParagraph.content.push({ text: ' ' });
                    currentParagraph.content.push(...element.content);
                    // Update last Y position to track where this paragraph ends
                    currentParagraph.lastYPosition = yPos;
                } else {
                    // Different paragraph - save current and start new
                    paragraphs.push(currentParagraph);
                    currentParagraph = {
                        id: element.id,
                        elementType: 'text',
                        xPosition: xPos,
                        yPosition: yPos,
                        lastYPosition: yPos,
                        style: element.style,
                        content: [...element.content] // Create new array to avoid reference issues
                    };
                }
            }
        }

        // Add last paragraph
        if (currentParagraph) {
            paragraphs.push(currentParagraph);
        }

        return paragraphs;
    }

    /**
     * Draw preserve mode image element
     * Embeds actual image data if available
     */
    async drawPreserveImage(pdfPage, element, pageHeight) {
        const x = element.position?.x || 0;
        const y = element.position?.y || 0;
        const width = element.position?.width || 100;
        const height = element.position?.height || 100;

        // Convert Y coordinate (top-left to bottom-left)
        const yFromBottom = pageHeight - y - height;

        // If we have image data, embed and draw the actual image
        if (element.data) {
            try {
                // Convert base64 to buffer
                const imageBuffer = Buffer.from(element.data, 'base64');

                // Try to embed as JPEG first (most common)
                let embeddedImage;
                try {
                    embeddedImage = await pdfPage.doc.embedJpg(imageBuffer);
                } catch (jpgError) {
                    // If JPEG fails, try PNG
                    try {
                        embeddedImage = await pdfPage.doc.embedPng(imageBuffer);
                    } catch (pngError) {
                        console.warn(`Could not embed image ${element.name}: not JPEG or PNG`);
                        // Fall back to placeholder
                        this.drawImagePlaceholder(pdfPage, element, x, yFromBottom, width, height);
                        return;
                    }
                }

                // Draw the embedded image
                pdfPage.drawImage(embeddedImage, {
                    x: x,
                    y: yFromBottom,
                    width: width,
                    height: height
                });

                console.log(`✅ Embedded image: ${element.name} (${width}×${height}px)`);

            } catch (error) {
                console.warn(`Failed to embed image ${element.name}:`, error.message);
                // Fall back to placeholder
                this.drawImagePlaceholder(pdfPage, element, x, yFromBottom, width, height);
            }
        } else {
            // No image data - draw placeholder
            this.drawImagePlaceholder(pdfPage, element, x, yFromBottom, width, height);
        }
    }

    /**
     * Draw placeholder for images that can't be embedded
     */
    async drawImagePlaceholder(pdfPage, element, x, yFromBottom, width, height) {
        // Draw placeholder rectangle
        pdfPage.drawRectangle({
            x: x,
            y: yFromBottom,
            width: width,
            height: height,
            borderColor: rgb(0.13, 0.59, 0.95), // Blue
            borderWidth: 2,
            opacity: 0.1
        });

        // Draw label
        const font = await pdfPage.doc.embedFont(StandardFonts.Helvetica);
        const label = `Image: ${element.name || 'Unknown'}`;

        pdfPage.drawText(label, {
            x: x + 5,
            y: yFromBottom + height / 2,
            size: 10,
            font: font,
            color: rgb(0.13, 0.59, 0.95)
        });
    }

    /**
     * Draw preserve mode graphic element (rectangles, lines, paths)
     */
    async drawPreserveGraphic(pdfPage, element, pageHeight) {
        // Helper to parse RGB color
        const parseColor = (colorStr) => {
            if (!colorStr || colorStr === 'none') return null;
            const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (match) {
                return rgb(
                    parseInt(match[1]) / 255,
                    parseInt(match[2]) / 255,
                    parseInt(match[3]) / 255
                );
            }
            return rgb(0, 0, 0); // Default black
        };

        if (element.type === 'rectangle') {
            const x = element.position?.x || 0;
            const y = element.position?.y || 0;
            const width = element.position?.width || 100;
            const height = element.position?.height || 100;

            // Convert Y coordinate (top-left to bottom-left)
            const yFromBottom = pageHeight - y - height;

            const strokeColor = parseColor(element.style?.stroke);
            const fillColor = parseColor(element.style?.fill);
            const lineWidth = element.style?.lineWidth || 1;

            // Draw rectangle
            const options = {
                x: x,
                y: yFromBottom,
                width: width,
                height: height
            };

            if (strokeColor) {
                options.borderColor = strokeColor;
                options.borderWidth = lineWidth;
            }

            if (fillColor) {
                options.color = fillColor;
            }

            pdfPage.drawRectangle(options);

        } else if (element.type === 'line') {
            const x1 = element.position?.x1 || 0;
            const y1 = element.position?.y1 || 0;
            const x2 = element.position?.x2 || 0;
            const y2 = element.position?.y2 || 0;

            // Convert Y coordinates (top-left to bottom-left)
            const y1FromBottom = pageHeight - y1;
            const y2FromBottom = pageHeight - y2;

            const strokeColor = parseColor(element.style?.stroke) || rgb(0, 0, 0);
            const lineWidth = element.style?.lineWidth || 1;

            // Draw line
            pdfPage.drawLine({
                start: { x: x1, y: y1FromBottom },
                end: { x: x2, y: y2FromBottom },
                thickness: lineWidth,
                color: strokeColor
            });

        } else if (element.type === 'path' && element.points && element.points.length > 1) {
            // Draw complex path as series of lines
            const strokeColor = parseColor(element.style?.stroke) || rgb(0, 0, 0);
            const lineWidth = element.style?.lineWidth || 1;

            for (let i = 0; i < element.points.length - 1; i++) {
                const p1 = element.points[i];
                const p2 = element.points[i + 1];

                const y1FromBottom = pageHeight - p1.y;
                const y2FromBottom = pageHeight - p2.y;

                pdfPage.drawLine({
                    start: { x: p1.x, y: y1FromBottom },
                    end: { x: p2.x, y: y2FromBottom },
                    thickness: lineWidth,
                    color: strokeColor
                });
            }
        }
    }

    /**
     * Export reflow mode page using layout engine
     */
    async exportReflowMode(pdfPage, page) {
        // Compute layout
        const layout = this.layoutEngine.layoutPage(page);

        // Draw all positioned blocks
        for (const positioned of layout.positionedBlocks) {
            const block = this.findBlock(page, positioned.blockId);
            if (!block) continue;

            await this.drawBlock(pdfPage, block, positioned, page.height);
        }
    }

    /**
     * Draw preserve mode text element at exact position
     * NO wrapping in preserve mode - maintain exact layout from original PDF
     */
    async drawPreserveText(pdfPage, element, pageHeight) {
        // Get text content
        const text = element.content.map(s => s.text).join('');

        if (!text || text.trim().length === 0) return;

        // Get font and styling
        const font = await this.getFont(pdfPage.doc, element.style || {});
        const fontSize = element.style?.fontSize || 12;

        // Use element's exact X position from original PDF
        const xPosition = element.xPosition || 72;

        // Convert Y coordinate (top-left to bottom-left)
        const yFromBottom = pageHeight - (element.yPosition || 0) - fontSize;

        // Check if position is valid
        if (yFromBottom < 0) {
            console.warn(`Text "${text.substring(0, 30)}..." is off page at y=${yFromBottom}`);
            return;
        }

        // In preserve mode, render text exactly as-is without any wrapping
        // This maintains the exact layout from the original PDF
        pdfPage.drawText(text, {
            x: xPosition,
            y: yFromBottom,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
    }

    /**
     * Wrap text to fit within specified width
     * Returns array of lines that fit within maxWidth
     */
    wrapText(text, font, fontSize, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const textWidth = font.widthOfTextAtSize(testLine, fontSize);

            if (textWidth <= maxWidth) {
                currentLine = testLine;
            } else {
                // Line is too long, push current line and start new one
                if (currentLine) {
                    lines.push(currentLine);
                }

                // Check if single word is too long
                const wordWidth = font.widthOfTextAtSize(word, fontSize);
                if (wordWidth > maxWidth) {
                    // Word is too long, break it into characters
                    const chars = word.split('');
                    let charLine = '';

                    for (const char of chars) {
                        const testCharLine = charLine + char;
                        const charWidth = font.widthOfTextAtSize(testCharLine, fontSize);

                        if (charWidth <= maxWidth) {
                            charLine = testCharLine;
                        } else {
                            if (charLine) lines.push(charLine);
                            charLine = char;
                        }
                    }

                    currentLine = charLine;
                } else {
                    currentLine = word;
                }
            }
        }

        // Push remaining line
        if (currentLine) {
            lines.push(currentLine);
        }

        return lines;
    }

    /**
     * Find block by ID in page
     */
    findBlock(page, blockId) {
        for (const container of page.containers) {
            const block = container.blocks.find(b => b.id === blockId);
            if (block) return block;
        }
        return null;
    }

    /**
     * Draw a positioned block to PDF page
     */
    async drawBlock(pdfPage, block, positioned, pageHeight) {
        // pdf-lib uses bottom-left origin, we use top-left
        // Convert Y coordinates

        console.log(`Drawing block with ${positioned.lines.length} lines`);
        let lineNum = 0;

        for (const line of positioned.lines) {
            lineNum++;
            const yFromBottom = pageHeight - (positioned.y + line.baseline);

            console.log(`  Line ${lineNum}: y=${line.y}, baseline=${line.baseline}, yFromBottom=${yFromBottom}, spans=${line.spans.length}`);

            // Check if line is off the page
            if (yFromBottom < 0 || yFromBottom > pageHeight) {
                console.warn(`  ⚠️  Line ${lineNum} is OFF PAGE! (yFromBottom=${yFromBottom})`);
            }

            for (const span of line.spans) {
                const x = positioned.x + span.x;

                // Get font
                const font = await this.getFont(pdfPage.doc, span.style);

                // Draw text
                pdfPage.drawText(span.text, {
                    x: x,
                    y: yFromBottom,
                    size: span.style.fontSize,
                    font: font,
                    color: rgb(0, 0, 0)
                });
            }
        }
    }

    /**
     * Get PDF font based on style
     */
    async getFont(pdfDoc, style) {
        // Map to standard fonts (in production, embed custom fonts)
        if (style.fontWeight === 'bold') {
            return await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        }
        if (style.fontStyle === 'italic') {
            return await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
        }
        return await pdfDoc.embedFont(StandardFonts.Helvetica);
    }
}

module.exports = { PDFExporter };
