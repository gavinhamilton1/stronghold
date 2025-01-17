class MobileStepUp {
    constructor() {
        this.scanner = null;
        this.stepUpId = null;
        this.passkey = null;
        this.ws = null;
        this.credentialId = null;
    }

    async init() {
        await this.checkExistingPasskey();
        this.setupQRScanner();
        this.setupMessageInput();
    }

    async checkExistingPasskey() {
        const button = document.getElementById('register-passkey');
        try {
            // Try to get credentials
            const creds = await navigator.credentials.get({
                publicKey: {
                    challenge: new Uint8Array(32),
                    rpId: window.location.hostname,
                }
            });
            
            if (creds) {
                console.log('Found existing passkey');
                this.credentialId = creds.id;
                button.textContent = "Authenticate with Passkey";
                button.onclick = () => this.authenticateWithPasskey();
            } else {
                console.log('No existing passkey found');
                button.textContent = "Register Passkey";
                button.onclick = () => this.registerPasskey();
            }
        } catch (error) {
            console.log('No existing passkey found:', error);
            button.textContent = "Register Passkey";
            button.onclick = () => this.registerPasskey();
        }
    }

    async registerPasskey() {
        const button = document.getElementById('register-passkey');
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

            this.passkey = await navigator.credentials.create({
                publicKey
            });
            
            button.textContent = "Authenticate with Passkey";
            button.onclick = () => this.authenticateWithPasskey();
            
            this.startQRScanner();
        } catch (error) {
            console.error('Error creating passkey:', error);
            alert('Failed to create passkey');
        }
    }

    async authenticateWithPasskey() {
        try {
            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: new Uint8Array(32),
                    rpId: window.location.hostname,
                }
            });

            if (assertion) {
                this.startQRScanner();
            }
        } catch (error) {
            console.error('Authentication failed:', error);
            alert('Biometric authentication failed');
        }
    }

    setupQRScanner() {
        this.scanner = new Html5Qrcode("reader");
    }

    startQRScanner() {
        this.scanner.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            this.handleQRCode.bind(this)
        );
    }

    async handleQRCode(stepUpId) {
        this.scanner.stop();
        this.stepUpId = stepUpId;
        
        // Use passkey to authenticate
        try {
            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: new Uint8Array(32),
                    allowCredentials: [{
                        id: this.passkey.rawId,
                        type: 'public-key'
                    }]
                }
            });

            // Connect to WebSocket
            this.connectWebSocket();
            
            // Show input field
            document.getElementById('input-container').style.display = 'block';
            
        } catch (error) {
            console.error('Authentication failed:', error);
            alert('Biometric authentication failed');
        }
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/${this.stepUpId}`;
        console.log('Connecting to WebSocket:', wsUrl);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected successfully');
        };
        
        this.ws.onmessage = (event) => {
            console.log('WebSocket message received:', event.data);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket connection closed');
        };
    }

    setupMessageInput() {
        const input = document.getElementById('message-input');
        const button = document.getElementById('send-message');
        
        button.onclick = () => {
            if (this.ws && input.value) {
                const message = {
                    type: 'message',
                    content: input.value
                };
                console.log('Sending message:', message);
                this.ws.send(JSON.stringify(message));
                input.value = '';
            }
        };
    }
}

// Initialize
const mobileStepUp = new MobileStepUp();
mobileStepUp.init(); 