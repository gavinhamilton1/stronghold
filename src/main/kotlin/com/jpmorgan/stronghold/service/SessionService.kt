package com.jpmorgan.stronghold.service

import com.jpmorgan.stronghold.model.SessionInfo
import com.jpmorgan.stronghold.model.UserCodeOptions
import com.jpmorgan.stronghold.model.UserCodeVerification
import org.springframework.stereotype.Service
import java.util.*
import kotlin.random.Random
import com.fasterxml.jackson.databind.ObjectMapper
import com.jpmorgan.stronghold.entity.SessionEntity
import com.jpmorgan.stronghold.repository.SessionRepository
import mu.KotlinLogging
import org.springframework.transaction.annotation.Transactional
import com.jpmorgan.stronghold.model.AuthType
import java.time.Instant

private val logger = KotlinLogging.logger {}

@Service
class SessionService(
    private val sessionRepository: SessionRepository,
    private val objectMapper: ObjectMapper
) {
    @Transactional
    fun startSession(subjectId: String, type: AuthType, transaction: Map<String, Any>? = null): SessionInfo {
        val sessionId = UUID.randomUUID().toString()
        val userCode = when (type) {
            AuthType.QR_CODE -> UUID.randomUUID().toString()
            AuthType.USER_CODE -> generateSixDigitCode()
            AuthType.PIN_2D -> generateTwoDigitCode()
            AuthType.PIN_8D -> generateEightDigitCode()
            AuthType.SILENT -> null
        }
        
        val transactionJson = transaction?.let { 
            try {
                objectMapper.writeValueAsString(it)
            } catch (e: Exception) {
                logger.error(e) { "Failed to serialize transaction data" }
                null
            }
        }
        
        logger.info { "Creating new session: id=$sessionId, subjectId=$subjectId, type=$type" }
        
        val sessionEntity = SessionEntity(
            sessionId = sessionId,
            subjectId = subjectId,
            userCode = userCode,
            authType = type,
            transactionData = transactionJson
        )
        
        try {
            val saved = sessionRepository.save(sessionEntity)
            logger.info { "Successfully saved session: ${saved.sessionId}" }
        } catch (e: Exception) {
            logger.error(e) { "Failed to save session to database" }
            throw e
        }
        
        return SessionInfo(
            sessionId = sessionId,
            userCode = userCode,
            subjectId = subjectId,
            transaction = transaction,
            userCodeVerified = false,
            userCodeVerifiedAt = null
        )
    }

    fun getUserCodeOptions(sessionId: String): UserCodeOptions {
        val session = sessionRepository.findById(sessionId)
            .orElseThrow { NoSuchElementException("No session found") }
        
        if (session.authType != AuthType.PIN_2D) {
            throw IllegalStateException("User code options only available for PIN_2D authentication type")
        }
        
        val codes = mutableSetOf<String>()
        session.userCode?.let { codes.add(it) }
        
        while (codes.size < 3) {
            codes.add(generateTwoDigitCode())
        }
        
        return UserCodeOptions(codes.shuffled(), sessionId)
    }

    @Transactional
    fun verifyUserCode(verification: UserCodeVerification): Boolean {
        return sessionRepository.findById(verification.sessionId)
            .map { session -> 
                val isValid = if (session.userCode == null) false
                             else session.userCode == verification.userCode
                
                if (isValid) {
                    session.userCodeVerified = true
                    session.userCodeVerifiedAt = Instant.now()
                    sessionRepository.save(session)
                    logger.info { "User code verified successfully for session: ${session.sessionId}" }
                } else {
                    logger.info { "User code verification failed for session: ${session.sessionId}" }
                }
                
                isValid
            }
            .orElse(false)
    }

    private fun generateTwoDigitCode(): String = 
        String.format("%02d", Random.nextInt(0, 100))

    private fun generateSixDigitCode(): String = 
        String.format("%06d", Random.nextInt(0, 1000000))

    private fun generateEightDigitCode(): String = 
        String.format("%08d", Random.nextInt(0, 100000000))

    private fun generateUserCode(): String {
        return String.format("%08d", Random.nextInt(0, 100000000))
    }

    fun deleteSession(sessionId: String) {
        sessionRepository.deleteById(sessionId)
    }

    @Transactional
    fun storeSignedPayload(sessionId: String, signedPayload: String) {
        logger.info { "Storing signed payload for session: $sessionId" }
        
        val session = sessionRepository.findById(sessionId)
            .orElseThrow { NoSuchElementException("No session found for ID: $sessionId") }
        
        if (session.authType != AuthType.SILENT && !session.userCodeVerified) {
            throw IllegalStateException("Cannot store payload: user code has not been verified")
        }
        
        try {
            session.signedPayload = signedPayload
            sessionRepository.save(session)
            logger.info { "Successfully stored signed payload for session: $sessionId" }
        } catch (e: Exception) {
            logger.error(e) { "Failed to store signed payload for session: $sessionId" }
            throw e
        }
    }
} 