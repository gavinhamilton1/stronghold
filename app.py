from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse, Response, HTMLResponse, RedirectResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sse_starlette.sse import EventSourceResponse
from typing import Dict, List
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
from starlette.middleware.base import BaseHTTPMiddleware

app = FastAPI()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Log request
        logger.info(f"Request: {request.method} {request.url}")
        
        # Log request body for POST/PUT requests
        if request.method in ["POST", "PUT"]:
            try:
                body = await request.body()
                if body:
                    try:
                        # Try to parse as JSON
                        json_body = json.loads(body)
                        logger.info(f"  {json.dumps(json_body, indent=2)}")
                    except:
                        # If not JSON, log as string
                        logger.info(f"  {body.decode()}")
            except Exception as e:
                logger.error(f"Error reading request body: {e}")
        
        # Process request and get response
        response = await call_next(request)
        
        # Log response
        logger.info(f"Response: {response.status_code}")
        
        return response

# Add logging middleware
app.add_middleware(LoggingMiddleware)

# Mount static files directory
app.mount("/static", StaticFiles(directory="v2/static", html=True), name="static")

# Setup templates
templates = Jinja2Templates(directory="v2/templates")

# Define allowed origins
ALLOWED_ORIGINS = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://stronghold-test.onrender.com",
    "http://localhost:3000"  # Add any other development/production domains
]

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    allow_origin_regex=".*"  # Allow all origins for iframe support
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
    try:
        await websocket.accept()
        logger.info(f"✅ WebSocket connection accepted for step_up_id: {step_up_id}")
        
        # Store the connection
        WS_CONNECTIONS[step_up_id] = websocket
        
        try:
            while True:
                message = await websocket.receive_json()
                logger.info(f"📩 Received message: {message}")
                
                if message.get('type') == 'auth_complete':
                    # Get the client_id from the mapping
                    client_id = STEP_UP_TO_CLIENT.get(step_up_id)
                    logger.info(f"Found client_id {client_id} for step_up_id {step_up_id}")
                    
                    if client_id:
                        # Send via SSE if available
                        if client_id in CONNECTIONS:
                            logger.info(f"Sending auth_complete via SSE to client: {client_id}")
                            await CONNECTIONS[client_id].put({
                                "event": "auth_complete",
                                "data": "{}"
                            })
                        
                        # Also add to polling queue
                        logger.info(f"Adding auth_complete to polling queue for client: {client_id}")
                        POLLING_EVENTS[client_id].append({
                            "type": "auth_complete",
                            "data": None
                        })
                    else:
                        logger.error(f"No client_id found for step_up_id: {step_up_id}")
                
        except WebSocketDisconnect:
            logger.info(f"👋 WebSocket connection closed for step_up_id: {step_up_id}")
            if step_up_id in WS_CONNECTIONS:
                del WS_CONNECTIONS[step_up_id]
        except Exception as e:
            logger.error(f"❌ Error processing WebSocket message: {str(e)}")
            # Don't close the connection on error
            pass
            
    except Exception as e:
        logger.error(f"❌ Error in WebSocket connection: {e}")
        raise

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
    # Initialize polling events queue for this client
    POLLING_EVENTS[client_id] = deque()
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

@app.post("/verify-pin-selection", response_class=JSONResponse)
async def verify_pin_selection(request: Request):
    """Verify selected PIN against session PIN"""
    try:
        data = await request.json()
        pin = str(data.get('pin'))
        username = data.get('username')
        
        # Get session ID for username
        session_id = active_sessions.get(username)
        logger.info(f"Verifying PIN for user {username} with session: {session_id}")
        
        if not username or not pin:
            return JSONResponse(
                status_code=400,
                content={"error": "Missing pin or username"}
            )
        
        # Get correct PIN for this session
        correct_pin = session_pins.get(session_id)
        
        if not correct_pin:
            return JSONResponse(
                status_code=404,
                content={"error": "Session not found"}
            )
        
        # Compare PINs
        success = pin == correct_pin
        logger.info(f"PIN verification {'successful' if success else 'failed'}")
        
        # If successful, notify browser via WebSocket
        if success:
            if session_id in WS_CONNECTIONS:
                await WS_CONNECTIONS[session_id].send_json({
                    "type": "auth_complete",
                    "data": {}
                })
        else:
            # Send failure to browser
            if session_id in WS_CONNECTIONS:
                await WS_CONNECTIONS[session_id].send_json({
                    "type": "auth_failed",
                    "data": {}
                })
        
        return JSONResponse(content={
            "success": success
        })
        
    except Exception as e:
        logger.error(f'Error verifying PIN: {str(e)}')
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to verify PIN"}
        )

@app.post("/auth-complete/{session_id}")
async def auth_complete(session_id: str):
    """Handle auth completion from mobile"""
    try:
        logger.info(f"Processing auth complete for session: {session_id}")
        logger.info(f"Current WebSocket connections: {list(WS_CONNECTIONS.keys())}")
        
        # Send via WebSocket if available
        if session_id in WS_CONNECTIONS:
            logger.info(f"Sending auth_complete via WebSocket to session: {session_id}")
            await WS_CONNECTIONS[session_id].send_json({
                "type": "auth_complete",
                "data": {}
            })
            logger.info("WebSocket message sent successfully")
        else:
            logger.warning(f"No WebSocket connection found for session: {session_id}")
            
        return JSONResponse(content={"status": "success"})
    except Exception as e:
        logger.error(f"Error completing auth: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 