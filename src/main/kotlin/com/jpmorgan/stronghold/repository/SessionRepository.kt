package com.jpmorgan.stronghold.repository

import com.jpmorgan.stronghold.entity.SessionEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface SessionRepository : JpaRepository<SessionEntity, String> 