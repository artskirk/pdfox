/**
 * PDF Parser - Extract text, images, and graphics from PDF files with style preservation
 * Converts PDF to editable document model for preserve-mode editor
 * Uses pdf.js-extract for text extraction and pdf-lib for image extraction
 */

const PDFExtract = require('pdf.js-extract').PDFExtract;
const { PDFDocument } = require('pdf-lib');
const zlib = require('zlib');
// Note: Full pdfjs-dist integration requires ES modules
// For now, we'll use pdf.js-extract for text and pdf-lib for basic structure

class PDFParser {
    constructor() {
        this.pdfExtract = new PDFExtract();
    }

    /**
     * Parse PDF file and convert to document model
     * Extracts text with positioning and prepares for preserve-mode editing
     */
    async parsePDF(pdfBuffer) {
        console.log('📄 Parsing PDF with element extraction...');

        // Extract text content with positioning using pdf.js-extract
        const textData = await this.pdfExtract.extractBuffer(pdfBuffer, {});

        // Load PDF with pdf-lib for image extraction
        const pdfDoc = await PDFDocument.load(pdfBuffer);

        console.log(`  Found ${textData.pages.length} pages`);

        // Convert each page to document model
        const pages = [];
        for (let i = 0; i < textData.pages.length; i++) {
            const textPage = textData.pages[i];
            const pdfPage = pdfDoc.getPage(i);

            console.log(`  Page ${i + 1}: ${textPage.content.length} text items`);

            // Extract images from this page
            const images = await this.extractImages(pdfPage, i + 1, textPage.pageInfo.height);
            console.log(`    Found ${images.length} images`);

            // Extract vector graphics (lines, rectangles, paths)
            const graphics = await this.extractGraphics(pdfPage, i + 1, textPage.pageInfo.height);
            console.log(`    Found ${graphics.length} vector graphics`);

            const page = this.convertPage(textPage, i + 1, images, graphics);
            pages.push(page);
        }

        return {
            id: this.generateId(),
            pages: pages,
            metadata: {
                title: textData.meta?.info?.Title || 'Imported PDF Document',
                author: textData.meta?.info?.Author,
                createdAt: new Date().toISOString(),
                source: 'pdf-import',
                originalPages: textData.pages.length,
                mode: 'preserve' // Preserve mode preserves exact layout
            }
        };
    }

    /**
     * Extract images from PDF page using pdf-lib
     */
    async extractImages(pdfPage, pageNumber, pageHeight) {
        const images = [];

        try {
            const { width, height } = pdfPage.getSize();

            // Get page node to access resources
            const pageNode = pdfPage.node;
            const resources = pageNode.Resources();

            if (!resources || !resources.lookup) {
                return images;
            }

            // Get XObject dictionary (contains images)
            const xObjects = resources.lookup('XObject');

            if (!xObjects) {
                return images;
            }

            // Parse content stream to get image positions
            const contentStream = pageNode.Contents();
            const imagePositions = await this.parseImagePositions(contentStream, pageHeight);

            // Iterate through XObjects to find images
            const xObjectKeys = xObjects.keys ? xObjects.keys() : [];

            for (const key of xObjectKeys) {
                try {
                    const xObject = xObjects.lookup(key);

                    if (!xObject) continue;

                    // Check if this is an image (Subtype = Image)
                    const subtype = xObject.lookup('Subtype');
                    if (subtype && subtype.toString() === '/Image') {
                        const imageWidth = xObject.lookup('Width');
                        const imageHeight = xObject.lookup('Height');
                        const imageName = key.toString().replace('/', '');

                        // Get position from content stream parsing
                        const position = imagePositions.get(imageName) || {
                            x: 0,
                            y: 0,
                            width: imageWidth ? imageWidth.numberValue : 100,
                            height: imageHeight ? imageHeight.numberValue : 100
                        };

                        // Extract image data as base64
                        let imageData = null;
                        try {
                            const imageBytes = xObject.contents();
                            if (imageBytes) {
                                imageData = Buffer.from(imageBytes).toString('base64');
                            }
                        } catch (dataErr) {
                            console.warn(`    Could not extract data for image ${imageName}`);
                        }

                        // Create image element with actual data
                        images.push({
                            id: this.generateId(),
                            type: 'image',
                            name: imageName,
                            position: position,
                            data: imageData,
                            // Store reference for debugging
                            reference: key.toString()
                        });
                    }
                } catch (err) {
                    // Skip problematic XObjects
                    console.warn(`    Skipping problematic image:`, err.message);
                    continue;
                }
            }

        } catch (error) {
            console.error(`    Warning: Could not extract images from page ${pageNumber}:`, error.message);
        }

        return images;
    }

