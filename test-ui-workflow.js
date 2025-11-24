/**
 * Test the actual UI workflow - import and inspect what's rendered
 */
const fs = require('fs');
const { PDFParser } = require('./lib/pdf-parser');
const { PDFExporter } = require('./lib/pdf-exporter');

async function testUIWorkflow() {
    console.log('🔍 Testing UI Workflow - Investigating Y-scale Issue\n');
    console.log('═'.repeat(70));

    // Step 1: Import PDF (simulating UI import)
    console.log('\n📥 Step 1: Importing PDF...');
    const parser = new PDFParser();
    const pdfBuffer = fs.readFileSync('./uploads/cv-test.pdf.pdf');
    const document = await parser.parsePDF(pdfBuffer);

    console.log(`✅ Imported ${document.pages.length} pages`);
    console.log(`Mode: ${document.metadata?.mode}`);

    // Step 2: Inspect Page 1 elements in preserve mode
    console.log('\n📊 Step 2: Analyzing Page 1 Elements...');
    const page1 = document.pages[0];
    const textElements = page1.elements.filter(e => e.elementType === 'text');

    console.log(`\nFound ${textElements.length} text elements on page 1`);

    // Find and display the problematic elements
    let prevElement = null;
    for (let i = 0; i < textElements.length; i++) {
        const elem = textElements[i];
        const text = elem.content.map(c => c.text).join('');

        if (text.includes('patterns') || text.includes('learning')) {
            console.log(`\n─────────────────────────────────────────────────────────`);
            console.log(`Element #${i}:`);
            console.log(`  Text: "${text.substring(0, 70)}..."`);
            console.log(`  Y Position: ${elem.yPosition?.toFixed(2) || 'N/A'}`);
            console.log(`  Font Size: ${elem.style?.fontSize || 'N/A'}`);
            console.log(`  Margin Left: ${elem.style?.marginLeft || 'N/A'}`);

            if (prevElement && prevElement.yPosition && elem.yPosition) {
                const gap = elem.yPosition - prevElement.yPosition;
                console.log(`  Gap from previous: ${gap.toFixed(2)}px`);
            }

            prevElement = elem;
        }
    }

    // Step 3: Save document model to inspect
    console.log('\n\n📝 Step 3: Saving document model...');
    fs.writeFileSync('/tmp/document-model.json', JSON.stringify(document, null, 2));
    console.log('✅ Document model saved to /tmp/document-model.json');

    // Step 4: Export PDF
    console.log('\n📤 Step 4: Exporting PDF...');
    const exporter = new PDFExporter();
    const pdfBytes = await exporter.exportToPDF(document);
    fs.writeFileSync('/tmp/exported-ui-test.pdf', Buffer.from(pdfBytes));
    console.log('✅ Exported to /tmp/exported-ui-test.pdf');

    // Step 5: Parse exported PDF and compare
    console.log('\n📊 Step 5: Analyzing exported PDF...');
    const exportedDoc = await parser.parsePDF(fs.readFileSync('/tmp/exported-ui-test.pdf'));
    const exportedPage1 = exportedDoc.pages[0];
    const exportedElements = exportedPage1.elements.filter(e => e.elementType === 'text');

    console.log(`\nFound ${exportedElements.length} text elements in exported page 1`);

    // Find the same elements in exported PDF
    prevElement = null;
    for (let i = 0; i < exportedElements.length; i++) {
        const elem = exportedElements[i];
        const text = elem.content.map(c => c.text).join('');

        if (text.includes('patterns') || text.includes('learning')) {
            console.log(`\n─────────────────────────────────────────────────────────`);
            console.log(`Exported Element #${i}:`);
            console.log(`  Text: "${text.substring(0, 70)}..."`);
            console.log(`  Y Position: ${elem.yPosition?.toFixed(2) || 'N/A'}`);
            console.log(`  Font Size: ${elem.style?.fontSize || 'N/A'}`);

            if (prevElement && prevElement.yPosition && elem.yPosition) {
                const gap = elem.yPosition - prevElement.yPosition;
                console.log(`  Gap from previous: ${gap.toFixed(2)}px`);

                if (gap < 10) {
                    console.log(`  ❌ WARNING: Gap is too small! (${gap.toFixed(2)}px)`);
                } else {
                    console.log(`  ✅ Gap is good (${gap.toFixed(2)}px)`);
                }
            }

            prevElement = elem;
        }
    }

    // Step 6: Check what elements were actually drawn
    console.log('\n\n═'.repeat(70));
    console.log('🔍 DIAGNOSTIC: Checking drawPreserveText behavior');
    console.log('═'.repeat(70));

    // Find the specific problematic element
    const problematicElement = textElements.find(e =>
        e.content.map(c => c.text).join('').includes('fast-paced') &&
        e.content.map(c => c.text).join('').includes('patterns,')
    );

    if (problematicElement) {
        const { PDFDocument, StandardFonts } = require('pdf-lib');
        const text = problematicElement.content.map(c => c.text).join('');
        const fontSize = problematicElement.style?.fontSize || 11;
        const leftMargin = problematicElement.style?.marginLeft || 72;
        const rightMargin = 72;
        const pageWidth = page1.width;
        const maxWidth = pageWidth - leftMargin - rightMargin;

        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const overflow = textWidth - maxWidth;

        console.log(`\nProblematic Element Analysis:`);
        console.log(`  Full text: "${text}"`);
        console.log(`  Text width: ${textWidth.toFixed(2)}px`);
        console.log(`  Available width: ${maxWidth.toFixed(2)}px`);
        console.log(`  Overflow: ${overflow.toFixed(2)}px`);
        console.log(`  Overflow percentage: ${((overflow / textWidth) * 100).toFixed(2)}%`);

        const needsWrapping = overflow > 10 && (overflow / textWidth) > 0.02;
        console.log(`\n  Wrapping threshold check:`);
        console.log(`    overflow > 10? ${overflow > 10 ? '✅ YES' : '❌ NO'} (${overflow.toFixed(2)}px)`);
        console.log(`    overflow > 2%? ${(overflow / textWidth) > 0.02 ? '✅ YES' : '❌ NO'} (${((overflow / textWidth) * 100).toFixed(2)}%)`);
        console.log(`    Needs wrapping? ${needsWrapping ? '✅ YES' : '❌ NO'}`);

        if (needsWrapping) {
            console.log(`\n  ⚠️  THIS ELEMENT WILL BE WRAPPED!`);
            console.log(`  This may cause overlap issues.`);
        } else {
            console.log(`\n  ✅ THIS ELEMENT WILL NOT BE WRAPPED`);
            console.log(`  Text will be drawn as single line.`);
        }
    }

    console.log('\n' + '═'.repeat(70));
    console.log('Test complete. Check the output above for issues.');
    console.log('═'.repeat(70));
}

testUIWorkflow().catch(console.error);
