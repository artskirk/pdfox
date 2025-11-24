/**
 * Test image extraction from PDF
 */
const fs = require('fs');
const { PDFParser } = require('./lib/pdf-parser');

async function testImageExtraction() {
    console.log('🔍 TESTING IMAGE EXTRACTION\n');
    console.log('═'.repeat(70));

    const parser = new PDFParser();
    const pdfBuffer = fs.readFileSync('./uploads/cv-test.pdf.pdf');

    console.log('\n📄 Parsing PDF...\n');
    const document = await parser.parsePDF(pdfBuffer);

    console.log('\n📊 RESULTS:\n');
    console.log(`Total pages: ${document.pages.length}`);

    for (let i = 0; i < document.pages.length; i++) {
        const page = document.pages[i];
        const images = page.elements.filter(e => e.elementType === 'image');
        const textElements = page.elements.filter(e => e.elementType === 'text');

        console.log(`\nPage ${i + 1}:`);
        console.log(`  Text elements: ${textElements.length}`);
        console.log(`  Images: ${images.length}`);

        if (images.length > 0) {
            console.log(`\n  Image details:`);
            images.forEach((img, idx) => {
                console.log(`    ${idx + 1}. ${img.name}`);
                console.log(`       Position: (${img.position.x}, ${img.position.y})`);
                console.log(`       Size: ${img.position.width} × ${img.position.height} px`);
                console.log(`       Has data: ${img.data ? 'YES ✅' : 'NO ❌'}`);
                if (img.data) {
                    console.log(`       Data size: ${Math.round(img.data.length / 1024)} KB`);
                }
            });
        }
    }

    console.log('\n═'.repeat(70));

    // If no images found, suggest next steps
    const totalImages = document.pages.reduce((sum, page) =>
        sum + page.elements.filter(e => e.elementType === 'image').length, 0);

    if (totalImages === 0) {
        console.log('\n⚠️  No images found in this PDF.');
        console.log('   This could mean:');
        console.log('   1. The PDF truly has no images');
        console.log('   2. Images are embedded in a format we don\'t detect');
        console.log('   3. We need a different test PDF with images\n');
    } else {
        console.log(`\n✅ Successfully extracted ${totalImages} image(s)!\n`);
    }
}

testImageExtraction().catch(console.error);
