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
}
