import { EventEmitter } from '../base/EventEmitter';
import { Group } from '../models/Group';

export interface GroupSeed {
  id: string;
  name: string;
  color: string;
  capitalRegionId?: string | null;
}

interface EmitOptions {
  emit?: boolean;
}

/**
 * Сервис для управления группами
 */
export class GroupService extends EventEmitter {
  private groups: Map<string, Group> = new Map();
  private usedColors: Set<string> = new Set();

  private readonly predefinedColors: string[] = [
    '#88B49E', // Soft Sage
    '#E28F83', // Warm Terracotta
    '#C97A8E', // Antique Rose
    '#A594C4', // Muted Lavender
    '#72A1B9', // Soft Ocean Blue
    '#E3C08D', // Soft Gold
    '#8A9E70', // Olive Green
    '#C28EB9', // Pale Plum
    '#8CB9BE', // Dusty Cyan
    '#E8A888', // Apricot Peach
    '#B67C82', // Velvet Rose
    '#6C9480', // Pine Green
    '#8D98CA', // Violet Blue
    '#D49B6A', // Warm Ochre
    '#9FA2A6'  // Slate Gray
  ];

  constructor() {
    super();
    // Группа по умолчанию
    this.createGroup('none', 'None', '#FFFFFF');
  }

  private generateUniqueColor(): string {
    for (const color of this.predefinedColors) {
      if (!this.usedColors.has(color)) {
        return color;
      }
    }

    // Генерация случайного цвета
    let color: string;
    let attempts = 0;
    do {
      const hue = Math.random() * 360;
      const saturation = 60 + Math.random() * 30;
      const lightness = 50 + Math.random() * 20;
      color = this.hslToHex(hue, saturation, lightness);
      attempts++;
    } while (this.usedColors.has(color) && attempts < 100);

    return color;
  }

  private hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
  }

  private generateId(): string {
    return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  createGroup(id: string, name: string, color: string): Group {
    return this.upsertGroup({ id, name, color }, { emit: false });
  }

  upsertGroup(seed: GroupSeed, options: EmitOptions = {}): Group {
    const emit = options.emit ?? true;
    const existingGroup = this.groups.get(seed.id);

    if (existingGroup) {
      if (existingGroup.color !== seed.color) {
        this.usedColors.delete(existingGroup.color);
        this.usedColors.add(seed.color);
      }
      existingGroup.name = seed.name;
      existingGroup.color = seed.color;
      existingGroup.capitalRegionId = seed.capitalRegionId ?? undefined;

      if (emit) {
        this.emit('groupsChanged', this.getAllGroups());
      }
      return existingGroup;
    }

    const group = new Group(seed.id, seed.name, seed.color);
    group.capitalRegionId = seed.capitalRegionId ?? undefined;
    this.groups.set(seed.id, group);
    this.usedColors.add(seed.color);

    if (emit) {
      this.emit('groupAdded', group);
    }

    return group;
  }

  createGroups(groups: GroupSeed[]): void {
    for (const group of groups) {
      if (group.id === 'none' || this.groups.has(group.id)) continue;
      this.createGroup(group.id, group.name, group.color);
    }
    this.emit('groupsChanged', this.getAllGroups());
  }

  addGroup(name: string): Group {
    const id = this.generateId();
    const color = this.generateUniqueColor();
    const group = this.createGroup(id, name, color);
    this.usedColors.add(color);
    this.emit('groupAdded', group);
    return group;
  }

  removeGroup(id: string): boolean {
    if (id === 'none') return false;

    const group = this.groups.get(id);
    if (group) {
      this.usedColors.delete(group.color);
      this.groups.delete(id);
      this.emit('groupRemoved', id);
      return true;
    }
    return false;
  }

  setGroupCapital(id: string, regionId: string | undefined, options: EmitOptions = {}): boolean {
    const group = this.groups.get(id);
    if (!group) return false;

    group.capitalRegionId = regionId;
    if (options.emit ?? true) {
      this.emit('groupsChanged', this.getAllGroups());
    }
    return true;
  }

  notifyGroupsChanged(): void {
    this.emit('groupsChanged', this.getAllGroups());
  }

  getGroup(id: string): Group | undefined {
    return this.groups.get(id);
  }

  getGroupColor(id: string): string {
    return this.groups.get(id)?.color ?? '#FFFFFF';
  }

  getAllGroups(): Group[] {
    return Array.from(this.groups.values());
  }

  getSelectableGroups(): Group[] {
    return this.getAllGroups().filter(g => g.id !== 'none');
  }
}
