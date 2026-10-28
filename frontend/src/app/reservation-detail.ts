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

const ETAPAS = [
  { status: 'PENDING_PAYMENT', rotulo: 'Pagamento pendente' },
  { status: 'CONFIRMED', rotulo: 'Confirmada' },
  { status: 'CHECKED_IN', rotulo: 'Em uso' },
  { status: 'COMPLETED', rotulo: 'Concluída' },
];

const ZONA = 'America/Bahia';

@Component({
  selector: 'app-reservation-detail',
  imports: [RouterLink],
  template: `
    @if (reserva(); as r) {
      <div class="pagina">
        <section class="card">
          <header class="cab">
            <h1>Reserva {{ codigoCurto(r.id) }}</h1>
            <span [class]="'selo selo--' + r.status.toLowerCase()">{{ rotulo(r.status) }}</span>
          </header>

          <dl class="dados">
            <div><dt>Local</dt><dd>{{ nomeLocal() }}</dd></div>
            <div><dt>Vaga</dt><dd>{{ r.spaceLabel }}</dd></div>
            <div><dt>Chegada prevista</dt><dd>{{ dataHora(r.arrivalExpected) }}</dd></div>
            <div><dt>Saída prevista</dt><dd>{{ dataHora(r.departureExpected) }}</dd></div>
            <div><dt>Tolerância de saída</dt><dd>10 minutos</dd></div>
            <div><dt>Valor</dt><dd class="valor">{{ preco(r.priceEstimateCents) }}</dd></div>
          </dl>

          @if (r.status === 'PENDING_PAYMENT') {
            <p class="aviso">
              A vaga fica bloqueada até {{ hora(r.expiresAt) }}. Se o pagamento não for aprovado
              até lá, a reserva expira e a vaga volta a ficar livre.
            </p>
          } @else if (r.status === 'EXPIRED' || r.status === 'CANCELLED') {
            <p class="aviso aviso--erro">
              Esta reserva não está mais ativa. <a routerLink="/mapa">Fazer uma nova reserva</a>
            </p>
          }

          @if (indiceEtapa() >= 0) {
            <ol class="etapas">
              @for (e of etapas; track e.status; let i = $index) {
                <li [class.feita]="i <= indiceEtapa()" [class.atual]="i === indiceEtapa()">
                  {{ e.rotulo }}
                </li>
              }
            </ol>
          }

          <p class="codigo">Código completo da reserva: <code>{{ r.id }}</code></p>
        </section>

        <div class="lateral">
          @if (r.status === 'PENDING_PAYMENT') {
            <section class="card">
              <h2>Pagamento</h2>
              <p class="texto">
                Você será levado ao checkout seguro do Mercado Pago. O SmartPark não guarda dados de cartão.
              </p>
              <button type="button" class="primario" [disabled]="carregando()" (click)="pagar()">
                {{ carregando() ? 'Abrindo checkout…' : 'Pagar ' + preco(r.priceEstimateCents) + ' com Mercado Pago' }}
              </button>
              @if (aguardando()) {
                <p class="info">Aguardando a confirmação do pagamento…</p>
              }
              @if (mensagem()) {
                <p class="msg">{{ mensagem() }}</p>
              }
            </section>
          }

          <section class="card">
            <p class="rotulo">Após a aprovação</p>
            @if (confirmada()) {
              <span class="selo selo--confirmed">Reserva confirmada</span>
            }
            <p class="texto">
              Código <strong>{{ codigoCurto(r.id) }}</strong> · Vaga {{ r.spaceLabel }}.
              Na chegada, a cancela abre automaticamente.
            </p>
            <p class="info">A confirmação e o ticket final são enviados pelo Telegram.</p>
          </section>
        </div>
      </div>
    } @else if (erro()) {
      <section class="card sozinho">
        <h1>Reserva não encontrada</h1>
        <p class="msg">{{ erro() }}</p>
        <a routerLink="/mapa">Voltar ao mapa</a>
      </section>
    } @else {
      <p class="carregando">Carregando reserva…</p>
    }
  `,
  styles: [`
    :host { display: block; padding: 40px 24px; }
    .pagina {
      display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 24px;
      max-width: 980px; margin: 0 auto; align-items: start;
    }
    .card { padding: 28px; background: #fff; border: 1px solid var(--sp-border); border-radius: 16px; }
    .sozinho { max-width: 560px; margin: 0 auto; }
    .lateral { display: flex; flex-direction: column; gap: 24px; }
    .cab { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 20px; }
    h1 { margin: 0; font-size: 24px; font-weight: 800; }
    h2 { margin: 0 0 8px; font-size: 19px; font-weight: 800; }

    .selo { display: inline-block; padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 800; white-space: nowrap; }
    .selo--pending_payment { background: var(--sp-warning-bg); color: var(--sp-warning); }
    .selo--confirmed, .selo--checked_in, .selo--completed { background: var(--sp-success-bg); color: var(--sp-success); }
    .selo--expired, .selo--cancelled { background: #fde8e6; color: var(--sp-danger); }

    .dados { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; margin: 0 0 20px; }
    dt { font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--sp-text-muted); }
    dd { margin: 2px 0 0; font-weight: 800; }
    .valor { font-size: 22px; }

    .aviso {
      margin: 0 0 20px; padding: 14px 16px; font-size: 14px;
      background: var(--sp-warning-bg); color: var(--sp-warning); border-radius: var(--sp-radius-sm);
    }
    .aviso--erro { background: #fde8e6; color: var(--sp-danger); }
    .aviso a { color: inherit; font-weight: 800; }

    .etapas { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 0 0 16px; padding: 0; list-style: none; }
    .etapas li { font-size: 13px; text-align: center; color: var(--sp-text-muted); }
    .etapas li::before {
      content: ''; display: block; height: 6px; margin-bottom: 8px;
      background: #dfe4ea; border-radius: 3px;
    }
    .etapas li.feita::before { background: var(--sp-accent); }
    .etapas li.atual { color: var(--sp-text); font-weight: 800; }

    .codigo { margin: 0; font-size: 13px; color: var(--sp-text-muted); }
    code { word-break: break-all; color: var(--sp-text); }
    .rotulo {
      margin: 0 0 10px; font-size: 12px; font-weight: 800; letter-spacing: .06em;
      text-transform: uppercase; color: var(--sp-text-muted);
    }
    .texto { margin: 10px 0 14px; color: var(--sp-text); }
    .info { margin: 10px 0 0; font-size: 13px; color: var(--sp-text-muted); }
    .msg { margin: 10px 0 0; font-size: 13px; font-weight: 600; color: var(--sp-danger); }
    .carregando { text-align: center; color: var(--sp-text-muted); }

    .primario {
      width: 100%; padding: 13px; border: 0; border-radius: var(--sp-radius-sm);
      background: var(--sp-primary); color: #fff; font-size: 16px; font-weight: 800; cursor: pointer;
    }
    .primario:hover:not(:disabled) { background: var(--sp-primary-hover); }
    .primario:disabled { background: #9db3c6; cursor: not-allowed; }
    a { color: var(--sp-primary); font-weight: 700; }

    @media (max-width: 820px) {
      .pagina { grid-template-columns: 1fr; }
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

  readonly nomeLocal = computed(() => {
    const r = this.reserva();
    return this.lots().find((l) => l.id === r?.parkingLotId)?.name ?? r?.parkingLotId ?? '';
  });
  readonly indiceEtapa = computed(() =>
    ETAPAS.findIndex((e) => e.status === this.reserva()?.status),
  );
  readonly confirmada = computed(() =>
    ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'].includes(this.reserva()?.status ?? ''),
  );

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

  rotulo(status: string): string {
    return ROTULOS[status] ?? status;
  }

  codigoCurto(id: string): string {
    return 'R-' + id.slice(0, 6).toUpperCase();
  }

  preco(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  dataHora(iso: string): string {
    return new Date(iso)
      .toLocaleString('pt-BR', {
        timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
      .replace(', ', ' · ');
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
