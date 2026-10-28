package com.smartpark.backend.service;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.smartpark.backend.dto.AvailabilityResponse;
import com.smartpark.backend.dto.ParkingLotResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ParkingLotService {

    private static final List<String> ACTIVE_STATUSES =
            List.of("PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN");
    private static final Duration MAX_PERIOD = Duration.ofHours(24);

    private final Firestore firestore;

    public List<ParkingLotResponse> listarAtivos()
            throws ExecutionException, InterruptedException {

        Instant now = Instant.now();

        List<QueryDocumentSnapshot> lots = firestore.collection("parking_lots")
                .whereEqualTo("active", true)
                .get().get().getDocuments();

        List<QueryDocumentSnapshot> spaces = firestore.collection("spaces")
                .whereEqualTo("active", true)
                .get().get().getDocuments();

        List<QueryDocumentSnapshot> reservations = firestore.collection("reservations")
                .whereIn("status", ACTIVE_STATUSES)
                .get().get().getDocuments();

        Map<String, List<QueryDocumentSnapshot>> spacesByLot = spaces.stream()
                .collect(Collectors.groupingBy(d -> d.getString("parking_lot_id")));
        Map<String, List<QueryDocumentSnapshot>> reservationsByLot = reservations.stream()
                .collect(Collectors.groupingBy(d -> d.getString("parking_lot_id")));

        List<ParkingLotResponse> result = new ArrayList<>();
        for (QueryDocumentSnapshot doc : lots) {
            List<QueryDocumentSnapshot> lotSpaces =
                    spacesByLot.getOrDefault(doc.getId(), List.of());
            List<QueryDocumentSnapshot> lotReservations =
                    reservationsByLot.getOrDefault(doc.getId(), List.of());
            int free = contarLivres(lotSpaces, lotReservations, now, now.plusSeconds(1), now);

            result.add(ParkingLotResponse.builder()
                    .id(doc.getId())
                    .name(doc.getString("name"))
                    .address(doc.getString("address"))
                    .latitude(doc.getDouble("latitude"))
                    .longitude(doc.getDouble("longitude"))
                    .hourlyRateCents(doc.getLong("hourly_rate_cents"))
                    .openTime(doc.getString("opening_hours.open"))
                    .closeTime(doc.getString("opening_hours.close"))
                    .totalSpaces(lotSpaces.size())
                    .freeSpaces(free)
                    .build());
        }
        return result;
    }

    public AvailabilityResponse disponibilidade(String lotId, String fromText, String toText)
            throws ExecutionException, InterruptedException {

        Instant from = parseData(fromText);
        Instant to = parseData(toText);
        if (!to.isAfter(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "O fim do período deve ser depois do início");
        }
        if (Duration.between(from, to).compareTo(MAX_PERIOD) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "O período máximo é de 24 horas");
        }

        DocumentSnapshot lot = firestore.collection("parking_lots").document(lotId).get().get();
        if (!lot.exists() || !Boolean.TRUE.equals(lot.getBoolean("active"))) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Estacionamento não encontrado");
        }

        List<QueryDocumentSnapshot> spaces = firestore.collection("spaces")
                .whereEqualTo("parking_lot_id", lotId)
                .whereEqualTo("active", true)
                .get().get().getDocuments();

        List<QueryDocumentSnapshot> reservations = firestore.collection("reservations")
                .whereEqualTo("parking_lot_id", lotId)
                .whereIn("status", ACTIVE_STATUSES)
                .get().get().getDocuments();

        int free = contarLivres(spaces, reservations, from, to, Instant.now());
        return new AvailabilityResponse(lotId, from, to, spaces.size(), free);
    }

    private int contarLivres(List<QueryDocumentSnapshot> spaces,
                             List<QueryDocumentSnapshot> reservations,
                             Instant from, Instant to, Instant now) {
        boolean periodoIncluiAgora = !from.isAfter(now) && to.isAfter(now);
        int free = 0;
        for (QueryDocumentSnapshot space : spaces) {
            if (periodoIncluiAgora && "OCCUPIED".equals(space.getString("occupancy_state"))) {
                continue;
            }
            boolean busy = false;
            for (QueryDocumentSnapshot r : reservations) {
                if (space.getId().equals(r.getString("space_id"))
                        && sobrepoe(r, from, to, now)) {
                    busy = true;
                    break;
                }
            }
            if (!busy) {
                free++;
            }
        }
        return free;
    }

    private boolean sobrepoe(DocumentSnapshot r, Instant from, Instant to, Instant now) {
        if ("PENDING_PAYMENT".equals(r.getString("status"))) {
            Instant exp = toInstant(r.getTimestamp("expires_at"));
            if (exp != null && exp.isBefore(now)) {
                return false;
            }
        }
        Instant a = toInstant(r.getTimestamp("arrival_expected"));
        Instant d = toInstant(r.getTimestamp("departure_expected"));
        if (a == null || d == null) {
            return false;
        }
        return a.isBefore(to) && d.isAfter(from);
    }

    private static Instant parseData(String text) {
        try {
            return Instant.parse(text);
        } catch (DateTimeParseException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Data inválida. Use o formato 2026-10-29T13:00:00Z");
        }
    }

    private static Instant toInstant(Timestamp ts) {
        return ts == null ? null : Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos());
    }
}