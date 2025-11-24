/**
 * Debug the image extraction process step by step
 */
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

async function debugExtraction() {
    console.log('🔍 DEBUGGING IMAGE EXTRACTION PROCESS\n');
    console.log('═'.repeat(70));

    const pdfBuffer = fs.readFileSync('./uploads/test-with-image.pdf');
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    console.log(`\nPDF loaded successfully`);
    console.log(`Total pages: ${pdfDoc.getPageCount()}`);

    const pdfPage = pdfDoc.getPage(0);
    console.log(`\nPage 0 dimensions: ${pdfPage.getWidth()} × ${pdfPage.getHeight()}`);

    // Get page node
    const pageNode = pdfPage.node;
    console.log(`\nPage node exists: ${!!pageNode}`);

    // Get resources
    const resources = pageNode.Resources();
    console.log(`Resources exist: ${!!resources}`);
    console.log(`Resources has lookup: ${!!resources?.lookup}`);

    if (resources && resources.lookup) {
        // Get XObject dictionary
        const xObjects = resources.lookup('XObject');
        console.log(`\nXObjects dictionary: ${!!xObjects}`);

        if (xObjects) {
            console.log(`XObjects has keys method: ${!!xObjects.keys}`);

            if (xObjects.keys) {
                const xObjectKeys = xObjects.keys();
                console.log(`Number of XObject keys: ${xObjectKeys.length}`);

                for (const key of xObjectKeys) {
                    console.log(`\n  Key: ${key.toString()}`);

                    const xObject = xObjects.lookup(key);
                    console.log(`    XObject exists: ${!!xObject}`);

                    if (xObject) {
                        const subtype = xObject.lookup('Subtype');
                        console.log(`    Subtype: ${subtype?.toString()}`);

                        if (subtype && subtype.toString() === '/Image') {
                            const width = xObject.lookup('Width');
                            const height = xObject.lookup('Height');
                            const colorSpace = xObject.lookup('ColorSpace');

                            console.log(`    ✅ This is an image!`);
                            console.log(`    Width: ${width?.numberValue || width?.toString()}`);
                            console.log(`    Height: ${height?.numberValue || height?.toString()}`);
                            console.log(`    ColorSpace: ${colorSpace?.toString()}`);

                            // Try to get contents
                            try {
                                const imageBytes = xObject.contents();
                                console.log(`    Image data size: ${imageBytes ? imageBytes.length : 0} bytes`);
                            } catch (err) {
                                console.log(`    ❌ Error getting contents: ${err.message}`);
                            }
                        }
                    }
                }
            } else {
                console.log(`\n❌ XObjects.keys() not available`);
                console.log(`XObjects type: ${typeof xObjects}`);
                console.log(`XObjects constructor: ${xObjects.constructor.name}`);

                // Try alternative approach
                console.log(`\nTrying alternative approach...`);
                try {
                    const dict = xObjects.dict;
                    console.log(`  Has dict property: ${!!dict}`);
                    if (dict) {
                        console.log(`  Dict keys: ${Object.keys(dict)}`);
                    }
                } catch (err) {
                    console.log(`  Error: ${err.message}`);
                }
            }
        } else {
            console.log(`\n❌ No XObjects dictionary found`);
        }
    } else {
        console.log(`\n❌ No resources or lookup method`);
    }

    console.log('\n═'.repeat(70));
}

debugExtraction().catch(console.error);
