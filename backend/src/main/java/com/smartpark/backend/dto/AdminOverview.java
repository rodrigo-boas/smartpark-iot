package com.smartpark.backend.dto;

import java.time.Instant;
import java.util.List;

/** Visão geral do painel do operador. */
public record AdminOverview(
        Indicadores indicadores,
        List<Unidade> unidades,
        List<Dispositivo> dispositivos,
        List<Alerta> alertas) {

    public record Indicadores(
            int ocupacaoPercent,
            int vagasTotal,
            int vagasOcupadas,
            int vagasReservadas,
            int reservasHoje,
            long receitaHojeCents,
            int dispositivosOnline,
            int dispositivosTotal,
            int reservasPendentesHoje) {
    }

    public record Unidade(
            String id,
            String nome,
            int totalVagas,
            int livres,
            int reservadas,
            int ocupadas,
            List<VagaStatus> vagas) {
    }

    /** estado: LIVRE, RESERVADA ou OCUPADA. */
    public record VagaStatus(String label, String estado) {
    }

    public record Dispositivo(
            String id,
            String parkingLotId,
            boolean online,
            Instant lastSeen,
            String estadoReportado,
            String firmware) {
    }

    /** tipo: DISPOSITIVO, OPERACIONAL ou PAGAMENTO. */
    public record Alerta(String tipo, String texto, Instant quando, String reservaId) {
    }
}
