require('dotenv').config();
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const util = require('util');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { Document, Paragraph, TextRun, Packer } = require('docx');
const Stripe = require('stripe');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const { createLogger } = require('./lib/logger');
const { AnalyticsNotifier } = require('./lib/analytics');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_ENV = process.env.APP_ENV || 'prod';
const APP_DEBUG = process.env.APP_DEBUG === '1';
const isProduction = APP_ENV === 'prod';

// Initialize logger
const log = createLogger({
    isProduction,
    debugEnabled: APP_DEBUG,
    logDir: path.join(__dirname, 'logs')
});

// Initialize analytics
const analytics = new AnalyticsNotifier({
    debug: APP_DEBUG
});

// ============================================================================
// Input Validation & Sanitization Helpers
// ============================================================================

// Validate email format
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
}

// Validate fingerprint format (alphanumeric string)
function isValidFingerprint(fingerprint) {
    if (!fingerprint || typeof fingerprint !== 'string') return false;
    return /^[a-zA-Z0-9_-]+$/.test(fingerprint) && fingerprint.length <= 64;
}

// Validate filename - prevent path traversal
function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') return null;
    // Remove any path components and null bytes
    const sanitized = path.basename(filename).replace(/\0/g, '');
    // Only allow safe characters
    if (!/^[\w\-. ]+$/.test(sanitized)) return null;
    // Prevent hidden files
    if (sanitized.startsWith('.')) return null;
    return sanitized;
}

// Validate share hash format (32 hex characters)
function isValidShareHash(hash) {
    if (!hash || typeof hash !== 'string') return false;
    return /^[a-f0-9]{32}$/.test(hash);
}

// Validate conversion format
function isValidFormat(format) {
    const allowedFormats = ['txt', 'docx', 'html'];
    return allowedFormats.includes(format);
}

// Validate Stripe session ID format
function isValidStripeSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return false;
    return /^cs_[a-zA-Z0-9_]+$/.test(sessionId) && sessionId.length <= 200;
}

// Validate token format (64 hex characters)
function isValidToken(token) {
    if (!token || typeof token !== 'string') return false;
    return /^[a-zA-Z0-9_\-.]+$/.test(token) && token.length <= 500;
}

// Sanitize password (remove control characters, limit length)
function sanitizePassword(password) {
    if (!password || typeof password !== 'string') return '';
    // Remove control characters, limit to 128 chars
    return password.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 128);
}

// ============================================================================
// Security Headers Middleware
// ============================================================================
app.use((req, res, next) => {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    // XSS Protection (legacy browsers)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy (formerly Feature-Policy)
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    // Content Security Policy
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://js.stripe.com https://accounts.google.com https://openfpcdn.io",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://api.stripe.com https://accounts.google.com https://cdn.jsdelivr.net https://unpkg.com https://openfpcdn.io https://fonts.googleapis.com https://fonts.gstatic.com",
        "frame-src 'self' https://js.stripe.com https://accounts.google.com",
        "worker-src 'self' blob: https://cdnjs.cloudflare.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; '));

    // HSTS (only in production with HTTPS)
    if (isProduction) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
});

// ============================================================================
// CORS Configuration
// ============================================================================
const ALLOWED_ORIGINS = isProduction
    ? [
        process.env.ALLOWED_ORIGIN || 'https://pdfox.cloud',
        'https://www.pdfox.cloud',
        'https://accounts.google.com',
        'https://js.stripe.com'
    ]
    : [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5173', // Vite dev server
        'https://accounts.google.com',
        'https://js.stripe.com'
    ];

app.use((req, res, next) => {
    const origin = req.headers.origin;

    // Check if origin is in allowlist
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
        return res.status(204).end();
    }

    next();
});

// Request logging middleware
app.use(log.requestLogger());

// Initialize Stripe with environment-specific keys
const STRIPE_SECRET_KEY = isProduction
    ? (process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY)
    : (process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY);

const STRIPE_PUBLISHABLE_KEY = isProduction
    ? (process.env.STRIPE_PUBLISHABLE_KEY_LIVE || process.env.STRIPE_PUBLISHABLE_KEY)
    : (process.env.STRIPE_PUBLISHABLE_KEY_TEST || process.env.STRIPE_PUBLISHABLE_KEY);

