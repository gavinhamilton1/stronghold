package com.jpmorgan.stronghold.websocket

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.jpmorgan.stronghold.model.WebSocketMessage
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.handler.TextWebSocketHandler

class WebSocketHandler : TextWebSocketHandler() {
    private val sessions = mutableMapOf<String, WebSocketSession>()
    private val mapper = jacksonObjectMapper()

    override fun afterConnectionEstablished(session: WebSocketSession) {
        val stepUpId = session.uri?.path?.substringAfterLast("/")
        if (stepUpId != null) {
            sessions[stepUpId] = session
        }
    }

    override fun handleTextMessage(session: WebSocketSession, message: TextMessage) {
        val msg = mapper.readValue(message.payload, WebSocketMessage::class.java)
        if (msg.type == "auth_complete") {
            // Handle auth completion
            session.sendMessage(TextMessage(mapper.writeValueAsString(
                WebSocketMessage("auth_complete", null)
            )))
        }
    }
} 