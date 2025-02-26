package com.jpmorgan.stronghold.service

import com.jpmorgan.stronghold.model.PinOptionsRequest
import com.jpmorgan.stronghold.model.PinVerification
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.assertThrows
import org.assertj.core.api.Assertions.assertThat
import java.util.NoSuchElementException

class SessionServiceTest {
    private lateinit var sessionService: SessionService

    @BeforeEach
    fun setup() {
        sessionService = SessionService()
    }

    @Test
    fun `startSession creates new session with PIN`() {
        val username = "testUser"
        val result = sessionService.startSession(username)

        assertThat(result.sessionId).isNotEmpty()
        assertThat(result.pin).matches("\\d{2}")  // Two digit PIN
    }

    @Test
    fun `getPinOptions returns correct number of options including actual PIN`() {
        // Start a session first
        val username = "testUser"
        val session = sessionService.startSession(username)
        
        // Get PIN options
        val options = sessionService.getPinOptions(session.sessionId)

        assertThat(options.pins).hasSize(3)
        assertThat(options.pins).contains(session.pin)
        assertThat(options.sessionId).isEqualTo(session.sessionId)
    }

    @Test
    fun `getPinOptions throws exception for invalid session`() {
        assertThrows<NoSuchElementException> {
            sessionService.getPinOptions("invalid-session-id")
        }
    }

    @Test
    fun `verifyPin returns true for correct PIN`() {
        // Start a session
        val username = "testUser"
        val session = sessionService.startSession(username)
        
        // Verify correct PIN
        val result = sessionService.verifyPin(
            PinVerification(pin = session.pin, sessionId = session.sessionId)
        )

        assertThat(result).isTrue()
    }

    @Test
    fun `verifyPin returns false for incorrect PIN`() {
        // Start a session
        val username = "testUser"
        val session = sessionService.startSession(username)
        
        // Verify incorrect PIN
        val result = sessionService.verifyPin(
            PinVerification(pin = "99", sessionId = session.sessionId)
        )

        assertThat(result).isFalse()
    }

    @Test
    fun `verifyPin returns false for invalid session`() {
        val result = sessionService.verifyPin(
            PinVerification(pin = "12", sessionId = "invalid-session")
        )

        assertThat(result).isFalse()
    }

    @Test
    fun `deleteSession removes session and PIN`() {
        // Start a session
        val username = "testUser"
        val session = sessionService.startSession(username)
        
        // Delete session
        sessionService.deleteSession(session.sessionId)
        
        // Verify session is deleted
        assertThrows<NoSuchElementException> {
            sessionService.getPinOptions(session.sessionId)
        }
    }
} 