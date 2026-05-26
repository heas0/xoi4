import { Viewport } from './Viewport';
import { RegionService } from '../core/services/RegionService';
import { GroupService } from '../core/services/GroupService';
import { Region } from '../core/models/Region';
import { HexCell } from '../core/models/HexCell';

export interface RendererConfig {
  canvas: HTMLCanvasElement;
  mapImage: HTMLImageElement;
  regionService: RegionService;
  groupService: GroupService;
}

/**
 * Рендерер карты с регионами
 * Оптимизации:
 * - Offscreen canvas для кэширования карты
 * - Dirty flag для перерисовки только при изменениях
 * - Culling невидимых регионов
 */
export class MapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private viewport: Viewport;
  private mapImage: HTMLImageElement;
  private dpr = window.devicePixelRatio || 1;
  
  private regionService: RegionService;
  private groupService: GroupService;
  

  
  private hoveredRegion: Region | null = null;
  private hoveredCell: HexCell | null = null;
  private animationFrameId: number | null = null;
  private userInteracted = false;
  
  public showChunkGrid = false;
  public showRegionGrid = true;
  public showStates = true;
  public showLabels = true;

  setShowChunkGrid(value: boolean): void {
    this.showChunkGrid = value;
    this.needsRedraw = true;
  }

  setShowRegionGrid(value: boolean): void {
    this.showRegionGrid = value;
    this.needsRedraw = true;
  }

  setShowStates(value: boolean): void {
    this.showStates = value;
    this.needsRedraw = true;
  }

  setShowLabels(value: boolean): void {
    this.showLabels = value;
    this.needsRedraw = true;
  }
  // Optimization: dirty flag
  public needsRedraw = true;
  private lastViewState = { offsetX: 0, offsetY: 0, zoom: 0 };
  
  // Optimization: cached boundaries
  private boundaryCache = new Map<string, { x: number; y: number }[][]>();
  private boundaryCacheValid = false;

  constructor(config: RendererConfig) {
    this.canvas = config.canvas;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.mapImage = config.mapImage;
    this.regionService = config.regionService;
    this.groupService = config.groupService;
    
    this.viewport = new Viewport({
      canvas: this.canvas,
      initialOffsetX: 0,
      initialOffsetY: 0,
      initialZoom: 1,
      minZoom: 0.001,
      maxZoom: 50
    });
    
    // Listen for region changes to invalidate cache
    this.regionService.on('regionGroupChanged', () => this.invalidateCache());
    this.regionService.on('regionsGenerated', () => this.invalidateCache());
    
    this.setupResize();
    this.fitViewportToMap(true);
  }

  get viewportInstance(): Viewport {
    return this.viewport;
  }
  
  private invalidateCache(): void {
    this.boundaryCacheValid = false;
    this.boundaryCache.clear();
    this.needsRedraw = true;
  }

  private setupResize(): void {
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      this.dpr = window.devicePixelRatio || 1;
      
      this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
      this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
      
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.fitViewportToMap(false);
      this.needsRedraw = true;
    };
    
    window.addEventListener('resize', resize);
    const observer = new ResizeObserver(resize);
    observer.observe(this.canvas);
    
    resize();
  }

  setHoveredRegion(region: Region | null): void {
    if (this.hoveredRegion !== region) {
      this.hoveredRegion = region;
      this.needsRedraw = true;
    }
  }

  setHoveredCell(cell: HexCell | null): void {
    if (this.hoveredCell !== cell) {
      this.hoveredCell = cell;
      this.needsRedraw = true;
    }
  }

  start(): void {
    const render = () => {
      this.renderIfNeeded();
      this.animationFrameId = requestAnimationFrame(render);
    };
    render();
  }

  recenter(): void {
    this.userInteracted = false;
    this.fitViewportToMap(true);
    this.needsRedraw = true;
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private renderIfNeeded(): void {
    const cursorsMoved = this.updateRemoteCursors();
    if (cursorsMoved) {
      this.needsRedraw = true;
    }

    // Check if viewport changed
    const v = this.viewport;
    if (v.offsetX !== this.lastViewState.offsetX ||
        v.offsetY !== this.lastViewState.offsetY ||
        v.zoom !== this.lastViewState.zoom) {
      this.needsRedraw = true;
      this.lastViewState = { offsetX: v.offsetX, offsetY: v.offsetY, zoom: v.zoom };
    }
    
    if (!this.needsRedraw) return;
    this.needsRedraw = false;
    
    this.render();
  }

  private render(): void {
    const ctx = this.ctx;
    
    // Clear with solid color (faster than clearRect for alpha: false)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Apply viewport transform
    this.viewport.applyTransform(this.dpr);
    
    // Draw map image
    ctx.drawImage(this.mapImage, 0, 0);
    
    // Draw regions
    this.renderRegions();
    
    // Draw hovered cell chunks & hovered cell boundary
    if (this.hoveredCell) {
      this.renderCellChunks(this.hoveredCell, this.viewport.zoom);
      this.renderHoveredCell(this.hoveredCell, this.viewport.zoom);
    }
    
    // Draw chunk grid
    if (this.showChunkGrid) {
      this.renderChunkGrid();
    }
    
    // Reset transform
    this.viewport.resetTransform(this.dpr);
    
    // Draw Google Maps style labels (drawn in screen space for pixel perfect sharpness)
    this.renderStateLabels();

    // Draw remote players' cursors in screen space
    this.renderRemoteCursors();
  }

  private renderChunkGrid(): void {
    const ctx = this.ctx;
    const zoom = this.viewport.zoom;
    
    // Get visible bounds
    const vBounds = this.viewport.getVisibleBounds();
    const viewBounds = {
      minX: vBounds.minX,
      minZ: vBounds.minY,
      maxX: vBounds.maxX,
      maxZ: vBounds.maxY
    };
    
    // Step is exactly 16 units in world coordinates
    const startX = Math.max(0, Math.floor(viewBounds.minX / 16) * 16);
    const endX = Math.min(this.mapImage.width, Math.ceil(viewBounds.maxX / 16) * 16);
    const startY = Math.max(0, Math.floor(viewBounds.minZ / 16) * 16);
    const endY = Math.min(this.mapImage.height, Math.ceil(viewBounds.maxZ / 16) * 16);
    
    // Draw grid lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)'; // High quality semi-transparent theme slate
    ctx.lineWidth = Math.max(0.5, 1 / zoom);
    
    ctx.beginPath();
    // Vertical lines
    for (let x = startX; x <= endX; x += 16) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    // Horizontal lines
    for (let y = startY; y <= endY; y += 16) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
    
    // Draw chunk labels and coordinates when zoomed in
    if (zoom >= 0.8) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.font = `${Math.max(4, 9 / zoom)}px monospace`;
      
      const chunkStartX = Math.floor(startX / 16);
      const chunkEndX = Math.floor(endX / 16);
      const chunkStartY = Math.floor(startY / 16);
      const chunkEndY = Math.floor(endY / 16);
      
      for (let cx = chunkStartX; cx < chunkEndX; cx++) {
        for (let cy = chunkStartY; cy < chunkEndY; cy++) {
          const x0 = cx * 16;
          const y0 = cy * 16;
          // Render chunk coordinates in top-left corner
          ctx.fillText(`${cx},${cy}`, x0 + 1.5, y0 + 10 / zoom);
        }
      }
    }
  }

  private fitViewportToMap(force = false): void {
    if (!this.mapImage) return;
    if (this.userInteracted && !force) return;

    // Use CSS pixel dimensions, not DPR-scaled canvas dimensions
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width === 0 || height === 0) return;

    const zoom = Math.min(width / this.mapImage.width, height / this.mapImage.height) * 0.9;
    const offsetX = (width - this.mapImage.width * zoom) / 2;
    const offsetY = (height - this.mapImage.height * zoom) / 2;
    this.viewport.setView(offsetX, offsetY, zoom);
  }

  private renderRegions(): void {
    const regions = this.regionService.getAllRegions();
    if (regions.length === 0) return;
    
    const zoom = this.viewport.zoom;
    const ctx = this.ctx;
    
    // Calculate viewport bounds in world coordinates
    const vBounds = this.viewport.getVisibleBounds();
    const viewBounds = {
      minX: vBounds.minX,
      minZ: vBounds.minY,
      maxX: vBounds.maxX,
      maxZ: vBounds.maxY
    };
    
    // Rebuild boundary cache if invalidated
    if (!this.boundaryCacheValid) {
      this.boundaryCache.clear();
      
      // Group regions by groupId
      const regionsByGroup = new Map<string, Region[]>();
      for (const region of regions) {
        const groupId = region.groupId ?? 'none';
        if (!regionsByGroup.has(groupId)) {
          regionsByGroup.set(groupId, []);
        }
        regionsByGroup.get(groupId)!.push(region);
      }
      
      // Cache boundaries for each group
      for (const groupId of regionsByGroup.keys()) {
        const boundaries = this.regionService.calculateGroupBoundary(groupId);
        this.boundaryCache.set(groupId, boundaries);
      }
      
      this.boundaryCacheValid = true;
    }
    
    // Filter visible regions
    const visibleRegions = regions.filter(r => 
      r.boundingBox.maxX >= viewBounds.minX &&
      r.boundingBox.minX <= viewBounds.maxX &&
      r.boundingBox.maxZ >= viewBounds.minZ &&
      r.boundingBox.minZ <= viewBounds.maxZ
    );
    
    // Collect visible groups
    const visibleGroups = new Set<string>();
    for (const region of visibleRegions) {
      visibleGroups.add(region.groupId);
    }
    
    // 1. Render group fills (only for visible groups)
    if (this.showStates) {
      for (const groupId of visibleGroups) {
        if (groupId === 'none') continue; // Do not draw any fill for unassigned regions
        
        const boundaries = this.boundaryCache.get(groupId);
        if (!boundaries) continue;

        const color = this.groupService.getGroupColor(groupId);
        const alpha = 0.45;
        
        for (const boundary of boundaries) {
          if (boundary.length > 2) {
            ctx.beginPath();
            ctx.moveTo(boundary[0].x, boundary[0].y);
            for (let i = 1; i < boundary.length; i++) {
              ctx.lineTo(boundary[i].x, boundary[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = this.hexToRgba(color, alpha);
            ctx.fill();
          }
        }
      }
    }

    // 2. Render individual region boundaries - subtle, thin, and dynamically faded with zoom
    if (this.showRegionGrid) {
      // Calculate dynamic opacity based on zoom (fades out when zooming out to keep the map clean)
      let borderAlpha = 0.15;
      if (zoom < 0.4) {
        borderAlpha = 0.15 * Math.max(0, (zoom - 0.1) / 0.3); // Fully transparent at zoom <= 0.1
      }

      ctx.strokeStyle = `rgba(15, 23, 42, ${borderAlpha})`;
      ctx.lineWidth = Math.max(0.5, 1.2 / zoom); // Crisp 1.2px line on screen
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (borderAlpha > 0.005) {
        for (const region of visibleRegions) {
          for (const boundary of region.boundary) {
            if (boundary.length < 3) continue;
            ctx.beginPath();
            ctx.moveTo(boundary[0].x, boundary[0].y);
            for (let i = 1; i < boundary.length; i++) {
              ctx.lineTo(boundary[i].x, boundary[i].y);
            }
            ctx.closePath();
            ctx.stroke();
          }
        }
      }
    }

    // 3. Render country (group) outlines - elegant colored borders matching the faction colors
    if (this.showStates) {
      for (const groupId of visibleGroups) {
        if (groupId === 'none') continue;
        const boundaries = this.boundaryCache.get(groupId);
        if (!boundaries) continue;
        
        const color = this.groupService.getGroupColor(groupId);
        ctx.strokeStyle = this.hexToRgba(color, 0.65); // High quality semi-transparent colored stroke
        ctx.lineWidth = Math.max(1.0, 2.0 / zoom); // Clean 2px border on screen
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        for (const boundary of boundaries) {
          if (boundary.length > 2) {
            ctx.beginPath();
            ctx.moveTo(boundary[0].x, boundary[0].y);
            for (let i = 1; i < boundary.length; i++) {
              ctx.lineTo(boundary[i].x, boundary[i].y);
            }
            ctx.closePath();
            ctx.stroke();
          }
        }
      }
    }


    // Render hovered region
    if (this.hoveredRegion) {
      this.renderHoveredRegion(this.hoveredRegion, zoom);
    }
  }

  private renderHoveredRegion(region: Region, zoom: number): void {
    const boundaries = region.boundary;
    const ctx = this.ctx;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = Math.max(2, 4 / zoom);
    
    for (const boundary of boundaries) {
      if (boundary.length < 3) continue;
      
      ctx.beginPath();
      ctx.moveTo(boundary[0].x, boundary[0].y);
      for (let i = 1; i < boundary.length; i++) {
        ctx.lineTo(boundary[i].x, boundary[i].y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  private renderCellChunks(cell: HexCell, zoom: number): void {
    const chunks = this.regionService.hexGrid.getChunksForCell(cell.q, cell.r);
    if (chunks.length === 0) return;
    
    const ctx = this.ctx;
    
    ctx.strokeStyle = '#818cf8'; // Premium Indigo border for chunks
    ctx.lineWidth = Math.max(1.5, 3 / zoom);
    ctx.fillStyle = 'rgba(129, 140, 248, 0.2)'; // Premium Indigo translucent fill
    
    for (const chunk of chunks) {
      // Find the cell containing the chunk's center
      const chunkCell = this.regionService.hexGrid.getCellAtWorld(chunk.cx * 16 + 8, chunk.cz * 16 + 8);
      const chunkRegion = chunkCell ? this.regionService.getRegionByCell(chunkCell.q, chunkCell.r) : undefined;
      
      // Skip highlighting chunks that are outside region boundaries
      if (!chunkRegion) {
        continue;
      }
      
      const x = chunk.cx * 16;
      const y = chunk.cz * 16;
      
      ctx.beginPath();
      ctx.rect(x, y, 16, 16);
      ctx.fill();
      ctx.stroke();
    }
  }

  private renderHoveredCell(cell: HexCell, zoom: number): void {
    const ctx = this.ctx;
    const vertices = this.regionService.hexGrid.getHexVertices(cell.worldX, cell.worldZ);
    if (vertices.length < 6) return;
    
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].z);
    for (let i = 1; i < vertices.length; i++) {
      ctx.lineTo(vertices[i].x, vertices[i].z);
    }
    ctx.closePath();
    
    // Fill with Premium Sky Blue translucent color
    ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.fill();
    
    // Stroke with Premium Sky Blue border
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = Math.max(2.5, 5 / zoom);
    ctx.stroke();
  }

  private getCountryMainCluster(groupRegions: any[]): HexCell[] {
    const cells: HexCell[] = [];
    const cellMap = new Map<string, HexCell>();
    for (const region of groupRegions) {
      for (const cell of region.cells) {
        cells.push(cell);
        cellMap.set(cell.key, cell);
      }
    }
    
    if (cells.length === 0) return [];
    
    const visited = new Set<string>();
    let mainCluster: HexCell[] = [];
    
    for (const cell of cells) {
      if (visited.has(cell.key)) continue;
      
      const queue: HexCell[] = [cell];
      const currentCluster: HexCell[] = [];
      visited.add(cell.key);
      
      while (queue.length > 0) {
        const curr = queue.shift()!;
        currentCluster.push(curr);
        
        const neighborCoords = curr.getNeighborCoords();
        for (const n of neighborCoords) {
          const nKey = `${n.q},${n.r}`;
          if (cellMap.has(nKey) && !visited.has(nKey)) {
            visited.add(nKey);
            const neighborCell = cellMap.get(nKey)!;
            queue.push(neighborCell);
          }
        }
      }
      
      if (currentCluster.length > mainCluster.length) {
        mainCluster = currentCluster;
      }
    }
    
    return mainCluster;
  }

  private renderStateLabels(): void {
    if (!this.showStates || !this.showLabels) return;
    
    const ctx = this.ctx;
    const zoom = this.viewport.zoom;
    const groups = this.groupService.getSelectableGroups();
    
    for (const group of groups) {
      const groupRegions = this.regionService.getRegionsByGroup(group.id);
      if (groupRegions.length === 0) continue;
      
      // Calculate total cell count for size-based filtering
      let totalCellCount = 0;
      for (const region of groupRegions) {
        totalCellCount += region.cells.length;
      }
      
      // Google Maps style dynamic fade-in thresholds based on size and zoom
      let minZoom = 0.15;
      let fullZoom = 0.35;
      
      if (totalCellCount >= 50) {
        minZoom = 0.01;
        fullZoom = 0.05;
      } else if (totalCellCount >= 15) {
        minZoom = 0.04;
        fullZoom = 0.12;
      } else if (totalCellCount >= 6) {
        minZoom = 0.08;
        fullZoom = 0.2;
      }
      
      let opacity = 0;
      if (zoom >= fullZoom) {
        opacity = 1.0;
      } else if (zoom > minZoom) {
        opacity = (zoom - minZoom) / (fullZoom - minZoom);
      }
      
      if (opacity <= 0.01) continue;
      
      // Determine label center: check if capital is set, otherwise use centroid of largest contiguous cluster
      let labelX = 0;
      let labelZ = 0;
      let hasCapital = false;
      
      if ((group as any).capitalRegionId) {
        const capRegion = this.regionService.getRegion((group as any).capitalRegionId);
        // Ensure capital region still belongs to this country
        if (capRegion && capRegion.groupId === group.id) {
          labelX = capRegion.center.x;
          labelZ = capRegion.center.z;
          hasCapital = true;
        }
      }
      
      if (!hasCapital) {
        // Fallback to the centroid of the largest contiguous cluster of land cells (resolves Alaska pulling USA into Canada!)
        const mainCluster = this.getCountryMainCluster(groupRegions);
        if (mainCluster.length === 0) continue;
        
        let sumX = 0;
        let sumZ = 0;
        for (const cell of mainCluster) {
          sumX += cell.worldX;
          sumZ += cell.worldZ;
        }
        labelX = sumX / mainCluster.length;
        labelZ = sumZ / mainCluster.length;
      }
      
      // Convert world coordinates to canvas screen coordinates
      const screenPos = this.viewport.worldToScreen(labelX, labelZ);
      
      // Base font size calculated logarithmically based on country size (cell count)
      const baseFontSize = Math.max(10, Math.min(22, Math.round(9 + 1.2 * Math.log2(totalCellCount))));
      
      // Organic scaling: scale the font size slightly based on the current zoom level (like Google Maps)
      const zoomScale = Math.pow(zoom, 0.25);
      const fontSize = Math.max(8, Math.min(26, Math.round(baseFontSize * zoomScale)));
      
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Apply visibility opacity to the context
      ctx.globalAlpha = opacity;
      
      // If capital is set, draw a beautiful gold star (★) with a white halo slightly above the name
      if (hasCapital) {
        ctx.font = `${fontSize + 3}px 'Roboto', sans-serif`;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.strokeText('★', screenPos.x, screenPos.y - 8);
        ctx.fillStyle = '#ffb74d'; // Capital star is Amber Gold
        ctx.fillText('★', screenPos.x, screenPos.y - 8);
      }
      
      // Apply clean spacious letter-spacing like Google Maps (Chrome/Firefox/Safari compatible)
      if ('letterSpacing' in ctx) {
        (ctx as any).letterSpacing = '1.8px';
      }
      
      // Use Roboto font with medium/semi-bold weight (500)
      ctx.font = `500 ${fontSize}px 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif`;
      
      // Adjust label Y coordinate slightly down if it has a capital star above it
      const textY = hasCapital ? screenPos.y + fontSize + 4 : screenPos.y;
      
      // 1. Draw elegant white halo outline for premium legibility over any background
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = Math.max(3.2, fontSize / 3.5);
      ctx.lineJoin = 'round';
      ctx.strokeText(group.name.toUpperCase(), screenPos.x, textY);
      
      // 2. Draw sharp premium slate-colored text fill
      ctx.fillStyle = '#1e293b';
      ctx.fillText(group.name.toUpperCase(), screenPos.x, textY);
      
      ctx.restore();
    }
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /** Анимировать камеру к определенной мировой координате и зуму с кубическим сглаживанием */
  animateCameraTo(targetWorldX: number, targetWorldY: number, targetZoom: number, duration = 650): void {
    const rect = this.canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const targetOffsetX = centerX - targetWorldX * targetZoom;
    const targetOffsetY = centerY - targetWorldY * targetZoom;

    const startOffsetX = this.viewport.offsetX;
    const startOffsetY = this.viewport.offsetY;
    const startZoom = this.viewport.zoom;

    const startTime = performance.now();

    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);

      // Кубическое сглаживание: f(t) = 1 - (1 - t)^3 (easeOutCubic)
      const ease = 1 - Math.pow(1 - progress, 3);

      const currentZoom = startZoom + (targetZoom - startZoom) * ease;
      const currentOffsetX = startOffsetX + (targetOffsetX - startOffsetX) * ease;
      const currentOffsetY = startOffsetY + (targetOffsetY - startOffsetY) * ease;

      this.viewport.setView(currentOffsetX, currentOffsetY, currentZoom);
      this.needsRedraw = true;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };

    requestAnimationFrame(update);
  }

  /** Сфокусировать и центрировать камеру на главной (крупнейшей непрерывной) территории выбранного государства */
  focusOnGroup(groupId: string): void {
    const groupRegions = this.regionService.getRegionsByGroup(groupId);
    if (groupRegions.length === 0) return;
    const group = this.groupService.getGroup(groupId);

    // 1. Получаем крупнейший непрерывный кластер ячеек (основное ядро страны)
    const mainCluster = this.getCountryMainCluster(groupRegions);

    let centerX = 0;
    let centerZ = 0;
    let hasCapital = false;

    if (group && (group as any).capitalRegionId) {
      const capRegion = this.regionService.getRegion((group as any).capitalRegionId);
      if (capRegion && capRegion.groupId === groupId) {
        centerX = capRegion.center.x;
        centerZ = capRegion.center.z;
        hasCapital = true;
      }
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    if (mainCluster.length > 0) {
      let sumX = 0;
      let sumZ = 0;
      // Рассчитываем Bounding Box только для главного кластера, игнорируя далекие колонии/острова
      for (const cell of mainCluster) {
        minX = Math.min(minX, cell.worldX);
        maxX = Math.max(maxX, cell.worldX);
        minZ = Math.min(minZ, cell.worldZ);
        maxZ = Math.max(maxZ, cell.worldZ);
        sumX += cell.worldX;
        sumZ += cell.worldZ;
      }
      if (!hasCapital) {
        centerX = sumX / mainCluster.length;
        centerZ = sumZ / mainCluster.length;
      }
    } else {
      // Фолбэк на глобальный Bounding Box всех регионов, если кластер не определен
      for (const region of groupRegions) {
        minX = Math.min(minX, region.boundingBox.minX);
        maxX = Math.max(maxX, region.boundingBox.maxX);
        minZ = Math.min(minZ, region.boundingBox.minZ);
        maxZ = Math.max(maxZ, region.boundingBox.maxZ);
      }
      if (!hasCapital) {
        centerX = (minX + maxX) / 2;
        centerZ = (minZ + maxZ) / 2;
      }
    }

    // 2. Рассчитываем комфортный зум под габариты главной территории
    const width = maxX - minX;
    const height = maxZ - minZ;
    const size = Math.max(16, Math.max(width, height));

    const rect = this.canvas.getBoundingClientRect();
    const viewSize = Math.min(rect.width, rect.height);
    
    let targetZoom = this.viewport.zoom;
    if (size > 0) {
      // Идеально вписываем в 70% экрана, лимитируя зум от 0.15x до 3.0x
      targetZoom = Math.min(3.0, Math.max(0.15, (viewSize / size) * 0.7));
    }

    // 3. Запуск плавной кинематографичной анимации камеры
    this.animateCameraTo(centerX, centerZ, targetZoom, 700);
  }

  public setRemoteCursors(_players: { clientId: string; name: string; color: string; x: number; y: number }[]): void {
    // Disabled
  }

  private updateRemoteCursors(): boolean {
    return false;
  }

  private renderRemoteCursors(): void {
    // Disabled
  }
}
