package com.jpmorgan.stronghold.config

import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.info.Info
import io.swagger.v3.oas.models.info.Contact
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class OpenApiConfig {
    @Bean
    fun apiInfo(): OpenAPI {
        return OpenAPI()
            .info(
                Info()
                    .title("Stronghold API")
                    .description("API for Stronghold Step-up Authentication")
                    .version("1.0")
                    .contact(
                        Contact()
                            .name("JPMorgan")
                            .email("gavin.hamilton@jpmorgan.com")
                    )
            )
    }
} 