import { EventEmitter } from '../base/EventEmitter';
import { IGroupable, IBoundary } from '../interfaces/IRenderable';
import { HexCell } from './HexCell';

/**
 * Класс Region - представляет регион на карте
 * Регион состоит из нескольких гексагональных ячеек
 */
export class Region extends EventEmitter implements IGroupable, IBoundary {
  public readonly id: string;
  public name: string;
  public civilianFactories: number = 0;
  public militaryFactories: number = 0;
  public manpower: number = 0;
  public lore: string = '';
  public note: string = '';
  public resources = {
    steel: 0,
    oil: 0,
    chromium: 0,
    aluminium: 0,
    rubber: 0,
    tungsten: 0
  };

  private _groupId: string = 'none';
  private _cells: HexCell[] = [];
  private _boundary: { x: number; y: number }[][] = [];
  private _center: { x: number; z: number } = { x: 0, z: 0 };
  private _boundingBox: { minX: number; minZ: number; maxX: number; maxZ: number } = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  private _isHovered: boolean = false;

  constructor(id: string) {
    super();
    this.id = id;
    this.name = `Регион ${id}`;
    this.manpower = 50000 + (this.stableHash(id) % 950001);
  }

  private stableHash(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // Getters
  get groupId(): string {
    return this._groupId;
  }

  get cells(): HexCell[] {
    return this._cells;
  }

  get cellIds(): string[] {
    return this._cells.map(c => `${c.q},${c.r}`);
  }

  get center(): { x: number; z: number } {
    return this._center;
  }
  
  get boundingBox(): { minX: number; minZ: number; maxX: number; maxZ: number } {
    return this._boundingBox;
  }

  get isHovered(): boolean {
    return this._isHovered;
  }

  get boundary(): { x: number; y: number }[][] {
    return this._boundary;
  }

  // IGroupable implementation
  setGroup(groupId: string): void {
    const oldGroupId = this._groupId;
    this._groupId = groupId;
    this.emit('groupChanged', { oldGroupId, newGroupId: groupId });
  }

  getGroup(): string {
    return this._groupId;
  }

  // IBoundary implementation
  getBoundary(): { x: number; y: number }[][] {
    return this._boundary;
  }

  // Methods
  setCells(cells: HexCell[]): void {
    this._cells = cells;
    this.calculateCenter();
    this.calculateBoundingBox();
  }

  setBoundary(boundary: { x: number; y: number }[][]): void {
    this._boundary = boundary;
  }

  setHovered(hovered: boolean): void {
    if (this._isHovered !== hovered) {
      this._isHovered = hovered;
      this.emit('hoverChanged', hovered);
    }
  }

  private calculateCenter(): void {
    if (this._cells.length === 0) {
      this._center = { x: 0, z: 0 };
      return;
    }

    let sumX = 0, sumZ = 0;
    for (const cell of this._cells) {
      sumX += cell.worldX;
      sumZ += cell.worldZ;
    }
    this._center = {
      x: sumX / this._cells.length,
      z: sumZ / this._cells.length
    };
  }
  
  private calculateBoundingBox(): void {
    if (this._cells.length === 0) {
      this._boundingBox = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
      return;
    }
    
    let minX = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxZ = -Infinity;
    
    for (const cell of this._cells) {
      minX = Math.min(minX, cell.worldX);
      minZ = Math.min(minZ, cell.worldZ);
      maxX = Math.max(maxX, cell.worldX);
      maxZ = Math.max(maxZ, cell.worldZ);
    }
    
    // Add some padding for hex size (approximate)
    const padding = 20; 
    this._boundingBox = {
      minX: minX - padding,
      minZ: minZ - padding,
      maxX: maxX + padding,
      maxZ: maxZ + padding
    };
  }

  containsCell(q: number, r: number): boolean {
    return this._cells.some(c => c.q === q && c.r === r);
  }
}
