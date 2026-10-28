import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('cria o componente', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });

  it('mostra o nome e as abas no cabeçalho', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.nome')?.textContent).toContain('SmartPark IoT');
    expect(el.querySelectorAll('.abas a').length).toBe(3);
  });
});
