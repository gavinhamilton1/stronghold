package com.jpmorgan.stronghold.websocket

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.jpmorgan.stronghold.model.WebSocketMessage
import com.jpmorgan.stronghold.annotation.TestVisible
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.handler.TextWebSocketHandler
import org.springframework.web.socket.CloseStatus

class WebSocketHandler : TextWebSocketHandler() {
    private val sessions = mutableMapOf<String, WebSocketSession>()
    private val mapper = jacksonObjectMapper()

    @TestVisible
    override fun afterConnectionEstablished(session: WebSocketSession) {
        val stepUpId = session.uri?.path?.substringAfterLast("/")
        if (stepUpId != null) {
            sessions[stepUpId] = session
        }
    }

    @TestVisible
    override fun handleTextMessage(session: WebSocketSession, message: TextMessage) {
        val msg = mapper.readValue(message.payload, WebSocketMessage::class.java)
        if (msg.type == "auth_complete") {
            session.sendMessage(TextMessage(mapper.writeValueAsString(
                WebSocketMessage("auth_complete", null)
            )))
        }
    }

    override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
        val stepUpId = session.uri?.path?.substringAfterLast("/")
        if (stepUpId != null) {
            sessions.remove(stepUpId)
        }
    }

    // Helper method for tests
    internal fun handleMessage(session: WebSocketSession, message: TextMessage) {
        handleTextMessage(session, message)
    }
} 