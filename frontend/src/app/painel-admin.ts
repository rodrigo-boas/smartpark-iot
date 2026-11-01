import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { AdminOverview, AdminReservation, AdminService } from './admin.service';

const ROTULOS: Record<string, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  CONFIRMED: 'Confirmada',
  CHECKED_IN: 'Em uso',
  COMPLETED: 'Concluída',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
};

const TIPOS_ALERTA: Record<string, string> = {
  DISPOSITIVO: 'Dispositivo',
  OPERACIONAL: 'Operação',
  PAGAMENTO: 'Pagamento',
};

const ESTADOS_VAGA: Record<string, string> = {
  LIVRE: 'Livre',
  RESERVADA: 'Reservada agora',
  OCUPADA: 'Ocupada',
};

const ZONA = 'America/Bahia';
const INTERVALO_MS = 30_000;

@Component({
  selector: 'app-painel-admin',
  template: `
    <div class="pagina">
      <header class="cab">
        <div>
          <h1>Painel do operador</h1>
          <p class="sub">
            @if (atualizadoEm(); as t) {
              Atualizado às {{ horaDe(t) }} · atualização automática a cada 30 s
            } @else {
              Carregando dados…
            }
          </p>
        </div>
        <button type="button" class="secundario" (click)="atualizarTudo()">Atualizar</button>
      </header>

      @if (erro()) {
        <p class="erro" role="alert">{{ erro() }}</p>
      }

      @if (visao(); as v) {
        <section class="kpis" aria-label="Indicadores">
          <div class="kpi">
            <span class="kpi-rotulo">Ocupação agora</span>
            <strong>{{ v.indicadores.ocupacaoPercent }}%</strong>
            <span class="kpi-det">
              {{ v.indicadores.vagasOcupadas }} ocupadas · {{ v.indicadores.vagasReservadas }} reservadas
              de {{ v.indicadores.vagasTotal }}
            </span>
          </div>
          <div class="kpi">
            <span class="kpi-rotulo">Reservas hoje</span>
            <strong>{{ v.indicadores.reservasHoje }}</strong>
            <span class="kpi-det">chegadas previstas para hoje</span>
          </div>
          <div class="kpi">
            <span class="kpi-rotulo">Receita do dia</span>
            <strong>{{ preco(v.indicadores.receitaHojeCents) }}</strong>
            <span class="kpi-det">reservas pagas com chegada hoje</span>
          </div>
          <div [class]="v.indicadores.dispositivosOnline < v.indicadores.dispositivosTotal ? 'kpi kpi--alerta' : 'kpi'">
            <span class="kpi-rotulo">Dispositivos online</span>
            <strong>{{ v.indicadores.dispositivosOnline }}/{{ v.indicadores.dispositivosTotal }}</strong>
            <span class="kpi-det">
              {{ v.indicadores.dispositivosOnline === v.indicadores.dispositivosTotal
                ? 'todos comunicando' : 'verifique os dispositivos' }}
            </span>
          </div>
        </section>

        <div class="grade">
          <div class="principal">
            <section class="card">
              <div class="card-topo">
                <h2>Ocupação por unidade</h2>
                <div class="legenda" aria-hidden="true">
                  <span><i class="vaga vaga--livre"></i>Livre</span>
                  <span><i class="vaga vaga--reservada"></i>Reservada agora</span>
                  <span><i class="vaga vaga--ocupada"></i>Ocupada</span>
                </div>
              </div>

              @for (u of v.unidades; track u.id) {
                <div class="unidade">
                  <div class="unidade-topo">
                    <strong>{{ u.nome }}</strong>
                    <span>{{ u.livres }} livres · {{ u.reservadas }} reservadas · {{ u.ocupadas }} ocupadas</span>
                  </div>
                  <div class="vagas">
                    @for (vg of u.vagas; track vg.label) {
                      <span [class]="'vaga vaga--' + vg.estado.toLowerCase()"
                            [attr.title]="vg.label + ' · ' + estadoVaga(vg.estado)"
                            [attr.aria-label]="vg.label + ', ' + estadoVaga(vg.estado)">{{ vg.label }}</span>
                    }
                  </div>
                </div>
              } @empty {
                <p class="vazio">Nenhum estacionamento ativo.</p>
              }
            </section>

            <section class="card">
              <div class="card-topo">
                <h2>Reservas</h2>
                <div class="filtros">
                  <select aria-label="Filtrar por unidade" [value]="filtroUnidade()"
                          (change)="mudarUnidade($any($event.target).value)">
                    <option value="">Todas as unidades</option>
                    @for (u of v.unidades; track u.id) {
                      <option [value]="u.id">{{ u.nome }}</option>
                    }
                  </select>
                  <select aria-label="Filtrar por status" [value]="filtroStatus()"
                          (change)="mudarStatus($any($event.target).value)">
                    <option value="">Todos os status</option>
                    @for (s of statusOpcoes; track s[0]) {
                      <option [value]="s[0]">{{ s[1] }}</option>
                    }
                  </select>
                </div>
              </div>

              @if (carregandoReservas()) {
                <p class="vazio">Carregando reservas…</p>
              } @else if (reservas().length === 0) {
                <p class="vazio">Nenhuma reserva encontrada com esses filtros.</p>
              } @else {
                <div class="tabela-rolagem">
                  <table>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Motorista</th>
                        <th>Unidade</th>
                        <th>Vaga</th>
                        <th>Período</th>
                        <th>Status</th>
                        <th class="num">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (r of reservas(); track r.id) {
                        <tr>
                          <td class="mono" [attr.title]="r.id">{{ codigoCurto(r.id) }}</td>
                          <td>{{ r.userEmail || '—' }}</td>
                          <td>{{ nomes().get(r.parkingLotId) ?? r.parkingLotId }}</td>
                          <td class="mono">{{ r.spaceLabel }}</td>
                          <td class="periodo">{{ periodo(r) }}</td>
                          <td><span [class]="'selo selo--' + r.status.toLowerCase()">{{ rotulo(r.status) }}</span></td>
                          <td class="num">{{ preco(r.priceEstimateCents) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <p class="rodape">{{ reservas().length }} reserva(s) · mostrando até as 200 mais recentes</p>
              }
            </section>
          </div>

          <aside class="lateral">
            <section class="card">
              <h2>Alertas</h2>
              @for (a of v.alertas; track $index) {
                <div [class]="'alerta alerta--' + a.tipo.toLowerCase()">
                  <strong>{{ tipoAlerta(a.tipo) }}</strong>
                  <p>{{ a.texto }}</p>
                  <span class="quando">
                    {{ a.quando ? dataHora(a.quando) : 'sem data' }}{{ a.reservaId ? ' · ' + codigoCurto(a.reservaId) : '' }}
                  </span>
                </div>
              } @empty {
                <p class="vazio">Nenhum alerta no momento.</p>
              }
            </section>

            <section class="card">
              <h2>Dispositivos</h2>
              @for (d of v.dispositivos; track d.id) {
                <div class="disp">
                  <span [class]="d.online ? 'ponto ponto--on' : 'ponto'" aria-hidden="true"></span>
                  <div>
                    <strong>{{ d.id }}</strong>
                    <span>{{ nomes().get(d.parkingLotId ?? '') ?? d.parkingLotId }} · {{ d.online ? 'online' : 'offline' }}</span>
                    <span>
                      Último sinal: {{ d.lastSeen ? dataHora(d.lastSeen) : 'nunca' }}{{ d.firmware ? ' · v' + d.firmware : '' }}
                    </span>
                  </div>
                </div>
              } @empty {
                <p class="vazio">Nenhum dispositivo cadastrado.</p>
              }
            </section>
          </aside>
        </div>
      } @else if (carregando()) {
        <p class="vazio">Carregando painel…</p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; padding: 32px 24px; }
    .pagina { max-width: 1200px; margin: 0 auto; }

    .cab { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 20px; }
    h1 { margin: 0 0 4px; font-size: 26px; font-weight: 800; }
    .sub { margin: 0; font-size: 13px; color: var(--sp-text-muted); }
    h2 { margin: 0; font-size: 17px; font-weight: 800; }

    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
    .kpi {
      display: flex; flex-direction: column; gap: 4px; padding: 16px 18px;
      background: #fff; border: 1px solid var(--sp-border); border-radius: 14px;
    }
    .kpi strong { font-size: 28px; font-weight: 800; line-height: 1.1; }
    .kpi-rotulo { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: var(--sp-text-muted); }
    .kpi-det { font-size: 12px; color: var(--sp-text-muted); }
    .kpi--alerta { border-color: #f1b8b2; background: #fff7f6; }
    .kpi--alerta strong { color: var(--sp-danger); }

    .grade { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; }
    .principal, .lateral { display: flex; flex-direction: column; gap: 20px; }
    .card { padding: 20px; background: #fff; border: 1px solid var(--sp-border); border-radius: 14px; }
    .card-topo { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
    .lateral h2 { margin-bottom: 12px; }

    .legenda { display: flex; gap: 14px; font-size: 12px; color: var(--sp-text-muted); }
    .legenda span { display: flex; align-items: center; gap: 6px; }
    .legenda .vaga { width: 14px; min-width: 0; height: 14px; padding: 0; }

    .unidade { padding: 14px 0; border-top: 1px solid var(--sp-border); }
    .unidade:first-of-type { border-top: 0; padding-top: 0; }
    .unidade-topo { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; font-size: 14px; }
    .unidade-topo span { color: var(--sp-text-muted); }
    .vagas { display: flex; flex-wrap: wrap; gap: 6px; }
    .vaga {
      display: inline-grid; place-items: center; min-width: 52px; padding: 6px 4px;
      font-size: 12px; font-weight: 800; border-radius: 6px; border: 1.5px solid transparent;
    }
    .vaga--livre { background: #fff; border-color: #b9c3cf; color: var(--sp-text-muted); }
    .vaga--reservada { background: var(--sp-warning-bg); border-color: #e8b54a; color: var(--sp-warning); }
    .vaga--ocupada { background: var(--sp-navy); border-color: var(--sp-navy); color: #fff; }

    .filtros { display: flex; gap: 8px; flex-wrap: wrap; }
    select {
      padding: 8px 10px; font-size: 14px; color: var(--sp-text);
      background: #fff; border: 1px solid #b9c3cf; border-radius: var(--sp-radius-sm);
    }

    .tabela-rolagem { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th {
      padding: 8px 10px; text-align: left; white-space: nowrap; font-size: 11px; font-weight: 800;
      text-transform: uppercase; color: var(--sp-text-muted); border-bottom: 1px solid var(--sp-border);
    }
    td { padding: 10px; border-bottom: 1px solid #eef1f4; vertical-align: middle; }
    tbody tr:hover { background: var(--sp-surface-alt); }
    .mono { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-weight: 700; }
    .num { text-align: right; white-space: nowrap; }
    .periodo { white-space: nowrap; }
    .rodape { margin: 10px 0 0; font-size: 12px; color: var(--sp-text-muted); }

    .selo { padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 800; white-space: nowrap; }
    .selo--pending_payment { background: var(--sp-warning-bg); color: var(--sp-warning); }
    .selo--confirmed, .selo--checked_in { background: var(--sp-success-bg); color: var(--sp-success); }
    .selo--completed { background: #e7ebf0; color: var(--sp-text); }
    .selo--expired, .selo--cancelled { background: #fde8e6; color: var(--sp-danger); }

    .alerta { padding: 10px 12px; margin-bottom: 10px; border-left: 4px solid; border-radius: 6px; font-size: 13px; }
    .alerta strong { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    .alerta p { margin: 3px 0; }
    .alerta--dispositivo { border-color: var(--sp-danger); background: #fff5f4; }
    .alerta--operacional { border-color: #e8b54a; background: var(--sp-warning-bg); }
    .alerta--pagamento { border-color: var(--sp-primary); background: #edf4fa; }
    .quando { font-size: 12px; color: var(--sp-text-muted); }

    .disp { display: flex; gap: 10px; padding: 10px 0; border-top: 1px solid #eef1f4; font-size: 13px; }
    .disp:first-of-type { border-top: 0; padding-top: 0; }
    .disp div { display: flex; flex-direction: column; gap: 2px; }
    .disp span { color: var(--sp-text-muted); }
    .ponto { flex-shrink: 0; width: 10px; height: 10px; margin-top: 4px; border-radius: 50%; background: var(--sp-danger); }
    .ponto--on { background: var(--sp-success); }

    .secundario {
      padding: 9px 16px; border: 1.5px solid #b9c3cf; border-radius: var(--sp-radius-sm);
      background: #fff; color: var(--sp-text); font-weight: 800; cursor: pointer;
    }
    .secundario:hover { background: var(--sp-surface-alt); }
    .erro { margin: 0 0 16px; font-weight: 600; color: var(--sp-danger); }
    .vazio { margin: 0; padding: 12px 0; font-size: 14px; color: var(--sp-text-muted); }

    @media (max-width: 1000px) {
      .grade { grid-template-columns: 1fr; }
      .kpis { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 560px) {
      .kpis { grid-template-columns: 1fr; }
      .cab { flex-direction: column; align-items: stretch; }
    }
  `],
})
export class PainelAdmin implements OnInit, OnDestroy {
  private readonly api = inject(AdminService);
  private timer?: ReturnType<typeof setInterval>;

