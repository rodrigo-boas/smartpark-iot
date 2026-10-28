package com.smartpark.backend.dto;

import java.time.Instant;
import java.util.List;

public record SpacesResponse(
        String parkingLotId,
        Instant from,
        Instant to,
        long priceEstimateCents,
        List<SpaceOption> spaces) {
}