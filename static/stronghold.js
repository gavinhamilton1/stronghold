class Stronghold {
  constructor() {
    this.eventSource = null;
    this.containerElement = null;
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

  downgradeAAL() {
    const authLevelDiv = document.getElementById('auth-level');
    const downgradeButton = document.getElementById('downgrade-button');
    
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

    if (this.eventSource) {
      console.log('Closing existing SSE connection');
      this.eventSource.close();
    }

    // Create new SSE connection
    console.log('Creating new SSE connection to:', sseUrl);
    this.eventSource = new EventSource(sseUrl);
    
    // Get client ID from response headers
    return new Promise((resolve, reject) => {
        this.eventSource.onopen = () => {
            console.log('SSE connection opened');
            // Get client ID from custom header in the first message
            this.eventSource.onmessage = (event) => {
                const clientId = JSON.parse(event.data).client_id;
                console.log('Got client ID from SSE:', clientId);
                
                // Remove the onmessage handler and set up event listeners
                this.eventSource.onmessage = null;
                this.setupEventListeners();
                
                resolve(clientId);
            };
        };
        
        this.eventSource.onerror = (error) => {
            console.error('SSE connection error:', error);
            this.eventSource.close();
            reject(error);
        };
    });
  }

  setupEventListeners() {
    // Listen for step-up initiation
    this.eventSource.addEventListener('step_up_initiated', (event) => {
        console.log('Received step-up initiated event:', event);
        console.log('Event data:', event.data);
        try {
            const stepUpId = JSON.parse(event.data);
            console.log('Received step-up ID:', stepUpId);
            this.handleStepUpInitiated(stepUpId);
        } catch (error) {
            console.error('Error processing step-up event:', error);
            console.error('Raw event data:', event.data);
        }
    });

    // Listen for step-up completion
    this.eventSource.addEventListener('step_up_completed', () => {
        console.log('Received step-up completed event');
        this.handleStepUpCompleted();
    });

    // Listen for mobile messages
    this.eventSource.addEventListener('mobile_message', (event) => {
        console.log('Received mobile message event:', event);
        if (!this.aalUpdated) {
            // Update AAL level on first message (indicates successful linking)
            const authLevelDiv = document.getElementById('auth-level');
            authLevelDiv.textContent = 'Auth Level: AAL3';
            authLevelDiv.style.color = '#fd7e14';  // Bootstrap orange
            this.aalUpdated = true;
        }
        
        // Create and display the message
        try {
            // Create message element
            const messageEl = document.createElement('div');
            messageEl.style.margin = '10px';
            messageEl.style.padding = '10px';
            messageEl.style.background = '#f0f0f0';
            messageEl.style.borderRadius = '4px';
            messageEl.style.maxWidth = '80%';
            messageEl.style.wordBreak = 'break-word';
            
            // Add message text
            const messageText = document.createElement('p');
            messageText.style.margin = '0';
            messageText.textContent = event.data;
            messageEl.appendChild(messageText);
            
            // Add to container
            this.containerElement.appendChild(messageEl);
            
            // Scroll to bottom
            this.containerElement.scrollTop = this.containerElement.scrollHeight;
        } catch (error) {
            console.error('Error displaying message:', error);
        }
    });

    // Listen for auth complete
    this.eventSource.addEventListener('auth_complete', (event) => {
        console.log('Received auth complete event');
        // Update AAL level
        const authLevelDiv = document.getElementById('auth-level');
        const downgradeButton = document.getElementById('downgrade-button');
        
        authLevelDiv.textContent = 'Auth Level: AAL3';
        authLevelDiv.style.color = '#fd7e14';
        downgradeButton.style.display = 'block';
        localStorage.setItem('authLevel', 'AAL3');
        this.aalUpdated = true;
    });
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
        await QRCode.toCanvas(
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
}
