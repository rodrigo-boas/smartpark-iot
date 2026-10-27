package com.smartpark.backend.service;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ReservationExpirationJob {

    private final Firestore firestore;

    @Scheduled(fixedDelay = 60_000)
    public void expirar() throws Exception {
        Timestamp now = Timestamp.now();
        for (QueryDocumentSnapshot d : firestore.collection("reservations")
                .whereEqualTo("status", "PENDING_PAYMENT")
                .get().get().getDocuments()) {
            Timestamp exp = d.getTimestamp("expires_at");
            if (exp != null && exp.compareTo(now) < 0) {
                d.getReference().update("status", "EXPIRED").get();
            }
        }
    }
}