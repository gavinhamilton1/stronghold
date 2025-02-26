package com.jpmorgan.stronghold.controller

import com.jpmorgan.stronghold.model.*
import com.jpmorgan.stronghold.service.SessionService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import com.fasterxml.jackson.databind.ObjectMapper
import org.mockito.Mockito.`when`
import java.time.Instant
import com.jpmorgan.stronghold.config.TestSecurityConfig
import org.springframework.context.annotation.Import

@WebMvcTest(controllers = [MainController::class])
@Import(TestSecurityConfig::class)
@ActiveProfiles("test")
class MainControllerTest {
    @Autowired
    private lateinit var mockMvc: MockMvc

    @MockBean
    private lateinit var sessionService: SessionService

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @Test
    fun `start session returns session info with verification status`() {
        val request = StartSessionRequest(
            subjectId = "user123",
            type = AuthType.PIN_2D,
            transaction = null
        )
        val sessionInfo = SessionInfo(
            sessionId = "test-session",
            userCode = "42",
            subjectId = "user123",
            transaction = null,
            userCodeVerified = false,
            userCodeVerifiedAt = null
        )
        
        `when`(sessionService.startSession(request.subjectId, request.type, request.transaction))
            .thenReturn(sessionInfo)

        mockMvc.perform(post("/mobile-sign/start-session")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.sessionId").value("test-session"))
            .andExpect(jsonPath("$.userCode").value("42"))
            .andExpect(jsonPath("$.subjectId").value("user123"))
            .andExpect(jsonPath("$.userCodeVerified").value(false))
            .andExpect(jsonPath("$.userCodeVerifiedAt").doesNotExist())
    }

    @Test
    fun `verify user code returns success response when verified`() {
        val verification = UserCodeVerification("42", "test-session")
        `when`(sessionService.verifyUserCode(verification)).thenReturn(true)

        mockMvc.perform(post("/mobile-sign/verify-user-code")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(verification)))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.verifiedAt").exists())
    }

    @Test
    fun `get user code options returns options for PIN_2D session`() {
        val sessionId = "test-session"
        val options = UserCodeOptions(
            userCodes = listOf("42", "13", "87"),
            sessionId = sessionId
        )
        
        `when`(sessionService.getUserCodeOptions(sessionId)).thenReturn(options)

        mockMvc.perform(get("/mobile-sign/sessions/$sessionId/user-code-options"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.userCodes").isArray)
            .andExpect(jsonPath("$.userCodes.length()").value(3))
            .andExpect(jsonPath("$.sessionId").value(sessionId))
    }

    @Test
    fun `get user code options returns 400 for non-PIN_2D session`() {
        val sessionId = "test-session"
        `when`(sessionService.getUserCodeOptions(sessionId))
            .thenThrow(IllegalStateException("User code options only available for PIN_2D authentication type"))

        mockMvc.perform(get("/mobile-sign/sessions/$sessionId/user-code-options"))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.status").value("error"))
            .andExpect(jsonPath("$.message").value("User code options only available for PIN_2D authentication type"))
    }

    @Test
    fun `store payload succeeds for verified session`() {
        val request = SignedPayloadRequest("test-session", "test-payload")

        mockMvc.perform(post("/mobile-sign/store-payload")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("success"))
    }

    @Test
    fun `store payload fails with 400 when code not verified`() {
        val request = SignedPayloadRequest("test-session", "test-payload")
        `when`(sessionService.storeSignedPayload(request.sessionId, request.signedPayload))
            .thenThrow(IllegalStateException("Cannot store payload: user code has not been verified"))

        mockMvc.perform(post("/mobile-sign/store-payload")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.status").value("error"))
            .andExpect(jsonPath("$.message").value("Cannot store payload: user code has not been verified"))
    }

    @Test
    fun `delete session returns success response`() {
        val sessionId = "test-session"

        mockMvc.perform(delete("/mobile-sign/sessions/$sessionId"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("success"))
    }
} 