import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Só deixa passar quem está logado; os outros vão para a tela de entrar. */
export const exigeLogin: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.aguardarPronto();
  return auth.usuario()
    ? true
    : router.createUrlTree(['/entrar'], { queryParams: { voltar: state.url } });
};

/** Só deixa passar o operador (usado na etapa do painel admin). */
export const exigeAdmin: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.aguardarPronto();
  if (!auth.usuario()) {
    return router.createUrlTree(['/entrar'], { queryParams: { voltar: state.url } });
  }
  return auth.ehAdmin() ? true : router.createUrlTree(['/mapa']);
};
