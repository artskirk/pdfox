/**
 * Test script to analyze not-editable.pdf and see if text can be extracted
 */
const fs = require('fs');
const PDFExtract = require('pdf.js-extract').PDFExtract;

async function testNotEditablePDF() {
    console.log('🔍 ANALYZING not-editable.pdf\n');
    console.log('═'.repeat(70));

    const pdfExtract = new PDFExtract();
    const pdfBuffer = fs.readFileSync('./uploads/not-editable.pdf');

    try {
        const data = await pdfExtract.extractBuffer(pdfBuffer, {});

        console.log('\n📊 PDF STRUCTURE:\n');
        console.log(`Total pages: ${data.pages.length}`);

        if (data.pages.length > 0) {
            const firstPage = data.pages[0];
            console.log(`\nPage 1 dimensions: ${firstPage.pageInfo.width} × ${firstPage.pageInfo.height} pt`);
            console.log(`Total content items: ${firstPage.content.length}`);

            // Count text items
            const textItems = firstPage.content.filter(item => item.str && item.str.trim());
            console.log(`Text items: ${textItems.length}`);

            // Check for images
            const imageItems = firstPage.content.filter(item => item.type === 'image');
            console.log(`Image items: ${imageItems.length}`);

            console.log('\n📝 FIRST 20 TEXT ITEMS:\n');
            textItems.slice(0, 20).forEach((item, idx) => {
                console.log(`${idx + 1}. "${item.str}" at [${item.x.toFixed(1)}, ${item.y.toFixed(1)}]`);
                console.log(`   Font: ${item.fontName || 'unknown'}, Size: ${item.height.toFixed(1)}pt`);
            });

            // Check if text layer would be created
            console.log('\n🔍 TEXT LAYER COMPATIBILITY CHECK:\n');

            let compatibleItems = 0;
            let itemsWithNoFont = 0;
            let itemsWithNoPosition = 0;

            textItems.forEach(item => {
                if (!item.fontName) itemsWithNoFont++;
                if (item.x === undefined || item.y === undefined) itemsWithNoPosition++;
                if (item.str && item.str.trim() && item.fontName && item.x !== undefined && item.y !== undefined) {
                    compatibleItems++;
                }
            });

            console.log(`Compatible text items: ${compatibleItems}/${textItems.length}`);
            console.log(`Items without font name: ${itemsWithNoFont}`);
            console.log(`Items without position: ${itemsWithNoPosition}`);

            // Sample full text
            console.log('\n📄 SAMPLE TEXT CONTENT (first 500 chars):\n');
            const fullText = textItems.map(item => item.str).join(' ');
            console.log(fullText.substring(0, 500));

        } else {
            console.log('\n❌ No pages found in PDF');
        }

        console.log('\n═'.repeat(70));

    } catch (error) {
        console.error('\n❌ ERROR extracting PDF:', error.message);
        console.error(error.stack);
    }
}

testNotEditablePDF().catch(console.error);
