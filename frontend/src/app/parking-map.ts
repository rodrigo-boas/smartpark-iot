import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import * as L from 'leaflet';
import { Availability, ParkingLot, ParkingLotService, Reservation } from './parking-lot.service';

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
    <div class="layout">
      <aside class="panel">
        <h2>Reservar vaga</h2>

        <label>Estacionamento
          <select (change)="selecionar($any($event.target).value)">
            <option value="">Selecione...</option>
            @for (lot of lots(); track lot.id) {
              <option [value]="lot.id">{{ lot.name }} ({{ lot.freeSpaces }}/{{ lot.totalSpaces }} livres agora)</option>
            }
          </select>
        </label>

        <label>Chegada <input type="datetime-local" #arr (change)="periodoMudou(arr.value, dep.value)" /></label>
        <label>Saída <input type="datetime-local" #dep (change)="periodoMudou(arr.value, dep.value)" /></label>

        @if (disponibilidade(); as d) {
          <p class="disp" [class.lotado]="d.freeSpaces === 0">
            Vagas livres nesse horário: <strong>{{ d.freeSpaces }} de {{ d.totalSpaces }}</strong>
          </p>
        }

        <button (click)="reservar()" [disabled]="ocupado()">Reservar</button>

        @if (mensagem()) {
          <p class="msg">{{ mensagem() }}</p>
        }

        @if (reserva(); as r) {
          <div class="resumo">
            <p><strong>Vaga {{ r.spaceLabel }}</strong></p>
            <p>Estimativa: {{ preco(r.priceEstimateCents) }}</p>
            <p>Status: <strong>{{ r.status }}</strong></p>
            <p>Código: <code>{{ r.id }}</code></p>
            @if (r.status === 'PENDING_PAYMENT') {
              <button (click)="pagar()" [disabled]="ocupado()">Pagar</button>
            }
          </div>
        }
      </aside>
      <div #mapEl class="map"></div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; font-family: sans-serif; }
    .top { padding: 8px 16px; background: #0f172a; color: white; }
    h1 { margin: 0; font-size: 20px; }
    .layout { display: grid; grid-template-columns: 300px 1fr; height: calc(100vh - 48px); }
    .panel { padding: 12px 16px; overflow-y: auto; background: #f8fafc; }
    .panel label { display: block; margin-bottom: 10px; font-size: 14px; }
    .panel select, .panel input { display: block; width: 100%; padding: 6px; margin-top: 4px; box-sizing: border-box; }
    .panel button { padding: 8px 14px; cursor: pointer; }
    .msg { color: #b91c1c; font-size: 14px; }
    .disp { font-size: 14px; color: #166534; }
    .disp.lotado { color: #b91c1c; }
    .resumo { margin-top: 12px; padding: 10px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px; }
    .resumo p { margin: 4px 0; }
    code { word-break: break-all; }
    .map { height: 100%; }
  `],
})
export class ParkingMap implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  private readonly service = inject(ParkingLotService);
  private map!: L.Map;
  private readonly markers = new Map<string, L.Marker>();
  private timer?: ReturnType<typeof setInterval>;

  readonly lots = signal<ParkingLot[]>([]);
  readonly selectedId = signal('');
  readonly chegada = signal('');
  readonly saida = signal('');
  readonly disponibilidade = signal<Availability | null>(null);
  readonly reserva = signal<Reservation | null>(null);
  readonly mensagem = signal('');
  readonly ocupado = signal(false);

  async ngAfterViewInit() {
    this.map = L.map(this.mapEl.nativeElement).setView([-12.2664, -38.9663], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    await this.carregar(true);
  }

  ngOnDestroy() {
    this.pararPolling();
  }

  private async carregar(ajustarZoom: boolean) {
    try {
      const lots = await this.service.list();
      this.lots.set(lots);

      this.markers.forEach((m) => m.remove());
      this.markers.clear();

      const bounds = L.latLngBounds([]);
      for (const lot of lots) {
        const marker = L.marker([lot.latitude, lot.longitude], { icon: markerIcon })
          .addTo(this.map)
          .bindPopup(this.popupHtml(lot));
        this.markers.set(lot.id, marker);
        bounds.extend([lot.latitude, lot.longitude]);
      }
      if (ajustarZoom && lots.length > 0) {
        this.map.fitBounds(bounds, { padding: [50, 50] });
      }
    } catch {
      this.mensagem.set('Não foi possível carregar os estacionamentos.');
    }
  }

  async selecionar(id: string) {
    this.mensagem.set('');
    this.selectedId.set(id);
    const lot = this.lots().find((l) => l.id === id);
    if (lot) {
      this.map.flyTo([lot.latitude, lot.longitude], 16);
      this.markers.get(id)?.openPopup();
    }
    await this.atualizarDisponibilidade();
  }

  async periodoMudou(chegada: string, saida: string) {
    this.mensagem.set('');
    this.chegada.set(chegada);
    this.saida.set(saida);
    await this.atualizarDisponibilidade();
  }

  private async atualizarDisponibilidade() {
    const id = this.selectedId();
    const chegada = this.chegada();
    const saida = this.saida();
    if (!id || !chegada || !saida) {
      this.disponibilidade.set(null);
      return;
    }
    try {
      const d = await this.service.availability(
        id,
        new Date(chegada).toISOString(),
        new Date(saida).toISOString(),
      );
      this.disponibilidade.set(d);
    } catch (e) {
      this.disponibilidade.set(null);
      this.mensagem.set(e instanceof Error ? e.message : 'Erro ao consultar disponibilidade.');
    }
  }

  async reservar() {
    this.mensagem.set('');
    const chegada = this.chegada();
    const saida = this.saida();
    if (!this.selectedId()) {
      this.mensagem.set('Escolha um estacionamento.');
      return;
    }
    if (!chegada || !saida) {
      this.mensagem.set('Informe a chegada e a saída.');
      return;
    }
    this.ocupado.set(true);
    try {
      const r = await this.service.createReservation(
        this.selectedId(),
        new Date(chegada).toISOString(),
        new Date(saida).toISOString(),
      );
      this.reserva.set(r);
    } catch (e) {
      this.mensagem.set(e instanceof Error ? e.message : 'Erro ao reservar.');
    } finally {
      this.ocupado.set(false);
      await this.carregar(false);
      await this.atualizarDisponibilidade();
    }
  }

  async pagar() {
    const r = this.reserva();
    if (!r) {
      return;
    }
    this.mensagem.set('');
    this.ocupado.set(true);
    const janela = window.open('', '_blank');
    try {
      const url = await this.service.checkout(r.id);
      if (janela) {
        janela.location.href = url;
      } else {
        window.location.href = url;
      }
      this.iniciarPolling(r.id);
    } catch (e) {
      janela?.close();
      this.mensagem.set(e instanceof Error ? e.message : 'Erro ao criar o checkout.');
    } finally {
      this.ocupado.set(false);
    }
  }

  private iniciarPolling(id: string) {
    this.pararPolling();
    let tentativas = 0;
    this.timer = setInterval(async () => {
      tentativas++;
      try {
        const atual = await this.service.getReservation(id);
        this.reserva.set(atual);
        if (atual.status !== 'PENDING_PAYMENT' || tentativas > 150) {
          this.pararPolling();
          await this.carregar(false);
          await this.atualizarDisponibilidade();
        }
      } catch {
        this.pararPolling();
      }
    }, 4000);
  }

  private pararPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  preco(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private popupHtml(lot: ParkingLot): string {
    return `
      <strong>${escapeHtml(lot.name)}</strong><br>
      ${escapeHtml(lot.address)}<br>
      Tarifa: ${this.preco(lot.hourlyRateCents)} por hora<br>
      Horário: ${escapeHtml(lot.openTime)} às ${escapeHtml(lot.closeTime)}<br>
      Vagas livres agora: ${lot.freeSpaces} de ${lot.totalSpaces}
    `;
  }
}
