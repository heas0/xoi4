/**
 * Класс HexCell - представляет одну гексагональную ячейку
 */
export class HexCell {
  public readonly q: number;
  public readonly r: number;
  public readonly worldX: number;
  public readonly worldZ: number;
  private _isLand: boolean = false;

  constructor(q: number, r: number, worldX: number, worldZ: number) {
    this.q = q;
    this.r = r;
    this.worldX = worldX;
    this.worldZ = worldZ;
  }

  get isLand(): boolean {
    return this._isLand;
  }

  setLand(isLand: boolean): void {
    this._isLand = isLand;
  }

  get key(): string {
    return `${this.q},${this.r}`;
  }

  /**
   * Получить соседние координаты
   */
  getNeighborCoords(): { q: number; r: number }[] {
    return [
      { q: this.q + 1, r: this.r },
      { q: this.q + 1, r: this.r - 1 },
      { q: this.q, r: this.r - 1 },
      { q: this.q - 1, r: this.r },
      { q: this.q - 1, r: this.r + 1 },
      { q: this.q, r: this.r + 1 }
    ];
  }
}
