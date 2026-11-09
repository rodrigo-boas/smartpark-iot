import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import {
  AdminOverview, AdminReservation, AdminService, Unidade, VagaStatus,
} from './admin.service';

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
const VAGAS_POR_FILEIRA = 10;

type FiltroDia = 'hoje' | 'todas';

function diaLocal(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: ZONA });
}

@Component({
  selector: 'app-painel-admin',
  template: `
    <!-- ================= Conteúdo principal ================= -->
    <div class="principal">
      <header class="cab">
        <div>
          <h1>Painel do operador</h1>
          <p class="sub">
            Hoje, {{ hojeTexto() }} ·
            @if (atualizadoEm(); as t) {
              atualizado às <span class="sp-mono">{{ horaSeg(t) }}</span>
            } @else {
              carregando…
            }
          </p>
        </div>
        <button type="button" class="sp-btn sp-btn--secundario" (click)="atualizarTudo()">Atualizar</button>
      </header>

      @if (erro()) {
        <p class="erro" role="alert">{{ erro() }}</p>
      }

      @if (visao(); as v) {
        <!-- Indicadores -->
        <section class="kpis" aria-label="Indicadores">
          <div class="kpi">
            <div class="kpi-topo"><span class="sp-rotulo">Ocupação agora</span><i class="ponto ponto--laranja"></i></div>
            <strong class="sp-mono">{{ v.indicadores.ocupacaoPercent }}%</strong>
            <span class="kpi-det">
              {{ v.indicadores.vagasOcupadas + v.indicadores.vagasReservadas }} de {{ v.indicadores.vagasTotal }} vagas ocupadas ou reservadas
            </span>
          </div>
          <div class="kpi">
            <div class="kpi-topo"><span class="sp-rotulo">Reservas hoje</span><i class="ponto ponto--ambar"></i></div>
            <strong class="sp-mono">{{ v.indicadores.reservasHoje }}</strong>
            <span class="kpi-det">
              {{ v.indicadores.reservasPendentesHoje === 0
                ? 'nenhuma aguardando pagamento'
                : v.indicadores.reservasPendentesHoje + ' aguardando pagamento' }}
            </span>
          </div>
          <div class="kpi">
            <div class="kpi-topo"><span class="sp-rotulo">Receita estimada do dia</span><i class="ponto ponto--verde"></i></div>
            <strong class="sp-mono">{{ preco(v.indicadores.receitaHojeCents) }}</strong>
            <span class="kpi-det">Pagamentos aprovados até agora</span>
          </div>
          <div class="kpi">
            <div class="kpi-topo"><span class="sp-rotulo">Dispositivos online</span><i class="ponto ponto--vermelho"></i></div>
            <strong class="sp-mono">{{ v.indicadores.dispositivosOnline }}/{{ v.indicadores.dispositivosTotal }}</strong>
            @if (v.indicadores.dispositivosOnline < v.indicadores.dispositivosTotal) {
              <span class="kpi-det kpi-det--erro">
                {{ v.indicadores.dispositivosTotal - v.indicadores.dispositivosOnline }} sem comunicação
              </span>
            } @else {
              <span class="kpi-det">Todos comunicando</span>
            }
          </div>
        </section>

        <!-- Ocupação por unidade -->
        <section>
          <div class="secao-topo">
            <h2>Ocupação por unidade</h2>
            <div class="legenda" aria-hidden="true">
              <span><i class="cel cel--livre"></i>Livre</span>
              <span><i class="cel cel--reservada"></i>Reservada</span>
              <span><i class="cel cel--ocupada"></i>Ocupada</span>
            </div>
          </div>
          <div class="unidades">
            @for (u of v.unidades; track u.id) {
              @let pct = percentual(u);
              <article class="unidade">
                <div class="unidade-topo">
                  <h3>{{ u.nome }}</h3>
                  <span [class]="'pct sp-mono pct--' + nivel(pct)">{{ pct }}%</span>
                </div>
                <div class="patio">
                  @for (fila of linhas(u); track $index; let i = $index) {
                    @if (i % 2 === 1) {
                      <div class="corredor" aria-hidden="true"></div>
                    }
                    <div class="fila">
                      @for (vg of fila; track vg.label) {
                        <span [class]="'cel cel--' + vg.estado.toLowerCase()"
                              [attr.title]="vg.label + ' · ' + estadoVaga(vg.estado)"
                              [attr.aria-label]="vg.label + ', ' + estadoVaga(vg.estado)"></span>
                      }
                    </div>
                  }
                </div>
                <p class="contagem">
                  <b class="c-livre">{{ u.livres }}</b> livres
                  <b class="c-reservada">{{ u.reservadas }}</b> reservadas
                  <b>{{ u.ocupadas }}</b> ocupadas
                </p>
              </article>
            } @empty {
              <p class="vazio">Nenhum estacionamento ativo.</p>
            }
          </div>
        </section>

        <!-- Reservas -->
        <section>
          <div class="secao-topo secao-topo--tabela">
            <h2>{{ filtroDia() === 'hoje' ? 'Reservas de hoje' : 'Reservas' }}</h2>
            <div class="filtros">
              <label class="sp-campo">
                <span>Período</span>
                <select [value]="filtroDia()" (change)="filtroDia.set($any($event.target).value)">
                  <option value="hoje">Hoje</option>
                  <option value="todas">Todas</option>
                </select>
              </label>
              <label class="sp-campo">
                <span>Unidade</span>
                <select [value]="filtroUnidade()" (change)="mudarUnidade($any($event.target).value)">
                  <option value="">Todas</option>
                  @for (u of v.unidades; track u.id) {
                    <option [value]="u.id">{{ u.nome }}</option>
                  }
                </select>
              </label>
              <label class="sp-campo">
                <span>Status</span>
                <select [value]="filtroStatus()" (change)="mudarStatus($any($event.target).value)">
                  <option value="">Todos</option>
                  @for (s of statusOpcoes; track s[0]) {
                    <option [value]="s[0]">{{ s[1] }}</option>
                  }
                </select>
              </label>
            </div>
          </div>

          <div class="tabela-caixa">
            @if (carregandoReservas()) {
              <p class="vazio">Carregando reservas…</p>
            } @else if (reservasFiltradas().length === 0) {
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
                    @for (r of reservasFiltradas(); track r.id) {
                      <tr>
                        <td class="sp-mono forte" [attr.title]="r.id">{{ codigoCurto(r.id) }}</td>
                        <td class="email">{{ r.userEmail || '—' }}</td>
                        <td>{{ nomes().get(r.parkingLotId) ?? r.parkingLotId }}</td>
                        <td class="sp-mono forte">{{ r.spaceLabel }}</td>
                        <td class="sp-mono periodo">{{ periodo(r) }}</td>
                        <td><span [class]="'sp-selo sp-selo--' + r.status.toLowerCase()">{{ rotulo(r.status) }}</span></td>
                        <td class="sp-mono forte num">{{ preco(r.priceEstimateCents) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
          @if (!carregandoReservas() && reservasFiltradas().length > 0) {
            <p class="rodape">{{ reservasFiltradas().length }} reserva(s){{ filtroDia() === 'todas' ? ' · mostrando até as 200 mais recentes' : '' }}</p>
          }
        </section>
      } @else if (carregando()) {
        <p class="vazio">Carregando painel…</p>
      }
    </div>

    <!-- ================= Barra lateral ================= -->
    <aside class="lateral">
      @if (visao(); as v) {
        <h2 class="lateral-titulo">
          Alertas
          @if (v.alertas.length > 0) {
            <span class="badge sp-mono">{{ v.alertas.length }}</span>
          }
        </h2>

        @for (a of v.alertas; track $index) {
          <div [class]="'alerta alerta--' + a.tipo.toLowerCase()">
            <span class="alerta-icone" aria-hidden="true">
              @switch (a.tipo) {
                @case ('DISPOSITIVO') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.3-1.7M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10.7 5.1M12 20h.01"/>
                  </svg>
                }
                @case ('PAGAMENTO') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>
                  </svg>
                }
                @default {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
                  </svg>
                }
              }
            </span>
            <div class="alerta-texto">
              <strong>{{ tipoAlerta(a.tipo) }}</strong>
              <p>{{ a.texto }}</p>
              @if (a.reservaId) {
                <span class="ref sp-mono">{{ codigoCurto(a.reservaId) }}</span>
              }
            </div>
            <span class="alerta-hora sp-mono">{{ a.quando ? horaAlerta(a.quando) : '—' }}</span>
          </div>
        } @empty {
          <p class="vazio">Nenhum alerta no momento.</p>
        }

        <hr class="sp-divisor lateral-divisor" />

        <h2 class="lateral-titulo">Dispositivos</h2>
        @for (d of v.dispositivos; track d.id) {
          <div class="disp">
            <div class="disp-topo">
              <span class="disp-icone" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 26 26" fill="none">
                  <path d="M5 4v18" stroke="#FF6B2C" stroke-width="2.5" stroke-linecap="round"/>
                  <path d="M5 9h17" stroke="#FF6B2C" stroke-width="3"/>
                  <path d="M9 9l-2 3M13 9l-2 3M17 9l-2 3M21 9l-2 3" stroke="#1F2328" stroke-width="1.5"/>
                </svg>
              </span>
              <div class="disp-nome">
                <strong class="sp-mono">{{ d.id }}</strong>
                <span>{{ nomes().get(d.parkingLotId ?? '') ?? d.parkingLotId ?? 'Sem unidade' }}</span>
              </div>
              <span [class]="d.online ? 'estado estado--on' : 'estado estado--off'">{{ d.online ? 'Online' : 'Offline' }}</span>
            </div>
            <div class="disp-sinal">
              <span>Último sinal</span>
              <span [class]="d.online ? 'sp-mono' : 'sp-mono sinal-off'">
                {{ d.lastSeen ? relativo(d.lastSeen) + ' · ' + horaSegIso(d.lastSeen) : 'nunca' }}
              </span>
            </div>
          </div>
        } @empty {
          <p class="vazio">Nenhum dispositivo cadastrado.</p>
        }
      }
    </aside>
  `,
  styles: [`
    :host {
      flex: 1 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) 320px;
    }

    /* ---------- Principal ---------- */
    .principal { display: flex; flex-direction: column; gap: 28px; padding: 32px; min-width: 0; }

    .cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    h1 { margin: 0 0 4px; font-size: 28px; line-height: 36px; font-weight: 700; }
    .sub { margin: 0; font-size: 13px; color: var(--sp-text-muted); }
    h2 { margin: 0; font-size: 20px; line-height: 28px; font-weight: 700; }
    .erro { margin: 0; font-weight: 600; color: var(--sp-danger); }
    .vazio { margin: 0; padding: 12px 0; color: var(--sp-text-muted); }

    /* Indicadores */
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
    .kpi {
      display: flex; flex-direction: column; gap: 6px; padding: 18px;
      background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: var(--sp-radius);
    }
    .kpi-topo { display: flex; justify-content: space-between; align-items: center; }
    .ponto { width: 8px; height: 8px; border-radius: 2px; }
    .ponto--laranja { background: var(--sp-primary); }
    .ponto--ambar { background: var(--sp-poucas); }
    .ponto--verde { background: var(--sp-livre); }
    .ponto--vermelho { background: var(--sp-lotado); }
    .kpi strong { font-size: 30px; line-height: 40px; font-weight: 700; letter-spacing: -0.01em; }
    .kpi-det {
      padding-top: 10px; border-top: 1px dashed var(--sp-border-forte);
      font-size: 12px; color: var(--sp-text-muted);
    }
    .kpi-det--erro { color: var(--sp-danger); font-weight: 600; }

    /* Ocupação por unidade */
    .secao-topo { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
    .legenda { display: flex; gap: 16px; font-size: 12px; color: var(--sp-text-muted); }
    .legenda span { display: flex; align-items: center; gap: 6px; }

    .unidades { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .unidade {
      display: flex; flex-direction: column; gap: 14px; padding: 16px;
      background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: var(--sp-radius);
    }
    .unidade-topo { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .unidade h3 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
    .pct { font-weight: 700; font-size: 14px; }
    .pct--ok { color: var(--sp-success); }
    .pct--alto { color: var(--sp-warning); }
    .pct--cheio { color: var(--sp-danger); }

    .patio {
      display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 14px 10px;
      background: var(--sp-bg); border-radius: var(--sp-radius);
    }
    .fila { display: flex; }
    .corredor {
      align-self: stretch; height: 2px; margin: 8px 0;
      background: repeating-linear-gradient(90deg, var(--sp-poucas) 0 8px, transparent 8px 13px);
    }
    .cel {
      display: inline-block; width: 16px; height: 20px; margin-left: -1px;
      border: 1px solid var(--sp-navy); background: var(--sp-surface);
    }
    .fila .cel:first-child { margin-left: 0; }
    .cel--reservada { background: var(--sp-reservada); }
    .cel--ocupada { background: var(--sp-navy); }
    .legenda .cel { width: 10px; height: 14px; margin: 0; }

    .contagem { margin: 0; font-size: 12px; color: var(--sp-text-muted); }
    .contagem b { margin-left: 8px; color: var(--sp-text); }
    .contagem b:first-child { margin-left: 0; }
    .c-livre { color: var(--sp-success) !important; }
    .c-reservada { color: var(--sp-warning) !important; }

    /* Tabela */
    .secao-topo--tabela { align-items: flex-end; }
    .filtros { display: flex; gap: 10px; flex-wrap: wrap; }
    .filtros .sp-campo { width: 168px; }
    .filtros select { height: 40px; }

    .tabela-caixa { background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: var(--sp-radius); }
    .tabela-caixa > .vazio { padding: 20px; }
    .tabela-rolagem { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th {
      padding: 12px 14px; text-align: left; white-space: nowrap;
      font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
      color: var(--sp-text-muted); border-bottom: 1px solid var(--sp-border);
    }
    td { padding: 12px 14px; border-bottom: 1px dashed var(--sp-border); vertical-align: middle; }
    tbody tr:last-child td { border-bottom: 0; }
    tbody tr:hover { background: var(--sp-bg); }
    .forte { font-weight: 700; }
    .email { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .periodo { white-space: nowrap; }
    .num { text-align: right; white-space: nowrap; }
    .rodape { margin: 10px 0 0; font-size: 12px; color: var(--sp-text-muted); }

    /* ---------- Barra lateral ---------- */
    .lateral {
      display: flex; flex-direction: column; gap: 12px; padding: 32px 20px;
      background: var(--sp-surface); border-left: 1px solid var(--sp-border);
    }
    .lateral-titulo { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .badge {
      padding: 0 6px; border-radius: 3px; font-size: 11px; line-height: 18px; font-weight: 700;
      color: #FFFFFF; background: var(--sp-danger);
    }
    .lateral-divisor { margin: 12px 0; border-top-width: 2px; }

    .alerta {
      display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; padding: 12px;
      background: var(--sp-surface); border: 1px solid var(--sp-border);
      border-left: 4px solid var(--sp-poucas); border-radius: var(--sp-radius);
    }
    .alerta--dispositivo { border-left-color: var(--sp-lotado); }
    .alerta--pagamento { border-left-color: var(--sp-primary); }
    .alerta-icone {
      display: grid; place-items: center; width: 32px; height: 32px; border-radius: 4px;
      background: var(--sp-warning-bg); color: var(--sp-warning);
    }
    .alerta--dispositivo .alerta-icone { background: var(--sp-danger-bg); color: var(--sp-danger); }
    .alerta--pagamento .alerta-icone { background: var(--sp-primary-bg); color: var(--sp-primary-text); }
    .alerta-icone svg { width: 16px; height: 16px; }
    .alerta-texto strong { display: block; font-size: 13px; }
    .alerta-texto p { margin: 2px 0 0; font-size: 12px; line-height: 16px; color: var(--sp-text-muted); }
    .ref { display: inline-block; margin-top: 4px; font-size: 11px; font-weight: 700; }
    .alerta-hora { font-size: 12px; font-weight: 700; }

    .disp {
      display: flex; flex-direction: column; gap: 12px; padding: 14px;
      border: 1px solid var(--sp-border); border-radius: var(--sp-radius);
    }
    .disp-topo { display: flex; align-items: center; gap: 10px; }
    .disp-icone {
      display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0;
      border-radius: var(--sp-radius); background: var(--sp-navy);
    }
    .disp-nome { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .disp-nome strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; }
    .disp-nome span { font-size: 12px; color: var(--sp-text-muted); }
    .estado {
      display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 4px;
      font-size: 12px; font-weight: 600;
    }
    .estado::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .estado--on { background: var(--sp-success-bg); color: var(--sp-success); }
    .estado--off { background: var(--sp-danger-bg); color: var(--sp-danger); }
    .disp-sinal {
      display: flex; justify-content: space-between; gap: 8px; padding-top: 10px;
      border-top: 1px dashed var(--sp-border-forte); font-size: 12px; color: var(--sp-text-muted);
    }
    .disp-sinal .sp-mono { color: var(--sp-text); font-weight: 700; }
    .disp-sinal .sinal-off { color: var(--sp-danger); }

    @media (max-width: 1180px) {
      .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 980px) {
      :host { grid-template-columns: 1fr; }
      .lateral { border-left: 0; border-top: 1px solid var(--sp-border); }
    }
    @media (max-width: 560px) {
      .principal { padding: 20px 16px; }
      .kpis { grid-template-columns: 1fr; }
      .filtros .sp-campo { width: 100%; }
    }
  `],
})
export class PainelAdmin implements OnInit, OnDestroy {
  private readonly api = inject(AdminService);
  private timer?: ReturnType<typeof setInterval>;

