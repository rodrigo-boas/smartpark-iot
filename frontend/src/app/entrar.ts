import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, mensagemAuth } from './auth.service';

type Modo = 'entrar' | 'cadastrar';

@Component({
  selector: 'app-entrar',
  template: `
    <section class="card">
      <span class="logo" aria-hidden="true">P</span>
      <h1>{{ modo() === 'entrar' ? 'Entrar no SmartPark' : 'Criar sua conta' }}</h1>
      <p class="sub">
        {{ modo() === 'entrar'
          ? 'Acesse para reservar vagas e acompanhar suas reservas.'
          : 'Com a conta, você reserva vagas e acompanha tudo pelo celular ou computador.' }}
      </p>

      <button type="button" class="google" [disabled]="carregando()" (click)="entrarComGoogle()">
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
          <label class="campo">
            <span>Nome</span>
            <input type="text" autocomplete="name" [value]="nome()"
                   (input)="nome.set($any($event.target).value)" />
          </label>
        }

        <label class="campo">
          <span>E-mail</span>
          <input type="email" autocomplete="email" [value]="email()"
                 (input)="email.set($any($event.target).value)" />
        </label>

                <label class="campo">
          <span>Senha</span>
          <div class="senha">
            <input [type]="mostrarSenha() ? 'text' : 'password'"
                   [attr.autocomplete]="modo() === 'entrar' ? 'current-password' : 'new-password'"
                   [value]="senha()" (input)="senha.set($any($event.target).value)" />
            <button type="button" class="olho"
                    [attr.aria-label]="mostrarSenha() ? 'Ocultar senha' : 'Mostrar senha'"
                    [attr.aria-pressed]="mostrarSenha()"
                    (click)="mostrarSenha.set(!mostrarSenha())">
              @if (mostrarSenha()) {
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.4 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.4 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19"/>
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                  <line x1="2" y1="2" x2="22" y2="22"/>
                </svg>
              } @else {
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              }
            </button>
          </div>
        </label>

        @if (erro()) {
          <p class="msg erro" role="alert">{{ erro() }}</p>
        }
        @if (aviso()) {
          <p class="msg ok" role="status">{{ aviso() }}</p>
        }

        <button type="submit" class="primario" [disabled]="carregando()">
          {{ carregando() ? 'Aguarde…' : (modo() === 'entrar' ? 'Entrar' : 'Criar conta') }}
        </button>
      </form>

      @if (modo() === 'entrar') {
        <button type="button" class="link" (click)="recuperar()">Esqueci minha senha</button>
      }
    </section>
  `,
  styles: [`
    :host { display: grid; place-items: start center; padding: 48px 16px; }
    .card {
      width: 100%; max-width: 420px; padding: 32px;
      background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: 16px;
    }
    .logo {
      display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: 16px;
      border-radius: 8px; background: var(--sp-accent); color: var(--sp-navy);
      font-weight: 800; font-size: 22px;
    }
    h1 { margin: 0 0 6px; font-size: 24px; font-weight: 800; }
    .sub { margin: 0 0 20px; font-size: 14px; color: var(--sp-text-muted); }

    .google {
      display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%;
      padding: 12px; font-size: 15px; font-weight: 700; color: #1f1f1f; cursor: pointer;
      background: #fff; border: 1px solid #b9c3cf; border-radius: var(--sp-radius-sm);
    }
    .google:hover:not(:disabled) { background: #f6f8fa; }
    .google:disabled { opacity: .6; cursor: not-allowed; }

    .divisor {
      display: flex; align-items: center; gap: 12px; margin: 20px 0;
      font-size: 13px; color: var(--sp-text-muted);
    }
    .divisor::before, .divisor::after { content: ''; flex: 1; height: 1px; background: var(--sp-border); }

    .abas {
      display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 20px; padding: 4px;
      background: var(--sp-surface-alt); border: 1px solid var(--sp-border); border-radius: var(--sp-radius-sm);
    }
    .abas button {
      padding: 9px; border: 0; border-radius: 6px; background: transparent;
      color: var(--sp-text-muted); font-weight: 700; cursor: pointer;
    }
    .abas button.ativa { background: #fff; color: var(--sp-text); box-shadow: 0 1px 3px rgba(16, 35, 63, .12); }

    .campo { display: block; margin-bottom: 14px; }
    .campo span { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 700; }
    .campo input {
      width: 100%; padding: 11px 12px; font-size: 15px; color: var(--sp-text);
      background: #fff; border: 1px solid #b9c3cf; border-radius: var(--sp-radius-sm);
    }
    .campo input:focus { outline: 2px solid var(--sp-primary); outline-offset: 1px; border-color: var(--sp-primary); }
        .senha { position: relative; }
    .senha input { padding-right: 46px; }
    .senha input::-ms-reveal { display: none; }
    .olho {
      position: absolute; top: 50%; right: 6px; transform: translateY(-50%);
      display: grid; place-items: center; width: 34px; height: 34px; padding: 0;
      border: 0; border-radius: 6px; background: transparent;
      color: var(--sp-text-muted); cursor: pointer;
    }
    .olho:hover { background: var(--sp-surface-alt); color: var(--sp-text); }
    .olho:focus-visible { outline: 2px solid var(--sp-primary); outline-offset: 1px; }
    .dica { margin: -6px 0 14px; font-size: 12px; color: var(--sp-text-muted); }

    .msg { margin: 0 0 14px; font-size: 13px; font-weight: 600; }
    .erro { color: var(--sp-danger); }
    .ok { color: var(--sp-success); }

    .primario {
      width: 100%; padding: 13px; border: 0; border-radius: var(--sp-radius-sm);
      background: var(--sp-primary); color: #fff; font-size: 16px; font-weight: 800; cursor: pointer;
    }
    .primario:hover:not(:disabled) { background: var(--sp-primary-hover); }
    .primario:disabled { background: #9db3c6; cursor: not-allowed; }
    .link {
      display: block; margin: 14px auto 0; background: none; border: 0;
      color: var(--sp-primary); font-weight: 700; cursor: pointer;
    }
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
