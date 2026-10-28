\# Modelo de dados do Firestore — SmartPark IoT



Projeto: `smartpark-iot-52b13`. O acesso é feito \*\*somente pelo backend\*\* (Firebase Admin SDK). O navegador e o ESP32 nunca falam com o Firestore diretamente. Datas são `Timestamp` (UTC); valores em dinheiro são inteiros em \*\*centavos\*\*.



\## Visão geral



```

parking\_lots/{lotId}

spaces/{lotId}-{label}            -> parking\_lot\_id

reservations/{reservationId}      -> parking\_lot\_id, space\_id, user\_id

payments/{reservationId}          -> reservation\_id

access\_events/{eventId}           -> reservation\_id, device\_id

tickets/{reservationId}           -> reservation\_id

devices/{deviceId}                -> parking\_lot\_id

notifications/{notificationId}    -> reservation\_id

```



\## parking\_lots



Exemplo de id: `lot-centro`.



| Campo | Tipo | Descrição |

|---|---|---|

| name | string | Nome exibido no mapa |

| address | string | Endereço fictício |

| latitude, longitude | number | Posição no mapa |

| hourly\_rate\_cents | number | Tarifa por hora (ex.: 800 = R$ 8,00) |

| opening\_hours | map | `{open: "06:00", close: "22:00"}` |

| active | boolean | Se aparece no mapa |

| created\_at | timestamp | Criação |



\## spaces



Exemplo de id: `lot-centro-A-01`.



| Campo | Tipo | Descrição |

|---|---|---|

| parking\_lot\_id | string | Estacionamento da vaga |

| label | string | Rótulo (ex.: `A-01`) |

| active | boolean | Se pode ser reservada |

| occupancy\_state | string | `FREE` ou `OCCUPIED` (muda na entrada e na saída) |

| last\_booking\_at | timestamp | Atualizado em cada reserva; força conflito entre transações concorrentes |



\## reservations



Id gerado pelo Firestore (também é o código mostrado ao usuário).



| Campo | Tipo | Descrição |

|---|---|---|

| user\_id | string | Dono da reserva (hoje fixo: `demo-user`) |

| parking\_lot\_id, space\_id, space\_label | string | Local e vaga escolhidos pelo servidor |

| arrival\_expected, departure\_expected | timestamp | Período reservado |

| status | string | `PENDING\_PAYMENT`, `CONFIRMED`, `CHECKED\_IN`, `COMPLETED`, `EXPIRED` |

| price\_estimate\_cents | number | Preço calculado no servidor (mínimo 1 h, arredonda para cima) |

| created\_at | timestamp | Criação |

| expires\_at | timestamp | Limite para pagar (criação + 15 min) |

| confirmed\_at | timestamp | Quando o pagamento foi confirmado |

| arrival\_real, departure\_real | timestamp | Entrada e saída registradas pela cancela |



\## payments



Id = id da reserva (um pagamento por reserva).



| Campo | Tipo | Descrição |

|---|---|---|

| reservation\_id | string | Reserva |

| provider | string | `mercadopago` |

| preference\_id | string | Preferência do Checkout Pro |

| payment\_id | string | Id do pagamento no Mercado Pago |

| amount\_cents, currency | number, string | Valor e moeda esperados (`BRL`) |

| status | string | `PENDING`, `APPROVED`, `REJECTED`, `AMOUNT\_MISMATCH`, `APPROVED\_AFTER\_EXPIRY`, `DUPLICATE\_APPROVED` |

| needs\_reconciliation | boolean | Caso que precisa de análise manual |

| created\_at, verified\_at | timestamp | Criação e última verificação na API |



\## access\_events



Id = `event\_id` enviado pelo ESP32. Garante idempotência: o mesmo evento repetido devolve o resultado salvo, sem novo efeito.



| Campo | Tipo | Descrição |

|---|---|---|

| event\_id | string | Identificador único do evento |

| reservation\_id | string | Código lido no portão |

| device\_id, parking\_lot\_id | string | Dispositivo e local |

| type | string | `ENTRY` ou `EXIT` |

| timestamp | timestamp | Momento do evento |

| allowed | boolean | Se a cancela abriu |

| reason | string | `OK`, `NO\_RESERVATION`, `NOT\_CONFIRMED`, `OUTSIDE\_WINDOW`, `WRONG\_LOT`, `ALREADY\_INSIDE`, `NOT\_INSIDE` |



\## tickets



Id = id da reserva (no máximo um ticket por reserva).



| Campo | Tipo | Descrição |

|---|---|---|

| ticket\_id, reservation\_id | string | Identificadores |

| parking\_lot\_id, user\_id, space\_label | string | Dados do uso |

| arrival\_real, departure\_real | timestamp | Horários reais |

| duration\_minutes | number | Permanência |

| final\_amount\_cents | number | Valor final (igual ao pago na Opção A) |

| overtime\_minutes | number | Minutos além da saída prevista (com tolerância de 10 min) |

| overtime\_status | string | `NONE` ou `PENDING` |

| payment\_status | string | `APPROVED` |

| telegram\_status | string | `PENDING`, `SENT` ou `PENDING\_RETRY` |

| created\_at | timestamp | Emissão |



\## devices



Exemplo de id: `esp32-portao-01`.



| Campo | Tipo | Descrição |

|---|---|---|

| parking\_lot\_id | string | Local onde o portão está |

| status | string | `ACTIVE` |

| secret\_hash | string | SHA-256 do segredo (o segredo em si \*\*não\*\* é guardado) |

| firmware\_version | string | Versão do firmware |

| last\_seen | timestamp | Última telemetria |

| reported\_state | string | Estado informado pelo ESP32 |

| offline\_alert\_sent | boolean | Evita repetir o alerta de dispositivo sem sinal (> 2 min) |



\## notifications



Ids determinísticos evitam mensagens duplicadas: `confirmacao-{reservationId}`, `ticket-{reservationId}`, `overtime-{reservationId}`.



| Campo | Tipo | Descrição |

|---|---|---|

| notification\_id | string | Id da notificação |

| reservation\_id | string | Reserva relacionada (se houver) |

| channel | string | `TELEGRAM` |

| type | string | `CONFIRMATION`, `TICKET`, `ALERT` |

| text | string | Texto enviado (sem tokens nem dados de cartão) |

| attempts | number | Tentativas feitas (máximo 5) |

| status | string | `SENT`, `PENDING\_RETRY` ou `FAILED` |

| sent\_at | timestamp | Envio bem-sucedido |



\## Dados de demonstração



Criados pelo `DataSeeder` quando `SEED\_ENABLED=true` (não sobrescreve dados existentes):



\- `lot-centro`: Unidade Centro, 6 vagas (`A-01` a `A-06`), R$ 8,00/h.

\- `lot-shopping`: Unidade Shopping, 4 vagas (`B-01` a `B-04`), R$ 12,00/h.

\- Ambos funcionam das 06:00 às 22:00.

\- Dispositivo `esp32-portao-01` no `lot-shopping`, com o hash do `DEVICE\_SHARED\_SECRET`.

