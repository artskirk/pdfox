/**
 * Diagnose text loss issue
 */
const fs = require('fs');
const { PDFParser } = require('./lib/pdf-parser');
const { PDFExporter } = require('./lib/pdf-exporter');

async function diagnoseTextLoss() {
    console.log('🔍 DIAGNOSING TEXT LOSS ISSUE\n');
    console.log('═'.repeat(70));

    // Step 1: Import original PDF
    console.log('\n📥 Step 1: Importing original PDF...');
    const parser = new PDFParser();
    const originalBuffer = fs.readFileSync('./uploads/cv-test.pdf.pdf');
    const document = await parser.parsePDF(originalBuffer);

    // Count original text
    let originalTotal = 0;
    for (const page of document.pages) {
        const elements = page.elements.filter(e => e.elementType === 'text');
        for (const elem of elements) {
            const text = elem.content.map(c => c.text).join('');
            originalTotal += text.length;
        }
    }

    console.log(`✅ Original PDF imported`);
    console.log(`   Total characters: ${originalTotal}`);

    // Step 2: Export to PDF
    console.log('\n📤 Step 2: Exporting to PDF...');
    const exporter = new PDFExporter();
    const pdfBytes = await exporter.exportToPDF(document);
    fs.writeFileSync('/tmp/diagnose-export.pdf', Buffer.from(pdfBytes));
    console.log('✅ PDF exported');

    // Step 3: Parse exported PDF
    console.log('\n📥 Step 3: Re-importing exported PDF...');
    const exportedDoc = await parser.parsePDF(fs.readFileSync('/tmp/diagnose-export.pdf'));

    // Count exported text
    let exportedTotal = 0;
    for (const page of exportedDoc.pages) {
        const elements = page.elements.filter(e => e.elementType === 'text');
        for (const elem of elements) {
            const text = elem.content.map(c => c.text).join('');
            exportedTotal += text.length;
        }
    }

    console.log(`✅ Exported PDF re-imported`);
    console.log(`   Total characters: ${exportedTotal}`);

    // Step 4: Compare
    console.log('\n' + '═'.repeat(70));
    console.log('📊 TEXT RETENTION ANALYSIS\n');

    const retention = (exportedTotal / originalTotal * 100).toFixed(2);
    const loss = originalTotal - exportedTotal;

    console.log(`Original:  ${originalTotal} characters`);
    console.log(`Exported:  ${exportedTotal} characters`);
    console.log(`Retention: ${retention}%`);
    console.log(`Loss:      ${loss} characters (${((loss/originalTotal)*100).toFixed(2)}%)`);

    if (retention >= 99.5) {
        console.log('\n✅ TEXT RETENTION: EXCELLENT (>99.5%)');
        console.log('   Issue 1 is SOLVED in PDF export');
    } else if (retention >= 95) {
        console.log('\n⚠️  TEXT RETENTION: ACCEPTABLE (95-99%)');
        console.log('   Some minor text loss in PDF export');
    } else {
        console.log('\n❌ TEXT RETENTION: POOR (<95%)');
        console.log('   Significant text loss in PDF export');
    }

    // Step 5: Check per-page
    console.log('\n' + '═'.repeat(70));
    console.log('📄 PER-PAGE ANALYSIS\n');

    for (let i = 0; i < document.pages.length; i++) {
        const origPage = document.pages[i];
        const expPage = exportedDoc.pages[i];

        const origElements = origPage.elements.filter(e => e.elementType === 'text');
        const expElements = expPage.elements.filter(e => e.elementType === 'text');

        let origChars = 0;
        for (const elem of origElements) {
            const text = elem.content.map(c => c.text).join('');
            origChars += text.length;
        }

        let expChars = 0;
        for (const elem of expElements) {
            const text = elem.content.map(c => c.text).join('');
            expChars += text.length;
        }

        const pageRetention = (expChars / origChars * 100).toFixed(1);

        console.log(`Page ${i + 1}:`);
        console.log(`  Original:  ${origChars} chars (${origElements.length} elements)`);
        console.log(`  Exported:  ${expChars} chars (${expElements.length} elements)`);
        console.log(`  Retention: ${pageRetention}%`);

        if (pageRetention < 99.5) {
            console.log(`  ⚠️  TEXT LOSS DETECTED ON PAGE ${i + 1}`);
        } else {
            console.log(`  ✅ No significant text loss`);
        }
    }

    console.log('\n' + '═'.repeat(70));
    console.log('🔍 CONCLUSION\n');

    if (retention >= 99.5) {
        console.log('PDF Export: Text retention is EXCELLENT');
        console.log('The text loss you\'re seeing might be in the UI preview only.');
        console.log('\nUI Preview uses ellipsis (...) to prevent overlap.');
        console.log('But the exported PDF contains ALL text with smart wrapping.');
    } else {
        console.log('PDF Export: Text is being LOST during export');
        console.log('Need to investigate the export logic.');
    }

    console.log('═'.repeat(70));
}

diagnoseTextLoss().catch(console.error);
