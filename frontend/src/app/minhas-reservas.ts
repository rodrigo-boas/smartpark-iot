import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ParkingLot, ParkingLotService, Reservation } from './parking-lot.service';

const ATIVOS = ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN'];

const ROTULOS: Record<string, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  CONFIRMED: 'Confirmada',
  CHECKED_IN: 'Em uso',
  COMPLETED: 'Concluída',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
};

const CORES: Record<string, string> = {
  PENDING_PAYMENT: 'pendente',
  CONFIRMED: 'ok',
  CHECKED_IN: 'uso',
  COMPLETED: 'fim',
  EXPIRED: 'erro',
  CANCELLED: 'erro',
};

const ZONA = 'America/Bahia';

type Aba = 'ativas' | 'historico';

function tempo(iso: string): number {
  return iso ? new Date(iso).getTime() : 0;
}

@Component({
  selector: 'app-minhas-reservas',
  imports: [RouterLink],
  template: `
    <div class="pagina">
      <header class="cab">
        <div>
          <h1>Minhas reservas</h1>
          <p class="sub">Suas reservas ficam salvas na sua conta.</p>
        </div>
        <a class="sp-btn sp-btn--secundario" routerLink="/mapa">Nova reserva</a>
      </header>

      <div class="abas" role="tablist">
        <button type="button" role="tab" [attr.aria-selected]="aba() === 'ativas'"
                [class.ativa]="aba() === 'ativas'" (click)="aba.set('ativas')">
          Ativas <span class="contador">{{ ativas().length }}</span>
        </button>
        <button type="button" role="tab" [attr.aria-selected]="aba() === 'historico'"
                [class.ativa]="aba() === 'historico'" (click)="aba.set('historico')">
          Histórico <span class="contador">{{ historico().length }}</span>
        </button>
      </div>

      @if (carregando()) {
        <p class="estado">Carregando reservas…</p>
      } @else if (erro()) {
        <div class="estado">
          <p class="erro">{{ erro() }}</p>
          <button type="button" class="sp-btn sp-btn--secundario" (click)="carregar()">Tentar de novo</button>
        </div>
      } @else if (lista().length === 0) {
        <div class="vazio">
          <div class="vaga-vazia" aria-hidden="true"><span class="sp-mono">P</span></div>
          <h2>{{ aba() === 'ativas' ? 'Nenhuma reserva ativa' : 'Nada no histórico ainda' }}</h2>
          <p>
            {{ aba() === 'ativas'
              ? 'Escolha um estacionamento no mapa e garanta sua vaga antes de sair de casa.'
              : 'Reservas concluídas, expiradas ou canceladas aparecem aqui.' }}
          </p>
          @if (aba() === 'ativas') {
            <a class="sp-btn sp-btn--primario" routerLink="/mapa">Reservar uma vaga</a>
          }
        </div>
      } @else {
        <ul class="lista">
          @for (r of lista(); track r.id) {
            <li [class]="'linha linha--' + cor(r.status)">
              <div class="esq">
                <span class="sp-mono codigo">{{ codigoCurto(r.id) }}</span>
                <span [class]="'sp-selo sp-selo--' + r.status.toLowerCase()">{{ rotulo(r.status) }}</span>
              </div>
              <div class="dir">
                <dl class="dados">
                  <div class="col-local"><dt>Local</dt><dd>{{ nomeLocal(r.parkingLotId) }}</dd></div>
                  <div><dt>Vaga</dt><dd class="sp-mono forte">{{ r.spaceLabel }}</dd></div>
                  <div class="col-periodo"><dt>Período</dt><dd class="sp-mono">{{ periodo(r) }}</dd></div>
                  <div><dt>Valor</dt><dd class="sp-mono forte">{{ preco(r.priceEstimateCents) }}</dd></div>
                </dl>
                <a class="ver" [routerLink]="['/reservas', r.id]">
                  Ver ticket
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6"/>
                  </svg>
                </a>
              </div>
            </li>
          }
        </ul>
        @if (aba() === 'ativas') {
          <p class="rodape">Para pagar ou cancelar uma reserva pendente, abra o ticket.</p>
        }
      }
    </div>
  `,
  styles: [`
    :host { display: block; padding: 40px 24px 56px; }
    .pagina { max-width: 960px; margin: 0 auto; }

    .cab { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 24px; }
    h1 { margin: 0 0 6px; font-size: 40px; line-height: 48px; font-weight: 700; letter-spacing: -0.015em; }
    .sub { margin: 0; color: var(--sp-text-muted); }

    .abas { display: flex; gap: 24px; margin-bottom: 24px; border-bottom: 1px solid var(--sp-border); }
    .abas button {
      position: relative; display: flex; align-items: center; gap: 8px; padding: 0 0 12px;
      border: 0; background: none; color: var(--sp-text-muted); font-weight: 500; cursor: pointer;
    }
    .abas button:hover { color: var(--sp-text); }
    .abas button.ativa { color: var(--sp-text); font-weight: 600; }
    .abas button.ativa::after {
      content: ''; position: absolute; left: 0; right: 0; bottom: -2px; height: 3px;
      background: repeating-linear-gradient(90deg, var(--sp-primary) 0 8px, transparent 8px 13px);
    }
    .contador {
      min-width: 20px; padding: 0 6px; border-radius: 3px; text-align: center;
      font-family: var(--sp-font-mono); font-size: 11px; font-weight: 700; line-height: 18px;
      background: var(--sp-desabilitado); color: var(--sp-text-muted);
    }
    .abas button.ativa .contador { background: var(--sp-navy); color: var(--sp-on-dark); }

    /* ---------- Linha em formato de ticket ---------- */
    .lista { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
    .linha {
      display: grid; grid-template-columns: 196px 1fr; background: var(--sp-surface);
      border: 1px solid var(--sp-border); border-left: 6px solid var(--sp-poucas); border-radius: var(--sp-radius);
    }
    .linha--ok { border-left-color: var(--sp-livre); }
    .linha--uso { border-left-color: var(--sp-success); }
    .linha--fim { border-left-color: var(--sp-navy); }
    .linha--erro { border-left-color: var(--sp-lotado); }

    .esq {
      position: relative; display: flex; flex-direction: column; justify-content: center; gap: 10px;
      padding: 18px 20px; border-right: 2px dashed var(--sp-border-forte);
    }
    .esq::before, .esq::after {
      content: ''; position: absolute; right: -11px; width: 20px; height: 20px; border-radius: 50%;
      background: var(--sp-bg); border: 1px solid var(--sp-border);
    }
    .esq::before { top: -11px; }
    .esq::after { bottom: -11px; }
    .esq .sp-selo { align-self: flex-start; }
    .codigo { font-size: 16px; font-weight: 700; }

    .dir { display: flex; align-items: center; gap: 16px; padding: 18px 24px; }
    .dados { flex: 1; display: grid; grid-template-columns: 1.3fr .6fr 1.3fr .9fr; gap: 12px 20px; margin: 0; }
    dt {
      font-size: 11px; line-height: 16px; font-weight: 600; letter-spacing: .06em;
      text-transform: uppercase; color: var(--sp-text-muted);
    }
    dd { margin: 4px 0 0; font-weight: 600; }
    dd.sp-mono { font-weight: 500; font-size: 13px; }
    dd.forte { font-weight: 700; font-size: 15px; }

    .ver {
      display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
      color: var(--sp-primary-text); font-weight: 600; text-decoration: none;
    }
    .ver:hover { text-decoration: underline; }

    .rodape { margin: 16px 0 0; font-size: 12px; color: var(--sp-text-muted); }

    /* ---------- Estados ---------- */
    .estado { padding: 32px; text-align: center; color: var(--sp-text-muted); }
    .erro { color: var(--sp-danger); font-weight: 600; }

    .vazio {
      display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px 24px;
      text-align: center; background: var(--sp-surface);
      border: 2px dashed var(--sp-border-forte); border-radius: var(--sp-radius);
    }
    .vaga-vazia {
      display: grid; place-items: end center; width: 64px; height: 88px; padding-bottom: 10px;
      border: 3px solid var(--sp-vaga-linha); border-bottom: 0;
    }
    .vaga-vazia span { font-size: 22px; font-weight: 700; color: var(--sp-border-forte); }
    .vazio h2 { margin: 4px 0 0; font-size: 20px; line-height: 28px; }
    .vazio p { margin: 0 0 8px; max-width: 360px; color: var(--sp-text-muted); }

    @media (max-width: 760px) {
      h1 { font-size: 30px; line-height: 38px; }
      .cab { flex-direction: column; align-items: stretch; }
      .linha { grid-template-columns: 1fr; }
      .esq { flex-direction: row; justify-content: space-between; align-items: center; border-right: 0; border-bottom: 2px dashed var(--sp-border-forte); }
      .esq::before, .esq::after { display: none; }
      .dir { flex-direction: column; align-items: stretch; }
      .dados { grid-template-columns: 1fr 1fr; }
      .ver { align-self: flex-end; }
    }
  `],
})
export class MinhasReservas implements OnInit {
  private readonly service = inject(ParkingLotService);

