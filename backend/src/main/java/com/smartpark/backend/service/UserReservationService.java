package com.smartpark.backend.service;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.smartpark.backend.dto.ReservationResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutionException;

/** Operações do motorista sobre as próprias reservas: listar e cancelar. */
@Service
@RequiredArgsConstructor
public class UserReservationService {

    private static final int LIMITE = 100;

    private final Firestore firestore;

    /** Reservas do usuário, da chegada mais recente para a mais antiga. */
    public List<ReservationResponse> listar(String userId) {
        try {
            List<QueryDocumentSnapshot> docs = firestore.collection("reservations")
                    .whereEqualTo("user_id", userId)
                    .get().get().getDocuments();
            return docs.stream()
                    .map(UserReservationService::toResponse)
                    .sorted(Comparator.comparing(ReservationResponse::getArrivalExpected,
                            Comparator.nullsLast(Comparator.<Instant>reverseOrder())))
                    .limit(LIMITE)
                    .toList();
        } catch (ExecutionException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Erro ao buscar suas reservas");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Operação interrompida");
        }
    }

    /** Cancela uma reserva do usuário que ainda aguarda pagamento, liberando a vaga. */
    public void cancelar(String userId, String id) {
        try {
            firestore.runTransaction(tx -> {
                DocumentReference ref = firestore.collection("reservations").document(id);
                DocumentSnapshot doc = tx.get(ref).get();
                if (!doc.exists() || !userId.equals(doc.getString("user_id"))) {
                    throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                            "Reserva não encontrada");
                }
                if (!"PENDING_PAYMENT".equals(doc.getString("status"))) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Só é possível cancelar reservas que ainda aguardam pagamento.");
                }
                tx.update(ref, "status", "CANCELLED", "cancelled_at", Timestamp.now());
                return null;
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
                    "Erro ao cancelar a reserva");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Operação interrompida");
        }
    }

    private static ReservationResponse toResponse(DocumentSnapshot doc) {
        Long preco = doc.getLong("price_estimate_cents");
        return ReservationResponse.builder()
                .id(doc.getId())
                .status(doc.getString("status"))
                .parkingLotId(doc.getString("parking_lot_id"))
                .spaceLabel(doc.getString("space_label"))
                .arrivalExpected(toInstant(doc.getTimestamp("arrival_expected")))
                .departureExpected(toInstant(doc.getTimestamp("departure_expected")))
                .priceEstimateCents(preco == null ? 0 : preco)
                .expiresAt(toInstant(doc.getTimestamp("expires_at")))
                .createdAt(toInstant(doc.getTimestamp("created_at")))
                .confirmedAt(toInstant(doc.getTimestamp("confirmed_at")))
                .arrivalReal(toInstant(doc.getTimestamp("arrival_real")))
                .departureReal(toInstant(doc.getTimestamp("departure_real")))
                .expiredReason(doc.getString("expired_reason"))
                .build();
    }

    private static Instant toInstant(Timestamp ts) {
        return ts == null ? null : Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos());
    }
}
