/**
 * PDFOX Client-Side Analytics
 * Tracks page views and user interactions
 */

(function() {
    'use strict';

    // Track page view on load
    function trackPageView() {
        const page = window.location.pathname || '/';

        fetch('/api/v1/analytics/pageview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: page })
        }).catch(() => {});
    }

    // Track on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', trackPageView);
    } else {
        trackPageView();
    }
})();
