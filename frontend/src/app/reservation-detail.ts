import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ParkingLot, ParkingLotService, Reservation } from './parking-lot.service';

const ROTULOS: Record<string, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  CONFIRMED: 'Confirmada',
  CHECKED_IN: 'Em uso',
  COMPLETED: 'Concluída',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
};

const TITULOS: Record<string, string> = {
  CONFIRMED: 'Reserva confirmada',
  CHECKED_IN: 'Reserva em uso',
  COMPLETED: 'Estadia concluída',
  EXPIRED: 'Reserva expirada',
  CANCELLED: 'Reserva cancelada',
};

/** Cor da faixa do ticket por status. */
const CORES: Record<string, string> = {
  PENDING_PAYMENT: 'pendente',
  CONFIRMED: 'ok',
  CHECKED_IN: 'ok',
  COMPLETED: 'fim',
  EXPIRED: 'erro',
  CANCELLED: 'erro',
};

const ETAPAS = [
  { status: 'PENDING_PAYMENT', rotulo: 'Pagamento pendente' },
  { status: 'CONFIRMED', rotulo: 'Confirmada' },
  { status: 'CHECKED_IN', rotulo: 'Em uso' },
  { status: 'COMPLETED', rotulo: 'Concluída' },
];

const PAGOS = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'];
const ZONA = 'America/Bahia';

