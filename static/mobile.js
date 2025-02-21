async showConfirmation(username) {
    try {
        // Check for active session
        window.mobileDebug.log('Checking for active session');
        window.mobileDebug.log('API Call - GET /get-pin-options?username=' + username);
        const response = await fetch(`/get-pin-options?username=${encodeURIComponent(username)}`);
        
        if (!response.ok) {
            window.mobileDebug.error(`Server returned status: ${response.status}`);
            throw new Error('No active session found. Please start authentication from your browser first.');
        }
        
        const data = await response.json();
        window.mobileDebug.log('API Response: ' + JSON.stringify(data));
        
        // Show confirmation step
        this.showStep(2);
        
        // Update email displays
        document.getElementById('confirmation-email').textContent = username;
        document.getElementById('pin-email').textContent = username;
    } catch (error) {
        window.mobileDebug.error('Error showing confirmation: ' + error.message);
        throw error;
    }
} 