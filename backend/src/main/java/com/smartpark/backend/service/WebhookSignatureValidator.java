package com.smartpark.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

@Component
public class WebhookSignatureValidator {

    private final String secret;

    public WebhookSignatureValidator(@Value("${mercadopago.webhook-secret:}") String secret) {
        this.secret = secret;
    }

    public boolean valido(String xSignature, String xRequestId, String dataId) {
        if (secret == null || secret.isBlank() || xSignature == null
                || xRequestId == null || dataId == null) {
            return false;
        }
        String ts = null;
        String v1 = null;
        for (String part : xSignature.split(",")) {
            String[] kv = part.trim().split("=", 2);
            if (kv.length == 2) {
                if (kv[0].equals("ts")) {
                    ts = kv[1];
                } else if (kv[0].equals("v1")) {
                    v1 = kv[1];
                }
            }
        }
        if (ts == null || v1 == null) {
            return false;
        }
        String manifest = "id:" + dataId.toLowerCase() + ";request-id:" + xRequestId
                + ";ts:" + ts + ";";
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String calculado = HexFormat.of()
                    .formatHex(mac.doFinal(manifest.getBytes(StandardCharsets.UTF_8)));
            return MessageDigest.isEqual(
                    calculado.getBytes(StandardCharsets.UTF_8),
                    v1.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return false;
        }
    }
}