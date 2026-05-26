/**
 * Конфигурация вьюпорта
 */
export interface ViewportConfig {
  canvas: HTMLCanvasElement;
  initialOffsetX?: number;
  initialOffsetY?: number;
  initialZoom?: number;
  minZoom?: number;
  maxZoom?: number;
}

/**
 * Класс для управления вьюпортом (камерой)
 */
export class Viewport {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  private _offsetX: number;
  private _offsetY: number;
  private _zoom: number;
  
  private minZoom: number;
  private maxZoom: number;
  
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  constructor(config: ViewportConfig) {
    this.canvas = config.canvas;
    this.ctx = this.canvas.getContext('2d')!;
    
    this._offsetX = config.initialOffsetX ?? 0;
    this._offsetY = config.initialOffsetY ?? 0;
    this._zoom = config.initialZoom ?? 1;
    this.minZoom = config.minZoom ?? 0.01;
    this.maxZoom = config.maxZoom ?? 50;
    
    this.setupEventListeners();
  }

  get offsetX(): number { return this._offsetX; }
  get offsetY(): number { return this._offsetY; }
  get zoom(): number { return this._zoom; }
  get context(): CanvasRenderingContext2D { return this.ctx; }

  setView(offsetX: number, offsetY: number, zoom: number): void {
    this._zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    this._offsetX = offsetX;
    this._offsetY = offsetY;
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.isDragging) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      
      this._offsetX += dx;
      this._offsetY += dy;
      
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    }
  }

  private onMouseUp(): void {
    this.isDragging = false;
    this.canvas.style.cursor = 'default';
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this._zoom * zoomFactor));
    
    const worldX = (mouseX - this._offsetX) / this._zoom;
    const worldY = (mouseY - this._offsetY) / this._zoom;
    
    this._zoom = newZoom;
    
    this._offsetX = mouseX - worldX * this._zoom;
    this._offsetY = mouseY - worldY * this._zoom;
  }

  /**
   * Преобразовать экранные координаты в мировые
   */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (screenX - rect.left - this._offsetX) / this._zoom,
      y: (screenY - rect.top - this._offsetY) / this._zoom
    };
  }

  /**
   * Преобразовать мировые координаты в экранные
   */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: worldX * this._zoom + this._offsetX,
      y: worldY * this._zoom + this._offsetY
    };
  }

  /**
   * Применить трансформации к контексту
   */
  applyTransform(dpr = 1): void {
    // Учитываем devicePixelRatio, чтобы масштаб и смещения совпадали с CSS-пикселями
    this.ctx.setTransform(
      this._zoom * dpr,
      0,
      0,
      this._zoom * dpr,
      this._offsetX * dpr,
      this._offsetY * dpr
    );
  }

  /**
   * Сбросить трансформации контекста
   */
  resetTransform(dpr = 1): void {
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Получить видимую область в мировых координатах
   */
  getVisibleBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    const rect = this.canvas.getBoundingClientRect();
    const topLeft = this.screenToWorld(rect.left, rect.top);
    const bottomRight = this.screenToWorld(rect.right, rect.bottom);
    
    return {
      minX: topLeft.x,
      minY: topLeft.y,
      maxX: bottomRight.x,
      maxY: bottomRight.y
    };
  }
}
