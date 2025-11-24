/**
 * Simple direct export test
 */
const fs = require('fs');

// Force clear cache
delete require.cache[require.resolve('./lib/pdf-parser')];
delete require.cache[require.resolve('./lib/pdf-exporter')];

const { PDFParser } = require('./lib/pdf-parser');
const { PDFExporter } = require('./lib/pdf-exporter');

async function simpleTest() {
    console.log('🧪 Simple Export Test\n');

    // Load and parse
    const parser = new PDFParser();
    const pdfBuffer = fs.readFileSync('./uploads/test-invoice-with-images.pdf');
    const document = await parser.parsePDF(pdfBuffer);

    console.log(`Parsed ${document.pages.length} pages`);
    console.log(`Page 1 has ${document.pages[0].elements.length} elements\n`);

    // Export
    const exporter = new PDFExporter();
    const pdfBytes = await exporter.exportToPDF(document);

    fs.writeFileSync('./outputs/simple-test-output.pdf', Buffer.from(pdfBytes));

    console.log(`\n✅ Exported to ./outputs/simple-test-output.pdf (${Math.round(pdfBytes.length / 1024)} KB)`);
}

simpleTest().catch(console.error);
