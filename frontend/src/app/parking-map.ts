import {
  AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal,
} from '@angular/core';
import { Router } from '@angular/router';
import * as L from 'leaflet';
import { ApiError, ParkingLot, ParkingLotService, SpacesResult } from './parking-lot.service';

type Etapa = 'periodo' | 'vagas';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** "R$ 8" ou "R$ 12,50", usado nos marcadores. */
function precoCurto(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Converte Date para o formato do <input type="datetime-local">, em hora local. */
function paraInputLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

@Component({
  selector: 'app-parking-map',
  template: `
    <div class="layout">
      <aside class="lista">
        <h1>Estacionamentos</h1>

        <label class="campo">
          <span>Buscar por nome ou endereço</span>
          <input type="search" [value]="busca()" (input)="busca.set($any($event.target).value)" />
        </label>

        @if (erroLista()) {
          <p class="msg">{{ erroLista() }}</p>
        }

        @for (lot of lotsFiltrados(); track lot.id) {
          <button
            type="button"
            class="cartao"
            [class.selecionado]="lot.id === selectedId()"
            [class.lotado]="lot.freeSpaces === 0"
            (click)="selecionar(lot.id)"
          >
            <span class="cartao-topo">
              <strong>{{ lot.name }}</strong>
              <span class="tarifa">{{ preco(lot.hourlyRateCents) }}/h</span>
            </span>
            <span class="endereco">{{ lot.address }}</span>
            @if (lot.id === selectedId() && consulta() && livresNoPeriodo() === 0) {
              <span class="vagas esgotado">Lotado no período escolhido</span>
            } @else if (lot.freeSpaces > 0) {
              <span class="barra">
                <span [style.width.%]="ocupacao(lot)" [class.alta]="ocupacao(lot) >= 85"></span>
              </span>
              <span class="vagas" [class.poucas]="ocupacao(lot) >= 85">
                {{ lot.freeSpaces }} de {{ lot.totalSpaces }} vagas livres{{ ocupacao(lot) >= 85 ? ' · poucas vagas' : '' }}
              </span>
            } @else {
              <span class="vagas esgotado">Lotado agora</span>
            }
          </button>
        } @empty {
          @if (!erroLista()) {
            <p class="vazio">Nenhum estacionamento encontrado.</p>
          }
        }
      </aside>

      <section class="mapa-area">
        <div #mapEl class="mapa"></div>

        @if (selecionado(); as lot) {
          <div class="painel" role="dialog" aria-label="Reserva no estacionamento selecionado">
            @if (etapa() === 'periodo') {
              <p class="rotulo">Local selecionado</p>
              <h2>{{ lot.name }}</h2>
              <p class="sub">Aberto {{ lot.openTime }}–{{ lot.closeTime }} · {{ lot.freeSpaces }} vagas livres agora</p>

              <label class="campo">
                <span>Chegada prevista</span>
                <input type="datetime-local" [value]="chegada()" (change)="mudarChegada($any($event.target).value)" />
              </label>
              <label class="campo">
                <span>Saída prevista</span>
                <input type="datetime-local" [value]="saida()" (change)="mudarSaida($any($event.target).value)" />
              </label>

              @if (consulta(); as c) {
                <div class="estimativa">
                  <span>Estimativa · {{ horasCobradas() }} h × {{ preco(lot.hourlyRateCents) }}</span>
                  <strong>{{ preco(c.priceEstimateCents) }}</strong>
                </div>
                <p class="nota" [class.erro]="livresNoPeriodo() === 0">
                  @if (livresNoPeriodo() === 0) {
                    Lotado no período escolhido.
                  } @else {
                    {{ livresNoPeriodo() }} vagas livres nesse período.
                  }
                  Valor calculado pelo servidor.
                </p>
              }

              @if (mensagem()) {
                <p class="msg">{{ mensagem() }}</p>
              }

              <button
                type="button"
                class="primario"
                [disabled]="!consulta() || livresNoPeriodo() === 0"
                (click)="abrirVagas()"
              >
                Escolher vaga
              </button>
              <button type="button" class="link" (click)="fechar()">Fechar</button>
            } @else {
              <button type="button" class="voltar" (click)="voltarAoPeriodo()">← Voltar</button>
              <p class="rotulo">Escolha sua vaga</p>
              <h2>{{ lot.name }}</h2>
              <p class="sub">{{ periodoTexto() }}</p>

              <div class="grade" role="listbox" aria-label="Vagas do estacionamento">
                @for (v of consulta()?.spaces ?? []; track v.id) {
                  <button
                    type="button"
                    class="vaga"
                    role="option"
                    [attr.aria-selected]="v.id === vagaId()"
                    [class.escolhida]="v.id === vagaId()"
                    [disabled]="!v.available"
                    (click)="vagaId.set(v.id)"
                  >
                    {{ v.label }}
                  </button>
                }
              </div>

              <div class="legenda">
                <span><i class="livre"></i>Livre</span>
                <span><i class="indisp"></i>Indisponível</span>
                <span><i class="sel"></i>Selecionada</span>
              </div>

              @if (consulta(); as c) {
                <div class="estimativa">
                  @if (vagaEscolhida(); as v) {
                    <span>Vaga {{ v.label }} · {{ horasCobradas() }} h</span>
                  } @else {
                    <span>Escolha uma vaga livre</span>
                  }
                  <strong>{{ preco(c.priceEstimateCents) }}</strong>
                </div>
              }

              @if (mensagem()) {
                <p class="msg">{{ mensagem() }}</p>
              }

              <button
                type="button"
                class="primario"
                [disabled]="!vagaId() || carregando()"
                (click)="reservar()"
              >
                {{ carregando() ? 'Reservando…' : 'Confirmar e reservar' }}
              </button>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    .layout { flex: 1; min-height: 0; display: grid; grid-template-columns: 340px 1fr; }

    .lista {
      padding: 24px 20px; overflow-y: auto;
      background: var(--sp-surface); border-right: 1px solid var(--sp-border);
    }
    .lista h1 { margin: 0 0 18px; font-size: 22px; font-weight: 800; }

    .campo { display: block; margin-bottom: 14px; }
    .campo span { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 700; color: var(--sp-text-muted); }
    .campo input {
      width: 100%; padding: 11px 12px; font-size: 15px; color: var(--sp-text);
      background: #fff; border: 1px solid #b9c3cf; border-radius: var(--sp-radius-sm);
    }
    .campo input:focus { outline: 2px solid var(--sp-primary); outline-offset: 1px; border-color: var(--sp-primary); }

    .cartao {
      display: flex; flex-direction: column; gap: 6px; width: 100%; margin-bottom: 14px;
      padding: 16px 18px; text-align: left; color: var(--sp-text); cursor: pointer;
      background: #fff; border: 1px solid var(--sp-border); border-radius: var(--sp-radius);
    }
    .cartao:hover { border-color: #9fb0c3; }
    .cartao.selecionado { border: 2px solid var(--sp-primary); padding: 15px 17px; }
    .cartao.lotado { background: var(--sp-surface-alt); }
    .cartao-topo { display: flex; justify-content: space-between; gap: 8px; font-size: 16px; }
    .tarifa { color: var(--sp-primary); font-weight: 800; white-space: nowrap; }
    .cartao.lotado .tarifa { color: var(--sp-text-muted); }
    .endereco { font-size: 13px; color: var(--sp-text-muted); }
    .barra { display: block; height: 6px; margin-top: 4px; background: #e3e8ee; border-radius: 3px; overflow: hidden; }
    .barra span { display: block; height: 100%; background: var(--sp-success); }
    .barra span.alta { background: #c27c0e; }
    .vagas { font-size: 13px; font-weight: 700; color: var(--sp-success); }
    .vagas.poucas { color: #9a5b00; }
    .vagas.esgotado { color: var(--sp-text-muted); }
    .vazio { color: var(--sp-text-muted); font-size: 14px; }

    .mapa-area { position: relative; min-height: 0; }
    .mapa { position: absolute; inset: 0; }

    .painel {
      position: absolute; top: 24px; right: 24px; z-index: 1000;
      width: 320px; max-height: calc(100% - 48px); overflow-y: auto; padding: 20px;
      background: #fff; border-radius: 16px; box-shadow: 0 12px 32px rgba(16, 35, 63, .18);
    }
    .rotulo {
      margin: 0 0 4px; font-size: 12px; font-weight: 800; letter-spacing: .06em;
      text-transform: uppercase; color: var(--sp-primary);
    }
    .painel h2 { margin: 0 0 6px; font-size: 21px; font-weight: 800; }
    .sub { margin: 0 0 16px; font-size: 13px; color: var(--sp-text-muted); }
    .painel .campo span { color: var(--sp-text); }

    .estimativa {
      display: flex; justify-content: space-between; align-items: center; gap: 8px;
      margin: 4px 0 10px; padding: 14px; font-size: 13px;
      background: var(--sp-warning-bg); border-radius: var(--sp-radius-sm);
    }
    .estimativa strong { font-size: 20px; font-weight: 800; white-space: nowrap; }
    .nota { margin: 0 0 14px; font-size: 12px; color: var(--sp-text-muted); }
    .nota.erro { color: var(--sp-danger); font-weight: 700; }
    .msg { margin: 0 0 12px; font-size: 13px; font-weight: 600; color: var(--sp-danger); }

    .primario {
      width: 100%; padding: 13px; border: 0; border-radius: var(--sp-radius-sm);
      background: var(--sp-primary); color: #fff; font-size: 16px; font-weight: 800; cursor: pointer;
    }
    .primario:hover:not(:disabled) { background: var(--sp-primary-hover); }
    .primario:disabled { background: #9db3c6; cursor: not-allowed; }
    .link, .voltar { background: none; border: 0; color: var(--sp-primary); font-weight: 700; cursor: pointer; }
    .link { display: block; margin: 10px auto 0; }
    .voltar { padding: 0 0 10px; }

    .grade {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
      max-height: 220px; overflow-y: auto; margin-bottom: 12px; padding: 2px;
    }
    .vaga {
      padding: 10px 0; font-weight: 800; cursor: pointer; color: var(--sp-primary);
      background: #fff; border: 1.5px solid var(--sp-primary); border-radius: var(--sp-radius-sm);
    }
    .vaga:hover:not(:disabled) { background: #e8f1f8; }
    .vaga.escolhida { background: var(--sp-primary); color: #fff; }
    .vaga:disabled {
      color: #9aa6b4; background: #eef1f4; border-color: var(--sp-border);
      text-decoration: line-through; cursor: not-allowed;
    }
    .legenda { display: flex; gap: 14px; margin-bottom: 14px; font-size: 12px; color: var(--sp-text-muted); }
    .legenda span { display: flex; align-items: center; gap: 6px; }
    .legenda i { width: 12px; height: 12px; border-radius: 3px; border: 1.5px solid var(--sp-primary); }
    .legenda .indisp { border-color: var(--sp-border); background: #eef1f4; }
    .legenda .sel { background: var(--sp-primary); }

    @media (max-width: 860px) {
      .layout { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
      .lista { max-height: 40vh; border-right: 0; border-bottom: 1px solid var(--sp-border); }
      .mapa-area { min-height: 480px; }
      .painel { top: 12px; left: 12px; right: 12px; width: auto; }
    }
  `],
})
export class ParkingMap implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  private readonly service = inject(ParkingLotService);
  private readonly router = inject(Router);
  private map?: L.Map;
  private readonly markers = new Map<string, L.Marker>();
  private consultaSeq = 0;

  readonly lots = signal<ParkingLot[]>([]);
  readonly busca = signal('');
  readonly selectedId = signal('');
  readonly etapa = signal<Etapa>('periodo');
  readonly chegada = signal('');
  readonly saida = signal('');
  readonly consulta = signal<SpacesResult | null>(null);
  readonly vagaId = signal('');
  readonly mensagem = signal('');
  readonly erroLista = signal('');
  readonly carregando = signal(false);

  readonly selecionado = computed(
    () => this.lots().find((l) => l.id === this.selectedId()) ?? null,
  );
  readonly lotsFiltrados = computed(() => {
    const q = this.busca().trim().toLowerCase();
    if (!q) return this.lots();
    return this.lots().filter(
      (l) => l.name.toLowerCase().includes(q) || l.address.toLowerCase().includes(q),
    );
  });
  readonly livresNoPeriodo = computed(
    () => this.consulta()?.spaces.filter((s) => s.available).length ?? 0,
  );
  readonly vagaEscolhida = computed(
    () => this.consulta()?.spaces.find((s) => s.id === this.vagaId()) ?? null,
  );
  readonly horasCobradas = computed(() => {
    const c = this.consulta();
    const lot = this.selecionado();
    return c && lot && lot.hourlyRateCents > 0
      ? Math.round(c.priceEstimateCents / lot.hourlyRateCents)
      : 0;
  });
  readonly periodoTexto = computed(() => {
    const c = this.chegada();
    const s = this.saida();
    if (!c || !s) return '';
    const partes = (v: string) => {
      const [data, hora] = v.split('T');
      const [ano, mes, dia] = data.split('-');
      return { data: `${dia}/${mes}/${ano}`, hora };
    };
    const a = partes(c);
    const b = partes(s);
    return a.data === b.data
      ? `${a.data} · ${a.hora} às ${b.hora}`
      : `${a.data} ${a.hora} até ${b.data} ${b.hora}`;
  });

  constructor() {
    // Sugere a próxima hora cheia, com 2 horas de permanência
    const inicio = new Date();
    inicio.setMinutes(0, 0, 0);
    inicio.setHours(inicio.getHours() + 1);
    const fim = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);
    this.chegada.set(paraInputLocal(inicio));
    this.saida.set(paraInputLocal(fim));
  }

  async ngAfterViewInit() {
    this.map = L.map(this.mapEl.nativeElement).setView([-12.2664, -38.9663], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    await this.carregar();
  }

  ngOnDestroy() {
    this.map?.remove();
  }

  preco(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  ocupacao(lot: ParkingLot): number {
    if (!lot.totalSpaces) return 100;
    return Math.round(((lot.totalSpaces - lot.freeSpaces) * 100) / lot.totalSpaces);
  }

  async selecionar(id: string) {
    this.selectedId.set(id);
    this.etapa.set('periodo');
    this.atualizarMarcadores();
    const lot = this.selecionado();
    if (lot && this.map) {
      this.map.flyTo([lot.latitude, lot.longitude], 16, { duration: 0.6 });
    }
    await this.consultar();
  }

  fechar() {
    this.selectedId.set('');
    this.consulta.set(null);
    this.etapa.set('periodo');
    this.mensagem.set('');
    this.atualizarMarcadores();
  }

  async mudarChegada(valor: string) {
    this.chegada.set(valor);
    await this.consultar();
  }

  async mudarSaida(valor: string) {
    this.saida.set(valor);
    await this.consultar();
  }

  abrirVagas() {
    this.mensagem.set('');
    this.etapa.set('vagas');
  }

  voltarAoPeriodo() {
    this.mensagem.set('');
    this.etapa.set('periodo');
  }

  async reservar() {
    const lot = this.selecionado();
    const vaga = this.vagaId();
    if (!lot || !vaga) return;

    this.carregando.set(true);
    this.mensagem.set('');
    try {
      const r = await this.service.createReservation(
        lot.id,
        new Date(this.chegada()).toISOString(),
        new Date(this.saida()).toISOString(),
        vaga,
      );
      await this.router.navigate(['/reservas', r.id]);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // alguém pegou a vaga antes: atualiza a grade e pede outra
        await this.consultar();
        this.etapa.set('vagas');
        this.mensagem.set(e.message);
      } else {
        this.mensagem.set(this.erroTexto(e, 'Não foi possível criar a reserva.'));
      }
    } finally {
      this.carregando.set(false);
    }
  }

  private async carregar() {
    try {
      const lots = await this.service.list();
      this.lots.set(lots);
      this.erroLista.set('');
      this.desenharMarcadores();
      if (lots.length > 0 && this.map) {
        const pontos = lots.map((l) => [l.latitude, l.longitude] as L.LatLngTuple);
        this.map.fitBounds(L.latLngBounds(pontos), { padding: [80, 80] });
      }
    } catch (e) {
      this.erroLista.set(this.erroTexto(e, 'Não foi possível carregar os estacionamentos.'));
    }
  }

  private async consultar() {
    const lot = this.selecionado();
    const c = this.chegada();
    const s = this.saida();
    this.consulta.set(null);
    this.vagaId.set('');
    this.mensagem.set('');
    if (!lot || !c || !s) return;

    const foraDoHorario = this.foraDoHorario(lot, c, s);
    if (foraDoHorario) {
      this.mensagem.set(foraDoHorario);
      return;
    }

    const seq = ++this.consultaSeq;
    try {
      const r = await this.service.spaces(lot.id, new Date(c).toISOString(), new Date(s).toISOString());
      if (seq === this.consultaSeq) this.consulta.set(r);
    } catch (e) {
      if (seq === this.consultaSeq) {
        this.mensagem.set(this.erroTexto(e, 'Não foi possível consultar as vagas.'));
      }
    }
  }

  /** Aviso rápido no navegador; o backend valida de novo ao criar a reserva. */
  private foraDoHorario(lot: ParkingLot, chegada: string, saida: string): string | null {
    if (!lot.openTime || !lot.closeTime) return null;
    const [diaC, horaC] = chegada.split('T');
    const [diaS, horaS] = saida.split('T');
    if (diaC !== diaS || horaC < lot.openTime || horaS > lot.closeTime) {
      return `Este local funciona das ${lot.openTime} às ${lot.closeTime}. Escolha chegada e saída nesse horário, no mesmo dia.`;
    }
    return null;
  }

  private desenharMarcadores() {
    const map = this.map;
    if (!map) return;
    this.markers.forEach((m) => m.remove());
    this.markers.clear();
    for (const lot of this.lots()) {
      const marker = L.marker([lot.latitude, lot.longitude], {
        icon: this.icone(lot),
        title: lot.name,
        keyboard: true,
      })
        .addTo(map)
        .on('click', () => this.selecionar(lot.id));
      this.markers.set(lot.id, marker);
    }
  }

  private atualizarMarcadores() {
    for (const lot of this.lots()) {
      const marker = this.markers.get(lot.id);
      marker?.setIcon(this.icone(lot));
      marker?.setZIndexOffset(lot.id === this.selectedId() ? 1000 : 0);
    }
  }

  private icone(lot: ParkingLot): L.DivIcon {
    const lotado = lot.freeSpaces === 0;
    const classes = [
      'sp-pill',
      lot.id === this.selectedId() ? 'sp-pill--ativa' : '',
      lotado ? 'sp-pill--lotado' : '',
    ].join(' ');
    const texto = lotado
      ? 'Lotado'
      : `${precoCurto(lot.hourlyRateCents)}/h · ${lot.freeSpaces} vagas`;
    return L.divIcon({
      className: 'sp-pin',
      html: `<span class="${classes}">${escapeHtml(texto)}</span>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  }

  private erroTexto(e: unknown, padrao: string): string {
    return e instanceof Error && e.message ? e.message : padrao;
  }
}