    /**
     * Parse PDF content stream to extract image positions
     * This is a simplified parser that looks for image placement operators (cm, Do)
     */
    async parseImagePositions(contentStream, pageHeight) {
        const positions = new Map();

        try {
            if (!contentStream) return positions;

            // Get content stream bytes
            const streamArray = Array.isArray(contentStream) ? contentStream : [contentStream];

            for (const stream of streamArray) {
                const streamBytes = stream.contents ? stream.contents() : null;
                if (!streamBytes) continue;

                // Convert to string
                const content = Buffer.from(streamBytes).toString('latin1');

                // Simple regex to find image placement
                // Pattern: matrix transform (cm) followed by image invocation (Do)
                // Example: 100 0 0 50 72 700 cm /Im1 Do
                const imagePattern = /([\d\.\-\s]+)\s+cm\s+\/(\w+)\s+Do/g;

                let match;
                while ((match = imagePattern.exec(content)) !== null) {
                    const matrix = match[1].trim().split(/\s+/).map(parseFloat);
                    const imageName = match[2];

                    if (matrix.length === 6) {
                        // PDF transformation matrix: [a b c d e f]
                        // For simple scaling and translation: [scaleX 0 0 scaleY translateX translateY]
                        const scaleX = matrix[0];
                        const scaleY = matrix[3];
                        const x = matrix[4];
                        const y = matrix[5];

                        // Convert Y coordinate from bottom-left to top-left
                        const yFromTop = pageHeight - y - scaleY;

                        positions.set(imageName, {
                            x: x,
                            y: yFromTop,
                            width: scaleX,
                            height: scaleY
                        });
                    }
                }
            }
        } catch (error) {
            console.warn(`    Could not parse content stream for image positions:`, error.message);
        }

        return positions;
    }

    /**
     * Extract vector graphics (lines, rectangles, paths) from PDF page
     * Parses content stream to find drawing operations
     */
    async extractGraphics(pdfPage, pageNumber, pageHeight) {
        const graphics = [];

        try {
            const { width, height } = pdfPage.getSize();
            const pageNode = pdfPage.node;
            const contentStream = pageNode.Contents();

            if (!contentStream) return graphics;

            // Get content stream bytes
            const streamArray = Array.isArray(contentStream) ? contentStream : [contentStream];

            for (const stream of streamArray) {
                let streamBytes = null;

                // Try different methods to get stream contents
                if (typeof stream.contents === 'function') {
                    streamBytes = stream.contents();
                } else if (stream.contents) {
                    streamBytes = stream.contents;
                } else if (typeof stream.getContents === 'function') {
                    streamBytes = stream.getContents();
                }

                if (!streamBytes) continue;

                // Decompress if needed (PDFs often use Flate/zlib compression)
                let decompressed = streamBytes;
                try {
                    // Check if data starts with zlib header (0x78)
                    if (streamBytes[0] === 0x78) {
                        decompressed = zlib.inflateSync(Buffer.from(streamBytes));
                    }
                } catch (err) {
                    // If decompression fails, use raw data
                    console.warn(`    Could not decompress stream, using raw data`);
                }

                // Convert to string
                const content = Buffer.from(decompressed).toString('latin1');

                // Parse graphics operations
                const parsedGraphics = this.parseGraphicsOperations(content, pageHeight, width, height);
                graphics.push(...parsedGraphics);
            }

        } catch (error) {
            console.warn(`    Warning: Could not extract graphics from page ${pageNumber}:`, error.message);
        }

        return graphics;
    }

