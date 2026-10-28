package com.smartpark.backend.service;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.SetOptions;
import com.smartpark.backend.integration.MercadoPagoClient;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutionException;

@Service
@RequiredArgsConstructor
public class PaymentService {

    private final Firestore firestore;
    private final MercadoPagoClient mp;
    private final NotificationService notificationService;

    @Value("${app.base-url}")
    private String baseUrl;

    public String criarCheckout(String userId, String reservationId) {
        if (!reservationId.matches("[A-Za-z0-9]{1,64}")) {
            throw notFound();
        }
        try {
            DocumentSnapshot res = firestore.collection("reservations")
                    .document(reservationId).get().get();
            if (!res.exists() || !userId.equals(res.getString("user_id"))) {
                throw notFound();
            }
            Timestamp exp = res.getTimestamp("expires_at");
            if (!"PENDING_PAYMENT".equals(res.getString("status"))
                    || (exp != null && exp.compareTo(Timestamp.now()) < 0)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "A reserva não está aguardando pagamento");
            }
            long price = res.getLong("price_estimate_cents");
            MercadoPagoClient.Preference pref = mp.criarPreferencia(
                    reservationId, "Reserva SmartPark " + res.getString("space_label"),
                    price, baseUrl);

            Map<String, Object> pay = new HashMap<>();
            pay.put("reservation_id", reservationId);
            pay.put("provider", "mercadopago");
            pay.put("preference_id", pref.id());
            pay.put("status", "PENDING");
            pay.put("amount_cents", price);
            pay.put("currency", "BRL");
            pay.put("created_at", Timestamp.now());
            firestore.collection("payments").document(reservationId).set(pay).get();
            return pref.initPoint();
        } catch (ExecutionException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Erro ao criar o checkout");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Operação interrompida");
        }
    }

    /** Consulta o pagamento no Mercado Pago e reconcilia a reserva (idempotente). */
    public void processarWebhook(String paymentId) {
        MercadoPagoClient.PaymentInfo p = mp.buscarPagamento(paymentId);
        String reservationId = p.externalReference();
        if (reservationId == null || !reservationId.matches("[A-Za-z0-9]{1,64}")) {
            return;
        }
        try {
            firestore.runTransaction(tx -> {
                DocumentReference resRef = firestore.collection("reservations")
                        .document(reservationId);
                DocumentReference payRef = firestore.collection("payments")
                        .document(reservationId);
                DocumentSnapshot res = tx.get(resRef).get();
                DocumentSnapshot pay = tx.get(payRef).get();
                if (!res.exists()) {
                    return null;
                }

                String mpStatus = p.status() == null ? "unknown" : p.status();
                String current = pay.exists() ? pay.getString("status") : null;

                Map<String, Object> upd = new HashMap<>();
                upd.put("reservation_id", reservationId);
                upd.put("provider", "mercadopago");
                upd.put("payment_id", paymentId);
                upd.put("verified_at", Timestamp.now());

                if ("approved".equals(mpStatus)) {
                    if ("APPROVED".equals(current)
                            && paymentId.equals(pay.getString("payment_id"))) {
                        return null; // webhook repetido
                    }
                    BigDecimal expected = BigDecimal.valueOf(res.getLong("price_estimate_cents"), 2);
                    boolean amountOk = p.amount() != null
                            && p.amount().compareTo(expected) == 0
                            && "BRL".equals(p.currency());
                    String resStatus = res.getString("status");
                    Timestamp exp = res.getTimestamp("expires_at");
                    boolean expired = "EXPIRED".equals(resStatus)
                            || ("PENDING_PAYMENT".equals(resStatus) && exp != null
                            && exp.compareTo(Timestamp.now()) < 0);

                    if (!amountOk) {
                        upd.put("status", "AMOUNT_MISMATCH");
                        upd.put("needs_reconciliation", true);
                    } else if ("PENDING_PAYMENT".equals(resStatus) && !expired) {
                        upd.put("status", "APPROVED");
                        tx.update(resRef, "status", "CONFIRMED", "confirmed_at", Timestamp.now());
                    } else if (expired) {
                        upd.put("status", "APPROVED_AFTER_EXPIRY");
                        upd.put("needs_reconciliation", true);
                        if ("PENDING_PAYMENT".equals(resStatus)) {
                            tx.update(resRef, "status", "EXPIRED");
                        }
                    } else {
                        upd.put("status", "DUPLICATE_APPROVED");
                        upd.put("needs_reconciliation", true);
                    }
                } else {
                    if ("APPROVED".equals(current)) {
                        return null;
                    }
                    upd.put("status", mpStatus.toUpperCase());
                }

                tx.set(payRef, upd, SetOptions.merge());
                return null;
            }).get();
            notificationService.reservaConfirmada(reservationId);
        } catch (ExecutionException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Erro ao processar o pagamento");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Operação interrompida");
        }
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva não encontrada");
    }
}