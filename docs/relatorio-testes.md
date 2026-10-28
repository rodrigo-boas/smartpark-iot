# Relatório de testes — SmartPark IoT

Data dos testes: 28/10/2026. Ambiente: backend, front-end e túneis rodando via Docker Compose; Mercado Pago em modo teste; ESP32-S2 no Wokwi; chamadas do dispositivo também simuladas pelo PowerShell (`Invoke-RestMethod` com `X-Device-Id` e `X-Device-Secret`).

Códigos de reserva usados como evidência: `UrNLlCchY2tIYzGKyXUw` (T04), `xomRrIDoH4dyoREobrEL` (T07, T10, T11), `SjiGo17HwC5SlDKolMTI` (T12), `3yvyBrFPCbkGEU07hJqL` (local errado).

## Testes do roteiro

| ID | Cenário | Entrada | Resultado esperado | Resultado observado | Situação |
|---|---|---|---|---|---|
| T01 | Abrir o mapa | `http://localhost:4200` | Mapa com os estacionamentos | Mapa com Unidade Centro e Unidade Shopping, tarifa, horário e vagas livres | Passou |
| T02 | Datas inválidas | Saída antes da chegada | Backend rejeita | HTTP 400 com mensagem "A saída deve ser depois da chegada" | Passou |
| T03 | Sem vaga no horário | 7ª reserva no mesmo horário em um local de 6 vagas | Conflito informado | HTTP 409 "Sem vagas disponíveis para este horário" (a mensagem só apareceu após a correção C2) | Passou após correção |
| T04 | Pagamento rejeitado | Cartão de teste com titular `OTHE` | Reserva não confirma | Mercado Pago recusou; reserva continuou `PENDING_PAYMENT` e nenhuma mensagem foi enviada | Passou |
| T05 | Pagamento aprovado | Cartão de teste com titular `APRO` | Pagamento verificado e reserva confirmada uma vez | Webhook validado, reserva `CONFIRMED`, mensagem "RESERVA CONFIRMADA" no Telegram | Passou |
| T06 | Webhook repetido | "Simular notificação" no painel do Mercado Pago, duas vezes | Nenhuma confirmação ou cobrança duplicada | 1ª tentativa: HTTP 500 (bug C5). Após a correção: HTTP 200 nas duas, nenhuma reserva alterada, nenhuma mensagem nova | Passou após correção |
| T07 | Entrada com reserva válida | Evento `ENTRY` com reserva `CONFIRMED` no local certo | Backend autoriza, cancela abre, evento registrado | `{allowed: true, reason: OK}`, reserva `CHECKED_IN`, vaga `OCCUPIED`, evento em `access_events`. No Wokwi: LCD "ENTRADA LIBERADA", servo aberto, LED verde | Passou |
| T08 | Entrada sem reserva paga | Código inexistente / sem código | Cancela fechada e LED vermelho | `{allowed: false, reason: NO_RESERVATION}`. No Wokwi: LCD "ACESSO NEGADO / SEM RESERVA", LED vermelho, servo fechado | Passou |
| T09 | Perda de conexão com o backend | ESP32 sem conseguir conectar ao servidor | Estado `FALHA_REDE`, sem liberar acesso | Requisição falhou (`-1 connection refused`); LCD "FALHA DE REDE", cancela fechada, LED vermelho; nenhum acesso liberado | Passou |
| T10 | Registrar saída | Evento `EXIT` com reserva `CHECKED_IN` | Saída real salva, duração e valor calculados | `{allowed: true, reason: OK}`, reserva `COMPLETED`, ticket em `tickets/{id}` com duração e valor, comprovante no Telegram. No Wokwi: LCD "SAIDA LIBERADA" | Passou |
| T11 | Repetir evento de saída | Mesmo `event_id` do T10 | Sem ticket nem cobrança duplicados | Mesma resposta `{allowed: true, reason: OK}`; um único ticket e um único comprovante no Telegram | Passou |
| T12 | Telegram indisponível | Token do bot inválido durante a saída | Ticket salvo e envio pendente | Ticket salvo; notificação `ticket-{id}` ficou `PENDING_RETRY`. Com o token restaurado, o job reenviou e o status virou `SENT` | Passou |
| T13 | Alterar preço pelo navegador | `priceEstimateCents: 1` e `price: 1` no corpo da reserva (1 h no Centro) | Backend ignora e calcula | Reserva criada com `priceEstimateCents: 800` (R$ 8,00) | Passou |
| T14 | Reserva de outro usuário | Consultar código de outra pessoa | Acesso negado | **Não testável**: não há autenticação de usuário; todas as rotas usam o usuário fixo `demo-user` | Limitação |
| T15 | Repositório Git | `git ls-files`, `git grep` e histórico | Nenhum segredo versionado | Nenhum `.env`, `.idea`, chave `.json`/`.pem` ou token no código nem no histórico; `git grep` achou apenas o nome da variável `NGROK_AUTHTOKEN` no `docker-compose.yml`, sem valor | Passou |

