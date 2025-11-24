/**
 * Create a test PDF with an actual embedded JPEG image
 */
const fs = require('fs');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

async function createPDFWithImage() {
    console.log('📄 Creating test PDF with embedded JPEG image...\n');

    // Create a simple 100x100 JPEG image programmatically
    // We'll create a minimal valid JPEG file
    const jpegData = createSimpleJPEG();
    fs.writeFileSync('/tmp/test-image.jpg', jpegData);
    console.log('✅ Created test JPEG image: /tmp/test-image.jpg');

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);

    // Embed font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Add title
    page.drawText('Test PDF with Embedded JPEG Image', {
        x: 50,
        y: 742,
        size: 20,
        font: boldFont
    });

    // Add description
    page.drawText('This PDF contains an embedded JPEG image for testing extraction.', {
        x: 50,
        y: 710,
        size: 12,
        font: font
    });

    // Embed the JPEG image
    const jpegImage = await pdfDoc.embedJpg(jpegData);

    // Draw the image
    page.drawImage(jpegImage, {
        x: 100,
        y: 400,
        width: 200,
        height: 200
    });

    // Add label
    page.drawText('Embedded JPEG Image (200x200 px)', {
        x: 120,
        y: 370,
        size: 10,
        font: font
    });

    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('./uploads/test-with-jpeg-image.pdf', pdfBytes);

    console.log('✅ Created test PDF: ./uploads/test-with-jpeg-image.pdf');
    console.log('   This PDF contains an actual embedded JPEG image.\n');
}

/**
 * Create a minimal valid JPEG file (solid color)
 * This is a 2x2 pixel red square JPEG
 */
function createSimpleJPEG() {
    // Minimal JPEG file structure for a 2x2 red square
    // This is a valid JPEG file that any JPEG decoder should be able to read
    const jpegHex =
        'FFD8FFE000104A46494600010100000100010000FFDB004300080606070605080707' +
        '07090909080A0C140D0C0B0B0C1912130F141D1A1F1E1D1A1C1C20242E2720222C23' +
        '1C1C2837292C30313434341F27393D38323C2E333432FFDB0043010909090C0B0C18' +
        '0D0D1832211C213232323232323232323232323232323232323232323232323232' +
        '32323232323232323232323232323232323232323232FFC00011080002000203012200' +
        '021101031101FFC4001500010100000000000000000000000000000008FFC400141001' +
        '0000000000000000000000000000000000FFDA000C03010002110311003F00BF8000' +
        'FFD9';

    return Buffer.from(jpegHex, 'hex');
}

createPDFWithImage().catch(console.error);
