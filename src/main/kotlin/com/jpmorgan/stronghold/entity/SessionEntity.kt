package com.jpmorgan.stronghold.entity

import jakarta.persistence.*
import java.time.Instant
import com.jpmorgan.stronghold.model.AuthType

@Entity
@Table(name = "sessions")
data class SessionEntity(
    @Id
    val sessionId: String,
    
    @Column(nullable = false)
    val subjectId: String,
    
    @Column(nullable = true)  // Changed to allow null for SILENT type
    val userCode: String?,
    
    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    val authType: AuthType,
    
    @Column(columnDefinition = "TEXT")
    val transactionData: String?, // JSON string of transaction
    
    @Column(columnDefinition = "TEXT")
    var signedPayload: String? = null, // JWT payload
    
    @Column(nullable = false)
    val createdAt: Instant = Instant.now(),
    
    @Column(nullable = false)
    var userCodeVerified: Boolean = false,
    
    @Column(nullable = true)
    var userCodeVerifiedAt: Instant? = null
) {
    // No-args constructor required by JPA
    protected constructor() : this("", "", null, AuthType.PIN_2D, null)
} 