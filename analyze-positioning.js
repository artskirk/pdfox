/**
 * Analyze positioning differences in detail
 */
const fs = require('fs');
const PDFExtract = require('pdf.js-extract').PDFExtract;

async function analyzePositioning() {
    console.log('🔍 DETAILED POSITIONING ANALYSIS\n');
    console.log('═'.repeat(70));

    const pdfExtract = new PDFExtract();

    const originalBuffer = fs.readFileSync('./uploads/test-invoice-with-images.pdf');
    const exportedBuffer = fs.readFileSync('./outputs/final-test-output.pdf');

    const originalData = await pdfExtract.extractBuffer(originalBuffer, {});
    const exportedData = await pdfExtract.extractBuffer(exportedBuffer, {});

    // Analyze page 1 in detail
    const origPage = originalData.pages[0];
    const expPage = exportedData.pages[0];

    console.log('\nPAGE 1 POSITIONING ANALYSIS:\n');

    // Build position maps
    const origMap = new Map();
    origPage.content.forEach(item => {
        if (item.str && item.str.trim()) {
            const key = item.str.trim();
            origMap.set(key, { x: item.x.toFixed(1), y: item.y.toFixed(1) });
        }
    });

    const expMap = new Map();
    expPage.content.forEach(item => {
        if (item.str && item.str.trim()) {
            const key = item.str.trim();
            expMap.set(key, { x: item.x.toFixed(1), y: item.y.toFixed(1) });
        }
    });

    // Show sample comparisons
    const samples = [
        'Invoice',
        'Google Cloud EMEA Limited',
        'Velasco',
        'Dublin 2',
        'Invoice number: 5407505416',
        'Total in EUR',
        '€0.01'
    ];

    console.log('Sample text positioning comparisons:\n');
    samples.forEach(text => {
        const orig = origMap.get(text);
        const exp = expMap.get(text);

        if (orig && exp) {
            const xDiff = Math.abs(parseFloat(orig.x) - parseFloat(exp.x));
            const yDiff = Math.abs(parseFloat(orig.y) - parseFloat(exp.y));

            console.log(`"${text}":`);
            console.log(`  Original: x=${orig.x}, y=${orig.y}`);
            console.log(`  Exported: x=${exp.x}, y=${exp.y}`);
            console.log(`  Δx=${xDiff.toFixed(1)}pt, Δy=${yDiff.toFixed(1)}pt`);
            console.log();
        } else if (orig && !exp) {
            console.log(`"${text}": ⚠️  Only in original`);
            console.log();
        } else if (!orig && exp) {
            console.log(`"${text}": ⚠️  Only in export`);
            console.log();
        }
    });

    // Check if text grouping is causing position changes
    console.log('═'.repeat(70));
    console.log('\nTEXT GROUPING ANALYSIS:\n');

    console.log('Original items on page 1:', origPage.content.filter(i => i.str && i.str.trim()).length);
    console.log('Exported items on page 1:', expPage.content.filter(i => i.str && i.str.trim()).length);

    // Show first few items from each
    console.log('\nFirst 10 text items - ORIGINAL:');
    origPage.content
        .filter(i => i.str && i.str.trim())
        .slice(0, 10)
        .forEach((item, idx) => {
            console.log(`  ${idx + 1}. [${item.x.toFixed(1)}, ${item.y.toFixed(1)}] "${item.str.trim()}"`);
        });

    console.log('\nFirst 10 text items - EXPORTED:');
    expPage.content
        .filter(i => i.str && i.str.trim())
        .slice(0, 10)
        .forEach((item, idx) => {
            console.log(`  ${idx + 1}. [${item.x.toFixed(1)}, ${item.y.toFixed(1)}] "${item.str.trim()}"`);
        });

    console.log('\n═'.repeat(70));
}

analyzePositioning().catch(console.error);
