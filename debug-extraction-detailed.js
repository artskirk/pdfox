/**
 * Detailed trace of extraction process for the invoice
 */
const fs = require('fs');
const PDFExtract = require('pdf.js-extract').PDFExtract;
const { PDFParser } = require('./lib/pdf-parser');

async function debugExtraction() {
    console.log('🔍 DETAILED EXTRACTION DEBUG\n');
    console.log('═'.repeat(70));

    const pdfExtract = new PDFExtract();
    const pdfBuffer = fs.readFileSync('./uploads/test-invoice-with-images.pdf');

    // Get raw extraction
    const rawData = await pdfExtract.extractBuffer(pdfBuffer, {});
    const page1Raw = rawData.pages[0];

    console.log('\n📄 RAW EXTRACTION - Page 1:\n');
    console.log(`Total items: ${page1Raw.content.length}`);

    // Show ALL text items with positions
    console.log('\nAll text items (with positions):');
    page1Raw.content.forEach((item, idx) => {
        const text = item.str;
        console.log(`  ${idx + 1}. [y=${item.y.toFixed(1)}, x=${item.x.toFixed(1)}, h=${item.height.toFixed(1)}] "${text}"`);
    });

    // Now parse with PDFParser
    console.log('\n\n📊 PARSED EXTRACTION:\n');
    const parser = new PDFParser();
    const document = await parser.parsePDF(pdfBuffer);
    const page1Parsed = document.pages[0];

    console.log(`Text elements created: ${page1Parsed.elements.filter(e => e.elementType === 'text').length}`);

    // Show parsed elements
    console.log('\nParsed text elements:');
    page1Parsed.elements.filter(e => e.elementType === 'text').forEach((elem, idx) => {
        const text = elem.content.map(c => c.text).join('');
        console.log(`  ${idx + 1}. [y=${elem.yPosition?.toFixed(1)}] "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
    });

    // Compare
    const rawTexts = page1Raw.content.map(c => c.str.trim()).filter(t => t);
    const parsedTexts = page1Parsed.elements
        .filter(e => e.elementType === 'text')
        .map(e => e.content.map(c => c.text).join('').trim())
        .filter(t => t);

    console.log('\n\n📊 COMPARISON:');
    console.log(`Raw items: ${rawTexts.length}`);
    console.log(`Parsed items: ${parsedTexts.length}`);
    console.log(`Difference: ${rawTexts.length - parsedTexts.length}`);

    // Find what's missing
    const allParsedText = parsedTexts.join(' ').toLowerCase();
    const missingItems = rawTexts.filter(rt => !allParsedText.includes(rt.toLowerCase()));

    if (missingItems.length > 0) {
        console.log(`\n❌ Missing from parsed (${missingItems.length} items):`);
        missingItems.slice(0, 15).forEach((item, idx) => {
            console.log(`  ${idx + 1}. "${item}"`);
        });
    }

    console.log('\n═'.repeat(70));
}

debugExtraction().catch(console.error);
