import {
  AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal,
} from '@angular/core';
import { Router } from '@angular/router';
import * as L from 'leaflet';
import { AuthService } from './auth.service';
import { ApiError, ParkingLot, ParkingLotService, SpaceOption, SpacesResult } from './parking-lot.service';

type Etapa = 'periodo' | 'vagas';
type EstadoLote = 'normal' | 'poucas' | 'lotado';

const MAX_BLOCOS = 12;
const VAGAS_POR_LINHA = 6;
const LIMITE_POUCAS = 0.15;
const LARGURA_MOBILE = '(max-width: 760px)';

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
    <div class="layout" [class.com-painel]="!!selecionado()" [class.lista-fechada]="!listaAberta()">
      <!-- ================= Lista ================= -->
      <aside class="lista" aria-label="Lista de estacionamentos">
        <span class="alca" aria-hidden="true"></span>

        <div class="lista-topo">
          <h1>Estacionamentos</h1>
          <span class="contador sp-mono">{{ lots().length }} {{ lots().length === 1 ? 'unidade' : 'unidades' }}</span>
          <button type="button" class="sp-btn sp-btn--link recolher" (click)="listaAberta.set(false)">
            Recolher
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
        </div>

        <label class="sp-campo busca so-desktop">
          <span class="visualmente-oculto">Buscar estacionamento</span>
          <span class="sp-campo-caixa">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
            </svg>
            <input type="search" placeholder="Buscar por nome ou endereço"
                   [value]="busca()" (input)="busca.set($any($event.target).value)" />
          </span>
        </label>

        <div class="periodo-barra">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>
          </svg>
          <span>{{ periodoBarra() }}</span>
          <button type="button" class="sp-btn sp-btn--link" (click)="alterarPeriodo()">Alterar</button>
        </div>

        @if (erroLista()) {
          <p class="alerta" role="alert">{{ erroLista() }}</p>
        }

        @for (lot of lotsFiltrados(); track lot.id) {
          @let livres = livresDoLote(lot);
          @let est = estado(lot);
          <button
            type="button"
            class="cartao"
            [class.selecionado]="lot.id === selectedId()"
            [class.lotado]="est === 'lotado'"
            (click)="selecionar(lot.id)"
          >
            <span class="cartao-topo">
              <span class="cartao-nome">{{ lot.name }}</span>
              <span class="tarifa sp-mono">{{ preco(lot.hourlyRateCents) }}/h</span>
            </span>
            <span class="endereco">{{ lot.address }}</span>
            <span class="cartao-divisor"></span>
            <span class="blocos" aria-hidden="true">
              @for (b of blocos(lot); track $index) {
                <i [class]="'bloco bloco--' + b"></i>
              }
            </span>
            @switch (est) {
              @case ('lotado') {
                <span class="status status--lotado">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                    <path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17v.5"/>
                  </svg>
                  Lotado no período escolhido
                </span>
              }
              @case ('poucas') {
                <span class="status status--poucas">
                  {{ livres }} de {{ lot.totalSpaces }} vagas livres
                  <span class="tag">Poucas vagas</span>
                </span>
              }
              @default {
                <span class="status">{{ livres }} de {{ lot.totalSpaces }} vagas livres</span>
              }
            }
          </button>
        } @empty {
          @if (!erroLista()) {
            <p class="vazio">Nenhum estacionamento encontrado.</p>
          }
        }
      </aside>

      <!-- ================= Mapa ================= -->
      <section class="mapa-area">
        <div #mapEl class="mapa"></div>

        <!-- Topo flutuante (só no celular) -->
        <div class="topo-mobile">
          <label class="sp-campo">
            <span class="visualmente-oculto">Buscar estacionamento</span>
            <span class="sp-campo-caixa">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
              </svg>
              <input type="search" placeholder="Buscar por nome ou endereço"
                     [value]="busca()" (input)="buscarNoMobile($any($event.target).value)" />
            </span>
          </label>
          @if (!listaAberta() && !selecionado()) {
            <button type="button" class="ver-lista" (click)="listaAberta.set(true)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16"/>
              </svg>
              {{ lotsFiltrados().length }} {{ lotsFiltrados().length === 1 ? 'estacionamento' : 'estacionamentos' }} · ver lista
            </button>
          }
        </div>

        <div class="legenda-mapa" aria-hidden="true">
          <span><i class="cor cor--livre"></i>Vagas livres</span>
          <span><i class="cor cor--poucas"></i>Poucas vagas</span>
          <span><i class="cor cor--lotado"></i>Lotado</span>
        </div>

        <button type="button" class="localizar" (click)="localizar()"
                [disabled]="localizando()" aria-label="Centralizar na minha localização">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>
          </svg>
        </button>

        @if (avisoMapa()) {
          <p class="aviso-mapa" role="status">{{ avisoMapa() }}</p>
        }

        @if (selecionado(); as lot) {
          <div class="painel" role="dialog" aria-label="Reserva no estacionamento selecionado">
            <span class="alca" aria-hidden="true"></span>

            @if (etapa() === 'periodo') {
              <!-- ---------- Etapa A: período ---------- -->
              <p class="rotulo-laranja">Local selecionado</p>
              <h2>{{ lot.name }}</h2>
              <p class="sub">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
                </svg>
                Aberto {{ lot.openTime }}–{{ lot.closeTime }} · {{ lot.freeSpaces }} vagas livres agora
              </p>

              <hr class="sp-divisor" />

              <div class="campos">
                <label class="sp-campo">
                  <span>Chegada prevista</span>
                  <span class="sp-campo-caixa">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                      <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>
                    </svg>
                    <input type="datetime-local" [value]="chegada()" (change)="mudarChegada($any($event.target).value)" />
                  </span>
                </label>
                <label class="sp-campo">
                  <span>Saída prevista</span>
                  <span class="sp-campo-caixa">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                      <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>
                    </svg>
                    <input type="datetime-local" [value]="saida()" (change)="mudarSaida($any($event.target).value)" />
                  </span>
                </label>
              </div>

              @if (consulta(); as c) {
                <div class="estimativa">
                  <span class="sp-rotulo">Estimativa</span>
                  <span class="conta sp-mono">{{ horasCobradas() }} h × {{ preco(lot.hourlyRateCents) }} =</span>
                  <strong class="valor sp-mono">{{ preco(c.priceEstimateCents) }}</strong>
                  <span class="servidor">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                      <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>
                    </svg>
                    Valor calculado pelo servidor
                  </span>
                </div>
                @if (livresNoPeriodo() === 0) {
                  <p class="alerta">Lotado no período escolhido. Tente outro horário ou outra unidade.</p>
                }
              }

              @if (mensagem()) {
                <p class="alerta" role="alert">{{ mensagem() }}</p>
              }

              <button type="button" class="sp-btn sp-btn--primario sp-btn--bloco"
                      [disabled]="!consulta() || livresNoPeriodo() === 0" (click)="abrirVagas()">
                Escolher vaga
              </button>
              <button type="button" class="sp-btn sp-btn--link fechar" (click)="fechar()">Fechar</button>
            } @else {
              <!-- ---------- Etapa B: escolha da vaga ---------- -->
              <button type="button" class="sp-btn sp-btn--link voltar" (click)="voltarAoPeriodo()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                  <path d="M19 12H5M11 6l-6 6 6 6"/>
                </svg>
                Voltar
              </button>
              <p class="rotulo-laranja">Escolha sua vaga</p>
              <h2>{{ lot.name }}</h2>
              <p class="sub sp-mono">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>
                </svg>
                {{ periodoTexto() }}
              </p>

              @for (f of fileiras(); track f.letra) {
                <p class="sp-rotulo fileira-rotulo">{{ f.letra ? 'Fileira ' + f.letra : 'Vagas' }}</p>
                <div class="patio">
                  @for (linha of f.linhas; track $index; let i = $index) {
                    @if (i > 0 && i % 2 === 0) {
                      <div class="separador"></div>
                    }
                    <div class="linha" [class.linha--baixo]="i % 2 === 1">
                      @for (v of linha; track v.id) {
                        <button
                          type="button"
                          class="vaga"
                          [class.vaga--indisponivel]="!v.available"
                          [class.vaga--escolhida]="v.id === vagaId()"
                          [disabled]="!v.available"
                          [attr.aria-pressed]="v.id === vagaId()"
                          [attr.aria-label]="'Vaga ' + v.label + (v.available ? (v.id === vagaId() ? ', selecionada' : ', livre') : ', indisponível')"
                          (click)="vagaId.set(v.id)"
                        >
                          <span class="vaga-icone">
                            @if (!v.available) {
                              <svg width="14" height="20" viewBox="0 0 14 20" fill="none" aria-hidden="true">
                                <rect x="1.5" y="1.5" width="11" height="17" rx="4" stroke="currentColor" stroke-width="1.5"/>
                                <path d="M3.5 6.5h7M3.5 13.5h7" stroke="currentColor" stroke-width="1.5"/>
                              </svg>
                            } @else if (v.id === vagaId()) {
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
                                <path d="m5 12 5 5 9-10"/>
                              </svg>
                            }
                          </span>
                          <span class="vaga-rotulo sp-mono">{{ v.label }}</span>
                        </button>
                      }
                    </div>
                    @if (i % 2 === 0 && i + 1 < f.linhas.length) {
                      <div class="corredor"><span>Corredor</span></div>
                    }
                  }
                </div>
              }

              <div class="legenda-vagas" aria-hidden="true">
                <span><i class="lv lv--livre"></i>Livre</span>
                <span><i class="lv lv--indisponivel"></i>Indisponível</span>
                <span><i class="lv lv--escolhida"></i>Selecionada</span>
              </div>

              <hr class="sp-divisor" />

              @if (consulta(); as c) {
                <div class="resumo">
                  @if (vagaEscolhida(); as v) {
                    <span>Vaga {{ v.label }} · {{ horasCobradas() }} h</span>
                  } @else {
                    <span class="muted">Escolha uma vaga livre</span>
                  }
                  <strong class="sp-mono">{{ preco(c.priceEstimateCents) }}</strong>
                </div>
              }

              @if (mensagem()) {
                <p class="alerta" role="alert">{{ mensagem() }}</p>
              }

              <button type="button" class="sp-btn sp-btn--primario sp-btn--bloco"
                      [disabled]="!vagaId() || carregando()" (click)="reservar()">
                {{ carregando() ? 'Reservando…' : (logado() ? 'Confirmar e reservar' : 'Entrar para reservar') }}
              </button>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    .layout { flex: 1; min-height: 0; display: grid; grid-template-columns: 328px 1fr; }

    .visualmente-oculto {
      position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
    }

    /* Peças que só existem no celular */
    .alca, .recolher, .topo-mobile { display: none; }

    /* ---------- Lista ---------- */
    .lista {
      display: flex; flex-direction: column; gap: 12px; padding: 24px 16px; overflow-y: auto;
      background: var(--sp-surface); border-right: 1px solid var(--sp-border);
    }
    .lista-topo { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
    .lista h1 { flex: 1; margin: 0; font-size: 28px; line-height: 36px; font-weight: 700; }
    .contador { font-size: 11px; font-weight: 700; color: var(--sp-text-muted); }

    .periodo-barra {
      display: flex; align-items: center; gap: 8px; padding: 8px 12px;
      background: var(--sp-desabilitado); border-radius: var(--sp-radius);
      font-size: 12px; font-weight: 600;
    }
    .periodo-barra svg { width: 14px; height: 14px; color: var(--sp-text-muted); flex-shrink: 0; }
    .periodo-barra span { flex: 1; }
    .periodo-barra .sp-btn--link { font-size: 12px; padding: 0; }

    .cartao {
      position: relative; display: flex; flex-direction: column; gap: 8px; width: 100%;
      padding: 16px 16px 14px; text-align: left; color: var(--sp-text); cursor: pointer;
      background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: var(--sp-radius);
    }
    .cartao:hover { border-color: var(--sp-border-forte); }
    .cartao.selecionado { border-color: var(--sp-navy); padding-left: 22px; }
    .cartao.selecionado::before {
      content: ''; position: absolute; left: -1px; top: -1px; bottom: -1px; width: 6px;
      background: var(--sp-primary); border-radius: var(--sp-radius) 0 0 var(--sp-radius);
    }
    .cartao.lotado { background: var(--sp-desabilitado); }
    .cartao.lotado .cartao-nome, .cartao.lotado .tarifa { color: var(--sp-text-muted); }

    .cartao-topo { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .cartao-nome { font-family: var(--sp-font-titulo); font-weight: 500; font-size: 17px; line-height: 24px; }
    .tarifa { font-weight: 700; font-size: 15px; color: var(--sp-primary-text); white-space: nowrap; }
    .endereco { font-size: 12px; line-height: 16px; color: var(--sp-text-muted); }
    .cartao-divisor { display: block; border-top: 1px dashed var(--sp-border-forte); margin: 2px 0; }

    .blocos { display: flex; gap: 4px; }
    .bloco { display: block; width: 11px; height: 17px; border-radius: 2px; }
    .bloco--ocupado { background: var(--sp-vaga-linha); }
    .bloco--livre { border: 1.5px solid var(--sp-livre); }
    .bloco--poucas { border: 1.5px solid var(--sp-poucas); }
    .bloco--lotado { background: #E59A9A; }

    .status { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--sp-success); }
    .status--poucas { color: var(--sp-warning); }
    .status--lotado { color: var(--sp-danger); }
    .status svg { width: 14px; height: 14px; }
    .tag {
      padding: 2px 6px; border-radius: 3px; font-size: 10px; letter-spacing: .06em;
      text-transform: uppercase; background: var(--sp-warning-bg);
    }
    .vazio { margin: 8px 0; color: var(--sp-text-muted); }

    /* ---------- Mapa ---------- */
    .mapa-area { position: relative; min-height: 0; }
    .mapa { position: absolute; inset: 0; }

    .legenda-mapa {
      position: absolute; left: 16px; bottom: 44px; z-index: 900;
      display: flex; gap: 16px; padding: 8px 12px; font-size: 12px;
      background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: var(--sp-radius);
      box-shadow: 0 2px 8px rgba(31, 35, 40, .1);
    }
    .legenda-mapa span { display: flex; align-items: center; gap: 6px; }
    .cor { width: 10px; height: 10px; border-radius: 2px; }
    .cor--livre { background: var(--sp-livre); }
    .cor--poucas { background: var(--sp-poucas); }
    .cor--lotado { background: var(--sp-vaga-linha); }

    .localizar {
      position: absolute; right: 10px; bottom: 120px; z-index: 900;
      display: grid; place-items: center; width: 44px; height: 44px; padding: 0; cursor: pointer;
      color: var(--sp-text); background: var(--sp-surface);
      border: 1px solid var(--sp-border); border-radius: var(--sp-radius);
      box-shadow: 0 2px 8px rgba(31, 35, 40, .12);
    }
    .localizar:hover:not(:disabled) { background: var(--sp-bg); }
    .localizar:disabled { color: var(--sp-text-muted); cursor: progress; }

    .aviso-mapa {
      position: absolute; left: 50%; bottom: 96px; z-index: 900; transform: translateX(-50%);
      margin: 0; padding: 8px 14px; font-size: 13px; color: var(--sp-on-dark);
      background: var(--sp-navy); border-radius: var(--sp-radius);
    }

    /* ---------- Painel flutuante ---------- */
    .painel {
      position: absolute; top: 24px; right: 24px; z-index: 1000;
      width: 308px; max-height: calc(100% - 48px); overflow-y: auto; padding: 20px;
      background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: var(--sp-radius);
      box-shadow: 0 12px 32px rgba(31, 35, 40, .16);
    }
    .rotulo-laranja {
      margin: 0 0 4px; font-size: 11px; line-height: 16px; font-weight: 600;
      letter-spacing: .06em; text-transform: uppercase; color: var(--sp-primary-text);
    }
    .painel h2 { margin: 0 0 6px; font-size: 20px; line-height: 28px; font-weight: 700; }
    .sub {
      display: flex; align-items: center; gap: 6px; margin: 0;
      font-size: 12px; line-height: 16px; color: var(--sp-text-muted);
    }
    .sub.sp-mono { color: var(--sp-text); font-size: 12px; font-weight: 500; }
    .sub svg { width: 14px; height: 14px; flex-shrink: 0; }

    .campos { display: flex; flex-direction: column; gap: 14px; margin-bottom: 16px; }

    .estimativa {
      display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; padding: 14px 16px;
      background: var(--sp-bg); border: 1px dashed var(--sp-navy); border-radius: var(--sp-radius);
    }
    .conta { font-size: 13px; color: var(--sp-text-muted); }
    .valor { font-size: 28px; line-height: 36px; letter-spacing: -0.01em; }
    .servidor { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--sp-text-muted); }
    .servidor svg { width: 12px; height: 12px; }

    .alerta {
      margin: 0 0 12px; padding: 10px 12px; font-size: 13px; font-weight: 600;
      color: var(--sp-danger); background: var(--sp-danger-bg);
      border-left: 3px solid var(--sp-lotado); border-radius: 4px;
    }

    .fechar { display: flex; margin: 10px auto 0; }
    .voltar { margin-bottom: 12px; }

    /* ---------- Pátio de vagas ---------- */
    .fileira-rotulo { margin: 16px 0 8px; }
    .patio {
      display: flex; flex-direction: column; align-items: center; padding: 12px 8px;
      background: var(--sp-bg); border: 1px solid var(--sp-border); border-radius: var(--sp-radius);
    }
    .linha { display: flex; }
    .separador { height: 14px; }
    .corredor {
      position: relative; align-self: stretch; height: 28px; display: grid; place-items: center;
    }
    .corredor::before {
      content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 2px;
      background: repeating-linear-gradient(90deg, var(--sp-poucas) 0 10px, transparent 10px 16px);
    }
    .corredor span {
      position: relative; padding: 0 8px; background: var(--sp-bg);
      font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
      color: var(--sp-text-muted);
    }

    .vaga {
      display: flex; flex-direction: column; align-items: center; justify-content: space-between;
      width: 44px; height: 66px; margin-left: -2px; padding: 8px 0 6px; cursor: pointer;
      background: transparent; color: var(--sp-text);
      border: 2px solid var(--sp-vaga-linha); border-bottom: 0;
    }
    .linha .vaga:first-child { margin-left: 0; }
    .linha--baixo .vaga { flex-direction: column-reverse; border-bottom: 2px solid var(--sp-vaga-linha); border-top: 0; padding: 6px 0 8px; }
    .vaga:hover:not(:disabled) { background: var(--sp-primary-bg); }
    .vaga-icone { display: grid; place-items: center; height: 20px; }
    .vaga-rotulo { font-size: 11px; font-weight: 700; line-height: 16px; }

    .vaga--indisponivel {
      cursor: not-allowed; color: var(--sp-text-muted);
      background: repeating-linear-gradient(135deg, var(--sp-vaga-indisponivel) 0 6px, #D9D4CB 6px 8px);
    }
    .vaga--escolhida {
      position: relative; z-index: 1; background: var(--sp-primary); color: var(--sp-navy);
      border-color: var(--sp-primary-hover);
    }
    .vaga--escolhida:hover:not(:disabled) { background: var(--sp-primary); }

    .legenda-vagas { display: flex; gap: 14px; margin-top: 12px; font-size: 12px; color: var(--sp-text-muted); }
    .legenda-vagas span { display: flex; align-items: center; gap: 6px; }
    .lv { width: 12px; height: 16px; border: 2px solid var(--sp-vaga-linha); border-bottom: 0; }
    .lv--indisponivel { background: repeating-linear-gradient(135deg, var(--sp-vaga-indisponivel) 0 3px, #D9D4CB 3px 4px); }
    .lv--escolhida { background: var(--sp-primary); border-color: var(--sp-primary-hover); }

    .resumo {
      display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 14px;
      font-weight: 600;
    }
    .resumo strong { font-size: 18px; }
    .resumo .muted { color: var(--sp-text-muted); font-weight: 500; }

    /* =========================================================
       Celular: mapa em tela cheia e folhas inferiores
       ========================================================= */
    @media (max-width: 760px) {
      .layout { display: block; position: relative; }
      .mapa-area { position: absolute; inset: 0; }
      .so-desktop, .legenda-mapa { display: none; }

      .alca {
        display: block; flex-shrink: 0; width: 40px; height: 4px; margin: 0 auto 10px;
        border-radius: 2px; background: var(--sp-border-forte);
      }

      /* Busca flutuante e botão "ver lista" */
      .topo-mobile {
        position: absolute; top: 12px; left: 12px; right: 12px; z-index: 1000;
        display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
      }
      .topo-mobile .sp-campo { width: 100%; }
      .topo-mobile input { box-shadow: 0 4px 12px rgba(31, 35, 40, .14); }
      .ver-lista {
        display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer;
        border: 0; border-radius: var(--sp-radius); background: var(--sp-navy); color: var(--sp-on-dark);
        font-size: 13px; font-weight: 600; box-shadow: 0 4px 12px rgba(31, 35, 40, .2);
      }
      .localizar { top: 112px; bottom: auto; right: 12px; }

      /* Lista como folha inferior */
      .lista {
        position: absolute; left: 0; right: 0; bottom: 0; z-index: 1100;
        max-height: 58%; padding: 10px 16px 20px; border-right: 0;
        border-radius: 16px 16px 0 0; box-shadow: 0 -8px 24px rgba(31, 35, 40, .18);
      }
      .lista h1 { font-size: 20px; line-height: 28px; }
      .recolher { display: inline-flex; align-items: center; gap: 4px; padding: 0; font-size: 14px; }
      .layout.lista-fechada .lista,
      .layout.com-painel .lista { display: none; }

      /* Painéis A e B como folha inferior */
      .painel {
        top: auto; left: 0; right: 0; bottom: 0; width: auto; max-height: 78%;
        padding: 10px 20px 24px; border: 0; border-radius: 16px 16px 0 0;
        box-shadow: 0 -8px 24px rgba(31, 35, 40, .18);
      }
      .aviso-mapa { bottom: auto; top: 112px; }
    }
  `],
})
export class ParkingMap implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  private readonly service = inject(ParkingLotService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private map?: L.Map;
  private posicao?: L.CircleMarker;
  private readonly markers = new Map<string, L.Marker>();
  private consultaSeq = 0;
  private disponibilidadeSeq = 0;
  private avisoTimer?: ReturnType<typeof setTimeout>;

  readonly logado = computed(() => !!this.auth.usuario());

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
  readonly localizando = signal(false);
  readonly avisoMapa = signal('');
  /** No celular: a folha da lista está aberta? */
  readonly listaAberta = signal(true);
  /** Vagas livres de cada unidade no período escolhido. */
  readonly livresPeriodo = signal<Record<string, number>>({});

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

  /** Vagas agrupadas por fileira (letra do rótulo) e divididas em linhas. */
  readonly fileiras = computed(() => {
    const grupos = new Map<string, SpaceOption[]>();
    for (const v of this.consulta()?.spaces ?? []) {
      const letra = v.label.includes('-') ? v.label.split('-')[0] : '';
      const lista = grupos.get(letra) ?? [];
      lista.push(v);
      grupos.set(letra, lista);
    }
    return [...grupos.entries()].map(([letra, vagas]) => {
      const linhas: SpaceOption[][] = [];
      for (let i = 0; i < vagas.length; i += VAGAS_POR_LINHA) {
        linhas.push(vagas.slice(i, i + VAGAS_POR_LINHA));
      }
      return { letra, linhas };
    });
  });

  /** "Hoje, 29/10 · 14:00 às 16:00" — faixa da lista. */
  readonly periodoBarra = computed(() => {
    const c = this.chegada();
    const s = this.saida();
    if (!c || !s) return 'Escolha o período';
    const hoje = paraInputLocal(new Date()).split('T')[0];
    const amanha = paraInputLocal(new Date(Date.now() + 86_400_000)).split('T')[0];
    const dia = (d: string) => {
      const [, m, dd] = d.split('-');
      const base = `${dd}/${m}`;
      if (d === hoje) return `Hoje, ${base}`;
      if (d === amanha) return `Amanhã, ${base}`;
      return base;
    };
    const [dc, hc] = c.split('T');
    const [ds, hs] = s.split('T');
    return dc === ds ? `${dia(dc)} · ${hc} às ${hs}` : `${dia(dc)} ${hc} até ${dia(ds)} ${hs}`;
  });

  /** "29/10/2026 · 14:00 às 16:00" — painel de vagas. */
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
    const map = L.map(this.mapEl.nativeElement, { zoomControl: false }).setView([-12.2664, -38.9663], 13);
    this.map = map;
    map.getContainer().classList.add('sp-mapa');

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'sp-tiles',
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

    map.on('locationfound', (e: L.LocationEvent) => {
      this.localizando.set(false);
      if (this.posicao) {
        this.posicao.setLatLng(e.latlng);
      } else {
        this.posicao = L.circleMarker(e.latlng, {
          radius: 7, color: '#FFFFFF', weight: 2, fillColor: '#1F2328', fillOpacity: 1,
        }).addTo(map);
      }
    });
    map.on('locationerror', () => {
      this.localizando.set(false);
      this.mostrarAviso('Não foi possível obter sua localização.');
    });

    await this.carregar();
  }

  ngOnDestroy() {
    clearTimeout(this.avisoTimer);
    this.map?.remove();
  }

  preco(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  livresDoLote(lot: ParkingLot): number {
    const noPeriodo = this.livresPeriodo()[lot.id];
    return noPeriodo ?? lot.freeSpaces;
  }

  estado(lot: ParkingLot): EstadoLote {
    const livres = this.livresDoLote(lot);
    if (livres <= 0) return 'lotado';
    if (lot.totalSpaces > 0 && livres / lot.totalSpaces <= LIMITE_POUCAS) return 'poucas';
    return 'normal';
  }

  /** Blocos de ocupação do cartão, proporcionais às vagas livres. */
  blocos(lot: ParkingLot): string[] {
    const total = lot.totalSpaces;
    if (!total) return [];
    const n = Math.min(total, MAX_BLOCOS);
    const est = this.estado(lot);
    if (est === 'lotado') return Array(n).fill('lotado');
    let livres = Math.round((this.livresDoLote(lot) / total) * n);
    livres = Math.max(1, Math.min(n, livres));
    const tipoLivre = est === 'poucas' ? 'poucas' : 'livre';
    return [...Array(n - livres).fill('ocupado'), ...Array(livres).fill(tipoLivre)];
  }

  async selecionar(id: string) {
    if (!id) return;
    this.selectedId.set(id);
    this.etapa.set('periodo');
    this.atualizarMarcadores();
    const lot = this.selecionado();
    if (lot) this.centralizar(lot);
    await this.consultar();
  }

  async alterarPeriodo() {
    if (this.selecionado()) {
      this.etapa.set('periodo');
    } else {
      await this.selecionar(this.lotsFiltrados()[0]?.id ?? '');
    }
  }

  fechar() {
    this.selectedId.set('');
    this.consulta.set(null);
    this.etapa.set('periodo');
    this.mensagem.set('');
    this.atualizarMarcadores();
  }

  /** No celular, digitar na busca abre a lista para mostrar o resultado. */
  buscarNoMobile(valor: string) {
    this.busca.set(valor);
    if (!this.selecionado()) this.listaAberta.set(true);
  }

  async mudarChegada(valor: string) {
    this.chegada.set(valor);
    await Promise.all([this.consultar(), this.atualizarDisponibilidade()]);
  }

  async mudarSaida(valor: string) {
    this.saida.set(valor);
    await Promise.all([this.consultar(), this.atualizarDisponibilidade()]);
  }

  abrirVagas() {
    this.mensagem.set('');
    this.etapa.set('vagas');
  }

  voltarAoPeriodo() {
    this.mensagem.set('');
    this.etapa.set('periodo');
  }

  localizar() {
    if (!this.map) return;
    this.localizando.set(true);
    this.map.locate({ setView: true, maxZoom: 15 });
  }

  async reservar() {
    const lot = this.selecionado();
    const vaga = this.vagaId();
    if (!lot || !vaga) return;
    if (!this.logado()) {
      await this.router.navigate(['/entrar'], { queryParams: { voltar: '/mapa' } });
      return;
    }

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
        await Promise.all([this.consultar(), this.atualizarDisponibilidade()]);
        this.etapa.set('vagas');
        this.mensagem.set(e.message);
      } else {
        this.mensagem.set(this.erroTexto(e, 'Não foi possível criar a reserva.'));
      }
    } finally {
      this.carregando.set(false);
    }
  }

  private ehMobile(): boolean {
    return window.matchMedia(LARGURA_MOBILE).matches;
  }

  /**
   * Leva o mapa até a unidade. No celular, desloca o centro para baixo,
   * para o marcador aparecer acima da folha inferior.
   */
  private centralizar(lot: ParkingLot) {
    const map = this.map;
    if (!map) return;
    const alvo = L.latLng(lot.latitude, lot.longitude);
    const zoom = 16;
    if (this.ehMobile()) {
      const ponto = map.project(alvo, zoom).add([0, map.getSize().y * 0.25]);
      map.flyTo(map.unproject(ponto, zoom), zoom, { duration: 0.6 });
    } else {
      map.flyTo(alvo, zoom, { duration: 0.6 });
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
      await this.atualizarDisponibilidade();
    } catch (e) {
      this.erroLista.set(this.erroTexto(e, 'Não foi possível carregar os estacionamentos.'));
    }
  }

  /** Busca as vagas livres de todas as unidades no período escolhido. */
  private async atualizarDisponibilidade() {
    const c = this.chegada();
    const s = this.saida();
    if (!c || !s || new Date(s) <= new Date(c)) {
      this.livresPeriodo.set({});
      this.atualizarMarcadores();
      return;
    }
    const from = new Date(c).toISOString();
    const to = new Date(s).toISOString();
    const seq = ++this.disponibilidadeSeq;

    const resultados = await Promise.all(
      this.lots().map(async (l) => {
        try {
          const a = await this.service.availability(l.id, from, to);
          return [l.id, a.freeSpaces] as const;
        } catch {
          return null;
        }
      }),
    );
    if (seq !== this.disponibilidadeSeq) return;

    const mapa: Record<string, number> = {};
    for (const r of resultados) {
      if (r) mapa[r[0]] = r[1];
    }
    this.livresPeriodo.set(mapa);
    this.atualizarMarcadores();
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
    const est = this.estado(lot);
    const classes = [
      'sp-marca',
      lot.id === this.selectedId() ? 'sp-marca--ativa' : '',
      est === 'lotado' ? 'sp-marca--lotado' : '',
      est === 'poucas' ? 'sp-marca--poucas' : '',
    ].join(' ');
    const info = est === 'lotado'
      ? '<b>Lotado</b>'
      : `<b>${escapeHtml(precoCurto(lot.hourlyRateCents))}/h</b><i></i><em>${this.livresDoLote(lot)} vagas</em>`;
    return L.divIcon({
      className: 'sp-pin',
      html: `<div class="${classes}"><span class="sp-marca-p">P</span><span class="sp-marca-info">${info}</span></div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  }

  private mostrarAviso(texto: string) {
    this.avisoMapa.set(texto);
    clearTimeout(this.avisoTimer);
    this.avisoTimer = setTimeout(() => this.avisoMapa.set(''), 4000);
  }

  private erroTexto(e: unknown, padrao: string): string {
    return e instanceof Error && e.message ? e.message : padrao;
  }
}
