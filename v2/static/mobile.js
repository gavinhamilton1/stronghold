class MobileStepUp {
    constructor() {
        this.sessionId = null;
        this.credentialId = null;
    }

    async init() {
        // Check for saved username
        const savedUsername = getCookie('username');
        if (savedUsername) {
            document.getElementById('username-input').value = savedUsername;
            document.getElementById('remember-username').checked = true;
        }
    }

    async startSession() {
        const usernameInput = document.getElementById('username-input');
        const username = usernameInput.value.trim();
        const rememberUsername = document.getElementById('remember-username').checked;
        
        window.mobileDebug.log(`Starting session for username: ${username}`);
        
        if (!username) {
            window.mobileDebug.error('Please enter a username');
            return;
        }
        
        // Handle remember username
        if (rememberUsername) {
            window.mobileDebug.log('Saving username to cookie');
            setCookie('username', username, 30); // Save for 30 days
        } else {
            window.mobileDebug.log('Removing username from cookie');
            setCookie('username', '', -1); // Remove cookie
        }
        
        // Update email displays
        document.getElementById('confirmation-email').textContent = username;
        document.getElementById('pin-email').textContent = username;
        
        // Show confirmation step
        this.showStep(2);
    }

    async loadPinOptions() {
        try {
            const username = document.getElementById('username-input').value.trim();
            window.mobileDebug.log('Checking for active session');
            window.mobileDebug.log('API Call - GET /join-session?username=' + username);
            const response = await fetch(`/join-session?username=${encodeURIComponent(username)}`);
            
            if (!response.ok) {
                window.mobileDebug.error(`Server returned status: ${response.status}`);
                throw new Error('No active session found. Please start authentication from your browser first.');
            }
            
            const data = await response.json();
            window.mobileDebug.log('API Response: ' + JSON.stringify(data));
            this.sessionId = data.session_id;
            window.mobileDebug.log(`Mobile: Joined session with ID: ${this.sessionId}`);
            
            const pinOptions = document.getElementById('pin-options');
            window.mobileDebug.log(`API Call - GET /get-pin-options?username=${encodeURIComponent(username)}`);
            const pinOptionsResponse = await fetch(`/get-pin-options?username=${encodeURIComponent(username)}`);
            if (!pinOptionsResponse.ok) {
                const errorData = await pinOptionsResponse.json();
                window.mobileDebug.error(`Server error: ${errorData.error}`);
                throw new Error('Failed to get PIN options');
            }
            const { pins } = await pinOptionsResponse.json();
            window.mobileDebug.log('API Response: ' + JSON.stringify({ pins }));
            
            // Create buttons for each PIN
            if (pins && pins.length > 0) {
                pinOptions.innerHTML = pins.map(pin => `
                    <button class="pin-option" onclick="mobileStepUp.handlePinSelection(${pin})">
                        ${pin}
                    </button>
                `).join('');
            } else {
                throw new Error('No PIN options received from server');
            }
            
            window.mobileDebug.log('PIN options loaded');
            // Show the PIN selection step
            this.showStep(3);
        } catch (error) {
            window.mobileDebug.error('Error loading PIN options: ' + error);
            pinOptions.innerHTML = `
                <div style="color: red; text-align: center; padding: 20px;">
                    ${error.message}
                    <br><br>
                    <button onclick="mobileStepUp.loadPinOptions()" style="background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px;">
                        Try Again
                    </button>
                </div>`;
        }
    }

    setupMessageInput() {
        const input = document.getElementById('message-input');
        const button = document.getElementById('send-message');
        
        button.onclick = async () => {
            window.mobileDebug.log('Send button clicked');
            
            if (!input.value) {
                window.mobileDebug.log('No message to send');
                return;
            }

            const messageContent = input.value;
            try {
                // Try WebSocket first
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    window.mobileDebug.log('Sending via WebSocket');
                    this.ws.send(JSON.stringify({
                        type: 'message',
                        content: messageContent
                    }));
                    window.mobileDebug.log('Message sent successfully via WebSocket');
                    input.value = '';
                    return;  // Exit early if WebSocket succeeds
                }

                // Fall back to HTTP if WebSocket not available or failed
                window.mobileDebug.log('WebSocket not available, falling back to HTTP');
                const response = await fetch(`/send-message/${this.sessionId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: 'message',
                        content: messageContent
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                window.mobileDebug.log('Message sent successfully via HTTP');
                input.value = '';
            } catch (error) {
                window.mobileDebug.error('Error sending message: ' + error);
            }
        };
    }

    async registerPushNotifications() {
        try {
            // Register service worker
            const registration = await navigator.serviceWorker.register('/static/service-worker.js');
            console.log('Service Worker registered');

            // Request notification permission
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                throw new Error('Notification permission denied');
            }

            // Get VAPID public key from server
            const response = await fetch('/vapid-public-key');
            const data = await response.json();
            const vapidPublicKey = data.publicKey;

            // Subscribe to push notifications
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey)
            });

            // Send subscription to server
            await fetch('/register-push', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(subscription)
            });
            
            console.log('Push notification subscription successful');
        } catch (error) {
            console.error('Failed to register for push notifications:', error);
        }
    }

    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async handlePinSelection(selectedPin) {
        try {
            window.mobileDebug.log(`Submitting PIN to server`);
            if (!this.sessionId) {
                throw new Error('No session ID available');
            }

            // Clear PIN options before verification
            const pinOptions = document.getElementById('pin-options');
            pinOptions.innerHTML = '<div style="text-align: center; padding: 20px;">PIN verification in progress...</div>';
            
            // Verify the pin
            const response = await fetch('/verify-pin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    pin: selectedPin,
                    session_id: this.sessionId
                })
            });
            
            const data = await response.json();
            if (data.session_id) {
                mobileDebug.log('PIN verified successfully');
                // Show success screen
                document.getElementById('success-email').textContent = 
                    document.getElementById('username-input').value.trim();
                document.getElementById('success-state').style.display = 'block';
                document.getElementById('failure-state').style.display = 'none';
                this.showStep(4);
            } else {
                mobileDebug.error('Incorrect PIN selected');
                // Show failure screen
                document.getElementById('success-email').textContent = 
                    document.getElementById('username-input').value.trim();
                document.getElementById('success-state').style.display = 'none';
                document.getElementById('failure-state').style.display = 'block';
                this.showStep(4);
            }
        } catch (error) {
            window.mobileDebug.error('Network error: ' + error.message);
            // Show failure screen for network error
            document.getElementById('success-email').textContent = 
                document.getElementById('username-input').value.trim();
            document.getElementById('success-state').style.display = 'none';
            document.getElementById('failure-state').style.display = 'block';
            this.showStep(4);
        }
    }

    async authenticateWithBiometrics() {
        try {
            const username = document.getElementById('username-input').value.trim();
            
            if (!username) {
                window.mobileDebug.error('Username is required');
                return false;
            }

            // Create a credential ID based on username
            const credentialId = new TextEncoder().encode(username);

            // Try to authenticate with biometrics
            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: new Uint8Array(32),
                    rpId: window.location.hostname,
                    allowCredentials: [{
                        id: credentialId,
                        type: 'public-key',
                        transports: ['internal']
                    }],
                    userVerification: "required",
                }
            });
            
            if (assertion) {
                window.mobileDebug.log('Successfully authenticated with biometrics');
                return true;
            }
        } catch (error) {
            window.mobileDebug.error('Biometric authentication failed: ' + error);
            return false;
        }
    }

    handleSuccessfulAuth() {
        try {
            // Connect WebSocket if not already connected
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.connectWebSocket();
            }
            
            // Send auth complete message to update auth level
            this.sendAuthComplete();
            
            // Show success message
            const pinOptions = document.getElementById('pin-options');
            pinOptions.innerHTML = '<div style="color: green; text-align: center; padding: 20px;">Authentication successful! Auth level upgraded to AAL3.</div>';
            
            // Show message input
            document.getElementById('input-container').style.display = 'block';
        } catch (error) {
            window.mobileDebug.error('Error in handleSuccessfulAuth: ' + error);
            const pinOptions = document.getElementById('pin-options');
            pinOptions.innerHTML = '<div style="color: red; text-align: center; padding: 20px;">Error completing authentication. Please try again.</div>';
        }
    }

    connectWebSocket() {
        window.mobileDebug.log(`Setting up WebSocket for session_id: ${this.sessionId}`);
        this.ws = new WebSocket(`wss://stronghold.onrender.com/ws/${this.sessionId}`);
        
        this.ws.onopen = () => {
            window.mobileDebug.log('WebSocket connection established');
            document.getElementById('input-container').style.display = 'block';
        };
        
        this.ws.onclose = () => {
            window.mobileDebug.log('WebSocket connection closed');
            document.getElementById('input-container').style.display = 'none';
        };
        
        this.ws.onerror = (error) => {
            window.mobileDebug.error('WebSocket error: ' + error);
        };
    }

    async sendAuthComplete() {
        try {
            // Wait for WebSocket to be ready
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                await new Promise((resolve) => {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        resolve();
                    } else {
                        this.ws.onopen = () => resolve();
                    }
                });
            }

            // Send auth complete message
            console.log('Sending auth_complete message');
            this.ws.send(JSON.stringify({
                type: 'auth_complete'
            }));
        } catch (error) {
            console.error('Error sending auth complete:', error);
        }
    }

    showStep(stepNumber) {
        // Hide all steps
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('active');
        });
        // Show requested step
        document.getElementById(`step${stepNumber}`).classList.add('active');
        // Show footer only on login step
        document.body.classList.toggle('show-footer', stepNumber === 1);
    }
}

// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.mobileStepUp = new MobileStepUp();
    mobileStepUp.init();
});

// Handle PIN selection
async function handlePinSelection(pin) {
    console.log('Selected PIN:', pin);
    try {
        // Send the PIN to the server for verification
        const response = await fetch('/verify-pin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pin: pin,
                session_id: currentSessionId
            })
        });

        const data = await response.json();
        if (data.session_id) {
            // PIN verified successfully
            console.log('PIN verified successfully');
            // Send auth_complete message through WebSocket
            if (ws) {
                ws.send(JSON.stringify({
                    type: 'auth_complete'
                }));
            }
            // Show success message
            showMessage('PIN verified successfully', 'success');
        } else {
            // PIN verification failed
            console.error('PIN verification failed');
            showMessage('Incorrect PIN', 'error');
        }
    } catch (error) {
        console.error('Error verifying PIN:', error);
        showMessage('Error verifying PIN: ' + error.message, 'error');
    }
}

// Function to show messages to the user
function showMessage(message, type = 'info') {
    mobileDebug.log(`${type}: ${message}`);
    // You could also add a visual indicator here if desired
}

// Handle PIN options display
async function displayPinOptions() {
    try {
        const response = await fetch('/get-pin-options');
        const data = await response.json();
        
        const pinOptionsContainer = document.getElementById('pin-options');
        pinOptionsContainer.innerHTML = '';
        
        data.pins.forEach(pin => {
            const button = document.createElement('button');
            button.className = 'pin-option';
            button.textContent = pin;
            button.onclick = () => handlePinSelection(pin);
            pinOptionsContainer.appendChild(button);
        });
    } catch (error) {
        console.error('Error getting PIN options:', error);
        mobileDebug.error('Failed to get PIN options');
    }
}

// Cookie handling functions
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
} 