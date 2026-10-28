package com.smartpark.backend.config;

import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.FieldValue;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.WriteBatch;
import com.smartpark.backend.service.DeviceAuthService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
public class DataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private final Firestore firestore;
    private final boolean seedHabilitado;
    private final String deviceSecret;

    public DataSeeder(Firestore firestore,
                      @Value("${smartpark.seed.enabled:false}") boolean seedHabilitado,
                      @Value("${DEVICE_SHARED_SECRET:}") String deviceSecret) {
        this.firestore = firestore;
        this.seedHabilitado = seedHabilitado;
        this.deviceSecret = deviceSecret;
    }

    @Override
    public void run(String... args) throws Exception {
        if (!seedHabilitado) {
            log.info("Seed desabilitado");
            return;
        }
        criarEstacionamento("lot-centro", "Unidade Centro",
                "Av. Exemplo, 100 - Centro", -12.2664, -38.9663, 800, 6, "A");
        criarEstacionamento("lot-shopping", "Unidade Shopping",
                "Rua Exemplo, 200 - Bairro", -12.2400, -38.9400, 1200, 4, "B");
        criarDispositivo("esp32-portao-01", "lot-shopping");
        criarDispositivo("esp32-portao-centro", "lot-centro");
        log.info("Seed concluido");
    }

    private void criarEstacionamento(String id, String nome, String endereco,
                                     double latitude, double longitude,
                                     long tarifaHoraCentavos, int quantidadeVagas,
                                     String prefixo) throws Exception {
        DocumentReference ref = firestore.collection("parking_lots").document(id);
        if (ref.get().get().exists()) {
            log.info("Estacionamento {} ja existe, ignorando", id);
            return;
        }

        WriteBatch batch = firestore.batch();

        Map<String, Object> lot = new HashMap<>();
        lot.put("name", nome);
        lot.put("address", endereco);
        lot.put("latitude", latitude);
        lot.put("longitude", longitude);
        lot.put("hourly_rate_cents", tarifaHoraCentavos);
        lot.put("opening_hours", Map.of("open", "06:00", "close", "22:00"));
        lot.put("active", true);
        lot.put("created_at", FieldValue.serverTimestamp());
        batch.set(ref, lot);

        for (int i = 1; i <= quantidadeVagas; i++) {
            String label = prefixo + "-" + String.format("%02d", i);
            DocumentReference vagaRef = firestore.collection("spaces")
                    .document(id + "-" + label);

            Map<String, Object> vaga = new HashMap<>();
            vaga.put("parking_lot_id", id);
            vaga.put("label", label);
            vaga.put("active", true);
            vaga.put("occupancy_state", "FREE");
            batch.set(vagaRef, vaga);
        }

        batch.commit().get();
        log.info("Estacionamento {} criado com {} vagas", id, quantidadeVagas);
    }

    private void criarDispositivo(String deviceId, String lotId) throws Exception {
        if (deviceSecret == null || deviceSecret.isBlank()) {
            log.warn("DEVICE_SHARED_SECRET nao definido; dispositivo {} nao criado", deviceId);
            return;
        }
        Map<String, Object> device = new HashMap<>();
        device.put("parking_lot_id", lotId);
        device.put("status", "ACTIVE");
        device.put("firmware_version", "1.0.0");
        device.put("secret_hash", DeviceAuthService.sha256(deviceSecret));
        firestore.collection("devices").document(deviceId).set(device).get();
        log.info("Dispositivo {} criado/atualizado", deviceId);
    }
}