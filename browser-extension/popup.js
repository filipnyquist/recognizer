// Popup UI controller
class PopupController {
    constructor() {
        this.status = null;
        this.init();
    }

    async init() {
        await this.loadStatus();
        this.setupEventListeners();
        this.updateUI();
    }

    async loadStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
            this.status = response;
        } catch (error) {
            console.error('Failed to load status:', error);
            this.status = {
                enabled: false,
                autoSolve: true,
                showDebug: false,
                solvedCount: 0,
                modelsStatus: { loaded: false, count: 0 }
            };
        }
    }

    setupEventListeners() {
        // Toggle extension button
        document.getElementById('toggleBtn').addEventListener('click', async () => {
            try {
                const response = await chrome.runtime.sendMessage({ type: 'TOGGLE_EXTENSION' });
                this.status.enabled = response.enabled;
                this.updateUI();
            } catch (error) {
                console.error('Failed to toggle extension:', error);
            }
        });

        // Test models button
        document.getElementById('testBtn').addEventListener('click', async () => {
            const testBtn = document.getElementById('testBtn');
            testBtn.textContent = 'Testing...';
            testBtn.disabled = true;

            try {
                const response = await chrome.runtime.sendMessage({ type: 'TEST_MODELS' });
                if (response.success) {
                    testBtn.textContent = '✓ Models OK';
                    setTimeout(() => {
                        testBtn.textContent = 'Test Models';
                        testBtn.disabled = false;
                    }, 2000);
                } else {
                    testBtn.textContent = '✗ Test Failed';
                    setTimeout(() => {
                        testBtn.textContent = 'Test Models';
                        testBtn.disabled = false;
                    }, 2000);
                }
            } catch (error) {
                console.error('Model test failed:', error);
                testBtn.textContent = '✗ Test Failed';
                setTimeout(() => {
                    testBtn.textContent = 'Test Models';
                    testBtn.disabled = false;
                }, 2000);
            }
        });

        // Auto-solve toggle
        document.getElementById('autoSolve').addEventListener('change', async (e) => {
            try {
                await chrome.runtime.sendMessage({
                    type: 'UPDATE_SETTING',
                    setting: 'autoSolve',
                    value: e.target.checked
                });
                this.status.autoSolve = e.target.checked;
            } catch (error) {
                console.error('Failed to update auto-solve setting:', error);
            }
        });

        // Debug toggle
        document.getElementById('showDebug').addEventListener('change', async (e) => {
            try {
                await chrome.runtime.sendMessage({
                    type: 'UPDATE_SETTING',
                    setting: 'showDebug',
                    value: e.target.checked
                });
                this.status.showDebug = e.target.checked;
            } catch (error) {
                console.error('Failed to update debug setting:', error);
            }
        });
    }

    updateUI() {
        if (!this.status) return;

        // Update status display
        const statusEl = document.getElementById('status');
        const toggleBtn = document.getElementById('toggleBtn');
        
        if (this.status.enabled) {
            statusEl.textContent = 'Extension Enabled';
            statusEl.className = 'status enabled';
            toggleBtn.textContent = 'Disable Extension';
        } else {
            statusEl.textContent = 'Extension Disabled';
            statusEl.className = 'status disabled';
            toggleBtn.textContent = 'Enable Extension';
        }

        // Update toggles
        document.getElementById('autoSolve').checked = this.status.autoSolve;
        document.getElementById('showDebug').checked = this.status.showDebug;

        // Update model status
        const modelStatusEl = document.getElementById('modelStatus');
        if (this.status.modelsStatus.loaded) {
            modelStatusEl.textContent = `${this.status.modelsStatus.count} loaded`;
            modelStatusEl.style.color = '#4CAF50';
        } else {
            modelStatusEl.textContent = 'Loading...';
            modelStatusEl.style.color = '#FF9800';
        }

        // Update solved count
        document.getElementById('solvedCount').textContent = this.status.solvedCount;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});