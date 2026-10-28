package com.smartpark.backend.service;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

@Component
@RequiredArgsConstructor
public class DeviceMonitorJob {

    private static final Duration LIMITE = Duration.ofMinutes(2);

    private final Firestore firestore;
    private final NotificationService notificationService;

    @Scheduled(fixedDelay = 60_000)
    public void verificar() throws Exception {
        Instant now = Instant.now();
        for (QueryDocumentSnapshot d : firestore.collection("devices").get().get().getDocuments()) {
            Timestamp lastSeen = d.getTimestamp("last_seen");
            if (lastSeen == null || Boolean.TRUE.equals(d.getBoolean("offline_alert_sent"))) {
                continue;
            }
            Instant seen = Instant.ofEpochSecond(lastSeen.getSeconds(), lastSeen.getNanos());
            if (Duration.between(seen, now).compareTo(LIMITE) > 0) {
                notificationService.alerta(
                        "offline-" + d.getId() + "-" + lastSeen.getSeconds(),
                        "ALERTA OPERACIONAL — DISPOSITIVO SEM COMUNICAÇÃO\nDispositivo: " + d.getId());
                d.getReference().update("offline_alert_sent", true).get();
            }
        }
    }
}