if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY === 'your_stripe_secret_key') {
    log.warn(`Stripe secret key not configured for ${isProduction ? 'production' : 'development'} environment`);
}

const stripe = Stripe(STRIPE_SECRET_KEY || 'sk_test_placeholder');

// Payment configuration
const PAYMENT_AMOUNT = parseInt(process.env.PAYMENT_AMOUNT || '299'); // 2.99 EUR in cents
const PAYMENT_CURRENCY = process.env.PAYMENT_CURRENCY || 'eur';

// Pro access configuration
const PRO_PAYMENT_AMOUNT = parseInt(process.env.PRO_PAYMENT_AMOUNT || '499'); // 4.99 EUR in cents
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
        log.error('Error loading Pro access data:', error.message);
    }
    return [];
}

// Save Pro access data to file
function saveProAccess(data) {
    try {
        fs.writeFileSync(proAccessFile, JSON.stringify(data, null, 2));
    } catch (error) {
        log.error('Error saving Pro access data:', error.message);
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

// ============================================================================
// Document Sharing Storage & Functions
// ============================================================================

const sharesDir = path.join(__dirname, 'data', 'shares');
const shareMetadataFile = path.join(__dirname, 'data', 'share-metadata.json');
const SHARE_EXPIRY_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Ensure shares directory exists
if (!fs.existsSync(sharesDir)) {
    fs.mkdirSync(sharesDir, { recursive: true });
}

// Rate limiting for password attempts
const passwordAttempts = new Map(); // { hash: { count, lastAttempt } }

// Load share metadata from file
function loadShareMetadata() {
    try {
        if (fs.existsSync(shareMetadataFile)) {
            return JSON.parse(fs.readFileSync(shareMetadataFile, 'utf8'));
        }
    } catch (error) {
        log.error('Error loading share metadata:', error.message);
    }
    return { shares: {} };
}

// Save share metadata to file
function saveShareMetadata(data) {
    try {
        fs.writeFileSync(shareMetadataFile, JSON.stringify(data, null, 2));
    } catch (error) {
        log.error('Error saving share metadata:', error.message);
    }
}

// Generate secure share hash
function generateShareHash() {
    return crypto.randomBytes(16).toString('hex'); // 32 characters
}

// Hash password for storage
function hashSharePassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Find share by hash
function findShareByHash(hash) {
    const data = loadShareMetadata();
    const share = data.shares[hash];
    if (share && share.expiresAt > Date.now()) {
        return share;
    }
    return null;
}

// Create share entry
function createShare(hash, fileName, passwordHash = null) {
    const data = loadShareMetadata();
    const now = Date.now();

    data.shares[hash] = {
        fileName,
        passwordHash,
        createdAt: now,
        expiresAt: now + SHARE_EXPIRY_DURATION
    };

    saveShareMetadata(data);
    return data.shares[hash];
}

// Delete share
function deleteShare(hash) {
    const data = loadShareMetadata();
    if (data.shares[hash]) {
        delete data.shares[hash];
        saveShareMetadata(data);

        // Delete PDF file
        const pdfPath = path.join(sharesDir, `${hash}.pdf`);
        if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
        }
        return true;
    }
    return false;
}

// Cleanup expired shares
function cleanupExpiredShares() {
    const data = loadShareMetadata();
    const now = Date.now();
    let cleaned = 0;

    for (const hash in data.shares) {
        if (data.shares[hash].expiresAt <= now) {
            // Delete PDF file
            const pdfPath = path.join(sharesDir, `${hash}.pdf`);
            if (fs.existsSync(pdfPath)) {
                fs.unlinkSync(pdfPath);
            }
            delete data.shares[hash];
            cleaned++;
        }
    }

    if (cleaned > 0) {
        saveShareMetadata(data);
        log.info(`Cleaned up ${cleaned} expired shares`);
    }
}

// Rate limit constants
const MAX_PASSWORD_ATTEMPTS = 3;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Check rate limit for password attempts
function checkPasswordRateLimit(hash) {
    const attempts = passwordAttempts.get(hash);
    if (attempts && attempts.count >= MAX_PASSWORD_ATTEMPTS) {
        const timeSinceLock = Date.now() - attempts.lastAttempt;
        if (timeSinceLock < LOCKOUT_DURATION) {
            const remainingSeconds = Math.ceil((LOCKOUT_DURATION - timeSinceLock) / 1000);
            return { allowed: false, remainingSeconds };
        } else {
            // Lockout expired, reset attempts
            passwordAttempts.delete(hash);
            return { allowed: true };
        }
    }
    return { allowed: true, attemptsRemaining: MAX_PASSWORD_ATTEMPTS - (attempts?.count || 0) };
}

// Record password attempt
function recordPasswordAttempt(hash, success) {
    if (success) {
        passwordAttempts.delete(hash);
    } else {
        const attempts = passwordAttempts.get(hash) || { count: 0, lastAttempt: 0 };
        attempts.count++;
        attempts.lastAttempt = Date.now();
        passwordAttempts.set(hash, attempts);
    }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredShares, 5 * 60 * 1000);

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

// Serve static files (use absolute path to avoid working directory issues)
app.use(express.static(path.join(__dirname, 'public')));

// Safe command execution using spawn (prevents command injection)
function safeSpawn(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { timeout: options.timeout || 30000, ...options });
        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => { stdout += data; });
        proc.stderr?.on('data', (data) => { stderr += data; });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(`Command failed with code ${code}: ${stderr}`));
            }
        });

        proc.on('error', (err) => {
            reject(err);
        });
    });
}

