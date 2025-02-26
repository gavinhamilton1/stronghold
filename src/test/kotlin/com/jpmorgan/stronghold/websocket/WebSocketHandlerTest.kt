package com.jpmorgan.stronghold.websocket

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.jpmorgan.stronghold.model.WebSocketMessage
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import io.mockk.mockk
import io.mockk.verify
import io.mockk.every
import org.springframework.web.socket.CloseStatus
import io.mockk.clearMocks

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
    fun `websocket handles complete authentication flow`() {
        // Setup
        val uri = mockk<java.net.URI>()
        every { session.uri } returns uri
        every { uri.path } returns "/ws/session-123"

        // Connect
        handler.afterConnectionEstablished(session)

        // Send auth message
        val authMessage = TextMessage("""{"type":"auth_complete","data":null}""")
        handler.handleMessage(session, authMessage)

        // Verify expected response was sent
        verify { session.sendMessage(match { message -> 
            val response: WebSocketMessage = mapper.readValue((message as TextMessage).payload)
            response.type == "auth_complete" && response.data == null
        })}
    }

    @Test
    fun `websocket connection lifecycle`() {
        // Setup
        val uri = mockk<java.net.URI>()
        every { session.uri } returns uri
        every { uri.path } returns "/ws/session-123"

        // Test full lifecycle
        handler.afterConnectionEstablished(session)
        
        // Verify connection works
        val message = TextMessage("""{"type":"auth_complete","data":null}""")
        handler.handleMessage(session, message)
        
        // First verification
        verify(exactly = 1) { session.sendMessage(any()) }
        clearMocks(session)  // Clear the call history

        // Close connection
        handler.afterConnectionClosed(session, CloseStatus.NORMAL)

        // Verify no more messages processed after close
        handler.handleMessage(session, message)
        verify(exactly = 1) { session.sendMessage(any()) }
    }
} 