class Stronghold {
  constructor() {
    this.eventSource = null;
    this.containerElement = null;
    this.timerInterval = null;
    this.pollingInterval = null;
    this.clientId = null;
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

  async initializeStepUp(containerElementId, sseUrl) {
    console.log('Initializing step-up with container:', containerElementId);
    
    this.containerElement = document.getElementById(containerElementId);
    if (!this.containerElement) {
        throw new Error('Container element not found');
    }

    // Close any existing SSE connection
    if (this.eventSource) {
        console.log('Closing existing SSE connection');
        this.eventSource.close();
        this.eventSource = null;
    }

    try {
        // Try SSE first
        console.log('Attempting SSE connection...');
        this.eventSource = new EventSource(sseUrl);
        
        try {
            return await this.setupSSE();
        } catch (sseError) {
            console.log('SSE connection failed:', sseError);
            // Clean up failed SSE connection
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
            // Fall back to polling
            console.log('Falling back to polling...');
            return await this.setupPolling();
        }
    } catch (error) {
        console.error('Fatal connection error:', error);
        throw error;
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

  setupPollingEventHandlers() {
    this.eventHandlers = {
        'step_up_initiated': (data) => {
            console.log('Polling: Received step-up initiated:', data);
            this.handleStepUpInitiated(data);
        },
        'auth_complete': () => {
            console.log('Polling: Received auth complete');
            const authLevelDiv = document.getElementById('auth-level');
            const downgradeButton = document.getElementById('downgrade-button');
            
            authLevelDiv.textContent = 'Auth Level: AAL3';
            authLevelDiv.style.color = '#fd7e14';
            downgradeButton.style.display = 'block';
            localStorage.setItem('authLevel', 'AAL3');
            this.aalUpdated = true;
            this.startAALTimer(20);
        },
        'mobile_message': (data) => {
            console.log('Polling: Received mobile message:', data);
            const messageEl = document.createElement('div');
            messageEl.style.margin = '10px';
            messageEl.style.padding = '10px';
            messageEl.style.background = '#f0f0f0';
            messageEl.style.borderRadius = '4px';
            messageEl.style.maxWidth = '80%';
            messageEl.style.wordBreak = 'break-word';
            
            const messageText = document.createElement('p');
            messageText.style.margin = '0';
            messageText.textContent = data;
            messageEl.appendChild(messageText);
            
            this.containerElement.appendChild(messageEl);
            this.containerElement.scrollTop = this.containerElement.scrollHeight;
        }
    };
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
                console.log('Processing', updates.events.length, 'events');
                updates.events.forEach(event => {
                    this.handlePolledEvent(event);
                });
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 1000);  // Poll every second
  }

  handlePolledEvent(event) {
    console.log('Handling polled event:', event);
    const handler = this.eventHandlers[event.type];
    if (handler) {
        handler(event.data);
        
        // Clean up after auth_complete
        if (event.type === 'auth_complete') {
            console.log('Auth complete received, stopping polling');
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
            }
            // Clear the QR code
            const qrContainer = document.getElementById('qr-container');
            if (qrContainer) {
                qrContainer.remove();
            }
        }
    } else {
        console.warn('Unknown event type:', event.type);
    }
  }

  async handleStepUpInitiated(stepUpId) {
    console.log('Handling step-up initiation with ID:', stepUpId);
    try {
        // Clear the container
        this.containerElement.innerHTML = '';
        
        // Create display container
        const container = document.createElement('div');
        container.style.textAlign = 'center';
        container.style.padding = '20px';
        container.id = 'qr-container';  // Add ID for easy removal
        
        // Create QR code container
        const qrContainer = document.createElement('canvas');
        qrContainer.id = 'qr-code';
        
        // Create step-up ID display
        const stepUpDisplay = document.createElement('p');
        stepUpDisplay.textContent = stepUpId;
        stepUpDisplay.style.fontFamily = 'monospace';
        stepUpDisplay.style.marginTop = '20px';
        
        // Add elements to container
        container.appendChild(qrContainer);
        container.appendChild(stepUpDisplay);
        this.containerElement.appendChild(container);
        
        console.log('Generating QR code for step-up ID');
        // Generate QR code
        QRCode.toCanvas(
            qrContainer,
            stepUpId,
            {
                width: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            }
        );
        console.log('QR code generated successfully');
    } catch (error) {
        console.error('Error displaying step-up ID:', error);
        this.containerElement.innerHTML = `Error: ${error.message}`;
    }
  }

  handleStepUpCompleted() {
    console.log('Handling step-up completion');
    
    // Clear container and show completion message
    this.containerElement.innerHTML = `
      <div class="step-up-complete" style="text-align: center; padding: 20px;">
        <h3>Step-up Complete</h3>
      </div>
    `;

    // Close SSE connection as it's no longer needed
    if (this.eventSource) {
      console.log('Closing SSE connection');
      this.eventSource.close();
      this.eventSource = null;
    }
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
