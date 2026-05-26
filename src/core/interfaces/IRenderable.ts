/**
 * Интерфейс для объектов, которые можно отрисовать
 */
export interface IRenderable {
  render(ctx: CanvasRenderingContext2D, scale: number): void;
}

/**
 * Интерфейс для объектов с границами
 */
export interface IBoundary {
  getBoundary(): { x: number; y: number }[][];
}

/**
 * Интерфейс для объектов, которые можно выбрать
 */
export interface ISelectable {
  isSelected: boolean;
  isHovered: boolean;
  select(): void;
  deselect(): void;
}

/**
 * Интерфейс для объектов, принадлежащих группе
 */
export interface IGroupable {
  groupId: string;
  setGroup(groupId: string): void;
  getGroup(): string;
}
