package com.smartpark.backend.integration;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Slf4j
@Component
public class TelegramClient {

    private final RestClient http;
    private final String chatId;
    private final boolean configurado;

    public TelegramClient(@Value("${telegram.bot-token:}") String token,
                          @Value("${telegram.default-chat-id:}") String chatId) {
        this.configurado = !token.isBlank() && !chatId.isBlank();
        this.chatId = chatId;
        this.http = RestClient.builder()
                .baseUrl("https://api.telegram.org/bot" + token)
                .build();
    }

    public boolean enviar(String texto) {
        if (!configurado) {
            log.warn("Telegram nao configurado");
            return false;
        }
        try {
            http.post()
                    .uri("/sendMessage")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("chat_id", chatId, "text", texto))
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (Exception e) {
            // não registrar a mensagem da exceção: ela pode conter a URL com o token
            log.warn("Falha ao enviar mensagem no Telegram ({})", e.getClass().getSimpleName());
            return false;
        }
    }
}