package com.jpmorgan.stronghold.service

import com.jpmorgan.stronghold.model.PinOptions
import com.jpmorgan.stronghold.model.PinVerification
import com.jpmorgan.stronghold.model.SessionInfo
import org.springframework.stereotype.Service
import java.util.*
import kotlin.random.Random

@Service
class SessionService {
    private val activeSessions = mutableMapOf<String, String>() // username -> sessionId
    private val sessionPins = mutableMapOf<String, String>() // sessionId -> pin

    fun startSession(username: String): SessionInfo {
        val sessionId = UUID.randomUUID().toString()
        val pin = Random.nextInt(10, 100).toString()
        
        activeSessions[username] = sessionId
        sessionPins[sessionId] = pin
        
        return SessionInfo(sessionId, pin)
    }

    fun getPinOptions(username: String): PinOptions {
        val sessionId = activeSessions[username] ?: throw NoSuchElementException("No session found")
        val correctPin = sessionPins[sessionId] ?: throw NoSuchElementException("No PIN found")
        
        val pins = mutableSetOf(correctPin)
        while (pins.size < 3) {
            pins.add(Random.nextInt(10, 100).toString())
        }
        
        return PinOptions(pins.shuffled(), sessionId)
    }

    fun verifyPin(verification: PinVerification): Boolean {
        val correctPin = sessionPins[verification.sessionId] ?: return false
        return verification.pin == correctPin
    }
} 