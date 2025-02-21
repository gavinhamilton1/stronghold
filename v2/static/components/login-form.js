class LoginForm {
    constructor(containerId, options = {}) {
        document.addEventListener('DOMContentLoaded', () => {
            this.container = document.getElementById(containerId);
            this.onContinue = options.onContinue || (() => {});
            this.isMobilePage = document.body.classList.contains('mobile-page');
            this.render();
            this.attachEvents();
        });
    }

    render() {
        this.container.innerHTML = `
            <div class="login-container">
                <div class="login-title">Log in</div>
                <div class="input-label">Username</div>
                <input type="text" 
                       id="username-input" 
                       placeholder="Enter your username"
                       class="username-input">
                <div class="remember-me">
                    <input type="checkbox" id="remember-username">
                    <label for="remember-username">Remember username</label>
                </div>
                <button class="continue-button">
                    CONTINUE
                </button>
                <div class="help-link">
                    <a href="#">NEED HELP LOGGING IN?</a>
                </div>
            </div>
        `;
    }

    attachEvents() {
        const usernameInput = this.container.querySelector('#username-input');
        const rememberCheckbox = this.container.querySelector('#remember-username');
        const continueButton = this.container.querySelector('.continue-button');

        // Load saved username if exists
        const savedUsername = this.getCookie('username');
        if (savedUsername) {
            usernameInput.value = savedUsername;
            rememberCheckbox.checked = true;
        }

        // Handle continue button click
        continueButton.addEventListener('click', async () => {
            const username = usernameInput.value.trim();
            if (username) {
                // Handle remember me
                if (rememberCheckbox.checked) {
                    this.setCookie('username', username, 30);
                } else {
                    this.setCookie('username', '', -1);
                }

                if (this.isMobilePage) {
                    // For mobile page, trigger biometrics
                    mobileStepUp.authenticateWithBiometrics().then(success => {
                        if (success) {
                            mobileStepUp.showConfirmation(username);
                        }
                    });
                } else {
                    try {
                        // Get client ID first
                        const clientResponse = await fetch('/register-polling');
                        const clientData = await clientResponse.json();
                        const clientId = clientData.client_id;
                        
                        // Store client ID in localStorage for step-up later
                        localStorage.setItem('clientId', clientId);
                        localStorage.setItem('username', username);
                        
                        // Redirect to dashboard
                        window.location.href = '/dashboard';
                    } catch (error) {
                        console.error('Error during login:', error);
                    }
                }
            }
        });
    }

    // Cookie utilities
    setCookie(name, value, days) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
    }

    getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }
}

async function startSession(username) {
    try {
        // First get a client ID
        const clientResponse = await fetch('/register-polling');
        const clientData = await clientResponse.json();
        const clientId = clientData.client_id;
        console.log('Got client ID:', clientId);

        // Start session
        const response = await fetch('/start-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                client_id: clientId
            })
        });

        if (!response.ok) {
            throw new Error('Failed to start session');
        }

        const data = await response.json();
        console.log('Session started:', data);

        // Initialize SSE connection with the client ID
        const eventSource = new EventSource(`/register-sse/${clientId}`);
        // Setup event listeners...

        return data;
    } catch (error) {
        console.error('Error starting session:', error);
        throw error;
    }
} 