  readonly statusOpcoes = Object.entries(ROTULOS);

  readonly visao = signal<AdminOverview | null>(null);
  readonly reservas = signal<AdminReservation[]>([]);
  readonly filtroDia = signal<FiltroDia>('hoje');
  readonly filtroUnidade = signal('');
  readonly filtroStatus = signal('');
  readonly carregando = signal(true);
  readonly carregandoReservas = signal(false);
  readonly erro = signal('');
  readonly atualizadoEm = signal<Date | null>(null);

  readonly nomes = computed(
    () => new Map((this.visao()?.unidades ?? []).map((u) => [u.id, u.nome] as const)),
  );

  /** Aplica o filtro "Hoje": só reservas com chegada prevista para hoje. */
  readonly reservasFiltradas = computed(() => {
    const lista = this.reservas();
    if (this.filtroDia() === 'todas') return lista;
    const hoje = diaLocal(new Date());
    return lista.filter((r) => diaLocal(new Date(r.arrivalExpected)) === hoje);
  });

  readonly hojeTexto = computed(() => {
    this.atualizadoEm(); // recalcula a cada atualização (virada do dia)
    return diaLocal(new Date());
  });

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

  /** Divide as vagas da unidade em fileiras para o mini-estacionamento. */
  linhas(u: Unidade): VagaStatus[][] {
    const filas: VagaStatus[][] = [];
    for (let i = 0; i < u.vagas.length; i += VAGAS_POR_FILEIRA) {
      filas.push(u.vagas.slice(i, i + VAGAS_POR_FILEIRA));
    }
    return filas;
  }

