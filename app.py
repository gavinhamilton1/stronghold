from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse, Response, HTMLResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sse_starlette.sse import EventSourceResponse
from typing import Dict
import uuid
import asyncio
from collections import defaultdict, deque
import json
from fastapi.logger import logger
import logging
from pywebpush import webpush, WebPushException
import random
import ssl
import hashlib
from OpenSSL import SSL
from datetime import datetime

app = FastAPI()

# Mount static files directory
app.mount("/static", StaticFiles(directory="v2/static", html=True), name="static")

# Setup templates
templates = Jinja2Templates(directory="v2/templates")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active SSE connections
CONNECTIONS: Dict[str, asyncio.Queue] = defaultdict(asyncio.Queue)

# Store WebSocket connections
WS_CONNECTIONS: Dict[str, WebSocket] = {}

# Store subscriptions (in a real app, use a database)
push_subscriptions = {}

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add these constants at the top
VAPID_PRIVATE_KEY = "your_generated_private_key"
VAPID_PUBLIC_KEY = "your_generated_public_key"
VAPID_CLAIMS = {
    "sub": "mailto:gavin@gbag.co.uk"
}

# Add this with other global variables
POLLING_EVENTS = defaultdict(lambda: deque(maxlen=100))

# Add a mapping dictionary for step-up IDs to client IDs
STEP_UP_TO_CLIENT = {}

# Add at the top with other global variables
CURRENT_PIN = None

# Add to the global variables at the top
pins = {}  # Store PINs by client_id
step_up_pins = {}  # Store PINs by step_up_id

