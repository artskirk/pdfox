/**
 * Inspect PDF structure using pdf-lib to see what's inside
 */
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

async function inspectPDFStructure() {
    console.log('🔍 INSPECTING PDF INTERNAL STRUCTURE\n');
    console.log('═'.repeat(70));

    const pdfBuffer = fs.readFileSync('./uploads/not-editable.pdf');
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    console.log(`\nTotal pages: ${pdfDoc.getPageCount()}`);
    console.log(`PDF Producer: ${pdfDoc.getProducer() || 'unknown'}`);
    console.log(`PDF Creator: ${pdfDoc.getCreator() || 'unknown'}`);

    const page = pdfDoc.getPage(0);
    const { width, height } = page.getSize();
    console.log(`\nPage 1 size: ${width} × ${height} pt`);

    // Check for embedded fonts
    const embeddedFonts = pdfDoc.context.enumerateIndirectObjects()
        .filter(([ref, obj]) => obj.dict && obj.dict.get('Type')?.toString() === '/Font');

    console.log(`\nEmbedded fonts: ${embeddedFonts.length}`);

    // Check for images/XObjects
    const xobjects = pdfDoc.context.enumerateIndirectObjects()
        .filter(([ref, obj]) => obj.dict && obj.dict.get('Type')?.toString() === '/XObject');

    console.log(`XObjects (images/forms): ${xobjects.length}`);

    // Get page resources
    const pageNode = page.node;
    const resources = pageNode.Resources();

    console.log('\n📋 PAGE RESOURCES:');
    if (resources) {
        const resourceDict = resources.dict || resources;
        const keys = resourceDict.keys ? Array.from(resourceDict.keys()).map(k => k.toString()) : [];
        console.log(`Resource keys: ${keys.join(', ')}`);

        // Check fonts in resources
        const fontDict = resources.lookup ? resources.lookup('Font') : resources.get?.('Font');
        if (fontDict) {
            console.log('✅ Fonts found in page resources');
            const fontKeys = fontDict.dict ? Array.from(fontDict.dict.keys()).map(k => k.toString()) : [];
            console.log(`Font keys: ${fontKeys.join(', ')}`);
        } else {
            console.log('❌ No fonts in page resources');
        }

        // Check XObjects in resources
        const xobjDict = resources.lookup ? resources.lookup('XObject') : resources.get?.('XObject');
        if (xobjDict) {
            console.log('✅ XObjects found in page resources');
            const xobjKeys = xobjDict.dict ? Array.from(xobjDict.dict.keys()).map(k => k.toString()) : [];
            console.log(`XObject keys: ${xobjKeys.join(', ')}`);
        }
    }

    // Try to get content stream
    const contentStream = pageNode.Contents();
    console.log('\n📄 CONTENT STREAM:');

    if (!contentStream) {
        console.log('❌ No content stream found');
    } else {
        const streamArray = Array.isArray(contentStream) ? contentStream : [contentStream];
        console.log(`Number of content streams: ${streamArray.length}`);

        for (let i = 0; i < Math.min(streamArray.length, 2); i++) {
            const stream = streamArray[i];
            console.log(`\nStream ${i + 1}:`);

            let content = null;
            try {
                if (typeof stream.getContents === 'function') {
                    content = Buffer.from(stream.getContents()).toString('latin1');
                } else if (stream.contents) {
                    content = Buffer.from(stream.contents).toString('latin1');
                }

                if (content) {
                    console.log(`Stream length: ${content.length} bytes`);

                    // Count text operators
                    const textOperators = {
                        'Tj': (content.match(/Tj\b/g) || []).length,      // Show text
                        'TJ': (content.match(/TJ\b/g) || []).length,      // Show text with positioning
                        'Td': (content.match(/Td\b/g) || []).length,      // Text position
                        'BT': (content.match(/BT\b/g) || []).length,      // Begin text
                        'ET': (content.match(/ET\b/g) || []).length,      // End text
                        'Do': (content.match(/\sDo\b/g) || []).length,    // Draw XObject (images)
                    };

                    console.log('Text operators found:');
                    Object.entries(textOperators).forEach(([op, count]) => {
                        console.log(`  ${op}: ${count}`);
                    });

                    const hasText = textOperators.Tj > 0 || textOperators.TJ > 0;
                    const hasImages = textOperators.Do > 0;

                    console.log(`\nHas text: ${hasText ? '✅ YES' : '❌ NO'}`);
                    console.log(`Has images: ${hasImages ? '✅ YES' : '❌ NO'}`);

                    if (!hasText && hasImages) {
                        console.log('\n⚠️  This appears to be an IMAGE-BASED PDF (scanned document)');
                        console.log('   No text operators found, only image rendering (Do operator)');
                    }

                    // Show first 500 chars of content
                    console.log('\nFirst 500 chars of content stream:');
                    console.log(content.substring(0, 500));
                }
            } catch (error) {
                console.log(`Error reading stream: ${error.message}`);
            }
        }
    }

    console.log('\n═'.repeat(70));
}

inspectPDFStructure().catch(console.error);
