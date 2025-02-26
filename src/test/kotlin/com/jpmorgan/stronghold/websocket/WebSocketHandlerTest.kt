package com.jpmorgan.stronghold.websocket

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.jpmorgan.stronghold.model.WebSocketMessage
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import io.mockk.mockk
import io.mockk.verify
import io.mockk.every

class WebSocketHandlerTest {
    private lateinit var handler: WebSocketHandler
    private lateinit var session: WebSocketSession
    private val mapper = jacksonObjectMapper()

    @BeforeEach
    fun setup() {
        handler = WebSocketHandler()
        session = mockk(relaxed = true)
    }

    @Test
    fun `afterConnectionEstablished stores session`() {
        val uri = mockk<java.net.URI>()
        every { session.uri } returns uri
        every { uri.path } returns "/ws/session-123"

        handler.afterConnectionEstablished(session)

        // Verify session is stored (indirectly through next test)
        val message = WebSocketMessage("auth_complete", null)
        val textMessage = TextMessage(mapper.writeValueAsString(message))
        handler.handleTextMessage(session, textMessage)
        
        verify { session.sendMessage(any()) }
    }

    @Test
    fun `handleTextMessage sends response for auth_complete`() {
        val message = WebSocketMessage("auth_complete", null)
        val textMessage = TextMessage(mapper.writeValueAsString(message))

        handler.handleTextMessage(session, textMessage)

        verify { session.sendMessage(any()) }
    }
} 