  readonly statusOpcoes = Object.entries(ROTULOS);

  readonly visao = signal<AdminOverview | null>(null);
  readonly reservas = signal<AdminReservation[]>([]);
  readonly filtroUnidade = signal('');
  readonly filtroStatus = signal('');
  readonly carregando = signal(true);
  readonly carregandoReservas = signal(false);
  readonly erro = signal('');
  readonly atualizadoEm = signal<Date | null>(null);

  readonly nomes = computed(
    () => new Map((this.visao()?.unidades ?? []).map((u) => [u.id, u.nome] as const)),
  );

  async ngOnInit() {
    await this.atualizarTudo();
    this.timer = setInterval(() => this.atualizar(true), INTERVALO_MS);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  async atualizarTudo() {
    await Promise.all([this.atualizar(), this.carregarReservas()]);
  }

  async atualizar(silencioso = false) {
    if (!silencioso) this.carregando.set(true);
    try {
      this.visao.set(await this.api.overview());
      this.atualizadoEm.set(new Date());
      this.erro.set('');
    } catch (e) {
      this.erro.set(e instanceof Error ? e.message : 'Não foi possível carregar o painel.');
    } finally {
      this.carregando.set(false);
    }
  }

  async carregarReservas() {
    this.carregandoReservas.set(true);
    try {
      this.reservas.set(await this.api.reservations(this.filtroUnidade(), this.filtroStatus()));
    } catch (e) {
      this.erro.set(e instanceof Error ? e.message : 'Não foi possível carregar as reservas.');
    } finally {
      this.carregandoReservas.set(false);
    }
  }

  async mudarUnidade(valor: string) {
    this.filtroUnidade.set(valor);
    await this.carregarReservas();
  }

  async mudarStatus(valor: string) {
    this.filtroStatus.set(valor);
    await this.carregarReservas();
  }

  rotulo(status: string): string {
    return ROTULOS[status] ?? status;
  }

  tipoAlerta(tipo: string): string {
    return TIPOS_ALERTA[tipo] ?? tipo;
  }

  estadoVaga(estado: string): string {
    return ESTADOS_VAGA[estado] ?? estado;
  }

  codigoCurto(id: string): string {
    return 'R-' + id.slice(0, 6).toUpperCase();
  }

  preco(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  horaDe(d: Date): string {
    return d.toLocaleTimeString('pt-BR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
  }

  dataHora(iso: string): string {
    return new Date(iso)
      .toLocaleString('pt-BR', {
        timeZone: ZONA, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
      .replace(', ', ' · ');
  }

  periodo(r: AdminReservation): string {
    const dia = (iso: string) =>
      new Date(iso).toLocaleDateString('pt-BR', { timeZone: ZONA, day: '2-digit', month: '2-digit' });
    const hora = (iso: string) => this.horaDe(new Date(iso));
    const d1 = dia(r.arrivalExpected);
    const d2 = dia(r.departureExpected);
    return d1 === d2
      ? `${d1} · ${hora(r.arrivalExpected)}–${hora(r.departureExpected)}`
      : `${d1} ${hora(r.arrivalExpected)} – ${d2} ${hora(r.departureExpected)}`;
  }
}