@Component({
  selector: 'app-reservation-detail',
  imports: [RouterLink],
  template: `
    @if (reserva(); as r) {
      <div class="pagina">
        <div class="topo">
          <div>
            <a class="voltar" routerLink="/mapa">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path d="M19 12H5M11 6l-6 6 6 6"/>
              </svg>
              Voltar ao mapa
            </a>
            <h1>{{ titulo() }}</h1>
          </div>
          <a class="link-reservas" routerLink="/minhas-reservas">Ver minhas reservas</a>
        </div>

        <div class="grade">
          <!-- ================= Ticket ================= -->
          <article [class]="'ticket ticket--' + cor(r.status)">
            <header class="ticket-cab">
              <div>
                <p class="ticket-titulo">Reserva <span class="sp-mono codigo">{{ codigoCurto(r.id) }}</span></p>
                <p class="emitido">
                  Ticket de estacionamento
                  @if (r.createdAt) {
                    · emitido em {{ dataHoraLonga(r.createdAt) }}
                  }
                </p>
              </div>
              <span [class]="'sp-selo sp-selo--' + r.status.toLowerCase()">{{ rotulo(r.status) }}</span>
            </header>

            <div class="picote" aria-hidden="true"></div>

            <div class="ticket-corpo">
              <dl class="dados">
                <div><dt>Local</dt><dd>{{ nomeLocal() }}</dd></div>
                <div><dt>Vaga</dt><dd class="sp-mono forte">{{ r.spaceLabel }}</dd></div>
                <div><dt>Chegada prevista</dt><dd class="sp-mono">{{ dataHora(r.arrivalExpected) }}</dd></div>
                <div><dt>Saída prevista</dt><dd class="sp-mono">{{ dataHora(r.departureExpected) }}</dd></div>
                @if (r.arrivalReal) {
                  <div><dt>Chegada real</dt><dd class="sp-mono">{{ dataHora(r.arrivalReal) }}</dd></div>
                }
                @if (r.departureReal) {
                  <div><dt>Saída real</dt><dd class="sp-mono">{{ dataHora(r.departureReal) }}</dd></div>
                }
                <div><dt>Tolerância de saída</dt><dd>10 minutos</dd></div>
                <div><dt>Valor</dt><dd class="sp-mono valor">{{ preco(r.priceEstimateCents) }}</dd></div>
              </dl>

              @switch (r.status) {
                @case ('PENDING_PAYMENT') {
                  <p class="aviso aviso--pendente">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                    <span>A vaga fica bloqueada até {{ hora(r.expiresAt) }}. Se o pagamento não for aprovado até lá, a reserva expira e a vaga volta a ficar livre.</span>
                  </p>
                }
                @case ('CONFIRMED') {
                  <p class="aviso aviso--ok">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>
                    <span>Pagamento aprovado. Na chegada, a cancela abre automaticamente.</span>
                  </p>
                }
                @case ('CHECKED_IN') {
                  <p class="aviso aviso--ok">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>
                    <span>Veículo no estacionamento{{ r.arrivalReal ? ' desde ' + hora(r.arrivalReal) : '' }}. Saia até {{ hora(r.departureExpected) }} (tolerância de 10 minutos).</span>
                  </p>
                }
                @case ('COMPLETED') {
                  <p class="aviso aviso--fim">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>
                    <span>Estadia concluída{{ r.departureReal ? ' às ' + hora(r.departureReal) : '' }}. Obrigado por usar o SmartPark.</span>
                  </p>
                }
                @case ('EXPIRED') {
                  <p class="aviso aviso--erro">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/></svg>
                    <span>
                      @if (r.expiredReason === 'NO_SHOW') {
                        A reserva expirou porque não houve entrada até o fim do período. Pela política de tarifa, reservas pagas e não utilizadas não são reembolsadas.
                      } @else {
                        O prazo de pagamento terminou e a vaga foi liberada.
                      }
                      <a routerLink="/mapa">Fazer uma nova reserva</a>
                    </span>
                  </p>
                }
                @case ('CANCELLED') {
                  <p class="aviso aviso--erro">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/></svg>
                    <span>Reserva cancelada. A vaga foi liberada. <a routerLink="/mapa">Fazer uma nova reserva</a></span>
                  </p>
                }
              }

              @if (indice() >= 0) {
                <div class="andamento">
                  <p class="sp-rotulo">Andamento</p>
                  <ol class="passos">
                    @for (e of etapas; track e.status; let i = $index) {
                      <li [class.feito]="i < indice()" [class.atual]="i === indice()">
                        <span class="marca" aria-hidden="true">
                          @if (i < indice()) {
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="m5 12 5 5 9-10"/></svg>
                          }
                        </span>
                        <span class="nome">{{ e.rotulo }}</span>
                      </li>
                    }
                  </ol>
                </div>
              }
            </div>

            <div class="picote" aria-hidden="true"></div>

            <footer class="ticket-rodape">
              <span class="sp-rotulo">Código para digitar na cancela</span>
              <span class="sp-mono codigo-cancela">{{ r.id }}</span>
            </footer>
          </article>

          <!-- ================= Lateral ================= -->
          <aside class="lateral">
            @if (r.status === 'PENDING_PAYMENT') {
              <section class="cartao">
                <div class="cartao-cab">
                  <h2>Pagamento</h2>
                  <span class="seguro">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
                    Checkout seguro
                  </span>
                </div>

                @if (aguardando()) {
                  <div class="processando" role="status">
                    <span class="spinner" aria-hidden="true"></span>
                    <strong>Aguardando a confirmação do pagamento…</strong>
                  </div>
                  <p class="texto">Assim que o Mercado Pago aprovar o pagamento, esta página atualiza sozinha. Não feche a aba.</p>
                  <button type="button" class="sp-btn sp-btn--primario sp-btn--bloco" disabled>
                    Pagar {{ preco(r.priceEstimateCents) }} com Mercado Pago
                  </button>
                  <button type="button" class="sp-btn sp-btn--link centro" [disabled]="atualizando()" (click)="atualizarStatus()">
                    {{ atualizando() ? 'Atualizando…' : 'Atualizar status' }}
                  </button>
                } @else {
                  <p class="texto">Você será levado ao checkout seguro do Mercado Pago para concluir o pagamento. Ao voltar, o status da reserva atualiza aqui.</p>
                  <div class="total">
                    <span>Total · {{ horas() }} h na vaga {{ r.spaceLabel }}</span>
                    <strong class="sp-mono">{{ preco(r.priceEstimateCents) }}</strong>
                  </div>
                  <button type="button" class="sp-btn sp-btn--primario sp-btn--bloco" [disabled]="carregando()" (click)="pagar()">
                    {{ carregando() ? 'Abrindo checkout…' : 'Pagar ' + preco(r.priceEstimateCents) + ' com Mercado Pago' }}
                  </button>
                  <button type="button" class="sp-btn sp-btn--secundario sp-btn--bloco" [disabled]="carregando() || cancelando()" (click)="cancelar()">
                    {{ cancelando() ? 'Cancelando…' : 'Cancelar reserva' }}
                  </button>
                  <p class="nota">Enquanto o pagamento não for feito, você pode cancelar sem custo.</p>
                }

                @if (mensagem()) {
                  <p class="erro" role="alert">{{ mensagem() }}</p>
                }
              </section>
            } @else if (pago()) {
              <section class="cartao">
                <div class="cartao-cab">
                  <h2>Pagamento</h2>
                  <span class="seguro">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
                    Checkout seguro
                  </span>
                </div>
                <div class="aprovado">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>
                  Pagamento aprovado
                </div>
                <div class="total">
                  <span>Pago via Mercado Pago{{ r.confirmedAt ? ' · ' + diaHora(r.confirmedAt) : '' }}</span>
                  <strong class="sp-mono">{{ preco(r.priceEstimateCents) }}</strong>
                </div>
                @if (r.status === 'CONFIRMED') {
                  <p class="nota">Reservas pagas e não utilizadas expiram ao fim do período, sem reembolso.</p>
                }
              </section>
            } @else {
              <section class="cartao">
                <h2>Esta reserva não está ativa</h2>
                <p class="texto">Escolha um estacionamento no mapa para reservar uma nova vaga.</p>
                <a class="sp-btn sp-btn--primario sp-btn--bloco" routerLink="/mapa">Fazer nova reserva</a>
              </section>
            }

            @if (r.status === 'PENDING_PAYMENT' || r.status === 'CONFIRMED') {
              <section [class]="r.status === 'CONFIRMED' ? 'cartao cartao--confirmado' : 'cartao cartao--previa'">
                <h2>Após a aprovação</h2>
                <span class="sp-selo sp-selo--confirmed">Reserva confirmada</span>
                <p class="texto">
                  Código <strong class="sp-mono">{{ codigoCurto(r.id) }}</strong> · Vaga
                  <strong class="sp-mono">{{ r.spaceLabel }}</strong>. Na chegada, a cancela abre automaticamente.
                </p>
              </section>
            }
          </aside>
        </div>
      </div>
    } @else if (erro()) {
      <section class="sozinho">
        <h1>Reserva não encontrada</h1>
        <p class="erro">{{ erro() }}</p>
        <a class="sp-btn sp-btn--secundario" routerLink="/mapa">Voltar ao mapa</a>
      </section>
    } @else {
      <p class="carregando">Carregando reserva…</p>
    }
  `,
  styles: [`
    :host { display: block; padding: 32px 24px 56px; }
    .pagina { max-width: 1120px; margin: 0 auto; }

    .topo { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 20px; }
    .voltar {
      display: inline-flex; align-items: center; gap: 6px; margin-bottom: 4px;
      color: var(--sp-primary-text); font-weight: 600; text-decoration: none;
    }
    .voltar:hover { text-decoration: underline; }
    h1 { margin: 0; font-size: 28px; line-height: 36px; font-weight: 700; }
    .link-reservas { font-size: 12px; font-weight: 600; color: var(--sp-primary-text); }

    .grade { display: grid; grid-template-columns: minmax(0, 1fr) 362px; gap: 32px; align-items: start; }

    /* ---------- Ticket ---------- */
    .ticket {
      position: relative; background: var(--sp-surface);
      border-top: 6px solid var(--sp-poucas); border-radius: var(--sp-radius);
      box-shadow: 0 1px 2px rgba(31, 35, 40, .06);
    }
    .ticket--ok { border-top-color: var(--sp-livre); }
    .ticket--fim { border-top-color: var(--sp-navy); }
    .ticket--erro { border-top-color: var(--sp-lotado); }

    .ticket-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 28px 38px 24px; }
    .ticket-titulo { margin: 0 0 6px; font-family: var(--sp-font-titulo); font-size: 20px; font-weight: 700; }
    .codigo { font-size: 28px; letter-spacing: -0.01em; margin-left: 4px; }
    .emitido { margin: 0; font-size: 12px; color: var(--sp-text-muted); }

    .picote { position: relative; margin: 0 24px; border-top: 2px dashed var(--sp-border-forte); }
    .picote::before, .picote::after {
      content: ''; position: absolute; top: -13px; width: 24px; height: 24px;
      border-radius: 50%; background: var(--sp-bg);
    }
    .picote::before { left: -36px; }
    .picote::after { right: -36px; }

    .ticket-corpo { padding: 24px 38px; }

    .dados { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 32px; margin: 0 0 24px; }
    dt {
      font-size: 11px; line-height: 16px; font-weight: 600; letter-spacing: .06em;
      text-transform: uppercase; color: var(--sp-text-muted);
    }
    dd { margin: 4px 0 0; font-weight: 600; }
    dd.sp-mono { font-weight: 500; }
    dd.forte { font-weight: 700; font-size: 16px; }
    .valor { font-size: 28px; line-height: 36px; font-weight: 700 !important; color: var(--sp-primary-text); }

    .aviso {
      display: flex; gap: 10px; margin: 0 0 24px; padding: 12px 16px;
      font-size: 13px; font-weight: 600; border-radius: var(--sp-radius);
      border: 1px solid; border-left-width: 4px;
    }
    .aviso svg { width: 18px; height: 18px; flex-shrink: 0; margin-top: 1px; }
    .aviso a { color: inherit; font-weight: 700; margin-left: 4px; }
    .aviso--pendente { background: var(--sp-warning-bg); color: var(--sp-warning); border-color: var(--sp-poucas); }
    .aviso--ok { background: var(--sp-success-bg); color: var(--sp-success); border-color: var(--sp-livre); }
    .aviso--fim { background: var(--sp-bg); color: var(--sp-text); border-color: var(--sp-navy); }
    .aviso--erro { background: var(--sp-danger-bg); color: var(--sp-danger); border-color: var(--sp-lotado); }

    .andamento .sp-rotulo { margin: 0 0 12px; }
    .passos { display: grid; grid-template-columns: repeat(4, 1fr); margin: 0; padding: 0; list-style: none; }
    .passos li { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .passos li + li::before {
      content: ''; position: absolute; top: 11px; right: 50%; width: 100%;
      border-top: 2px dashed var(--sp-border-forte);
    }
    .passos li.feito::before, .passos li.atual::before { border-top-color: var(--sp-livre); }
    .marca {
      position: relative; z-index: 1; display: grid; place-items: center; width: 22px; height: 22px;
      border-radius: 4px; border: 2px solid var(--sp-border-forte); background: var(--sp-surface);
    }
    .feito .marca { background: var(--sp-success); border-color: var(--sp-success); color: #FFFFFF; }
    .atual .marca { background: var(--sp-primary); border-color: var(--sp-navy); }
    .atual .marca::after { content: ''; width: 6px; height: 6px; background: var(--sp-navy); }
    .nome { font-size: 12px; color: var(--sp-text-muted); text-align: center; }
    .atual .nome { color: var(--sp-text); font-weight: 600; }

    .ticket-rodape { display: flex; flex-direction: column; gap: 6px; padding: 20px 38px 26px; }
    .codigo-cancela { font-size: 20px; font-weight: 700; letter-spacing: .02em; word-break: break-all; }

    /* ---------- Lateral ---------- */
    .lateral { display: flex; flex-direction: column; gap: 20px; }
    .cartao {
      display: flex; flex-direction: column; gap: 14px; padding: 24px;
      background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: var(--sp-radius);
    }
    .cartao--previa { border-style: dashed; border-color: var(--sp-border-forte); }
    .cartao--confirmado { border-color: var(--sp-livre); }
    .cartao h2 { margin: 0; font-size: 20px; line-height: 28px; font-weight: 700; }
    .cartao .sp-selo { align-self: flex-start; }
    .cartao-cab { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .seguro { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--sp-text-muted); }
    .seguro svg { width: 13px; height: 13px; }

    .texto { margin: 0; color: var(--sp-text-muted); }
    .texto strong { color: var(--sp-text); }
    .nota { margin: 0; font-size: 12px; color: var(--sp-text-muted); }
    .erro { margin: 0; font-size: 13px; font-weight: 600; color: var(--sp-danger); }

    .total {
      display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 0;
      border-top: 1px dashed var(--sp-border-forte); border-bottom: 1px dashed var(--sp-border-forte);
    }
    .total strong { font-size: 18px; white-space: nowrap; }

    .processando {
      display: flex; align-items: center; gap: 12px; padding: 14px 16px;
      background: var(--sp-bg); border: 1px dashed var(--sp-navy); border-radius: var(--sp-radius);
    }
    .spinner {
      width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%;
      border: 2px solid var(--sp-border); border-top-color: var(--sp-primary);
      animation: girar .8s linear infinite;
    }
    @keyframes girar { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }

    .aprovado {
      display: flex; align-items: center; gap: 10px; padding: 12px 16px; font-weight: 600;
      color: var(--sp-success); background: var(--sp-success-bg);
      border: 1px solid var(--sp-livre); border-left-width: 4px; border-radius: var(--sp-radius);
    }
    .aprovado svg { width: 18px; height: 18px; }

    .centro { align-self: center; }

    .sozinho {
      max-width: 480px; margin: 40px auto; padding: 28px;
      background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: var(--sp-radius);
    }
    .sozinho h1 { margin-bottom: 8px; }
    .sozinho .erro { margin-bottom: 16px; }
    .carregando { text-align: center; color: var(--sp-text-muted); }

    @media (max-width: 900px) {
      .grade { grid-template-columns: 1fr; }
      .topo { flex-direction: column; align-items: flex-start; }
    }
    @media (max-width: 560px) {
      .ticket-cab, .ticket-corpo, .ticket-rodape { padding-left: 22px; padding-right: 22px; }
      .ticket-cab { flex-direction: column; }
      .dados { grid-template-columns: 1fr; }
      .nome { font-size: 11px; }
    }
  `],
})
export class ReservationDetail implements OnInit, OnDestroy {
  private readonly service = inject(ParkingLotService);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private timer?: ReturnType<typeof setInterval>;

