import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="topo">
      <a class="marca" routerLink="/mapa" aria-label="SmartPark IoT, página inicial">
        <span class="logo" aria-hidden="true">P</span>
        <span class="nome">SmartPark IoT</span>
      </a>
    </header>

    <main class="conteudo">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100vh; }

    .topo {
      display: flex; align-items: center;
      height: 64px; padding: 0 32px; flex-shrink: 0;
      background: var(--sp-navy); color: #fff;
    }
    .marca {
      display: flex; align-items: center; gap: 12px;
      color: inherit; text-decoration: none;
    }
    .logo {
      display: grid; place-items: center; width: 28px; height: 28px; border-radius: 6px;
      background: var(--sp-accent); color: var(--sp-navy); font-weight: 800; font-size: 18px;
    }
    .nome { font-weight: 800; font-size: 18px; }

    .conteudo { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: auto; }

    @media (max-width: 760px) {
      .topo { padding: 10px 16px; height: auto; }
    }
  `],
})
export class App {}
