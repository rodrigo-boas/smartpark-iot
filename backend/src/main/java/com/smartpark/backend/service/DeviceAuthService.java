package com.smartpark.backend.service;

import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.FieldValue;
import com.google.cloud.firestore.Firestore;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class DeviceAuthService {

    private final Firestore firestore;

    /** Retorna o parking_lot_id do dispositivo autenticado ou lança 401. */
    public String autenticar(String deviceId, String secret) {
        if (deviceId == null || deviceId.isBlank() || deviceId.contains("/")
                || secret == null || secret.isBlank()) {
            throw unauthorized();
        }
        try {
            DocumentSnapshot d = firestore.collection("devices").document(deviceId).get().get();
            if (!d.exists() || "REVOKED".equals(d.getString("status"))) {
                throw unauthorized();
            }
            String stored = d.getString("secret_hash");
            if (stored == null || !MessageDigest.isEqual(
                    stored.getBytes(StandardCharsets.UTF_8),
                    sha256(secret).getBytes(StandardCharsets.UTF_8))) {
                throw unauthorized();
            }
            return d.getString("parking_lot_id");
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Erro ao autenticar dispositivo");
        }
    }

    public void registrarTelemetria(String deviceId, Map<String, Object> body) {
        Map<String, Object> update = new HashMap<>();
        update.put("last_seen", FieldValue.serverTimestamp());
        update.put("reported_state", limitar(body.get("state")));
        update.put("firmware_version", limitar(body.get("firmware_version")));
        update.put("offline_alert_sent", false);
        firestore.collection("devices").document(deviceId).update(update);
    }

    private static String limitar(Object value) {
        String s = String.valueOf(value);
        return s.length() > 40 ? s.substring(0, 40) : s;
    }

    public static String sha256(String value) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(h);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Dispositivo não autorizado");
    }
}