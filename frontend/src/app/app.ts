import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  host: { '(document:keydown.escape)': 'fecharMenu()' },
  template: `
    <header class="topo">
      <a class="marca" routerLink="/mapa" aria-label="SmartPark IoT, página inicial" (click)="fecharMenu()">
        <span class="logo" aria-hidden="true">P</span>
        <span class="nome">SmartPark <span class="iot">IoT</span></span>
      </a>

      <nav class="abas" aria-label="Navegação principal">
        <a routerLink="/mapa" routerLinkActive="ativa">Mapa</a>
        @if (auth.usuario()) {
          <a routerLink="/minhas-reservas" routerLinkActive="ativa">Minhas reservas</a>
        }
        @if (auth.ehAdmin()) {
          <a routerLink="/admin" routerLinkActive="ativa">Painel admin</a>
        }
      </nav>

      <div class="conta">
        @if (auth.carregado()) {
          @if (auth.usuario()) {
            <span class="ola">Olá, <strong>{{ auth.nomeExibicao() }}</strong></span>
            <button type="button" class="botao-topo" (click)="sair()">Sair</button>
          } @else {
            <a class="botao-topo botao-topo--entrar" routerLink="/entrar">Entrar</a>
          }
        }
      </div>

      <!-- Só no celular -->
      <button type="button" class="menu-botao"
              [attr.aria-expanded]="menuAberto()" aria-controls="menu-mobile"
              [attr.aria-label]="menuAberto() ? 'Fechar menu' : 'Abrir menu'"
              (click)="menuAberto.set(!menuAberto())">
        @if (menuAberto()) {
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18"/>
          </svg>
        } @else {
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16"/>
          </svg>
        }
      </button>

      @if (menuAberto()) {
        <nav id="menu-mobile" class="menu-mobile" aria-label="Menu">
          <a routerLink="/mapa" routerLinkActive="ativa" (click)="fecharMenu()">Mapa</a>
          @if (auth.usuario()) {
            <a routerLink="/minhas-reservas" routerLinkActive="ativa" (click)="fecharMenu()">Minhas reservas</a>
          }
          @if (auth.ehAdmin()) {
            <a routerLink="/admin" routerLinkActive="ativa" (click)="fecharMenu()">Painel admin</a>
          }
          <div class="menu-conta">
            @if (auth.usuario()) {
              <span class="ola">Olá, <strong>{{ auth.nomeExibicao() }}</strong></span>
              <button type="button" class="botao-topo" (click)="sair()">Sair</button>
            } @else {
              <a class="botao-topo botao-topo--entrar" routerLink="/entrar" (click)="fecharMenu()">Entrar</a>
            }
          </div>
        </nav>
      }
    </header>

    <main class="conteudo">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100vh; }

    .topo {
      position: relative; z-index: 2000;
      display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
      height: 62px; padding: 0 32px; flex-shrink: 0;
      background: var(--sp-navy); color: var(--sp-on-dark);
    }

    .marca {
      display: flex; align-items: center; gap: 12px; justify-self: start;
      color: inherit; text-decoration: none;
    }
    .logo {
      display: grid; place-items: center; width: 32px; height: 32px; border-radius: 6px;
      background: var(--sp-primary); color: var(--sp-navy);
      font-family: var(--sp-font-titulo); font-weight: 700; font-size: 22px; line-height: 1;
    }
    .nome { font-family: var(--sp-font-titulo); font-weight: 700; font-size: 18px; }
    .iot { font-family: var(--sp-font-mono); font-weight: 700; font-size: 13px; color: var(--sp-primary); }

    .abas { display: flex; gap: 36px; height: 100%; }
    .abas a {
      position: relative; display: flex; align-items: center; height: 100%;
      color: var(--sp-on-dark-muted); text-decoration: none; font-weight: 500; font-size: 15px;
    }
    .abas a:hover { color: var(--sp-on-dark); }
    .abas a.ativa { color: var(--sp-on-dark); font-weight: 600; }
    .abas a.ativa::after {
      content: ''; position: absolute; left: 0; right: 0; bottom: 8px; height: 3px;
      background: repeating-linear-gradient(90deg, var(--sp-primary) 0 10px, transparent 10px 16px);
    }

    .conta { display: flex; align-items: center; gap: 14px; justify-self: end; }
    .ola { font-size: 14px; color: var(--sp-on-dark-muted); }
    .ola strong { color: var(--sp-on-dark); font-weight: 600; }

    .botao-topo {
      padding: 8px 16px; border: 1px solid #4A5059; border-radius: var(--sp-radius);
      background: transparent; color: var(--sp-on-dark);
      font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer;
    }
    .botao-topo:hover { border-color: var(--sp-on-dark); }
    .botao-topo--entrar { background: var(--sp-primary); border-color: var(--sp-primary); color: var(--sp-navy); }
    .botao-topo--entrar:hover { background: var(--sp-primary-hover); border-color: var(--sp-primary-hover); }

    .menu-botao {
      display: none; place-items: center; width: 44px; height: 44px; padding: 0; justify-self: end;
      border: 0; border-radius: var(--sp-radius); background: transparent; color: var(--sp-on-dark); cursor: pointer;
    }
    .menu-botao:hover { background: var(--sp-navy-2); }

    .menu-mobile {
      position: absolute; top: 100%; left: 0; right: 0;
      display: flex; flex-direction: column; padding: 8px 16px 20px;
      background: var(--sp-navy); border-top: 1px solid var(--sp-navy-2);
      box-shadow: 0 12px 24px rgba(31, 35, 40, .3);
    }
    .menu-mobile a:not(.botao-topo) {
      padding: 14px 12px; border-left: 4px solid transparent;
      color: var(--sp-on-dark-muted); font-size: 16px; font-weight: 500; text-decoration: none;
    }
    .menu-mobile a.ativa { color: var(--sp-on-dark); font-weight: 600; border-left-color: var(--sp-primary); }
    .menu-conta {
      display: flex; justify-content: space-between; align-items: center; gap: 12px;
      margin-top: 8px; padding: 16px 12px 0; border-top: 1px dashed #4A5059;
    }

    .conteudo { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: auto; }

    @media (max-width: 760px) {
      .topo { grid-template-columns: 1fr auto; height: 56px; padding: 0 12px 0 16px; }
      .abas, .conta { display: none; }
      .menu-botao { display: grid; }
    }
  `],
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly menuAberto = signal(false);

  fecharMenu() {
    this.menuAberto.set(false);
  }

  async sair() {
    this.fecharMenu();
    await this.auth.sair();
    await this.router.navigate(['/mapa']);
  }
}
