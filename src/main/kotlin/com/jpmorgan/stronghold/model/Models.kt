package com.jpmorgan.stronghold.model

import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "Session information")
data class SessionInfo(
    @Schema(description = "Unique session identifier", example = "123e4567-e89b-12d3-a456-426614174000")
    val sessionId: String,
    
    @Schema(description = "Two-digit PIN code", example = "42")
    val pin: String
)

@Schema(description = "PIN verification request")
data class PinVerification(
    @Schema(description = "PIN to verify", example = "42")
    val pin: String,
    
    @Schema(description = "Session ID", example = "123e4567-e89b-12d3-a456-426614174000")
    val sessionId: String
)

@Schema(description = "Available PIN options")
data class PinOptions(
    @Schema(description = "List of PIN options", example = "[\"42\", \"13\", \"87\"]")
    val pins: List<String>,
    
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
    @Schema(description = "Username to start session for", example = "jsmith")
    val username: String
)

@Schema(description = "PIN options request")
data class PinOptionsRequest(
    @Schema(description = "Session ID to get PIN options for", 
           example = "123e4567-e89b-12d3-a456-426614174000")
    val sessionId: String
)

@Schema(description = "PIN verification response")
data class PinVerificationResponse(
    @Schema(description = "Whether the PIN verification was successful", 
           example = "true")
    val success: Boolean
)

@Schema(description = "Delete session response")
data class DeleteSessionResponse(
    @Schema(description = "Status of the delete operation", example = "success")
    val status: String
) 