# Add to global variables
active_sessions = {}  # Store username -> session_id mapping
session_pins = {}    # Store session_id -> PIN mapping

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Serve main page"""
    return templates.TemplateResponse("index.html", {
        "request": request,
        "continue_action": "startSession()",
        "show_footer": False
    })

@app.get("/mobile", response_class=HTMLResponse)
async def mobile(request: Request):
    """Serve mobile page"""
    return templates.TemplateResponse("mobile.html", {
        "request": request,
        "continue_action": "mobileStepUp.startSession()",
        "show_footer": True
    })

@app.get("/webauthn", response_class=HTMLResponse)
async def mobile(request: Request):
    """Serve webauthn page"""
    return templates.TemplateResponse("webauthn.html", {"request": request})


@app.get("/register-sse")
async def register_sse(request: Request):
    """
    Endpoint for registering SSE connections.
    Returns a client_id that should be used for future requests.
    """
    client_id = str(uuid.uuid4())
    
    # Log connection attempt
    logger.info(f"🔄 SSE connection attempt from {request.client.host}")
    logger.info(f"📡 Request headers: {request.headers}")
    
    # Create the queue immediately
    CONNECTIONS[client_id] = asyncio.Queue()
    logger.info(f"✅ Created new connection for client: {client_id}")
    
    async def event_generator():
        try:
            # Send initial message with client ID
            logger.info(f"📤 Sending initial client ID message to {client_id}")
            yield {
                "data": json.dumps({"client_id": client_id})
            }
            
            while True:
                message = await CONNECTIONS[client_id].get()
                logger.info(f"📤 Sending message to client {client_id}: {message}")
                if message.get("type") == "close":
                    break
                data = json.dumps(message["data"])
                yield {
                    "event": message["event"],
                    "data": data
                }
        except asyncio.CancelledError:
            logger.error(f"❌ SSE connection cancelled for client: {client_id}")
        except Exception as e:
            logger.error(f"❌ Error in SSE connection: {str(e)}")
        finally:
            CONNECTIONS.pop(client_id, None)
            logger.info(f"👋 Cleaned up connection for client: {client_id}")

    return EventSourceResponse(event_generator())

@app.post("/initiate-step-up/{client_id}")
async def initiate_step_up(client_id: str):
    """Initiate a step-up for a client"""
    logger.info(f"🔄 Initiating step-up for client: {client_id}")
    
    step_up_id = str(uuid.uuid4())
    
    # Store the mapping
    STEP_UP_TO_CLIENT[step_up_id] = client_id
    logger.info(f"🔗 Mapped step_up_id {step_up_id} to client_id {client_id}")
    
    # Create event with consistent format for both SSE and polling
    event = {
        "type": "step_up_initiated",
        "data": step_up_id
    }
    
    # Store for both SSE and polling
    if client_id in CONNECTIONS:
        logger.info(f"📤 Sending via SSE to client: {client_id}")
        await CONNECTIONS[client_id].put({
            "event": "step_up_initiated",
            "data": step_up_id
        })
    
    logger.info(f"📤 Adding event to polling queue for client: {client_id}")
    POLLING_EVENTS[client_id].append(event)
    
    return {"status": "success", "step_up_id": step_up_id}

@app.post("/initiate-step-up/mobile-pin")
async def initiate_mobile_pin_step_up():
    """Initiate a step-up for mobile PIN verification"""
    try:
        step_up_id = str(uuid.uuid4())
        client_id = str(uuid.uuid4())
        STEP_UP_TO_CLIENT[step_up_id] = client_id
        
        # Generate a PIN for this step-up
        pin = str(random.randint(10000, 99999))
        step_up_pins[step_up_id] = pin
        logger.info(f"Generated PIN {pin} for step_up_id {step_up_id}")
        
        return {
            "step_up_id": step_up_id,
            "pin": pin
        }
    except Exception as e:
        logger.error(f"Error initiating mobile PIN step-up: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/complete-step-up/{client_id}")
async def complete_step_up(client_id: str):
    """
    Endpoint to mark a step-up as complete.
    Sends completion event through SSE.
    """
    if client_id not in CONNECTIONS:
        return JSONResponse(
            status_code=404,
            content={"error": "Client connection not found"}
        )

    # Send step-up completed event
    await CONNECTIONS[client_id].put({
        "event": "step_up_completed",
        "data": "{}"
    })

    # Close the connection
    await CONNECTIONS[client_id].put({"type": "close"})

    return {"status": "success"}

@app.websocket("/ws/{step_up_id}")
async def websocket_endpoint(websocket: WebSocket, step_up_id: str):
    logger.info(f"⭐ WebSocket connection request for step_up_id: {step_up_id}")
    try:
        await websocket.accept()
        logger.info(f"✅ WebSocket connection accepted for step_up_id: {step_up_id}")
        WS_CONNECTIONS[step_up_id] = websocket
        
        while True:
            try:
                data = await websocket.receive_json()
                logger.info(f"📥 Received WebSocket message for {step_up_id}: {data}")
                
                # Get the client ID from the mapping for all message types
                client_id = STEP_UP_TO_CLIENT.get(step_up_id)
                logger.info(f"🔍 Looking up client_id for step_up_id {step_up_id}: found {client_id}")
                if not client_id:
                    logger.error(f"❌ No client_id found for step_up_id: {step_up_id}")
                    continue

                if data["type"] == "auth_complete":
                    # Add to polling queue
                    logger.info(f"🔐 Adding auth complete event to polling queue for client: {client_id}")
                    POLLING_EVENTS[client_id].append({
                        "type": "auth_complete",
                        "data": None
                    })
                    
                    # Also try SSE if available
                    if client_id in CONNECTIONS:
                        logger.info(f"🔐 Sending auth complete event via SSE for client: {client_id}")
                        await CONNECTIONS[client_id].put({
                            "event": "auth_complete",
                            "data": "{}"
                        })

                elif data["type"] == "message":
                    message_content = data.get('content', '')
                    logger.info(f"💬 Processing message: {message_content} for client: {client_id}")
                    
                    # Add to polling queue
                    logger.info(f"➡️ Adding message to polling queue for client: {client_id}")
                    POLLING_EVENTS[client_id].append({
                        "type": "mobile_message",
                        "data": message_content
                    })
                    logger.info(f"📊 Current polling events for {client_id}: {list(POLLING_EVENTS[client_id])}")
                    
                    # Send via SSE if available
                    if client_id in CONNECTIONS:
                        logger.info(f"➡️ Sending message via SSE for client: {client_id}")
                        await CONNECTIONS[client_id].put({
                            "event": "mobile_message",
                            "data": message_content
                        })
                    else:
                        logger.info(f"ℹ️ No SSE connection for client: {client_id}, using polling only")
                    
            except Exception as e:
                logger.error(f"❌ Error processing WebSocket message: {e}")
                break
                
    except Exception as e:
        logger.error(f"❌ WebSocket connection error: {e}")
    finally:
        WS_CONNECTIONS.pop(step_up_id, None)
        logger.info(f"👋 WebSocket connection closed for step_up_id: {step_up_id}")

@app.route('/register-push', methods=['POST'])
def register_push():
    subscription_info = request.json
    push_subscriptions[subscription_info.get('endpoint')] = subscription_info
    return jsonify({'status': 'success'})

def send_push_notification(message):
    for subscription in push_subscriptions.values():
        try:
            webpush(
                subscription_info=subscription,
                data=message,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims=VAPID_CLAIMS
            )
        except WebPushException as e:
            print("Push notification failed:", e)

@app.post("/test-notification")
async def test_notification():
    """Send a test notification to all registered devices"""
    try:
        send_push_notification("Test notification from Stronghold Step-up!")
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error sending test notification: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/vapid-public-key")
async def get_vapid_public_key():
    """Endpoint to get the VAPID public key"""
    return {"publicKey": VAPID_PUBLIC_KEY}

@app.get("/register-polling")
async def register_polling():
    """Endpoint for registering polling clients"""
    client_id = str(uuid.uuid4())
    logger.info(f"🔄 Registering polling client: {client_id}")
    return {"client_id": client_id}

@app.get("/poll-updates/{client_id}")
async def poll_updates(client_id: str):
    """Endpoint for polling updates when SSE is blocked"""
    logger.info(f"📥 Polling request from client: {client_id}")
    events = []
    while POLLING_EVENTS[client_id]:
        event = POLLING_EVENTS[client_id].popleft()
        events.append(event)
        logger.info(f"📤 Sending polled event: {event}")
    return {"events": events}

@app.post("/send-message/{step_up_id}")
async def send_message(step_up_id: str, message: dict):
    """Send a message to the browser from an external app"""
    logger.info(f"📱 Received external message for step_up_id: {step_up_id}")
    
    # Get the client ID from the mapping
    client_id = STEP_UP_TO_CLIENT.get(step_up_id)
    if not client_id:
        logger.error(f"❌ No client_id found for step_up_id: {step_up_id}")
        return JSONResponse(
            status_code=404,
            content={"error": "Step-up ID not found"}
        )

    # Add message to polling queue
    logger.info(f"➡️ Adding message to polling queue for client: {client_id}")
    POLLING_EVENTS[client_id].append({
        "type": "mobile_message",
        "data": message["content"]
    })
    
    # Send via SSE if available
    if client_id in CONNECTIONS:
        logger.info(f"➡️ Sending message via SSE for client: {client_id}")
        await CONNECTIONS[client_id].put({
            "event": "mobile_message",
            "data": message["content"]
        })
    
    return {"status": "success"}

@app.get("/get-current-pin")
async def get_current_pin():
    """Get the current valid PIN"""
    global CURRENT_PIN
    if CURRENT_PIN is None:
        return JSONResponse(
            status_code=404,
            content={"error": "No active PIN"}
        )
    # Find the step-up ID for the current PIN
    step_up_id = None
    for sid, pin in step_up_pins.items():
        if pin == CURRENT_PIN:
            step_up_id = sid
            break
    
    return {
        "pin": CURRENT_PIN,
        "step_up_id": step_up_id
    }

@app.post("/verify-pin")
async def verify_pin(request: Request):
    """Verify a PIN and return a session ID if correct"""
    try:
        data = await request.json()
        pin = data.get('pin')
        session_id = data.get('session_id')
        
        logger.info(f'Verifying PIN: user selected {pin} for session {session_id}')
        correct_pin = session_pins.get(session_id)
        logger.info(f'Correct PIN for session {session_id} is {correct_pin}')
        
        if str(pin) == str(correct_pin):
            logger.info(f'PIN verified successfully for session {session_id}')
            # Notify browser of successful authentication
            event = {
                'type': 'auth_complete',
                'timestamp': datetime.now().isoformat()
            }
            
            # Add event to polling queue
            if session_id in POLLING_EVENTS:
                logger.info(f'Adding auth_complete event to polling queue for session {session_id}')
                POLLING_EVENTS[session_id].append(event)
            
            # Also send through WebSocket if connected
            if session_id in WS_CONNECTIONS:
                logger.info(f'Sending auth_complete through WebSocket for session {session_id}')
                await WS_CONNECTIONS[session_id].send_json(event)
            
            return JSONResponse(content={'session_id': session_id})
        else:
            logger.error(f'PIN verification failed for session {session_id}: user entered {pin}, expected {correct_pin}')
            
            # Send auth_failed event through WebSocket
            if session_id in WS_CONNECTIONS:
                logger.info(f'Sending auth_failed through WebSocket for session {session_id}')
                try:
                    await WS_CONNECTIONS[session_id].send_json({
                        'type': 'auth_failed',
                        'timestamp': datetime.now().isoformat()
                    })
                    
                    # Add cleanup event to polling queue
                    if session_id in POLLING_EVENTS:
                        POLLING_EVENTS[session_id].append({
                            'type': 'cleanup_session',
                            'timestamp': datetime.now().isoformat()
                        })
                        
                    # Clean up session after browser has been notified
                    async def delayed_cleanup():
                        await asyncio.sleep(1)  # Give browser time to process the auth_failed event
                        if session_id in session_pins:
                            del session_pins[session_id]
                        if session_id in POLLING_EVENTS:
                            del POLLING_EVENTS[session_id]
                        if session_id in WS_CONNECTIONS:
                            del WS_CONNECTIONS[session_id]
                        # Remove from active_sessions
                        for username, sess_id in list(active_sessions.items()):
                            if sess_id == session_id:
                                del active_sessions[username]
                        logger.info(f'Cleaned up failed session {session_id}')
                    
                    # Schedule the cleanup
                    asyncio.create_task(delayed_cleanup())
                    
                except Exception as e:
                    logger.error(f'Error sending auth_failed event: {str(e)}')
            
            return JSONResponse(
                status_code=400,
                content={'error': 'Invalid PIN'}
            )
    except Exception as e:
        logger.error(f'Error verifying PIN: {str(e)}')
        return JSONResponse(
            status_code=500,
            content={'error': str(e)}
        )

@app.post("/update-pin")
async def update_pin(pin_data: dict):
    """Update the current valid PIN"""
    global CURRENT_PIN
    CURRENT_PIN = pin_data.get("pin")
    return {"status": "success"}

@app.get("/get-pin-options")
async def get_pin_options(request: Request, username: str = None):
    """Get PIN options for mobile device"""
    try:
        logger.info(f"Getting PIN options for username: {username}")
        if not username:
            logger.error("No username provided")
            return JSONResponse(
                status_code=400,
                content={"error": "Username is required"}
            )

        # Get session_id for this username
        session_id = active_sessions.get(username)
        logger.info(f"Found session_id: {session_id} for username: {username}")
        if not session_id:
            logger.error(f"No active session found for username: {username}")
            return JSONResponse(
                status_code=404,
                content={"error": "No active session found for username"}
            )

        # Get the correct PIN for this session
        correct_pin = session_pins.get(session_id)
        logger.info(f"Correct PIN for session: {correct_pin}")

        # Generate 3 completely random PINs
        pins = {correct_pin}  # Include the correct PIN
        while len(pins) < 3:
            pins.add(str(random.randint(10, 99)))
        
        # Convert to list and shuffle
        pin_options = list(pins)
        random.shuffle(pin_options)
        
        logger.info(f"Returning PIN options: {pin_options} including correct PIN: {correct_pin}")
        return {"pins": pin_options}
    except Exception as e:
        logger.error(f'Error generating PIN options: {str(e)}')
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to generate PIN options"}
        )

@app.post("/generate-pin")
async def generate_pin(request: Request):
    """Generate a new PIN for a client"""
    try:
        data = await request.json()
        client_id = data.get('client_id')
        if not client_id:
            logger.error('No client_id provided')
            return JSONResponse(
                status_code=400,
                content={"error": "No client_id provided"}
            )
            
        # Generate a random 2-digit PIN
        pin = str(random.randint(10, 99))
        logger.info(f'Generated PIN {pin} for client {client_id}')
        
        # Store the PIN with the client_id
        pins[client_id] = pin
        
        # Also update the current PIN for verification
        global CURRENT_PIN
        CURRENT_PIN = pin
        # Store this PIN for the step-up process
        step_up_id = str(uuid.uuid4())
        step_up_pins[step_up_id] = pin
        STEP_UP_TO_CLIENT[step_up_id] = client_id
        
        return JSONResponse(content={
            "pin": pin,
            "client_id": client_id,
            "step_up_id": step_up_id
        })
    except Exception as e:
        logger.error(f'Error generating PIN: {str(e)}')
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/cert-info")
async def get_cert_info():
    """Get a hash of the server's certificate public information"""
    try:
        context = SSL.Context(SSL.TLSv1_2_METHOD)
        connection = SSL.Connection(context)
        cert = connection.get_peer_certificate()
        
        # Only expose public information
        public_info = {
            "issuer": cert.get_issuer().get_components(),
            "subject": cert.get_subject().get_components(),
            "serial_number": cert.get_serial_number(),
            "not_before": cert.get_notBefore().decode(),
            "not_after": cert.get_notAfter().decode()
        }
        
        # Create a deterministic hash of the public info
        hash_input = str(public_info).encode()
        cert_hash = hashlib.sha256(hash_input).hexdigest()
        
        return {
            "cert_hash": cert_hash,
            "public_info": public_info
        }
    except Exception as e:
        logger.error(f"Error getting certificate info: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to get certificate information"}
        )

