import { GroupService } from '../core/services/GroupService';

/** Конфигурация панели управления */
export interface ControlPanelConfig {
  onGroupSelect: (groupId: string, focusCamera?: boolean) => void;
  onAddGroup: (name: string) => void;
  onRemoveGroup: (groupId: string) => void;
}

export class ControlPanel {
  private readonly container: HTMLElement;
  private readonly groupManager: GroupService;
  private readonly config: ControlPanelConfig;

  private selectedGroupId = 'none';
  private isOpen = true;
  private searchQuery = '';
  private isEditMode = false;

  constructor(
    containerId: string,
    groupManager: GroupService,
    config: ControlPanelConfig
  ) {
    const element = document.getElementById(containerId);
    if (!element) {
      throw new Error(`Container with id "${containerId}" not found`);
    }
    this.container = element;
    this.groupManager = groupManager;
    this.config = config;

    // Автоматически обновляем UI при изменении государств извне (например, от ИИ)
    this.groupManager.on('groupAdded', () => this.updateGroupList());
    this.groupManager.on('groupRemoved', () => this.updateGroupList());
    this.groupManager.on('groupsChanged', () => this.updateGroupList());

    this.render();
  }

  /** Получить ID выбранной группы */
  getSelectedGroupId(): string {
    return this.selectedGroupId;
  }

  /** Установить выбранную группу */
  setSelectedGroup(groupId: string): void {
    this.selectedGroupId = groupId;
    this.updateGroupList();
  }

  /** Проверить, активен ли режим редактирования (рисования) */
  isEditModeActive(): boolean {
    return this.isEditMode;
  }

  /** Переключить видимость панели */
  toggle(): void {
    this.isOpen = !this.isOpen;
    this.container.classList.toggle('collapsed', !this.isOpen);
    
    const toggleBtn = this.container.querySelector('.panel-toggle');
    if (toggleBtn) {
      toggleBtn.innerHTML = this.isOpen ? '◀' : '▶';
    }
  }

  /** Обновить список групп */
  updateGroupList(): void {
    const groupList = document.getElementById('groupList');
    if (!groupList) return;

    const query = this.searchQuery.toLowerCase();
    
    // Исключаем "None" (нейтральные земли) из левого списка государств
    const groups = this.groupManager.getAllGroups().filter(group => 
      group.id !== 'none' && group.name.toLowerCase().includes(query)
    );
    
    groupList.innerHTML = groups.map(group => `
      <div class="group-item ${group.id === this.selectedGroupId ? 'selected' : ''}" 
           data-group-id="${group.id}">
        <span class="group-color" style="background-color: ${group.color}"></span>
        <span class="group-name">${group.name}</span>
        <button class="btn-remove" data-remove-group="${group.id}" title="Удалить государство">×</button>
      </div>
    `).join('');

    // Блокируем список визуально и функционально, если режим редактирования активен
    if (this.isEditMode) {
      groupList.classList.add('disabled');
    } else {
      groupList.classList.remove('disabled');
    }

    this.attachGroupListeners(groupList);
  }

  /** Прокрутить список к государству и выделить его */
  scrollToGroup(groupId: string): void {
    // В режиме редактирования клик на карте не должен прокручивать/менять выделение
    if (this.isEditMode) return;

    this.selectedGroupId = groupId;
    this.config.onGroupSelect(groupId);
    
    // Если поиск скрывает эту группу, сбрасываем его
    const searchInput = document.getElementById('searchGroupInput') as HTMLInputElement;
    if (this.searchQuery) {
      const matches = this.groupManager.getAllGroups()
        .filter(g => g.name.toLowerCase().includes(this.searchQuery.toLowerCase()))
        .some(g => g.id === groupId);
        
      if (!matches) {
        this.searchQuery = '';
        if (searchInput) searchInput.value = '';
      }
    }
    
    this.updateGroupList();
    
    const item = this.container.querySelector(`.group-item[data-group-id="${groupId}"]`) as HTMLElement;
    if (item) {
      // Открываем левую панель, если она была свернута
      if (!this.isOpen) {
        this.toggle();
      }
      
      // Плавная прокрутка
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      
      // Анимация вспышки
      item.classList.add('highlight-flash');
      setTimeout(() => item.classList.remove('highlight-flash'), 1000);
    }
  }

