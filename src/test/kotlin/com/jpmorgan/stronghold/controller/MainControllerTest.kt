package com.jpmorgan.stronghold.controller

import com.jpmorgan.stronghold.model.*
import com.jpmorgan.stronghold.service.SessionService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.assertj.core.api.Assertions.assertThat

class MainControllerTest {
    private lateinit var sessionService: SessionService
    private lateinit var controller: MainController

    @BeforeEach
    fun setup() {
        sessionService = mockk(relaxed = true)
        controller = MainController(sessionService)
    }

    @Test
    fun `startSession calls service and returns session info`() {
        val request = StartSessionRequest("testUser")
        val expectedResponse = SessionInfo("session-123", "42")
        
        every { sessionService.startSession(request.username) } returns expectedResponse

        val result = controller.startSession(request)

        assertThat(result).isEqualTo(expectedResponse)
        verify { sessionService.startSession(request.username) }
    }

    @Test
    fun `getPinOptions calls service and returns options`() {
        val request = PinOptionsRequest("session-123")
        val expectedResponse = PinOptions(listOf("42", "13", "87"), "session-123")
        
        every { sessionService.getPinOptions(request.sessionId) } returns expectedResponse

        val result = controller.getPinOptions(request)

        assertThat(result).isEqualTo(expectedResponse)
        verify { sessionService.getPinOptions(request.sessionId) }
    }

    @Test
    fun `verifyPinSelection calls service and returns response`() {
        val request = PinVerification("42", "session-123")
        val expectedSuccess = true
        
        every { sessionService.verifyPin(request) } returns expectedSuccess

        val result = controller.verifyPinSelection(request)

        assertThat(result.success).isEqualTo(expectedSuccess)
        verify { sessionService.verifyPin(request) }
    }

    @Test
    fun `deleteSession calls service and returns success response`() {
        val sessionId = "session-123"
        
        every { sessionService.deleteSession(sessionId) } returns Unit

        val result = controller.deleteSession(sessionId)

        assertThat(result.status).isEqualTo("success")
        verify { sessionService.deleteSession(sessionId) }
    }
} 