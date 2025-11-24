/**
 * Final diagnosis - Check if PDF has selectable text or is image-only
 */
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const PDFExtract = require('pdf.js-extract').PDFExtract;

async function finalDiagnosis() {
    console.log('🔍 FINAL DIAGNOSIS: not-editable.pdf\n');
    console.log('═'.repeat(70));

    // Test 1: PDF metadata
    const pdfBuffer = fs.readFileSync('./uploads/not-editable.pdf');
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    console.log('\n📄 PDF METADATA:');
    console.log(`  Pages: ${pdfDoc.getPageCount()}`);
    console.log(`  Producer: ${pdfDoc.getProducer() || 'unknown'}`);
    console.log(`  Creator: ${pdfDoc.getCreator() || 'unknown'}`);

    // Test 2: PDF.js-extract text extraction
    const pdfExtract = new PDFExtract();
    const data = await pdfExtract.extractBuffer(pdfBuffer, {});

    console.log('\n📊 TEXT EXTRACTION TEST:');
    console.log(`  Total pages: ${data.pages.length}`);

    let totalTextItems = 0;
    data.pages.forEach((page, idx) => {
        const textItems = page.content.filter(item => item.str && item.str.trim());
        totalTextItems += textItems.length;
        console.log(`  Page ${idx + 1}: ${textItems.length} text items`);
    });

    console.log(`  Total text items across all pages: ${totalTextItems}`);

    // Test 3: Check for images/XObjects
    const page = pdfDoc.getPage(0);
    const resources = page.node.Resources();

    let hasXObjects = false;
    if (resources) {
        const xobjects = resources.lookup('XObject');
        if (xobjects && xobjects.dict) {
            const keys = Array.from(xobjects.dict.keys());
            hasXObjects = keys.length > 0;
            console.log(`\n🖼️  IMAGES/XOBJECTS:`);
            console.log(`  XObject count on page 1: ${keys.length}`);
        }
    }

    // Final verdict
    console.log('\n═'.repeat(70));
    console.log('\n📋 DIAGNOSIS:\n');

    if (totalTextItems === 0 && hasXObjects) {
        console.log('❌ IMAGE-BASED PDF (Scanned Document)\n');
        console.log('This PDF contains images but NO extractable text.');
        console.log('The document appears to be a scanned image or has text');
        console.log('rendered as graphics rather than actual text objects.');
        console.log('\nWHY IT CANNOT BE EDITED:');
        console.log('  • PDF.js cannot extract text from images');
        console.log('  • No text layer exists for the editor to recognize');
        console.log('  • Text appears visually but is not selectable');
        console.log('\nPOSSIBLE SOLUTIONS:');
        console.log('  1. Run OCR (Optical Character Recognition) to add text layer');
        console.log('  2. Use a PDF tool to convert images to selectable text');
        console.log('  3. Re-create the document with actual text instead of images');
    } else if (totalTextItems === 0) {
        console.log('❌ NO TEXT CONTENT\n');
        console.log('This PDF has no extractable text content.');
        console.log('It may be blank, corrupted, or use an unsupported format.');
    } else {
        console.log('✅ TEXT-BASED PDF\n');
        console.log('This PDF has extractable text and should work with the editor.');
        console.log('If the UI is not showing text blocks, there may be a different issue.');
    }

    console.log('\n═'.repeat(70));
}

finalDiagnosis().catch(console.error);
