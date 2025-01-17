class MobileStepUp {
    constructor() {
        this.scanner = null;
        this.stepUpId = null;
        this.passkey = null;
        this.ws = null;
    }

    async init() {
        this.setupPasskeyButton();
        this.setupQRScanner();
        this.setupMessageInput();
    }

    setupPasskeyButton() {
        const button = document.getElementById('register-passkey');
        button.onclick = async () => {
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
                
                button.textContent = "✓ Passkey Registered";
                button.disabled = true;
                
                this.startQRScanner();
            } catch (error) {
                console.error('Error creating passkey:', error);
                alert('Failed to create passkey');
            }
        };
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
        this.ws = new WebSocket(`wss://${window.location.host}/ws/${this.stepUpId}`);
        this.ws.onopen = () => console.log('WebSocket connected');
        this.ws.onerror = (error) => console.error('WebSocket error:', error);
    }

    setupMessageInput() {
        const input = document.getElementById('message-input');
        const button = document.getElementById('send-message');
        
        button.onclick = () => {
            if (this.ws && input.value) {
                this.ws.send(JSON.stringify({
                    type: 'message',
                    content: input.value
                }));
                input.value = '';
            }
        };
    }
}

// Initialize
const mobileStepUp = new MobileStepUp();
mobileStepUp.init(); 