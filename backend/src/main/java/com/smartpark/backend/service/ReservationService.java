package com.smartpark.backend.service;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.FieldValue;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.smartpark.backend.dto.CreateReservationRequest;
import com.smartpark.backend.dto.ReservationResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;

@Service
@RequiredArgsConstructor
public class ReservationService {

    private static final List<String> ACTIVE_STATUSES =
            List.of("PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN");
    private static final Duration PAYMENT_WINDOW = Duration.ofMinutes(15);
    private static final Duration MAX_STAY = Duration.ofHours(24);
    private static final ZoneId ZONE = ZoneId.of("America/Bahia");

    private final Firestore firestore;

    public ReservationResponse criar(String userId, CreateReservationRequest req) {
        Instant now = Instant.now();
        if (!req.departureExpected().isAfter(req.arrivalExpected())) {
            throw bad("A saída deve ser depois da chegada");
        }
        if (req.arrivalExpected().isBefore(now.minus(Duration.ofMinutes(5)))) {
            throw bad("A chegada não pode estar no passado");
        }
        if (Duration.between(req.arrivalExpected(), req.departureExpected())
                .compareTo(MAX_STAY) > 0) {
            throw bad("A permanência máxima é de 24 horas");
        }

        try {
            return firestore.runTransaction(tx -> {
                DocumentSnapshot lot = tx.get(
                        firestore.collection("parking_lots").document(req.parkingLotId())).get();
                if (!lot.exists() || !Boolean.TRUE.equals(lot.getBoolean("active"))) {
                    throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                            "Estacionamento não encontrado");
                }
                validarHorarioFuncionamento(lot, req);
                long rate = lot.getLong("hourly_rate_cents");

                List<QueryDocumentSnapshot> spaces = new ArrayList<>(tx.get(
                        firestore.collection("spaces")
                                .whereEqualTo("parking_lot_id", req.parkingLotId())
                                .whereEqualTo("active", true)).get().getDocuments());
                spaces.sort(Comparator.comparing(d -> d.getString("label")));

                List<QueryDocumentSnapshot> reservations = tx.get(
                        firestore.collection("reservations")
                                .whereEqualTo("parking_lot_id", req.parkingLotId())
                                .whereIn("status", ACTIVE_STATUSES)).get().getDocuments();

                QueryDocumentSnapshot chosen = null;
                for (QueryDocumentSnapshot space : spaces) {
                    boolean busy = false;
                    for (QueryDocumentSnapshot r : reservations) {
                        if (space.getId().equals(r.getString("space_id"))
                                && overlaps(r, req, now)) {
                            busy = true;
                            break;
                        }
                    }
                    if (!busy) {
                        chosen = space;
                        break;
                    }
                }
                if (chosen == null) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Sem vagas disponíveis para este horário");
                }

                // Escrever na vaga escolhida força conflito entre transações concorrentes
                DocumentReference spaceRef = chosen.getReference();
                tx.get(spaceRef).get();
                tx.update(spaceRef, "last_booking_at", FieldValue.serverTimestamp());

                long minutes = Duration.between(req.arrivalExpected(),
                        req.departureExpected()).toMinutes();
                long hours = Math.max(1, (minutes + 59) / 60);
                long price = hours * rate;
                Instant expiresAt = now.plus(PAYMENT_WINDOW);
                String label = chosen.getString("label");

                DocumentReference resRef = firestore.collection("reservations").document();
                Map<String, Object> data = new HashMap<>();
                data.put("user_id", userId);
                data.put("parking_lot_id", req.parkingLotId());
                data.put("space_id", chosen.getId());
                data.put("space_label", label);
                data.put("arrival_expected", toTs(req.arrivalExpected()));
                data.put("departure_expected", toTs(req.departureExpected()));
                data.put("status", "PENDING_PAYMENT");
                data.put("price_estimate_cents", price);
                data.put("created_at", toTs(now));
                data.put("expires_at", toTs(expiresAt));
                tx.create(resRef, data);

                return ReservationResponse.builder()
                        .id(resRef.getId())
                        .status("PENDING_PAYMENT")
                        .parkingLotId(req.parkingLotId())
                        .spaceLabel(label)
                        .arrivalExpected(req.arrivalExpected())
                        .departureExpected(req.departureExpected())
                        .priceEstimateCents(price)
                        .expiresAt(expiresAt)
                        .build();
            }).get();
        } catch (ExecutionException e) {
            Throwable t = e;
            while (t != null) {
                if (t instanceof ResponseStatusException rse) {
                    throw rse;
                }
                t = t.getCause();
            }
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Erro ao criar a reserva");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Operação interrompida");
        }
    }

    public ReservationResponse buscar(String userId, String id) {
        try {
            DocumentSnapshot doc = firestore.collection("reservations").document(id).get().get();
            if (!doc.exists() || !userId.equals(doc.getString("user_id"))) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Reserva não encontrada");
            }
            return toResponse(doc);
        } catch (ExecutionException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Erro ao buscar a reserva");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Operação interrompida");
        }
    }

    private void validarHorarioFuncionamento(DocumentSnapshot lot, CreateReservationRequest req) {
        String open = lot.getString("opening_hours.open");
        String close = lot.getString("opening_hours.close");
        if (open == null || close == null) {
            return;
        }
        ZonedDateTime chegada = req.arrivalExpected().atZone(ZONE);
        ZonedDateTime saida = req.departureExpected().atZone(ZONE);
        LocalTime abre = LocalTime.parse(open);
        LocalTime fecha = LocalTime.parse(close);

        boolean mesmoDia = chegada.toLocalDate().equals(saida.toLocalDate());
        boolean dentroDoHorario = !chegada.toLocalTime().isBefore(abre)
                && !saida.toLocalTime().isAfter(fecha);

        if (!mesmoDia || !dentroDoHorario) {
            throw bad("O estacionamento funciona das " + open + " às " + close
                    + ". Escolha chegada e saída dentro desse horário, no mesmo dia.");
        }
    }

    private ReservationResponse toResponse(DocumentSnapshot doc) {
        return ReservationResponse.builder()
                .id(doc.getId())
                .status(doc.getString("status"))
                .parkingLotId(doc.getString("parking_lot_id"))
                .spaceLabel(doc.getString("space_label"))
                .arrivalExpected(toInstant(doc.getTimestamp("arrival_expected")))
                .departureExpected(toInstant(doc.getTimestamp("departure_expected")))
                .priceEstimateCents(doc.getLong("price_estimate_cents"))
                .expiresAt(toInstant(doc.getTimestamp("expires_at")))
                .build();
    }

    private boolean overlaps(DocumentSnapshot r, CreateReservationRequest req, Instant now) {
        if ("PENDING_PAYMENT".equals(r.getString("status"))) {
            Instant exp = toInstant(r.getTimestamp("expires_at"));
            if (exp != null && exp.isBefore(now)) {
                return false;
            }
        }
        Instant a = toInstant(r.getTimestamp("arrival_expected"));
        Instant d = toInstant(r.getTimestamp("departure_expected"));
        return a.isBefore(req.departureExpected()) && d.isAfter(req.arrivalExpected());
    }

    private static Timestamp toTs(Instant i) {
        return Timestamp.ofTimeSecondsAndNanos(i.getEpochSecond(), i.getNano());
    }

    private static Instant toInstant(Timestamp ts) {
        return ts == null ? null : Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos());
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}