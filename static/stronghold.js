class Stronghold {
  constructor() {
    this.eventSource = null;
    this.containerElement = null;
    console.log('Stronghold initialized');
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
            // Parse the JSON string to remove quotes
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
        console.log('Mobile message event data:', event.data);
        try {
            const message = JSON.parse(event.data);
            console.log('Parsed mobile message:', message);
            
            // Create message element
            const messageEl = document.createElement('p');
            messageEl.textContent = message;
            messageEl.style.margin = '10px';
            messageEl.style.padding = '10px';
            messageEl.style.background = '#f0f0f0';
            messageEl.style.borderRadius = '4px';
            
            this.containerElement.appendChild(messageEl);
        } catch (error) {
            console.error('Error handling mobile message:', error);
        }
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