// Extract text from scanned/image PDF using OCR
async function extractTextWithOCR(filePath) {
    try {
        log.debug('Attempting OCR extraction for scanned PDF...');

        // Validate file path - must be within uploads directory
        const resolvedPath = path.resolve(filePath);
        const uploadsResolved = path.resolve(uploadsDir);
        if (!resolvedPath.startsWith(uploadsResolved)) {
            throw new Error('Invalid file path');
        }

        // Convert PDF to images using ImageMagick directly
        const pageLimit = 10; // Process up to 10 pages
        let extractedText = '';

        for (let page = 1; page <= pageLimit; page++) {
            try {
                const imagePath = path.join(uploadsDir, `ocr-${Date.now()}-page${page}.png`);

                // Use spawn with argument array (safe - prevents command injection)
                await safeSpawn('convert', [
                    '-density', '200',
                    `${resolvedPath}[${page - 1}]`,
                    '-quality', '75',
                    imagePath
                ], { timeout: 30000 });

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
                log.debug(`Could not process page ${page}:`, pageError.message);
                break; // Stop if we can't process a page
            }
        }

        if (extractedText.trim().length > 0) {
            log.debug(`OCR extracted ${extractedText.length} characters`);
            return extractedText;
        } else {
            throw new Error('No text could be extracted via OCR');
        }
    } catch (error) {
        log.debug('OCR extraction error:', error.message);
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
        log.debug('Standard PDF parsing failed, will try OCR');
    }

    // If no text extracted, try OCR
    if (!extractedText || extractedText.trim().length === 0) {
        log.debug('No text found, attempting OCR extraction...');
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
            success_url: `${req.headers.origin || 'http://localhost:3000'}/thank-you?session_id={CHECKOUT_SESSION_ID}&filename=${encodeURIComponent(filename)}`,
            cancel_url: `${req.headers.origin || 'http://localhost:3000'}/?canceled=true`,
            metadata: {
                filename: filename,
            },
        });

        res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
        log.error('Error creating checkout session:', error.message);
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
            success_url: `${req.headers.origin || 'http://localhost:3000'}/welcome?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin || 'http://localhost:3000'}/editor?canceled=true`,
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

        // Track payment started
        analytics.trackPaymentStarted(req, {
            product: 'Pro Access',
            amount: PRO_PAYMENT_AMOUNT,
            email: email
        });

        res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
        log.error('Error creating Pro checkout session:', error.message);
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
            log.warn(`Fingerprint mismatch: expected ${storedFingerprint}, got ${fingerprint}`);
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

        // Track payment completed and pro activated
        analytics.trackPaymentCompleted({
            product: 'Pro Access',
            amount: PRO_PAYMENT_AMOUNT,
            email: email,
            receiptNumber: receiptNumber
        });

        analytics.trackProActivated(req, {
            email: email,
            expiresAt: expiresAt
        });

        res.json({
            success: true,
            token,
            expiresAt,
            email,
            receiptNumber,
            message: 'Pro access activated'
        });
    } catch (error) {
        log.error('Error verifying Pro payment:', error.message);
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
            log.warn(`Fingerprint mismatch during validation: expected ${decoded.fingerprint}, got ${fingerprint}`);
            // Log but don't reject - fingerprints can change slightly
        }

        res.json({
            valid: true,
            expiresAt: access.expiresAt,
            email: decoded.email
        });
    } catch (error) {
        log.error('Error validating Pro access:', error.message);
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
        log.error('Error checking Pro status:', error.message);
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
            log.error('Stripe lookup error:', stripeError.message);
        }

        // Nothing found
        return res.status(404).json({
            error: 'No valid Pro access found',
            message: 'Could not find a Pro access purchase with this email and receipt number. Please check your receipt and try again.'
        });

    } catch (error) {
        log.error('Error recovering Pro access:', error.message);
        res.status(500).json({ error: 'Failed to recover Pro access' });
    }
});

