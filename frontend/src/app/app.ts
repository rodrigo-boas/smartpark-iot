import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

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
        <a routerLink="/minhas-reservas" routerLinkActive="ativa">Minhas reservas</a>
        <a routerLink="/admin" routerLinkActive="ativa">Painel admin</a>
      </nav>
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
      display: flex; align-items: center; gap: 12px;
      color: inherit; text-decoration: none; justify-self: start;
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

    .conteudo { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: auto; }

    @media (max-width: 760px) {
      .topo { grid-template-columns: 1fr; height: auto; padding: 10px 16px; row-gap: 8px; }
      .abas { gap: 20px; height: 40px; overflow-x: auto; }
    }
  `],
})
export class App {}
