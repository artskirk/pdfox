/**
 * ACTUAL UI TEST - Import PDF via API and check what gets rendered
 */
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const { PDFParser } = require('./lib/pdf-parser');
const { PDFExporter } = require('./lib/pdf-exporter');

async function actualUITest() {
    console.log('🔍 ACTUAL UI TEST - Verifying Both Issues\n');
    console.log('═'.repeat(70));

    // Step 1: Import via API (simulating UI)
    console.log('\n📥 Step 1: Importing PDF via API (like UI does)...');
    const formData = new FormData();
    formData.append('pdf', fs.createReadStream('./uploads/cv-test.pdf.pdf'));

    const importResponse = await fetch('http://localhost:3000/api/reflow/import-pdf', {
        method: 'POST',
        body: formData
    });

    const document = await importResponse.json();
    console.log(`✅ Imported ${document.pages.length} pages`);

    // Step 2: Check what UI will render
    console.log('\n📊 Step 2: Analyzing what UI will display...');
    const page1 = document.pages[0];
    const elements = page1.elements.filter(e => e.elementType === 'text');

    console.log(`\nPage 1 has ${elements.length} text elements`);

    // Check critical elements
    let totalChars = 0;
    for (const elem of elements) {
        const text = elem.content.map(c => c.text).join('');
        totalChars += text.length;
    }

    console.log(`Total characters in Page 1: ${totalChars}`);

    // Step 3: Export PDF and check retention
    console.log('\n📤 Step 3: Exporting PDF...');
    const exportResponse = await fetch('http://localhost:3000/api/reflow/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(document)
    });

    const pdfBytes = await exportResponse.arrayBuffer();
    fs.writeFileSync('/tmp/actual-test.pdf', Buffer.from(pdfBytes));
    console.log('✅ Exported to /tmp/actual-test.pdf');

    // Step 4: Parse exported PDF
    console.log('\n📊 Step 4: Checking exported PDF...');
    const parser = new PDFParser();
    const exportedDoc = await parser.parsePDF(fs.readFileSync('/tmp/actual-test.pdf'));
    const exportedPage1 = exportedDoc.pages[0];
    const exportedElements = exportedPage1.elements.filter(e => e.elementType === 'text');

    let exportedChars = 0;
    for (const elem of exportedElements) {
        const text = elem.content.map(c => c.text).join('');
        exportedChars += text.length;
    }

    console.log(`Total characters in exported Page 1: ${exportedChars}`);

    // Step 5: Check for overlap
    console.log('\n📊 Step 5: Checking for visual overlap...');
    let overlapFound = false;

    for (const elem of exportedElements) {
        const text = elem.content.map(c => c.text).join('');
        if (text.includes('patterns')) {
            console.log(`\nFound "patterns" element at Y=${elem.yPosition?.toFixed(2)}`);
        }
        if (text.includes('learning')) {
            console.log(`Found "learning" element at Y=${elem.yPosition?.toFixed(2)}`);
        }
    }

    // Find the two critical elements
    let patternsY = null;
    let learningY = null;

    for (const elem of exportedElements) {
        const text = elem.content.map(c => c.text).join('');
        if (text.includes('patterns') && !learningY) {
            patternsY = elem.yPosition;
        }
        if (text.includes('learning') && patternsY) {
            learningY = elem.yPosition;
            break;
        }
    }

    if (patternsY && learningY) {
        const gap = learningY - patternsY;
        console.log(`\nGap between "patterns" and "learning": ${gap.toFixed(2)}px`);
        if (gap < 10) {
            console.log(`❌ OVERLAP DETECTED! Gap is too small (${gap.toFixed(2)}px)`);
            overlapFound = true;
        } else {
            console.log(`✅ No overlap - gap is good (${gap.toFixed(2)}px)`);
        }
    }

    // Step 6: VERDICT
    console.log('\n' + '═'.repeat(70));
    console.log('🎯 FINAL VERDICT\n');

    const retention = (exportedChars / totalChars * 100).toFixed(2);
    const issue1Solved = exportedChars >= totalChars * 0.99;
    const issue2Solved = !overlapFound;

    console.log(`Issue #1 (Text Retention):`);
    console.log(`  Original: ${totalChars} chars`);
    console.log(`  Exported: ${exportedChars} chars`);
    console.log(`  Retention: ${retention}%`);
    console.log(`  Status: ${issue1Solved ? '✅ SOLVED' : '❌ NOT SOLVED'}`);

    console.log(`\nIssue #2 (Visual Overlap):`);
    console.log(`  Overlap detected: ${overlapFound ? 'YES' : 'NO'}`);
    console.log(`  Status: ${issue2Solved ? '✅ SOLVED' : '❌ NOT SOLVED'}`);

    console.log('\n' + '═'.repeat(70));

    if (issue1Solved && issue2Solved) {
        console.log('✅✅✅ BOTH ISSUES CONFIRMED SOLVED ✅✅✅');
    } else {
        console.log('❌ ONE OR MORE ISSUES REMAIN:');
        if (!issue1Solved) console.log('   ❌ Text retention still has issues');
        if (!issue2Solved) console.log('   ❌ Visual overlap still present');
    }

    console.log('═'.repeat(70));
}

actualUITest().catch(console.error);
