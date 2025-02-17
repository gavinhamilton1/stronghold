class Stronghold {
  constructor() {
    this.eventSource = null;
    this.containerElement = null;
    this.timerInterval = null;
    this.pollingInterval = null;
    this.clientId = null;
    this.currentClientId = null;  // Store the current client ID
    this.sessionId = null;
    this.ws = null;  // Add WebSocket property
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

  async initializeSession(sessionId) {
    console.log('Initializing session with ID:', sessionId);
    this.sessionId = sessionId;
    await this.setupWebSocket();
  }

  async setupWebSocket() {
    if (this.ws) {
      this.ws.close();
    }
    
    console.log('Setting up WebSocket for session:', this.sessionId);
    return new Promise((resolve, reject) => {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/${this.sessionId}`;
      console.log('Connecting to WebSocket URL:', wsUrl);
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onmessage = (event) => {
        console.log('WebSocket message received:', event.data);
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
          return;
        }
        
        if (data.type === 'auth_complete') {
          console.log('Received auth_complete via WebSocket');
          this.handleAuthComplete();
        } else if (data.type === 'auth_failed') {
          console.log('Received auth_failed via WebSocket');
          this.handleAuthFailed();
        }
      };
      
      this.ws.onopen = () => {
        console.log('WebSocket connection opened');
        resolve();
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket connection closed');
      };
    });
  }

  handleWebSocketMessage(data) {
    console.log('WebSocket message received:', data);
    switch (data.type) {
      case 'auth_complete':
        this.handleAuthComplete();
        break;
      case 'mobile_message':
        this.handleMobileMessage(data.content);
        break;
      default:
        console.warn('Unknown message type:', data.type);
    }
  }

  handleAuthComplete() {
    console.log('Handling auth complete event');
    // Update auth level
    const authLevelDiv = document.getElementById('auth-level');
    if (authLevelDiv) {
      console.log('Updating auth level display');
      authLevelDiv.textContent = 'Auth Level: AAL3';
      authLevelDiv.style.color = '#fd7e14';
      localStorage.setItem('authLevel', 'AAL3');
    }
    
    // Show downgrade button
    const downgradeButton = document.getElementById('downgrade-button');
    if (downgradeButton) {
      console.log('Showing downgrade button');
      downgradeButton.style.display = 'block';
    }
    
    // Update step-up container
    const pinDisplay = document.getElementById('browser-pin');
    if (pinDisplay) {
      pinDisplay.parentElement.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <h3 style="color: #28a745;">✓ PIN Verified</h3>
          <p>Authentication level upgraded to AAL3</p>
        </div>
      `;
    }
    
    // Start AAL timer
    console.log('Starting AAL timer');
    this.startAALTimer(20);
  }

  handleMobileMessage(content) {
    console.log('Mobile message received:', content);
    const messageBox = document.getElementById('pin-message-box');
    const messageDiv = document.createElement('div');
    messageDiv.textContent = content;
    messageBox.appendChild(messageDiv);
  }

  async startStepUp() {
    try {
      console.log('Starting step-up process...');
      
      // Get session ID and initialize connection
      const username = document.getElementById('username-input').value.trim();
      const sessionResponse = await fetch('/start-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username })
      });
      
      if (!sessionResponse.ok) {
        throw new Error('Failed to start session: ' + sessionResponse.statusText);
      }
      
      const sessionData = await sessionResponse.json();
      this.sessionId = sessionData.session_id;
      console.log('Got session ID:', this.sessionId);
      
      // Setup WebSocket connection
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/${this.sessionId}`;
      console.log('Attempting WebSocket connection to:', wsUrl);
      
      try {
        this.ws = new WebSocket(wsUrl);
        this.ws.onmessage = (event) => {
          console.log('WebSocket message received:', event.data);
          let data;
          try {
            data = JSON.parse(event.data);
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
            return;
          }
          
          if (data.type === 'auth_complete') {
            console.log('Received auth_complete via WebSocket');
            this.handleAuthComplete();
          } else if (data.type === 'auth_failed') {
            console.log('Received auth_failed via WebSocket');
            this.handleAuthFailed();
          }
        };
        this.ws.onopen = () => {
          console.log('WebSocket connection established');
          this.setupPolling();
        };
        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.setupPolling();
        };
      } catch (error) {
        console.error('WebSocket failed, falling back to polling:', error);
        await this.setupPolling();
      }

      // Generate new PIN
      const response = await fetch('/get-current-pin', {
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to get PIN: ' + response.statusText);
      }
      
      const data = await response.json();
      
      if (data.pin) {
        // Display the PIN
        const pinContainer = document.getElementById('browser-pin');
        pinContainer.innerHTML = `
          <div style="text-align: center;">
            <div style="font-size: 24px; margin: 20px 0;">${data.pin}</div>
            <div id="pin-status"></div>
          </div>
        `;
        
        // Show the PIN step
        showStep(2);
      } else {
        throw new Error('Failed to get PIN');
      }
    } catch (error) {
      console.error('Error starting step-up:', error);
      showStatus('Error starting step-up process', 'error');
      // Show error in PIN container
      const pinContainer = document.getElementById('browser-pin');
      if (pinContainer) {
        pinContainer.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <h3 style="color: #dc3545;">Error</h3>
            <p>${error.message}</p>
            <button onclick="stronghold.startStepUp()" 
                    style="margin-top: 20px; padding: 10px 20px; 
                           background: #007bff; color: white; 
                           border: none; border-radius: 4px; 
                           cursor: pointer;">
              Try Again
            </button>
          </div>
        `;
      }
    }
  }

  handleAuthFailed() {
    console.log('Handling auth failed event');
    const pinContainer = document.getElementById('browser-pin').parentElement;
    if (pinContainer) {
      pinContainer.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <h3 style="color: #dc3545;">✕ Incorrect PIN</h3>
          <p>Authentication failed. Please try again.</p>
          <button onclick="showStep(1)" 
                  style="margin-top: 20px; padding: 10px 20px; 
                         background: #007bff; color: white; 
                         border: none; border-radius: 4px; 
                         cursor: pointer;">
            Return to Login
          </button>
        </div>
      `;
    }
    // Clear any existing polling interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    // Close WebSocket connection
    if (this.ws) {
      this.ws.close();
    }
  }

  async initializeStepUp(containerId, sseEndpoint) {
    // If we already have a connection, just return the existing client ID
    if (this.eventSource && this.currentClientId) {
      console.log('Using existing SSE connection with client ID:', this.currentClientId);
      return this.currentClientId;
    }

    this.containerElement = document.getElementById(containerId);
    
    try {
      // Try SSE first
      console.log('Attempting to establish SSE connection...');
      this.eventSource = new EventSource(sseEndpoint);
      
      // Set up event listeners with a timeout
      const sseResult = await Promise.race([
        this.setupSSE(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SSE timeout')), 3000))
      ]);
      
      console.log('SSE connection established successfully');
      return sseResult;
    } catch (error) {
      console.log('SSE connection failed, falling back to polling:', error);
      // Clean up failed SSE connection if it exists
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      
      // Fall back to polling
      return this.setupPolling();
    }
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
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    console.log('Setting up polling for session:', this.sessionId);
    this.pollingInterval = setInterval(async () => {
      try {
        console.log('Polling for updates...');
        const response = await fetch(`/poll-updates/${this.sessionId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const updates = await response.json();
        console.log('Polling received updates:', updates);
        
        if (updates.events && updates.events.length > 0) {
          updates.events.forEach(event => {
            console.log('Processing event:', event);
            if (event.type === 'auth_complete') {
              console.log('Received auth_complete event, handling...');
              this.handleAuthComplete();
              // Clear polling interval after successful auth
              clearInterval(this.pollingInterval);
            }
          });
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 1000);
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

  async handleStepUpInitiated(stepUpId) {
    console.log('Handling step-up initiation with ID:', stepUpId);
    try {
      console.log('Step-up ID received:', stepUpId);
    } catch (error) {
      console.error('Error displaying step-up ID:', error);
    }
  }

  handleStepUpCompleted() {
    console.log('Handling step-up completion');
    this.handleAuthComplete();
  }
}
