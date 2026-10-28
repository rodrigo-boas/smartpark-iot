package com.smartpark.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;

public record CreateReservationRequest(
        @NotBlank String parkingLotId,
        @NotNull Instant arrivalExpected,
        @NotNull Instant departureExpected,
        String spaceId) {
}
