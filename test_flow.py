import requests
import time

def test_step_up_flow():
    # Step 1: Get client ID (in real usage, this would come from the frontend)
    client_id = "test-client"  # You'll get this from the SSE connection
    
    # Step 2: Initiate step-up
    response = requests.post(f"http://localhost:8000/initiate-step-up/{client_id}")
    print("Step-up initiated:", response.json())
    
    # Wait a few seconds to simulate user interaction
    time.sleep(3)
    
    # Step 3: Complete step-up
    response = requests.post(f"http://localhost:8000/complete-step-up/{client_id}")
    print("Step-up completed:", response.json())

if __name__ == "__main__":
    test_step_up_flow() 