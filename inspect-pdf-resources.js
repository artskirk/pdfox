/**
 * Inspect all resources in the PDF
 */
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

async function inspectResources() {
    console.log('🔍 INSPECTING PDF RESOURCES\n');
    console.log('═'.repeat(70));

    const pdfBuffer = fs.readFileSync('./uploads/test-with-image.pdf');
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    const pdfPage = pdfDoc.getPage(0);
    const pageNode = pdfPage.node;
    const resources = pageNode.Resources();

    console.log(`\nInspecting Resources object...`);
    console.log(`Type: ${resources.constructor.name}`);

    // Try to see what's in Resources
    console.log(`\nTrying to enumerate Resources dictionary...`);

    // Get all possible keys
    const possibleKeys = ['XObject', 'Font', 'ExtGState', 'ColorSpace', 'Pattern', 'Shading'];

    for (const key of possibleKeys) {
        const value = resources.lookup(key);
        console.log(`  ${key}: ${value ? '✅ Found' : '❌ Not found'}`);

        if (value && key === 'XObject') {
            console.log(`    Type: ${value.constructor.name}`);
            console.log(`    Has keys(): ${!!value.keys}`);
            console.log(`    Has entries(): ${!!value.entries}`);
            console.log(`    Has asMap(): ${!!value.asMap}`);

            // Try different access methods
            try {
                const str = value.toString();
                console.log(`    toString(): ${str.substring(0, 100)}`);
            } catch (err) {
                console.log(`    toString() error: ${err.message}`);
            }
        }
    }

    // Try to access the raw PDF structure
    console.log(`\n\nInspecting raw PDF structure...`);
    try {
        const context = pdfDoc.context;
        console.log(`Context exists: ${!!context}`);

        if (context) {
            // Get all indirect objects
            console.log(`\nEnumerating indirect objects...`);
            const indirectObjects = context.enumerateIndirectObjects();
            console.log(`Total indirect objects: ${indirectObjects.length}`);

            // Look for images
            let imageCount = 0;
            for (const [ref, obj] of indirectObjects) {
                if (obj && obj.lookup) {
                    const subtype = obj.lookup('Subtype');
                    if (subtype && subtype.toString() === '/Image') {
                        imageCount++;
                        console.log(`\n  Found image object:`);
                        console.log(`    Reference: ${ref.toString()}`);

                        const width = obj.lookup('Width');
                        const height = obj.lookup('Height');
                        const colorSpace = obj.lookup('ColorSpace');

                        console.log(`    Width: ${width?.toString()}`);
                        console.log(`    Height: ${height?.toString()}`);
                        console.log(`    ColorSpace: ${colorSpace?.toString()}`);

                        // Try to get the stream data
                        try {
                            if (obj.contents) {
                                const imageBytes = obj.contents();
                                console.log(`    Data size: ${imageBytes.length} bytes`);
                                const imageData = Buffer.from(imageBytes).toString('base64');
                                console.log(`    Base64 preview: ${imageData.substring(0, 50)}...`);
                            }
                        } catch (err) {
                            console.log(`    Error getting contents: ${err.message}`);
                        }
                    }
                }
            }

            console.log(`\n  Total images found: ${imageCount}`);
        }
    } catch (err) {
        console.log(`Error: ${err.message}`);
    }

    console.log('\n═'.repeat(70));
}

inspectResources().catch(console.error);
