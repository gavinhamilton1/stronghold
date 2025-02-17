class StrongholdAuth {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            autoStart: false,
            username: null,
            onAuthComplete: () => {},
            onAuthFailed: () => {},
            showCancel: false,
            ...options
        };
        this.stronghold = new Stronghold();
        this.currentSessionId = null;
        
        this.initialize();
    }

    initialize() {
        const cancelButton = this.options.showCancel ? 
            `<a href="#" class="cancel-link" onclick="document.getElementById('${this.container.id}').strongholdAuth.showStep(1)">Cancel</a>` : 
            '';

        // Create the basic structure
        this.container.innerHTML = `
            <div class="stronghold-container">
                <!-- Step 1: Username Entry -->
                <div class="step active" id="${this.container.id}-step1">
                    <div id="${this.container.id}-login-form"></div>
                </div>
                
                <!-- Step 2: PIN Entry -->
                <div class="step" id="${this.container.id}-step2">
                    <div class="confirmation-container">
                        ${cancelButton}
                        <h3>User Code</h3>
                        <div class="pin-container">
                            <div id="${this.container.id}-browser-pin" style="font-size: 24px; font-weight: bold; margin: 20px 0; text-align: center;">
                                Generating code...
                            </div>
                            <div id="${this.container.id}-pin-status"></div>
                        </div>
                    </div>
                </div>

                <div id="${this.container.id}-status"></div>
            </div>
        `;

        // Initialize login form if no username provided
        if (!this.options.username) {
            new LoginForm(`${this.container.id}-login-form`, {
                onContinue: ({ username, remember }) => {
                    this.startSession(username);
                }
            });
        }

        // Store reference to this instance on the container
        this.container.strongholdAuth = this;

        // Auto-start if username provided
        if (this.options.username) {
            this.startSession(this.options.username);
        }
    }

    showStep(stepNumber) {
        const steps = this.container.querySelectorAll('.step');
        steps.forEach(step => step.classList.remove('active'));
        this.container.querySelector(`#${this.container.id}-step${stepNumber}`).classList.add('active');
    }

    async startSession(username) {
        try {
            console.log('Browser: Sending start-session request to server');
            const response = await fetch('/start-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            console.log('Browser: API Call - POST /start-session', { username });
            
            if (!response.ok) {
                console.error(`Browser: Server returned status: ${response.status}`);
                throw new Error('Failed to start session');
            }
            
            const data = await response.json();
            console.log('Browser: API Response:', data);
            this.currentSessionId = data.session_id;
            console.log(`Browser: Session started with ID: ${this.currentSessionId}`);
            
            // Show the PIN step
            this.showStep(2);
            
            // Update the confirmation container
            const pinContainer = this.container.querySelector(`#${this.container.id}-browser-pin`);
            if (pinContainer) {
                pinContainer.textContent = data.pin;
                console.log(`Browser: Displaying PIN: ${data.pin}`);
            }
            
            // Initialize WebSocket connection
            await this.stronghold.initializeSession(data.session_id);
            
            // Override Stronghold handlers to use our container
            this.stronghold.handleAuthComplete = () => {
                console.log('Browser: Auth completed successfully');
                const pinContainer = this.container.querySelector('.pin-container');
                if (pinContainer) {
                    pinContainer.innerHTML = `
                        <div style="text-align: center; padding: 20px;">
                            <h3 style="color: #28a745;">✓ PIN Verified</h3>
                            <p>Authentication level upgraded to AAL3</p>
                        </div>
                    `;
                }
                this.options.onAuthComplete();
            };
            
            this.stronghold.handleAuthFailed = () => {
                console.log('Browser: Auth failed');
                const pinContainer = this.container.querySelector('.pin-container');
                if (pinContainer) {
                    pinContainer.innerHTML = `
                        <div style="text-align: center; padding: 20px;">
                            <h3 style="color: #dc3545;">✕ Incorrect PIN</h3>
                            <p>Authentication failed. Please try again.</p>
                            <button onclick="document.getElementById('${this.container.id}').strongholdAuth.resetAndShowLogin()" 
                                    style="margin-top: 20px; padding: 10px 20px; 
                                           background: #007bff; color: white; 
                                           border: none; border-radius: 4px; 
                                           cursor: pointer;">
                                Return to Login
                            </button>
                        </div>
                    `;
                }
                this.options.onAuthFailed();
            };
        } catch (error) {
            console.error('Browser: Session error:', error);
            this.showStatus('Error starting session: ' + error.message, 'error');
        }
    }

    resetAndShowLogin() {
        if (this.stronghold) {
            if (this.stronghold.ws) {
                this.stronghold.ws.close();
                this.stronghold.ws = null;
            }
            if (this.stronghold.pollingInterval) {
                clearInterval(this.stronghold.pollingInterval);
                this.stronghold.pollingInterval = null;
            }
            this.stronghold.sessionId = null;
        }
        
        // Delete the failed session
        if (this.currentSessionId) {
            fetch(`/delete-session/${this.currentSessionId}`, {
                method: 'DELETE'
            }).catch(error => {
                console.error('Error deleting session:', error);
            });
            this.currentSessionId = null;
        }
        
        this.showStep(1);
    }

    showStatus(message, type) {
        const statusDiv = this.container.querySelector(`#${this.container.id}-status`);
        if (statusDiv) {
            statusDiv.textContent = message;
            statusDiv.className = `status ${type}`;
        }
    }
} 