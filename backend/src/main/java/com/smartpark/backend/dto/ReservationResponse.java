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

    /** Quando a reserva foi criada (data de emissão do ticket). */
    private Instant createdAt;
    /** Quando o pagamento foi aprovado. */
    private Instant confirmedAt;
    /** Horários reais registrados pela cancela. */
    private Instant arrivalReal;
    private Instant departureReal;
    /** PAYMENT_TIMEOUT ou NO_SHOW, quando a reserva expirou. */
    private String expiredReason;
}