// Stripe Webhook for Pro Access (production use)
app.post('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        log.warn('Stripe webhook secret not configured');
        return res.status(400).send('Webhook secret not configured');
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        log.error('Webhook signature verification failed:', err.message);
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
                    log.info(`Pro access granted via webhook`, { email });
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
        log.error('Error verifying payment:', error.message);
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

    // Validate token format
    if (!isValidToken(previewToken)) {
        return res.status(400).send('Invalid preview token format');
    }

    const preview = previewTokens.get(previewToken);

    if (!preview) {
        return res.status(401).send('Invalid or expired preview link');
    }

    if (preview.expiresAt < Date.now()) {
        previewTokens.delete(previewToken);
        return res.status(401).send('Preview link expired');
    }

    // Sanitize filename and verify path stays within outputs directory
    const safeFilename = sanitizeFilename(preview.filename);
    if (!safeFilename) {
        return res.status(400).send('Invalid file');
    }

    const filePath = path.join(outputsDir, safeFilename);
    const resolvedPath = path.resolve(filePath);
    const resolvedOutputsDir = path.resolve(outputsDir);

    if (!resolvedPath.startsWith(resolvedOutputsDir)) {
        return res.status(400).send('Invalid file path');
    }

    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).send('File not found');
    }

    // Serve the file with proper headers for Google Docs Viewer
    // Note: Google Docs Viewer requires CORS for external access
    const origin = req.headers.origin;
    if (origin && (origin.includes('google.com') || origin.includes('googleapis.com'))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.download(resolvedPath, safeFilename);
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
        log.error('Error uploading to Google Drive:', error.message);
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

    // Validate token format
    if (!token || !isValidToken(token)) {
        return res.status(401).json({ error: 'Access token required' });
    }

    // Sanitize filename to prevent path traversal
    const safeFilename = sanitizeFilename(filename);
    if (!safeFilename) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const access = paidAccess.get(token);

    if (!access) {
        return res.status(401).json({ error: 'Invalid access token' });
    }

    if (access.expiresAt < Date.now()) {
        paidAccess.delete(token);
        return res.status(401).json({ error: 'Access token expired' });
    }

    // Verify filename matches (stored filename should already be safe)
    if (access.filename !== safeFilename) {
        return res.status(403).json({ error: 'Access denied for this file' });
    }

    // Build path and verify it's within outputs directory
    const filePath = path.join(outputsDir, safeFilename);
    const resolvedPath = path.resolve(filePath);
    const resolvedOutputsDir = path.resolve(outputsDir);

    if (!resolvedPath.startsWith(resolvedOutputsDir)) {
        return res.status(400).json({ error: 'Invalid file path' });
    }

    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    res.download(resolvedPath, safeFilename);
});

