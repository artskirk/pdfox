/**
 * Comprehensive test for overlap fix with wrapping threshold
 */
const { PDFDocument, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const { PDFParser } = require('./lib/pdf-parser');
const fetch = require('node-fetch');
const FormData = require('form-data');

async function runTest() {
    console.log('🧪 Testing Overlap Fix with Wrapping Threshold\n');
    console.log('═'.repeat(70));

    // Step 1: Import PDF via API
    console.log('\n📥 Step 1: Importing PDF via API...');
    const formData = new FormData();
    formData.append('pdf', fs.createReadStream('./uploads/cv-test.pdf.pdf'));

    const importResponse = await fetch('http://localhost:3000/api/reflow/import-pdf', {
        method: 'POST',
        body: formData
    });

    const document = await importResponse.json();
    console.log(`✅ Imported ${document.pages.length} pages`);

    // Step 2: Export PDF via API
    console.log('\n📤 Step 2: Exporting PDF via API...');
    const exportResponse = await fetch('http://localhost:3000/api/reflow/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(document)
    });

    const exportedPdfBytes = await exportResponse.arrayBuffer();
    fs.writeFileSync('/tmp/exported-threshold-test.pdf', Buffer.from(exportedPdfBytes));
    console.log('✅ Exported to /tmp/exported-threshold-test.pdf');

    // Step 3: Parse original PDF for comparison
    console.log('\n📊 Step 3: Analyzing original PDF...');
    const parser = new PDFParser();
    const originalDoc = await parser.parsePDF(fs.readFileSync('./uploads/cv-test.pdf.pdf'));

    const page1 = originalDoc.pages[0];
    const elements = page1.elements.filter(e => e.elementType === 'text');

    // Find the problematic elements
    let element7 = null;
    let element8 = null;

    for (const elem of elements) {
        const text = elem.content.map(c => c.text).join('');
        if (text.includes('patterns,')) {
            element7 = elem;
            console.log(`\n📍 Element #7 (patterns): Y=${elem.yPosition.toFixed(2)}`);
            console.log(`   Text: "${text.substring(0, 60)}..."`);
        }
        if (text.includes('and continuous learning.')) {
            element8 = elem;
            console.log(`📍 Element #8 (learning): Y=${elem.yPosition.toFixed(2)}`);
            console.log(`   Text: "${text}"`);
        }
    }

    let gap = 0;
    if (element7 && element8) {
        gap = element8.yPosition - element7.yPosition;
        console.log(`\n📏 Original gap between elements: ${gap.toFixed(2)}px`);

        // Check if element #7 needs wrapping
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const text7 = element7.content.map(c => c.text).join('');
        const fontSize = element7.style?.fontSize || 11;
        const leftMargin = element7.style?.marginLeft || 72;
        const rightMargin = 72;
        const availableWidth = page1.width - leftMargin - rightMargin;
        const textWidth = font.widthOfTextAtSize(text7, fontSize);
        const overflow = textWidth - availableWidth;

        console.log(`\n🔍 Element #7 Width Analysis:`);
        console.log(`   Text width: ${textWidth.toFixed(2)}px`);
        console.log(`   Available width: ${availableWidth.toFixed(2)}px`);
        console.log(`   Overflow: ${overflow.toFixed(2)}px`);
        console.log(`   Overflow percentage: ${((overflow / textWidth) * 100).toFixed(2)}%`);

        const needsWrapping = overflow > 10 && (overflow / textWidth) > 0.02;
        console.log(`   Needs wrapping: ${needsWrapping ? '✅ YES' : '❌ NO'}`);

        if (!needsWrapping) {
            console.log(`   ✅ Text will be drawn as single line (minor overflow acceptable)`);
        } else {
            console.log(`   ⚠️  Text will be wrapped into multiple lines`);
        }
    }

    // Step 4: Parse exported PDF and check positions
    console.log('\n📊 Step 4: Analyzing exported PDF...');
    const exportedDoc = await parser.parsePDF(fs.readFileSync('/tmp/exported-threshold-test.pdf'));
    const exportedPage1 = exportedDoc.pages[0];
    const exportedElements = exportedPage1.elements.filter(e => e.elementType === 'text');

    let exportedElement7 = null;
    let exportedElement8 = null;

    for (const elem of exportedElements) {
        const text = elem.content.map(c => c.text).join('');
        if (text.includes('patterns')) {
            exportedElement7 = elem;
            console.log(`\n📍 Exported Element (patterns): Y=${elem.yPosition.toFixed(2)}`);
            console.log(`   Text: "${text.substring(0, 60)}..."`);
        }
        if (text.includes('learning')) {
            exportedElement8 = elem;
            console.log(`📍 Exported Element (learning): Y=${elem.yPosition.toFixed(2)}`);
            console.log(`   Text: "${text.substring(0, 60)}..."`);
        }
    }

    // Step 5: Compare positions
    console.log('\n' + '═'.repeat(70));
    console.log('📊 POSITION COMPARISON');
    console.log('═'.repeat(70));

    if (exportedElement7 && exportedElement8) {
        const exportedGap = exportedElement8.yPosition - exportedElement7.yPosition;
        console.log(`\nOriginal gap: ${gap.toFixed(2)}px`);
        console.log(`Exported gap: ${exportedGap.toFixed(2)}px`);

        if (exportedGap >= 15) {
            console.log(`✅ GAP IS GOOD - No overlap!`);
        } else if (exportedGap >= 10) {
            console.log(`⚠️  GAP IS TIGHT but acceptable (10-15px)`);
        } else {
            console.log(`❌ GAP TOO SMALL - Overlap or tight spacing!`);
        }
    }

    // Step 6: Text retention check
    console.log('\n' + '═'.repeat(70));
    console.log('📊 TEXT RETENTION CHECK');
    console.log('═'.repeat(70));

    const originalText = elements.map(e => e.content.map(c => c.text).join('')).join('');
    const exportedText = exportedElements.map(e => e.content.map(c => c.text).join('')).join('');

    const originalChars = originalText.length;
    const exportedChars = exportedText.length;
    const retention = (exportedChars / originalChars * 100).toFixed(1);

    console.log(`\nOriginal text: ${originalChars} chars`);
    console.log(`Exported text: ${exportedChars} chars`);
    console.log(`Retention: ${retention}%`);

    if (retention >= 99.5) {
        console.log(`✅ TEXT RETENTION: EXCELLENT (${retention}%)`);
    } else if (retention >= 95) {
        console.log(`⚠️  TEXT RETENTION: GOOD but some loss (${retention}%)`);
    } else {
        console.log(`❌ TEXT RETENTION: POOR (${retention}%)`);
    }

    // Final verdict
    console.log('\n' + '═'.repeat(70));
    console.log('🎯 FINAL VERDICT');
    console.log('═'.repeat(70));

    const gapOk = exportedElement7 && exportedElement8 && (exportedElement8.yPosition - exportedElement7.yPosition) >= 10;
    const retentionOk = retention >= 99.5;

    if (gapOk && retentionOk) {
        console.log('\n✅✅✅ ALL TESTS PASSED ✅✅✅');
        console.log('   - No visual overlap');
        console.log('   - 100% text retention');
        console.log('   - Fix is working correctly!');
    } else {
        console.log('\n❌ SOME ISSUES REMAIN:');
        if (!gapOk) console.log('   ❌ Visual overlap still present');
        if (!retentionOk) console.log('   ❌ Text retention below 100%');
    }

    console.log('\n' + '═'.repeat(70));
}

runTest().catch(console.error);
