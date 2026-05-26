/**
 * Tooltip - компонент подсказки для гексагонов
 */

import { HexCell } from '../core/models/HexCell';
import { GroupService } from '../core/services/GroupService';

export class Tooltip {
  private element: HTMLDivElement;
  private groupManager: GroupService;

  constructor(groupManager: GroupService) {
    this.groupManager = groupManager;
    this.element = this.createElement();
  }

  private createElement(): HTMLDivElement {
    const tooltip = document.createElement('div');
    tooltip.className = 'hex-tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
    return tooltip;
  }

  /** Показать подсказку для ячейки */
  show(cell: HexCell, regionService: any): void {
    const region = regionService.getRegionByCell(cell.q, cell.r);
    const groupId = region?.groupId || 'none';
    const group = this.groupManager.getGroup(groupId);
    const groupName = group ? group.name : 'None';
    const groupColor = group?.color || '#999';
    const regionName = region ? region.id.replace('region_', '#') : 'Нет';

    this.element.innerHTML = `
      <strong>Регион ${regionName}</strong><br>
      Гекс: (${cell.q}, ${cell.r})<br>
      Государство: <span style="color: ${groupColor}">${groupName}</span>
    `;

    if (region && region.note) {
      this.element.innerHTML += `
        <div style="border-top: 1px solid rgba(255, 255, 255, 0.12); margin-top: 6px; padding-top: 6px; font-size: 11px; color: #e2e8f0; max-width: 220px; word-wrap: break-word;">
          <span style="opacity: 0.7;">📝</span> ${region.note}
        </div>
      `;
    }

    this.element.style.display = 'block';
  }

  /** Скрыть подсказку */
  hide(): void {
    this.element.style.display = 'none';
  }

  /** Уничтожение компонента */
  dispose(): void {
    this.element.remove();
  }
}
