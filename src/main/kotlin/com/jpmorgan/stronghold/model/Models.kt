package com.jpmorgan.stronghold.model

data class SessionInfo(
    val sessionId: String,
    val pin: String
)

data class PinVerification(
    val pin: String,
    val sessionId: String
)

data class PinOptions(
    val pins: List<String>,
    val sessionId: String
)

data class WebSocketMessage(
    val type: String,
    val data: Map<String, Any>?
) 