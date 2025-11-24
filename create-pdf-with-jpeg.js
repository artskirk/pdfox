/**
 * Create a test PDF with the JPEG image we created
 */
const fs = require('fs');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

async function createPDFWithJPEG() {
    console.log('📄 Creating test PDF with JPEG image...\n');

    // Read the JPEG image we created
    const jpegData = fs.readFileSync('/tmp/test-blue-square.jpg');
    console.log(`✅ Loaded JPEG image (${jpegData.length} bytes)`);

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
    console.log('Embedding JPEG into PDF...');
    const jpegImage = await pdfDoc.embedJpg(jpegData);
    console.log('✅ JPEG embedded successfully');

    // Draw the image at specific position
    page.drawImage(jpegImage, {
        x: 150,
        y: 400,
        width: 200,
        height: 200
    });

    // Add label
    page.drawText('Blue Square Image (200x200 px)', {
        x: 180,
        y: 370,
        size: 10,
        font: font
    });

    // Add more text
    page.drawText('Additional paragraph below the image.', {
        x: 50,
        y: 330,
        size: 12,
        font: font
    });

    page.drawText('This PDF can be imported to test image extraction and display.', {
        x: 50,
        y: 310,
        size: 12,
        font: font
    });

    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('./uploads/test-with-jpeg.pdf', pdfBytes);

    console.log('✅ Created test PDF: ./uploads/test-with-jpeg.pdf');
    console.log('   This PDF contains an actual embedded JPEG image at position (150, 400).\n');
}

createPDFWithJPEG().catch(console.error);
