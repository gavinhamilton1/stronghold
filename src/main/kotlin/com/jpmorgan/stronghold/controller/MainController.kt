package com.jpmorgan.stronghold.controller

import com.jpmorgan.stronghold.model.*
import com.jpmorgan.stronghold.service.SessionService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api")
@Tag(name = "Authentication", description = "Authentication endpoints")
class MainController(private val sessionService: SessionService) {
    
    @Operation(
        summary = "Start new session",
        description = "Creates a new session for the given username"
    )
    @ApiResponse(
        responseCode = "200",
        description = "Session created successfully"
    )
    @PostMapping("/start-session")
    fun startSession(
        @Parameter(description = "Session start request")
        @RequestBody request: StartSessionRequest
    ): SessionInfo {
        return sessionService.startSession(request.username)
    }
    
    @Operation(
        summary = "Get PIN options",
        description = "Returns available PIN options for the given session"
    )
    @PostMapping("/get-pin-options")
    fun getPinOptions(
        @Parameter(description = "PIN options request")
        @RequestBody request: PinOptionsRequest
    ): PinOptions {
        return sessionService.getPinOptions(request.sessionId)
    }
    
    @Operation(
        summary = "Verify PIN selection",
        description = "Verifies if the selected PIN is correct"
    )
    @PostMapping("/verify-pin-selection")
    fun verifyPinSelection(
        @Parameter(description = "PIN verification request")
        @RequestBody verification: PinVerification
    ): PinVerificationResponse {
        val success = sessionService.verifyPin(verification)
        return PinVerificationResponse(success)
    }

    @Operation(
        summary = "Delete session",
        description = "Deletes an existing session"
    )
    @DeleteMapping("/sessions/{sessionId}")
    fun deleteSession(
        @Parameter(description = "Session ID to delete")
        @PathVariable sessionId: String
    ): DeleteSessionResponse {
        sessionService.deleteSession(sessionId)
        return DeleteSessionResponse("success")
    }
} 