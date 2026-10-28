package com.smartpark.backend.controller;

import com.smartpark.backend.service.PaymentService;
import com.smartpark.backend.service.WebhookSignatureValidator;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequiredArgsConstructor
public class PaymentController {

    // TEMPORÁRIO: será substituído pelo usuário do token do Firebase Auth
    private static final String DEMO_USER = "demo-user";

    private final PaymentService paymentService;
    private final WebhookSignatureValidator validator;

    @PostMapping("/api/reservations/{id}/checkout")
    public Map<String, String> checkout(@PathVariable String id) {
        return Map.of("checkoutUrl", paymentService.criarCheckout(DEMO_USER, id));
    }

    @PostMapping("/webhooks/mercadopago")
    public ResponseEntity<Void> webhook(
            @RequestParam(name = "data.id", required = false) String dataId,
            @RequestParam(name = "type", required = false) String type,
            @RequestHeader(name = "x-signature", required = false) String signature,
            @RequestHeader(name = "x-request-id", required = false) String requestId) {
        if (!validator.valido(signature, requestId, dataId)) {
            return ResponseEntity.status(401).build();
        }
        if (!"payment".equals(type) || !dataId.matches("\\d{1,20}")) {
            return ResponseEntity.ok().build();
        }
        paymentService.processarWebhook(dataId);
        return ResponseEntity.ok().build();
    }

    @GetMapping(value = "/payments/return", produces = MediaType.TEXT_HTML_VALUE)
    public String retorno() {
        return "<h2>Pagamento recebido. Volte ao SmartPark: a confirmação da reserva "
                + "pode levar alguns segundos.</h2>";
    }
}