import { Routes } from '@angular/router';
import { ParkingMap } from './parking-map';
import { ReservationDetail } from './reservation-detail';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'mapa' },
  { path: 'mapa', component: ParkingMap, title: 'Mapa · SmartPark IoT' },
  {
    path: 'reservas/:id',
    component: ReservationDetail,
    title: 'Reserva · SmartPark IoT',
  },
  { path: '**', redirectTo: 'mapa' },
];
