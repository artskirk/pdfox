/**
 * Test paragraph grouping logic with actual imported PDF data
 */
const fs = require('fs');
const { PDFParser } = require('./lib/pdf-parser');

// Copy the grouping logic from index.html
function groupIntoParagraphs(elements) {
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
                content: element.content
            };
        } else {
            // Check if this element should be combined with current paragraph
            // Compare against the LAST line's Y position, not the first
            const xDiff = Math.abs(xPos - currentParagraph.xPosition);
            const yDiff = yPos - currentParagraph.lastYPosition;
            const expectedLineGap = fontSize * 1.5;

            // Combine if same X position and reasonable Y gap
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
                    content: element.content
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

async function testGrouping() {
    console.log('🔍 TESTING PARAGRAPH GROUPING LOGIC\n');
    console.log('═'.repeat(70));

    // Import the PDF
    const parser = new PDFParser();
    const pdfBuffer = fs.readFileSync('./uploads/cv-test.pdf.pdf');
    const document = await parser.parsePDF(pdfBuffer);

    const page1 = document.pages[0];
    const textElements = page1.elements.filter(e => e.elementType === 'text');

    console.log(`\n📊 Original Data:`);
    console.log(`  Total text elements: ${textElements.length}`);
    console.log(`\nElement breakdown:`);

    for (let i = 0; i < textElements.length; i++) {
        const elem = textElements[i];
        const text = elem.content.map(c => c.text).join('');
        const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
        console.log(`  ${i + 1}. Y=${elem.yPosition?.toFixed(2)} X=${elem.xPosition?.toFixed(2)} Font=${elem.style?.fontSize} "${preview}"`);
    }

    // Apply grouping
    const paragraphs = groupIntoParagraphs(textElements);

    console.log(`\n📊 After Grouping:`);
    console.log(`  Total paragraph blocks: ${paragraphs.length}`);
    console.log(`  Reduction: ${textElements.length} → ${paragraphs.length} (${((1 - paragraphs.length / textElements.length) * 100).toFixed(0)}% fewer blocks)`);

    console.log(`\nParagraph breakdown:`);

    for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i];
        const text = para.content.map(c => c.text).join('');
        const preview = text.length > 60 ? text.substring(0, 60) + '...' : text;
        const lineHeight = 1.65;
        const fontSize = para.style?.fontSize || 12;

        // Calculate wrapped height (rough estimate)
        const maxWidth = 523; // ~595px page width - margins
        const avgCharWidth = fontSize * 0.5; // Rough estimate
        const charsPerLine = Math.floor(maxWidth / avgCharWidth);
        const estimatedLines = Math.ceil(text.length / charsPerLine);
        const wrappedHeight = fontSize * lineHeight * estimatedLines;

        console.log(`  ${i + 1}. Y=${para.yPosition?.toFixed(2)} Font=${fontSize} Chars=${text.length}`);
        console.log(`     Text: "${preview}"`);
        console.log(`     Est. lines: ${estimatedLines}, Est. height: ${wrappedHeight.toFixed(2)}px`);

        // Check gap to next paragraph
        if (i < paragraphs.length - 1) {
            const nextPara = paragraphs[i + 1];
            const gap = nextPara.yPosition - para.yPosition;
            const willOverlap = wrappedHeight > gap;

            console.log(`     Gap to next: ${gap.toFixed(2)}px ${willOverlap ? '⚠️  MIGHT OVERLAP' : '✅ Safe'}`);
        }
        console.log('');
    }

    // Check for critical overlap cases
    console.log('\n═'.repeat(70));
    console.log('🎯 OVERLAP ANALYSIS\n');

    let overlapCount = 0;
    for (let i = 0; i < paragraphs.length - 1; i++) {
        const para = paragraphs[i];
        const nextPara = paragraphs[i + 1];
        const text = para.content.map(c => c.text).join('');
        const fontSize = para.style?.fontSize || 12;
        const lineHeight = 1.65;

        // Rough estimate of wrapped height
        const maxWidth = 523;
        const avgCharWidth = fontSize * 0.5;
        const charsPerLine = Math.floor(maxWidth / avgCharWidth);
        const estimatedLines = Math.ceil(text.length / charsPerLine);
        const wrappedHeight = fontSize * lineHeight * estimatedLines;

        const gap = nextPara.yPosition - para.yPosition;

        if (wrappedHeight > gap) {
            overlapCount++;
            const preview = text.substring(0, 40);
            console.log(`❌ Potential overlap #${overlapCount}:`);
            console.log(`   Paragraph: "${preview}..."`);
            console.log(`   Wrapped height: ${wrappedHeight.toFixed(2)}px`);
            console.log(`   Gap to next: ${gap.toFixed(2)}px`);
            console.log(`   Overflow: ${(wrappedHeight - gap).toFixed(2)}px\n`);
        }
    }

    if (overlapCount === 0) {
        console.log('✅ No potential overlaps detected!');
        console.log('   All paragraph blocks have sufficient spacing.');
    } else {
        console.log(`⚠️  Found ${overlapCount} potential overlap(s)`);
        console.log('   Note: These are rough estimates based on average character width.');
        console.log('   Actual rendering may differ due to font metrics and word breaks.');
    }

    console.log('\n═'.repeat(70));
}

testGrouping().catch(console.error);
