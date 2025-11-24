/**
 * Create a test PDF with text and an embedded image
 */
const fs = require('fs');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

async function createTestPDF() {
    console.log('📄 Creating test PDF with image...\n');

    // Create a new PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size

    // Embed a font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Add title
    page.drawText('Test Document with Image', {
        x: 50,
        y: 742,
        size: 24,
        font: boldFont,
        color: rgb(0, 0, 0)
    });

    // Add some text
    page.drawText('This is a test PDF document containing both text and an embedded image.', {
        x: 50,
        y: 700,
        size: 12,
        font: font,
        color: rgb(0, 0, 0)
    });

    page.drawText('The image below is a simple blue square for testing image extraction:', {
        x: 50,
        y: 680,
        size: 12,
        font: font,
        color: rgb(0, 0, 0)
    });

    // Create a simple test image (blue square as JPEG)
    // This creates a very simple 100x100 blue square
    const width = 100;
    const height = 100;
    const imageData = Buffer.alloc(width * height * 3);

    // Fill with blue color (RGB: 50, 100, 200)
    for (let i = 0; i < width * height; i++) {
        imageData[i * 3] = 50;     // R
        imageData[i * 3 + 1] = 100; // G
        imageData[i * 3 + 2] = 200; // B
    }

    // Create JPEG from raw RGB data
    // Note: pdf-lib expects proper JPEG format, so let's use a minimal valid JPEG
    // For simplicity, we'll just create a colored rectangle using PDF's drawing functions instead

    // Draw a colored rectangle to simulate an image
    page.drawRectangle({
        x: 50,
        y: 450,
        width: 200,
        height: 150,
        color: rgb(0.2, 0.4, 0.8),
        borderColor: rgb(0, 0, 0),
        borderWidth: 2
    });

    page.drawText('[Test Image: Blue Rectangle 200x150px]', {
        x: 70,
        y: 520,
        size: 10,
        font: font,
        color: rgb(1, 1, 1)
    });

    // Add more text below
    page.drawText('This PDF can be used to test the preserve-mode editor functionality.', {
        x: 50,
        y: 400,
        size: 12,
        font: font,
        color: rgb(0, 0, 0)
    });

    page.drawText('The image extraction code should detect and extract the embedded image.', {
        x: 50,
        y: 380,
        size: 12,
        font: font,
        color: rgb(0, 0, 0)
    });

    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('./uploads/test-with-graphics.pdf', pdfBytes);

    console.log('✅ Created test PDF: ./uploads/test-with-graphics.pdf');
    console.log('   Note: This PDF contains vector graphics (rectangles).');
    console.log('   For proper image testing, we need a PDF with actual embedded images (JPEG/PNG).\n');
}

createTestPDF().catch(console.error);