@app.post("/start-session")
async def start_session(request: Request):
    """Start a new session for a username"""
    try:
        data = await request.json()
        username = data.get('username')
        logger.info(f"Starting new session for username: {username}")
        
        if not username:
            logger.error("No username provided in start-session")
            return JSONResponse(
                status_code=400,
                content={"error": "Username is required"}
            )
        
        # Check if user already has an active session
        existing_session_id = active_sessions.get(username)
        if existing_session_id:
            logger.info(f"Found existing session for {username}: {existing_session_id}")
            # Generate new PIN for existing session
            new_pin = str(random.randint(10, 99))
            session_pins[existing_session_id] = new_pin
            logger.info(f"Generated new PIN for existing session: {new_pin}")
            return JSONResponse(content={
                "session_id": existing_session_id,
                "pin": new_pin
            })
        
        # Generate session ID and PIN
        session_id = str(uuid.uuid4())
        pin = str(random.randint(10, 99))
        logger.info(f"Generated new session_id: {session_id} with PIN: {pin}")
        
        # Store session information
        active_sessions[username] = session_id
        session_pins[session_id] = pin
        logger.info(f"Stored session mapping: {username} -> {session_id} -> {pin}")
        logger.info(f"Current active_sessions: {active_sessions}")
        logger.info(f"Current session_pins: {session_pins}")
        
        return JSONResponse(content={
            "session_id": session_id,
            "pin": pin
        })
    except Exception as e:
        logger.error(f'Error starting session: {str(e)}')
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/join-session")
async def join_session(username: str):
    """Get session info for a username if one exists"""
    try:
        logger.info(f"Checking for existing session for username: {username}")
        
        # Check if user has an active session
        session_id = active_sessions.get(username)
        if not session_id:
            logger.error(f"No active session found for username: {username}")
            return JSONResponse(
                status_code=404,
                content={"error": "No active session found"}
            )
        
        logger.info(f"Found active session: {session_id} for username: {username}")
        return JSONResponse(content={
            "session_id": session_id
        })
        
    except Exception as e:
        logger.error(f'Error joining session: {str(e)}')
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/poll-updates/{session_id}")
async def poll_updates(session_id: str):
    """Poll for updates for a given session"""
    try:
        logger.info(f'Polling updates for session: {session_id}')
        events = list(POLLING_EVENTS[session_id])
        # Clear events after retrieving them
        POLLING_EVENTS[session_id].clear()
        logger.info(f'Returning events: {events}')
        return JSONResponse(content={"events": events})
    except Exception as e:
        logger.error(f'Error polling updates: {str(e)}')
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.delete("/delete-session/{session_id}")
async def delete_session(session_id: str):
    """Delete a session and all its associated data"""
    try:
        logger.info(f'Deleting session: {session_id}')
        # Remove from session_pins
        if session_id in session_pins:
            del session_pins[session_id]
        
        # Remove from POLLING_EVENTS
        if session_id in POLLING_EVENTS:
            del POLLING_EVENTS[session_id]
        
        # Remove from WS_CONNECTIONS
        if session_id in WS_CONNECTIONS:
            del WS_CONNECTIONS[session_id]
        
        # Remove from active_sessions
        for username, sess_id in list(active_sessions.items()):
            if sess_id == session_id:
                del active_sessions[username]
        
        logger.info(f'Successfully deleted session {session_id}')
        return JSONResponse(content={'status': 'success'})
    except Exception as e:
        logger.error(f'Error deleting session: {str(e)}')
        return JSONResponse(
            status_code=500,
            content={'error': str(e)}
        )

@app.get("/sample", response_class=HTMLResponse)
async def sample(request: Request):
    """Serve sample integration page"""
    return templates.TemplateResponse("sample-integration.html", {
        "request": request,
        "show_footer": False
    })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 