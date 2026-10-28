package com.smartpark.backend.service;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.smartpark.backend.dto.AccessRequest;
import com.smartpark.backend.dto.AccessResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutionException;

@Service
@RequiredArgsConstructor
public class AccessService {

    private static final Duration EARLY_ENTRY = Duration.ofMinutes(15);
    private static final Duration LATE_TOLERANCE = Duration.ofMinutes(10);

    private final NotificationService notificationService;
    private final Firestore firestore;

    public AccessResponse processar(String lotId, String deviceId, AccessRequest req) {
        boolean entry = "ENTRY".equals(req.type());
        String code = req.reservationCode();
        boolean validCode = code != null && code.matches("[A-Za-z0-9]{1,64}");
        Instant now = Instant.now();

        try {
            AccessResponse response = firestore.runTransaction(tx -> {
                DocumentReference eventRef =
                        firestore.collection("access_events").document(req.eventId());
                DocumentSnapshot ev = tx.get(eventRef).get();
                if (ev.exists()) {
                    // evento repetido: devolve o mesmo resultado, sem novo efeito
                    return new AccessResponse(Boolean.TRUE.equals(ev.getBoolean("allowed")),
                            ev.getString("reason"));
                }

                DocumentReference resRef = validCode
                        ? firestore.collection("reservations").document(code) : null;
                DocumentSnapshot res = resRef == null ? null : tx.get(resRef).get();

                String reason = null;
                if (res == null || !res.exists()) {
                    reason = "NO_RESERVATION";
                } else if (!lotId.equals(res.getString("parking_lot_id"))) {
                    reason = "WRONG_LOT";
                } else if (entry) {
                    String st = res.getString("status");
                    if ("CHECKED_IN".equals(st)) {
                        reason = "ALREADY_INSIDE";
                    } else if (!"CONFIRMED".equals(st)) {
                        reason = "NOT_CONFIRMED";
                    } else {
                        Instant arr = toInstant(res.getTimestamp("arrival_expected"));
                        Instant dep = toInstant(res.getTimestamp("departure_expected"));
                        if (now.isBefore(arr.minus(EARLY_ENTRY)) || now.isAfter(dep)) {
                            reason = "OUTSIDE_WINDOW";
                        }
                    }
                } else if (!"CHECKED_IN".equals(res.getString("status"))) {
                    reason = "NOT_INSIDE";
                }

                boolean allowed = reason == null;
                DocumentReference spaceRef = null;
                if (allowed) {
                    spaceRef = firestore.collection("spaces").document(res.getString("space_id"));
                    tx.get(spaceRef).get();
                }

                if (allowed && entry) {
                    Map<String, Object> up = new HashMap<>();
                    up.put("status", "CHECKED_IN");
                    up.put("arrival_real", toTs(now));
                    tx.update(resRef, up);
                    tx.update(spaceRef, "occupancy_state", "OCCUPIED");
                } else if (allowed) {
                    Instant arrivalReal = toInstant(res.getTimestamp("arrival_real"));
                    Instant dep = toInstant(res.getTimestamp("departure_expected"));
                    long duration = Duration.between(arrivalReal, now).toMinutes();
                    long overtime = now.isAfter(dep.plus(LATE_TOLERANCE))
                            ? Duration.between(dep, now).toMinutes() : 0;

                    Map<String, Object> up = new HashMap<>();
                    up.put("status", "COMPLETED");
                    up.put("departure_real", toTs(now));
                    tx.update(resRef, up);
                    tx.update(spaceRef, "occupancy_state", "FREE");

                    Map<String, Object> ticket = new HashMap<>();
                    ticket.put("ticket_id", resRef.getId());
                    ticket.put("reservation_id", resRef.getId());
                    ticket.put("parking_lot_id", lotId);
                    ticket.put("user_id", res.getString("user_id"));
                    ticket.put("space_label", res.getString("space_label"));
                    ticket.put("arrival_real", toTs(arrivalReal));
                    ticket.put("departure_real", toTs(now));
                    ticket.put("duration_minutes", duration);
                    ticket.put("final_amount_cents", res.getLong("price_estimate_cents"));
                    ticket.put("overtime_minutes", overtime);
                    ticket.put("overtime_status", overtime > 0 ? "PENDING" : "NONE");
                    ticket.put("payment_status", "APPROVED");
                    ticket.put("telegram_status", "PENDING");
                    ticket.put("created_at", toTs(now));
                    tx.create(firestore.collection("tickets").document(resRef.getId()), ticket);
                }

                String finalReason = allowed ? "OK" : reason;
                Map<String, Object> event = new HashMap<>();
                event.put("event_id", req.eventId());
                event.put("reservation_id", validCode ? code : null);
                event.put("device_id", deviceId);
                event.put("parking_lot_id", lotId);
                event.put("type", req.type());
                event.put("timestamp", toTs(now));
                event.put("allowed", allowed);
                event.put("reason", finalReason);
                tx.create(eventRef, event);

                return new AccessResponse(allowed, finalReason);
            }).get();
            if (response.allowed() && !entry) {
                notificationService.ticketFinal(code);
            }
            return response;
        } catch (ExecutionException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Erro ao processar acesso");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Operação interrompida");
        }
    }

    private static Timestamp toTs(Instant i) {
        return Timestamp.ofTimeSecondsAndNanos(i.getEpochSecond(), i.getNano());
    }

    private static Instant toInstant(Timestamp ts) {
        return ts == null ? null : Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos());
    }
}