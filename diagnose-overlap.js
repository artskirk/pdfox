/**
 * Diagnose the overlap issue by simulating the export process
 */
const { PDFDocument, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const { PDFParser } = require('/home/akirkor/source/pdf-editor/lib/pdf-parser');

async function diagnoseOverlap() {
    const parser = new PDFParser();

    console.log('🔍 Diagnosing Text Overlap Issue\n');
    console.log('═'.repeat(70));

    const pdfBuffer = fs.readFileSync('/home/akirkor/source/pdf-editor/uploads/cv-test.pdf.pdf');
    const doc = await parser.parsePDF(pdfBuffer);

    const page1 = doc.pages[0];
    const elements = page1.elements.filter(e => e.elementType === 'text');

    // Find the problematic elements
    let elem7, elem8;
    for (let i = 0; i < elements.length; i++) {
        const text = elements[i].content.map(c => c.text).join('');
        if (text.includes('fast-paced') && text.includes('patterns')) {
            elem7 = elements[i];
            console.log(`\n📝 Element #${i+1} (the "patterns" element):`);
            console.log(`   Text: "${text}"`);
            console.log(`   Y Position: ${elem7.yPosition}`);
            console.log(`   Font Size: ${elem7.style.fontSize}`);
            console.log(`   Line Height: ${elem7.style.lineHeight}`);
        }
        if (text.includes('continuous learning')) {
            elem8 = elements[i];
            console.log(`\n📝 Element #${i+1} (the "learning" element):`);
            console.log(`   Text: "${text}"`);
            console.log(`   Y Position: ${elem8.yPosition}`);
        }
    }

    if (!elem7 || !elem8) {
        console.log('Could not find the problematic elements!');
        return;
    }

    console.log('\n' + '═'.repeat(70));
    console.log('\n🔬 Simulating Export Process:\n');

    // Simulate wrapping
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const text7 = elem7.content.map(c => c.text).join('');
    const fontSize = elem7.style.fontSize;
    const lineHeight = elem7.style.lineHeight;
    const pageWidth = page1.width;
    const leftMargin = elem7.style.marginLeft || 72;
    const rightMargin = 72;
    const maxWidth = pageWidth - leftMargin - rightMargin;

    console.log(`Text to wrap: "${text7}"`);
    console.log(`Max width: ${maxWidth}px`);
    console.log(`Font size: ${fontSize}px`);
    console.log(`Line height: ${lineHeight}`);

    // Wrap text (simplified version of wrapText function)
    const words = text7.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const textWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (textWidth <= maxWidth) {
            currentLine = testLine;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);

    console.log(`\nWrapped into ${lines.length} lines:`);
    lines.forEach((line, i) => {
        console.log(`  Line ${i + 1}: "${line}"`);
    });

    // Calculate Y positions
    const pageHeight = page1.height;
    let yFromBottom = pageHeight - elem7.yPosition - fontSize;

    console.log(`\nY Position calculations:`);
    console.log(`  Page height: ${pageHeight}`);
    console.log(`  Element Y (from top): ${elem7.yPosition}`);
    console.log(`  Starting Y (from bottom): ${yFromBottom.toFixed(2)}`);

    for (let i = 0; i < lines.length; i++) {
        const yFromTop = pageHeight - yFromBottom;
        console.log(`  Line ${i + 1} Y (from bottom): ${yFromBottom.toFixed(2)} → Y (from top): ${yFromTop.toFixed(2)}`);
        yFromBottom -= fontSize * lineHeight;
    }

    // Calculate where last line ends up
    const lastLineY = yFromBottom + (fontSize * lineHeight); // Add back the last subtraction
    const lastLineYFromTop = pageHeight - lastLineY;

    console.log(`\n⚠️  Issue Analysis:`);
    console.log(`  Last wrapped line Y (from top): ${lastLineYFromTop.toFixed(2)}`);
    console.log(`  Next element Y (from top): ${elem8.yPosition.toFixed(2)}`);
    console.log(`  Gap between them: ${(elem8.yPosition - lastLineYFromTop).toFixed(2)}px`);
    console.log(`  Expected line spacing: ${(fontSize * lineHeight).toFixed(2)}px`);

    if (elem8.yPosition - lastLineYFromTop < fontSize) {
        console.log(`\n❌ OVERLAP DETECTED!`);
        console.log(`   The last line of element #7 is only ${(elem8.yPosition - lastLineYFromTop).toFixed(2)}px above element #8!`);
        console.log(`   This is less than the font size (${fontSize}px), causing visual overlap.`);
    } else {
        console.log(`\n✅ No overlap expected.`);
    }

    console.log('\n' + '═'.repeat(70));
}

diagnoseOverlap().catch(console.error);
