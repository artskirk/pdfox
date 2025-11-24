/**
 * Analyze if elements actually need wrapping
 */
const { PDFDocument, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const { PDFParser } = require('/home/akirkor/source/pdf-editor/lib/pdf-parser');

async function analyzeWidths() {
    const parser = new PDFParser();
    const doc = await parser.parsePDF(fs.readFileSync('/home/akirkor/source/pdf-editor/uploads/cv-test.pdf.pdf'));

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page1 = doc.pages[0];
    const elements = page1.elements.filter(e => e.elementType === 'text');

    console.log('📏 Analyzing Element Widths\n');
    console.log('═'.repeat(70));

    const pageWidth = page1.width;
    const rightMargin = 72;

    for (const elem of elements) {
        const text = elem.content.map(c => c.text).join('');
        if (text.includes('patterns') || text.includes('learning')) {
            const fontSize = elem.style?.fontSize || 11;
            const leftMargin = elem.style?.marginLeft || 72;
            const availableWidth = pageWidth - leftMargin - rightMargin;
            const textWidth = font.widthOfTextAtSize(text, fontSize);

            console.log(`\nElement: "${text.substring(0, 60)}..."`);
            console.log(`  Text width: ${textWidth.toFixed(2)}px`);
            console.log(`  Available width: ${availableWidth.toFixed(2)}px`);
            console.log(`  Fits on one line: ${textWidth <= availableWidth ? '✅ YES' : '❌ NO'}`);

            if (textWidth > availableWidth) {
                console.log(`  Overflow: ${(textWidth - availableWidth).toFixed(2)}px`);
                console.log(`  ⚠️  This element NEEDS wrapping!`);
            }
        }
    }

    console.log('\n' + '═'.repeat(70));
}

analyzeWidths().catch(console.error);
