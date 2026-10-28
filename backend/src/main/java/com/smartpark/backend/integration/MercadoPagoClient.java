package com.smartpark.backend.integration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class MercadoPagoClient {

    public record Preference(String id, String initPoint) {
    }

    public record PaymentInfo(String status, String externalReference,
                              BigDecimal amount, String currency) {
    }

    private static final ParameterizedTypeReference<Map<String, Object>> MAP_TYPE =
            new ParameterizedTypeReference<>() {
            };

    private final RestClient http;
    private final boolean configurado;

    public MercadoPagoClient(@Value("${mercadopago.access-token:}") String token) {
        this.configurado = token != null && !token.isBlank();
        this.http = RestClient.builder()
                .baseUrl("https://api.mercadopago.com")
                .defaultHeader("Authorization", "Bearer " + token)
                .build();
    }

    public Preference criarPreferencia(String reservationId, String titulo,
                                       long amountCents, String baseUrl) {
        exigirConfigurado();

        Map<String, Object> item = new HashMap<>();
        item.put("title", titulo);
        item.put("quantity", 1);
        item.put("currency_id", "BRL");
        item.put("unit_price", BigDecimal.valueOf(amountCents, 2));

        String retorno = baseUrl + "/payments/return";
        Map<String, Object> body = new HashMap<>();
        body.put("items", List.of(item));
        body.put("external_reference", reservationId);
        body.put("notification_url", baseUrl + "/webhooks/mercadopago");
        body.put("back_urls", Map.of("success", retorno, "pending", retorno, "failure", retorno));
        body.put("auto_return", "approved");

        try {
            Map<String, Object> res = http.post()
                    .uri("/checkout/preferences")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(MAP_TYPE);
            return new Preference((String) res.get("id"), (String) res.get("init_point"));
        } catch (RestClientException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Falha ao criar o checkout");
        }
    }

    public PaymentInfo buscarPagamento(String paymentId) {
        exigirConfigurado();
        Map<String, Object> res = http.get()
                .uri("/v1/payments/{id}", paymentId)
                .retrieve()
                .body(MAP_TYPE);
        Object amount = res.get("transaction_amount");
        return new PaymentInfo(
                (String) res.get("status"),
                (String) res.get("external_reference"),
                amount == null ? null : new BigDecimal(amount.toString()),
                (String) res.get("currency_id"));
    }

    private void exigirConfigurado() {
        if (!configurado) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Mercado Pago não configurado");
        }
    }
}