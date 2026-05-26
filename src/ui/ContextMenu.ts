import { GroupService } from '../core/services/GroupService';

export interface ContextMenuConfig {
  onSelectGroup: (groupId: string) => void;
  onAddGroup: () => void;
  onSetCapital?: (regionId: string, groupId: string) => void;
  onUpdateNote?: (regionId: string, note: string) => void;
}

export class ContextMenu {
  private container: HTMLElement;
  private groupManager: GroupService;
  public config: ContextMenuConfig;
  private isVisible: boolean = false;
  private regionInfo?: { id: string; groupId: string; groupName: string; note?: string };
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
    this.container.style.padding = '0';
    this.container.style.width = '480px';
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
  show(x: number, y: number, regionInfo?: { id: string; groupId: string; groupName: string; note?: string }): void {
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

    const formattedRegionName = this.regionInfo ? `#${this.regionInfo.id.replace('region_', '')}` : '';

    this.container.innerHTML = `
      <div style="display: flex; gap: 16px; padding: 14px 18px; min-width: 450px; box-sizing: border-box;">
        <!-- Left Column: Owner & Nations -->
        <div style="flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 200px;">
          <div style="font-weight: 600; font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 2px;">
            Владелец
          </div>
          <div class="input-group" style="padding: 2px 8px 2px 14px; height: 30px; border-radius: 8px; flex-shrink: 0; margin-bottom: 4px;">
            <input type="text" id="modalSearchInput" placeholder="Поиск..." value="${this.modalSearchQuery}" style="font-size: 12px; height: 24px; width: 100%;">
            <span style="color: var(--text-secondary); font-size: 11px; pointer-events: none;">🔍</span>
          </div>
          <div class="context-menu-grid" style="display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto; padding-right: 2px;">
            ${groups.map(group => `
              <div class="context-menu-grid-item ${this.regionInfo && this.regionInfo.groupId === group.id ? 'selected' : ''}" 
                   data-group-id="${group.id}" style="padding: 6px 10px;">
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
          <div class="context-menu-divider" style="margin: 4px 0;"></div>
          <div class="context-menu-item context-menu-add" id="contextAddGroupBtn" style="padding: 6px 8px; border-radius: 8px; font-size: 12px; display: flex; align-items: center; gap: 8px;">
            <span class="context-menu-icon" style="font-size: 14px; color: var(--color-primary);">+</span>
            <span class="context-menu-name">Добавить государство...</span>
          </div>
        </div>

        <!-- Vertical Divider -->
        <div style="width: 1px; background: var(--border-color); align-self: stretch;"></div>

        <!-- Right Column: Region Details & Notes -->
        <div style="flex: 1.1; display: flex; flex-direction: column; gap: 8px; min-width: 220px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; flex-shrink: 0;">
            <span style="font-weight: 600; font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.8px;">
              Регион ${formattedRegionName}
            </span>
            <span style="font-size: 16px; cursor: pointer; color: var(--text-secondary); line-height: 1; padding: 2px;" id="contextCloseBtn">&times;</span>
          </div>

          ${this.regionInfo && this.regionInfo.groupId !== 'none' && this.config.onSetCapital ? `
            <div class="context-menu-item context-menu-capital" id="contextSetCapitalBtn" style="padding: 6px 8px; border-radius: 8px; font-size: 12px; display: flex; align-items: center; gap: 8px; flex-shrink: 0; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color);">
              <span class="context-menu-icon" style="font-size: 12px;">⭐</span>
              <span class="context-menu-name" style="font-size: 12px;">Сделать столицей</span>
            </div>
          ` : ''}

          <div style="display: flex; flex-direction: column; gap: 6px; flex: 1;">
            <span style="font-weight: 500; color: #ffffff; font-size: 11px; display: flex; align-items: center; gap: 4px; margin-top: 2px;">
              📝 <span style="font-size: 11px; opacity: 0.9;">Заметка региона</span>
            </span>
            <textarea id="contextRegionNote" placeholder="Введите заметку для этого региона..." 
                      style="width: 100%; height: 100%; min-height: 130px; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border-color); border-radius: 8px; color: #ffffff; padding: 8px 10px; font-size: 12px; resize: none; outline: none; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s;"
            >${this.regionInfo ? this.regionInfo.note || '' : ''}</textarea>
          </div>
        </div>
      </div>
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

    // Текстовая заметка региона
    if (this.regionInfo) {
      const noteTextarea = document.getElementById('contextRegionNote') as HTMLTextAreaElement;
      if (noteTextarea) {
        // Фокус на инпут не сбрасывает фокус с поиска
        noteTextarea.addEventListener('input', (e) => {
          e.stopPropagation();
          const newNote = noteTextarea.value;
          if (this.regionInfo) {
            this.regionInfo.note = newNote;
            if (this.config.onUpdateNote) {
              this.config.onUpdateNote(this.regionInfo.id, newNote);
            }
          }
        });

        // Предотвращаем срабатывание глобальных горячих клавиш клавиатуры при вводе текста
        noteTextarea.addEventListener('keydown', (e) => {
          e.stopPropagation();
        });
      }
    }
  }
}
