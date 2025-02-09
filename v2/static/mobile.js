class MobileStepUp {
    constructor() {
        this.scanner = null;
        this.stepUpId = null;
        this.credentialId = null;
        this.setupScanAgainButton();
        this.setupSegmentControl();
    }

    setupScanAgainButton() {
        const scanAgainButton = document.getElementById('scan-again');
        scanAgainButton.onclick = () => {
            // Hide input container and scan button
            document.getElementById('input-container').style.display = 'none';
            scanAgainButton.style.display = 'none';
            
            // Show and start scanner
            document.getElementById('reader').style.display = 'block';
            this.startQRScanner();
            
            // Close existing WebSocket if any
            if (this.ws) {
                this.ws.close();
            }
        };
    }

    async init() {
        // Start camera immediately if we're in QR section
        if (document.querySelector('ion-segment').value === 'qr') {
            this.setupQRScanner();
            this.startQRScanner();
        }
        this.setupMessageInput();
    }

    setupQRScanner() {
        const readerDiv = document.getElementById('reader');
        readerDiv.style.display = 'block';  // Show scanner immediately
        this.scanner = new Html5Qrcode("reader");
    }

    startQRScanner() {
        window.mobileDebug.log('Starting QR scanner');
        
        this.scanner.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            this.handleQRCode.bind(this)
        ).catch(error => {
            window.mobileDebug.error('Error starting QR scanner: ' + error);
            alert('Failed to start camera');
        });
    }

    async handleQRCode(stepUpId) {
        window.mobileDebug.log('QR Code scanned:', stepUpId);
        this.scanner.stop();
        document.getElementById('reader').style.display = 'none';
        this.stepUpId = stepUpId;

        // Show scan again button
        document.getElementById('scan-again').style.display = 'block';

        window.mobileDebug.log('Connecting WebSocket...');
        // Connect WebSocket before authentication
        this.connectWebSocket();

        window.mobileDebug.log('Starting authentication...');
        // Immediately start authentication
        await this.handleAuthentication();
    }

    async handleAuthentication() {
        try {
            // Try to authenticate first with strict biometric requirements
            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: new Uint8Array(32),
                    rpId: window.location.hostname,
                    userVerification: "required",
                }
            });
            
            if (assertion) {
                window.mobileDebug.log('Successfully authenticated with existing passkey');
                this.connectWebSocket();
                document.getElementById('input-container').style.display = 'block';
                
                // Send auth complete message
                await this.sendAuthComplete();
                return;
            }
        } catch (error) {
            // If authentication fails, try registration with strict biometric requirements
            window.mobileDebug.log('No existing passkey, attempting registration');
            try {
                const publicKey = {
                    challenge: new Uint8Array(32),
                    rp: {
                        name: "Stronghold Step-up",
                        id: window.location.hostname
                    },
                    user: {
                        id: new Uint8Array(16),
                        name: "stronghold-user",
                        displayName: "Stronghold User"
                    },
                    pubKeyCredParams: [{alg: -7, type: "public-key"}],
                    authenticatorSelection: {
                        authenticatorAttachment: "platform",
                        userVerification: "required",
                        requireResidentKey: true,
                        residentKey: "required"
                    },
                    attestation: "direct",
                    extensions: {
                        credProps: true,
                        uvm: true
                    }
                };

                const credential = await navigator.credentials.create({
                    publicKey
                });
                
                if (credential) {
                    window.mobileDebug.log('Successfully registered new passkey');
                    this.connectWebSocket();
                    document.getElementById('input-container').style.display = 'block';
                    
                    // Send auth complete message after registration too
                    await this.sendAuthComplete();
                }
            } catch (regError) {
                window.mobileDebug.error('Failed to register passkey: ' + regError);
                alert('Biometric setup failed');
            }
        }
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

    connectWebSocket() {
        window.mobileDebug.log(`Setting up WebSocket for step_up_id: ${this.stepUpId}`);
        this.ws = new WebSocket(`wss://stronghold.onrender.com/ws/${this.stepUpId}`);
        
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
                const response = await fetch(`/send-message/${this.stepUpId}`, {
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

    setupSegmentControl() {
        const segment = document.getElementById('selector');
        const sections = {
            'qr': document.getElementById('qr-code'),
            'pin-selector': document.getElementById('pin-selector'),
            'pin-entry': document.getElementById('pin-entry')
        };

        segment.addEventListener('ionChange', async (event) => {
            // Hide all sections
            Object.values(sections).forEach(section => section.classList.remove('active'));
            
            // Show selected section
            const selectedValue = event.detail.value;
            if (sections[selectedValue]) {
                sections[selectedValue].classList.add('active');
            }

            // Handle section-specific initialization
            if (selectedValue === 'qr') {
                this.setupQRScanner();
                this.startQRScanner();
            } else if (selectedValue === 'pin-selector') {
                await this.loadPinOptions();
            }
        });
    }

    async loadPinOptions() {
        const pinOptions = document.getElementById('pin-options');
        window.mobileDebug.log('Loading PIN options');
        
        try {
            // Get the step-up ID from the browser's PIN display
            const browserPinResponse = await fetch('/get-current-pin');
            if (!browserPinResponse.ok) {
                throw new Error('No active PIN available. Please generate a PIN in the browser first.');
            }
            const browserPinData = await browserPinResponse.json();
            if (!browserPinData.step_up_id) {
                throw new Error('No step-up ID available from browser');
            }
            this.stepUpId = browserPinData.step_up_id;
            window.mobileDebug.log('Using browser step-up ID:', this.stepUpId);
            
            // Get PIN options from server
            const response = await fetch(`/get-pin-options?step_up_id=${this.stepUpId}`);
            if (!response.ok) {
                throw new Error('Failed to get PIN options. Please make sure a PIN is generated in the browser.');
            }
            const { pins } = await response.json();
            
            // Create buttons for each PIN
            pinOptions.innerHTML = pins.map(pin => `
                <button class="pin-option" onclick="mobileStepUp.handlePinSelection(${pin})" style="color: black;">
                    ${String(pin).padStart(5, '0')}
                </button>
            `).join('');
            
            window.mobileDebug.log('PIN options loaded');
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

    async handlePinSelection(selectedPin) {
        try {
            window.mobileDebug.log(`Submitting PIN to server`);
            if (!this.stepUpId) {
                throw new Error('No step-up ID available');
            }

            await this.authenticateWithBiometrics()
                .then(() => {
                    // Clear PIN options after successful biometric auth
                    const pinOptions = document.getElementById('pin-options');
                    pinOptions.innerHTML = '<div style="text-align: center; padding: 20px;">PIN verification in progress...</div>';
                    
                    // After successful biometric auth, verify the pin
                    return fetch('/verify-pin', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ 
                            pin: selectedPin,
                            step_up_id: this.stepUpId  // Use the stored step_up_id
                        })
                    });
                })
                .then(response => response.json())
                .then(data => {
                    if (data.step_up_id) {
                        mobileDebug.log('PIN verified successfully');
                        // Handle successful authentication
                        this.handleSuccessfulAuth();
                    } else {
                        mobileDebug.error('Incorrect PIN selected');
                        const pinOptions = document.getElementById('pin-options');
                        pinOptions.innerHTML = '<div style="color: red; text-align: center; padding: 20px;">Incorrect PIN. Please try again with QR code.</div>';
                    }
                });
        } catch (error) {
            window.mobileDebug.error('Network error: ' + error.message);
            // Show error message in place of PIN options
            const pinOptions = document.getElementById('pin-options');
            pinOptions.innerHTML = '<div style="color: red; text-align: center; padding: 20px;">Network error. Please try again with QR code.</div>';
        }
    }

    async authenticateWithBiometrics() {
        try {
            // Try to authenticate with biometrics
            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: new Uint8Array(32),
                    rpId: window.location.hostname,
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
}

// Initialize
const mobileStepUp = new MobileStepUp();
mobileStepUp.init();

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
                step_up_id: currentStepUpId
            })
        });

        const data = await response.json();
        if (data.step_up_id) {
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