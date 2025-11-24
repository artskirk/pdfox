/**
 * Analyze the Google invoice PDF in detail
 */
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const { PDFParser } = require('./lib/pdf-parser');

async function analyzeInvoice() {
    console.log('🔍 ANALYZING GOOGLE INVOICE PDF\n');
    console.log('═'.repeat(70));

    const pdfBuffer = fs.readFileSync('./uploads/test-invoice-with-images.pdf');
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    console.log(`\n📊 PDF Structure:`);
    console.log(`Total pages: ${pdfDoc.getPageCount()}`);
    console.log(`File size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
        const page = pdfDoc.getPage(i);
        const { width, height } = page.getSize();

        console.log(`\n📄 Page ${i + 1}:`);
        console.log(`  Dimensions: ${width} × ${height}`);

        // Check for images
        const pageNode = page.node;
        const resources = pageNode.Resources();

        if (resources) {
            // Check all resource types
            const resourceTypes = ['XObject', 'Font', 'ExtGState', 'ColorSpace'];
            for (const type of resourceTypes) {
                const resource = resources.lookup(type);
                if (resource) {
                    console.log(`  ✅ Has ${type}`);

                    if (type === 'XObject' && resource.entries) {
                        const entries = resource.entries();
                        console.log(`     ${entries.length} XObject(s) found`);

                        for (const [key, obj] of entries) {
                            const subtype = obj.lookup('Subtype');
                            console.log(`       - ${key.toString()}: ${subtype?.toString()}`);
                        }
                    }
                }
            }
        }

        // Try alternative image detection - enumerate all objects
        const context = pdfDoc.context;
        const indirectObjects = context.enumerateIndirectObjects();

        let imageCount = 0;
        let formCount = 0;

        for (const [ref, obj] of indirectObjects) {
            if (obj && obj.lookup) {
                const subtype = obj.lookup('Subtype');
                const type = obj.lookup('Type');

                if (subtype && subtype.toString() === '/Image') {
                    imageCount++;
                } else if (subtype && subtype.toString() === '/Form') {
                    formCount++;
                } else if (type && type.toString() === '/XObject') {
                    console.log(`     XObject found: Type=${type}, Subtype=${subtype}`);
                }
            }
        }

        console.log(`  Total Image XObjects in PDF: ${imageCount}`);
        console.log(`  Total Form XObjects in PDF: ${formCount}`);
    }

    // Now parse with our parser
    console.log(`\n\n🔧 Parsing with PDFParser:\n`);
    const parser = new PDFParser();
    const document = await parser.parsePDF(pdfBuffer);

    for (let i = 0; i < document.pages.length; i++) {
        const page = document.pages[i];
        const textElements = page.elements.filter(e => e.elementType === 'text');
        const images = page.elements.filter(e => e.elementType === 'image');

        console.log(`Page ${i + 1}:`);
        console.log(`  Text elements: ${textElements.length}`);
        console.log(`  Images extracted: ${images.length}`);
        console.log(`  Total elements: ${page.elements.length}`);
    }

    console.log('\n═'.repeat(70));
}

analyzeInvoice().catch(console.error);
