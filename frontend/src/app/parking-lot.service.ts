import { Injectable } from '@angular/core';

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

@Injectable({ providedIn: 'root' })
export class ParkingLotService {
  private readonly baseUrl = 'http://localhost:8080';

  async list(): Promise<ParkingLot[]> {
    const response = await fetch(`${this.baseUrl}/api/parking-lots`);
    if (!response.ok) {
      throw new Error(`Erro ${response.status}`);
    }
    return response.json();
  }

  async createReservation(
    parkingLotId: string,
    arrivalExpected: string,
    departureExpected: string,
  ): Promise<Reservation> {
    const response = await fetch(`${this.baseUrl}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parkingLotId, arrivalExpected, departureExpected }),
    });
    if (!response.ok) {
      throw new Error(await this.mensagemErro(response));
    }
    return response.json();
  }

  async checkout(reservationId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/reservations/${reservationId}/checkout`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(await this.mensagemErro(response));
    }
    const body = await response.json();
    return body.checkoutUrl;
  }

  async getReservation(reservationId: string): Promise<Reservation> {
    const response = await fetch(`${this.baseUrl}/api/reservations/${reservationId}`);
    if (!response.ok) {
      throw new Error(await this.mensagemErro(response));
    }
    return response.json();
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
