require('dotenv').config();
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { Document, Paragraph, TextRun, Packer } = require('docx');
const Stripe = require('stripe');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Stripe
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'your_stripe_secret_key');

// Payment configuration
const PAYMENT_AMOUNT = parseInt(process.env.PAYMENT_AMOUNT || '299'); // 2.99 EUR in cents
const PAYMENT_CURRENCY = process.env.PAYMENT_CURRENCY || 'eur';

// Pro access configuration
const PRO_PAYMENT_AMOUNT = parseInt(process.env.PRO_PAYMENT_AMOUNT || '899'); // 8.99 EUR in cents
const PRO_ACCESS_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const FINGERPRINT_TOLERANCE = 0.85; // 85% match required

// Persistent storage for Pro access (file-based for MVP)
const proAccessFile = path.join(__dirname, 'data', 'pro-access.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Load Pro access data from file
function loadProAccess() {
    try {
        if (fs.existsSync(proAccessFile)) {
            const data = JSON.parse(fs.readFileSync(proAccessFile, 'utf8'));
            // Clean expired entries on load
            const now = Date.now();
            const valid = data.filter(entry => entry.expiresAt > now);
            if (valid.length !== data.length) {
                saveProAccess(valid);
            }
            return valid;
        }
    } catch (error) {
        console.error('Error loading Pro access data:', error);
    }
    return [];
}

// Save Pro access data to file
function saveProAccess(data) {
    try {
        fs.writeFileSync(proAccessFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving Pro access data:', error);
    }
}

// Find Pro access by token
function findProAccessByToken(token) {
    const data = loadProAccess();
    return data.find(entry => entry.tokenHash === hashToken(token) && entry.expiresAt > Date.now());
}

// Find Pro access by fingerprint
function findProAccessByFingerprint(fingerprint) {
    const data = loadProAccess();
    return data.find(entry => entry.fingerprint === fingerprint && entry.expiresAt > Date.now());
}

// Hash token for storage
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// Create Pro access entry
function createProAccess(email, fingerprint, stripeSessionId, receiptNumber = null) {
    const data = loadProAccess();

    // Generate JWT token
    const expiresAt = Date.now() + PRO_ACCESS_DURATION;
    const token = jwt.sign({
        email,
        fingerprint,
        exp: Math.floor(expiresAt / 1000) // JWT exp is in seconds
    }, JWT_SECRET);

    const entry = {
        id: crypto.randomUUID(),
        email,
        fingerprint,
        stripeSessionId,
        receiptNumber,
        tokenHash: hashToken(token),
        createdAt: Date.now(),
        expiresAt,
        isRevoked: false
    };

    data.push(entry);
    saveProAccess(data);

    return { token, expiresAt, entry };
}

// Initialize Google OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
);

// Store paid access tokens (in production, use a database)
const paidAccess = new Map(); // { token: { filename, expiresAt } }

// Store temporary preview tokens (5-minute expiry for Google Docs to fetch)
const previewTokens = new Map(); // { previewToken: { filename, expiresAt } }

// Middleware
app.use(express.json());

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const outputsDir = path.join(__dirname, 'outputs');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.pdf';
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// Serve static files
app.use(express.static('public'));

// Extract text from scanned/image PDF using OCR
async function extractTextWithOCR(filePath) {
    try {
        console.log('Attempting OCR extraction for scanned PDF...');

        // Convert PDF to images using ImageMagick directly
        const pageLimit = 10; // Process up to 10 pages
        let extractedText = '';

        for (let page = 1; page <= pageLimit; page++) {
            try {
                const imagePath = path.join(uploadsDir, `ocr-${Date.now()}-page${page}.png`);

                // Use ImageMagick convert command directly
                const convertCmd = `convert -density 200 "${filePath}[${page - 1}]" -quality 75 "${imagePath}"`;
                await execPromise(convertCmd, { timeout: 30000 });

                // Perform OCR on the image
                const { data: { text } } = await Tesseract.recognize(
                    imagePath,
                    'eng',
                    {
                        logger: () => {} // Suppress logs
                    }
                );

                extractedText += text + '\n\n';

                // Clean up temporary image file
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            } catch (pageError) {
                console.log(`Could not process page ${page}:`, pageError.message);
                break; // Stop if we can't process a page
            }
        }

        if (extractedText.trim().length > 0) {
            console.log(`OCR extracted ${extractedText.length} characters`);
            return extractedText;
        } else {
            throw new Error('No text could be extracted via OCR');
        }
    } catch (error) {
        console.error('OCR extraction error:', error);
        throw new Error('Could not extract text from PDF using OCR');
    }
}

// Extract text from PDF
async function extractTextFromPDF(filePath) {
    let extractedText = '';

    // Try standard PDF parsing first
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        extractedText = pdfData.text;
    } catch (parseError) {
        console.log('Standard PDF parsing failed, will try OCR');
    }

    // If no text extracted, try OCR
    if (!extractedText || extractedText.trim().length === 0) {
        console.log('No text found, attempting OCR extraction...');
        extractedText = await extractTextWithOCR(filePath);
    }

    if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('Could not extract text from PDF');
    }

    return extractedText;
}

