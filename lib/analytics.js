/**
 * PDFOX Analytics Module
 * Real-time user activity notifications via Telegram
 */

const https = require('https');
const crypto = require('crypto');

// Visitor session tracking
const visitorSessions = new Map(); // { visitorId: { firstSeen, lastSeen, events, geo } }
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

/**
 * Generate a unique, readable visitor ID from IP + User-Agent
 */
function generateVisitorId(ip, userAgent) {
    const hash = crypto.createHash('md5')
        .update(`${ip}:${userAgent || ''}`)
        .digest('hex');

    // Create a readable ID: first 3 chars uppercase + last 4 chars
    return `${hash.substring(0, 3).toUpperCase()}-${hash.substring(hash.length - 4).toUpperCase()}`;
}

/**
 * Get or create visitor session
 */
function getVisitorSession(visitorId, geo = null) {
    const now = Date.now();
    let session = visitorSessions.get(visitorId);

    if (!session) {
        session = {
            firstSeen: now,
            lastSeen: now,
            eventCount: 0,
            isNew: true,
            geo: geo
        };
        visitorSessions.set(visitorId, session);
    } else {
        session.isNew = false;
        session.lastSeen = now;
        if (geo && !session.geo) session.geo = geo;
    }

    session.eventCount++;

    // Cleanup old sessions periodically
    if (visitorSessions.size > 500) {
        const cutoff = now - SESSION_TIMEOUT;
        for (const [id, s] of visitorSessions.entries()) {
            if (s.lastSeen < cutoff) visitorSessions.delete(id);
        }
    }

    return session;
}

// Event types with emoji indicators
const EVENT_TYPES = {
    // Visits
    PAGE_VIEW: { emoji: '👁', label: 'Page View' },
    NEW_VISITOR: { emoji: '👤', label: 'New Visitor' },
    RETURNING_VISITOR: { emoji: '🔄', label: 'Returning Visitor' },

    // Conversions
    PAYMENT_STARTED: { emoji: '💳', label: 'Payment Started' },
    PAYMENT_COMPLETED: { emoji: '✅', label: 'Payment Completed' },
    PRO_ACTIVATED: { emoji: '⭐', label: 'Pro Activated' },

    // Engagement
    EDITOR_OPENED: { emoji: '📝', label: 'Editor Opened' },
    DOCUMENT_CONVERTED: { emoji: '📄', label: 'Document Converted' },
    DOCUMENT_SHARED: { emoji: '🔗', label: 'Document Shared' },

    // Editor Actions
    FILE_UPLOADED: { emoji: '📤', label: 'File Uploaded' },
    TOOL_USED: { emoji: '🔧', label: 'Tool Used' },
    DOCUMENT_SAVED: { emoji: '💾', label: 'Document Saved' },
    DOCUMENT_EXPORTED: { emoji: '📥', label: 'Document Exported' },
    SHARE_INITIATED: { emoji: '🔗', label: 'Share Initiated' },
    SAVE_OPTION_SELECTED: { emoji: '🎯', label: 'Save Option Selected' },

    // Communication
    CONTACT_FORM: { emoji: '📩', label: 'Contact Form' },

    // System
    ERROR: { emoji: '🚨', label: 'Error' },
    SYSTEM: { emoji: '⚙️', label: 'System' }
};

// Device type detection
function getDeviceType(userAgent) {
    if (!userAgent) return { type: 'Unknown', emoji: '❓' };

    const ua = userAgent.toLowerCase();

    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
        return { type: 'Mobile', emoji: '📱' };
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
        return { type: 'Tablet', emoji: '📲' };
    }
    if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
        return { type: 'Bot', emoji: '🤖' };
    }
    return { type: 'Desktop', emoji: '💻' };
}

// Browser detection
function getBrowser(userAgent) {
    if (!userAgent) return 'Unknown';

    const ua = userAgent.toLowerCase();

    if (ua.includes('edg/')) return 'Edge';
    if (ua.includes('chrome') && !ua.includes('edg')) return 'Chrome';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
    if (ua.includes('opera') || ua.includes('opr')) return 'Opera';
    if (ua.includes('msie') || ua.includes('trident')) return 'IE';

    return 'Other';
}

