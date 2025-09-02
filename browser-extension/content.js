// Content script for detecting and solving reCAPTCHAs
// Prevent multiple declarations if script is injected more than once
if (typeof window.RecaptchaDetector === 'undefined') {
class RecaptchaDetector {
    constructor() {
        this.enabled = false;
        this.autoSolve = true;
        this.showDebug = false;
        this.isProcessing = false;
        this.observer = null;
        this.processedRecaptchas = new Set(); // Track processed reCAPTCHAs to avoid duplicates
        this.init();
    }

    async init() {
        try {
            // Get extension status
            const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
            this.enabled = status.enabled;
            this.autoSolve = status.autoSolve;
            this.showDebug = status.showDebug;

            if (this.enabled) {
                this.startDetection();
            }
        } catch (error) {
            console.error('reCognizer: Failed to initialize:', error);
            // Continue with default settings if background script is not available
            this.enabled = false;
            this.autoSolve = true;
            this.showDebug = false;
        }
    }

    async loadAIEngine() {
        if (this.aiEngine) {
            return this.aiEngine;
        }

        try {
            // Load ONNX Runtime in content script context where dynamic imports work
            const ort = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/esm/ort.min.js');
            
            // Configure ONNX Runtime
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';
            ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
            
            // Load AI engine script and create instance
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('ai-engine.js');
            document.head.appendChild(script);
            
            // Wait for script to load
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
            });
            
            // Create AI engine instance with ONNX Runtime
            this.aiEngine = new window.AIDetectionEngine(ort);
            await this.aiEngine.initialize();
            
            return this.aiEngine;
        } catch (error) {
            console.error('reCognizer: Failed to load AI engine:', error);
            console.log('reCognizer: AI solving disabled due to loading failure. Manual solving still available.');
            
            // Return a mock AI engine that indicates AI is unavailable
            this.aiEngine = {
                detect: () => Promise.resolve({
                    success: false,
                    error: 'AI engine unavailable due to CSP or loading restrictions'
                }),
                initialize: () => Promise.resolve(false)
            };
            
            return this.aiEngine;
        }
    }

    startDetection() {
        if (this.showDebug) {
            console.log('reCognizer: Starting reCAPTCHA detection');
        }

        // Initial scan
        this.scanForRecaptchas();

        // Set up mutation observer for dynamic content
        this.observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (let node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (this.isRecaptchaElement(node) || node.querySelector('[data-sitekey]') ||
                                node.querySelector('.g-recaptcha') || node.querySelector('#recaptcha-anchor')) {
                                shouldScan = true;
                                break;
                            }
                        }
                    }
                }
            });

            if (shouldScan) {
                setTimeout(() => this.scanForRecaptchas(), 1000); // Delay to allow full loading
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    scanForRecaptchas() {
        if (this.isProcessing) return;

        // Look for different types of reCAPTCHAs and collect all unique elements
        const selectors = [
            '.g-recaptcha',
            '[data-sitekey]',
            '#recaptcha-anchor',
            'iframe[src*="recaptcha"]',
            '.recaptcha-checkbox',
            '[data-callback]'
        ];

        const allElements = new Set();
        
        // Collect all elements from all selectors, Set automatically deduplicates
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => allElements.add(el));
        }

        if (allElements.size > 0) {
            if (this.showDebug) {
                console.log(`reCognizer: Found ${allElements.size} unique reCAPTCHA element(s)`);
            }
            allElements.forEach(el => this.handleRecaptcha(el));
        }

        // Look for challenge iframes (the actual puzzle part)
        const challengeFrames = document.querySelectorAll('iframe[src*="bframe"]');
        challengeFrames.forEach(frame => this.handleChallengeFrame(frame));

        if (allElements.size > 0 && this.showDebug) {
            this.addDebugOverlay(`Found ${allElements.size} unique reCAPTCHA(s)`);
        }
    }

    isRecaptchaElement(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
        
        const indicators = [
            'recaptcha',
            'g-recaptcha',
            'data-sitekey',
            'data-callback'
        ];

        return indicators.some(indicator => 
            element.className.toLowerCase().includes(indicator) ||
            element.id.toLowerCase().includes(indicator) ||
            element.hasAttribute(indicator) ||
            element.outerHTML.toLowerCase().includes(indicator)
        );
    }

    async handleRecaptcha(element) {
        if (this.isProcessing) return;

        // Generate unique identifier for this reCAPTCHA element
        const elementId = this.getElementIdentifier(element);
        if (this.processedRecaptchas.has(elementId)) {
            if (this.showDebug) {
                console.log('reCognizer: Skipping already processed reCAPTCHA:', elementId);
            }
            return;
        }

        // Mark as processed to prevent duplicates
        this.processedRecaptchas.add(elementId);

        try {
            if (this.showDebug) {
                console.log('reCognizer: Processing reCAPTCHA element:', element);
                this.highlightElement(element);
            }

            // Check if it's a checkbox reCAPTCHA first
            const checkbox = element.querySelector('#recaptcha-anchor') || 
                            document.querySelector('#recaptcha-anchor');
            
            if (checkbox && !checkbox.checked) {
                if (this.autoSolve) {
                    await this.clickCheckbox(checkbox);
                }
                return;
            }

            // Look for challenge images
            await this.waitForChallengeImages();
            
        } catch (error) {
            console.error('reCognizer: Error handling reCAPTCHA:', error);
            // Remove from processed set if there was an error, so it can be retried
            this.processedRecaptchas.delete(elementId);
        }
    }

    getElementIdentifier(element) {
        // Generate a unique identifier for the element based on multiple attributes
        const rect = element.getBoundingClientRect();
        const attributes = [
            element.tagName,
            element.id,
            element.className,
            element.getAttribute('data-sitekey') || '',
            element.getAttribute('data-callback') || '',
            Math.round(rect.top),
            Math.round(rect.left),
            Math.round(rect.width),
            Math.round(rect.height)
        ];
        return attributes.join('|');
    }

    async handleChallengeFrame(frame) {
        if (this.isProcessing) return;

        try {
            if (this.showDebug) {
                console.log('reCognizer: Found challenge frame:', frame);
            }

            // Wait a bit for the frame to load
            await this.sleep(2000);
            
            // Try to access frame content (may be blocked by CORS)
            try {
                const frameDoc = frame.contentDocument || frame.contentWindow.document;
                if (frameDoc) {
                    this.processChallengeContent(frameDoc);
                }
            } catch (corsError) {
                console.log('reCognizer: Cannot access frame content due to CORS, using alternative method');
                // Use message passing or other techniques for cross-origin frames
                this.handleCorsFrame(frame);
            }

        } catch (error) {
            console.error('reCognizer: Error handling challenge frame:', error);
        }
    }

    async clickCheckbox(checkbox) {
        if (this.showDebug) {
            console.log('reCognizer: Clicking reCAPTCHA checkbox');
            this.addDebugOverlay('Clicking reCAPTCHA checkbox...');
        }

        // Simulate human-like click
        const rect = checkbox.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        // Add small random offset to appear more human
        const offsetX = Math.random() * 10 - 5;
        const offsetY = Math.random() * 10 - 5;

        checkbox.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: x + offsetX,
            clientY: y + offsetY
        }));

        await this.sleep(50 + Math.random() * 100);

        checkbox.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            clientX: x + offsetX,
            clientY: y + offsetY
        }));

        checkbox.click();

        // Wait for potential challenge to appear
        await this.sleep(1000);
        await this.waitForChallengeImages();
    }

    async waitForChallengeImages() {
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            const challengeImages = this.findChallengeImages();
            if (challengeImages.length > 0) {
                if (this.showDebug) {
                    console.log(`reCognizer: Found ${challengeImages.length} challenge images`);
                }
                await this.solveChallengeImages(challengeImages);
                return;
            }
            attempts++;
            await this.sleep(500);
        }

        if (this.showDebug) {
            console.log('reCognizer: No challenge images found after waiting');
        }
    }

    findChallengeImages() {
        const selectors = [
            'img[src*="payload"]',
            '.rc-image-tile-wrapper img',
            '.rc-imageselect-tile img',
            'table img[src*="recaptcha"]',
            '.rc-canvas-image img'
        ];

        let images = [];
        for (const selector of selectors) {
            const found = document.querySelectorAll(selector);
            images = images.concat(Array.from(found));
        }

        // Also check in iframes
        const frames = document.querySelectorAll('iframe[src*="bframe"]');
        frames.forEach(frame => {
            try {
                const frameDoc = frame.contentDocument;
                if (frameDoc) {
                    for (const selector of selectors) {
                        const found = frameDoc.querySelectorAll(selector);
                        images = images.concat(Array.from(found));
                    }
                }
            } catch (e) {
                // CORS blocked
            }
        });

        return images;
    }

    async solveChallengeImages(images) {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            if (this.showDebug) {
                this.addDebugOverlay(`Analyzing ${images.length} challenge images...`);
            }

            // Extract challenge prompt
            const prompt = this.extractChallengePrompt();
            if (!prompt) {
                console.error('reCognizer: Could not find challenge prompt');
                return;
            }

            if (this.showDebug) {
                console.log('reCognizer: Challenge prompt:', prompt);
            }

            // Convert images to base64 for processing
            const imageData = await this.extractImageData(images);

            // Load AI engine in content script context since service workers can't use dynamic imports
            const aiEngine = await this.loadAIEngine();
            const response = await aiEngine.detect(prompt, imageData, imageData.length === 16);

            if (response.success) {
                if (this.showDebug) {
                    console.log('reCognizer: AI solution received:', response);
                    this.addDebugOverlay(`Solution found! Confidence: ${Math.round(response.confidence * 100)}%`);
                }
                
                await this.clickSolution(images, response.solution, response.coordinates);
            } else {
                console.error('reCognizer: Failed to solve challenge:', response.error);
                if (this.showDebug) {
                    this.addDebugOverlay('Failed to solve challenge');
                }
            }

        } catch (error) {
            console.error('reCognizer: Error solving challenge images:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    extractChallengePrompt() {
        const selectors = [
            '.rc-imageselect-instructions-select',
            '.rc-imageselect-instructions',
            '.rc-imageselect-desc-wrapper strong',
            '[data-testid="instructions"] strong',
            '.rc-imageselect-desc strong'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                return element.textContent.trim();
            }
        }

        // Check in iframes
        const frames = document.querySelectorAll('iframe[src*="bframe"]');
        for (const frame of frames) {
            try {
                const frameDoc = frame.contentDocument;
                if (frameDoc) {
                    for (const selector of selectors) {
                        const element = frameDoc.querySelector(selector);
                        if (element && element.textContent.trim()) {
                            return element.textContent.trim();
                        }
                    }
                }
            } catch (e) {
                // CORS blocked
            }
        }

        return null;
    }

    async extractImageData(images) {
        const imageDataArray = [];
        
        for (const img of images) {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Wait for image to load if not already loaded
                if (!img.complete) {
                    await new Promise((resolve) => {
                        img.onload = resolve;
                        img.onerror = resolve;
                    });
                }

                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                ctx.drawImage(img, 0, 0);
                
                const dataUrl = canvas.toDataURL('image/png');
                imageDataArray.push({
                    dataUrl: dataUrl,
                    element: img,
                    index: imageDataArray.length
                });
            } catch (error) {
                console.error('reCognizer: Failed to extract image data:', error);
            }
        }

        return imageDataArray;
    }

    async clickSolution(images, solution, coordinates) {
        if (!solution || !Array.isArray(solution)) return;

        for (let i = 0; i < solution.length; i++) {
            if (solution[i] && images[i]) {
                await this.clickImage(images[i], coordinates[i]);
                await this.sleep(300 + Math.random() * 200); // Human-like delay
            }
        }

        // Look for and click the verify/submit button
        await this.sleep(500);
        const submitButton = this.findSubmitButton();
        if (submitButton) {
            if (this.showDebug) {
                console.log('reCognizer: Clicking submit button');
            }
            submitButton.click();
        }
    }

    async clickImage(img, coordinates) {
        if (this.showDebug) {
            this.highlightElement(img, '#4CAF50');
        }

        const rect = img.getBoundingClientRect();
        let x, y;

        if (coordinates) {
            x = rect.left + coordinates[0];
            y = rect.top + coordinates[1];
        } else {
            x = rect.left + rect.width / 2;
            y = rect.top + rect.height / 2;
        }

        // Add small random offset
        x += Math.random() * 20 - 10;
        y += Math.random() * 20 - 10;

        img.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
        }));

        await this.sleep(50 + Math.random() * 100);

        img.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
        }));

        img.click();
    }

    findSubmitButton() {
        const selectors = [
            '#recaptcha-verify-button',
            '.rc-button-default',
            'button[type="submit"]',
            'input[value="Verify"]',
            '.rc-imageselect-verify'
        ];

        for (const selector of selectors) {
            const button = document.querySelector(selector);
            if (button) return button;
        }

        // Check in iframes
        const frames = document.querySelectorAll('iframe[src*="bframe"]');
        for (const frame of frames) {
            try {
                const frameDoc = frame.contentDocument;
                if (frameDoc) {
                    for (const selector of selectors) {
                        const button = frameDoc.querySelector(selector);
                        if (button) return button;
                    }
                }
            } catch (e) {
                // CORS blocked
            }
        }

        return null;
    }

    handleCorsFrame(frame) {
        // Inject script into the frame to handle CORS restrictions
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('inject.js');
        frame.parentElement.appendChild(script);
    }

    processChallengeContent(doc) {
        // Process content within accessible frame
        const images = doc.querySelectorAll('img[src*="payload"]');
        if (images.length > 0) {
            this.solveChallengeImages(Array.from(images));
        }
    }

    highlightElement(element, color = '#FF5722') {
        if (!this.showDebug) return;
        
        element.style.outline = `3px solid ${color}`;
        element.style.outlineOffset = '2px';
        
        setTimeout(() => {
            element.style.outline = '';
            element.style.outlineOffset = '';
        }, 3000);
    }

    addDebugOverlay(message) {
        if (!this.showDebug) return;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #333;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 10000;
            font-family: Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        overlay.textContent = `reCognizer: ${message}`;
        document.body.appendChild(overlay);

        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 5000);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    stop() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        // Clear processed reCAPTCHAs when stopping
        this.processedRecaptchas.clear();
    }
}

// Store the class globally to prevent redeclaration
window.RecaptchaDetector = RecaptchaDetector;
}

// Initialize detector when content script loads
// Use a global variable to prevent multiple instances across script injections
if (typeof window.recaptchaDetector === 'undefined') {
    window.recaptchaDetector = null;
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STATUS_UPDATE') {
        if (message.enabled && !window.recaptchaDetector) {
            window.recaptchaDetector = new window.RecaptchaDetector();
        } else if (!message.enabled && window.recaptchaDetector) {
            window.recaptchaDetector.stop();
            window.recaptchaDetector = null;
        }
    }
});

// Auto-start if page is already loaded and no detector exists
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.recaptchaDetector) {
            window.recaptchaDetector = new window.RecaptchaDetector();
        }
    });
} else {
    if (!window.recaptchaDetector) {
        window.recaptchaDetector = new window.RecaptchaDetector();
    }
}