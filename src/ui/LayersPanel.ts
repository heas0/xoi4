import { MapRenderer } from '../rendering/MapRenderer';

/**
 * Панель управления отображением слоев карты (Чанки, Регионы, Государства)
 */
export class LayersPanel {
  private container: HTMLDivElement;

  constructor(private renderer: MapRenderer) {
    this.container = document.createElement('div');
    this.container.className = 'layers-panel';
    
    this.container.innerHTML = `
      <div class="layers-header">Отображение</div>
      <button id="toggleChunks" class="layer-btn ${this.renderer.showChunkGrid ? 'active' : ''}">Чанки</button>
      <button id="toggleRegions" class="layer-btn ${this.renderer.showRegionGrid ? 'active' : ''}">Регионы</button>
      <button id="toggleStates" class="layer-btn ${this.renderer.showStates ? 'active' : ''}">Государства</button>
      <button id="toggleLabels" class="layer-btn ${this.renderer.showLabels ? 'active' : ''}">Подписи</button>
    `;
    
    document.body.appendChild(this.container);
    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const chunkBtn = this.container.querySelector('#toggleChunks') as HTMLButtonElement;
    const regionBtn = this.container.querySelector('#toggleRegions') as HTMLButtonElement;
    const statesBtn = this.container.querySelector('#toggleStates') as HTMLButtonElement;
    const labelsBtn = this.container.querySelector('#toggleLabels') as HTMLButtonElement;

    chunkBtn.addEventListener('click', () => {
      const active = !this.renderer.showChunkGrid;
      this.renderer.setShowChunkGrid(active);
      chunkBtn.classList.toggle('active', active);
    });

    regionBtn.addEventListener('click', () => {
      const active = !this.renderer.showRegionGrid;
      this.renderer.setShowRegionGrid(active);
      regionBtn.classList.toggle('active', active);
    });

    statesBtn.addEventListener('click', () => {
      const active = !this.renderer.showStates;
      this.renderer.setShowStates(active);
      statesBtn.classList.toggle('active', active);
    });

    labelsBtn.addEventListener('click', () => {
      const active = !this.renderer.showLabels;
      this.renderer.setShowLabels(active);
      labelsBtn.classList.toggle('active', active);
    });
  }
}