// OS detection
function getOS(userAgent) {
    if (!userAgent) return 'Unknown';

    const ua = userAgent.toLowerCase();

    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('mac os') || ua.includes('macos')) return 'macOS';
    if (ua.includes('linux') && !ua.includes('android')) return 'Linux';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'iOS';

    return 'Other';
}

// Get country from IP using free geolocation
async function getGeoLocation(ip) {
    // Skip for localhost/private IPs
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.includes('::ffff:127')) {
        return { country: 'Local', countryCode: '🏠', city: 'Development', region: 'Local' };
    }

    // Clean IP address
    const cleanIP = ip.replace('::ffff:', '');

    return new Promise((resolve) => {
        const options = {
            hostname: 'ip-api.com',
            path: `/json/${cleanIP}?fields=status,country,countryCode,regionName,city`,
            method: 'GET',
            timeout: 3000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.status === 'success') {
                        resolve({
                            country: json.country || 'Unknown',
                            countryCode: getCountryFlag(json.countryCode),
                            city: json.city || 'Unknown',
                            region: json.regionName || 'Unknown'
                        });
                    } else {
                        resolve({ country: 'Unknown', countryCode: '🌍', city: 'Unknown', region: 'Unknown' });
                    }
                } catch {
                    resolve({ country: 'Unknown', countryCode: '🌍', city: 'Unknown', region: 'Unknown' });
                }
            });
        });

        req.on('error', () => {
            resolve({ country: 'Unknown', countryCode: '🌍', city: 'Unknown', region: 'Unknown' });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ country: 'Unknown', countryCode: '🌍', city: 'Unknown', region: 'Unknown' });
        });

        req.end();
    });
}

// Convert country code to flag emoji
function getCountryFlag(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌍';

    const offset = 127397;
    const chars = countryCode.toUpperCase().split('');
    return String.fromCodePoint(...chars.map(c => c.charCodeAt(0) + offset));
}

