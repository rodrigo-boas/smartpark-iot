package com.smartpark.backend.dto;

import java.time.Instant;

public record AvailabilityResponse(
        String parkingLotId,
        Instant from,
        Instant to,
        int totalSpaces,
        int freeSpaces) {
}