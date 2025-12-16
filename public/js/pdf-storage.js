/**
 * PDFOX PDF Storage Module
 * Handles PDF storage using IndexedDB for persistence across browser sessions
 * Uses localStorage for metadata to survive browser close
 */

const PDFStorage = (function() {
    'use strict';

    const DB_NAME = 'PDFoxStorage';
    const DB_VERSION = 1;
    const STORE_NAME = 'pdfs';
    const STORAGE_KEY = 'pdfox_pdf_meta'; // localStorage key for metadata

    let db = null;

    /**
     * Initialize IndexedDB
     * @returns {Promise<IDBDatabase>}
     */
    function initDB() {
        return new Promise((resolve, reject) => {
            if (db) {
                resolve(db);
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }

    /**
     * Clear IndexedDB storage
     * @returns {Promise<void>}
     */
    async function clearIndexedDB() {
        try {
            const database = await initDB();
            return new Promise((resolve, reject) => {
                const transaction = database.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.delete('currentPDF');
                request.onsuccess = () => resolve();
                request.onerror = () => resolve(); // Ignore errors on clear
            });
        } catch (error) {
            // Ignore errors on clear
        }
    }

    /**
     * Store PDF data
     * @param {string} data - Base64 PDF data
     * @param {string} fileName - Original file name
     * @returns {Promise<void>}
     */
    async function storePDF(data, fileName) {
        // Clear previous storage
        await clearIndexedDB();
        // Clear legacy sessionStorage
        sessionStorage.removeItem('pdfToEdit');
        sessionStorage.removeItem('pdfFileName');
        sessionStorage.removeItem('pdfStorageType');

        // Always use IndexedDB for persistence across browser sessions
        try {
            const database = await initDB();

            return new Promise((resolve, reject) => {
                const transaction = database.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);

                const pdfData = {
                    id: 'currentPDF',
                    data: data,
                    fileName: fileName,
                    timestamp: Date.now()
                };

                const request = store.put(pdfData);

                request.onsuccess = () => {
                    // Store metadata in localStorage (persists across browser sessions)
                    localStorage.setItem(STORAGE_KEY, JSON.stringify({
                        fileName: fileName,
                        timestamp: Date.now(),
                        stored: true
                    }));
                    console.log('PDF stored in IndexedDB (persistent)');
                    resolve();
                };

                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('Failed to store PDF:', error);
            throw error;
        }
    }

    /**
     * Retrieve PDF data
     * @returns {Promise<{data: string, fileName: string}|null>}
     */
    async function retrievePDF() {
        // Check localStorage metadata first
        const metaStr = localStorage.getItem(STORAGE_KEY);

        if (metaStr) {
            try {
                const meta = JSON.parse(metaStr);
                if (meta.stored) {
                    // Retrieve from IndexedDB
                    const database = await initDB();

                    return new Promise((resolve, reject) => {
                        const transaction = database.transaction([STORE_NAME], 'readonly');
                        const store = transaction.objectStore(STORE_NAME);
                        const request = store.get('currentPDF');

                        request.onsuccess = () => {
                            if (request.result) {
                                console.log('PDF retrieved from IndexedDB (persistent)');
                                resolve({
                                    data: request.result.data,
                                    fileName: request.result.fileName
                                });
                            } else {
                                // Data missing, clear metadata
                                localStorage.removeItem(STORAGE_KEY);
                                resolve(null);
                            }
                        };

                        request.onerror = () => {
                            reject(request.error);
                        };
                    });
                }
            } catch (error) {
                console.error('Failed to parse PDF metadata:', error);
                localStorage.removeItem(STORAGE_KEY);
            }
        }

        // Legacy fallback - check sessionStorage (for backward compatibility)
        const legacyStorageType = sessionStorage.getItem('pdfStorageType');
        if (legacyStorageType === 'session') {
            const data = sessionStorage.getItem('pdfToEdit');
            const fileName = sessionStorage.getItem('pdfFileName');
            if (data) {
                return { data, fileName: fileName || 'document.pdf' };
            }
        }

        // Also try IndexedDB directly for legacy indexeddb storage
        if (legacyStorageType === 'indexeddb') {
            try {
                const database = await initDB();

                return new Promise((resolve, reject) => {
                    const transaction = database.transaction([STORE_NAME], 'readonly');
                    const store = transaction.objectStore(STORE_NAME);
                    const request = store.get('currentPDF');

                    request.onsuccess = () => {
                        if (request.result) {
                            resolve({
                                data: request.result.data,
                                fileName: request.result.fileName
                            });
                        } else {
                            resolve(null);
                        }
                    };

                    request.onerror = () => {
                        resolve(null);
                    };
                });
            } catch (error) {
                console.error('Failed to retrieve PDF from IndexedDB:', error);
            }
        }

        return null;
    }

    /**
     * Clear stored PDF data
     * @returns {Promise<void>}
     */
    async function clearPDF() {
        // Clear localStorage metadata
        localStorage.removeItem(STORAGE_KEY);

        // Clear legacy sessionStorage
        sessionStorage.removeItem('pdfToEdit');
        sessionStorage.removeItem('pdfFileName');
        sessionStorage.removeItem('pdfStorageType');

        // Clear IndexedDB
        try {
            const database = await initDB();

            return new Promise((resolve, reject) => {
                const transaction = database.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.delete('currentPDF');

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('Failed to clear PDF from IndexedDB:', error);
        }
    }

    /**
     * Update stored PDF data (for modifications like rotate/delete page)
     * @param {string} data - New base64 PDF data
     * @returns {Promise<void>}
     */
    async function updatePDF(data) {
        // Get filename from localStorage metadata or fallback
        let fileName = 'document.pdf';
        const metaStr = localStorage.getItem(STORAGE_KEY);
        if (metaStr) {
            try {
                const meta = JSON.parse(metaStr);
                fileName = meta.fileName || fileName;
            } catch (e) {}
        }
        // Legacy fallback
        if (!fileName || fileName === 'document.pdf') {
            fileName = sessionStorage.getItem('pdfFileName') || 'document.pdf';
        }
        return storePDF(data, fileName);
    }

    return {
        store: storePDF,
        retrieve: retrievePDF,
        clear: clearPDF,
        update: updatePDF,
        init: initDB
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFStorage;
}
