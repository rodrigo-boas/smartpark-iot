import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="topo">
      <a class="marca" routerLink="/mapa" aria-label="SmartPark IoT, página inicial">
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
    </header>

    <main class="conteudo">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100vh; }

    .topo {
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

    .conteudo { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: auto; }

    @media (max-width: 760px) {
      .topo { grid-template-columns: 1fr auto; height: auto; padding: 10px 16px; row-gap: 4px; }
      .abas { grid-column: 1 / -1; grid-row: 2; gap: 24px; height: 40px; overflow-x: auto; }
      .ola { display: none; }
    }
  `],
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async sair() {
    await this.auth.sair();
    await this.router.navigate(['/mapa']);
  }
}
