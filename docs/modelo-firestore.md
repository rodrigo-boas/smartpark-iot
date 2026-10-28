# Modelo de dados do Firestore — SmartPark IoT

Projeto: `smartpark-iot-52b13`. O acesso é feito **somente pelo backend** (Firebase Admin SDK). O navegador e o ESP32 nunca falam com o Firestore diretamente. Datas são `Timestamp` (UTC); valores em dinheiro são inteiros em **centavos**.

## Visão geral

```
parking_lots/{lotId}
spaces/{lotId}-{label}            -> parking_lot_id
reservations/{reservationId}      -> parking_lot_id, space_id, user_id
payments/{reservationId}          -> reservation_id
access_events/{eventId}           -> reservation_id, device_id
tickets/{reservationId}           -> reservation_id
devices/{deviceId}                -> parking_lot_id
notifications/{notificationId}    -> reservation_id
```

## parking_lots

Exemplo de id: `lot-centro`.

| Campo | Tipo | Descrição |
|---|---|---|
| name | string | Nome exibido no mapa |
| address | string | Endereço fictício |
| latitude, longitude | number | Posição no mapa |
| hourly_rate_cents | number | Tarifa por hora (ex.: 800 = R$ 8,00) |
| opening_hours | map | `{open: "06:00", close: "22:00"}` |
| active | boolean | Se aparece no mapa |
| created_at | timestamp | Criação |

## spaces

Exemplo de id: `lot-centro-A-01`.

| Campo | Tipo | Descrição |
|---|---|---|
| parking_lot_id | string | Estacionamento da vaga |
| label | string | Rótulo (ex.: `A-01`) |
| active | boolean | Se pode ser reservada |
| occupancy_state | string | `FREE` ou `OCCUPIED` (muda na entrada e na saída) |
| last_booking_at | timestamp | Atualizado em cada reserva; força conflito entre transações concorrentes |

## reservations

Id gerado pelo Firestore (também é o código mostrado ao usuário).

| Campo | Tipo | Descrição |
|---|---|---|
| user_id | string | Dono da reserva (hoje fixo: `demo-user`) |
| parking_lot_id, space_id, space_label | string | Local e vaga (escolhida pelo cliente ou pelo servidor, sempre validada no servidor) |
| arrival_expected, departure_expected | timestamp | Período reservado |
| status | string | `PENDING_PAYMENT`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `EXPIRED` |
| price_estimate_cents | number | Preço calculado no servidor (mínimo 1 h, arredonda para cima) |
| created_at | timestamp | Criação |
| expires_at | timestamp | Limite para pagar (criação + 15 min) |
| confirmed_at | timestamp | Quando o pagamento foi confirmado |
| arrival_real, departure_real | timestamp | Entrada e saída registradas pela cancela |

## payments

Id = id da reserva (um pagamento por reserva).

| Campo | Tipo | Descrição |
|---|---|---|
| reservation_id | string | Reserva |
| provider | string | `mercadopago` |
| preference_id | string | Preferência do Checkout Pro |
| payment_id | string | Id do pagamento no Mercado Pago |
| amount_cents, currency | number, string | Valor e moeda esperados (`BRL`) |
| status | string | `PENDING`, `APPROVED`, `REJECTED`, `AMOUNT_MISMATCH`, `APPROVED_AFTER_EXPIRY`, `DUPLICATE_APPROVED` |
| needs_reconciliation | boolean | Caso que precisa de análise manual |
| created_at, verified_at | timestamp | Criação e última verificação na API |

## access_events

Id = `event_id` enviado pelo ESP32. Garante idempotência: o mesmo evento repetido devolve o resultado salvo, sem novo efeito.

| Campo | Tipo | Descrição |
|---|---|---|
| event_id | string | Identificador único do evento |
| reservation_id | string | Código lido no portão |
| device_id, parking_lot_id | string | Dispositivo e local |
| type | string | `ENTRY` ou `EXIT` |
| timestamp | timestamp | Momento do evento |
| allowed | boolean | Se a cancela abriu |
| reason | string | `OK`, `NO_RESERVATION`, `NOT_CONFIRMED`, `OUTSIDE_WINDOW`, `WRONG_LOT`, `ALREADY_INSIDE`, `NOT_INSIDE` |

## tickets

Id = id da reserva (no máximo um ticket por reserva).

| Campo | Tipo | Descrição |
|---|---|---|
| ticket_id, reservation_id | string | Identificadores |
| parking_lot_id, user_id, space_label | string | Dados do uso |
| arrival_real, departure_real | timestamp | Horários reais |
| duration_minutes | number | Permanência |
| final_amount_cents | number | Valor final (igual ao pago na Opção A) |
| overtime_minutes | number | Minutos além da saída prevista (com tolerância de 10 min) |
| overtime_status | string | `NONE` ou `PENDING` |
| payment_status | string | `APPROVED` |
| telegram_status | string | `PENDING`, `SENT` ou `PENDING_RETRY` |
| created_at | timestamp | Emissão |

## devices

Ids: `esp32-portao-01` e `esp32-portao-centro`.

| Campo | Tipo | Descrição |
|---|---|---|
| parking_lot_id | string | Local onde o portão está |
| status | string | `ACTIVE` (`REVOKED` bloqueia o dispositivo) |
| secret_hash | string | SHA-256 do segredo (o segredo em si **não** é guardado) |
| firmware_version | string | Versão do firmware |
| last_seen | timestamp | Última telemetria |
| reported_state | string | Estado informado pelo ESP32 |
| offline_alert_sent | boolean | Evita repetir o alerta de dispositivo sem sinal (> 2 min) |

## notifications

Ids determinísticos evitam mensagens duplicadas: `confirmacao-{reservationId}`, `ticket-{reservationId}`, `overtime-{reservationId}`.

| Campo | Tipo | Descrição |
|---|---|---|
| notification_id | string | Id da notificação |
| reservation_id | string | Reserva relacionada (se houver) |
| channel | string | `TELEGRAM` |
| type | string | `CONFIRMATION`, `TICKET`, `ALERT` |
| text | string | Texto enviado (sem tokens nem dados de cartão) |
| attempts | number | Tentativas feitas (máximo 5) |
| status | string | `SENT`, `PENDING_RETRY` ou `FAILED` |
| sent_at | timestamp | Envio bem-sucedido |

## Dados de demonstração

Criados pelo `DataSeeder` quando `SEED_ENABLED=true` (não sobrescreve estacionamentos existentes):

- `lot-centro`: Unidade Centro, 6 vagas (`A-01` a `A-06`), R$ 8,00/h.
- `lot-shopping`: Unidade Shopping, 4 vagas (`B-01` a `B-04`), R$ 12,00/h.
- Ambos funcionam das 06:00 às 22:00.
- Dispositivos `esp32-portao-01` (no `lot-shopping`) e `esp32-portao-centro` (no `lot-centro`), ambos com o hash do `DEVICE_SHARED_SECRET`.