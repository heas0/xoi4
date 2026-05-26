import { WorldSyncService } from '../sync/WorldSyncService';

type LobbyPlayer = {
  clientId: string;
  name: string;
  color: string;
  x: number;
  y: number;
};

export class LobbyPanel {
  private container: HTMLDivElement;
  private mobileIndicator: HTMLDivElement;
  private activePlayers: LobbyPlayer[] = [];

  constructor(private worldSync: WorldSyncService) {
    this.container = document.createElement('div');
    this.container.className = 'lobby-panel animate-scale-up';

    const currentName = this.escapeHtml(this.worldSync.getOrCreateUserName());
    const currentColor = this.worldSync.getOrCreateUserColor();
    const statusText = this.worldSync.isEnabled ? '1 в сети' : 'Отключён';
    const statusClass = this.worldSync.isEnabled ? 'online' : 'offline';

    this.container.innerHTML = `
      <div class="lobby-panel-title">МУЛЬТИПЛЕЕР</div>

      <div class="lobby-profile-section">
        <div class="lobby-profile-header" title="Нажмите, чтобы изменить ник">
          <span class="lobby-color-dot" id="lobby-profile-color" style="background-color: ${currentColor}; box-shadow: 0 0 8px ${currentColor}"></span>
          <input type="text" id="lobby-profile-name" value="${currentName}" maxLength="20" placeholder="Ваш ник..." />
          <span class="lobby-profile-edit-icon">✏️</span>
        </div>
      </div>

      <div class="lobby-divider"></div>

      <div class="lobby-row">
        <span>Сеть</span>
        <div class="lobby-status">
          <span id="lobby-online-count" class="lobby-online-status-pill ${statusClass}">${statusText}</span>
          <div class="lobby-online-dropdown" id="lobby-online-dropdown">
            <div class="lobby-dropdown-title">Игроки онлайн</div>
            <div class="lobby-dropdown-list" id="lobby-dropdown-list"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    // Mobile-only compact online indicator (bottom-right)
    this.mobileIndicator = document.createElement('div');
    this.mobileIndicator.className = 'mobile-online-indicator';
    const mobileStatusClass = this.worldSync.isEnabled ? 'online' : 'offline';
    const mobileStatusText = this.worldSync.isEnabled ? '1' : '—';
    this.mobileIndicator.innerHTML = `<span class="mobile-online-dot ${mobileStatusClass}"></span><span class="mobile-online-text">${mobileStatusText}</span>`;
    document.body.appendChild(this.mobileIndicator);

    this.setupEventListeners();
    this.updatePlayers([]);
  }

  private setupEventListeners(): void {
    const nameInput = this.container.querySelector('#lobby-profile-name') as HTMLInputElement;
    if (nameInput) {
      const handleNameChange = () => {
        const newName = nameInput.value.trim();
        if (newName && newName !== this.worldSync.getOrCreateUserName()) {
          this.worldSync.updateUsername(newName);
          this.updatePlayers(this.activePlayers);
        } else {
          nameInput.value = this.worldSync.getOrCreateUserName();
        }
      };

      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          nameInput.blur();
        }
      });

      nameInput.addEventListener('blur', handleNameChange);
    }

    // Tap-toggle for lobby dropdown (works on mobile where :hover doesn't)
    const statusEl = this.container.querySelector('.lobby-status') as HTMLElement;
    if (statusEl) {
      statusEl.addEventListener('click', (e) => {
        e.stopPropagation();
        statusEl.classList.toggle('open');
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', () => {
        statusEl.classList.remove('open');
      });
    }
  }

  get players(): LobbyPlayer[] {
    return this.activePlayers;
  }

  public updatePlayers(players: LobbyPlayer[]): void {
    this.activePlayers = players;

    const onlineCountElement = this.container.querySelector('#lobby-online-count')!;
    const totalCount = players.length + 1;

    if (this.worldSync.isEnabled) {
      onlineCountElement.textContent = `${totalCount} в сети`;
      onlineCountElement.className = 'lobby-online-status-pill online';
      // Update mobile indicator
      this.mobileIndicator.innerHTML = `<span class="mobile-online-dot online"></span><span class="mobile-online-text">${totalCount}</span>`;
    } else {
      this.setDisconnectedStatus();
    }

    const dropdownList = this.container.querySelector('#lobby-dropdown-list')!;
    dropdownList.innerHTML = '';

    const currentName = this.escapeHtml(this.worldSync.getOrCreateUserName());
    const currentColor = this.worldSync.getOrCreateUserColor();
    const meItem = document.createElement('div');
    meItem.className = 'lobby-dropdown-item me';
    meItem.innerHTML = `
      <span class="lobby-color-dot" style="background-color: ${currentColor}; box-shadow: 0 0 6px ${currentColor}"></span>
      <span style="font-weight: 600">${currentName} (Вы)</span>
    `;
    dropdownList.appendChild(meItem);

    for (const player of players) {
      const item = document.createElement('div');
      item.className = 'lobby-dropdown-item';
      item.innerHTML = `
        <span class="lobby-color-dot" style="background-color: ${player.color}; box-shadow: 0 0 6px ${player.color}"></span>
        <span>${this.escapeHtml(player.name)}</span>
      `;
      dropdownList.appendChild(item);
    }
  }

  public setDisconnectedStatus(): void {
    const onlineCountElement = this.container.querySelector('#lobby-online-count')!;
    onlineCountElement.textContent = 'Отключён';
    onlineCountElement.className = 'lobby-online-status-pill offline';
    // Update mobile indicator
    this.mobileIndicator.innerHTML = `<span class="mobile-online-dot offline"></span><span class="mobile-online-text">—</span>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
