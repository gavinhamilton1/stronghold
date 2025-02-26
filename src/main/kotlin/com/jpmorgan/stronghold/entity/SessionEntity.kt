package com.jpmorgan.stronghold.entity

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "sessions")
data class SessionEntity(
    @Id
    val sessionId: String,
    
    val username: String,
    val pin: String,
    
    @Column(columnDefinition = "TEXT")
    val transactionData: String?, // JSON string of transaction
    
    val createdAt: Instant = Instant.now()
) 