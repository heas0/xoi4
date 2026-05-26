import { EventEmitter } from '../base/EventEmitter';

/**
 * Класс Group - представляет группу (фракцию/страну)
 */
export class Group extends EventEmitter {
  public readonly id: string;
  private _name: string;
  private _color: string;
  private _capitalRegionId?: string;

  constructor(id: string, name: string, color: string) {
    super();
    this.id = id;
    this._name = name;
    this._color = color;
  }

  get name(): string {
    return this._name;
  }

  set name(value: string) {
    this._name = value;
    this.emit('nameChanged', value);
  }

  get color(): string {
    return this._color;
  }

  set color(value: string) {
    this._color = value;
    this.emit('colorChanged', value);
  }

  get capitalRegionId(): string | undefined {
    return this._capitalRegionId;
  }

  set capitalRegionId(value: string | undefined) {
    this._capitalRegionId = value;
    this.emit('capitalChanged', value);
  }
}
