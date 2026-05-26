import { EventEmitter } from '../base/EventEmitter';
import { HexCell } from '../models/HexCell';

export interface HexGridConfig {
  hexSize: number;
  mapWidth: number;
  mapDepth: number;
}

/**
 * Сервис для работы с гексагональной сеткой
 */
export class HexGridService extends EventEmitter {
  public readonly hexSize: number;
  public readonly mapWidth: number;
  public readonly mapDepth: number;
  
  private cells: Map<string, HexCell> = new Map();
  private cellToChunksMap: Map<string, { cx: number; cz: number }[]> = new Map();
  private readonly sqrt3 = Math.sqrt(3);

  constructor(config: HexGridConfig) {
    super();
    this.hexSize = config.hexSize;
    this.mapWidth = config.mapWidth;
    this.mapDepth = config.mapDepth;
    
    this.generateCells();
    this.mapChunksToCells();
  }

  get hexWidth(): number {
    return this.sqrt3 * this.hexSize;
  }

  get hexHeight(): number {
    return 2 * this.hexSize;
  }

  get cellCount(): number {
    return this.cells.size;
  }

  private cellKey(q: number, r: number): string {
    return `${q},${r}`;
  }

  /**
   * Преобразовать axial координаты в мировые
   */
  axialToWorld(q: number, r: number): { x: number; z: number } {
    const x = this.hexSize * this.sqrt3 * (q + r / 2);
    const z = this.hexSize * 1.5 * r;
    return { x, z };
  }

  /**
   * Преобразовать мировые координаты в axial
   */
  worldToAxial(worldX: number, worldZ: number): { q: number; r: number } {
    const q = (this.sqrt3 / 3 * worldX - 1 / 3 * worldZ) / this.hexSize;
    const r = (2 / 3 * worldZ) / this.hexSize;
    return this.axialRound(q, r);
  }

  private axialRound(q: number, r: number): { q: number; r: number } {
    const s = -q - r;
    
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(s);

    const qDiff = Math.abs(rq - q);
    const rDiff = Math.abs(rr - r);
    const sDiff = Math.abs(rs - s);

    if (qDiff > rDiff && qDiff > sDiff) {
      rq = -rr - rs;
    } else if (rDiff > sDiff) {
      rr = -rq - rs;
    }

    return { q: rq, r: rr };
  }

  private generateCells(): void {
    const minX = 0;
    const maxX = this.mapWidth;
    const minZ = 0;
    const maxZ = this.mapDepth;

    const topLeft = this.worldToAxial(minX, minZ);
    const topRight = this.worldToAxial(maxX, minZ);
    const bottomLeft = this.worldToAxial(minX, maxZ);
    const bottomRight = this.worldToAxial(maxX, maxZ);

    const minQ = Math.min(topLeft.q, topRight.q, bottomLeft.q, bottomRight.q) - 1;
    const maxQ = Math.max(topLeft.q, topRight.q, bottomLeft.q, bottomRight.q) + 1;
    const minR = Math.min(topLeft.r, topRight.r, bottomLeft.r, bottomRight.r) - 1;
    const maxR = Math.max(topLeft.r, topRight.r, bottomLeft.r, bottomRight.r) + 1;

    for (let r = minR; r <= maxR; r++) {
      for (let q = minQ; q <= maxQ; q++) {
        const world = this.axialToWorld(q, r);
        
        // Строгая проверка: все вершины гекса должны находиться внутри карты
        const leftEdge = world.x - this.hexWidth / 2;
        const rightEdge = world.x + this.hexWidth / 2;
        const topEdge = world.z - this.hexHeight / 2;
        const bottomEdge = world.z + this.hexHeight / 2;

        if (leftEdge >= 0 && rightEdge <= this.mapWidth &&
            topEdge >= 0 && bottomEdge <= this.mapDepth) {
          
          const cell = new HexCell(q, r, world.x, world.z);
          this.cells.set(this.cellKey(q, r), cell);
        }
      }
    }
  }

  getCell(q: number, r: number): HexCell | undefined {
    return this.cells.get(this.cellKey(q, r));
  }

  getCellAtWorld(worldX: number, worldZ: number): HexCell | undefined {
    const coord = this.worldToAxial(worldX, worldZ);
    return this.getCell(coord.q, coord.r);
  }

  public getChunksForCell(q: number, r: number): { cx: number; cz: number }[] {
    return this.cellToChunksMap.get(this.cellKey(q, r)) || [];
  }

  private mapChunksToCells(): void {
    this.cellToChunksMap.clear();
    
    const numChunksX = Math.ceil(this.mapWidth / 16);
    const numChunksZ = Math.ceil(this.mapDepth / 16);
    
    for (let cx = 0; cx < numChunksX; cx++) {
      for (let cz = 0; cz < numChunksZ; cz++) {
        // Geometric center of the 16x16 chunk
        const centerX = cx * 16 + 8;
        const centerZ = cz * 16 + 8;
        
        // Find cell containing the chunk's center
        const cell = this.getCellAtWorld(centerX, centerZ);
        if (cell) {
          const key = this.cellKey(cell.q, cell.r);
          if (!this.cellToChunksMap.has(key)) {
            this.cellToChunksMap.set(key, []);
          }
          this.cellToChunksMap.get(key)!.push({ cx, cz });
        }
      }
    }
  }

  getAllCells(): HexCell[] {
    return Array.from(this.cells.values());
  }

  getLandCells(): HexCell[] {
    return this.getAllCells().filter(c => c.isLand);
  }

  /**
   * Получить вершины гексагона для отрисовки
   */
  getHexVertices(centerX: number, centerZ: number): { x: number; z: number }[] {
    const vertices: { x: number; z: number }[] = [];
    
    for (let i = 0; i < 6; i++) {
      const angleDeg = 60 * i - 30;
      const angleRad = (Math.PI / 180) * angleDeg;
      vertices.push({
        x: centerX + this.hexSize * Math.cos(angleRad),
        z: centerZ + this.hexSize * Math.sin(angleRad)
      });
    }
    
    return vertices;
  }
}
