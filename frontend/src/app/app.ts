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
        <span class="nome">SmartPark IoT</span>
      </a>

      <nav class="abas" aria-label="Navegação principal">
        <a routerLink="/mapa" routerLinkActive="ativa">Mapa</a>
      </nav>

      <div class="conta">
        @if (auth.carregado()) {
          @if (auth.usuario()) {
            <span class="ola">Olá, {{ auth.nomeExibicao() }}</span>
            <button type="button" class="botao-topo" (click)="sair()">Sair</button>
          } @else {
            <a class="botao-topo" routerLink="/entrar">Entrar</a>
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
      height: 64px; padding: 0 32px; flex-shrink: 0;
      background: var(--sp-navy); color: #fff;
    }
    .marca {
      display: flex; align-items: center; gap: 12px; justify-self: start;
      color: inherit; text-decoration: none;
    }
    .logo {
      display: grid; place-items: center; width: 28px; height: 28px; border-radius: 6px;
      background: var(--sp-accent); color: var(--sp-navy); font-weight: 800; font-size: 18px;
    }
    .nome { font-weight: 800; font-size: 18px; }

    .abas { display: flex; gap: 32px; height: 100%; }
    .abas a {
      display: flex; align-items: center; height: 100%; padding-top: 3px;
      color: #fff; text-decoration: none; font-weight: 700; font-size: 15px;
      border-bottom: 3px solid transparent;
    }
    .abas a:hover { color: #dbe4ef; }
    .abas a.ativa { border-bottom-color: var(--sp-accent); }

    .conta { display: flex; align-items: center; gap: 14px; justify-self: end; }
    .ola { font-weight: 700; font-size: 14px; }
    .botao-topo {
      padding: 8px 16px; border: 1.5px solid #fff; border-radius: var(--sp-radius-sm);
      background: transparent; color: #fff; font-weight: 700; font-size: 14px;
      text-decoration: none; cursor: pointer;
    }
    .botao-topo:hover { background: rgba(255, 255, 255, .1); }

    .conteudo { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: auto; }

    @media (max-width: 760px) {
      .topo { grid-template-columns: 1fr auto; height: auto; padding: 10px 16px; row-gap: 8px; }
      .abas { grid-column: 1 / -1; grid-row: 2; height: 40px; }
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
