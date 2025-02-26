package com.jpmorgan.stronghold

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class StrongholdApplication

fun main(args: Array<String>) {
    runApplication<StrongholdApplication>(*args)
} 