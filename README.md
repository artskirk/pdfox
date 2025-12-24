# PDFOX

Professional PDF Editing Without the Enterprise Price

## Overview

PDFOX is a premium PDF editing service that delivers enterprise-grade features at prices that make sense for real businesses. Built with cutting-edge AI technology and intuitive design.

## Features

- **AI-Powered OCR** - Transform locked PDFs into fully editable text
- **Smart Redaction** - Permanently remove sensitive data with military-grade security
- **Digital Signatures** - Close deals faster with secure electronic signatures
- **Advanced Text Editing** - Edit PDFs like Word documents
- **Cloud-Based & Secure** - Work anywhere with enterprise-grade encryption
- **Annotations & Drawing** - Collaborate with precision
- **Document Sharing** - Share documents with password protection and expiry

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| Backend | Node.js, Express.js |
| PDF Processing | pdf-lib, pdfjs-dist, pdf2pic |
| OCR Engine | Tesseract.js |
| Payments | Stripe |
| Process Manager | PM2 |
| Reverse Proxy | nginx |
| CDN/Security | Cloudflare |

### Project Structure

```
pdfox/
├── server.js              # Main Express server (API routes, middleware)
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables (not in git)
├── .env.example           # Environment template
│
├── bin/
│   └── console            # CLI admin tool
│
├── lib/
│   ├── analytics.js       # Telegram notifications & analytics
│   ├── logger.js          # Structured logging (Winston-style)
│   └── cli/               # CLI command modules
│
├── public/
│   ├── css/
│   │   └── pdf-editor.css # Main stylesheet
│   ├── js/
│   │   └── modules/       # Frontend JavaScript modules
│   │       ├── app.js           # Main application controller
│   │       ├── core.js          # State management & event bus
│   │       ├── annotations.js   # Drawing, shapes, canvas annotations
│   │       ├── text-editor.js   # Text editing functionality
│   │       ├── signatures.js    # Digital signature handling
│   │       ├── ocr.js           # OCR processing
│   │       ├── mobile-ui.js     # Mobile-specific UI/touch handling
│   │       ├── layers.js        # Layer management
│   │       ├── overlays.js      # Text overlay management
│   │       ├── pdf-renderer.js  # PDF rendering with pdf.js
│   │       ├── ui.js            # UI utilities & notifications
│   │       └── ...
│   └── pages/             # Static HTML pages
│
├── uploads/               # Temporary file uploads
├── outputs/               # Generated output files
├── logs/                  # Application logs
└── data/                  # Persistent data storage
```

### Frontend Architecture

The frontend follows a modular pattern with SOLID principles:

- **PDFoxCore** - Central state management and event bus (pub/sub pattern)
- **PDFoxApp** - Main application controller, tool management
- **PDFoxAnnotations** - Canvas-based drawing and annotations
- **PDFoxTextEditor** - Text editing with font/style support
- **PDFoxSignatures** - Digital signature creation and placement
- **MobileUI** - Touch gesture handling, responsive UI

### Backend Architecture

- **Express.js** server with REST API endpoints
- **Multer** for file upload handling
- **Stripe** integration for payments (test/live key switching)
- **JWT** for Pro access authentication
- **Structured logging** with environment-aware levels

## Environments

### Development (APP_ENV=dev)

- Debug mode enabled
- Stripe test keys used automatically
- Verbose logging
- Local IP detection

### Production (APP_ENV=prod)

- Debug mode disabled
- Stripe live keys used automatically
- Structured JSON logging
- Cloudflare IP detection (CF-Connecting-IP header)

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Application Environment
APP_ENV=dev                    # 'dev' or 'prod'
APP_DEBUG=0                    # 1 to enable debug mode

# Stripe (auto-selects based on APP_ENV)
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...
STRIPE_SECRET_KEY_LIVE=sk_live_...
STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Server
PORT=3000

# Payments
PAYMENT_AMOUNT=299             # File download price (cents)
PRO_PAYMENT_AMOUNT=899         # Pro access price (cents)
PAYMENT_CURRENCY=eur

# JWT for Pro Access
JWT_SECRET=your_secure_random_secret

# Google OAuth (optional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
```

## Development

### Prerequisites

- Node.js 20+
- npm

### Local Setup

```bash
# Clone repository
git clone https://github.com/artskirk/pdfox.git
cd pdfox

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Start development server
npm start

# Open http://localhost:3000
```

### CLI Admin Console

```bash
# Run CLI commands
npm run console

# Or directly
./bin/console

# Available commands
./bin/console env:show       # Show environment info
./bin/console logs:show      # View recent logs
./bin/console cache:clear    # Clear cache
```

## Deployment

### Production Server

- **Server**: Ubuntu 24.04
- **Domain**: pdfox.cloud
- **IP**: 46.62.238.177
- **Process Manager**: PM2
- **Reverse Proxy**: nginx
- **SSL**: Cloudflare (Full mode)

### CI/CD Pipeline

Automatic deployment on push to `main` branch via GitHub Actions:

1. Push to `main` triggers workflow
2. GitHub Actions connects via SSH
3. Pulls latest code from repository
4. Installs production dependencies
5. Reloads PM2 process

### Manual Deployment

```bash
# SSH to server
ssh root@46.62.238.177

# Navigate to project
cd /var/www/pdfox

# Pull latest changes
git pull origin main

# Install dependencies
npm install --omit=dev

# Reload application
pm2 reload pdfox --update-env
```

### Server Configuration

#### nginx (/etc/nginx/sites-available/pdfox)

```nginx
server {
    listen 80;
    server_name pdfox.cloud www.pdfox.cloud;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pdfox.cloud www.pdfox.cloud;

    ssl_certificate /etc/ssl/cloudflare/pdfox.crt;
    ssl_certificate_key /etc/ssl/cloudflare/pdfox.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }
}
```

#### PM2 Configuration

```bash
# Start application
pm2 start server.js --name pdfox

# Save PM2 configuration
pm2 save

# Setup startup script
pm2 startup
```

### GitHub Secrets Required

- `SSH_PRIVATE_KEY` - PEM format RSA private key for deployment

## Service Pages

| Page | Path | Description |
|------|------|-------------|
| Homepage | `/` | Feature showcase and social proof |
| PDF Editor | `/pdf-editor` | Main application |
| Pricing | `/pricing` | 3-tier pricing structure |
| About | `/about` | Mission and company values |
| Contact | `/contact` | Contact form |
| Help Center | `/help` | User documentation |
| API Docs | `/api` | API documentation |
| Privacy Policy | `/privacy` | GDPR/CCPA compliant |
| Terms of Service | `/terms` | Legal framework |
| Security | `/security` | Security details |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/convert` | Convert PDF to text/HTML/DOCX |
| POST | `/convert-free` | Free conversion (limited) |
| POST | `/ocr` | Process PDF with OCR |
| POST | `/save-pdf` | Save edited PDF |
| POST | `/create-payment-intent` | Create Stripe payment |
| POST | `/create-pro-payment` | Create Pro access payment |
| GET | `/verify-pro-token` | Verify JWT token |
| POST | `/share/create` | Create share link |
| GET | `/s/:shareId` | View shared document |

## Author

Artem Kirkor (artem.kirkor@gmail.com)

## License

Copyright 2025 PDFOX. All rights reserved.
