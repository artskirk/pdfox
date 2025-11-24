/**
 * Debug PDF wrapping to see exact line breaks
 */
const fs = require('fs');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { PDFParser } = require('./lib/pdf-parser');

// Copy wrapText function from pdf-exporter.js
function wrapText(text, font, fontSize, maxWidth) {
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

async function debugWrapping() {
    console.log('🔍 DEBUGGING PDF PARAGRAPH WRAPPING\n');
    console.log('═'.repeat(70));

    // Import the PDF
    const parser = new PDFParser();
    const pdfBuffer = fs.readFileSync('./uploads/cv-test.pdf.pdf');
    const document = await parser.parsePDF(pdfBuffer);

    // Get text elements
    const textElements = document.pages[0].elements.filter(e => e.elementType === 'text');

    // Group into paragraphs (same logic as exporter)
    const paragraphs = [];
    let currentParagraph = null;

    for (const element of textElements) {
        const xPos = element.xPosition || 72;
        const yPos = element.yPosition || 0;
        const fontSize = element.style?.fontSize || 12;

        if (!currentParagraph) {
            currentParagraph = {
                id: element.id,
                elementType: 'text',
                xPosition: xPos,
                yPosition: yPos,
                lastYPosition: yPos,
                style: element.style,
                content: element.content
            };
        } else {
            const xDiff = Math.abs(xPos - currentParagraph.xPosition);
            const yDiff = yPos - currentParagraph.lastYPosition;
            const expectedLineGap = fontSize * 1.5;

            if (xDiff < 5 && yDiff > 0 && yDiff < expectedLineGap * 2) {
                currentParagraph.content.push({ text: ' ' });
                currentParagraph.content.push(...element.content);
                currentParagraph.lastYPosition = yPos;
            } else {
                paragraphs.push(currentParagraph);
                currentParagraph = {
                    id: element.id,
                    elementType: 'text',
                    xPosition: xPos,
                    yPosition: yPos,
                    lastYPosition: yPos,
                    style: element.style,
                    content: element.content
                };
            }
        }
    }
    if (currentParagraph) paragraphs.push(currentParagraph);

    // Load font for width calculation
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Analyze PROFESSIONAL SUMMARY paragraph (should be paragraph 3)
    console.log(`\n📊 Found ${paragraphs.length} paragraphs\n`);

    for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i];
        const text = para.content.map(c => c.text).join('');
        const fontSize = para.style?.fontSize || 12;
        const leftMargin = para.style?.marginLeft || 72;
        const rightMargin = 72;
        const maxWidth = 595 - leftMargin - rightMargin; // US Letter width

        console.log(`${'─'.repeat(70)}`);
        console.log(`Paragraph ${i + 1}:`);
        console.log(`  Y position: ${para.yPosition.toFixed(2)}`);
        console.log(`  Font size: ${fontSize}px`);
        console.log(`  Text length: ${text.length} chars`);
        console.log(`  Preview: "${text.substring(0, 60)}..."`);

        // Check if needs wrapping
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const overflow = textWidth - maxWidth;
        const needsWrapping = overflow > 10 && (overflow / textWidth) > 0.02;

        console.log(`  Text width: ${textWidth.toFixed(2)}px`);
        console.log(`  Max width: ${maxWidth}px`);
        console.log(`  Overflow: ${overflow.toFixed(2)}px (${(overflow / textWidth * 100).toFixed(1)}%)`);
        console.log(`  Needs wrapping: ${needsWrapping ? 'YES' : 'NO'}`);

        if (needsWrapping) {
            const lines = wrapText(text, font, fontSize, maxWidth);
            console.log(`  Wrapped into ${lines.length} lines:\n`);

            const lineHeight = 1.65;
            let yFromBottom = 792 - para.yPosition - fontSize; // US Letter height

            for (let j = 0; j < lines.length; j++) {
                const line = lines[j];
                const lineWidth = font.widthOfTextAtSize(line, fontSize);
                console.log(`    Line ${j + 1} (${line.length} chars, width: ${lineWidth.toFixed(0)}px, Y: ${yFromBottom.toFixed(1)}px):`);
                console.log(`      "${line}"`);
                yFromBottom -= fontSize * lineHeight;
            }

            // Check if wrapped text overlaps next paragraph
            if (i < paragraphs.length - 1) {
                const nextPara = paragraphs[i + 1];
                const wrappedHeight = lines.length * fontSize * lineHeight;
                const gap = nextPara.yPosition - para.yPosition;
                const willOverlap = wrappedHeight > gap;

                console.log(`\n  Wrapped height: ${wrappedHeight.toFixed(2)}px`);
                console.log(`  Gap to next paragraph: ${gap.toFixed(2)}px`);
                console.log(`  Will overlap: ${willOverlap ? '⚠️  YES!' : '✅ No'}`);
            }
        }

        console.log('');

        // Focus on PROFESSIONAL SUMMARY (paragraph with "Detail-oriented")
        if (text.includes('Detail-oriented')) {
            console.log('\n' + '═'.repeat(70));
            console.log('🎯 PROFESSIONAL SUMMARY PARAGRAPH (the problematic one)');
            console.log('═'.repeat(70));
            console.log(`Full text:\n"${text}"\n`);
            console.log('═'.repeat(70) + '\n');
        }
    }

    console.log('═'.repeat(70));
}

debugWrapping().catch(console.error);