  readonly etapas = ETAPAS;
  readonly reserva = signal<Reservation | null>(null);
  readonly lots = signal<ParkingLot[]>([]);
  readonly erro = signal('');
  readonly mensagem = signal('');
  readonly carregando = signal(false);
  readonly aguardando = signal(false);
  readonly cancelando = signal(false);
  readonly atualizando = signal(false);

  readonly lote = computed(
    () => this.lots().find((l) => l.id === this.reserva()?.parkingLotId) ?? null,
  );
  readonly nomeLocal = computed(() => this.lote()?.name ?? this.reserva()?.parkingLotId ?? '');
  readonly horas = computed(() => {
    const r = this.reserva();
    const l = this.lote();
    return r && l && l.hourlyRateCents > 0 ? Math.round(r.priceEstimateCents / l.hourlyRateCents) : 0;
  });
  /** Posição no andamento; concluída marca todas as etapas como feitas. */
  readonly indice = computed(() => {
    const status = this.reserva()?.status;
    if (status === 'COMPLETED') return ETAPAS.length;
    return ETAPAS.findIndex((e) => e.status === status);
  });
  readonly pago = computed(() => PAGOS.includes(this.reserva()?.status ?? ''));
  readonly titulo = computed(() => TITULOS[this.reserva()?.status ?? ''] ?? 'Sua reserva');

