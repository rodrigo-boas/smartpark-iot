import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { App } from './app';
import { AuthService } from './auth.service';

const authFalso = {
  carregado: signal(true),
  usuario: signal(null),
  nomeExibicao: signal('motorista'),
  sair: async () => undefined,
};

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AuthService, useValue: authFalso }],
    }).compileComponents();
  });

  it('cria o componente', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });

  it('mostra o nome e o botão de entrar quando não há usuário', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.nome')?.textContent).toContain('SmartPark IoT');
    expect(el.querySelector('.botao-topo')?.textContent).toContain('Entrar');
  });
});
