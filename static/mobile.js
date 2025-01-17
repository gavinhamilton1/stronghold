class MobileStepUp {
    constructor() {
        this.scanner = null;
        this.stepUpId = null;
        this.credentialId = null;
    }

    async init() {
        this.setupAuthButton();
        this.setupQRScanner();
        this.setupMessageInput();
    }

    setupAuthButton() {
        const button = document.getElementById('register-passkey');
        button.textContent = "Authenticate with Biometrics";
        button.onclick = () => this.handleAuthentication();
    }

    async handleAuthentication() {
        try {
            // Try to authenticate first
            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: new Uint8Array(32),
                    rpId: window.location.hostname,
                }
            });
            
            if (assertion) {
                window.mobileDebug.log('Successfully authenticated with existing passkey');
                this.startQRScanner();
                return;
            }
        } catch (error) {
            // If authentication fails, try registration
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
                        name: "mobile-user",
                        displayName: "Mobile User"
                    },
                    pubKeyCredParams: [{alg: -7, type: "public-key"}],
                    authenticatorSelection: {
                        authenticatorAttachment: "platform",
                        requireResidentKey: true
                    }
                };

                const credential = await navigator.credentials.create({
                    publicKey
                });
                
                if (credential) {
                    window.mobileDebug.log('Successfully registered new passkey');
                    this.startQRScanner();
                }
            } catch (regError) {
                window.mobileDebug.error('Failed to register passkey: ' + regError);
                alert('Biometric setup failed');
            }
        }
    }

    setupQRScanner() {
        const readerDiv = document.getElementById('reader');
        this.scanner = new Html5Qrcode("reader");
    }

    startQRScanner() {
        // Show the QR scanner container first
        document.getElementById('reader').style.display = 'block';
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

        // Update auth level
        const authLevelDiv = document.getElementById('auth-level');
        authLevelDiv.textContent = 'Auth Level: AAL3';
        authLevelDiv.style.color = '#fd7e14';  // Bootstrap orange

        // Connect WebSocket and show input
        this.connectWebSocket();
        document.getElementById('input-container').style.display = 'block';
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/${this.stepUpId}`;
        window.mobileDebug.log('Connecting to WebSocket: ' + wsUrl);
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                window.mobileDebug.log('WebSocket connected successfully');
                document.getElementById('send-message').style.backgroundColor = '#28a745';
            };
            
            this.ws.onmessage = (event) => {
                window.mobileDebug.log('WebSocket message received: ' + event.data);
            };
            
            this.ws.onerror = (error) => {
                window.mobileDebug.error('WebSocket error: ' + error);
                document.getElementById('send-message').style.backgroundColor = '#dc3545';
            };
            
            this.ws.onclose = () => {
                window.mobileDebug.log('WebSocket connection closed');
                document.getElementById('send-message').style.backgroundColor = '#dc3545';
            };
        } catch (error) {
            window.mobileDebug.error('Error creating WebSocket: ' + error);
        }
    }

    setupMessageInput() {
        const input = document.getElementById('message-input');
        const button = document.getElementById('send-message');
        
        button.onclick = () => {
            window.mobileDebug.log('Send button clicked');
            window.mobileDebug.log('WebSocket state: ' + this.ws?.readyState);
            window.mobileDebug.log('Input value: ' + input.value);
            
            if (!this.ws) {
                window.mobileDebug.error('No WebSocket connection');
                return;
            }
            
            if (this.ws.readyState !== WebSocket.OPEN) {
                window.mobileDebug.error('WebSocket not open');
                return;
            }
            
            if (!input.value) {
                window.mobileDebug.log('No message to send');
                return;
            }
            
            try {
                const message = {
                    type: 'message',
                    content: input.value
                };
                window.mobileDebug.log('Sending message: ' + JSON.stringify(message));
                this.ws.send(JSON.stringify(message));
                window.mobileDebug.log('Message sent successfully');
                input.value = '';
            } catch (error) {
                window.mobileDebug.error('Error sending message: ' + error);
            }
        };
        
        // Also send on Enter key
        input.onkeypress = (event) => {
            if (event.key === 'Enter') {
                button.click();
            }
        };
    }
}

// Initialize
const mobileStepUp = new MobileStepUp();
mobileStepUp.init(); 