import { Routes } from '@angular/router';
import { ParkingMap } from './parking-map';
import { ReservationDetail } from './reservation-detail';
import { EmBreve } from './em-breve';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'mapa' },
  { path: 'mapa', component: ParkingMap, title: 'Mapa · SmartPark IoT' },
  { path: 'reservas/:id', component: ReservationDetail, title: 'Reserva · SmartPark IoT' },
  {
    path: 'minhas-reservas',
    component: EmBreve,
    title: 'Minhas reservas · SmartPark IoT',
    data: { titulo: 'Minhas reservas' },
  },
  {
    path: 'admin',
    component: EmBreve,
    title: 'Painel admin · SmartPark IoT',
    data: { titulo: 'Painel admin' },
  },
  { path: '**', redirectTo: 'mapa' },
];
