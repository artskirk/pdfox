/**
 * Find exactly which text is being lost
 */
const fs = require('fs');
const { PDFParser } = require('./lib/pdf-parser');
const { PDFExporter } = require('./lib/pdf-exporter');

async function findLostText() {
    console.log('🔍 FINDING LOST TEXT\n');
    console.log('═'.repeat(70));

    // Import and export
    const parser = new PDFParser();
    const originalBuffer = fs.readFileSync('./uploads/cv-test.pdf.pdf');
    const document = await parser.parsePDF(originalBuffer);

    const exporter = new PDFExporter();
    const pdfBytes = await exporter.exportToPDF(document);
    fs.writeFileSync('/tmp/find-lost.pdf', Buffer.from(pdfBytes));

    const exportedDoc = await parser.parsePDF(fs.readFileSync('/tmp/find-lost.pdf'));

    // Compare page by page
    for (let pageIdx = 0; pageIdx < document.pages.length; pageIdx++) {
        const origPage = document.pages[pageIdx];
        const expPage = exportedDoc.pages[pageIdx];

        const origElements = origPage.elements.filter(e => e.elementType === 'text');
        const expElements = expPage.elements.filter(e => e.elementType === 'text');

        console.log(`\n📄 PAGE ${pageIdx + 1}:`);
        console.log(`Original elements: ${origElements.length}`);
        console.log(`Exported elements: ${expElements.length}`);

        // Get all text from original
        const origTexts = origElements.map(e => e.content.map(c => c.text).join(''));
        const origFullText = origTexts.join('');

        // Get all text from exported
        const expTexts = expElements.map(e => e.content.map(c => c.text).join(''));
        const expFullText = expTexts.join('');

        console.log(`Original chars: ${origFullText.length}`);
        console.log(`Exported chars: ${expFullText.length}`);
        console.log(`Loss: ${origFullText.length - expFullText.length} chars`);

        // Find what's in original but not in exported
        if (origFullText.length > expFullText.length) {
            console.log(`\n🔍 Checking for lost text on page ${pageIdx + 1}...`);

            for (let i = 0; i < origElements.length; i++) {
                const origText = origTexts[i];
                const foundInExport = expFullText.includes(origText);

                if (!foundInExport) {
                    console.log(`\n❌ LOST TEXT FOUND:`);
                    console.log(`   Element #${i} (Y=${origElements[i].yPosition})`);
                    console.log(`   Text: "${origText}"`);
                    console.log(`   Length: ${origText.length} chars`);

                    // Check if partial text exists
                    const partialMatch = expTexts.find(expText =>
                        expText.includes(origText.substring(0, Math.min(20, origText.length))) ||
                        origText.includes(expText)
                    );

                    if (partialMatch) {
                        console.log(`   ⚠️  Partial match found: "${partialMatch}"`);
                        console.log(`   Likely cause: Text was truncated or wrapped`);
                    } else {
                        console.log(`   ⚠️  No match found at all`);
                        console.log(`   Likely cause: Element was skipped or failed to render`);
                    }
                }
            }
        }
    }

    console.log('\n' + '═'.repeat(70));
}

findLostText().catch(console.error);