  // ==================== Private Methods ====================

  /** Рендер панели */
  private render(): void {
    this.container.className = 'side-panel';
    this.container.innerHTML = `
      <button class="panel-toggle">◀</button>
      <div class="panel-content">
        <div class="panel-header">
          <h2>Государства</h2>
        </div>

        <div class="panel-section" style="margin-top: 16px;">
          <div class="input-group">
            <input type="text" id="newGroupName" placeholder="Новое государство">
            <button id="addGroup" class="btn-add-circle">+</button>
          </div>
          
          <div class="input-group" style="margin-top: 10px;">
            <input type="text" id="searchGroupInput" placeholder="Поиск государства...">
            <span style="color: var(--text-secondary); margin-right: 12px; pointer-events: none; font-size: 14px;">🔍</span>
          </div>

          <!-- Премиум-ползунок режима рисования (редактирования) -->
          <div class="edit-mode-section">
            <span class="edit-mode-label">✏️ Режим рисования</span>
            <label class="toggle-switch">
              <input type="checkbox" id="editModeToggle" ${this.isEditMode ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div id="groupList" class="group-list" style="margin-top: 10px;"></div>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.updateGroupList();
  }

  /** Привязка основных обработчиков событий */
  private attachEventListeners(): void {
    // Переключение панели
    this.container.querySelector('.panel-toggle')?.addEventListener('click', () => {
      this.toggle();
    });

    // Добавление группы
    const addBtn = document.getElementById('addGroup');
    const nameInput = document.getElementById('newGroupName') as HTMLInputElement;

    addBtn?.addEventListener('click', () => this.handleAddGroup(nameInput));
    nameInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleAddGroup(nameInput);
    });

    // Поиск
    const searchInput = document.getElementById('searchGroupInput') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim();
      this.updateGroupList();
    });

    // Ползунок режима редактирования
    const toggle = document.getElementById('editModeToggle') as HTMLInputElement;
    toggle?.addEventListener('change', () => {
      this.isEditMode = toggle.checked;
      
      // Если перешли в режим рисования, но ничего не выбрано (или 'none'),
      // берем первое доступное государство
      if (this.isEditMode && (this.selectedGroupId === 'none' || !this.selectedGroupId)) {
        const firstGroup = this.groupManager.getAllGroups().find(g => g.id !== 'none');
        if (firstGroup) {
          this.selectedGroupId = firstGroup.id;
          this.config.onGroupSelect(firstGroup.id);
        }
      }
      
      this.updateGroupList();
    });
  }

  /** Обработчик добавления группы */
  private handleAddGroup(input: HTMLInputElement): void {
    const name = input.value.trim();
    if (!name) return;
    
    this.config.onAddGroup(name);
    input.value = '';
    this.updateGroupList();
  }

  /** Привязка обработчиков для списка групп */
  private attachGroupListeners(groupList: HTMLElement): void {
    // Если режим редактирования включен, блокируем все взаимодействия с элементами списка
    if (this.isEditMode) return;

    // Выбор группы
    groupList.querySelectorAll('.group-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('btn-remove')) return;
        
        const groupId = (item as HTMLElement).dataset.groupId;
        if (groupId) {
          this.selectedGroupId = groupId;
          this.config.onGroupSelect(groupId, true);
          this.updateGroupList();
        }
      });
    });

    // Удаление группы
    groupList.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupId = (btn as HTMLElement).dataset.removeGroup;
        if (!groupId) return;
        
        this.config.onRemoveGroup(groupId);
        if (this.selectedGroupId === groupId) {
          this.selectedGroupId = 'none';
        }
        this.updateGroupList();
      });
    });
  }
}
