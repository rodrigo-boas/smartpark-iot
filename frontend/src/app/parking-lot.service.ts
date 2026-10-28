import { Injectable } from '@angular/core';
import { API_BASE_URL } from './config';

export interface ParkingLot {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  hourlyRateCents: number;
  openTime: string;
  closeTime: string;
  totalSpaces: number;
  freeSpaces: number;
}

export interface Availability {
  parkingLotId: string;
  from: string;
  to: string;
  totalSpaces: number;
  freeSpaces: number;
}

export interface SpaceOption {
  id: string;
  label: string;
  available: boolean;
}

export interface SpacesResult {
  parkingLotId: string;
  from: string;
  to: string;
  priceEstimateCents: number;
  spaces: SpaceOption[];
}

export interface Reservation {
  id: string;
  status: string;
  parkingLotId: string;
  spaceLabel: string;
  arrivalExpected: string;
  departureExpected: string;
  priceEstimateCents: number;
  expiresAt: string;
}

/** Erro da API com o código HTTP, para tratar casos como 409 (vaga já reservada). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

@Injectable({ providedIn: 'root' })
export class ParkingLotService {
  private readonly baseUrl = API_BASE_URL;

  async list(): Promise<ParkingLot[]> {
    return this.requisitar(`${this.baseUrl}/api/parking-lots`);
  }

  async availability(parkingLotId: string, from: string, to: string): Promise<Availability> {
    const params = new URLSearchParams({ from, to });
    return this.requisitar(
      `${this.baseUrl}/api/parking-lots/${encodeURIComponent(parkingLotId)}/availability?${params}`,
    );
  }

  async spaces(parkingLotId: string, from: string, to: string): Promise<SpacesResult> {
    const params = new URLSearchParams({ from, to });
    return this.requisitar(
      `${this.baseUrl}/api/parking-lots/${encodeURIComponent(parkingLotId)}/spaces?${params}`,
    );
  }

  async createReservation(
    parkingLotId: string,
    arrivalExpected: string,
    departureExpected: string,
    spaceId?: string,
  ): Promise<Reservation> {
    return this.requisitar(`${this.baseUrl}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parkingLotId, arrivalExpected, departureExpected, spaceId }),
    });
  }

  async checkout(reservationId: string): Promise<string> {
    const body = await this.requisitar<{ checkoutUrl: string }>(
      `${this.baseUrl}/api/reservations/${encodeURIComponent(reservationId)}/checkout`,
      { method: 'POST' },
    );
    return body.checkoutUrl;
  }

  async getReservation(reservationId: string): Promise<Reservation> {
    return this.requisitar(
      `${this.baseUrl}/api/reservations/${encodeURIComponent(reservationId)}`,
    );
  }

  private async requisitar<T>(url: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      throw new ApiError('Sem conexão com o servidor. Verifique se o backend está rodando.', 0);
    }
    if (!response.ok) {
      throw new ApiError(await this.mensagemErro(response), response.status);
    }
    return response.json() as Promise<T>;
  }

  private async mensagemErro(response: Response): Promise<string> {
    try {
      const body = await response.json();
      return body.message || `Erro ${response.status}`;
    } catch {
      return `Erro ${response.status}`;
    }
  }
}
