import { HexGridService } from './HexGridService';

/**
 * Сервис для анализа местности (суша/вода)
 */
export class TerrainService {
  private imageData: Uint8ClampedArray;
  private width: number;
  private height: number;
  private hexGrid: HexGridService;

  private readonly LAND_THRESHOLD = 128;

  constructor(
    imageData: Uint8ClampedArray, 
    width: number, 
    height: number, 
    hexGrid: HexGridService
  ) {
    this.imageData = imageData;
    this.width = width;
    this.height = height;
    this.hexGrid = hexGrid;
  }

  /**
   * Анализирует все ячейки и определяет, является ли каждая сушей
   */
  analyzeAllCells(thresholdPercentage: number = 0.1): void {
    const cells = this.hexGrid.getAllCells();
    const startTime = performance.now();

    for (const cell of cells) {
      const isLand = this.analyzeCell(cell.worldX, cell.worldZ, thresholdPercentage);
      cell.setLand(isLand);
    }

    const endTime = performance.now();
    console.log(`Terrain analysis completed in ${(endTime - startTime).toFixed(2)}ms`);
  }

  private analyzeCell(
    worldX: number, 
    worldZ: number, 
    thresholdPercentage: number
  ): boolean {
    const hexSize = this.hexGrid.hexSize;
    
    const minX = Math.floor(worldX - hexSize);
    const maxX = Math.ceil(worldX + hexSize);
    const minZ = Math.floor(worldZ - hexSize);
    const maxZ = Math.ceil(worldZ + hexSize);

    let landPixels = 0;
    let totalPixels = 0;

    for (let z = minZ; z <= maxZ; z++) {
      if (z < 0 || z >= this.height) continue;
      
      for (let x = minX; x <= maxX; x++) {
        if (x < 0 || x >= this.width) continue;

        if (this.isPointInHex(x, z, worldX, worldZ, hexSize)) {
          totalPixels++;
          if (this.isLandPixel(x, z)) {
            landPixels++;
          }
        }
      }
    }

    return totalPixels > 0 && (landPixels / totalPixels) >= thresholdPercentage;
  }

  private isPointInHex(
    x: number, z: number, 
    centerX: number, centerZ: number, 
    size: number
  ): boolean {
    const dx = Math.abs(x - centerX);
    const dy = Math.abs(z - centerZ);
    const halfWidth = size * Math.sqrt(3) / 2;
    
    if (dx > halfWidth) return false;
    if (dx / Math.sqrt(3) + dy > size) return false;
    
    return true;
  }

  private isLandPixel(x: number, y: number): boolean {
    const index = (y * this.width + x) * 4;
    // Маска: ожидается 0 для воды и 255 для суши (grayscale RGBA, каналы одинаковые)
    const value = this.imageData[index];
    return value >= this.LAND_THRESHOLD;
  }
}
