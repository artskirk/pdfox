/**
 * Debug the export process to find where text is being fragmented
 */
const fs = require('fs');
const PDFExtract = require('pdf.js-extract').PDFExtract;

async function debugExport() {
    console.log('🔍 DEBUGGING EXPORTED PDF\n');

    const pdfExtract = new PDFExtract();
    const exportedBuffer = fs.readFileSync('./outputs/simple-test-output.pdf');
    const exportedData = await pdfExtract.extractBuffer(exportedBuffer, {});

    console.log(`Pages: ${exportedData.pages.length}\n`);

    for (let i = 0; i < exportedData.pages.length; i++) {
        const page = exportedData.pages[i];
        console.log(`Page ${i + 1} - ${page.content.length} items:\n`);

        // Show all items
        page.content.forEach((item, idx) => {
            if (item.str && item.str.trim()) {
                console.log(`  ${idx + 1}. [y=${item.y.toFixed(1)}, x=${item.x.toFixed(1)}] "${item.str}"`);
            }
        });
    }
}

debugExport().catch(console.error);
