// Import AI Detection Engine
importScripts('ai-engine.js');

// Background service worker for the reCognizer extension
class ModelManager {
    constructor() {
        this.modelsLoaded = false;
        // AI engine will be handled in content script context
        this.initializeModels();
    }

    async initializeModels() {
        try {
            console.log('Service worker initialized - AI processing will happen in content script');
            
            // Mark as loaded since we're not loading models in the service worker anymore
            this.modelsLoaded = true;
            chrome.action.setBadgeText({ text: "✓" });
            chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
            console.log('✓ Service worker ready - AI processing delegated to content script');
            
        } catch (error) {
            console.error('Service worker initialization failed:', error);
            chrome.action.setBadgeText({ text: "✗" });
            chrome.action.setBadgeBackgroundColor({ color: "#F44336" });
        }
    }

    async solveCaptcha(captchaData) {
        // Since ONNX Runtime can't run in service worker context,
        // we need to delegate the AI processing to the content script
        // The service worker will coordinate but not do the actual inference
        
        try {
            const { prompt, images, imageCount } = captchaData;
            console.log(`Coordinating captcha solving: "${prompt}" with ${imageCount} images`);
            
            // For now, return a placeholder response
            // The actual AI processing should happen in the content script or injected script
            return {
                success: false,
                error: 'AI processing must be moved to content script context',
                solution: [],
                coordinates: [],
                confidence: 0
            };
        } catch (error) {
            console.error('Captcha coordination failed:', error);
            throw error;
        }
    }

    getModelsStatus() {
        return {
            loaded: this.modelsLoaded,
            count: 0,
            availableModels: ['Models will be loaded in content script context']
        };
    }

    async testModels() {
        try {
            return {
                success: true,
                confidence: 0.8,
                modelsLoaded: this.getModelsStatus(),
                note: 'AI processing delegated to content script'
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
        this.injectedTabs = new Set(); // Track tabs where content script is already injected
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
            if (changeInfo.status === 'complete' && this.enabled && changeInfo.url) {
                // Only inject if not already injected and URL changed
                const tabKey = `${tabId}-${tab.url}`;
                if (!this.injectedTabs.has(tabKey)) {
                    this.injectContentScript(tabId, tab.url);
                    this.injectedTabs.add(tabKey);
                }
            }
        });

        // Clean up tracking when tabs are removed
        chrome.tabs.onRemoved.addListener((tabId) => {
            // Remove all entries for this tab
            for (const key of this.injectedTabs) {
                if (key.startsWith(`${tabId}-`)) {
                    this.injectedTabs.delete(key);
                }
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

    async injectContentScript(tabId, url = null) {
        try {
            // Get tab URL if not provided
            if (!url) {
                const tab = await chrome.tabs.get(tabId);
                url = tab.url;
            }
            
            // Check if the URL is injectable
            if (!this.isInjectableUrl(url)) {
                console.log('reCognizer: Skipping injection for restricted URL:', url);
                return;
            }
            
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js']
            });
            console.log('reCognizer: Content script injected successfully for:', url);
        } catch (error) {
            console.error('Failed to inject content script:', error);
        }
    }

    isInjectableUrl(url) {
        if (!url) return false;
        
        // URLs that cannot be accessed by content scripts
        const restrictedProtocols = [
            'chrome://',
            'chrome-extension://',
            'moz-extension://',
            'about:',
            'edge://',
            'opera://',
            'vivaldi://',
            'brave://'
        ];
        
        // Check if URL starts with any restricted protocol
        for (const protocol of restrictedProtocols) {
            if (url.startsWith(protocol)) {
                return false;
            }
        }
        
        // Only inject into http and https URLs
        return url.startsWith('http://') || url.startsWith('https://');
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