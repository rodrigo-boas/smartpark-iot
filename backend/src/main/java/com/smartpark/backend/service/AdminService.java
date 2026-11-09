package com.smartpark.backend.service;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.Query;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.smartpark.backend.dto.AdminOverview;
import com.smartpark.backend.dto.AdminOverview.Alerta;
import com.smartpark.backend.dto.AdminOverview.Dispositivo;
import com.smartpark.backend.dto.AdminOverview.Indicadores;
import com.smartpark.backend.dto.AdminOverview.Unidade;
import com.smartpark.backend.dto.AdminOverview.VagaStatus;
import com.smartpark.backend.dto.AdminReservation;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;

/** Dados do painel do operador. Acesso protegido pelo FirebaseAuthInterceptor (/api/admin/**). */
@Service
@RequiredArgsConstructor
public class AdminService {

    private static final List<String> ATIVOS = List.of("PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN");
    private static final List<String> PAGOS = List.of("CONFIRMED", "CHECKED_IN", "COMPLETED");
    private static final Duration LIMITE_OFFLINE = Duration.ofMinutes(2);
    private static final ZoneId ZONE = ZoneId.of("America/Bahia");
    private static final int LIMITE_ALERTAS = 30;
    private static final int LIMITE_RESERVAS = 200;
    private static final Map<String, String> TEXTO_PAGAMENTO = Map.of(
            "APPROVED_AFTER_EXPIRY", "Pagamento aprovado depois que a reserva expirou",
            "DUPLICATE_APPROVED", "Pagamento aprovado para reserva cancelada ou já paga",
            "AMOUNT_MISMATCH", "Valor pago diferente do valor da reserva");

    private final Firestore firestore;

    public AdminOverview visaoGeral() throws ExecutionException, InterruptedException {
        Instant agora = Instant.now();
        LocalDate hoje = LocalDate.now(ZONE);
        Timestamp inicioDia = ts(hoje.atStartOfDay(ZONE).toInstant());
        Timestamp fimDia = ts(hoje.plusDays(1).atStartOfDay(ZONE).toInstant());

        List<QueryDocumentSnapshot> lots = new ArrayList<>(firestore.collection("parking_lots")
                .whereEqualTo("active", true).get().get().getDocuments());
        lots.sort(Comparator.comparing((QueryDocumentSnapshot d) -> texto(d.getString("name"))));

        List<QueryDocumentSnapshot> spaces = firestore.collection("spaces")
                .whereEqualTo("active", true).get().get().getDocuments();
        List<QueryDocumentSnapshot> ativas = firestore.collection("reservations")
                .whereIn("status", ATIVOS).get().get().getDocuments();
        List<QueryDocumentSnapshot> deHoje = firestore.collection("reservations")
                .whereGreaterThanOrEqualTo("arrival_expected", inicioDia)
                .whereLessThan("arrival_expected", fimDia)
                .get().get().getDocuments();
        List<QueryDocumentSnapshot> devices = firestore.collection("devices").get().get().getDocuments();
        List<QueryDocumentSnapshot> notificacoes = firestore.collection("notifications")
                .whereEqualTo("type", "ALERT").get().get().getDocuments();
        List<QueryDocumentSnapshot> pagamentos = firestore.collection("payments")
                .whereEqualTo("needs_reconciliation", true).get().get().getDocuments();

        // Vagas com uma reserva válida cobrindo o instante atual
        Set<String> reservadasAgora = new HashSet<>();
        for (QueryDocumentSnapshot r : ativas) {
            if (pendenteExpirada(r, agora)) {
                continue;
            }
            Instant chegada = inst(r.getTimestamp("arrival_expected"));
            Instant saida = inst(r.getTimestamp("departure_expected"));
            if (chegada != null && saida != null && !chegada.isAfter(agora) && saida.isAfter(agora)) {
                reservadasAgora.add(r.getString("space_id"));
            }
        }

        // Ocupação por unidade
        List<Unidade> unidades = new ArrayList<>();
        int totalVagas = 0;
        int totalOcupadas = 0;
        int totalReservadas = 0;
        for (QueryDocumentSnapshot lot : lots) {
            List<QueryDocumentSnapshot> vagasDoLocal = new ArrayList<>();
            for (QueryDocumentSnapshot s : spaces) {
                if (lot.getId().equals(s.getString("parking_lot_id"))) {
                    vagasDoLocal.add(s);
                }
            }
            vagasDoLocal.sort(Comparator.comparing((QueryDocumentSnapshot d) -> texto(d.getString("label"))));

            List<VagaStatus> vagas = new ArrayList<>();
            int ocupadas = 0;
            int reservadas = 0;
            for (QueryDocumentSnapshot s : vagasDoLocal) {
                String estado;
                if ("OCCUPIED".equals(s.getString("occupancy_state"))) {
                    estado = "OCUPADA";
                    ocupadas++;
                } else if (reservadasAgora.contains(s.getId())) {
                    estado = "RESERVADA";
                    reservadas++;
                } else {
                    estado = "LIVRE";
                }
                vagas.add(new VagaStatus(texto(s.getString("label")), estado));
            }

            int total = vagas.size();
            unidades.add(new Unidade(lot.getId(), texto(lot.getString("name")), total,
                    total - ocupadas - reservadas, reservadas, ocupadas, vagas));
            totalVagas += total;
            totalOcupadas += ocupadas;
            totalReservadas += reservadas;
        }

        // Reservas e receita de hoje (chegada prevista para hoje)
        int reservasHoje = 0;
        int pendentesHoje = 0;
        long receitaHoje = 0;
        for (QueryDocumentSnapshot r : deHoje) {
            String status = r.getString("status");
            if ("CANCELLED".equals(status) || "EXPIRED".equals(status) || pendenteExpirada(r, agora)) {
                continue;
            }
            reservasHoje++;
            if ("PENDING_PAYMENT".equals(status)) {
                pendentesHoje++;
            }
            if (PAGOS.contains(status)) {
                receitaHoje += valor(r);
            }
        }

        // Dispositivos e alertas
        List<Dispositivo> dispositivos = new ArrayList<>();
        List<Alerta> alertas = new ArrayList<>();
        int online = 0;
        for (QueryDocumentSnapshot d : devices) {
            Instant visto = inst(d.getTimestamp("last_seen"));
            boolean ativo = !"REVOKED".equals(d.getString("status"));
            boolean estaOnline = ativo && visto != null
                    && Duration.between(visto, agora).compareTo(LIMITE_OFFLINE) <= 0;
            if (estaOnline) {
                online++;
            }
            dispositivos.add(new Dispositivo(d.getId(), d.getString("parking_lot_id"), estaOnline, visto,
                    d.getString("reported_state"), d.getString("firmware_version")));
            if (ativo && !estaOnline) {
                String msg = visto == null
                        ? "Dispositivo " + d.getId() + " ainda não se conectou"
                        : "Dispositivo " + d.getId() + " sem comunicação";
                alertas.add(new Alerta("DISPOSITIVO", msg, visto, null));
            }
        }
        dispositivos.sort(Comparator.comparing(Dispositivo::id));

        for (QueryDocumentSnapshot n : notificacoes) {
            if (n.getId().startsWith("offline-")) {
                continue; // dispositivo offline já aparece ao vivo, acima
            }
            String msg = texto(n.getString("text"))
                    .replace("ALERTA OPERACIONAL — ", "")
                    .replace("\n", " · ");
            Instant quando = inst(n.getTimestamp("sent_at"));
            if (quando == null) {
                quando = inst(n.getTimestamp("updated_at"));
            }
            alertas.add(new Alerta("OPERACIONAL", msg, quando, n.getString("reservation_id")));
        }

        for (QueryDocumentSnapshot p : pagamentos) {
            String status = texto(p.getString("status"));
            String msg = TEXTO_PAGAMENTO.getOrDefault(status,
                    "Pagamento precisa de conferência (" + status + ")");
            alertas.add(new Alerta("PAGAMENTO", msg, inst(p.getTimestamp("verified_at")),
                    p.getString("reservation_id")));
        }

        alertas.sort(Comparator.comparing(Alerta::quando,
                Comparator.nullsLast(Comparator.<Instant>reverseOrder())));
        List<Alerta> alertasLimitados = alertas.size() > LIMITE_ALERTAS
                ? alertas.subList(0, LIMITE_ALERTAS) : alertas;

        int ocupacao = totalVagas == 0 ? 0
                : Math.round((totalOcupadas + totalReservadas) * 100f / totalVagas);

        Indicadores indicadores = new Indicadores(ocupacao, totalVagas, totalOcupadas, totalReservadas,
                reservasHoje, receitaHoje, online, devices.size(), pendentesHoje);

        return new AdminOverview(indicadores, unidades, dispositivos, List.copyOf(alertasLimitados));
    }

