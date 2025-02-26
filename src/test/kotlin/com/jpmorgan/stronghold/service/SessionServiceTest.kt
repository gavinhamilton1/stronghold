package com.jpmorgan.stronghold.service

import com.jpmorgan.stronghold.entity.SessionEntity
import com.jpmorgan.stronghold.model.AuthType
import com.jpmorgan.stronghold.model.UserCodeVerification
import com.jpmorgan.stronghold.repository.SessionRepository
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.kotlin.any
import org.mockito.kotlin.whenever
import java.util.Optional
import java.time.Instant
import org.assertj.core.api.Assertions.assertThat

class SessionServiceTest {
    private lateinit var sessionService: SessionService
    private lateinit var sessionRepository: SessionRepository
    private lateinit var objectMapper: ObjectMapper

    @BeforeEach
    fun setup() {
        sessionRepository = mock(SessionRepository::class.java)
        objectMapper = ObjectMapper()
        sessionService = SessionService(sessionRepository, objectMapper)
    }

    @Test
    fun `startSession creates session with correct verification status`() {
        val subjectId = "user123"
        val type = AuthType.PIN_2D
        
        whenever(sessionRepository.save(any())).thenAnswer { it.arguments[0] }
        
        val result = sessionService.startSession(subjectId, type, null)
        
        assertThat(result.userCodeVerified).isFalse()
        assertThat(result.userCodeVerifiedAt).isNull()
        assertThat(result.subjectId).isEqualTo(subjectId)
        assertThat(result.userCode).matches("[0-9]{2}")
    }

    @Test
    fun `verifyUserCode updates verification status when correct`() {
        val sessionId = "test-session"
        val userCode = "42"
        val session = SessionEntity(
            sessionId = sessionId,
            subjectId = "user123",
            userCode = userCode,
            authType = AuthType.PIN_2D,
            transactionData = null
        )
        
        whenever(sessionRepository.findById(sessionId)).thenReturn(Optional.of(session))
        whenever(sessionRepository.save(any())).thenAnswer { it.arguments[0] }
        
        val result = sessionService.verifyUserCode(UserCodeVerification(userCode, sessionId))
        
        assertThat(result).isTrue()
        assertThat(session.userCodeVerified).isTrue()
        assertThat(session.userCodeVerifiedAt).isNotNull()
    }

    @Test
    fun `verifyUserCode fails with incorrect code`() {
        val sessionId = "test-session"
        val session = SessionEntity(
            sessionId = sessionId,
            subjectId = "user123",
            userCode = "42",
            authType = AuthType.PIN_2D,
            transactionData = null
        )
        
        whenever(sessionRepository.findById(sessionId)).thenReturn(Optional.of(session))
        
        val result = sessionService.verifyUserCode(UserCodeVerification("wrong-code", sessionId))
        
        assertThat(result).isFalse()
        assertThat(session.userCodeVerified).isFalse()
        assertThat(session.userCodeVerifiedAt).isNull()
    }

    @Test
    fun `storeSignedPayload succeeds for verified PIN_2D session`() {
        val sessionId = "test-session"
        val session = SessionEntity(
            sessionId = sessionId,
            subjectId = "user123",
            userCode = "42",
            authType = AuthType.PIN_2D,
            transactionData = null
        ).apply {
            userCodeVerified = true
            userCodeVerifiedAt = Instant.now()
        }
        
        whenever(sessionRepository.findById(sessionId)).thenReturn(Optional.of(session))
        whenever(sessionRepository.save(any())).thenAnswer { it.arguments[0] }
        
        sessionService.storeSignedPayload(sessionId, "test-payload")
        
        assertThat(session.signedPayload).isEqualTo("test-payload")
    }

    @Test
    fun `storeSignedPayload fails for unverified PIN_2D session`() {
        val sessionId = "test-session"
        val session = SessionEntity(
            sessionId = sessionId,
            subjectId = "user123",
            userCode = "42",
            authType = AuthType.PIN_2D,
            transactionData = null
        )
        
        whenever(sessionRepository.findById(sessionId)).thenReturn(Optional.of(session))
        
        assertThrows<IllegalStateException> {
            sessionService.storeSignedPayload(sessionId, "test-payload")
        }
    }

    @Test
    fun `storeSignedPayload succeeds for SILENT auth type without verification`() {
        val sessionId = "test-session"
        val session = SessionEntity(
            sessionId = sessionId,
            subjectId = "user123",
            userCode = null,
            authType = AuthType.SILENT,
            transactionData = null
        )
        
        whenever(sessionRepository.findById(sessionId)).thenReturn(Optional.of(session))
        whenever(sessionRepository.save(any())).thenAnswer { it.arguments[0] }
        
        sessionService.storeSignedPayload(sessionId, "test-payload")
        
        assertThat(session.signedPayload).isEqualTo("test-payload")
    }

    @Test
    fun `getUserCodeOptions fails for non-PIN_2D session`() {
        val sessionId = "test-session"
        val session = SessionEntity(
            sessionId = sessionId,
            subjectId = "user123",
            userCode = "12345678",
            authType = AuthType.PIN_8D,
            transactionData = null
        )
        
        whenever(sessionRepository.findById(sessionId)).thenReturn(Optional.of(session))
        
        assertThrows<IllegalStateException> {
            sessionService.getUserCodeOptions(sessionId)
        }
    }

    @Test
    fun `getUserCodeOptions returns three unique 2-digit codes for PIN_2D session`() {
        val sessionId = "test-session"
        val session = SessionEntity(
            sessionId = sessionId,
            subjectId = "user123",
            userCode = "42",
            authType = AuthType.PIN_2D,
            transactionData = null
        )
        
        whenever(sessionRepository.findById(sessionId)).thenReturn(Optional.of(session))
        
        val result = sessionService.getUserCodeOptions(sessionId)
        
        assertThat(result.userCodes).hasSize(3)
        assertThat(result.userCodes).contains(session.userCode)
        assertThat(result.userCodes).allMatch { it.length == 2 && it.toIntOrNull() != null }
    }

    @Test
    fun `deleteSession removes session`() {
        val sessionId = "test-session"
        
        sessionService.deleteSession(sessionId)
        
        verify(sessionRepository).deleteById(sessionId)
    }
} 