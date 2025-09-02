// Injected script to handle CORS-protected reCAPTCHA frames
(function() {
    'use strict';

    // Only run if we're in a reCAPTCHA frame
    if (!window.location.href.includes('recaptcha') && !window.location.href.includes('bframe')) {
        return;
    }

    class RecaptchaFrameHandler {
        constructor() {
            this.init();
        }

        init() {
            // Wait for the frame to be fully loaded
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setupHandler());
            } else {
                this.setupHandler();
            }
        }

        setupHandler() {
            // Listen for messages from parent window
            window.addEventListener('message', (event) => {
                if (event.data.type === 'RECAPTCHA_EXTRACT_DATA') {
                    this.extractChallengeData();
                }
            });

            // Auto-detect when challenge appears
            this.observeForChallenge();

            // Send initial status
            this.sendToParent({
                type: 'RECAPTCHA_FRAME_READY',
                url: window.location.href
            });
        }

        observeForChallenge() {
            const observer = new MutationObserver((mutations) => {
                let challengeFound = false;
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        const images = document.querySelectorAll('img[src*="payload"], .rc-image-tile-wrapper img');
                        if (images.length > 0) {
                            challengeFound = true;
                        }
                    }
                });

                if (challengeFound) {
                    setTimeout(() => this.extractChallengeData(), 1000);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        extractChallengeData() {
            const data = {
                type: 'RECAPTCHA_CHALLENGE_DATA',
                prompt: this.getPrompt(),
                images: this.getImageData(),
                hasChallenge: this.hasChallenge()
            };

            this.sendToParent(data);
        }

        getPrompt() {
            const selectors = [
                '.rc-imageselect-instructions-select',
                '.rc-imageselect-instructions',
                '.rc-imageselect-desc-wrapper strong',
                '.rc-imageselect-desc strong',
                'strong'
            ];

            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    return element.textContent.trim();
                }
            }

            return null;
        }

        getImageData() {
            const images = document.querySelectorAll('img[src*="payload"], .rc-image-tile-wrapper img, .rc-imageselect-tile img');
            const imageData = [];

            images.forEach((img, index) => {
                if (img.complete && img.naturalWidth > 0) {
                    try {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        ctx.drawImage(img, 0, 0);

                        imageData.push({
                            index: index,
                            dataUrl: canvas.toDataURL('image/png'),
                            rect: img.getBoundingClientRect(),
                            src: img.src
                        });
                    } catch (error) {
                        console.error('Failed to extract image data:', error);
                    }
                }
            });

            return imageData;
        }

        hasChallenge() {
            const challengeElements = document.querySelectorAll(
                'img[src*="payload"], .rc-image-tile-wrapper, .rc-imageselect-tile'
            );
            return challengeElements.length > 0;
        }

        sendToParent(data) {
            try {
                window.parent.postMessage(data, '*');
            } catch (error) {
                console.error('Failed to send message to parent:', error);
            }
        }

        // Handle solution clicks
        handleSolution(solution) {
            const images = document.querySelectorAll('img[src*="payload"], .rc-image-tile-wrapper img');
            
            solution.forEach((shouldClick, index) => {
                if (shouldClick && images[index]) {
                    setTimeout(() => {
                        this.clickImage(images[index]);
                    }, index * 200); // Stagger clicks
                }
            });

            // Click verify button after clicking images
            setTimeout(() => {
                const verifyButton = document.querySelector('#recaptcha-verify-button, .rc-button-default');
                if (verifyButton) {
                    verifyButton.click();
                }
            }, solution.length * 200 + 500);
        }

        clickImage(img) {
            const rect = img.getBoundingClientRect();
            const x = rect.left + rect.width / 2 + Math.random() * 10 - 5;
            const y = rect.top + rect.height / 2 + Math.random() * 10 - 5;

            img.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
            }));

            setTimeout(() => {
                img.dispatchEvent(new MouseEvent('mouseup', {
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y
                }));
                img.click();
            }, 50 + Math.random() * 100);
        }
    }

    // Listen for solution messages
    window.addEventListener('message', (event) => {
        if (event.data.type === 'RECAPTCHA_SOLUTION') {
            new RecaptchaFrameHandler().handleSolution(event.data.solution);
        }
    });

    // Initialize handler
    new RecaptchaFrameHandler();

})();