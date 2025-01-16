from fastapi import FastAPI, Request
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
    """
    Endpoint to initiate a step-up authentication.
    Generates a step-up ID and sends it through SSE.
    """
    print(f"Initiating step-up for client: {client_id}")
    if client_id not in CONNECTIONS:
        print(f"Client {client_id} not found in connections")
        return JSONResponse(
            status_code=404,
            content={"error": "Client connection not found"}
        )

    # Generate step-up ID
    step_up_id = str(uuid.uuid4())
    print(f"Generated step-up ID: {step_up_id}")

    # Send step-up initiated event - Simplified event structure
    event_data = {
        "event": "step_up_initiated",
        "data": step_up_id  # Send just the ID as data
    }
    print(f"Sending event: {event_data}")
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 