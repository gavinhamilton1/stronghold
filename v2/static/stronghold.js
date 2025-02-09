class Stronghold {
  constructor() {
    this.eventSource = null;
    this.containerElement = null;
    this.timerInterval = null;
    this.pollingInterval = null;
    this.clientId = null;
    this.currentClientId = null;  // Store the current client ID
    this.initializeAALLevel();
    console.log('Stronghold initialized');
  }

  initializeAALLevel() {
    const savedAAL = localStorage.getItem('authLevel');
    const authLevelDiv = document.getElementById('auth-level');
    const downgradeButton = document.getElementById('downgrade-button');
    
    if (savedAAL === 'AAL3') {
      authLevelDiv.textContent = 'Auth Level: AAL3';
      authLevelDiv.style.color = '#fd7e14';
      downgradeButton.style.display = 'block';
      this.aalUpdated = true;
    }
  }

  startAALTimer(seconds) {
    let timeLeft = seconds;
    const authLevelDiv = document.getElementById('auth-level');
    const timerSpan = document.createElement('span');
    timerSpan.style.marginLeft = '10px';
    timerSpan.style.fontSize = '14px';
    timerSpan.style.color = '#666';
    authLevelDiv.appendChild(timerSpan);

    this.timerInterval = setInterval(() => {
      timeLeft--;
      timerSpan.textContent = `(${timeLeft}s)`;
      
      if (timeLeft <= 0) {
        clearInterval(this.timerInterval);
        this.downgradeAAL();
        this.startStepUp();  // Start new step-up process
      }
    }, 1000);
  }

  downgradeAAL() {
    clearInterval(this.timerInterval);  // Clear any existing timer
    const authLevelDiv = document.getElementById('auth-level');
    const downgradeButton = document.getElementById('downgrade-button');
    
    // Remove timer if it exists
    const timerSpan = authLevelDiv.querySelector('span');
    if (timerSpan) {
      timerSpan.remove();
    }

    authLevelDiv.textContent = 'Auth Level: AAL2';
    authLevelDiv.style.color = '#28a745';
    downgradeButton.style.display = 'none';
    localStorage.removeItem('authLevel');
    this.aalUpdated = false;
  }

  async initializeStepUp(containerId, sseEndpoint) {
    // If we already have a connection, just return the existing client ID
    if (this.eventSource && this.currentClientId) {
      console.log('Using existing SSE connection with client ID:', this.currentClientId);
      return this.currentClientId;
    }

    this.containerElement = document.getElementById(containerId);
    
    // Set up SSE connection
    this.eventSource = new EventSource(sseEndpoint);
    
    console.log('Setting up SSE connection...');
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Wait for client ID
    return new Promise((resolve) => {
      this.clientIdResolver = resolve;
      
      // Handle the initial client ID message
      this.eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('SSE message received:', data);
        
        if (data.client_id) {
          console.log('Received client ID in message:', data.client_id);
          this.currentClientId = data.client_id;
          resolve(data.client_id);
        }
      };
      
      // Handle SSE errors
      this.eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
      };
    });
  }

  handleAuthLevelChange(level) {
    console.log('Auth level changed to:', level);
    const authLevelDiv = document.getElementById('auth-level');
    const downgradeButton = document.getElementById('downgrade-button');
    
    if (level === 'AAL3') {
      authLevelDiv.textContent = 'Auth Level: AAL3';
      downgradeButton.style.display = 'block';
    } else {
      authLevelDiv.textContent = 'Auth Level: AAL2';
      downgradeButton.style.display = 'none';
    }
  }

  async setupSSE() {
    return new Promise((resolve, reject) => {
        let timeoutId = setTimeout(() => {
            console.error('SSE connection timed out');
            this.eventSource.close();
            reject(new Error('SSE connection timed out'));
        }, 3000);  // Reduced timeout to 3 seconds

        // Add connection timeout check
        let connectionTimeoutId = setTimeout(() => {
            console.error('SSE connection blocked or too slow');
            this.eventSource.close();
            reject(new Error('SSE connection blocked'));
        }, 1000);  // Check if connection is established within 1 second

        this.eventSource.onopen = () => {
            console.log('SSE connection opened');
            clearTimeout(connectionTimeoutId);
        };

        this.eventSource.onmessage = (event) => {
            clearTimeout(timeoutId);
            clearTimeout(connectionTimeoutId);
            const clientId = JSON.parse(event.data).client_id;
            this.clientId = clientId;
            console.log('Got client ID from SSE:', clientId);
            this.setupEventListeners();
            resolve(clientId);
        };

        this.eventSource.onerror = (error) => {
            clearTimeout(timeoutId);
            clearTimeout(connectionTimeoutId);
            console.error('SSE connection error:', error);
            this.eventSource.close();
            reject(error);
        };
    });
  }

  async setupPolling() {
    console.log('Setting up polling mechanism');
    try {
        console.log('Calling register-polling endpoint...');  // Add debug log
        const response = await fetch('/register-polling', {
            method: 'GET',  // Explicitly set method
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        this.clientId = data.client_id;
        console.log('Got client ID for polling:', this.clientId);

        // Set up event handlers similar to SSE
        this.setupPollingEventHandlers();
        
        // Start polling for updates
        this.startPolling();
        return this.clientId;
    } catch (error) {
        console.error('Error setting up polling:', error);
        throw error;
    }
  }

  setupEventListeners() {
    console.log('Setting up event listeners');
    
    // Listen for step-up initiation
    this.eventSource.addEventListener('step_up_initiated', (event) => {
        console.log('Received step-up initiated event:', event);
        try {
            const data = JSON.parse(event.data);
            const stepUpId = data.step_up_id || data;
            console.log('Received step-up ID:', stepUpId);
            this.handleStepUpInitiated(stepUpId);
        } catch (error) {
            console.error('Error processing step-up event:', error);
        }
    });

    // Listen for mobile messages
    this.eventSource.addEventListener('mobile_message', (event) => {
        console.log('Received mobile message:', event);
        this.handleMobileMessage(event.data);
    });

    // Add event listener for auth_complete event
    this.eventSource.addEventListener('auth_complete', (event) => {
        console.log('Received auth_complete event with data:', event.data);
        try {
            this.handleAuthComplete();
        } catch (error) {
            console.error('Error processing auth_complete event:', error);
        }
    });
  }

  setupPollingEventHandlers() {
    console.log('Setting up polling event handlers');
    this.eventHandlers = {
        'step_up_initiated': (data) => {
            console.log('Polling: Received step-up initiated:', data);
            this.handleStepUpInitiated(data);
        },
        'auth_complete': () => {
            console.log('Polling: Received auth complete');
            this.handleAuthComplete();  // Use the shared handler
        },
        'mobile_message': (data) => {
            console.log('Polling: Received mobile message:', data);
            // Clear the container if it's the first message after auth
            if (this.containerElement.children.length === 1 && 
                this.containerElement.children[0].textContent === 'Messages will appear here...') {
                this.containerElement.innerHTML = '';
            }
            this.handleMobileMessage(data);
        }
    };
  }

  handleAuthComplete() {
    console.log('Auth completed, updating UI');
    // Update auth level
    const authLevelDiv = document.getElementById('auth-level');
    if (authLevelDiv) {
        authLevelDiv.textContent = 'Auth Level: AAL3';
        authLevelDiv.style.color = '#fd7e14';
        localStorage.setItem('authLevel', 'AAL3');
        console.log('Updated auth level display and localStorage');
    }
    
    // Show downgrade button
    const downgradeButton = document.getElementById('downgrade-button');
    if (downgradeButton) {
        downgradeButton.style.display = 'block';
        console.log('Showed downgrade button');
    }
    
    // Update step-up container
    if (this.containerElement) {
        console.log('Updating step-up container with completion message');
        this.containerElement.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <h3 style="color: #28a745;">Step-up Complete!</h3>
                <p>Authentication level upgraded to AAL3</p>
            </div>
        `;
    }
    
    // Start AAL timer
    console.log('Starting AAL timer');
    this.startAALTimer(20);
  }

  handleMobileMessage(data) {
    console.log('Processing mobile message:', data);
    try {
        if (!this.containerElement) {
            console.error('Container element not found');
            return;
        }

        // Create message element
        const messageEl = document.createElement('div');
        messageEl.style.margin = '10px';
        messageEl.style.padding = '10px';
        messageEl.style.background = '#f0f0f0';
        messageEl.style.borderRadius = '4px';
        messageEl.style.maxWidth = '80%';
        messageEl.style.wordBreak = 'break-word';
        
        const messageText = document.createElement('p');
        messageText.style.margin = '0';
        messageText.textContent = typeof data === 'string' ? data : JSON.stringify(data);
        messageEl.appendChild(messageText);
        
        console.log('Adding message to container:', this.containerElement.id);
        this.containerElement.appendChild(messageEl);
        this.containerElement.scrollTop = this.containerElement.scrollHeight;
        console.log('Message added successfully');
    } catch (error) {
        console.error('Error handling mobile message:', error);
    }
  }

  startPolling() {
    console.log('Starting polling for updates');
    if (this.pollingInterval) {
        console.log('Clearing existing polling interval');
        clearInterval(this.pollingInterval);
    }
    
    this.pollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`/poll-updates/${this.clientId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const updates = await response.json();
            
            if (updates.events && updates.events.length > 0) {
                console.log('Processing events:', updates.events);
                updates.events.forEach(event => {
                    console.log('Processing event:', event);
                    this.handlePolledEvent(event);
                });
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 1000);
  }

  handlePolledEvent(event) {
    console.log('Handling polled event:', event);
    const handler = this.eventHandlers[event.type];
    if (handler) {
        console.log(`Found handler for event type: ${event.type}`);
        // Call the handler directly for all events
        handler(event.data);
    } else {
        console.warn('Unknown event type:', event.type);
    }
  }

  async handleStepUpInitiated(stepUpId) {
    console.log('Handling step-up initiation with ID:', stepUpId);
    try {
        // Only handle QR code if we're in QR mode
        const currentMode = document.querySelector('ion-segment').value;
        if (currentMode !== 'qr') {
            console.log('Not in QR mode, skipping QR code generation');
            return;
        }

        // Get the step-up container
        const stepUpContainer = document.getElementById('step-up-container');
        if (!stepUpContainer) {
            console.error('Step-up container not found');
            return;
        }
        
        // Recreate the QR code structure
        stepUpContainer.innerHTML = `
            <div id="qrcode" style="margin: 0 auto;"></div>
            <div id="step-up-id"></div>
        `;
        
        const qrcodeDiv = document.getElementById('qrcode');
        if (!qrcodeDiv) {
            console.error('QR code div not found');
            return;
        }
        
        // Create new inner div for QR code
        const newQrDiv = document.createElement('div');
        newQrDiv.id = 'qrcode-inner';
        qrcodeDiv.appendChild(newQrDiv);
        
        // Create QR code in the new div
        new QRCode(newQrDiv, {
            text: stepUpId,
            width: 128,
            height: 128,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });

        // Create step-up ID display
        const stepUpIdDiv = document.getElementById('step-up-id');
        if (stepUpIdDiv) {
            stepUpIdDiv.textContent = stepUpId;
            stepUpIdDiv.style.fontFamily = 'monospace';
            stepUpIdDiv.style.marginTop = '10px';
            stepUpIdDiv.style.fontSize = '12px';
        }
    } catch (error) {
        console.error('Error displaying step-up ID:', error);
        const stepUpContainer = document.getElementById('step-up-container');
        if (stepUpContainer) {
            stepUpContainer.innerHTML = `<div style="color: red;">Error: ${error.message}</div>`;
        }
    }
  }

  handleStepUpCompleted() {
    console.log('Handling step-up completion');
    this.handleAuthComplete();
  }

  async startStepUp() {
    console.log('Starting step-up process');
    try {
        // Initialize new SSE connection
        const clientId = await this.initializeStepUp('step-up-container', '/register-sse');
        console.log('Got client ID:', clientId);
        
        // Initiate step-up
        const result = await fetch(`/initiate-step-up/${clientId}`, {
            method: 'POST'
        });
        const data = await result.json();
        console.log('Step-up initiated response:', data);
        
        // Clear any existing status
        const statusDiv = document.getElementById('status');
        if (statusDiv) {
            statusDiv.textContent = '';
            statusDiv.className = '';
        }
    } catch (error) {
        console.error('Step-up error:', error);
        const statusDiv = document.getElementById('status');
        if (statusDiv) {
            statusDiv.textContent = 'Error starting step-up: ' + error.message;
            statusDiv.className = 'status error';
        }
    }
  }
}