    /** Reservas de todos os usuários, com filtros opcionais por unidade e status. */
    public List<AdminReservation> reservas(String lotId, String status)
            throws ExecutionException, InterruptedException {
        Query q = firestore.collection("reservations");
        if (lotId != null && !lotId.isBlank()) {
            q = q.whereEqualTo("parking_lot_id", lotId);
        }
        if (status != null && !status.isBlank()) {
            q = q.whereEqualTo("status", status);
        }
        return q.get().get().getDocuments().stream()
                .map(AdminService::paraReserva)
                .sorted(Comparator.comparing(AdminReservation::arrivalExpected,
                        Comparator.nullsLast(Comparator.<Instant>reverseOrder())))
                .limit(LIMITE_RESERVAS)
                .toList();
    }

    private static AdminReservation paraReserva(DocumentSnapshot d) {
        return new AdminReservation(
                d.getId(),
                d.getString("user_email"),
                d.getString("parking_lot_id"),
                d.getString("space_label"),
                inst(d.getTimestamp("arrival_expected")),
                inst(d.getTimestamp("departure_expected")),
                d.getString("status"),
                valor(d),
                inst(d.getTimestamp("created_at")));
    }

    private static boolean pendenteExpirada(DocumentSnapshot r, Instant agora) {
        if (!"PENDING_PAYMENT".equals(r.getString("status"))) {
            return false;
        }
        Instant exp = inst(r.getTimestamp("expires_at"));
        return exp != null && exp.isBefore(agora);
    }

    private static long valor(DocumentSnapshot d) {
        Long v = d.getLong("price_estimate_cents");
        return v == null ? 0 : v;
    }

    private static String texto(String s) {
        return s == null ? "" : s;
    }

    private static Instant inst(Timestamp ts) {
        return ts == null ? null : Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos());
    }

    private static Timestamp ts(Instant i) {
        return Timestamp.ofTimeSecondsAndNanos(i.getEpochSecond(), i.getNano());
    }
}
