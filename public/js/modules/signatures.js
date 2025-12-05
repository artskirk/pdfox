/**
 * PDFOX Signatures Module
 * Handles signature creation, placement, and management
 * Single Responsibility: Signature operations
 */

const PDFoxSignatures = (function() {
    'use strict';

    const core = PDFoxCore;
    const ui = PDFoxUI;
    const { generateId } = PDFoxUtils;

    // Signature state
    let signaturePad = null;
    let currentSignatureImage = null;
    let selectedSignatureFont = 'Dancing Script';
    let selectedSignature = null;

    /**
     * Initialize signature pad
     */
    function initializeSignaturePad() {
        const canvas = document.getElementById('signatureCanvas');
        if (!signaturePad && canvas && window.SignaturePad) {
            signaturePad = new SignaturePad(canvas, {
                backgroundColor: 'rgba(0, 0, 0, 0)',
                penColor: 'rgb(0, 0, 0)',
                minWidth: 1,
                maxWidth: 2.5
            });
        }
    }

    /**
     * Detect background color from image edges
     * @param {Uint8ClampedArray} data - Image data
     * @param {number} width - Image width
     * @param {number} height - Image height
     * @returns {Object} RGB color
     */
    function detectBackgroundColor(data, width, height) {
        const samples = [];
        const sampleSize = 5;

        // Sample edges
        for (let x = 0; x < width; x += Math.floor(width / sampleSize)) {
            const i = (0 * width + x) * 4;
            samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
        }

        for (let x = 0; x < width; x += Math.floor(width / sampleSize)) {
            const i = ((height - 1) * width + x) * 4;
            samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
        }

        for (let y = 0; y < height; y += Math.floor(height / sampleSize)) {
            const i = (y * width + 0) * 4;
            samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
        }

        for (let y = 0; y < height; y += Math.floor(height / sampleSize)) {
            const i = (y * width + (width - 1)) * 4;
            samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
        }

        // Calculate average
        const avgR = samples.reduce((sum, s) => sum + s.r, 0) / samples.length;
        const avgG = samples.reduce((sum, s) => sum + s.g, 0) / samples.length;
        const avgB = samples.reduce((sum, s) => sum + s.b, 0) / samples.length;

        return { r: avgR, g: avgG, b: avgB };
    }

    /**
     * Remove background from signature image
     * @param {HTMLImageElement} img - Image element
     * @returns {Promise<string>} Data URL
     */
    async function removeBackgroundFromImage(img) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const bgColor = detectBackgroundColor(data, canvas.width, canvas.height);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            const colorDistance = Math.sqrt(
                Math.pow(r - bgColor.r, 2) +
                Math.pow(g - bgColor.g, 2) +
                Math.pow(b - bgColor.b, 2)
            );

            if (colorDistance < 60) {
                data[i + 3] = 0;
            } else if (colorDistance < 90) {
                const alpha = ((colorDistance - 60) / 30) * 255;
                data[i + 3] = Math.min(data[i + 3], alpha);
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/png');
    }

    /**
     * Add white background to signature
     * @param {string} dataURL - Signature data URL
     * @returns {Promise<string>} Data URL with white background
     */
    function addWhiteBackgroundToSignature(dataURL) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                canvas.width = img.width;
                canvas.height = img.height;

                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);

                resolve(canvas.toDataURL('image/png'));
            };
            img.src = dataURL;
        });
    }

    /**
     * Create typed signature as image
     * @param {string} text - Signature text
     * @returns {Promise<string>} Data URL
     */
    async function createTypedSignature(text) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = 600;
        canvas.height = 150;

        const colorInput = document.getElementById('typeSignatureColor');
        const color = colorInput ? colorInput.value : '#000000';
        ctx.font = `64px '${selectedSignatureFont}', cursive`;
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';

        const metrics = ctx.measureText(text);
        const x = (canvas.width - metrics.width) / 2;
        const y = canvas.height / 2;

        ctx.fillText(text, x, y);

        return canvas.toDataURL('image/png');
    }

    /**
     * Render signatures on overlay layer
     */
    function renderSignatures() {
        const overlayLayer = document.getElementById('overlayLayer');
        if (!overlayLayer) return;

        const currentPage = core.get('currentPage');
        const signatures = core.get('signatures');

        // Clear existing signatures for current page
        overlayLayer.querySelectorAll('.signature-overlay').forEach(el => el.remove());

        // Render signatures for current page
        signatures.filter(sig => sig.page === currentPage).forEach(signature => {
            const sigElement = document.createElement('div');
            sigElement.className = 'signature-overlay';
            sigElement.style.cssText = `
                position: absolute;
                left: ${signature.x}px;
                top: ${signature.y}px;
                width: ${signature.width}px;
                height: ${signature.height}px;
                cursor: move;
                box-sizing: border-box;
            `;

            if (selectedSignature === signature) {
                sigElement.style.border = '2px solid #DC1F26';
                sigElement.style.boxShadow = '0 0 10px rgba(220, 31, 38, 0.5)';
            } else {
                sigElement.style.border = '2px dashed rgba(220, 31, 38, 0.5)';
            }

            sigElement.dataset.signatureId = signature.id;

            // Click handler for selection
            sigElement.addEventListener('click', (e) => {
                e.stopPropagation();
                selectSignature(signature);
            });

            const img = document.createElement('img');
            img.src = signature.image;
            img.style.cssText = 'width: 100%; height: 100%; pointer-events: none;';
            sigElement.appendChild(img);

            // Resize handle
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'signature-resize-handle';
            resizeHandle.style.cssText = `
                position: absolute;
                right: -5px;
                bottom: -5px;
                width: 12px;
                height: 12px;
                background-color: #DC1F26;
                border: 2px solid #FFFFFF;
                border-radius: 50%;
                cursor: nwse-resize;
                z-index: 10;
                box-shadow: 0 0 4px rgba(0,0,0,0.3);
            `;
            sigElement.appendChild(resizeHandle);

            overlayLayer.appendChild(sigElement);

            // Make draggable and resizable
            makeSignatureDraggable(sigElement, signature);
            makeSignatureResizable(resizeHandle, sigElement, signature);
        });
    }

    /**
     * Select a signature
     * @param {Object} signature - Signature object
     */
    function selectSignature(signature) {
        selectedSignature = signature;
        core.set('selectedSignature', signature);
        renderSignatures();
    }

    /**
     * Make signature draggable
     * @param {HTMLElement} element - Signature element
     * @param {Object} signature - Signature data
     */
    function makeSignatureDraggable(element, signature) {
        let isDragging = false;
        let startX, startY, initialX, initialY;

        element.addEventListener('mousedown', (e) => {
            const currentTool = core.get('currentTool');
            if (currentTool !== 'editText' && currentTool !== 'moveText') return;
            if (e.target.classList.contains('signature-resize-handle')) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = signature.x;
            initialY = signature.y;
            e.preventDefault();
        });

        const onMouseMove = (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            signature.x = initialX + dx;
            signature.y = initialY + dy;

            element.style.left = signature.x + 'px';
            element.style.top = signature.y + 'px';
        };

        const onMouseUp = () => {
            isDragging = false;
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    /**
     * Make signature resizable
     * @param {HTMLElement} resizeHandle - Resize handle element
     * @param {HTMLElement} element - Signature element
     * @param {Object} signature - Signature data
     */
    function makeSignatureResizable(resizeHandle, element, signature) {
        let isResizing = false;
        let startX, startWidth;
        const aspectRatio = signature.height / signature.width;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = signature.width;
            e.stopPropagation();
            e.preventDefault();
        });

        const onMouseMove = (e) => {
            if (!isResizing) return;

            const dx = e.clientX - startX;
            let newWidth = startWidth + dx;

            if (newWidth < 50) newWidth = 50;

            const pdfCanvas = document.getElementById('pdfCanvas');
            const maxWidth = pdfCanvas.width - signature.x - 20;
            if (newWidth > maxWidth) newWidth = maxWidth;

            signature.width = newWidth;
            signature.height = newWidth * aspectRatio;

            element.style.width = newWidth + 'px';
            element.style.height = signature.height + 'px';
        };

        const onMouseUp = () => {
            isResizing = false;
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    return {
        /**
         * Initialize signatures module
         */
        init() {
            // Subscribe to events
            core.on('signatures:changed', () => renderSignatures());
            core.on('page:rendered', () => renderSignatures());

            core.on('layer:delete', (layer) => {
                if (layer.type === 'signature') {
                    this.deleteSignature(layer.signatureIndex);
                }
            });

            // Deselect on document click
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.signature-overlay') && selectedSignature) {
                    selectedSignature = null;
                    core.set('selectedSignature', null);
                    renderSignatures();
                }
            });

            // Delete key handler
            document.addEventListener('keydown', (e) => {
                if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSignature) {
                    if (document.activeElement.tagName !== 'INPUT' &&
                        document.activeElement.tagName !== 'TEXTAREA') {
                        this.deleteSelected();
                        e.preventDefault();
                    }
                }
            });
        },

        /**
         * Open signature modal
         */
        openModal() {
            const modal = document.getElementById('signatureModal');
            if (modal) {
                modal.style.display = 'flex';
                if (!signaturePad) {
                    setTimeout(() => initializeSignaturePad(), 100);
                }
                this.switchTab('draw');
            }
        },

        /**
         * Close signature modal
         */
        closeModal() {
            const modal = document.getElementById('signatureModal');
            if (modal) {
                modal.style.display = 'none';
            }

            if (signaturePad) {
                signaturePad.clear();
            }

            const typeInput = document.getElementById('typeSignatureInput');
            if (typeInput) typeInput.value = '';

            const fileInput = document.getElementById('signatureFileInput');
            if (fileInput) fileInput.value = '';

            const previewContainer = document.getElementById('signaturePreviewContainer');
            if (previewContainer) previewContainer.style.display = 'none';

            currentSignatureImage = null;
        },

        /**
         * Switch signature tab
         * @param {string} tabName - Tab name
         */
        switchTab(tabName) {
            document.querySelectorAll('.signature-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            const activeTab = document.querySelector(`.signature-tab[data-tab="${tabName}"]`);
            if (activeTab) activeTab.classList.add('active');

            document.querySelectorAll('.signature-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            const tabContent = document.getElementById(`signatureTab-${tabName}`);
            if (tabContent) tabContent.classList.add('active');

            if (tabName === 'draw' && !signaturePad) {
                setTimeout(() => initializeSignaturePad(), 100);
            }
        },

        /**
         * Clear signature canvas
         */
        clearCanvas() {
            if (signaturePad) {
                signaturePad.clear();
            }
        },

        /**
         * Select signature font
         * @param {HTMLElement} element - Font option element
         * @param {string} fontName - Font name
         */
        selectFont(element, fontName) {
            document.querySelectorAll('.font-option').forEach(option => {
                option.classList.remove('selected');
            });
            element.classList.add('selected');
            selectedSignatureFont = fontName;
            this.updateTypedPreview();
        },

        /**
         * Update typed signature preview
         */
        updateTypedPreview() {
            const input = document.getElementById('typeSignatureInput');
            const text = input ? input.value : 'Signature';
            document.querySelectorAll('.font-option span').forEach(span => {
                span.textContent = text || 'Signature';
            });
        },

        /**
         * Handle signature file upload
         * @param {Event} event - File input event
         */
        async handleUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                ui.showAlert('File size exceeds 5MB limit', 'error');
                return;
            }

            if (!file.type.match('image/(png|jpeg)')) {
                ui.showAlert('Please upload a PNG or JPG image', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const img = new Image();
                    img.onload = async function() {
                        const processedDataURL = await removeBackgroundFromImage(img);

                        const previewImg = document.getElementById('signaturePreviewImg');
                        if (previewImg) previewImg.src = processedDataURL;

                        const previewContainer = document.getElementById('signaturePreviewContainer');
                        if (previewContainer) previewContainer.style.display = 'block';

                        currentSignatureImage = processedDataURL;
                    };
                    img.src = e.target.result;
                } catch (error) {
                    console.error('Failed to process image:', error);
                    ui.showAlert('Sorry, we couldn\'t process this image. Please try a different file.', 'error');
                }
            };
            reader.readAsDataURL(file);
        },

        /**
         * Apply signature to PDF
         */
        async apply() {
            let signatureDataURL = null;

            const activeTab = document.querySelector('.signature-tab.active');
            const tabName = activeTab ? activeTab.dataset.tab : 'draw';

            if (tabName === 'draw') {
                if (!signaturePad || signaturePad.isEmpty()) {
                    ui.showAlert('Please draw your signature first', 'warning');
                    return;
                }
                signatureDataURL = signaturePad.toDataURL('image/png');

                const transparentBg = document.getElementById('signatureTransparentBg');
                if (transparentBg && !transparentBg.checked) {
                    signatureDataURL = await addWhiteBackgroundToSignature(signatureDataURL);
                }
            } else if (tabName === 'type') {
                const typedText = document.getElementById('typeSignatureInput');
                if (!typedText || !typedText.value.trim()) {
                    ui.showAlert('Please type your signature first', 'warning');
                    return;
                }
                signatureDataURL = await createTypedSignature(typedText.value.trim());
            } else if (tabName === 'upload') {
                if (!currentSignatureImage) {
                    ui.showAlert('Please upload a signature image first', 'warning');
                    return;
                }
                signatureDataURL = currentSignatureImage;
            }

            this.closeModal();
            this.addToPage(signatureDataURL);
        },

        /**
         * Add signature to current page
         * @param {string} signatureDataURL - Signature image data URL
         */
        addToPage(signatureDataURL) {
            const img = new Image();
            img.onload = () => {
                const signature = {
                    id: generateId('signature'),
                    image: signatureDataURL,
                    x: 100,
                    y: 100,
                    width: 200,
                    height: (img.height / img.width) * 200,
                    page: core.get('currentPage')
                };

                core.push('signatures', signature);
                core.addToHistory({
                    type: 'signature',
                    data: signature
                });

                ui.showAlert('Signature added! Drag to reposition.', 'success');
            };
            img.src = signatureDataURL;
        },

        /**
         * Delete selected signature
         */
        deleteSelected() {
            if (!selectedSignature) return;

            const signatures = core.get('signatures');
            const index = signatures.findIndex(sig => sig === selectedSignature);
            if (index !== -1) {
                core.removeAt('signatures', index);
                selectedSignature = null;
                core.set('selectedSignature', null);
                ui.showNotification('Signature deleted', 'success');
            }
        },

        /**
         * Delete signature by index
         * @param {number} index - Signature index
         */
        deleteSignature(index) {
            core.removeAt('signatures', index);
            if (selectedSignature) {
                selectedSignature = null;
                core.set('selectedSignature', null);
            }
            ui.showNotification('Signature deleted', 'success');
        },

        /**
         * Render signatures
         */
        render: renderSignatures,

        /**
         * Get selected signature
         * @returns {Object|null}
         */
        getSelected() {
            return selectedSignature;
        }
    };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFoxSignatures;
}
