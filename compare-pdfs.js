/**
 * Compare original vs output PDF text content
 */
const fs = require('fs');
const PDFExtract = require('pdf.js-extract').PDFExtract;

async function comparePDFs() {
    console.log('🔍 COMPARING ORIGINAL VS OUTPUT PDF\n');
    console.log('═'.repeat(70));

    const pdfExtract = new PDFExtract();

    // Extract from original
    console.log('\n📄 Original PDF (test-invoice-with-images.pdf):\n');
    const originalBuffer = fs.readFileSync('./uploads/test-invoice-with-images.pdf');
    const originalData = await pdfExtract.extractBuffer(originalBuffer, {});

    for (let i = 0; i < originalData.pages.length; i++) {
        const page = originalData.pages[i];
        console.log(`\nPage ${i + 1}:`);
        console.log(`  Text items: ${page.content.length}`);
        console.log(`  Page size: ${page.pageInfo.width} × ${page.pageInfo.height}`);

        // Show sample text
        const texts = page.content.slice(0, 10).map(item => item.str.trim()).filter(t => t);
        console.log(`  First 10 text items:`);
        texts.forEach((text, idx) => {
            console.log(`    ${idx + 1}. "${text}"`);
        });
    }

    // Extract from output
    console.log('\n\n📄 Output PDF (test-invoice-with-images-output.pdf):\n');
    const outputBuffer = fs.readFileSync('./outputs/test-invoice-with-images-output.pdf');
    const outputData = await pdfExtract.extractBuffer(outputBuffer, {});

    for (let i = 0; i < outputData.pages.length; i++) {
        const page = outputData.pages[i];
        console.log(`\nPage ${i + 1}:`);
        console.log(`  Text items: ${page.content.length}`);
        console.log(`  Page size: ${page.pageInfo.width} × ${page.pageInfo.height}`);

        // Show sample text
        const texts = page.content.slice(0, 10).map(item => item.str.trim()).filter(t => t);
        console.log(`  First 10 text items:`);
        texts.forEach((text, idx) => {
            console.log(`    ${idx + 1}. "${text}"`);
        });
    }

    // Compare text content
    const originalTexts = originalData.pages.flatMap(p => p.content.map(c => c.str.trim())).filter(t => t);
    const outputTexts = outputData.pages.flatMap(p => p.content.map(c => c.str.trim())).filter(t => t);

    console.log('\n\n📊 Comparison:');
    console.log(`  Original text items: ${originalTexts.length}`);
    console.log(`  Output text items: ${outputTexts.length}`);
    console.log(`  Missing items: ${originalTexts.length - outputTexts.length}`);
    console.log(`  Retention rate: ${((outputTexts.length / originalTexts.length) * 100).toFixed(1)}%`);

    // Find missing text
    const outputTextSet = new Set(outputTexts);
    const missingTexts = originalTexts.filter(t => !outputTextSet.has(t));

    if (missingTexts.length > 0) {
        console.log(`\n  ❌ Missing text samples (first 20):`);
        missingTexts.slice(0, 20).forEach((text, idx) => {
            console.log(`    ${idx + 1}. "${text}"`);
        });
    }

    console.log('\n═'.repeat(70));
}

comparePDFs().catch(console.error);