// Format timestamp
function formatTime() {
    return new Date().toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// Session tracking (in-memory, simple rate limiting)
const recentVisits = new Map();
const VISIT_COOLDOWN = 30 * 60 * 1000; // 30 minutes between same-IP visit notifications

function shouldNotifyVisit(ip) {
    const lastVisit = recentVisits.get(ip);
    const now = Date.now();

    if (lastVisit && (now - lastVisit) < VISIT_COOLDOWN) {
        return false;
    }

    recentVisits.set(ip, now);

    // Cleanup old entries
    if (recentVisits.size > 1000) {
        const cutoff = now - VISIT_COOLDOWN;
        for (const [key, time] of recentVisits.entries()) {
            if (time < cutoff) recentVisits.delete(key);
        }
    }

    return true;
}

/**
 * Analytics Notifier Class
 */
class AnalyticsNotifier {
    constructor(options = {}) {
        this.botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
        this.channelId = options.channelId || process.env.TELEGRAM_CHANNEL_ID;
        this.enabled = !!(this.botToken && this.channelId);
        this.debug = options.debug || false;
        this.queue = [];
        this.processing = false;
    }

    /**
     * Send message to Telegram
     */
    async send(message) {
        if (!this.enabled) {
            if (this.debug) console.log('[Analytics] Telegram not configured');
            return false;
        }

        return new Promise((resolve) => {
            const data = JSON.stringify({
                chat_id: this.channelId,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });

            const options = {
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${this.botToken}/sendMessage`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve(res.statusCode === 200));
            });

            req.on('error', () => resolve(false));
            req.setTimeout(10000, () => {
                req.destroy();
                resolve(false);
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * Build user info block with visitor ID
     */
    buildUserInfo(req) {
        const ip = req.ip || req.connection?.remoteAddress || 'Unknown';
        const userAgent = req.headers['user-agent'] || '';
        const referer = req.headers['referer'] || req.headers['referrer'] || 'Direct';

        const device = getDeviceType(userAgent);
        const browser = getBrowser(userAgent);
        const os = getOS(userAgent);

        // Generate visitor ID
        const visitorId = generateVisitorId(ip, userAgent);

        return { ip, userAgent, referer, device, browser, os, visitorId };
    }

    /**
     * Build visitor header for notifications
     */
    buildVisitorHeader(visitorId, session) {
        const badge = session.isNew ? '🆕 NEW' : `#${session.eventCount}`;
        return `👤 <b>Visitor:</b> <code>${visitorId}</code> ${badge}`;
    }

    /**
     * Track page view
     */
    async trackPageView(req, pageName) {
        const userInfo = this.buildUserInfo(req);

        // Rate limit page view notifications
        if (!shouldNotifyVisit(userInfo.ip)) {
            return;
        }

        const geo = await getGeoLocation(userInfo.ip);
        const session = getVisitorSession(userInfo.visitorId, geo);
        const visitorHeader = this.buildVisitorHeader(userInfo.visitorId, session);

        const message = `
${EVENT_TYPES.PAGE_VIEW.emoji} <b>PAGE VIEW</b>
━━━━━━━━━━━━━━━━━━━━
${visitorHeader}

📍 <b>Page:</b> ${pageName}
${geo.countryCode} <b>Location:</b> ${geo.city}, ${geo.country}
${userInfo.device.emoji} <b>Device:</b> ${userInfo.device.type}
🌐 <b>Browser:</b> ${userInfo.browser} / ${userInfo.os}
🔗 <b>Referrer:</b> ${this.truncate(userInfo.referer, 50)}

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Track payment initiated
     */
    async trackPaymentStarted(req, details = {}) {
        const userInfo = this.buildUserInfo(req);
        const geo = await getGeoLocation(userInfo.ip);
        const session = getVisitorSession(userInfo.visitorId, geo);
        const visitorHeader = this.buildVisitorHeader(userInfo.visitorId, session);

        const message = `
${EVENT_TYPES.PAYMENT_STARTED.emoji} <b>PAYMENT STARTED</b>
━━━━━━━━━━━━━━━━━━━━
${visitorHeader}

💰 <b>Product:</b> ${details.product || 'Pro Access'}
💵 <b>Amount:</b> €${((details.amount || 899) / 100).toFixed(2)}
📧 <b>Email:</b> ${details.email || 'N/A'}

${geo.countryCode} <b>Location:</b> ${geo.city}, ${geo.country}
${userInfo.device.emoji} <b>Device:</b> ${userInfo.device.type} (${userInfo.browser})

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Track payment completed
     */
    async trackPaymentCompleted(details = {}) {
        const message = `
${EVENT_TYPES.PAYMENT_COMPLETED.emoji} <b>PAYMENT COMPLETED</b>
━━━━━━━━━━━━━━━━━━━━
💰 <b>Product:</b> ${details.product || 'Pro Access'}
💵 <b>Amount:</b> €${((details.amount || 899) / 100).toFixed(2)}
📧 <b>Email:</b> ${details.email || 'N/A'}
🧾 <b>Receipt:</b> <code>${details.receiptNumber || 'N/A'}</code>

✨ <b>Status:</b> SUCCESS

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Track Pro access activation
     */
    async trackProActivated(req, details = {}) {
        const userInfo = this.buildUserInfo(req);
        const geo = await getGeoLocation(userInfo.ip);
        const session = getVisitorSession(userInfo.visitorId, geo);
        const visitorHeader = this.buildVisitorHeader(userInfo.visitorId, session);

        const expiresAt = details.expiresAt
            ? new Date(details.expiresAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })
            : '24 hours';

        const message = `
${EVENT_TYPES.PRO_ACTIVATED.emoji} <b>PRO ACCESS ACTIVATED</b>
━━━━━━━━━━━━━━━━━━━━
${visitorHeader}

📧 <b>Email:</b> ${details.email || 'N/A'}
⏰ <b>Expires:</b> ${expiresAt}
${geo.countryCode} <b>Location:</b> ${geo.city}, ${geo.country}
${userInfo.device.emoji} <b>Device:</b> ${userInfo.device.type}

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Track editor opened
     */
    async trackEditorOpened(req) {
        const userInfo = this.buildUserInfo(req);

        // Rate limit
        if (!shouldNotifyVisit(userInfo.ip + '_editor')) {
            return;
        }

        const geo = await getGeoLocation(userInfo.ip);
        const session = getVisitorSession(userInfo.visitorId, geo);
        const visitorHeader = this.buildVisitorHeader(userInfo.visitorId, session);

        const message = `
${EVENT_TYPES.EDITOR_OPENED.emoji} <b>EDITOR OPENED</b>
━━━━━━━━━━━━━━━━━━━━
${visitorHeader}

${geo.countryCode} <b>Location:</b> ${geo.city}, ${geo.country}
${userInfo.device.emoji} <b>Device:</b> ${userInfo.device.type}
🌐 <b>Browser:</b> ${userInfo.browser} / ${userInfo.os}

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Track document conversion
     */
    async trackDocumentConverted(req, details = {}) {
        const userInfo = this.buildUserInfo(req);
        const geo = await getGeoLocation(userInfo.ip);
        const session = getVisitorSession(userInfo.visitorId, geo);
        const visitorHeader = this.buildVisitorHeader(userInfo.visitorId, session);

        const message = `
${EVENT_TYPES.DOCUMENT_CONVERTED.emoji} <b>DOCUMENT CONVERTED</b>
━━━━━━━━━━━━━━━━━━━━
${visitorHeader}

📁 <b>Format:</b> PDF → ${(details.format || 'txt').toUpperCase()}
📊 <b>Size:</b> ${details.characterCount ? `${details.characterCount.toLocaleString()} chars` : 'N/A'}
${geo.countryCode} <b>Location:</b> ${geo.city}, ${geo.country}
${userInfo.device.emoji} <b>Device:</b> ${userInfo.device.type}

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Track document shared
     */
    async trackDocumentShared(req, details = {}) {
        const userInfo = this.buildUserInfo(req);
        const geo = await getGeoLocation(userInfo.ip);
        const session = getVisitorSession(userInfo.visitorId, geo);
        const visitorHeader = this.buildVisitorHeader(userInfo.visitorId, session);

        const message = `
${EVENT_TYPES.DOCUMENT_SHARED.emoji} <b>DOCUMENT SHARED</b>
━━━━━━━━━━━━━━━━━━━━
${visitorHeader}

📄 <b>File:</b> ${this.truncate(details.fileName || 'document.pdf', 30)}
🔒 <b>Protected:</b> ${details.hasPassword ? 'Yes' : 'No'}
🔗 <b>Share URL:</b> <code>/s/${details.hash || 'N/A'}</code>
${geo.countryCode} <b>Location:</b> ${geo.city}, ${geo.country}

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Track contact form (enhanced version)
     */
    async trackContactForm(req, details = {}) {
        const userInfo = this.buildUserInfo(req);
        const geo = await getGeoLocation(userInfo.ip);
        const session = getVisitorSession(userInfo.visitorId, geo);
        const visitorHeader = this.buildVisitorHeader(userInfo.visitorId, session);

        const topicLabels = {
            'sales': '💼 Enterprise Sales',
            'support': '🛠️ Technical Support',
            'billing': '💳 Billing Question',
            'feature': '💡 Feature Request',
            'partnership': '🤝 Partnership',
            'other': '📝 Other'
        };

        const message = `
${EVENT_TYPES.CONTACT_FORM.emoji} <b>NEW MESSAGE</b>
━━━━━━━━━━━━━━━━━━━━
${visitorHeader}

👤 <b>Name:</b> ${details.name || 'N/A'}
📧 <b>Email:</b> ${details.email || 'N/A'}
🏢 <b>Company:</b> ${details.company || 'Not provided'}
📋 <b>Topic:</b> ${topicLabels[details.topic] || details.topic}

💬 <b>Message:</b>
<i>${this.truncate(details.message || '', 200)}</i>

${geo.countryCode} <b>Location:</b> ${geo.city}, ${geo.country}
${userInfo.device.emoji} <b>Device:</b> ${userInfo.device.type}

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Track error
     */
    async trackError(error, context = {}) {
        const message = `
${EVENT_TYPES.ERROR.emoji} <b>ERROR ALERT</b>

⚠️ <b>Type:</b> ${error.name || 'Error'}
📍 <b>Context:</b> ${context.location || 'Unknown'}
💬 <b>Message:</b> ${this.truncate(error.message || 'Unknown error', 150)}

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Send system notification
     */
    async systemNotification(title, message) {
        const formatted = `
${EVENT_TYPES.SYSTEM.emoji} <b>${title.toUpperCase()}</b>

${message}

<code>${formatTime()}</code>`.trim();

        await this.send(formatted);
    }

    /**
     * Track file upload in editor
     */
    async trackFileUploaded(req, details = {}) {
        const userInfo = this.buildUserInfo(req);
        const geo = await getGeoLocation(userInfo.ip);
        const session = getVisitorSession(userInfo.visitorId, geo);
        const visitorHeader = this.buildVisitorHeader(userInfo.visitorId, session);

        const message = `
${EVENT_TYPES.FILE_UPLOADED.emoji} <b>FILE UPLOADED</b>
━━━━━━━━━━━━━━━━━━━━
${visitorHeader}

📄 <b>File:</b> ${this.truncate(details.fileName || 'document.pdf', 40)}
📊 <b>Size:</b> ${details.fileSize || 'N/A'}
📑 <b>Pages:</b> ${details.pageCount || 'N/A'}

${geo.countryCode} <b>Location:</b> ${geo.city}, ${geo.country}
${userInfo.device.emoji} <b>Device:</b> ${userInfo.device.type}

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Track tool usage in editor
     */
    async trackToolUsed(req, details = {}) {
        const userInfo = this.buildUserInfo(req);
        const session = getVisitorSession(userInfo.visitorId);
        const visitorHeader = this.buildVisitorHeader(userInfo.visitorId, session);

        // Tool category emojis
        const toolEmojis = {
            'text': '✏️',
            'highlight': '🖍️',
            'underline': '📝',
            'strikethrough': '✂️',
            'draw': '🖌️',
            'shape': '⬜',
            'arrow': '➡️',
            'stamp': '🔖',
            'signature': '✍️',
            'image': '🖼️',
            'whiteout': '⬜',
            'comment': '💬',
            'link': '🔗',
            'zoom': '🔍',
            'rotate': '🔄',
            'undo': '↩️',
            'redo': '↪️',
            'default': '🔧'
        };

        const toolEmoji = toolEmojis[details.tool?.toLowerCase()] || toolEmojis.default;

        const message = `
${toolEmoji} <b>TOOL USED</b>
━━━━━━━━━━━━━━━━━━━━
${visitorHeader}

🔧 <b>Tool:</b> ${details.tool || 'Unknown'}
📍 <b>Action:</b> ${details.action || 'Used'}

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Track document save
     */
    async trackDocumentSaved(req, details = {}) {
        const userInfo = this.buildUserInfo(req);
        const geo = await getGeoLocation(userInfo.ip);
        const session = getVisitorSession(userInfo.visitorId, geo);
        const visitorHeader = this.buildVisitorHeader(userInfo.visitorId, session);

        const message = `
${EVENT_TYPES.DOCUMENT_SAVED.emoji} <b>DOCUMENT SAVED</b>
━━━━━━━━━━━━━━━━━━━━
${visitorHeader}

📄 <b>File:</b> ${this.truncate(details.fileName || 'document.pdf', 40)}
📊 <b>Size:</b> ${details.fileSize || 'N/A'}
${geo.countryCode} <b>Location:</b> ${geo.city}, ${geo.country}

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Track document export
     */
    async trackDocumentExported(req, details = {}) {
        const userInfo = this.buildUserInfo(req);
        const geo = await getGeoLocation(userInfo.ip);
        const session = getVisitorSession(userInfo.visitorId, geo);
        const visitorHeader = this.buildVisitorHeader(userInfo.visitorId, session);

        const message = `
${EVENT_TYPES.DOCUMENT_EXPORTED.emoji} <b>DOCUMENT EXPORTED</b>
━━━━━━━━━━━━━━━━━━━━
${visitorHeader}

📄 <b>File:</b> ${this.truncate(details.fileName || 'document.pdf', 40)}
📁 <b>Format:</b> ${details.format || 'PDF'}
${geo.countryCode} <b>Location:</b> ${geo.city}, ${geo.country}

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Track share initiated
     */
    async trackShareInitiated(req, details = {}) {
        const userInfo = this.buildUserInfo(req);
        const geo = await getGeoLocation(userInfo.ip);
        const session = getVisitorSession(userInfo.visitorId, geo);
        const visitorHeader = this.buildVisitorHeader(userInfo.visitorId, session);

        const message = `
${EVENT_TYPES.SHARE_INITIATED.emoji} <b>SHARE INITIATED</b>
━━━━━━━━━━━━━━━━━━━━
${visitorHeader}

📄 <b>File:</b> ${this.truncate(details.fileName || 'document.pdf', 40)}
🔒 <b>Method:</b> ${details.method || 'Share Dialog'}
${geo.countryCode} <b>Location:</b> ${geo.city}, ${geo.country}

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Track save option selected (Get Pro Access, Save for Free, Restore Access)
     */
    async trackSaveOptionSelected(req, details = {}) {
        const userInfo = this.buildUserInfo(req);
        const geo = await getGeoLocation(userInfo.ip);
        const session = getVisitorSession(userInfo.visitorId, geo);
        const visitorHeader = this.buildVisitorHeader(userInfo.visitorId, session);

        // Different emoji based on the action
        const actionEmojis = {
            'Get Pro Access': '💎',
            'Save for Free': '📄',
            'Restore Access': '🔑'
        };
        const actionEmoji = actionEmojis[details.action] || '🎯';

        const message = `
${actionEmoji} <b>SAVE OPTION: ${(details.action || 'Unknown').toUpperCase()}</b>
━━━━━━━━━━━━━━━━━━━━
${visitorHeader}

📄 <b>File:</b> ${this.truncate(details.fileName || 'document.pdf', 40)}
🎯 <b>Action:</b> ${details.action || 'Unknown'}
${geo.countryCode} <b>Location:</b> ${geo.city}, ${geo.country}

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Track generic editor event
     */
    async trackEditorEvent(req, details = {}) {
        const userInfo = this.buildUserInfo(req);
        const session = getVisitorSession(userInfo.visitorId);
        const visitorHeader = this.buildVisitorHeader(userInfo.visitorId, session);

        const eventEmojis = {
            'click': '👆',
            'button': '🔘',
            'menu': '📋',
            'dialog': '💬',
            'feature': '⚡',
            'default': '📌'
        };

        const emoji = eventEmojis[details.category?.toLowerCase()] || eventEmojis.default;

        const message = `
${emoji} <b>EDITOR EVENT</b>
━━━━━━━━━━━━━━━━━━━━
${visitorHeader}

📌 <b>Event:</b> ${details.event || 'Unknown'}
📍 <b>Target:</b> ${details.target || 'N/A'}

<code>${formatTime()}</code>`.trim();

        await this.send(message);
    }

    /**
     * Truncate text
     */
    truncate(text, maxLength) {
        if (!text) return 'N/A';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}

module.exports = { AnalyticsNotifier, EVENT_TYPES };