// Get app configuration for frontend
app.get('/config', (req, res) => {
    res.json({
        publishableKey: STRIPE_PUBLISHABLE_KEY || 'your_publishable_key',
        env: APP_ENV,
        debug: APP_DEBUG,
        isProduction: isProduction
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

        log.debug(`Converting ${req.file.filename} to ${format}`);

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

        // Track document conversion
        analytics.trackDocumentConverted(req, {
            format: format,
            characterCount: extractedText.length
        });

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
        log.error('Error processing conversion:', error.message);

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

// ============================================================================
// Document Sharing API Endpoints
// ============================================================================

// Configure multer for share uploads
const shareUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Create a new share
app.post('/api/v1/share/create', shareUpload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file provided' });
        }

        // Validate and sanitize filename
        let fileName = req.body.fileName || 'document.pdf';
        const sanitizedFileName = sanitizeFilename(fileName);
        if (!sanitizedFileName) {
            fileName = 'document.pdf';
        } else {
            fileName = sanitizedFileName;
        }

        // Sanitize password
        const password = req.body.password ? sanitizePassword(req.body.password) : null;

        // Generate unique hash
        const hash = generateShareHash();

        // Hash password if provided
        const passwordHash = password ? hashSharePassword(password) : null;

        // Save PDF to shares directory
        const pdfPath = path.join(sharesDir, `${hash}.pdf`);
        fs.writeFileSync(pdfPath, req.file.buffer);

        // Create share metadata
        const share = createShare(hash, fileName, passwordHash);

        // Generate share URL
        const shareUrl = `${req.protocol}://${req.get('host')}/share/${hash}`;

        // Track document shared
        analytics.trackDocumentShared(req, {
            fileName: fileName,
            hasPassword: !!passwordHash,
            hash: hash
        });

        res.json({
            success: true,
            hash,
            url: shareUrl,
            expiresAt: share.expiresAt,
            hasPassword: !!passwordHash
        });
    } catch (error) {
        log.error('Error creating share:', error.message);
        res.status(500).json({ error: 'Failed to create share' });
    }
});

// Get share metadata
app.get('/api/v1/share/:hash', (req, res) => {
    const { hash } = req.params;

    // Validate hash format
    if (!isValidShareHash(hash)) {
        return res.status(400).json({ error: 'Invalid share ID format' });
    }

    const share = findShareByHash(hash);

    if (!share) {
        return res.status(404).json({
            error: 'Document not found',
            message: 'This shared document has expired or does not exist.'
        });
    }

    res.json({
        fileName: share.fileName,
        hasPassword: !!share.passwordHash,
        createdAt: share.createdAt,
        expiresAt: share.expiresAt
    });
});

// Verify share password
app.post('/api/v1/share/:hash/verify', express.json(), (req, res) => {
    const { hash } = req.params;
    const { password } = req.body;

    // Validate hash format
    if (!isValidShareHash(hash)) {
        return res.status(400).json({ error: 'Invalid share ID format' });
    }

    // Check rate limit
    const rateLimit = checkPasswordRateLimit(hash);
    if (!rateLimit.allowed) {
        const minutes = Math.floor(rateLimit.remainingSeconds / 60);
        const seconds = rateLimit.remainingSeconds % 60;
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        return res.status(429).json({
            error: 'Too many attempts',
            message: `Too many failed attempts. Please try again in ${timeStr}.`,
            remainingSeconds: rateLimit.remainingSeconds,
            locked: true
        });
    }

    const share = findShareByHash(hash);
    if (!share) {
        return res.status(404).json({ error: 'Document not found' });
    }

    if (!share.passwordHash) {
        return res.json({ verified: true });
    }

    const inputHash = hashSharePassword(password || '');
    const verified = inputHash === share.passwordHash;

    recordPasswordAttempt(hash, verified);

    if (verified) {
        res.json({ verified: true });
    } else {
        // Get updated attempts info for response
        const attempts = passwordAttempts.get(hash);
        const attemptsRemaining = MAX_PASSWORD_ATTEMPTS - (attempts?.count || 0);

        res.status(401).json({
            error: 'Invalid password',
            message: attemptsRemaining > 0
                ? `Incorrect password. ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? 's' : ''} remaining.`
                : 'Incorrect password. You have been temporarily locked out.',
            attemptsRemaining,
            locked: attemptsRemaining <= 0
        });
    }
});

// Download shared PDF
app.get('/api/v1/share/:hash/download', (req, res) => {
    const { hash } = req.params;

    // Validate hash format
    if (!isValidShareHash(hash)) {
        return res.status(400).json({ error: 'Invalid share ID format' });
    }

    const share = findShareByHash(hash);

    if (!share) {
        return res.status(404).json({ error: 'Document not found' });
    }

    // Build path and verify it's within shares directory
    const pdfPath = path.join(sharesDir, `${hash}.pdf`);
    const resolvedPath = path.resolve(pdfPath);
    const resolvedSharesDir = path.resolve(sharesDir);

    if (!resolvedPath.startsWith(resolvedSharesDir)) {
        return res.status(400).json({ error: 'Invalid file path' });
    }

    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'PDF file not found' });
    }

    // Sanitize filename for Content-Disposition header (prevent header injection)
    const safeFileName = (share.fileName || 'document.pdf').replace(/["\r\n]/g, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.sendFile(resolvedPath);
});

