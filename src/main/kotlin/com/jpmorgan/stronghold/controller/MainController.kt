package com.jpmorgan.stronghold.controller

import com.jpmorgan.stronghold.model.PinOptions
import com.jpmorgan.stronghold.model.PinVerification
import com.jpmorgan.stronghold.model.SessionInfo
import com.jpmorgan.stronghold.service.SessionService
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.*
import org.springframework.ui.Model

@Controller
class MainController(private val sessionService: SessionService) {
    
    @GetMapping("/")
    fun index(): String = "index"
    
    @GetMapping("/pincode")
    fun pincode(@RequestParam username: String, model: Model): String {
        model.addAttribute("username", username)
        return "pincode"
    }
    
    @GetMapping("/dashboard")
    fun dashboard(): String = "dashboard"
    
    @GetMapping("/payment")
    fun payment(): String = "payment"
}

@RestController
@RequestMapping("/api")
class ApiController(private val sessionService: SessionService) {
    
    @PostMapping("/start-session")
    fun startSession(@RequestBody request: Map<String, String>): SessionInfo {
        val username = request["username"] ?: throw IllegalArgumentException("Username required")
        return sessionService.startSession(username)
    }
    
    @PostMapping("/get-pin-options")
    fun getPinOptions(@RequestBody request: Map<String, String>): PinOptions {
        val username = request["username"] ?: throw IllegalArgumentException("Username required")
        return sessionService.getPinOptions(username)
    }
    
    @PostMapping("/verify-pin-selection")
    fun verifyPinSelection(@RequestBody verification: PinVerification): Map<String, Boolean> {
        val success = sessionService.verifyPin(verification)
        return mapOf("success" to success)
    }
} 