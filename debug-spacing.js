/**
 * Debug spacing issues in paragraph grouping
 */
const fs = require('fs');
const { PDFParser } = require('./lib/pdf-parser');

function groupIntoParagraphs(elements) {
    const paragraphs = [];
    let currentParagraph = null;

    console.log('\n🔍 GROUPING PROCESS:\n');

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const xPos = element.xPosition || 72;
        const yPos = element.yPosition || 0;
        const fontSize = element.style?.fontSize || 12;
        const text = element.content.map(c => c.text).join('');

        console.log(`Element ${i + 1}: Y=${yPos.toFixed(2)}`);
        console.log(`  Content array length: ${element.content.length}`);
        console.log(`  Content objects:`, element.content);
        console.log(`  Joined text: "${text}"`);
        console.log(`  Text ends with space: ${text.endsWith(' ')}`);
        console.log(`  Text starts with space: ${text.startsWith(' ')}`);

        if (!currentParagraph) {
            console.log(`  → Starting new paragraph\n`);
            currentParagraph = {
                id: element.id,
                elementType: 'text',
                xPosition: xPos,
                yPosition: yPos,
                lastYPosition: yPos,
                style: element.style,
                content: [...element.content]
            };
        } else {
            const xDiff = Math.abs(xPos - currentParagraph.xPosition);
            const yDiff = yPos - currentParagraph.lastYPosition;
            const expectedLineGap = fontSize * 1.5;

            console.log(`  Checking against current paragraph:`);
            console.log(`    xDiff: ${xDiff.toFixed(2)}, yDiff: ${yDiff.toFixed(2)}, maxGap: ${(expectedLineGap * 2).toFixed(2)}`);

            if (xDiff < 5 && yDiff > 0 && yDiff < expectedLineGap * 2) {
                console.log(`  → COMBINING with current paragraph`);
                console.log(`    Adding space object: { text: ' ' }`);
                currentParagraph.content.push({ text: ' ' });
                console.log(`    Adding element content (${element.content.length} objects)`);
                currentParagraph.content.push(...element.content);
                currentParagraph.lastYPosition = yPos;

                const combinedText = currentParagraph.content.map(c => c.text).join('');
                console.log(`    Combined text now: "${combinedText.substring(combinedText.length - 100)}"`);
                console.log('');
            } else {
                console.log(`  → Starting new paragraph (different position)\n`);
                paragraphs.push(currentParagraph);
                currentParagraph = {
                    id: element.id,
                    elementType: 'text',
                    xPosition: xPos,
                    yPosition: yPos,
                    lastYPosition: yPos,
                    style: element.style,
                    content: [...element.content]
                };
            }
        }
    }

    if (currentParagraph) {
        paragraphs.push(currentParagraph);
    }

    return paragraphs;
}

async function debugSpacing() {
    console.log('🔍 DEBUGGING PARAGRAPH SPACING\n');
    console.log('═'.repeat(70));

    const parser = new PDFParser();
    const pdfBuffer = fs.readFileSync('./uploads/cv-test.pdf.pdf');
    const document = await parser.parsePDF(pdfBuffer);

    const textElements = document.pages[0].elements.filter(e => e.elementType === 'text');

    console.log(`\n📊 Found ${textElements.length} text elements on page 1`);

    const paragraphs = groupIntoParagraphs(textElements);

    console.log('\n═'.repeat(70));
    console.log(`\n📊 FINAL RESULT: ${paragraphs.length} paragraphs\n`);

    // Check for the problematic "such asLaravel" text
    for (let i = 0; i < paragraphs.length; i++) {
        const text = paragraphs[i].content.map(c => c.text).join('');
        if (text.includes('Laravel')) {
            console.log(`\nParagraph ${i + 1} contains "Laravel":`);
            console.log(`  Content array length: ${paragraphs[i].content.length}`);
            console.log(`  Full text: "${text}"`);

            // Check for missing space
            if (text.includes('asLaravel')) {
                console.log(`  ❌ FOUND SPACING ISSUE: "asLaravel" (missing space)`);
            } else if (text.includes('as Laravel')) {
                console.log(`  ✅ Spacing looks correct: "as Laravel"`);
            }

            // Show content objects around "Laravel"
            const laravelIndex = paragraphs[i].content.findIndex(c => c.text.includes('Laravel'));
            console.log(`\n  Content objects around "Laravel":`);
            for (let j = Math.max(0, laravelIndex - 3); j <= Math.min(paragraphs[i].content.length - 1, laravelIndex + 1); j++) {
                console.log(`    [${j}]: "${paragraphs[i].content[j].text}"`);
            }
        }
    }

    console.log('\n═'.repeat(70));
}

debugSpacing().catch(console.error);
