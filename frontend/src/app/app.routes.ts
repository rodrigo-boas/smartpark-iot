import { Routes } from '@angular/router';
import { ParkingMap } from './parking-map';
import { ReservationDetail } from './reservation-detail';
import { Entrar } from './entrar';
import { MinhasReservas } from './minhas-reservas';
import { exigeLogin } from './auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'mapa' },
  { path: 'mapa', component: ParkingMap, title: 'Mapa · SmartPark IoT' },
  { path: 'entrar', component: Entrar, title: 'Entrar · SmartPark IoT' },
  {
    path: 'minhas-reservas',
    component: MinhasReservas,
    canActivate: [exigeLogin],
    title: 'Minhas reservas · SmartPark IoT',
  },
  {
    path: 'reservas/:id',
    component: ReservationDetail,
    canActivate: [exigeLogin],
    title: 'Reserva · SmartPark IoT',
  },
  { path: '**', redirectTo: 'mapa' },
];
