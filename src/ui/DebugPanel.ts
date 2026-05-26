import { HexGridService, RegionService } from '../core/services';

export class DebugPanel {
  private container: HTMLDivElement;
  private fpsElement: HTMLSpanElement;
  private hexSizeElement: HTMLSpanElement;
  private hexCountElement: HTMLSpanElement;
  private regionCountElement: HTMLSpanElement;
  private worldSizeElement: HTMLSpanElement;

  private frames = 0;
  private lastTime = performance.now();
  private fps = 0;

  constructor(
    private hexGrid: HexGridService,
    private regionService: RegionService,
    private mapImage: HTMLImageElement
  ) {
    this.container = document.createElement('div');
    this.container.className = 'debug-panel';
    
    this.container.innerHTML = `
      <div class="debug-row"><span>FPS</span> <span id="debug-fps">0</span></div>
      <div class="debug-row"><span>Размер гекса</span> <span id="debug-hex-size">0</span></div>
      <div class="debug-row"><span>Гексы</span> <span id="debug-hexes">0</span></div>
      <div class="debug-row"><span>Регионы</span> <span id="debug-regions">0</span></div>
      <div class="debug-row"><span>Размер мира</span> <span id="debug-size">0x0</span></div>
    `;
    
    document.body.appendChild(this.container);
    
    this.fpsElement = this.container.querySelector('#debug-fps')!;
    this.hexSizeElement = this.container.querySelector('#debug-hex-size')!;
    this.hexCountElement = this.container.querySelector('#debug-hexes')!;
    this.regionCountElement = this.container.querySelector('#debug-regions')!;
    this.worldSizeElement = this.container.querySelector('#debug-size')!;
    
    this.loop();
    
    // Периодическое обновление статистики (чтобы не пересчитывать каждый кадр)
    setInterval(() => this.updateStats(), 1000);
    this.updateStats();
  }

  private updateStats() {
    this.hexSizeElement.textContent = this.hexGrid.hexSize.toString();
    this.hexCountElement.textContent = this.hexGrid.cellCount.toLocaleString();
    this.regionCountElement.textContent = this.regionService.getAllRegions().length.toString();
    this.worldSizeElement.textContent = `${this.mapImage.width}x${this.mapImage.height}`;
  }

  private loop = () => {
    this.frames++;
    const now = performance.now();
    if (now - this.lastTime >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.lastTime));
      this.frames = 0;
      this.lastTime = now;
      this.fpsElement.textContent = this.fps.toString();
    }
    requestAnimationFrame(this.loop);
  }
}
