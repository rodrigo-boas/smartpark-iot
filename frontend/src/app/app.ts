import { Component } from '@angular/core';
import { ParkingMap } from './parking-map';

@Component({
  selector: 'app-root',
  imports: [ParkingMap],
  template: '<app-parking-map />',
})
export class App {}