// Convert text to DOCX
async function convertToDocx(text, outputPath) {
    const paragraphs = text.split('\n').map(line =>
        new Paragraph({
            children: [new TextRun(line || ' ')],
        })
    );

    const doc = new Document({
        sections: [{
            properties: {},
            children: paragraphs,
        }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);
}

// Convert text to HTML
function convertToHtml(text, outputPath) {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Converted Document</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <pre>${text}</pre>
</body>
</html>`;

    fs.writeFileSync(outputPath, htmlContent);
}

// Convert text to TXT
function convertToTxt(text, outputPath) {
    fs.writeFileSync(outputPath, text, 'utf8');
}

// Create Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { filename } = req.body;

        if (!filename) {
            return res.status(400).json({ error: 'Filename is required' });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: PAYMENT_CURRENCY,
                        product_data: {
                            name: 'PDF Download Access',
                            description: `24-hour access to download ${filename}`,
                        },
                        unit_amount: PAYMENT_AMOUNT,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${req.headers.origin || 'http://localhost:3000'}/payment-success.html?session_id={CHECKOUT_SESSION_ID}&filename=${encodeURIComponent(filename)}`,
            cancel_url: `${req.headers.origin || 'http://localhost:3000'}/?canceled=true`,
            metadata: {
                filename: filename,
            },
        });

        res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// ============================================================================
// PRO ACCESS ENDPOINTS (PDF Editor) - API v1
// ============================================================================

// Create Pro Access Checkout Session
app.post('/api/v1/pro/create-checkout', async (req, res) => {
    try {
        const { email, fingerprint } = req.body;

        if (!email || !fingerprint) {
            return res.status(400).json({ error: 'Email and fingerprint are required' });
        }

        // Check if user already has active Pro access with this fingerprint
        const existingAccess = findProAccessByFingerprint(fingerprint);
        if (existingAccess) {
            return res.status(400).json({
                error: 'Active Pro access found',
                message: 'You already have active Pro access on this device',
                expiresAt: existingAccess.expiresAt
            });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: email,
            line_items: [
                {
                    price_data: {
                        currency: PAYMENT_CURRENCY,
                        product_data: {
                            name: 'PDFOX Pro Access',
                            description: '24-hour unlimited access to all Pro features',
                            images: ['https://pdfox.cloud/favicon.svg'],
                        },
                        unit_amount: PRO_PAYMENT_AMOUNT,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${req.headers.origin || 'http://localhost:3000'}/pro-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin || 'http://localhost:3000'}/pdf-editor-modular.html?canceled=true`,
            payment_intent_data: {
                receipt_email: email,
                description: 'PDFOX Pro Access - 24 hours',
                metadata: {
                    type: 'pro_access',
                    email: email,
                }
            },
            metadata: {
                type: 'pro_access',
                fingerprint: fingerprint,
                email: email,
            },
        });

        res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Error creating Pro checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// Verify Pro Payment and Grant Access
app.post('/api/v1/pro/verify-payment', async (req, res) => {
    try {
        const { sessionId, fingerprint } = req.body;

        if (!sessionId || !fingerprint) {
            return res.status(400).json({ error: 'Session ID and fingerprint are required' });
        }

        // Retrieve the session from Stripe with payment intent expanded
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['payment_intent.latest_charge']
        });

        if (session.payment_status !== 'paid') {
            return res.status(400).json({ error: 'Payment not completed' });
        }

        // Verify this is a Pro access session
        if (session.metadata?.type !== 'pro_access') {
            return res.status(400).json({ error: 'Invalid session type' });
        }

        // Get receipt number from the charge
        let receiptNumber = null;
        if (session.payment_intent?.latest_charge?.receipt_number) {
            receiptNumber = session.payment_intent.latest_charge.receipt_number;
        }

        // Verify fingerprint matches (with some tolerance for minor changes)
        const storedFingerprint = session.metadata?.fingerprint;
        if (storedFingerprint !== fingerprint) {
            console.warn(`Fingerprint mismatch: expected ${storedFingerprint}, got ${fingerprint}`);
            // For now, we'll allow it but log the mismatch
            // In production, you might want stricter validation
        }

        // Check if access already granted for this session
        const data = loadProAccess();
        const existingEntry = data.find(e => e.stripeSessionId === sessionId);
        if (existingEntry) {
            // Return existing token info (regenerate token for security)
            const token = jwt.sign({
                email: existingEntry.email,
                fingerprint: existingEntry.fingerprint,
                exp: Math.floor(existingEntry.expiresAt / 1000)
            }, JWT_SECRET);

            return res.json({
                success: true,
                token,
                expiresAt: existingEntry.expiresAt,
                email: existingEntry.email,
                receiptNumber: existingEntry.receiptNumber,
                message: 'Pro access already active'
            });
        }

        // Create new Pro access
        const email = session.customer_email || session.metadata?.email || 'unknown@user.com';
        const { token, expiresAt } = createProAccess(email, fingerprint, sessionId, receiptNumber);

        res.json({
            success: true,
            token,
            expiresAt,
            email,
            receiptNumber,
            message: 'Pro access activated'
        });
    } catch (error) {
        console.error('Error verifying Pro payment:', error);
        res.status(500).json({ error: 'Failed to verify payment' });
    }
});

// Validate Pro Access Token
app.post('/api/v1/pro/validate', (req, res) => {
    try {
        const { token, fingerprint } = req.body;

        if (!token) {
            return res.json({ valid: false, reason: 'No token provided' });
        }

        // Verify JWT
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.json({ valid: false, reason: 'Token expired' });
            }
            return res.json({ valid: false, reason: 'Invalid token' });
        }

        // Verify token exists in storage and not revoked
        const access = findProAccessByToken(token);
        if (!access) {
            return res.json({ valid: false, reason: 'Token not found or expired' });
        }

        if (access.isRevoked) {
            return res.json({ valid: false, reason: 'Token revoked' });
        }

        // Verify fingerprint matches (optional strict mode)
        if (fingerprint && decoded.fingerprint !== fingerprint) {
            console.warn(`Fingerprint mismatch during validation: expected ${decoded.fingerprint}, got ${fingerprint}`);
            // Log but don't reject - fingerprints can change slightly
        }

        res.json({
            valid: true,
            expiresAt: access.expiresAt,
            email: decoded.email
        });
    } catch (error) {
        console.error('Error validating Pro access:', error);
        res.json({ valid: false, reason: 'Validation error' });
    }
});

// Check Pro Status (by fingerprint - for returning users)
app.post('/api/v1/pro/status', (req, res) => {
    try {
        const { fingerprint } = req.body;

        if (!fingerprint) {
            return res.json({ isPro: false });
        }

        const access = findProAccessByFingerprint(fingerprint);

        if (access && !access.isRevoked) {
            res.json({
                isPro: true,
                expiresAt: access.expiresAt,
                email: access.email
            });
        } else {
            res.json({ isPro: false });
        }
    } catch (error) {
        console.error('Error checking Pro status:', error);
        res.json({ isPro: false });
    }
});

// Recover Pro Access using email and receipt number from payment receipt
app.post('/api/v1/pro/recover', async (req, res) => {
    try {
        const { email, receiptNumber, fingerprint } = req.body;

        if (!email || !receiptNumber || !fingerprint) {
            return res.status(400).json({
                error: 'Email, receipt number, and fingerprint are required'
            });
        }

        // Normalize inputs
        const normalizedEmail = email.toLowerCase().trim();
        const normalizedReceiptNumber = receiptNumber.trim();

        // Try to find existing Pro access by receipt number first
        const data = loadProAccess();
        let existingAccess = data.find(e =>
            e.receiptNumber === normalizedReceiptNumber &&
            e.email.toLowerCase() === normalizedEmail
        );

        // If found locally by receipt number
        if (existingAccess) {
            // Check if expired
            if (existingAccess.expiresAt < Date.now()) {
                const hoursAgo = Math.round((Date.now() - existingAccess.expiresAt) / (1000 * 60 * 60));
                return res.status(400).json({
                    error: 'Pro access has expired',
                    message: `Your 24-hour Pro access expired ${hoursAgo > 0 ? hoursAgo + ' hour(s) ago' : 'recently'}. Purchase again to continue enjoying watermark-free exports.`,
                    expiredAt: new Date(existingAccess.expiresAt).toISOString(),
                    canPurchaseAgain: true
                });
            }

            if (existingAccess.isRevoked) {
                return res.status(400).json({ error: 'This Pro access has been revoked' });
            }

            // Update fingerprint for this access
            existingAccess.fingerprint = fingerprint;
            saveProAccess(data);

            // Generate new token
            const token = jwt.sign({
                email: existingAccess.email,
                fingerprint: fingerprint,
                exp: Math.floor(existingAccess.expiresAt / 1000)
            }, JWT_SECRET);

            // Update token hash
            existingAccess.tokenHash = hashToken(token);
            saveProAccess(data);

            return res.json({
                success: true,
                token,
                expiresAt: existingAccess.expiresAt,
                email: existingAccess.email,
                message: 'Pro access restored successfully'
            });
        }

        // If not found locally, search Stripe by listing charges for the email
        // receipt_number is not searchable, so we list charges and filter
        try {
            const charges = await stripe.charges.list({
                limit: 50
            });

            // Find charge with matching receipt number and email
            const matchingCharge = charges.data.find(charge =>
                charge.receipt_number === normalizedReceiptNumber &&
                (charge.receipt_email?.toLowerCase() === normalizedEmail ||
                 charge.billing_details?.email?.toLowerCase() === normalizedEmail)
            );

            if (matchingCharge) {
                // Get the payment intent to check metadata
                const paymentIntent = await stripe.paymentIntents.retrieve(matchingCharge.payment_intent);
                const isProAccess = paymentIntent.metadata?.type === 'pro_access';

                if (!isProAccess) {
                    return res.status(400).json({ error: 'This payment is not for Pro access' });
                }

                // Check if within 24 hours of payment
                const paymentTime = matchingCharge.created * 1000;
                const expiresAt = paymentTime + PRO_ACCESS_DURATION;

                if (expiresAt < Date.now()) {
                    const hoursAgo = Math.round((Date.now() - expiresAt) / (1000 * 60 * 60));
                    return res.status(400).json({
                        error: 'Pro access has expired',
                        message: `Your 24-hour Pro access expired ${hoursAgo > 0 ? hoursAgo + ' hour(s) ago' : 'recently'}. Purchase again to continue enjoying watermark-free exports.`,
                        expiredAt: new Date(expiresAt).toISOString(),
                        canPurchaseAgain: true
                    });
                }

                // Create new Pro access entry with receipt number
                const { token, entry } = createProAccess(normalizedEmail, fingerprint, paymentIntent.id, normalizedReceiptNumber);

                return res.json({
                    success: true,
                    token,
                    expiresAt: entry.expiresAt,
                    email: normalizedEmail,
                    message: 'Pro access restored from payment record'
                });
            }
        } catch (stripeError) {
            console.error('Stripe lookup error:', stripeError.message);
        }

        // Nothing found
        return res.status(404).json({
            error: 'No valid Pro access found',
            message: 'Could not find a Pro access purchase with this email and receipt number. Please check your receipt and try again.'
        });

    } catch (error) {
        console.error('Error recovering Pro access:', error);
        res.status(500).json({ error: 'Failed to recover Pro access' });
    }
});

// Stripe Webhook for Pro Access (production use)
app.post('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.warn('Stripe webhook secret not configured');
        return res.status(400).send('Webhook secret not configured');
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        // Only process Pro access payments
        if (session.metadata?.type === 'pro_access') {
            const fingerprint = session.metadata?.fingerprint;
            const email = session.customer_email || session.metadata?.email;

            if (fingerprint && email) {
                // Check if already processed
                const data = loadProAccess();
                const exists = data.find(e => e.stripeSessionId === session.id);

                if (!exists) {
                    createProAccess(email, fingerprint, session.id);
                    console.log(`Pro access granted via webhook for ${email}`);
                }
            }
        }
    }

    res.json({ received: true });
});

// ============================================================================
// END PRO ACCESS ENDPOINTS
// ============================================================================

// Verify payment and grant access
app.post('/verify-payment', async (req, res) => {
    try {
        const { sessionId, filename } = req.body;

        if (!sessionId || !filename) {
            return res.status(400).json({ error: 'Session ID and filename are required' });
        }

        // Retrieve the session from Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === 'paid') {
            // Generate access token
            const accessToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

            // Store access token
            paidAccess.set(accessToken, {
                filename: filename,
                expiresAt: expiresAt,
            });

            // Clean up expired tokens (simple cleanup)
            for (const [token, data] of paidAccess.entries()) {
                if (data.expiresAt < Date.now()) {
                    paidAccess.delete(token);
                }
            }

            res.json({
                success: true,
                accessToken: accessToken,
                expiresAt: expiresAt,
            });
        } else {
            res.status(400).json({ error: 'Payment not completed' });
        }
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ error: 'Failed to verify payment' });
    }
});

// Generate preview token for Google Docs
app.post('/generate-preview-token', (req, res) => {
    const { accessToken } = req.body;

    if (!accessToken) {
        return res.status(400).json({ error: 'Access token required' });
    }

    const access = paidAccess.get(accessToken);

    if (!access) {
        return res.status(401).json({ error: 'Invalid access token' });
    }

    if (access.expiresAt < Date.now()) {
        paidAccess.delete(accessToken);
        return res.status(401).json({ error: 'Access token expired' });
    }

    // Generate preview token (valid for 5 minutes)
    const previewToken = crypto.randomBytes(32).toString('hex');
    const previewExpiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes

    previewTokens.set(previewToken, {
        filename: access.filename,
        expiresAt: previewExpiresAt,
    });

    // Clean up expired preview tokens
    for (const [token, data] of previewTokens.entries()) {
        if (data.expiresAt < Date.now()) {
            previewTokens.delete(token);
        }
    }

    res.json({
        success: true,
        previewToken: previewToken,
        expiresAt: previewExpiresAt,
    });
});

// Public preview endpoint (for Google Docs Viewer)
app.get('/preview/:previewToken', (req, res) => {
    const { previewToken } = req.params;

    const preview = previewTokens.get(previewToken);

    if (!preview) {
        return res.status(401).send('Invalid or expired preview link');
    }

    if (preview.expiresAt < Date.now()) {
        previewTokens.delete(previewToken);
        return res.status(401).send('Preview link expired');
    }

    const filePath = path.join(outputsDir, preview.filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    // Serve the file with proper headers for Google Docs Viewer
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.download(filePath, preview.filename);
});

// Upload file to Google Drive
app.post('/upload-to-drive', async (req, res) => {
    try {
        const { accessToken, googleAccessToken } = req.body;

        if (!accessToken || !googleAccessToken) {
            return res.status(400).json({ error: 'Access tokens required' });
        }

        // Verify paid access
        const access = paidAccess.get(accessToken);
        if (!access) {
            return res.status(401).json({ error: 'Invalid access token' });
        }

        if (access.expiresAt < Date.now()) {
            paidAccess.delete(accessToken);
            return res.status(401).json({ error: 'Access token expired' });
        }

        const filePath = path.join(outputsDir, access.filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Set Google OAuth credentials
        oauth2Client.setCredentials({ access_token: googleAccessToken });

        // Initialize Drive API
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // Determine MIME type based on file extension
        const fileExtension = path.extname(access.filename).toLowerCase();
        const mimeTypes = {
            '.txt': 'text/plain',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.html': 'text/html'
        };
        const mimeType = mimeTypes[fileExtension] || 'application/octet-stream';

        // Upload file to Google Drive
        const response = await drive.files.create({
            requestBody: {
                name: access.filename,
                mimeType: mimeType,
            },
            media: {
                mimeType: mimeType,
                body: fs.createReadStream(filePath),
            },
            fields: 'id, webViewLink, webContentLink',
        });

        res.json({
            success: true,
            fileId: response.data.id,
            webViewLink: response.data.webViewLink,
            webContentLink: response.data.webContentLink,
        });

    } catch (error) {
        console.error('Error uploading to Google Drive:', error);
        res.status(500).json({
            error: 'Failed to upload to Google Drive',
            details: error.message
        });
    }
});

// Protected download endpoint
app.get('/download/:filename', (req, res) => {
    const { filename } = req.params;
    const { token } = req.query;

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    const access = paidAccess.get(token);

    if (!access) {
        return res.status(401).json({ error: 'Invalid access token' });
    }

    if (access.expiresAt < Date.now()) {
        paidAccess.delete(token);
        return res.status(401).json({ error: 'Access token expired' });
    }

    if (access.filename !== filename) {
        return res.status(403).json({ error: 'Access denied for this file' });
    }

    const filePath = path.join(outputsDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    res.download(filePath, filename);
});

// Get Stripe publishable key for frontend
app.get('/config', (req, res) => {
    res.json({
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'your_publishable_key',
    });
});

// Get Google OAuth config for frontend
app.get('/google-config', (req, res) => {
    res.json({
        clientId: process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID',
    });
});

// Convert endpoint
app.post('/convert', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const format = req.body.format || 'txt';
        const filePath = req.file.path;
        const filename = path.parse(req.file.filename).name;

        console.log(`Converting ${req.file.filename} to ${format}`);

        // Extract text from PDF
        let extractedText;
        try {
            extractedText = await extractTextFromPDF(filePath);
        } catch (error) {
            // Clean up uploaded file
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            throw error;
        }

        // Convert to requested format
        let outputFilename;
        let outputPath;

        switch (format) {
            case 'txt':
                outputFilename = `${filename}.txt`;
                outputPath = path.join(outputsDir, outputFilename);
                convertToTxt(extractedText, outputPath);
                break;

            case 'docx':
                outputFilename = `${filename}.docx`;
                outputPath = path.join(outputsDir, outputFilename);
                await convertToDocx(extractedText, outputPath);
                break;

            case 'html':
                outputFilename = `${filename}.html`;
                outputPath = path.join(outputsDir, outputFilename);
                convertToHtml(extractedText, outputPath);
                break;

            default:
                throw new Error('Unsupported format');
        }

        // Clean up uploaded PDF after successful conversion
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Return success with download link
        res.json({
            status: 'success',
            message: 'PDF converted successfully',
            filename: outputFilename,
            downloadUrl: `/outputs/${outputFilename}`,
            textPreview: extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : ''),
            characterCount: extractedText.length
        });

    } catch (error) {
        console.error('Error processing conversion:', error);

        // Clean up uploaded file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        // Handle specific errors
        if (error.message.includes('Could not extract text from PDF')) {
            return res.status(400).json({
                error: 'Unable to extract text',
                details: 'We couldn\'t extract text from this PDF file. This may be a scanned document without readable text, or the OCR process failed.'
            });
        }

        res.status(500).json({
            error: 'Conversion failed',
            details: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'PDF to Text Converter is running' });
});

// Start server
app.listen(PORT, () => {
    console.log(`PDF to Text Converter running on http://localhost:${PORT}`);
    console.log(`Uploads directory: ${uploadsDir}`);
    console.log(`Outputs directory: ${outputsDir}`);
});
