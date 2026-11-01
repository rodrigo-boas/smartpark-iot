package com.smartpark.backend.dto;

import java.time.Instant;

/** Reserva vista pelo operador, com o e-mail do motorista. */
public record AdminReservation(
        String id,
        String userEmail,
        String parkingLotId,
        String spaceLabel,
        Instant arrivalExpected,
        Instant departureExpected,
        String status,
        long priceEstimateCents,
        Instant createdAt) {
}
