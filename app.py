from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse, Response, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sse_starlette.sse import EventSourceResponse
from typing import Dict
import uuid
import asyncio
from collections import defaultdict
from pathlib import Path
import json
from fastapi.logger import logger
import logging

app = FastAPI()

# Mount static files directory
app.mount("/static", StaticFiles(directory="static"), name="static")

# Setup templates
templates = Jinja2Templates(directory="templates")

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

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Serve the demo page"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/register-sse")
async def register_sse(request: Request):
    """
    Endpoint for registering SSE connections.
    Returns a client_id that should be used for future requests.
    """
    client_id = str(uuid.uuid4())
    
    # Create the queue immediately
    CONNECTIONS[client_id] = asyncio.Queue()
    print(f"Created new connection for client: {client_id}")
    
    async def event_generator():
        try:
            # Send initial message with client ID
            yield {
                "data": json.dumps({"client_id": client_id})
            }
            
            while True:
                message = await CONNECTIONS[client_id].get()
                print(f"Sending message to client {client_id}: {message}")
                if message.get("type") == "close":
                    break
                data = json.dumps(message["data"])
                yield {
                    "event": message["event"],
                    "data": data
                }
        except asyncio.CancelledError:
            pass
        finally:
            CONNECTIONS.pop(client_id, None)
            print(f"Cleaned up connection for client: {client_id}")

    return EventSourceResponse(event_generator())

@app.post("/initiate-step-up/{client_id}")
async def initiate_step_up(client_id: str):
    logger.info(f"🔄 Initiating step-up for client: {client_id}")
    if client_id not in CONNECTIONS:
        logger.warning(f"❌ Client {client_id} not found in connections")
        return JSONResponse(
            status_code=404,
            content={"error": "Client connection not found"}
        )

    # Generate step-up ID
    step_up_id = str(uuid.uuid4())
    logger.info(f"🆔 Generated step-up ID: {step_up_id}")

    # Store mapping between step-up ID and client ID
    CONNECTIONS[step_up_id] = CONNECTIONS[client_id]
    logger.info(f"🔗 Mapped step-up ID to client ID: {step_up_id} -> {client_id}")

    # Send step-up initiated event
    event_data = {
        "event": "step_up_initiated",
        "data": step_up_id
    }
    logger.info(f"📤 Sending event: {event_data}")
    await CONNECTIONS[client_id].put(event_data)

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
                
                if data["type"] == "message":
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

@app.get("/mobile")
async def mobile(request: Request):
    """Serve the mobile page"""
    return templates.TemplateResponse("mobile.html", {"request": request})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 