  readonly aba = signal<Aba>('ativas');
  readonly reservas = signal<Reservation[]>([]);
  readonly lots = signal<ParkingLot[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal('');

  /** Ativas: a próxima chegada primeiro. */
  readonly ativas = computed(() =>
    this.reservas()
      .filter((r) => ATIVOS.includes(r.status))
      .sort((a, b) => tempo(a.arrivalExpected) - tempo(b.arrivalExpected)),
  );

  /** Histórico: a mais recente primeiro. */
  readonly historico = computed(() =>
    this.reservas()
      .filter((r) => !ATIVOS.includes(r.status))
      .sort((a, b) => tempo(b.arrivalExpected) - tempo(a.arrivalExpected)),
  );

  readonly lista = computed(() => (this.aba() === 'ativas' ? this.ativas() : this.historico()));

  async ngOnInit() {
    this.service.list().then((l) => this.lots.set(l)).catch(() => undefined);
    await this.carregar();
  }

  async carregar() {
    this.carregando.set(true);
    this.erro.set('');
    try {
      this.reservas.set(await this.service.myReservations());
    } catch (e) {
      this.erro.set(e instanceof Error ? e.message : 'Não foi possível carregar suas reservas.');
    } finally {
      this.carregando.set(false);
    }
  }

  nomeLocal(id: string): string {
    return this.lots().find((l) => l.id === id)?.name ?? id;
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

  /** 29/10 · 14:00–16:00 */
  periodo(r: Reservation): string {
    const dia = (iso: string) =>
      new Date(iso).toLocaleDateString('pt-BR', { timeZone: ZONA, day: '2-digit', month: '2-digit' });
    const hora = (iso: string) =>
      new Date(iso).toLocaleTimeString('pt-BR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
    const d1 = dia(r.arrivalExpected);
    const d2 = dia(r.departureExpected);
    return d1 === d2
      ? `${d1} · ${hora(r.arrivalExpected)}–${hora(r.departureExpected)}`
      : `${d1} ${hora(r.arrivalExpected)} – ${d2} ${hora(r.departureExpected)}`;
  }
}
