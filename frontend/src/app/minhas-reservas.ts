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
          <p class="sub">Acompanhe, pague ou cancele suas reservas.</p>
        </div>
        <a class="primario" routerLink="/mapa">Nova reserva</a>
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

      @if (mensagem()) {
        <p class="msg" role="status">{{ mensagem() }}</p>
      }

      @if (carregando()) {
        <p class="estado">Carregando reservas…</p>
      } @else if (erro()) {
        <div class="estado">
          <p class="erro">{{ erro() }}</p>
          <button type="button" class="secundario" (click)="carregar()">Tentar de novo</button>
        </div>
      } @else if (lista().length === 0) {
        <div class="vazio">
          <p class="vazio-titulo">
            {{ aba() === 'ativas' ? 'Nenhuma reserva ativa' : 'Nada no histórico ainda' }}
          </p>
          <p>
            {{ aba() === 'ativas'
              ? 'Escolha um estacionamento no mapa e garanta sua vaga.'
              : 'Reservas concluídas, expiradas ou canceladas aparecem aqui.' }}
          </p>
          @if (aba() === 'ativas') {
            <a class="primario" routerLink="/mapa">Reservar uma vaga</a>
          }
        </div>
      } @else {
        <ul class="lista">
          @for (r of lista(); track r.id) {
            <li class="item">
              <div class="item-topo">
                <div>
                  <span class="codigo">{{ codigoCurto(r.id) }}</span>
                  <h2>{{ nomeLocal(r.parkingLotId) }}</h2>
                </div>
                <span [class]="'selo selo--' + r.status.toLowerCase()">{{ rotulo(r.status) }}</span>
              </div>

              <dl class="dados">
                <div><dt>Vaga</dt><dd>{{ r.spaceLabel }}</dd></div>
                <div><dt>Período</dt><dd>{{ periodo(r) }}</dd></div>
                <div><dt>Valor</dt><dd>{{ preco(r.priceEstimateCents) }}</dd></div>
              </dl>

              @if (r.status === 'PENDING_PAYMENT' && r.expiresAt) {
                <p class="aviso">Pague até {{ hora(r.expiresAt) }} para garantir a vaga.</p>
              }

              <div class="acoes">
                @if (r.status === 'PENDING_PAYMENT') {
                  <a class="primario" [routerLink]="['/reservas', r.id]">Pagar</a>
                  <button type="button" class="secundario" [disabled]="cancelando() === r.id"
                          (click)="cancelar(r)">
                    {{ cancelando() === r.id ? 'Cancelando…' : 'Cancelar' }}
                  </button>
                } @else {
                  <a class="secundario" [routerLink]="['/reservas', r.id]">Ver ticket</a>
                }
              </div>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    :host { display: block; padding: 40px 24px; }
    .pagina { max-width: 860px; margin: 0 auto; }

    .cab { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 24px; }
    h1 { margin: 0 0 4px; font-size: 26px; font-weight: 800; }
    .sub { margin: 0; color: var(--sp-text-muted); }

    .abas {
      display: inline-flex; gap: 4px; margin-bottom: 20px; padding: 4px;
      background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: var(--sp-radius-sm);
    }
    .abas button {
      display: flex; align-items: center; gap: 8px; padding: 9px 16px; border: 0; border-radius: 6px;
      background: transparent; color: var(--sp-text-muted); font-weight: 700; cursor: pointer;
    }
    .abas button.ativa { background: var(--sp-navy); color: #fff; }
    .contador {
      min-width: 22px; padding: 1px 7px; border-radius: 999px; font-size: 12px;
      background: rgba(127, 140, 160, .2);
    }
    .abas button.ativa .contador { background: rgba(255, 255, 255, .2); }

    .lista { display: flex; flex-direction: column; gap: 14px; margin: 0; padding: 0; list-style: none; }
    .item { padding: 20px 22px; background: #fff; border: 1px solid var(--sp-border); border-radius: 14px; }
    .item-topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
    .codigo { font-size: 12px; font-weight: 800; letter-spacing: .04em; color: var(--sp-text-muted); }
    h2 { margin: 2px 0 0; font-size: 18px; font-weight: 800; }

    .selo { padding: 5px 11px; border-radius: 999px; font-size: 12px; font-weight: 800; white-space: nowrap; }
    .selo--pending_payment { background: var(--sp-warning-bg); color: var(--sp-warning); }
    .selo--confirmed, .selo--checked_in { background: var(--sp-success-bg); color: var(--sp-success); }
    .selo--completed { background: #e7ebf0; color: var(--sp-text); }
    .selo--expired, .selo--cancelled { background: #fde8e6; color: var(--sp-danger); }

    .dados { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 12px 20px; margin: 0 0 14px; }
    dt { font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--sp-text-muted); }
    dd { margin: 2px 0 0; font-weight: 700; }

    .aviso {
      margin: 0 0 14px; padding: 10px 12px; font-size: 13px; border-radius: var(--sp-radius-sm);
      background: var(--sp-warning-bg); color: var(--sp-warning);
    }
    .acoes { display: flex; gap: 10px; justify-content: flex-end; }

    .primario, .secundario {
      display: inline-flex; align-items: center; justify-content: center; padding: 10px 18px;
      border-radius: var(--sp-radius-sm); font-weight: 800; font-size: 14px;
      text-decoration: none; cursor: pointer;
    }
    .primario { border: 0; background: var(--sp-primary); color: #fff; }
    .primario:hover { background: var(--sp-primary-hover); }
    .secundario { border: 1.5px solid #b9c3cf; background: #fff; color: var(--sp-text); }
    .secundario:hover:not(:disabled) { background: var(--sp-surface-alt); }
    .secundario:disabled { opacity: .6; cursor: not-allowed; }

    .estado { padding: 32px; text-align: center; color: var(--sp-text-muted); }
    .erro { color: var(--sp-danger); font-weight: 600; }
    .msg { margin: 0 0 16px; font-weight: 600; color: var(--sp-success); }

    .vazio {
      padding: 40px 24px; text-align: center; color: var(--sp-text-muted);
      background: #fff; border: 1px dashed #b9c3cf; border-radius: 14px;
    }
    .vazio-titulo { margin: 0 0 6px; font-size: 18px; font-weight: 800; color: var(--sp-text); }
    .vazio p { margin: 0 0 16px; }

    @media (max-width: 640px) {
      .cab { flex-direction: column; align-items: stretch; }
      .dados { grid-template-columns: 1fr 1fr; }
      .acoes { flex-direction: column; }
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
  readonly mensagem = signal('');
  readonly cancelando = signal('');

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

  async cancelar(r: Reservation) {
    const ok = confirm(
      `Cancelar a reserva ${this.codigoCurto(r.id)} da vaga ${r.spaceLabel}? A vaga será liberada para outras pessoas.`,
    );
    if (!ok) return;

    this.cancelando.set(r.id);
    this.mensagem.set('');
    try {
      await this.service.cancelReservation(r.id);
      this.reservas.update((lista) =>
        lista.map((x) => (x.id === r.id ? { ...x, status: 'CANCELLED' } : x)),
      );
      this.mensagem.set('Reserva cancelada. A vaga foi liberada.');
    } catch (e) {
      this.erro.set(e instanceof Error ? e.message : 'Não foi possível cancelar a reserva.');
    } finally {
      this.cancelando.set('');
    }
  }

  nomeLocal(id: string): string {
    return this.lots().find((l) => l.id === id)?.name ?? id;
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

  hora(iso: string): string {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      timeZone: ZONA, hour: '2-digit', minute: '2-digit',
    });
  }

  periodo(r: Reservation): string {
    const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: ZONA });
    const d1 = dia(r.arrivalExpected);
    const d2 = dia(r.departureExpected);
    return d1 === d2
      ? `${d1} · ${this.hora(r.arrivalExpected)} às ${this.hora(r.departureExpected)}`
      : `${d1} ${this.hora(r.arrivalExpected)} até ${d2} ${this.hora(r.departureExpected)}`;
  }
}