  async ngOnInit() {
    this.service.list().then((l) => this.lots.set(l)).catch(() => undefined);
    try {
      const r = await this.service.getReservation(this.id);
      this.reserva.set(r);
      if (r.status === 'PENDING_PAYMENT') {
        this.iniciarPolling();
      }
    } catch (e) {
      this.erro.set(e instanceof Error ? e.message : 'Não foi possível carregar a reserva.');
    }
  }

  ngOnDestroy() {
    this.pararPolling();
  }

  async pagar() {
    const r = this.reserva();
    if (!r) return;
    this.mensagem.set('');
    this.carregando.set(true);
    const janela = window.open('', '_blank');
    try {
      const url = await this.service.checkout(r.id);
      if (janela) {
        janela.location.href = url;
      } else {
        window.location.href = url;
      }
      this.aguardando.set(true);
      this.iniciarPolling();
    } catch (e) {
      janela?.close();
      this.mensagem.set(e instanceof Error ? e.message : 'Erro ao abrir o checkout.');
    } finally {
      this.carregando.set(false);
    }
  }

  async cancelar() {
    const r = this.reserva();
    if (!r) return;
    const ok = confirm(
      `Cancelar a reserva ${this.codigoCurto(r.id)} da vaga ${r.spaceLabel}? A vaga será liberada para outras pessoas.`,
    );
    if (!ok) return;

    this.cancelando.set(true);
    this.mensagem.set('');
    try {
      await this.service.cancelReservation(r.id);
      this.pararPolling();
      this.aguardando.set(false);
      this.reserva.set({ ...r, status: 'CANCELLED' });
    } catch (e) {
      this.mensagem.set(e instanceof Error ? e.message : 'Não foi possível cancelar a reserva.');
    } finally {
      this.cancelando.set(false);
    }
  }

