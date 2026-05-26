import { GroupService } from '../core/services/GroupService';

export interface ContextMenuConfig {
  onSelectGroup: (groupId: string) => void;
  onAddGroup: () => void;
  onSetCapital?: (regionId: string, groupId: string) => void;
}

export class ContextMenu {
  private container: HTMLElement;
  private groupManager: GroupService;
  public config: ContextMenuConfig;
  private isVisible: boolean = false;
  private regionInfo?: { id: string; groupId: string; groupName: string };
  private modalSearchQuery: string = '';

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  constructor(groupManager: GroupService, config: ContextMenuConfig) {
    this.groupManager = groupManager;
    this.config = config;

    // Создаём контейнер для плавающего меню
    this.container = document.createElement('div');
    this.container.id = 'context-menu';
    this.container.className = 'context-menu';
    this.container.style.display = 'none';
    document.body.appendChild(this.container);

    // Закрытие по клику вне меню
    document.addEventListener('click', (e) => {
      if (this.isVisible && !this.container.contains(e.target as Node)) {
        this.hide();
      }
    });

    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });
  }

  /** Показать меню у курсора мыши */
  show(x: number, y: number, regionInfo?: { id: string; groupId: string; groupName: string }): void {
    this.regionInfo = regionInfo;
    this.modalSearchQuery = ''; // Сброс поиска
    this.render();

    this.container.style.display = 'block';

    // Мгновенное позиционирование
    this.container.style.left = `${x}px`;
    this.container.style.top = `${y}px`;

    // Ограничиваем меню рамками экрана
    const rect = this.container.getBoundingClientRect();
    const margin = 8;

    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);

    const clampedLeft = this.clamp(x, margin, maxLeft);
    const clampedTop = this.clamp(y, margin, maxTop);

    this.container.style.left = `${Math.round(clampedLeft)}px`;
    this.container.style.top = `${Math.round(clampedTop)}px`;

    this.isVisible = true;

    // Фокус на поиск при открытии
    setTimeout(() => {
      const searchInput = document.getElementById('modalSearchInput') as HTMLInputElement;
      if (searchInput) searchInput.focus();
    }, 100);
  }

  /** Скрыть меню */
  hide(): void {
    this.container.style.display = 'none';
    this.isVisible = false;
  }

  /** Проверка видимости */
  get visible(): boolean {
    return this.isVisible;
  }

  /** Рендер меню */
  private render(): void {
    const query = this.modalSearchQuery.toLowerCase();
    const allGroups = this.groupManager.getAllGroups();
    
    // Фильтруем группы по поиску
    const groups = allGroups.filter(group => 
      group.name.toLowerCase().includes(query) || group.id === 'none'
    );

    const regionName = this.regionInfo ? `: ${this.regionInfo.id}` : '';

    this.container.innerHTML = `
      <div class="context-menu-header" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 6px; border-bottom: 1px solid var(--border-color); margin-bottom: 6px;">
        <span style="font-weight: 500; color: #ffffff;">Владелец${regionName}</span>
        <span style="font-size: 14px; cursor: pointer; color: var(--text-secondary);" id="contextCloseBtn">&times;</span>
      </div>

      <div class="input-group" style="padding: 2px 8px; margin-bottom: 6px; height: 30px; border-radius: 8px;">
        <input type="text" id="modalSearchInput" placeholder="Поиск..." value="${this.modalSearchQuery}" style="font-size: 12px; height: 24px;">
        <span style="color: var(--text-secondary); font-size: 11px; pointer-events: none;">🔍</span>
      </div>

      <div class="context-menu-grid" style="display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto; padding-right: 2px;">
        ${groups.map(group => `
          <div class="context-menu-grid-item ${this.regionInfo && this.regionInfo.groupId === group.id ? 'selected' : ''}" 
               data-group-id="${group.id}">
            <span class="context-menu-color" style="background-color: ${group.color}; width: 10px; height: 10px; border-radius: 50%; display: inline-block;"></span>
            <span class="context-menu-name" style="font-size: 12.5px;">${group.name}</span>
          </div>
        `).join('')}
        ${groups.length === 0 ? `
          <div style="text-align: center; color: var(--text-secondary); padding: 12px; font-size: 11px; font-style: italic;">
            Не найдено
          </div>
        ` : ''}
      </div>

      <div class="context-menu-divider"></div>
      
      <div class="context-menu-item context-menu-add" id="contextAddGroupBtn" style="padding: 8px 10px; border-radius: 8px; font-size: 12px; display: flex; align-items: center; gap: 8px;">
        <span class="context-menu-icon" style="font-size: 14px; color: var(--color-primary);">+</span>
        <span class="context-menu-name">Добавить государство...</span>
      </div>

      ${this.regionInfo && this.regionInfo.groupId !== 'none' && this.config.onSetCapital ? `
        <div class="context-menu-divider"></div>
        <div class="context-menu-item context-menu-capital" id="contextSetCapitalBtn" style="padding: 8px 10px; border-radius: 8px; font-size: 12px; display: flex; align-items: center; gap: 8px;">
          <span class="context-menu-icon">⭐</span>
          <span class="context-menu-name">Сделать столицей</span>
        </div>
      ` : ''}
    `;

    this.attachEventListeners();
  }

  /** Привязка обработчиков событий */
  private attachEventListeners(): void {
    // Кнопка закрытия (&times;)
    document.getElementById('contextCloseBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });

    // Поиск
    const searchInput = document.getElementById('modalSearchInput') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      e.stopPropagation();
      this.modalSearchQuery = searchInput.value;
      this.render();
      
      // Возвращаем фокус на инпут после рендера и ставим курсор в конец
      const newSearchInput = document.getElementById('modalSearchInput') as HTMLInputElement;
      if (newSearchInput) {
        newSearchInput.focus();
        newSearchInput.setSelectionRange(newSearchInput.value.length, newSearchInput.value.length);
      }
    });

    // Выбор государства
    this.container.querySelectorAll('.context-menu-grid-item[data-group-id]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupId = (item as HTMLElement).dataset.groupId;
        if (groupId) {
          this.config.onSelectGroup(groupId);
          this.hide();
        }
      });
    });

    // Кнопка добавления группы
    document.getElementById('contextAddGroupBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.config.onAddGroup();
      this.hide();
    });

    // Кнопка столицы
    if (this.regionInfo && this.regionInfo.groupId !== 'none') {
      document.getElementById('contextSetCapitalBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.regionInfo && this.config.onSetCapital) {
          this.config.onSetCapital(this.regionInfo.id, this.regionInfo.groupId);
        }
        this.hide();
      });
    }
  }
}
