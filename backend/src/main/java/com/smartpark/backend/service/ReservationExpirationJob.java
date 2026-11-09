package com.smartpark.backend.service;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Expira reservas que não podem mais ser usadas:
 * - PENDING_PAYMENT cujo prazo de pagamento acabou (motivo PAYMENT_TIMEOUT);
 * - CONFIRMED cujo horário de saída previsto já passou sem entrada (motivo NO_SHOW).
 *   Política de tarifa (Opção A): reserva paga e não utilizada não é reembolsada.
 *
 * A decisão é tomada dentro de uma transação que relê o status, para nunca
 * sobrescrever uma reserva que mudou nesse meio-tempo (paga, cancelada ou com entrada).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReservationExpirationJob {

    private static final String PAYMENT_TIMEOUT = "PAYMENT_TIMEOUT";
    private static final String NO_SHOW = "NO_SHOW";

    private final Firestore firestore;

    @Scheduled(fixedDelay = 60_000)
    public void expirar() {
        expirarPorCampo("PENDING_PAYMENT", "expires_at", PAYMENT_TIMEOUT);
        expirarPorCampo("CONFIRMED", "departure_expected", NO_SHOW);
    }

    /** Expira as reservas no status indicado cujo campo de prazo já passou. */
    private void expirarPorCampo(String status, String campoPrazo, String motivo) {
        List<QueryDocumentSnapshot> candidatas;
        try {
            candidatas = firestore.collection("reservations")
                    .whereEqualTo("status", status)
                    .get().get().getDocuments();
        } catch (Exception e) {
            log.warn("Falha ao buscar reservas {} ({})", status, e.getClass().getSimpleName());
            return;
        }

        Timestamp agora = Timestamp.now();
        for (QueryDocumentSnapshot d : candidatas) {
            Timestamp prazo = d.getTimestamp(campoPrazo);
            if (prazo == null || prazo.compareTo(agora) >= 0) {
                continue;
            }
            try {
                expirarSeAindaValido(d.getReference(), status, campoPrazo, motivo);
            } catch (Exception e) {
                log.warn("Falha ao expirar reserva {} ({})", d.getId(), e.getClass().getSimpleName());
            }
        }
    }

    /** Relê a reserva dentro da transação: só expira se o status e o prazo ainda forem os mesmos. */
    private void expirarSeAindaValido(DocumentReference ref, String status, String campoPrazo,
                                      String motivo) throws Exception {
        firestore.runTransaction(tx -> {
            DocumentSnapshot atual = tx.get(ref).get();
            Timestamp prazo = atual.getTimestamp(campoPrazo);
            if (atual.exists()
                    && status.equals(atual.getString("status"))
                    && prazo != null
                    && prazo.compareTo(Timestamp.now()) < 0) {
                tx.update(ref,
                        "status", "EXPIRED",
                        "expired_reason", motivo,
                        "expired_at", Timestamp.now());
            }
            return null;
        }).get();
    }
}
