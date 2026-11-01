import { Injectable, computed, signal } from '@angular/core';
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { API_BASE_URL } from './config';
import { FIREBASE_CONFIG } from './firebase-config';

export interface Perfil {
  uid: string;
  email: string;
  name: string | null;
  admin: boolean;
}

/**
 * Traduz os códigos de erro do Firebase Authentication.
 * Retorna texto vazio quando não há o que mostrar (ex.: usuário fechou a janela do Google).
 */
export function mensagemAuth(e: unknown): string {
  const code =
    typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    case 'auth/popup-blocked':
      return 'O navegador bloqueou a janela do Google. Permita pop-ups para este site e tente de novo.';
    case 'auth/unauthorized-domain':
      return 'Este endereço não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados).';
    case 'auth/account-exists-with-different-credential':
      return 'Já existe uma conta com este e-mail. Entre com e-mail e senha.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha incorretos.';
    case 'auth/email-already-in-use':
      return 'Já existe uma conta com este e-mail.';
    case 'auth/weak-password':
      return 'A senha precisa ter pelo menos 6 caracteres.';
    case 'auth/invalid-email':
      return 'E-mail inválido.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    case 'auth/network-request-failed':
      return 'Sem conexão. Verifique sua internet.';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'Este método de login não está ativado no Firebase.';
  }
  return 'Não foi possível concluir. Tente novamente.';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = getAuth(initializeApp(FIREBASE_CONFIG));
  private readonly pronto: Promise<void>;

  readonly usuario = signal<User | null>(null);
  readonly perfil = signal<Perfil | null>(null);
  readonly carregado = signal(false);

  readonly ehAdmin = computed(() => this.perfil()?.admin === true);
  readonly nomeExibicao = computed(() => {
    const p = this.perfil();
    if (p?.name) return p.name.split(' ')[0];
    if (p?.email) return p.email.split('@')[0];
    return 'motorista';
  });

  constructor() {
    this.pronto = new Promise((resolve) => {
      onAuthStateChanged(this.auth, async (user) => {
        this.usuario.set(user);
        this.perfil.set(user ? await this.buscarPerfil(user) : null);
        this.carregado.set(true);
        resolve();
      });
    });
  }

  /** Espera o Firebase restaurar a sessão salva no navegador. */
  aguardarPronto(): Promise<void> {
    return this.pronto;
  }

  async token(): Promise<string | null> {
    await this.pronto;
    return this.auth.currentUser ? this.auth.currentUser.getIdToken() : null;
  }

  async entrar(email: string, senha: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email, senha);
  }

  async entrarComGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(this.auth, provider);
    this.perfil.set(await this.buscarPerfil(cred.user));
  }

  async cadastrar(nome: string, email: string, senha: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(this.auth, email, senha);
    await updateProfile(cred.user, { displayName: nome });
    await cred.user.getIdToken(true); // renova o token já com o nome
    this.perfil.set(await this.buscarPerfil(cred.user));
  }

  async recuperarSenha(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }

  async sair(): Promise<void> {
    await signOut(this.auth);
  }

  private async buscarPerfil(user: User): Promise<Perfil> {
    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API_BASE_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const p = (await r.json()) as Perfil;
        return { ...p, name: p.name || user.displayName };
      }
    } catch {
      // backend fora do ar: segue com os dados básicos do Firebase
    }
    return { uid: user.uid, email: user.email ?? '', name: user.displayName, admin: false };
  }
}