## Testes extras

| Cenário | Entrada | Esperado | Observado | Situação |
|---|---|---|---|---|
| Fora do horário de funcionamento | Reserva das 23h às 00h | Rejeitar | HTTP 400 "O estacionamento funciona das 06:00 às 22:00..." (após correção C1) | Passou após correção |
| Chegada no passado | Chegada hoje às 10:00, às 10:13 | Rejeitar | Mensagem "A chegada não pode estar no passado" na tela | Passou |
| Disponibilidade por período | `GET /api/parking-lots/lot-centro/availability` antes e depois de reservar | Vagas livres diminuem | `freeSpaces` caiu de 5 para 4 | Passou |
| Período inválido na disponibilidade | `from` depois de `to` | Rejeitar | HTTP 400 "O fim do período deve ser depois do início" | Passou |
| Escolha de vaga já reservada | Mesma vaga e mesmo horário de uma reserva ativa | Rejeitar | HTTP 409 "Esta vaga acabou de ser reservada. Escolha outra." | Passou |
| Portão de outro local | Reserva do Centro no portão do Shopping | Negar | `{allowed: false, reason: WRONG_LOT}` | Passou |
| Nova entrada em reserva encerrada | `ENTRY` com reserva `COMPLETED` | Negar | `{allowed: false, reason: NOT_CONFIRMED}` | Passou |
| Saída atrasada (excedente) | Reserva de 5 min; saída 11 min após o previsto | Sair normalmente e alertar | Saída liberada; comprovante com excedente e mensagem "ALERTA OPERACIONAL — PERMANÊNCIA EXCEDENTE" | Passou |
| Assinatura do webhook | Notificação simulada pelo painel | Assinatura aceita | Não houve 401, assinatura `x-signature` validada | Passou |

## Defeitos encontrados e correções

| Nº | Defeito | Causa | Correção |
|---|---|---|---|
| C1 | Era possível reservar às 23h com o local funcionando das 06h às 22h | `ReservationService` não validava `opening_hours` | Validação do horário de funcionamento (fuso `America/Bahia`, mesmo dia) dentro da transação |
| C2 | Front-end mostrava só "Erro 409" / "Erro 400" | O corpo do erro chegava sem o campo `message` | `RestExceptionHandler` (`@RestControllerAdvice`) devolvendo `{status, message}` |
| C3 | Mapa mostrava "6 de 6 vagas livres" mesmo após reservas | `freeSpaces` contava apenas `occupancy_state` | Contagem considera reservas ativas; endpoints de disponibilidade e de vagas por período |
| C4 | Mensagem de erro sumia logo após aparecer | A atualização da disponibilidade limpava a mensagem | A mensagem só é limpa ao trocar o local ou as datas |
| C5 | Webhook com pagamento inexistente devolvia HTTP 500 (o Mercado Pago reenviaria sem parar) | Erro 404 da API do Mercado Pago não era tratado | 404 vira "ignorar" (HTTP 200); outras falhas viram 502 |
| C6 | ESP32 no Wokwi não conectava ao backend (`-1 connection refused`) | Handshake TLS encerrado pelo domínio do ngrok (`SSL - The connection indicated an EOF`); outros sites funcionavam | Túnel HTTPS temporário da Cloudflare (`cloudflared`) só para o ESP32; ngrok mantido para o webhook |
| C7 | Backend dependia do IntelliJ e do Java instalados | Não havia imagem do backend | `Dockerfile` multi-stage e serviço `backend` no `docker-compose.yml`, com a chave do Firebase montada de fora |

## Limitações

- Sem autenticação de usuário (Firebase Auth não implementado): uso do `demo-user` fixo; T14 não testável.
- Cancelamento com reembolso (regra de 3 horas), "Minhas reservas" e painel administrativo não implementados.
- Notificações do Telegram vão para um chat fixo.
- Excedente é registrado e alertado, mas não cobrado automaticamente.
- O endereço do túnel do ESP32 muda a cada execução e precisa ser atualizado no `sketch.ino`.
- A simulação de webhook do painel usa um pagamento fictício; a não duplicação com pagamento real é garantida pela transação idempotente (T05) e pelo id determinístico das notificações.