import { EventEmitter } from '../base/EventEmitter';
import { Region } from '../models/Region';
import { HexCell } from '../models/HexCell';
import { HexGridService } from './HexGridService';

export interface RegionGroupAssignment {
  regionId: string;
  groupId: string;
}

/**
 * Сервис для управления регионами
 */
export class RegionService extends EventEmitter {
  public readonly hexGrid: HexGridService;
  private regions: Map<string, Region> = new Map();
  private cellToRegion: Map<string, string> = new Map();
  private countryAssignments: Map<string, string>;

  constructor(hexGrid: HexGridService, countryAssignments: Map<string, string> = new Map()) {
    super();
    this.hexGrid = hexGrid;
    this.countryAssignments = countryAssignments;
  }

  /**
   * Генерация регионов из ячеек суши
   */
  generateRegions(): void {
    this.regions.clear();
    this.cellToRegion.clear();

    const landCells = this.hexGrid.getLandCells().sort((a, b) => {
      if (a.r !== b.r) return a.r - b.r;
      return a.q - b.q;
    });
    const unassigned = new Set<string>(landCells.map(c => c.key));
    
    let regionCounter = 0;

    for (const cell of landCells) {
      if (!unassigned.has(cell.key)) continue;

      const targetSize = 3 + (this.stableHash(cell.key) % 6);
      const regionCells: HexCell[] = [cell];
      unassigned.delete(cell.key);

      const queue: HexCell[] = [cell];
      
      while (regionCells.length < targetSize && queue.length > 0) {
        const current = queue.shift()!;
        const neighborCoords = current.getNeighborCoords();

        for (const coord of neighborCoords) {
          const neighbor = this.hexGrid.getCell(coord.q, coord.r);
          if (neighbor && unassigned.has(neighbor.key) && neighbor.isLand) {
            unassigned.delete(neighbor.key);
            regionCells.push(neighbor);
            queue.push(neighbor);
            
            if (regionCells.length >= targetSize) break;
          }
        }
      }

      const regionId = `region_${regionCounter++}`;
      this.createRegion(regionId, regionCells);
    }

    console.log(`Generated ${this.regions.size} regions from ${landCells.length} land cells.`);
    this.emit('regionsGenerated', this.regions.size);
  }

