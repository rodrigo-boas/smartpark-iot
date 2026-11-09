import { Injectable, inject } from '@angular/core';
import { API_BASE_URL } from './config';
import { AuthService } from './auth.service';
import { ApiError } from './parking-lot.service';

export type EstadoVaga = 'LIVRE' | 'RESERVADA' | 'OCUPADA';

export interface VagaStatus {
  label: string;
  estado: EstadoVaga;
}

export interface Unidade {
  id: string;
  nome: string;
  totalVagas: number;
  livres: number;
  reservadas: number;
  ocupadas: number;
  vagas: VagaStatus[];
}

export interface Indicadores {
  ocupacaoPercent: number;
  vagasTotal: number;
  vagasOcupadas: number;
  vagasReservadas: number;
  reservasHoje: number;
  receitaHojeCents: number;
  dispositivosOnline: number;
  dispositivosTotal: number;
  reservasPendentesHoje: number;
}

export interface Dispositivo {
  id: string;
  parkingLotId: string | null;
  online: boolean;
  lastSeen: string | null;
  estadoReportado: string | null;
  firmware: string | null;
}

export interface Alerta {
  tipo: 'DISPOSITIVO' | 'OPERACIONAL' | 'PAGAMENTO';
  texto: string;
  quando: string | null;
  reservaId: string | null;
}

export interface AdminOverview {
  indicadores: Indicadores;
  unidades: Unidade[];
  dispositivos: Dispositivo[];
  alertas: Alerta[];
}

export interface AdminReservation {
  id: string;
  userEmail: string | null;
  parkingLotId: string;
  spaceLabel: string;
  arrivalExpected: string;
  departureExpected: string;
  status: string;
  priceEstimateCents: number;
  createdAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly auth = inject(AuthService);

  overview(): Promise<AdminOverview> {
    return this.get('/api/admin/overview');
  }

  reservations(lotId: string, status: string): Promise<AdminReservation[]> {
    const params = new URLSearchParams();
    if (lotId) params.set('lotId', lotId);
    if (status) params.set('status', status);
    const query = params.toString();
    return this.get(`/api/admin/reservations${query ? '?' + query : ''}`);
  }

  private async get<T>(caminho: string): Promise<T> {
    const token = await this.auth.token();
    let response: Response;
    try {
      response = await fetch(API_BASE_URL + caminho, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      throw new ApiError('Sem conexão com o servidor. Verifique se o backend está rodando.', 0);
    }
    if (!response.ok) {
      let mensagem = `Erro ${response.status}`;
      try {
        const body = await response.json();
        if (body?.message) mensagem = body.message;
      } catch {
        // resposta sem corpo
      }
      throw new ApiError(mensagem, response.status);
    }
    return response.json() as Promise<T>;
  }
}
