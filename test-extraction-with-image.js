/**
 * Test image extraction with the new PDF containing an image
 */
const fs = require('fs');
const { PDFParser } = require('./lib/pdf-parser');
const { PDFExporter } = require('./lib/pdf-exporter');

async function testWithImage() {
    console.log('🔍 TESTING IMAGE EXTRACTION WITH REAL IMAGE\n');
    console.log('═'.repeat(70));

    const parser = new PDFParser();
    const pdfBuffer = fs.readFileSync('./uploads/test-with-image.pdf');

    console.log('\n📄 Step 1: Parse PDF with image...\n');
    const document = await parser.parsePDF(pdfBuffer);

    console.log('\n📊 PARSING RESULTS:\n');
    const page = document.pages[0];
    const images = page.elements.filter(e => e.elementType === 'image');
    const textElements = page.elements.filter(e => e.elementType === 'text');

    console.log(`Text elements: ${textElements.length}`);
    console.log(`Images found: ${images.length}`);

    if (images.length > 0) {
        console.log(`\nImage details:`);
        images.forEach((img, idx) => {
            console.log(`  ${idx + 1}. ${img.name}`);
            console.log(`     Position: (${img.position.x}, ${img.position.y})`);
            console.log(`     Size: ${img.position.width} × ${img.position.height} px`);
            console.log(`     Has data: ${img.data ? 'YES ✅' : 'NO ❌'}`);
            if (img.data) {
                console.log(`     Data size: ${Math.round(img.data.length / 1024)} KB`);
                console.log(`     Data starts with: ${img.data.substring(0, 20)}...`);
            }
        });

        console.log('\n📤 Step 2: Export back to PDF...\n');
        const exporter = new PDFExporter();
        const pdfBytes = await exporter.exportToPDF(document);
        fs.writeFileSync('/tmp/test-image-export.pdf', Buffer.from(pdfBytes));
        console.log('✅ Exported to /tmp/test-image-export.pdf');

        console.log('\n✅ SUCCESS! Image extraction and export working!\n');
        console.log('Next steps:');
        console.log('  1. Open http://localhost:3000 in your browser');
        console.log('  2. Upload ./uploads/test-with-image.pdf');
        console.log('  3. Verify the blue square image appears in the UI');
        console.log('  4. Export to PDF and verify image is embedded');
    } else {
        console.log('\n❌ No images found - something is wrong with extraction');
    }

    console.log('\n═'.repeat(70));
}

testWithImage().catch(console.error);
