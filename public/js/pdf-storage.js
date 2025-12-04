/**
 * PDFOX PDF Storage Module
 * Handles large PDF storage using IndexedDB
 * Falls back to sessionStorage for small files
 */

const PDFStorage = (function() {
    'use strict';

    const DB_NAME = 'PDFoxStorage';
    const DB_VERSION = 1;
    const STORE_NAME = 'pdfs';
    const MAX_SESSION_STORAGE_SIZE = 4 * 1024 * 1024; // 4MB limit for sessionStorage

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
        // Always clear both storages first to ensure fresh state
        sessionStorage.removeItem('pdfToEdit');
        sessionStorage.removeItem('pdfFileName');
        sessionStorage.removeItem('pdfStorageType');
        await clearIndexedDB();

        // Try sessionStorage first for small files
        const dataSize = data.length;

        if (dataSize < MAX_SESSION_STORAGE_SIZE) {
            try {
                sessionStorage.setItem('pdfToEdit', data);
                sessionStorage.setItem('pdfFileName', fileName);
                sessionStorage.setItem('pdfStorageType', 'session');
                console.log('PDF stored in sessionStorage');
                return;
            } catch (e) {
                console.log('sessionStorage failed, falling back to IndexedDB');
            }
        }

        // Use IndexedDB for large files
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
                    // Mark that we're using IndexedDB
                    sessionStorage.setItem('pdfStorageType', 'indexeddb');
                    sessionStorage.setItem('pdfFileName', fileName);
                    console.log('PDF stored in IndexedDB');
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
        const storageType = sessionStorage.getItem('pdfStorageType');
        const fileName = sessionStorage.getItem('pdfFileName');

        if (storageType === 'session') {
            const data = sessionStorage.getItem('pdfToEdit');
            if (data) {
                return { data, fileName };
            }
        }

        if (storageType === 'indexeddb') {
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
                        reject(request.error);
                    };
                });
            } catch (error) {
                console.error('Failed to retrieve PDF from IndexedDB:', error);
                return null;
            }
        }

        // Legacy fallback - check sessionStorage directly
        const legacyData = sessionStorage.getItem('pdfToEdit');
        if (legacyData) {
            return { data: legacyData, fileName: fileName || 'document.pdf' };
        }

        return null;
    }

    /**
     * Clear stored PDF data
     * @returns {Promise<void>}
     */
    async function clearPDF() {
        sessionStorage.removeItem('pdfToEdit');
        sessionStorage.removeItem('pdfFileName');
        sessionStorage.removeItem('pdfStorageType');

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
        const fileName = sessionStorage.getItem('pdfFileName') || 'document.pdf';
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
