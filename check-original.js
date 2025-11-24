/**
 * Check original PDF structure for the long URL text
 */
const fs = require('fs');
const PDFExtract = require('pdf.js-extract').PDFExtract;

async function checkOriginal() {
    console.log('🔍 CHECKING ORIGINAL PDF\n');

    const pdfExtract = new PDFExtract();
    const originalBuffer = fs.readFileSync('./uploads/test-invoice-with-images.pdf');
    const originalData = await pdfExtract.extractBuffer(originalBuffer, {});

    console.log(`Pages: ${originalData.pages.length}\n`);

    // Check page 2 for the long URL text
    const page2 = originalData.pages[1];
    console.log(`Page 2 - ${page2.content.length} items:\n`);

    // Find items containing "Google Cloud Platform" or "billing"
    page2.content.forEach((item, idx) => {
        if (item.str && (
            item.str.toLowerCase().includes('google cloud platform') ||
            item.str.toLowerCase().includes('billing') ||
            item.str.toLowerCase().includes('console')
        )) {
            console.log(`  ${idx + 1}. [y=${item.y.toFixed(1)}, x=${item.x.toFixed(1)}] "${item.str}"`);
        }
    });
}

checkOriginal().catch(console.error);
