class LoginForm {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.onContinue = options.onContinue || (() => {});
        this.render();
        this.attachEvents();
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
        continueButton.addEventListener('click', () => {
            const username = usernameInput.value.trim();
            if (!username) return;

            // Handle remember me
            if (rememberCheckbox.checked) {
                this.setCookie('username', username, 30);
            } else {
                this.setCookie('username', '', -1);
            }

            // Call the continue callback with the form data
            this.onContinue({
                username,
                remember: rememberCheckbox.checked
            });
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