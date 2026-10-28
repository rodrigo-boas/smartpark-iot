import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-em-breve',
  imports: [RouterLink],
  template: `
    <section class="card">
      <h1>{{ titulo }}</h1>
      <p>Esta tela ainda está em construção.</p>
      <a routerLink="/mapa">Voltar ao mapa</a>
    </section>
  `,
  styles: [`
    :host { display: block; padding: 40px 24px; }
    .card {
      max-width: 560px; margin: 0 auto; padding: 28px;
      background: var(--sp-surface); border: 1px solid var(--sp-border);
      border-radius: var(--sp-radius);
    }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 0 0 16px; color: var(--sp-text-muted); }
    a { color: var(--sp-primary); font-weight: 600; }
  `],
})
export class EmBreve {
  readonly titulo: string = inject(ActivatedRoute).snapshot.data['titulo'] ?? 'Em breve';
}