  percentual(u: Unidade): number {
    return u.totalVagas === 0 ? 0 : Math.round(((u.ocupadas + u.reservadas) * 100) / u.totalVagas);
  }

  nivel(pct: number): string {
    if (pct >= 100) return 'cheio';
    if (pct >= 80) return 'alto';
    return 'ok';
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

  horaSeg(d: Date): string {
    return d.toLocaleTimeString('pt-BR', { timeZone: ZONA });
  }

  horaSegIso(iso: string): string {
    return this.horaSeg(new Date(iso));
  }

  /** "14:32" se for hoje; "05/11 14:32" se for outro dia. */
  horaAlerta(iso: string): string {
    const d = new Date(iso);
    const hora = d.toLocaleTimeString('pt-BR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
    if (diaLocal(d) === diaLocal(new Date())) return hora;
    const dia = d.toLocaleDateString('pt-BR', { timeZone: ZONA, day: '2-digit', month: '2-digit' });
    return `${dia} ${hora}`;
  }

  /** "há 8 s", "há 12 min", "há 3 h" ou a data. */
  relativo(iso: string): string {
    const segundos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (segundos < 60) return `há ${segundos} s`;
    if (segundos < 3600) return `há ${Math.floor(segundos / 60)} min`;
    if (segundos < 86_400) return `há ${Math.floor(segundos / 3600)} h`;
    return new Date(iso).toLocaleDateString('pt-BR', { timeZone: ZONA, day: '2-digit', month: '2-digit' });
  }

  periodo(r: AdminReservation): string {
    const dia = (iso: string) =>
      new Date(iso).toLocaleDateString('pt-BR', { timeZone: ZONA, day: '2-digit', month: '2-digit' });
    const hora = (iso: string) =>
      new Date(iso).toLocaleTimeString('pt-BR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
    const d1 = dia(r.arrivalExpected);
    const d2 = dia(r.departureExpected);
    const intervalo = `${hora(r.arrivalExpected)}–${hora(r.departureExpected)}`;
    if (this.filtroDia() === 'hoje' && d1 === d2) return intervalo;
    return d1 === d2 ? `${d1} · ${intervalo}` : `${d1} ${hora(r.arrivalExpected)} – ${d2} ${hora(r.departureExpected)}`;
  }
}
