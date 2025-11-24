/**
 * Deep inspection of not-editable.pdf
 */
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

async function deepInspect() {
    console.log('🔍 DEEP PDF INSPECTION\n');

    try {
        const pdfBuffer = fs.readFileSync('./uploads/not-editable.pdf');
        const pdfDoc = await PDFDocument.load(pdfBuffer);

        const page = pdfDoc.getPage(0);
        const pageNode = page.node;

        console.log('Page object keys:', Object.keys(pageNode));
        console.log('');

        // Get content stream
        const contentStream = pageNode.Contents();

        if (!contentStream) {
            console.log('❌ No content stream');
            return;
        }

        const streamArray = Array.isArray(contentStream) ? contentStream : [contentStream];
        console.log(`Content streams: ${streamArray.length}\n`);

        const stream = streamArray[0];
        console.log('Stream type:', stream.constructor.name);
        console.log('Stream keys:', Object.keys(stream));

        // Try different methods to get content
        let content = null;

        try {
            if (typeof stream.getContents === 'function') {
                const bytes = stream.getContents();
                content = Buffer.from(bytes).toString('latin1');
                console.log('✅ Got content using getContents()');
            }
        } catch (e) {
            console.log('❌ getContents failed:', e.message);
        }

        if (!content && stream.contents) {
            try {
                content = Buffer.from(stream.contents).toString('latin1');
                console.log('✅ Got content using .contents');
            } catch (e) {
                console.log('❌ .contents failed:', e.message);
            }
        }

        if (content) {
            console.log(`\nContent length: ${content.length} bytes`);
            console.log('\nFull content:\n');
            console.log(content);
            console.log('\n' + '='.repeat(70));

            // Analyze operators
            const hasTextOps = /\b(Tj|TJ)\b/.test(content);
            const hasImageOps = /\bDo\b/.test(content);

            console.log(`\nHas text operators (Tj/TJ): ${hasTextOps}`);
            console.log(`Has image operators (Do): ${hasImageOps}`);
        } else {
            console.log('\n❌ Could not extract content');
        }

        // Check resources
        const resources = pageNode.Resources();
        if (resources) {
            console.log('\n📋 RESOURCES:');
            const xobjects = resources.lookup('XObject');
            if (xobjects && xobjects.dict) {
                console.log('XObject keys:', Array.from(xobjects.dict.keys()).map(k => k.toString()));
            }
        }

    } catch (error) {
        console.error('ERROR:', error.message);
        console.error(error.stack);
    }
}

deepInspect();