// Get PDF data for viewer (inline)
app.get('/api/v1/share/:hash/view', (req, res) => {
    const { hash } = req.params;

    // Validate hash format
    if (!isValidShareHash(hash)) {
        return res.status(400).json({ error: 'Invalid share ID format' });
    }

    const share = findShareByHash(hash);

    if (!share) {
        return res.status(404).json({ error: 'Document not found' });
    }

    // Build path and verify it's within shares directory
    const pdfPath = path.join(sharesDir, `${hash}.pdf`);
    const resolvedPath = path.resolve(pdfPath);
    const resolvedSharesDir = path.resolve(sharesDir);

    if (!resolvedPath.startsWith(resolvedSharesDir)) {
        return res.status(400).json({ error: 'Invalid file path' });
    }

    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'PDF file not found' });
    }

    // Sanitize filename for Content-Disposition header (prevent header injection)
    const safeFileName = (share.fileName || 'document.pdf').replace(/["\r\n]/g, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
    res.sendFile(resolvedPath);
});

// Serve share viewer page
app.get('/share/:hash', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'share-viewer.html'));
});

// Short share link alias
app.get('/s/:hash', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'share-viewer.html'));
});

// ============================================================================
// Contact Form API (Telegram Integration)
// ============================================================================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

// Send message to Telegram channel
async function sendToTelegram(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
        log.warn('Telegram not configured - skipping notification');
        return false;
    }

    const https = require('https');

    return new Promise((resolve) => {
        const data = JSON.stringify({
            chat_id: TELEGRAM_CHANNEL_ID,
            text: message,
            parse_mode: 'HTML'
        });

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    log.debug('Telegram message sent successfully');
                    resolve(true);
                } else {
                    log.error('Telegram API error:', body);
                    resolve(false);
                }
            });
        });

        req.on('error', (err) => {
            log.error('Telegram request error:', err.message);
            resolve(false);
        });

        req.setTimeout(10000, () => {
            req.destroy();
            log.error('Telegram request timeout');
            resolve(false);
        });

        req.write(data);
        req.end();
    });
}