  private stableHash(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private createRegion(id: string, cells: HexCell[]): void {
    const region = new Region(id);
    region.setCells(cells);
    region.setBoundary(this.calculateBoundary(cells));
    region.setGroup(this.getMajorityCountryId(cells));
    
    for (const cell of cells) {
      this.cellToRegion.set(cell.key, id);
    }

    this.regions.set(id, region);
  }

  private getMajorityCountryId(cells: HexCell[]): string {
    const counts = new Map<string, number>();

    for (const cell of cells) {
      const countryId = this.countryAssignments.get(cell.key);
      if (!countryId) continue;
      counts.set(countryId, (counts.get(countryId) ?? 0) + 1);
    }

    let bestCountryId = 'none';
    let bestCount = 0;
    let isTied = false;

    for (const [countryId, count] of counts) {
      if (count > bestCount) {
        bestCountryId = countryId;
        bestCount = count;
        isTied = false;
      } else if (count === bestCount) {
        isTied = true;
      }
    }

    return bestCount > 0 && !isTied ? bestCountryId : 'none';
  }

  getRegion(id: string): Region | undefined {
    return this.regions.get(id);
  }

  getRegionByCell(q: number, r: number): Region | undefined {
    const regionId = this.cellToRegion.get(`${q},${r}`);
    return regionId ? this.regions.get(regionId) : undefined;
  }

  getAllRegions(): Region[] {
    return Array.from(this.regions.values());
  }

  setRegionGroup(regionId: string, groupId: string, options: { silent?: boolean } = {}): boolean {
    const region = this.regions.get(regionId);
    if (region) {
      if (region.groupId === groupId) {
        return true;
      }
      region.setGroup(groupId);
      if (!options.silent) {
        this.emit('regionGroupChanged', { regionId, groupId });
      }
      return true;
    }
    return false;
  }

  setRegionGroups(assignments: RegionGroupAssignment[]): number {
    let changedCount = 0;

    for (const assignment of assignments) {
      const region = this.regions.get(assignment.regionId);
      if (region && region.groupId !== assignment.groupId) {
        this.setRegionGroup(assignment.regionId, assignment.groupId, { silent: true });
        changedCount++;
      }
    }

    if (changedCount > 0) {
      this.emit('regionGroupChanged', { bulk: true, count: changedCount });
    }

    return changedCount;
  }

  clearGroupAssignments(groupId: string): number {
    const assignments = this.getRegionsByGroup(groupId).map(region => ({
      regionId: region.id,
      groupId: 'none'
    }));

    return this.setRegionGroups(assignments);
  }

  getRegionsByGroup(groupId: string): Region[] {
    return this.getAllRegions().filter(r => r.groupId === groupId);
  }

  /**
   * Вычисление объединенного контура для группы регионов
   */
  calculateGroupBoundary(groupId: string): { x: number; y: number }[][] {
    const groupRegions = this.getRegionsByGroup(groupId);
    if (groupRegions.length === 0) return [];

    const allCells: HexCell[] = [];
    const cellSet = new Set<string>();
    
    for (const region of groupRegions) {
      for (const cell of region.cells) {
        if (!cellSet.has(cell.key)) {
          cellSet.add(cell.key);
          allCells.push(cell);
        }
      }
    }

    return this.calculateBoundaryForCells(allCells, cellSet);
  }

  private calculateBoundary(cells: HexCell[]): { x: number; y: number }[][] {
    const cellSet = new Set(cells.map(c => c.key));
    return this.calculateBoundaryForCells(cells, cellSet);
  }

  private calculateBoundaryForCells(
    cells: HexCell[], 
    cellSet: Set<string>
  ): { x: number; y: number }[][] {
    const edges: { p1: {x:number, y:number}, p2: {x:number, y:number} }[] = [];

    const neighborDirs = [
      { q: 1, r: 0 },
      { q: 0, r: 1 },
      { q: -1, r: 1 },
      { q: -1, r: 0 },
      { q: 0, r: -1 },
      { q: 1, r: -1 }
    ];

    for (const cell of cells) {
      const vertices = this.hexGrid.getHexVertices(cell.worldX, cell.worldZ);
      
      for (let i = 0; i < 6; i++) {
        const dir = neighborDirs[i];
        const neighborKey = `${cell.q + dir.q},${cell.r + dir.r}`;
        
        if (!cellSet.has(neighborKey)) {
          const p1 = vertices[i];
          const p2 = vertices[(i + 1) % 6];
          
          edges.push({ 
            p1: { x: p1.x, y: p1.z }, 
            p2: { x: p2.x, y: p2.z } 
          });
        }
      }
    }

    return this.orderEdges(edges);
  }

  private orderEdges(
    edges: { p1: {x:number, y:number}, p2: {x:number, y:number} }[]
  ): { x: number; y: number }[][] {
    if (edges.length === 0) return [];

    const polygons: { x: number; y: number }[][] = [];
    const epsilon = 0.1;

    while (edges.length > 0) {
      const currentPolygon: { x: number; y: number }[] = [];
      let currentEdge = edges.pop()!;
      currentPolygon.push(currentEdge.p1);
      
      let currentPoint = currentEdge.p2;
      let loopClosed = false;
      
      while (!loopClosed) {
        currentPolygon.push(currentPoint);
        
        // Check if we closed the loop (reached start point)
        if (Math.abs(currentPoint.x - currentPolygon[0].x) < epsilon && 
            Math.abs(currentPoint.y - currentPolygon[0].y) < epsilon) {
          loopClosed = true;
          break;
        }

        const index = edges.findIndex(e => 
          Math.abs(e.p1.x - currentPoint.x) < epsilon && 
          Math.abs(e.p1.y - currentPoint.y) < epsilon
        );

        if (index !== -1) {
          currentEdge = edges.splice(index, 1)[0];
          currentPoint = currentEdge.p2;
        } else {
          // Cannot find next edge, break to avoid infinite loop
          break;
        }
      }
      
      if (currentPolygon.length > 2) {
        polygons.push(currentPolygon);
      }
    }
    
    return polygons;
  }
}
