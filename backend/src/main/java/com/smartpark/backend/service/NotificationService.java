package com.smartpark.backend.service;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.SetOptions;
import com.smartpark.backend.integration.TelegramClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private static final int MAX_ATTEMPTS = 5;
    private static final ZoneId ZONE = ZoneId.of("America/Bahia");
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    private final Firestore firestore;
    private final TelegramClient telegram;

    public void reservaConfirmada(String reservationId) {
        try {
            DocumentSnapshot res = firestore.collection("reservations")
                    .document(reservationId).get().get();
            if (!res.exists() || !List.of("CONFIRMED", "CHECKED_IN", "COMPLETED")
                    .contains(res.getString("status"))) {
                return;
            }
            String texto = "SMARTPARK IoT — RESERVA CONFIRMADA\n"
                    + "Reserva: " + reservationId + "\n"
                    + "Estacionamento: " + nomeEstacionamento(res.getString("parking_lot_id")) + "\n"
                    + "Vaga: " + res.getString("space_label") + "\n"
                    + "Período: " + fmt(res.getTimestamp("arrival_expected"))
                    + " até " + fmt(res.getTimestamp("departure_expected")) + "\n"
                    + "Pagamento: aprovado";
            enviar("confirmacao-" + reservationId, reservationId, "CONFIRMATION", texto);
        } catch (Exception e) {
            log.warn("Erro ao notificar confirmacao ({})", e.getClass().getSimpleName());
        }
    }

    public void ticketFinal(String reservationId) {
        try {
            DocumentSnapshot t = firestore.collection("tickets").document(reservationId).get().get();
            if (!t.exists()) {
                return;
            }
            long duration = t.getLong("duration_minutes");
            long overtime = t.getLong("overtime_minutes");
            BigDecimal valor = BigDecimal.valueOf(t.getLong("final_amount_cents"), 2);

            StringBuilder texto = new StringBuilder()
                    .append("SMARTPARK IoT — COMPROVANTE\n")
                    .append("Ticket: ").append(reservationId).append("\n")
                    .append("Estacionamento: ")
                    .append(nomeEstacionamento(t.getString("parking_lot_id"))).append("\n")
                    .append("Vaga: ").append(t.getString("space_label")).append("\n")
                    .append("Chegada real: ").append(fmt(t.getTimestamp("arrival_real"))).append("\n")
                    .append("Saída real: ").append(fmt(t.getTimestamp("departure_real"))).append("\n")
                    .append("Duração: ").append(duration / 60).append("h")
                    .append(String.format("%02d", duration % 60)).append("min\n")
                    .append("Valor final: R$ ")
                    .append(String.format(Locale.forLanguageTag("pt-BR"), "%.2f", valor)).append("\n")
                    .append("Pagamento: aprovado");
            if (overtime > 0) {
                texto.append("\nExcedente: ").append(overtime).append(" min (pendente)");
            }
            enviar("ticket-" + reservationId, reservationId, "TICKET", texto.toString());

            if (overtime > 0) {
                alerta("overtime-" + reservationId,
                        "ALERTA OPERACIONAL — PERMANÊNCIA EXCEDENTE\n"
                                + "Reserva: " + reservationId + "\n"
                                + "Excedente: " + overtime + " min (pendente)");
            }
        } catch (Exception e) {
            log.warn("Erro ao notificar ticket ({})", e.getClass().getSimpleName());
        }
    }

    public void alerta(String notificationId, String texto) {
        enviar(notificationId, null, "ALERT", texto);
    }

    /** Envia uma única vez por notificationId; falhas ficam PENDING_RETRY. */
    public void enviar(String id, String reservationId, String type, String texto) {
        try {
            DocumentReference ref = firestore.collection("notifications").document(id);
            DocumentSnapshot doc = ref.get().get();
            if (doc.exists() && "SENT".equals(doc.getString("status"))) {
                return;
            }
            long attempts = doc.exists() && doc.getLong("attempts") != null
                    ? doc.getLong("attempts") : 0;
            if (attempts >= MAX_ATTEMPTS) {
                return;
            }
            tentar(ref, id, reservationId, type, texto, attempts);
        } catch (Exception e) {
            log.warn("Erro ao registrar notificacao ({})", e.getClass().getSimpleName());
        }
    }

    @Scheduled(fixedDelay = 60_000)
    public void reenviarPendentes() throws Exception {
        for (QueryDocumentSnapshot d : firestore.collection("notifications")
                .whereEqualTo("status", "PENDING_RETRY").get().get().getDocuments()) {
            long attempts = d.getLong("attempts") == null ? 0 : d.getLong("attempts");
            if (attempts >= MAX_ATTEMPTS) {
                continue;
            }
            tentar(d.getReference(), d.getId(), d.getString("reservation_id"),
                    d.getString("type"), d.getString("text"), attempts);
        }
    }

    private void tentar(DocumentReference ref, String id, String reservationId,
                        String type, String texto, long attempts) throws Exception {
        boolean ok = telegram.enviar(texto);
        long n = attempts + 1;

        Map<String, Object> data = new HashMap<>();
        data.put("notification_id", id);
        data.put("reservation_id", reservationId);
        data.put("channel", "TELEGRAM");
        data.put("type", type);
        data.put("text", texto);
        data.put("attempts", n);
        data.put("status", ok ? "SENT" : (n >= MAX_ATTEMPTS ? "FAILED" : "PENDING_RETRY"));
        if (ok) {
            data.put("sent_at", Timestamp.now());
        }
        ref.set(data, SetOptions.merge()).get();

        if ("TICKET".equals(type) && reservationId != null) {
            firestore.collection("tickets").document(reservationId)
                    .update("telegram_status", ok ? "SENT" : "PENDING_RETRY").get();
        }
    }

    private String nomeEstacionamento(String lotId) throws Exception {
        DocumentSnapshot lot = firestore.collection("parking_lots").document(lotId).get().get();
        return lot.exists() && lot.getString("name") != null ? lot.getString("name") : lotId;
    }

    private static String fmt(Timestamp ts) {
        return ts == null ? "-" : ts.toDate().toInstant().atZone(ZONE).format(FMT);
    }
}