// Analytics tracking endpoint (for client-side page view tracking)
app.post('/api/v1/analytics/pageview', express.json(), async (req, res) => {
    try {
        const { page } = req.body;
        if (page) {
            analytics.trackPageView(req, page);
        }
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

// Editor analytics tracking endpoint
app.post('/api/v1/analytics/editor', express.json(), async (req, res) => {
    try {
        const { event, details } = req.body;

        if (!event) {
            return res.json({ success: false });
        }

        switch (event) {
            case 'file_uploaded':
                analytics.trackFileUploaded(req, details);
                break;
            case 'tool_used':
                analytics.trackToolUsed(req, details);
                break;
            case 'document_saved':
                analytics.trackDocumentSaved(req, details);
                break;
            case 'document_exported':
                analytics.trackDocumentExported(req, details);
                break;
            case 'share_initiated':
                analytics.trackShareInitiated(req, details);
                break;
            case 'save_option_selected':
                analytics.trackSaveOptionSelected(req, details);
                break;
            default:
                analytics.trackEditorEvent(req, { event, ...details });
        }

        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

// Contact form submission endpoint
app.post('/api/v1/contact', express.json(), async (req, res) => {
    try {
        const { name, email, company, topic, message } = req.body;

        // Validate required fields
        if (!name || !email || !topic || !message) {
            return res.status(400).json({ error: 'Name, email, topic, and message are required' });
        }

        // Validate email
        if (!isValidEmail(email)) {
            return res.status(400).json({ error: 'Invalid email address' });
        }

        // Track contact form with enhanced analytics
        await analytics.trackContactForm(req, { name, email, company, topic, message });

        log.info('Contact form submitted', { email, topic });
        res.json({
            success: true,
            message: 'Thank you for your message! We\'ll get back to you within 4 hours during business hours.'
        });
    } catch (error) {
        log.error('Contact form error:', error.message);
        res.status(500).json({ error: 'Failed to submit contact form. Please try again.' });
    }
});

// ============================================================================
// Clean URL Routes (Sales-Friendly URLs)
// ============================================================================

// Main pages - clean URLs
app.get('/editor', (req, res) => {
    analytics.trackEditorOpened(req);
    res.sendFile(path.join(__dirname, 'public', 'pdf-editor-modular.html'));
});

app.get('/edit', (req, res) => {
    res.redirect(301, '/editor');
});

app.get('/pricing', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pricing.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.get('/security', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'security.html'));
});

// Resource pages
app.get('/help', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help.html'));
});

app.get('/docs', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'docs.html'));
});

app.get('/api', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'api.html'));
});

// Success pages - friendly names
app.get('/thank-you', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'payment-success.html'));
});

app.get('/welcome', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pro-success.html'));
});

// ============================================================================
// Legacy URL Redirects (301 Permanent)
// ============================================================================

app.get('/pdf-editor-modular.html', (req, res) => {
    res.redirect(301, '/editor');
});

app.get('/pricing.html', (req, res) => {
    res.redirect(301, '/pricing');
});

app.get('/about.html', (req, res) => {
    res.redirect(301, '/about');
});

app.get('/contact.html', (req, res) => {
    res.redirect(301, '/contact');
});

app.get('/privacy.html', (req, res) => {
    res.redirect(301, '/privacy');
});

app.get('/terms.html', (req, res) => {
    res.redirect(301, '/terms');
});

app.get('/security.html', (req, res) => {
    res.redirect(301, '/security');
});

app.get('/payment-success.html', (req, res) => {
    res.redirect(301, '/thank-you');
});

app.get('/pro-success.html', (req, res) => {
    res.redirect(301, '/welcome');
});

app.get('/index.html', (req, res) => {
    res.redirect(301, '/');
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'PDFOX is running' });
});

// ============================================================================
// Centralized Error Handling
// ============================================================================

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found'
    });
});

// Global error handler - MUST NOT expose internal details
app.use((err, req, res, next) => {
    // Log error details server-side only (not to client)
    log.error('Server Error:', err.message);

    // Determine status code
    const statusCode = err.status || err.statusCode || 500;

    // Generic error response - no stack traces or internal details
    res.status(statusCode).json({
        error: statusCode === 500 ? 'Internal Server Error' : err.message || 'An error occurred',
        message: 'Something went wrong. Please try again later.'
    });
});

// Start server
app.listen(PORT, () => {
    log.info(`PDFOX running on http://localhost:${PORT}`);
    log.info(`Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);

    // Log Stripe configuration (key prefix only for security)
    const keyPrefix = STRIPE_SECRET_KEY ? STRIPE_SECRET_KEY.substring(0, 7) : 'NOT SET';
    const keyType = keyPrefix.startsWith('sk_live') || keyPrefix.startsWith('rk_live') ? 'LIVE' :
                    keyPrefix.startsWith('sk_test') || keyPrefix.startsWith('rk_test') ? 'TEST' : 'UNKNOWN';
    log.info(`Stripe: ${keyType} mode (${keyPrefix}...)`);

    if (isProduction && keyType === 'TEST') {
        log.warn('Production environment using TEST Stripe keys!');
    }
    if (!isProduction && keyType === 'LIVE') {
        log.warn('Development environment using LIVE Stripe keys!');
    }

    log.info('Logging initialized', { logDir: path.join(__dirname, 'logs') });
});
