from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from typing import Dict, List
import uuid
import random
from fastapi import WebSocket
from fastapi.websockets import WebSocketDisconnect
from datetime import datetime

app = FastAPI()

# Mount static files directory
app.mount("/static", StaticFiles(directory="v2/static", html=True), name="static")

# Setup templates
templates = Jinja2Templates(directory="v2/templates")

# Store active sessions
active_sessions: Dict[str, str] = {}
session_pins: Dict[str, str] = {}
# Store WebSocket connections
ws_connections: Dict[str, WebSocket] = {}

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket
    
    async def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]
    
    async def send_message(self, session_id: str, message: dict):
        if session_id in self.active_connections:
            await self.active_connections[session_id].send_json(message)

manager = ConnectionManager()

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    try:
        await manager.connect(websocket, session_id)
        
        while True:
            try:
                data = await websocket.receive_json()
                if data.get("type") == "auth_complete":
                    await manager.send_message(session_id, {
                        "type": "auth_complete",
                        "timestamp": str(datetime.now())
                    })
            except WebSocketDisconnect:
                await manager.disconnect(session_id)
                break
    except Exception as e:
        print(f"WebSocket error: {e}")
        await manager.disconnect(session_id)

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {
        "request": request,
        "show_footer": True
    })

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {
        "request": request
    })

@app.get("/payment", response_class=HTMLResponse)
async def payment(request: Request):
    return templates.TemplateResponse("payment.html", {
        "request": request
    })

@app.get("/pincode", response_class=HTMLResponse)
async def pincode(request: Request):
    username = request.query_params.get('username')
    return templates.TemplateResponse("pincode.html", {
        "request": request,
        "username": username
    })

@app.post("/start-session")
async def start_session(request: Request):
    data = await request.json()
    username = data.get('username')
    
    if not username:
        return JSONResponse(
            status_code=400,
            content={"error": "Username is required"}
        )
    
    # Generate session ID and PIN
    session_id = str(uuid.uuid4())
    pin = str(random.randint(10, 99))
    
    # Store session information
    active_sessions[username] = session_id
    session_pins[session_id] = pin
    
    return JSONResponse(content={
        "session_id": session_id,
        "pin": pin
    })

@app.get("/mobile", response_class=HTMLResponse)
async def mobile(request: Request):
    return templates.TemplateResponse("mobile.html", {
        "request": request,
        "show_footer": True
    }) 