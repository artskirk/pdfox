/**
 * Test PDF export with paragraph grouping
 */
const fs = require('fs');
const { PDFParser } = require('./lib/pdf-parser');
const { PDFExporter } = require('./lib/pdf-exporter');

async function testPDFExport() {
    console.log('🔍 TESTING PDF EXPORT WITH PARAGRAPH GROUPING\n');
    console.log('═'.repeat(70));

    // Import the PDF
    const parser = new PDFParser();
    const pdfBuffer = fs.readFileSync('./uploads/cv-test.pdf.pdf');
    const document = await parser.parsePDF(pdfBuffer);

    console.log('\n📥 Original document:');
    console.log(`  Pages: ${document.pages.length}`);
    console.log(`  Page 1 elements: ${document.pages[0].elements.length}`);

    const textElements = document.pages[0].elements.filter(e => e.elementType === 'text');
    console.log(`  Page 1 text elements: ${textElements.length}`);

    // Export to PDF (this should trigger grouping)
    console.log('\n📤 Exporting to PDF with paragraph grouping...\n');
    const exporter = new PDFExporter();
    const pdfBytes = await exporter.exportToPDF(document);

    // Save exported PDF
    fs.writeFileSync('/tmp/test-grouped-export.pdf', Buffer.from(pdfBytes));
    console.log('\n✅ Exported to /tmp/test-grouped-export.pdf');

    // Re-import to verify
    const exportedDoc = await parser.parsePDF(fs.readFileSync('/tmp/test-grouped-export.pdf'));

    console.log('\n📊 Exported document analysis:');
    console.log(`  Pages: ${exportedDoc.pages.length}`);
    const exportedText = exportedDoc.pages[0].elements.filter(e => e.elementType === 'text');
    console.log(`  Page 1 text elements: ${exportedText.length}`);

    // Calculate text retention
    let originalChars = 0;
    for (const elem of textElements) {
        originalChars += elem.content.map(c => c.text).join('').length;
    }

    let exportedChars = 0;
    for (const elem of exportedText) {
        exportedChars += elem.content.map(c => c.text).join('').length;
    }

    console.log(`\n📈 Text retention:`);
    console.log(`  Original: ${originalChars} chars`);
    console.log(`  Exported: ${exportedChars} chars`);
    console.log(`  Retention: ${(exportedChars / originalChars * 100).toFixed(2)}%`);

    console.log('\n═'.repeat(70));
}

testPDFExport().catch(console.error);
