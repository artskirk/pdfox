/**
 * Debug PDF rendering to see if spaces are being lost
 */
const fs = require('fs');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { PDFParser } = require('./lib/pdf-parser');
const { PDFExporter } = require('./lib/pdf-exporter');

async function debugPDFRendering() {
    console.log('🔍 DEBUGGING PDF RENDERING\n');
    console.log('═'.repeat(70));

    // Import the PDF
    const parser = new PDFParser();
    const pdfBuffer = fs.readFileSync('./uploads/cv-test.pdf.pdf');
    const document = await parser.parsePDF(pdfBuffer);

    // Export to PDF (with custom logging)
    const exporter = new PDFExporter();

    // Monkey-patch drawPreserveText to add logging
    const originalDrawPreserveText = exporter.drawPreserveText.bind(exporter);
    exporter.drawPreserveText = async function(pdfPage, element, pageHeight) {
        const text = element.content.map(s => s.text).join('');

        if (text.includes('Laravel')) {
            console.log('\n📄 Rendering element containing "Laravel":');
            console.log(`  Content array length: ${element.content.length}`);
            console.log(`  Content objects:`);
            for (let i = 0; i < element.content.length; i++) {
                const obj = element.content[i];
                console.log(`    [${i}]: "${obj.text}" (length: ${obj.text.length})`);
            }
            console.log(`  Joined text: "${text}"`);
            console.log(`  Text length: ${text.length}`);

            // Check for the spacing issue
            const suchAsIndex = text.indexOf('such as');
            const suchAsLaravelIndex = text.indexOf('such asLaravel');

            if (suchAsLaravelIndex !== -1) {
                console.log(`  ❌ FOUND ISSUE: "such asLaravel" at index ${suchAsLaravelIndex}`);
            } else if (suchAsIndex !== -1) {
                console.log(`  ✅ Spacing correct: "such as" found at index ${suchAsIndex}`);
                const after = text.substring(suchAsIndex, suchAsIndex + 15);
                console.log(`  Text after "such": "${after}"`);
            }
        }

        return originalDrawPreserveText(pdfPage, element, pageHeight);
    };

    console.log('\nExporting PDF with debug logging...\n');
    const pdfBytes = await exporter.exportToPDF(document);

    fs.writeFileSync('/tmp/debug-rendering.pdf', Buffer.from(pdfBytes));
    console.log('\n✅ Exported to /tmp/debug-rendering.pdf');

    console.log('\n═'.repeat(70));
}

debugPDFRendering().catch(console.error);