  async atualizarStatus() {
    this.atualizando.set(true);
    this.mensagem.set('');
    try {
      const atual = await this.service.getReservation(this.id);
      this.reserva.set(atual);
      if (atual.status !== 'PENDING_PAYMENT') {
        this.pararPolling();
        this.aguardando.set(false);
      }
    } catch (e) {
      this.mensagem.set(e instanceof Error ? e.message : 'Não foi possível atualizar o status.');
    } finally {
      this.atualizando.set(false);
    }
  }

  rotulo(status: string): string {
    return ROTULOS[status] ?? status;
  }

  cor(status: string): string {
    return CORES[status] ?? 'pendente';
  }

  codigoCurto(id: string): string {
    return 'R-' + id.slice(0, 6).toUpperCase();
  }

  preco(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /** 29/10/2026 · 14:00 */
  dataHora(iso: string): string {
    return new Date(iso)
      .toLocaleString('pt-BR', {
        timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
      .replace(', ', ' · ');
  }

  /** 29/10/2026 às 13:58 */
  dataHoraLonga(iso: string): string {
    return this.dataHora(iso).replace(' · ', ' às ');
  }

  /** 29/10 às 14:01 */
  diaHora(iso: string): string {
    return new Date(iso)
      .toLocaleString('pt-BR', {
        timeZone: ZONA, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
      .replace(', ', ' às ');
  }

  hora(iso: string): string {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      timeZone: ZONA, hour: '2-digit', minute: '2-digit',
    });
  }

  private iniciarPolling() {
    this.pararPolling();
    let tentativas = 0;
    this.timer = setInterval(async () => {
      tentativas++;
      try {
        const atual = await this.service.getReservation(this.id);
        this.reserva.set(atual);
        if (atual.status !== 'PENDING_PAYMENT' || tentativas > 150) {
          this.pararPolling();
          this.aguardando.set(false);
        }
      } catch {
        this.pararPolling();
      }
    }, 4000);
  }

  private pararPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
