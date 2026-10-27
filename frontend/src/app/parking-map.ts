import { AfterViewInit, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import * as L from 'leaflet';
import { ParkingLot, ParkingLotService } from './parking-lot.service';

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images';

const markerIcon = L.icon({
  iconUrl: `${CDN}/marker-icon.png`,
  iconRetinaUrl: `${CDN}/marker-icon-2x.png`,
  shadowUrl: `${CDN}/marker-shadow.png`,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

@Component({
  selector: 'app-parking-map',
  template: `
    <header class="top"><h1>SmartPark IoT</h1></header>
    @if (erro()) {
      <p class="erro">{{ erro() }}</p>
    }
    <div #mapEl class="map"></div>
  `,
  styles: [`
    :host { display: block; height: 100vh; }
    .top { padding: 8px 16px; background: #0f172a; color: white; }
    h1 { margin: 0; font-size: 20px; }
    .map { height: calc(100vh - 48px); }
    .erro { color: #b91c1c; padding: 8px 16px; margin: 0; }
  `],
})
export class ParkingMap implements AfterViewInit {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  private readonly service = inject(ParkingLotService);
  readonly erro = signal('');

  async ngAfterViewInit() {
    const map = L.map(this.mapEl.nativeElement).setView([-12.2664, -38.9663], 13);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    try {
      const lots = await this.service.list();
      const bounds = L.latLngBounds([]);

      for (const lot of lots) {
        L.marker([lot.latitude, lot.longitude], { icon: markerIcon })
          .addTo(map)
          .bindPopup(this.popupHtml(lot));
        bounds.extend([lot.latitude, lot.longitude]);
      }

      if (lots.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    } catch {
      this.erro.set('Não foi possível carregar os estacionamentos.');
    }
  }

  private popupHtml(lot: ParkingLot): string {
    const price = (lot.hourlyRateCents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    return `
      <strong>${escapeHtml(lot.name)}</strong><br>
      ${escapeHtml(lot.address)}<br>
      Tarifa: ${price} por hora<br>
      Horário: ${escapeHtml(lot.openTime)} às ${escapeHtml(lot.closeTime)}<br>
      Vagas livres: ${lot.freeSpaces} de ${lot.totalSpaces}
    `;
  }
}
