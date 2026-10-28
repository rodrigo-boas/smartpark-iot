package com.smartpark.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record AccessRequest(
        @JsonProperty("event_id") @NotBlank
        @Pattern(regexp = "[A-Za-z0-9._-]{1,80}") String eventId,
        @NotBlank @Pattern(regexp = "ENTRY|EXIT") String type,
        @JsonProperty("reservation_code") String reservationCode) {
}