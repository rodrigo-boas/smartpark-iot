import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, mensagemAuth } from './auth.service';

type Modo = 'entrar' | 'cadastrar';

@Component({
  selector: 'app-entrar',
  template: `
    <div class="vagas" aria-hidden="true"><span class="corredor"></span></div>

    <section class="card">
      <span class="icone" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
          <path d="M5 4v18" stroke="#FF6B2C" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M5 9h17" stroke="#FF6B2C" stroke-width="3"/>
          <path d="M9 9l-2 3M13 9l-2 3M17 9l-2 3M21 9l-2 3" stroke="#1F2328" stroke-width="1.5"/>
        </svg>
      </span>

      <h1>{{ modo() === 'entrar' ? 'Entrar no SmartPark' : 'Criar sua conta' }}</h1>
      <p class="sub">
        {{ modo() === 'entrar'
          ? 'Acesse para reservar vagas e acompanhar suas reservas.'
          : 'Com a conta, você reserva vagas e acompanha tudo pelo celular ou computador.' }}
      </p>

      <button type="button" class="sp-btn sp-btn--secundario sp-btn--bloco google"
              [disabled]="carregando()" (click)="entrarComGoogle()">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Continuar com Google
      </button>

      <div class="divisor"><span>ou</span></div>

      <div class="abas" role="tablist">
        <button type="button" role="tab" [attr.aria-selected]="modo() === 'entrar'"
                [class.ativa]="modo() === 'entrar'" (click)="trocar('entrar')">Entrar com e-mail</button>
        <button type="button" role="tab" [attr.aria-selected]="modo() === 'cadastrar'"
                [class.ativa]="modo() === 'cadastrar'" (click)="trocar('cadastrar')">Criar conta</button>
      </div>

      <form (submit)="enviar($event)" novalidate>
        @if (modo() === 'cadastrar') {
          <label class="sp-campo">
            <span>Nome</span>
            <span class="sp-campo-caixa">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <input type="text" autocomplete="name" placeholder="Seu nome" [value]="nome()"
                     (input)="nome.set($any($event.target).value)" />
            </span>
          </label>
        }

        <label class="sp-campo">
          <span>E-mail</span>
          <span class="sp-campo-caixa">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>
            </svg>
            <input type="email" autocomplete="email" placeholder="voce@email.com" [value]="email()"
                   (input)="email.set($any($event.target).value)" />
          </span>
        </label>

        <label class="sp-campo">
          <span>Senha</span>
          <span class="sp-campo-caixa">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
            </svg>
            <input [type]="mostrarSenha() ? 'text' : 'password'"
                   [attr.autocomplete]="modo() === 'entrar' ? 'current-password' : 'new-password'"
                   [value]="senha()" (input)="senha.set($any($event.target).value)" />
            <button type="button" class="olho"
                    [attr.aria-label]="mostrarSenha() ? 'Ocultar senha' : 'Mostrar senha'"
                    [attr.aria-pressed]="mostrarSenha()"
                    (click)="mostrarSenha.set(!mostrarSenha())">
              @if (mostrarSenha()) {
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.4 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.4 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19"/>
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                  <line x1="2" y1="2" x2="22" y2="22"/>
                </svg>
              } @else {
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              }
            </button>
          </span>
        </label>
        @if (modo() === 'cadastrar') {
          <p class="dica">Mínimo de 6 caracteres.</p>
        }

        @if (erro()) {
          <p class="msg erro" role="alert">{{ erro() }}</p>
        }
        @if (aviso()) {
          <p class="msg ok" role="status">{{ aviso() }}</p>
        }

        <button type="submit" class="sp-btn sp-btn--primario sp-btn--bloco" [disabled]="carregando()">
          {{ carregando() ? 'Aguarde…' : (modo() === 'entrar' ? 'Entrar' : 'Criar conta') }}
        </button>
      </form>

      @if (modo() === 'entrar') {
        <hr class="sp-divisor" />
        <button type="button" class="sp-btn sp-btn--link" (click)="recuperar()">Esqueci minha senha</button>
      }
    </section>
  `,
  styles: [`
    :host {
      position: relative; flex: 1; display: grid; place-items: center;
      padding: 48px 16px; overflow: hidden;
    }

    /* Fundo: duas fileiras de vagas pintadas com o corredor tracejado no meio */
    .vagas {
      position: absolute; left: 0; right: 0; top: 50%; height: 290px;
      transform: translateY(-50%); pointer-events: none;
    }
    .vagas::before, .vagas::after {
      content: ''; position: absolute; left: 0; right: 0; height: 106px;
      background: repeating-linear-gradient(90deg, var(--sp-border) 0 3px, transparent 3px 92px);
    }
    .vagas::before { top: 0; }
    .vagas::after { bottom: 0; }
    .corredor {
      position: absolute; left: 0; right: 0; top: 50%; height: 3px; transform: translateY(-50%);
      background: repeating-linear-gradient(90deg, var(--sp-border) 0 12px, transparent 12px 20px);
    }

    .card {
      position: relative; z-index: 1; width: 100%; max-width: 400px; padding: 32px;
      background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: var(--sp-radius);
      box-shadow: 0 8px 24px rgba(31, 35, 40, .08);
    }
    .icone {
      display: grid; place-items: center; width: 48px; height: 48px; margin-bottom: 20px;
      border-radius: var(--sp-radius); background: var(--sp-navy);
    }
    h1 { margin: 0 0 8px; font-size: 28px; line-height: 36px; font-weight: 700; }
    .sub { margin: 0 0 24px; color: var(--sp-text-muted); }

    .google { gap: 10px; }

    .divisor {
      display: flex; align-items: center; gap: 12px; margin: 20px 0;
      font-size: 12px; color: var(--sp-text-muted);
    }
    .divisor::before, .divisor::after {
      content: ''; flex: 1; border-top: 1px dashed var(--sp-border-forte);
    }

    .abas { display: flex; gap: 24px; margin-bottom: 20px; border-bottom: 1px solid var(--sp-border); }
    .abas button {
      position: relative; padding: 0 0 12px; border: 0; background: none;
      color: var(--sp-text-muted); font-weight: 500; cursor: pointer;
    }
    .abas button:hover { color: var(--sp-text); }
    .abas button.ativa { color: var(--sp-text); font-weight: 600; }
    .abas button.ativa::after {
      content: ''; position: absolute; left: 0; right: 0; bottom: -2px; height: 3px;
      background: repeating-linear-gradient(90deg, var(--sp-primary) 0 8px, transparent 8px 13px);
    }

    form { display: flex; flex-direction: column; gap: 16px; }

    .sp-campo-caixa input[type='password'],
    .sp-campo-caixa input[type='text'] { padding-right: 46px; }
    .sp-campo-caixa input::-ms-reveal { display: none; }
    .olho {
      position: absolute; right: 5px; display: grid; place-items: center;
      width: 34px; height: 34px; padding: 0; border: 0; border-radius: var(--sp-radius);
      background: transparent; color: var(--sp-text-muted); cursor: pointer;
    }
    .olho:hover { background: var(--sp-bg); color: var(--sp-text); }

    .dica { margin: -8px 0 0; font-size: 12px; color: var(--sp-text-muted); }

    .msg { margin: 0; font-size: 13px; font-weight: 600; }
    .erro { color: var(--sp-danger); }
    .ok { color: var(--sp-success); }

    .sp-divisor { margin: 20px 0 12px; }
  `],
})
export class Entrar implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly voltar = inject(ActivatedRoute).snapshot.queryParamMap.get('voltar') ?? '/mapa';

  readonly modo = signal<Modo>('entrar');
  readonly nome = signal('');
  readonly email = signal('');
  readonly senha = signal('');
  readonly mostrarSenha = signal(false);
  readonly erro = signal('');
  readonly aviso = signal('');
  readonly carregando = signal(false);

  async ngOnInit() {
    await this.auth.aguardarPronto();
    if (this.auth.usuario()) {
      await this.irParaDestino();
    }
  }

  trocar(modo: Modo) {
    this.modo.set(modo);
    this.erro.set('');
    this.aviso.set('');
  }

  async entrarComGoogle() {
    this.erro.set('');
    this.aviso.set('');
    this.carregando.set(true);
    try {
      await this.auth.entrarComGoogle();
      await this.irParaDestino();
    } catch (e) {
      const mensagem = mensagemAuth(e);
      if (mensagem) this.erro.set(mensagem);
    } finally {
      this.carregando.set(false);
    }
  }

  async enviar(evento: Event) {
    evento.preventDefault();
    this.erro.set('');
    this.aviso.set('');

    const email = this.email().trim();
    const senha = this.senha();
    if (!email || !senha) {
      this.erro.set('Preencha e-mail e senha.');
      return;
    }
    if (this.modo() === 'cadastrar' && !this.nome().trim()) {
      this.erro.set('Informe seu nome.');
      return;
    }

    this.carregando.set(true);
    try {
      if (this.modo() === 'entrar') {
        await this.auth.entrar(email, senha);
      } else {
        await this.auth.cadastrar(this.nome().trim(), email, senha);
      }
      await this.irParaDestino();
    } catch (e) {
      this.erro.set(mensagemAuth(e));
    } finally {
      this.carregando.set(false);
    }
  }

  async recuperar() {
    this.erro.set('');
    this.aviso.set('');
    const email = this.email().trim();
    if (!email) {
      this.erro.set('Digite seu e-mail no campo acima e clique de novo.');
      return;
    }
    try {
      await this.auth.recuperarSenha(email);
    } catch {
      // não revela se o e-mail existe ou não
    }
    this.aviso.set('Se houver uma conta com este e-mail, enviamos um link para redefinir a senha.');
  }

  private irParaDestino() {
    // só aceita caminhos internos, para não redirecionar para outro site
    const destino = this.voltar.startsWith('/') && !this.voltar.startsWith('//') ? this.voltar : '/mapa';
    return this.router.navigateByUrl(destino);
  }
}
