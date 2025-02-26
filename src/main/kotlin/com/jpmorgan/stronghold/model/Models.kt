package com.jpmorgan.stronghold.model

import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant

enum class AuthType {
    QR_CODE,
    USER_CODE,
    PIN_2D,
    PIN_8D,
    SILENT
}

@Schema(description = "Session information")
data class SessionInfo(
    @Schema(description = "Unique session identifier", example = "123e4567-e89b-12d3-a456-426614174000")
    val sessionId: String,
    
    @Schema(description = "User code (null for SILENT type)", 
           example = "12345678", 
           nullable = true)
    val userCode: String?,
    
    @Schema(description = "Subject identifier", example = "user123")
    val subjectId: String,
    
    @Schema(description = "Transaction details", example = "{\"id\": 12345, \"amount\": 100, \"currency\": \"USD\"}")
    val transaction: Map<String, Any>?,
    
    @Schema(description = "Whether the user code has been verified", example = "false")
    val userCodeVerified: Boolean,
    
    @Schema(description = "When the user code was verified", 
           example = "2024-02-26T12:34:56.789Z",
           nullable = true)
    val userCodeVerifiedAt: Instant?
)

@Schema(description = "User code verification request")
data class UserCodeVerification(
    @Schema(description = "User code to verify", example = "12345678", nullable = true)
    val userCode: String?,
    
    @Schema(description = "Session ID", example = "123e4567-e89b-12d3-a456-426614174000")
    val sessionId: String
)

@Schema(description = "Available user code options")
data class UserCodeOptions(
    @Schema(
        description = "List of user code options (2-digit PINs)", 
        example = "[\"42\", \"13\", \"87\"]"
    )
    val userCodes: List<String>,
    
    @Schema(description = "Session ID", example = "123e4567-e89b-12d3-a456-426614174000")
    val sessionId: String
)

@Schema(description = "WebSocket message")
data class WebSocketMessage(
    @Schema(description = "Message type", example = "auth_complete")
    val type: String,
    
    @Schema(description = "Optional message data")
    val data: Map<String, Any>?
)

@Schema(description = "Session start request")
data class StartSessionRequest(
    @Schema(description = "Subject identifier", example = "user123")
    val subjectId: String,
    
    @Schema(description = "Authentication type", example = "QR_CODE", 
           allowableValues = ["QR_CODE", "USER_CODE", "PIN_2D", "PIN_8D", "SILENT"])
    val type: AuthType,
    
    @Schema(description = "Transaction details", example = "{\"id\": 12345, \"amount\": 100, \"currency\": \"USD\"}")
    val transaction: Map<String, Any>?
)

@Schema(description = "User code verification response")
data class UserCodeVerificationResponse(
    @Schema(description = "Whether the user code verification was successful", 
           example = "true")
    val success: Boolean,
    
    @Schema(description = "When the verification occurred", 
           example = "2024-02-26T12:34:56.789Z",
           nullable = true)
    val verifiedAt: Instant?
)

@Schema(description = "Delete session response")
data class DeleteSessionResponse(
    @Schema(description = "Status of the delete operation", example = "success")
    val status: String
)

@Schema(description = "Signed payload request")
data class SignedPayloadRequest(
    @Schema(description = "Session ID", example = "123e4567-e89b-12d3-a456-426614174000")
    val sessionId: String,
    
    @Schema(
        description = "Signed JWT payload",
        example = """
            {
                "user_code": "12345678",
                "user_action": "APPROVE_TRANSACTION",
                "txn": {
                    "id": "123456789",
                    "key": "value"
                },
                "timestamp": "1747872000",
                "oauth_token": {
                    "token": "eyJhbGciOiJIUzI1NiJ9...",
                    "public_key": "base64url(oauth_pubkey.pem) or JWKS object"
                },
                "stronghold_token": {
                    "token": "eyJraWQiOiJzdHJvbmdob2xkLi4.",
                    "signature": "base64(signed_stronghold_token)",
                    "public_key": "base64url(stronghold_pubkey)"
                },
                "signature": "base64(signed_txn)",
                "device_public_key": "base64(device_pubkey.pem)",
                "txn_hash": {
                    "algorithm": "SHA-256",
                    "hash": "base64(sha256(payload_without_txn_hash))"
                }
            }
        """
    )
    val signedPayload: String
) 