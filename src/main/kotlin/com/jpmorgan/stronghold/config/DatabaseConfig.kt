package com.jpmorgan.stronghold.config

import org.springframework.context.annotation.Configuration
import jakarta.annotation.PostConstruct
import java.nio.file.Files
import java.nio.file.Paths

@Configuration
class DatabaseConfig {
    @PostConstruct
    fun init() {
        Files.createDirectories(Paths.get("./data"))
    }
} 