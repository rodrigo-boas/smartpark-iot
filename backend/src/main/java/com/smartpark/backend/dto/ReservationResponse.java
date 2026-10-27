package com.smartpark.backend.dto;

import lombok.Builder;
import lombok.Getter;

import java.time.Instant;

@Getter
@Builder
public class ReservationResponse {
    private String id;
    private String status;
    private String parkingLotId;
    private String spaceLabel;
    private Instant arrivalExpected;
    private Instant departureExpected;
    private long priceEstimateCents;
    private Instant expiresAt;
}