    /**
     * Parse PDF graphics operations from content stream
     * Extracts rectangles (re), lines (l), and paths (m, l, c, v, y, h)
     */
    parseGraphicsOperations(content, pageHeight, pageWidth, pageHeightActual) {
        const graphics = [];

        // Current graphics state
        let currentPath = [];
        let currentColor = { r: 0, g: 0, b: 0 };
        let currentLineWidth = 1;
        let strokeColor = null;
        let fillColor = null;

        // Split into tokens
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Parse color operations (RG = stroke RGB, rg = fill RGB)
            const rgbStrokeMatch = line.match(/([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+RG/);
            if (rgbStrokeMatch) {
                strokeColor = {
                    r: parseFloat(rgbStrokeMatch[1]),
                    g: parseFloat(rgbStrokeMatch[2]),
                    b: parseFloat(rgbStrokeMatch[3])
                };
                continue;
            }

            const rgbFillMatch = line.match(/([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+rg/);
            if (rgbFillMatch) {
                fillColor = {
                    r: parseFloat(rgbFillMatch[1]),
                    g: parseFloat(rgbFillMatch[2]),
                    b: parseFloat(rgbFillMatch[3])
                };
                continue;
            }

            // Parse line width
            const lineWidthMatch = line.match(/([\d\.]+)\s+w/);
            if (lineWidthMatch) {
                currentLineWidth = parseFloat(lineWidthMatch[1]);
                continue;
            }

            // Parse rectangle operation: x y width height re
            const rectMatch = line.match(/([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+re/);
            if (rectMatch) {
                const x = parseFloat(rectMatch[1]);
                const y = parseFloat(rectMatch[2]);
                const width = parseFloat(rectMatch[3]);
                const height = parseFloat(rectMatch[4]);

                // Convert Y coordinate from bottom-left to top-left
                const yFromTop = pageHeight - y - height;

                graphics.push({
                    id: this.generateId(),
                    type: 'rectangle',
                    position: {
                        x: x,
                        y: yFromTop,
                        width: width,
                        height: height
                    },
                    style: {
                        stroke: strokeColor ? `rgb(${Math.round(strokeColor.r * 255)}, ${Math.round(strokeColor.g * 255)}, ${Math.round(strokeColor.b * 255)})` : 'rgb(0, 0, 0)',
                        fill: fillColor ? `rgb(${Math.round(fillColor.r * 255)}, ${Math.round(fillColor.g * 255)}, ${Math.round(fillColor.b * 255)})` : 'none',
                        lineWidth: currentLineWidth
                    }
                });
                continue;
            }

            // Parse line operations: x1 y1 m x2 y2 l S (moveto, lineto, stroke)
            const moveMatch = line.match(/([\d\.\-]+)\s+([\d\.\-]+)\s+m/);
            if (moveMatch) {
                currentPath = [{
                    x: parseFloat(moveMatch[1]),
                    y: parseFloat(moveMatch[2])
                }];
                continue;
            }

            const lineMatch = line.match(/([\d\.\-]+)\s+([\d\.\-]+)\s+l/);
            if (lineMatch) {
                currentPath.push({
                    x: parseFloat(lineMatch[1]),
                    y: parseFloat(lineMatch[2])
                });
                continue;
            }

            // Stroke or fill path
            if (line === 'S' || line === 's' || line === 'f' || line === 'F' || line === 'B' || line === 'b') {
                if (currentPath.length >= 2) {
                    // Check if it's a simple line (2 points)
                    if (currentPath.length === 2) {
                        const p1 = currentPath[0];
                        const p2 = currentPath[1];

                        const y1FromTop = pageHeight - p1.y;
                        const y2FromTop = pageHeight - p2.y;

                        graphics.push({
                            id: this.generateId(),
                            type: 'line',
                            position: {
                                x1: p1.x,
                                y1: y1FromTop,
                                x2: p2.x,
                                y2: y2FromTop
                            },
                            style: {
                                stroke: strokeColor ? `rgb(${Math.round(strokeColor.r * 255)}, ${Math.round(strokeColor.g * 255)}, ${Math.round(strokeColor.b * 255)})` : 'rgb(0, 0, 0)',
                                lineWidth: currentLineWidth
                            }
                        });
                    } else {
                        // Complex path - store as path with multiple points
                        const points = currentPath.map(p => ({
                            x: p.x,
                            y: pageHeight - p.y
                        }));

                        graphics.push({
                            id: this.generateId(),
                            type: 'path',
                            points: points,
                            style: {
                                stroke: strokeColor ? `rgb(${Math.round(strokeColor.r * 255)}, ${Math.round(strokeColor.g * 255)}, ${Math.round(strokeColor.b * 255)})` : 'rgb(0, 0, 0)',
                                fill: fillColor && (line === 'f' || line === 'F' || line === 'B' || line === 'b') ? `rgb(${Math.round(fillColor.r * 255)}, ${Math.round(fillColor.g * 255)}, ${Math.round(fillColor.b * 255)})` : 'none',
                                lineWidth: currentLineWidth
                            }
                        });
                    }
                }
                currentPath = [];
                continue;
            }
        }

        return graphics;
    }

    /**
     * Convert a single PDF page to document model
     * Now includes text, images, and vector graphics
     */
    convertPage(pdfPage, pageNumber, images = [], graphics = []) {
        // Get page dimensions
        const pageWidth = pdfPage.pageInfo.width;
        const pageHeight = pdfPage.pageInfo.height;

        // Extract and group text content into blocks
        const textBlocks = this.extractBlocks(pdfPage.content, pageHeight);

        console.log(`    Detected ${textBlocks.length} text blocks`);

        // Create comprehensive elements array (text + images + graphics)
        const elements = [
            ...textBlocks.map(block => ({ ...block, elementType: 'text' })),
            ...images.map(img => ({ ...img, elementType: 'image' })),
            ...graphics.map(g => ({ ...g, elementType: 'graphic' }))
        ];

        // Sort elements by Y position to maintain reading order
        elements.sort((a, b) => {
            const aY = a.position?.y || a.yPosition || 0;
            const bY = b.position?.y || b.yPosition || 0;
            return aY - bY;
        });

        return {
            id: `page-${pageNumber}`,
            width: pageWidth,
            height: pageHeight,
            mode: 'preserve', // Default mode (user can toggle in UI)
            elements: elements, // For preserve mode rendering
            // Containers for reflow mode - contains same text blocks
            // Frontend uses if/else if to render only one mode at a time
            containers: [{
                id: `container-${pageNumber}`,
                type: 'preserve',
                bounds: {
                    x: 0,
                    y: 0,
                    width: pageWidth,
                    height: pageHeight
                },
                blocks: textBlocks,
                style: {
                    padding: { top: 0, right: 0, bottom: 0, left: 0 }
                }
            }]
        };
    }

    /**
     * Extract blocks from PDF content items
     * Groups text items by vertical position and style, preserving column structure
     */
    extractBlocks(contentItems, pageHeight) {
        if (contentItems.length === 0) return [];

        // Filter out empty items (PDFs often have empty entries)
        const filteredItems = contentItems.filter(item =>
            item.str && item.str.trim() && item.str.trim().length > 0
        );

        // Sort items by Y position (top to bottom), then X position (left to right)
        const sortedItems = filteredItems.sort((a, b) => {
            const yDiff = a.y - b.y;
            if (Math.abs(yDiff) > 3) { // Tighter tolerance for same line
                return yDiff;
            }
            return a.x - b.x;
        });

        const blocks = [];
        let currentBlock = null;
        let lastY = null;
        let lastX = null;
        let lastFontSize = null;
        let lastFontName = null;

        for (const item of sortedItems) {
            const text = item.str.trim();
            if (!text) continue;

            const fontSize = Math.round(item.height);
            const fontName = item.fontName || '';
            const isBold = fontName.toLowerCase().includes('bold');
            const isItalic = fontName.toLowerCase().includes('italic') || fontName.toLowerCase().includes('oblique');

            // Determine if this starts a new block
            const isNewLine = lastY !== null && Math.abs(item.y - lastY) > fontSize * 0.5;
            const styleChanged = lastFontSize !== null &&
                                (Math.abs(fontSize - lastFontSize) > 2 || fontName !== lastFontName);
            const hasVerticalGap = lastY !== null && Math.abs(item.y - lastY) > fontSize * 1.5;

            // Check for column break - items far apart horizontally should be separate blocks
            const hasHorizontalGap = lastX !== null && Math.abs(item.x - lastX) > 50;

            // On same line but different column - start new block
            const isDifferentColumn = !isNewLine && hasHorizontalGap;

            // In preserve mode, ANY new line OR column change should create new block
            // This preserves the exact layout of the original PDF
            const isNewBlock = isNewLine || !currentBlock || isDifferentColumn;

            if (isNewBlock && currentBlock) {
                // Finalize current block
                blocks.push(this.finalizeBlock(currentBlock));
                currentBlock = null;
            }

            if (!currentBlock) {
                // Start new block
                currentBlock = {
                    text: [],
                    fontSize: fontSize,
                    fontName: fontName,
                    isBold: isBold,
                    isItalic: isItalic,
                    yPosition: item.y,
                    xPosition: item.x,  // Track X position for column detection
                    items: []
                };
            }

            // Add text to current block
            currentBlock.text.push(text);
            currentBlock.items.push(item);

            lastY = item.y;
            lastX = item.x + (item.width || 0);  // Track end of last item
            lastFontSize = fontSize;
            lastFontName = fontName;
        }

        // Finalize last block
        if (currentBlock) {
            blocks.push(this.finalizeBlock(currentBlock));
        }

        return blocks;
    }

    /**
     * Convert accumulated block data into document model format
     */
    finalizeBlock(blockData) {
        // Combine text items with spaces
        const text = blockData.text.join(' ');

        // Determine block type based on properties
        const avgFontSize = blockData.fontSize;
        const isLargeText = avgFontSize >= 16;
        const isShortText = text.length < 100;

        // Heuristic: large or bold text is likely a heading
        const isHeading = (isLargeText || blockData.isBold) && isShortText;

        // Determine font weight
        const fontWeight = blockData.isBold ? 'bold' : 'normal';
        const fontStyle = blockData.isItalic ? 'italic' : 'normal';

        // Calculate appropriate line height
        const lineHeight = isHeading ? 1.3 : 1.5;

        // Calculate margins based on type
        const marginTop = isHeading ? 20 : 0;
        const marginBottom = isHeading ? 15 : 12;

        // Get X position from first item (for left margin/positioning)
        const xPosition = blockData.items && blockData.items[0] ? blockData.items[0].x : 72;

        return {
            id: this.generateId(),
            type: isHeading ? 'heading' : 'paragraph',
            content: [{
                text: text,
                style: fontStyle !== 'normal' ? { fontStyle } : undefined
            }],
            yPosition: blockData.yPosition, // Store Y position for preserve mode
            xPosition: xPosition, // Store X position for preserve mode
            style: {
                fontSize: avgFontSize,
                fontFamily: 'Arial, sans-serif',
                fontWeight: fontWeight,
                lineHeight: lineHeight,
                textAlign: 'left',
                marginTop: marginTop,
                marginBottom: marginBottom,
                marginLeft: xPosition // Store as margin for compatibility
            }
        };
    }

    /**
     * Generate unique ID
     */
    generateId() {
        return Math.random().toString(36).substr(2, 9);
    }
}

module.exports = { PDFParser };
