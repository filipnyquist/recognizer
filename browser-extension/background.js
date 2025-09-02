// Import AI Detection Engine
importScripts('ai-engine.js');

// Background service worker for the reCognizer extension
class ModelManager {
    constructor() {
        this.modelsLoaded = false;
        this.aiEngine = null;
        this.initializeModels();
    }

    async initializeModels() {
        try {
            console.log('Initializing AI detection engine...');
            
            // Create and initialize AI engine
            this.aiEngine = new AIDetectionEngine();
            const success = await this.aiEngine.initialize();
            
            if (success) {
                this.modelsLoaded = true;
                chrome.action.setBadgeText({ text: "✓" });
                chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
                console.log('✓ AI detection engine initialized successfully');
            } else {
                throw new Error('AI engine initialization failed');
            }
        } catch (error) {
            console.error('Failed to initialize AI engine:', error);
            chrome.action.setBadgeText({ text: "✗" });
            chrome.action.setBadgeBackgroundColor({ color: "#F44336" });
        }
    }

    async solveCaptcha(captchaData) {
        if (!this.aiEngine) {
            throw new Error('AI engine not initialized');
        }

        try {
            const { prompt, images, imageCount } = captchaData;
            const areaCapcha = imageCount === 16;
            
            console.log(`Solving captcha: "${prompt}" with ${imageCount} images`);
            
            // Convert image data format
            const imageDataUrls = images.map(img => img.dataUrl);
            
            // Run AI detection
            const result = await this.aiEngine.detect(prompt, images, areaCapcha);
            
            return result;
        } catch (error) {
            console.error('AI detection failed:', error);
            throw error;
        }
    }

    getModelsStatus() {
        if (this.aiEngine) {
            return this.aiEngine.getStatus();
        }
        
        return {
            loaded: this.modelsLoaded,
            count: 0,
            availableModels: []
        };
    }

    async testModels() {
        if (!this.aiEngine) {
            return { success: false, error: 'AI engine not initialized' };
        }

        try {
            // Create test data
            const testPrompt = "bicycle";
            const testImages = [{
                dataUrl: this.createTestImage(),
                index: 0
            }];

            // Test detection
            const result = await this.aiEngine.detect(testPrompt, testImages, false);
            
            return {
                success: result.success,
                confidence: result.confidence,
                modelsLoaded: this.getModelsStatus()
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    createTestImage() {
        // Create a simple test image (100x100 white canvas)
        const canvas = new OffscreenCanvas(100, 100);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 100, 100);
        
        // Add some basic shapes to make it look like content
        ctx.fillStyle = '#000000';
        ctx.fillRect(25, 25, 50, 50);
        
        return canvas.convertToBlob({ type: 'image/png' }).then(blob => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        });
    }
}

class ExtensionManager {
    constructor() {
        this.enabled = false;
        this.autoSolve = true;
        this.showDebug = false;
        this.solvedCount = 0;
        this.modelManager = new ModelManager();
        this.loadSettings();
        this.setupListeners();
    }

    async loadSettings() {
        const result = await chrome.storage.sync.get([
            'enabled', 'autoSolve', 'showDebug', 'solvedCount'
        ]);
        
        this.enabled = result.enabled || false;
        this.autoSolve = result.autoSolve !== false; // default true
        this.showDebug = result.showDebug || false;
        this.solvedCount = result.solvedCount || 0;
    }

    async saveSettings() {
        await chrome.storage.sync.set({
            enabled: this.enabled,
            autoSolve: this.autoSolve,
            showDebug: this.showDebug,
            solvedCount: this.solvedCount
        });
    }

    setupListeners() {
        // Listen for messages from content scripts
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async response
        });

        // Listen for extension icon click
        chrome.action.onClicked.addListener((tab) => {
            this.toggleExtension();
        });

        // Listen for tab updates to inject content script if needed
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && this.enabled) {
                this.injectContentScript(tabId);
            }
        });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'GET_STATUS':
                    sendResponse({
                        enabled: this.enabled,
                        autoSolve: this.autoSolve,
                        showDebug: this.showDebug,
                        solvedCount: this.solvedCount,
                        modelsStatus: this.modelManager.getModelsStatus()
                    });
                    break;

                case 'TOGGLE_EXTENSION':
                    this.enabled = !this.enabled;
                    await this.saveSettings();
                    sendResponse({ enabled: this.enabled });
                    break;

                case 'UPDATE_SETTING':
                    if (message.setting && message.value !== undefined) {
                        this[message.setting] = message.value;
                        await this.saveSettings();
                        sendResponse({ success: true });
                    }
                    break;

                case 'SOLVE_CAPTCHA':
                    const result = await this.solveCaptcha(message.data);
                    if (result.success) {
                        this.solvedCount++;
                        await this.saveSettings();
                    }
                    sendResponse(result);
                    break;

                case 'TEST_MODELS':
                    const testResult = await this.testModels();
                    sendResponse(testResult);
                    break;

                default:
                    sendResponse({ error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ error: error.message });
        }
    }

    async toggleExtension() {
        this.enabled = !this.enabled;
        await this.saveSettings();
        
        // Update badge
        if (this.enabled) {
            chrome.action.setBadgeText({ text: "ON" });
            chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
        } else {
            chrome.action.setBadgeText({ text: "OFF" });
            chrome.action.setBadgeBackgroundColor({ color: "#9E9E9E" });
        }
    }

    async injectContentScript(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js']
            });
        } catch (error) {
            console.error('Failed to inject content script:', error);
        }
    }

    async solveCaptcha(captchaData) {
        try {
            console.log('Solving captcha with AI engine:', captchaData);
            
            const result = await this.modelManager.solveCaptcha(captchaData);
            return result;
        } catch (error) {
            console.error('Error solving captcha:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async testModels() {
        try {
            return await this.modelManager.testModels();
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Initialize the extension
const extensionManager = new ExtensionManager();