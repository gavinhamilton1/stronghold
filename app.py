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
from pathlib import Path
import json
from fastapi.logger import logger
import logging
from pywebpush import webpush, WebPushException

app = FastAPI()

# Mount static files directories for both versions
app.mount("/v1/static", StaticFiles(directory="v1/static"), name="v1_static")
app.mount("/v2/static", StaticFiles(directory="v2/static"), name="v2_static")
app.mount("/static", StaticFiles(directory="v2/static"), name="static")  # Default to v2

# Setup templates for both versions
templates_v1 = Jinja2Templates(directory="v1/templates")
templates_v2 = Jinja2Templates(directory="v2/templates")

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
    "sub": "mailto:gavin@gbag.co.uk"  # Change this to your email
}

# Add this with other global variables
POLLING_EVENTS = defaultdict(lambda: deque(maxlen=100))

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Redirect root to v2"""
    return RedirectResponse(url="/v2")

@app.get("/v1", response_class=HTMLResponse)
async def home_v1(request: Request):
    """Serve v1 page"""
    return templates_v1.TemplateResponse("index.html", {"request": request})

@app.get("/v2", response_class=HTMLResponse)
async def home_v2(request: Request):
    """Serve v2 page"""
    return templates_v2.TemplateResponse("index.html", {"request": request})

@app.get("/v1/mobile", response_class=HTMLResponse)
async def mobile_v1(request: Request):
    """Serve the v1 mobile page"""
    return templates_v1.TemplateResponse("mobile.html", {"request": request})

@app.get("/v2/mobile", response_class=HTMLResponse)
async def mobile_v2(request: Request):
    """Serve the v2 mobile page"""
    return templates_v2.TemplateResponse("mobile.html", {"request": request})

@app.get("/mobile", response_class=HTMLResponse)
async def mobile(request: Request):
    """Redirect mobile to v2/mobile"""
    return RedirectResponse(url="/v2/mobile")

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
    logger.info(f"🔄 Initiating step-up for client: {client_id}")
    step_up_id = str(uuid.uuid4())
    
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
    
    # Store mapping between step-up ID and client ID
    if client_id in CONNECTIONS:
        CONNECTIONS[step_up_id] = CONNECTIONS[client_id]
    
    return {"status": "success", "step_up_id": step_up_id}

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
        
        # Log active connections
        logger.info(f"📊 Active WebSocket connections: {list(WS_CONNECTIONS.keys())}")
        logger.info(f"📊 Active SSE connections: {list(CONNECTIONS.keys())}")
        
        while True:
            try:
                data = await websocket.receive_json()
                logger.info(f"📥 Received WebSocket message for {step_up_id}: {data}")
                
                if data["type"] == "auth_complete":
                    # Send auth complete event to browser
                    if step_up_id in CONNECTIONS:
                        logger.info(f"🔐 Sending auth complete event for {step_up_id}")
                        await CONNECTIONS[step_up_id].put({
                            "event": "auth_complete",
                            "data": "{}"
                        })
                elif data["type"] == "message":
                    logger.info(f"💬 Processing message type event for {step_up_id}")
                    # Forward message to SSE connection
                    if step_up_id in CONNECTIONS:
                        logger.info(f"➡️ Forwarding message to SSE connection: {data['content']}")
                        await CONNECTIONS[step_up_id].put({
                            "event": "mobile_message",
                            "data": data["content"]
                        })
                    else:
                        logger.warning(f"❌ No SSE connection found for step_up_id: {step_up_id}")
                        logger.warning(f"❌ Available SSE connections: {list(CONNECTIONS.keys())}")
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 