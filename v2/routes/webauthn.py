from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict
import base64
import os
import logging
import json
import cbor2

logger = logging.getLogger(__name__)

def base64url_decode(encoded: str) -> bytes:
    """Decode base64url without padding"""
    padding = '=' * (4 - (len(encoded) % 4))
    return base64.urlsafe_b64decode(encoded + padding)

def base64url_encode(data: bytes) -> str:
    """Encode bytes as base64url without padding"""
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')

def parse_auth_data(auth_data: bytes):
    """Parse authenticator data bytes"""
    # First 32 bytes are the RP ID hash
    offset = 32
    # Next byte is the flags
    flags = auth_data[offset]
    offset += 1
    # Next 4 bytes are the signature counter
    sign_count = int.from_bytes(auth_data[offset:offset + 4], byteorder='big')
    offset += 4
    
    # If attested credential data present
    if flags & 0x40:
        # 16 bytes for AAGUID
        aaguid = auth_data[offset:offset + 16]
        offset += 16
        # 2 bytes for credential ID length
        id_len = int.from_bytes(auth_data[offset:offset + 2], byteorder='big')
        offset += 2
        # Credential ID
        credential_id = auth_data[offset:offset + id_len]
        offset += id_len
        # Remaining bytes are CBOR-encoded public key
        public_key = auth_data[offset:]
        
        return {
            'rpIdHash': auth_data[:32],
            'flags': flags,
            'signCount': sign_count,
            'aaguid': aaguid,
            'credentialId': credential_id,
            'publicKey': public_key
        }
    
    return {
        'rpIdHash': auth_data[:32],
        'flags': flags,
        'signCount': sign_count
    }

router = APIRouter()

# Models
class AttestationData(BaseModel):
    clientDataJSON: str
    attestationObject: str

class RegistrationData(BaseModel):
    attestation: AttestationData
    browserIdentityKey: Dict

class AssertionData(BaseModel):
    id: str
    clientDataJSON: str
    authenticatorData: str
    signature: str

class GetSekRequest(BaseModel):
    assertion: AssertionData

# In-memory storage by username
passkey_store = {}
credential_store = {}  # Store by credential ID

@router.get("/check-passkey/{username}")
async def check_passkey(username: str):
    """Check if a passkey exists for the given username"""
    try:
        if username in passkey_store:
            return {"exists": True}
        return {"exists": False}
    except Exception as e:
        logger.error(f"Error checking passkey: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/register-passkey")
async def register_passkey(registration_data: RegistrationData):
    try:
        logger.info("=== Starting passkey registration ===")
        logger.info(f"Received registration data: {json.dumps(registration_data.dict(), indent=2)}")

        # Decode attestation data
        logger.info("Decoding attestation data...")
        client_data_bytes = base64url_decode(registration_data.attestation.clientDataJSON)
        attestation_bytes = base64url_decode(registration_data.attestation.attestationObject)
        
        # Parse attestation object
        attestation_obj = cbor2.loads(attestation_bytes)
        auth_data = parse_auth_data(attestation_obj['authData'])
        
        # Get credential ID from auth data
        credential_id = base64url_encode(auth_data['credentialId'])
        logger.info(f"Credential ID: {credential_id}")
        
        # Generate Session Encryption Key (SEK)
        logger.info("Generating SEK...")
        sek = os.urandom(32)  # 256-bit key
        
        # TODO: Encrypt SEK with BIK public key
        # For now, just return it directly (not secure!)
        encrypted_sek = sek
        iv = os.urandom(12)
        
        credential_store[credential_id] = {
            'bik': registration_data.browserIdentityKey,
            'encryptedSEK': base64.urlsafe_b64encode(encrypted_sek).decode('ascii'),
            'iv': base64.urlsafe_b64encode(iv).decode('ascii')
        }
        
        logger.info("Preparing response...")
        response_data = {
            "encryptedSEK": base64.urlsafe_b64encode(encrypted_sek).decode('ascii'),
            "iv": base64.urlsafe_b64encode(iv).decode('ascii')
        }
        logger.info(f"Sending response: {response_data}")
        return response_data

    except Exception as e:
        logger.error(f"Error in register_passkey:")
        logger.error(f"Error type: {type(e)}")
        logger.error(f"Error message: {str(e)}")
        logger.error(f"Error traceback:", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/get-sek")
async def get_sek(request: GetSekRequest):
    try:
        logger.info("=== Getting SEK for existing passkey ===")
        logger.info(f"Received assertion: {json.dumps(request.dict(), indent=2)}")
        
        # Verify the assertion
        client_data_bytes = base64url_decode(request.assertion.clientDataJSON)
        auth_data_bytes = base64url_decode(request.assertion.authenticatorData)
        signature_bytes = base64url_decode(request.assertion.signature)
        
        # TODO: Verify signature
        
        # Get stored SEK for this credential
        credential_id = request.assertion.id
        if credential_id not in credential_store:
            raise HTTPException(status_code=404, detail="SEK not found for credential")
            
        sek_data = credential_store[credential_id]
        
        return {
            "encryptedSEK": sek_data["encryptedSEK"],
            "iv": sek_data["iv"]
        }
        
    except Exception as e:
        logger.error(f"Error getting SEK:")
        logger.error(f"Error type: {type(e)}")
        logger.error(f"Error message: {str(e)}")
        logger.error(f"Error traceback:", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/list-credentials")
async def list_credentials():
    """Return list of known credential IDs"""
    try:
        return list(credential_store.keys())
    except Exception as e:
        logger.error(f"Error listing credentials: {e}")
        raise HTTPException(status_code=500, detail=str(e)) 