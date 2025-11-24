/**
 * Extract content from PDFArray of streams
 */
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

async function extractArrayStreams() {
    console.log('🔍 EXTRACTING STREAMS FROM ARRAY\n');

    try {
        const pdfBuffer = fs.readFileSync('./uploads/not-editable.pdf');
        const pdfDoc = await PDFDocument.load(pdfBuffer);

        const page = pdfDoc.getPage(0);
        const pageNode = page.node;
        const contentStream = pageNode.Contents();

        console.log('Content stream type:', contentStream.constructor.name);

        if (contentStream.constructor.name === 'PDFArray') {
            console.log('Array length:', contentStream.array.length);
            console.log('');

            // Iterate through array elements
            for (let i = 0; i < contentStream.array.length; i++) {
                const element = contentStream.array[i];
                console.log(`\nElement ${i}:`);
                console.log('  Type:', element.constructor.name);
                console.log('  Keys:', Object.keys(element));

                // If it's a reference, look it up
                if (element.constructor.name === 'PDFRef') {
                    console.log('  Ref number:', element.objectNumber);
                    const obj = pdfDoc.context.lookup(element);
                    console.log('  Resolved type:', obj.constructor.name);
                    console.log('  Resolved keys:', Object.keys(obj));

                    // Try to get content from the resolved object
                    if (typeof obj.getContents === 'function') {
                        try {
                            const bytes = obj.getContents();
                            const content = Buffer.from(bytes).toString('latin1');
                            console.log(`  Content length: ${content.length} bytes`);
                            console.log('\n  Content:\n');
                            console.log(content);
                            console.log('\n' + '='.repeat(70));
                        } catch (e) {
                            console.log('  Error getting contents:', e.message);
                        }
                    }
                }
            }
        } else {
            console.log('Not a PDFArray');
        }

    } catch (error) {
        console.error('ERROR:', error.message);
        console.error(error.stack);
    }
}

extractArrayStreams();
