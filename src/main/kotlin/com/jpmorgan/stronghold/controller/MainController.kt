package com.jpmorgan.stronghold.controller

import com.jpmorgan.stronghold.model.*
import com.jpmorgan.stronghold.service.SessionService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.time.Instant
import java.util.NoSuchElementException

@Schema(description = "Store payload response")
data class StorePayloadResponse(
    @Schema(description = "Status of the operation", example = "success")
    val status: String
)

@Schema(description = "User code options error response")
data class UserCodeOptionsErrorResponse(
    @Schema(description = "Error status", example = "error")
    val status: String,
    
    @Schema(description = "Error message", example = "User code options only available for PIN_2D authentication type")
    val message: String
)

@Schema(description = "Store payload error response")
data class StorePayloadErrorResponse(
    @Schema(description = "Error status", example = "error")
    val status: String,
    
    @Schema(description = "Error message", example = "Cannot store payload: user code has not been verified")
    val message: String
)

@RestController
@RequestMapping("/mobile-sign")
@Tag(
    name = "Authentication", 
    description = """
        Mobile Authentication API
        
        Flow:
        1. Start a session with POST /mobile-sign/start-session
           - Choose auth type: QR_CODE, USER_CODE, PIN_2D, PIN_8D, or SILENT
           - For PIN_2D, proceed to step 2
           - For SILENT, skip to step 4
           - For other types, proceed to step 3
        
        2. For PIN_2D auth type only:
           - Get PIN options with GET /mobile-sign/sessions/{sessionId}/user-code-options
           - User selects one of the three 2-digit PINs
        
        3. Verify the user code with POST /mobile-sign/verify-user-code
           - Must be verified before storing payload (except SILENT type)
        
        4. Store the signed payload with POST /mobile-sign/store-payload
           - For non-SILENT auth types, requires prior user code verification
        
        Note: Session can be deleted at any time with DELETE /mobile-sign/sessions/{sessionId}
    """
)
class MainController(private val sessionService: SessionService) {
    
    @Operation(
        summary = "Start new session",
        description = "Creates a new session for the given subject ID"
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
        return sessionService.startSession(request.subjectId, request.type, request.transaction)
    }
    
    @Operation(
        summary = "Get user code options",
        description = "Returns available 2-digit PIN options for PIN_2D sessions"
    )
    @ApiResponse(
        responseCode = "200",
        description = "Successfully retrieved options",
        content = [
            Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                schema = Schema(implementation = UserCodeOptions::class)
            )
        ]
    )
    @ApiResponse(
        responseCode = "400",
        description = "Invalid session type - options only available for PIN_2D",
        content = [
            Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                schema = Schema(implementation = UserCodeOptionsErrorResponse::class)
            )
        ]
    )
    @GetMapping("/sessions/{sessionId}/user-code-options")
    fun getUserCodeOptions(
        @Parameter(description = "Session ID to get user code options for")
        @PathVariable sessionId: String
    ): ResponseEntity<Any> {
        return try {
            val options = sessionService.getUserCodeOptions(sessionId)
            ResponseEntity.ok(options)
        } catch (e: IllegalStateException) {
            ResponseEntity.badRequest().body(UserCodeOptionsErrorResponse(
                status = "error",
                message = e.message ?: "Invalid request"
            ))
        }
    }
    
    @Operation(
        summary = "Verify user code selection",
        description = "Verifies if the selected user code is correct"
    )
    @PostMapping("/verify-user-code")
    fun verifyUserCodeSelection(
        @Parameter(description = "User code verification request")
        @RequestBody verification: UserCodeVerification
    ): UserCodeVerificationResponse {
        val success = sessionService.verifyUserCode(verification)
        return UserCodeVerificationResponse(
            success = success,
            verifiedAt = if (success) Instant.now() else null
        )
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

    @Operation(
        summary = "Store signed payload",
        description = "Stores the signed JWT payload for the given session. Requires verified user code except for SILENT auth type."
    )
    @ApiResponse(
        responseCode = "200",
        description = "Successfully stored payload",
        content = [
            Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                schema = Schema(implementation = StorePayloadResponse::class)
            )
        ]
    )
    @ApiResponse(
        responseCode = "400",
        description = "Invalid request - user code not verified",
        content = [
            Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                schema = Schema(implementation = StorePayloadErrorResponse::class)
            )
        ]
    )
    @PostMapping("/store-payload")
    fun storeSignedPayload(
        @Parameter(description = "Signed payload request")
        @RequestBody request: SignedPayloadRequest
    ): ResponseEntity<Any> {
        return try {
            sessionService.storeSignedPayload(request.sessionId, request.signedPayload)
            ResponseEntity.ok(StorePayloadResponse("success"))
        } catch (e: IllegalStateException) {
            ResponseEntity.badRequest().body(StorePayloadErrorResponse(
                status = "error",
                message = e.message ?: "Invalid request"
            ))
        } catch (e: NoSuchElementException) {
            ResponseEntity.badRequest().body(StorePayloadErrorResponse(
                status = "error",
                message = e.message ?: "Session not found"
            ))
        }
    }
} 