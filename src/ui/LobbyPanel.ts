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
  }

  public destroy(): void {
    this.container.remove();
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
