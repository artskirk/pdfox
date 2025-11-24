/**
 * Inspect PDF content stream to understand what graphics operators are present
 */
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

async function inspectContentStream() {
    console.log('🔍 INSPECTING PDF CONTENT STREAM\n');

    const pdfBuffer = fs.readFileSync('./uploads/test-invoice-with-images.pdf');
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    const page = pdfDoc.getPage(0);
    const pageNode = page.node;
    const contentStream = pageNode.Contents();

    if (!contentStream) {
        console.log('No content stream found');
        return;
    }

    const streamArray = Array.isArray(contentStream) ? contentStream : [contentStream];

    for (let i = 0; i < streamArray.length; i++) {
        const stream = streamArray[i];
        console.log(`Stream ${i + 1}:`);

        let streamBytes = null;
        if (typeof stream.contents === 'function') {
            streamBytes = stream.contents();
        } else if (stream.contents) {
            streamBytes = stream.contents;
        } else if (typeof stream.getContents === 'function') {
            streamBytes = stream.getContents();
        }

        if (!streamBytes) {
            console.log('  Could not get stream bytes\n');
            continue;
        }

        console.log('  Stream object properties:', Object.keys(stream));

        // Check if stream is compressed
        const filter = stream.dict?.get ? stream.dict.get('Filter') : null;
        console.log('  Filter:', filter ? filter.toString() : 'none');

        const content = Buffer.from(streamBytes).toString('latin1');

        // Show first 2000 characters
        console.log('  Content (first 2000 chars):');
        console.log(content.substring(0, 2000));
        console.log('\n  ...\n');

        // Count operator occurrences
        const operators = {
            're': (content.match(/\s+re\s/g) || []).length,     // rectangle
            'm': (content.match(/\s+m\s/g) || []).length,       // move to
            'l': (content.match(/\s+l\s/g) || []).length,       // line to
            'S': (content.match(/\sS\s/g) || []).length,        // stroke
            'f': (content.match(/\sf\s/g) || []).length,        // fill
            'RG': (content.match(/\sRG\s/g) || []).length,      // stroke color
            'rg': (content.match(/\srg\s/g) || []).length,      // fill color
            'Do': (content.match(/\sDo\s/g) || []).length,      // draw XObject
        };

        console.log('  Graphics operators found:');
        Object.entries(operators).forEach(([op, count]) => {
            if (count > 0) {
                console.log(`    ${op}: ${count}`);
            }
        });
        console.log('');
    }
}

inspectContentStream().catch(console.error);
