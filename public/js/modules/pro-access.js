/**
 * PDFOX Pro Access Module
 * Handles device fingerprinting, Pro status checking, and payment flow
 */

const PDFoxProAccess = (function() {
    'use strict';

    // Storage keys
    const STORAGE_KEY = 'pdfox_pro_access';
    const FINGERPRINT_KEY = 'pdfox_fingerprint';

    // State
    let fingerprint = null;
    let proStatus = {
        isPro: false,
        expiresAt: null,
        email: null
    };
    let fpPromise = null;

    /**
     * Initialize FingerprintJS and load Pro status
     */
    async function init() {
        try {
            // Initialize FingerprintJS
            fpPromise = import('https://openfpcdn.io/fingerprintjs/v4')
                .then(FingerprintJS => FingerprintJS.load());

            // Get fingerprint
            fingerprint = await getFingerprint();

            // Check Pro status
            await checkProStatus();

            console.log('Pro Access initialized:', { isPro: proStatus.isPro, fingerprint: fingerprint?.substring(0, 8) + '...' });

            return proStatus;
        } catch (error) {
            console.error('Error initializing Pro Access:', error);
            return { isPro: false };
        }
    }

    /**
     * Get device fingerprint
     */
    async function getFingerprint() {
        // Check cache first
        const cached = localStorage.getItem(FINGERPRINT_KEY);
        if (cached) {
            fingerprint = cached;
            return cached;
        }

        try {
            const fp = await fpPromise;
            const result = await fp.get();
            fingerprint = result.visitorId;

            // Cache fingerprint
            localStorage.setItem(FINGERPRINT_KEY, fingerprint);

            return fingerprint;
        } catch (error) {
            console.error('Error getting fingerprint:', error);
            // Fallback to random ID if fingerprinting fails
            fingerprint = 'fallback_' + Math.random().toString(36).substring(2, 15);
            localStorage.setItem(FINGERPRINT_KEY, fingerprint);
            return fingerprint;
        }
    }

    /**
     * Check Pro status from server and local storage
     */
    async function checkProStatus() {
        // First check local storage for cached token
        const stored = getStoredAccess();
        if (stored && stored.token && stored.expiresAt > Date.now()) {
            // Validate token with server
            try {
                const response = await fetch('/api/v1/pro/validate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token: stored.token,
                        fingerprint: fingerprint
                    })
                });

                const data = await response.json();

                if (data.valid) {
                    proStatus = {
                        isPro: true,
                        expiresAt: data.expiresAt,
                        email: data.email
                    };
                    updateCoreProStatus(true);
                    return proStatus;
                } else {
                    // Token invalid, clear storage
                    clearStoredAccess();
                }
            } catch (error) {
                console.error('Error validating token:', error);
            }
        }

        // Check by fingerprint (for returning users who cleared storage)
        try {
            const response = await fetch('/api/v1/pro/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fingerprint })
            });

            const data = await response.json();

            if (data.isPro) {
                proStatus = {
                    isPro: true,
                    expiresAt: data.expiresAt,
                    email: data.email
                };
                updateCoreProStatus(true);
                return proStatus;
            }
        } catch (error) {
            console.error('Error checking Pro status:', error);
        }

        proStatus = { isPro: false, expiresAt: null, email: null };
        updateCoreProStatus(false);
        return proStatus;
    }

    /**
     * Update the core module's isProUser state
     */
    function updateCoreProStatus(isPro) {
        if (typeof PDFoxCore !== 'undefined' && PDFoxCore.set) {
            PDFoxCore.set('isProUser', isPro);
        }
    }

    /**
     * Get stored Pro access from localStorage
     */
    function getStoredAccess() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Store Pro access in localStorage
     */
    function storeAccess(token, expiresAt, email) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                token,
                expiresAt,
                email,
                storedAt: Date.now()
            }));
        } catch (error) {
            console.error('Error storing Pro access:', error);
        }
    }

    /**
     * Clear stored Pro access
     */
    function clearStoredAccess() {
        localStorage.removeItem(STORAGE_KEY);
    }

    /**
     * Start Pro checkout flow
     */
    async function startCheckout(email) {
        if (!email || !email.includes('@')) {
            throw new Error('Valid email is required');
        }

        if (!fingerprint) {
            fingerprint = await getFingerprint();
        }

        try {
            const response = await fetch('/api/v1/pro/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    fingerprint
                })
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.expiresAt) {
                    // User already has Pro access
                    proStatus = {
                        isPro: true,
                        expiresAt: data.expiresAt,
                        email
                    };
                    updateCoreProStatus(true);
                    return { alreadyPro: true, expiresAt: data.expiresAt };
                }
                throw new Error(data.error || 'Failed to create checkout session');
            }

            // Redirect to Stripe Checkout
            if (data.url) {
                // Store email for post-payment verification
                sessionStorage.setItem('pro_checkout_email', email);
                window.location.href = data.url;
            }

            return data;
        } catch (error) {
            console.error('Error starting checkout:', error);
            throw error;
        }
    }

    /**
     * Verify payment after redirect from Stripe
     */
    async function verifyPayment(sessionId) {
        if (!fingerprint) {
            fingerprint = await getFingerprint();
        }

        try {
            const response = await fetch('/api/v1/pro/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    fingerprint
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Store token and update status
                storeAccess(data.token, data.expiresAt, data.email);
                proStatus = {
                    isPro: true,
                    expiresAt: data.expiresAt,
                    email: data.email
                };
                updateCoreProStatus(true);
                return { success: true, ...data };
            }

            throw new Error(data.error || 'Payment verification failed');
        } catch (error) {
            console.error('Error verifying payment:', error);
            throw error;
        }
    }

    /**
     * Recover Pro access using email and receipt number from payment receipt
     */
    async function recoverAccess(email, receiptNumber) {
        if (!email || !receiptNumber) {
            throw new Error('Email and receipt number are required');
        }

        if (!fingerprint) {
            fingerprint = await getFingerprint();
        }

        try {
            const response = await fetch('/api/v1/pro/recover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.trim(),
                    receiptNumber: receiptNumber.trim(),
                    fingerprint
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Store token and update status
                storeAccess(data.token, data.expiresAt, data.email);
                proStatus = {
                    isPro: true,
                    expiresAt: data.expiresAt,
                    email: data.email
                };
                updateCoreProStatus(true);
                return { success: true, ...data };
            }

            // Use friendly message if available, otherwise use error
            throw new Error(data.message || data.error || 'Recovery failed');
        } catch (error) {
            console.error('Error recovering Pro access:', error);
            throw error;
        }
    }

    /**
     * Get remaining Pro time in human-readable format
     */
    function getRemainingTime() {
        if (!proStatus.isPro || !proStatus.expiresAt) {
            return null;
        }

        const remaining = proStatus.expiresAt - Date.now();
        if (remaining <= 0) {
            return 'Expired';
        }

        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
            return `${hours}h ${minutes}m remaining`;
        }
        return `${minutes}m remaining`;
    }

    /**
     * Show Pro status badge in UI
     */
    function showProBadge() {
        // Remove existing badge if any
        const existing = document.getElementById('proBadge');
        if (existing) {
            existing.remove();
        }

        if (!proStatus.isPro) return;

        const badge = document.createElement('div');
        badge.id = 'proBadge';
        badge.innerHTML = `
            <span style="color: #4CAF50; margin-right: 4px;">&#10003;</span>
            PRO
            <span style="font-size: 10px; opacity: 0.8; margin-left: 6px;">${getRemainingTime()}</span>
        `;
        badge.style.cssText = `
            position: fixed;
            top: 12px;
            right: 120px;
            background: linear-gradient(135deg, rgba(229, 9, 20, 0.9) 0%, rgba(184, 7, 15, 0.9) 100%);
            color: white;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            z-index: 10001;
            display: flex;
            align-items: center;
            box-shadow: 0 2px 8px rgba(229, 9, 20, 0.4);
            cursor: default;
        `;

        document.body.appendChild(badge);

        // Update remaining time every minute
        setInterval(() => {
            const timeSpan = badge.querySelector('span:last-child');
            if (timeSpan) {
                const remaining = getRemainingTime();
                if (remaining === 'Expired') {
                    badge.remove();
                    proStatus.isPro = false;
                    updateCoreProStatus(false);
                } else {
                    timeSpan.textContent = remaining;
                }
            }
        }, 60000);
    }

    // Public API
    return {
        init,
        getFingerprint,
        checkProStatus,
        startCheckout,
        verifyPayment,
        recoverAccess,
        getRemainingTime,
        showProBadge,
        get isPro() { return proStatus.isPro; },
        get expiresAt() { return proStatus.expiresAt; },
        get email() { return proStatus.email; },
        get fingerprint() { return fingerprint; }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxProAccess;
}
