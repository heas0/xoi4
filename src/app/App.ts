import { HexGridService, GroupService, RegionService, TerrainService } from '../core/services';
import type { GroupSeed } from '../core/services';
import { MapRenderer } from '../rendering/MapRenderer';
import { ControlPanel } from '../ui/ControlPanel';
import { ContextMenu } from '../ui/ContextMenu';
import { Tooltip } from '../ui/Tooltip';
import { DebugPanel } from '../ui/DebugPanel';
import { LobbyPanel } from '../ui/LobbyPanel';
import { LayersPanel } from '../ui/LayersPanel';
import { WorldSyncService } from '../sync';
import type { SyncedGroup, SyncedRegionOwnership, WorldBaseline, WorldSnapshot } from '../sync';
import countryAssignmentsData from '../data/countryAssignments.generated.json';

export interface AppConfig {
  canvas: HTMLCanvasElement;
  mapImage: HTMLImageElement;
  mapImageData: ImageData;
  hexSize: number;
}

type CountryAssignmentRow = [number, number, string];

interface CountryAssignmentsData {
  source: {
    repo: string;
    version: string;
    file: string;
  };
  map: {
    width: number;
    height: number;
    hexSize: number;
    projection: string;
  };
  countries: GroupSeed[];
  assignments: CountryAssignmentRow[];
}

const COUNTRY_ASSIGNMENTS = countryAssignmentsData as CountryAssignmentsData;

/**
 * Главный класс приложения
 */
export class App {
  private canvas: HTMLCanvasElement;
  private mapImage: HTMLImageElement;

  // Services
  private hexGridService: HexGridService;
  private groupService: GroupService;
  private regionService: RegionService;
  private terrainService: TerrainService;

  // Renderer
  private renderer: MapRenderer;

  // UI
  private contextMenu: ContextMenu;
  private tooltip: Tooltip;
  private controlPanel: ControlPanel;
  private lobbyPanel!: LobbyPanel;
  private syncStatusElement: HTMLElement;

  // State
  private selectedGroupId: string = 'none';
  private worldSync: WorldSyncService;
  private unsubscribeWorldSync?: () => void;
  private isWorldLive = false;

  constructor(config: AppConfig) {
    this.canvas = config.canvas;
    this.mapImage = config.mapImage;
    this.worldSync = new WorldSyncService(this.createMapVersion(config));
    this.syncStatusElement = this.createSyncStatusElement();

    // Initialize services
    this.hexGridService = new HexGridService({
      hexSize: config.hexSize,
      mapWidth: config.mapImage.width,
      mapDepth: config.mapImage.height
    });

    this.groupService = new GroupService();
    this.groupService.createGroups(COUNTRY_ASSIGNMENTS.countries);
    this.regionService = new RegionService(
      this.hexGridService,
      this.createCountryAssignmentMap(config)
    );

    this.terrainService = new TerrainService(
      config.mapImageData.data,
      config.mapImageData.width,
      config.mapImageData.height,
      this.hexGridService
    );

    // Initialize renderer
    this.renderer = new MapRenderer({
      canvas: this.canvas,
      mapImage: this.mapImage,
      regionService: this.regionService,
      groupService: this.groupService
    });

    // Initialize UI
    this.controlPanel = new ControlPanel('side-panel', this.groupService, {
      onGroupSelect: (groupId: string, focusCamera?: boolean) => {
        this.selectedGroupId = groupId;
        console.log('Selected group:', groupId);
        if (groupId !== 'none' && focusCamera) {
          this.renderer.focusOnGroup(groupId);
        }
      },
      onAddGroup: (name) => {
        this.addGroup(name);
      },
      onRemoveGroup: (groupId) => {
        this.removeGroup(groupId);
      }
    });

    this.contextMenu = new ContextMenu(this.groupService, {
      onSelectGroup: (_groupId) => {
        // This callback is updated dynamically in onContextMenu
      },
      onAddGroup: () => {
        const input = document.getElementById('newGroupName') as HTMLInputElement;
        if (input) {
          input.focus();
          const panel = document.getElementById('side-panel');
          if (panel && panel.classList.contains('collapsed')) {
            const toggle = panel.querySelector('.panel-toggle') as HTMLElement;
            if (toggle) toggle.click();
          }
        }
      },
      onSetCapital: (regionId: string, groupId: string) => {
        this.setCapital(groupId, regionId);
      }
    });

    this.tooltip = new Tooltip(this.groupService);

    // Initialize Debug Panel (passive stats)
    new DebugPanel(
      this.hexGridService,
      this.regionService,
      this.mapImage
    );

    // Initialize Lobby Panel (interactive presence, bottom-right)
    this.lobbyPanel = new LobbyPanel(this.worldSync);

    // Initialize Layers Panel
    new LayersPanel(this.renderer);
  }

  private createMapVersion(config: AppConfig): string {
    return [
      COUNTRY_ASSIGNMENTS.source.version,
      `${config.mapImage.width}x${config.mapImage.height}`,
      `hex${config.hexSize}`,
      COUNTRY_ASSIGNMENTS.map.projection
    ].join(':');
  }

  private createSyncStatusElement(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'sync-status sync-status-disabled';
    element.textContent = 'Мир не синхронизирован (Отключён)';

    const appRoot = document.getElementById('app');
    if (appRoot) {
      appRoot.appendChild(element);
    }

    return element;
  }

  private createCountryAssignmentMap(config: AppConfig): Map<string, string> {
    const metadata = COUNTRY_ASSIGNMENTS.map;
    const compatible = metadata.width === config.mapImage.width &&
      metadata.height === config.mapImage.height &&
      metadata.hexSize === config.hexSize &&
      metadata.projection === 'equirectangular';

    if (!compatible) {
      console.warn(
        'Country assignments metadata does not match the current map. ' +
        `Generated: ${metadata.width}x${metadata.height}, hex=${metadata.hexSize}, ${metadata.projection}. ` +
        `Current: ${config.mapImage.width}x${config.mapImage.height}, hex=${config.hexSize}.`
      );
      return new Map();
    }

    console.log(
      `Loaded ${COUNTRY_ASSIGNMENTS.assignments.length} country cell assignments ` +
      `from ${COUNTRY_ASSIGNMENTS.source.repo} ${COUNTRY_ASSIGNMENTS.source.version}.`
    );

    return new Map(
      COUNTRY_ASSIGNMENTS.assignments.map(([q, r, countryId]) => [`${q},${r}`, countryId])
    );
  }

  /**
   * Инициализация приложения
   */
  async initialize(): Promise<void> {
    console.log('Starting renderer...');
    this.renderer.start();

    // Run heavy tasks in the next frame to allow UI to render first
    setTimeout(async () => {
      console.log('Analyzing terrain...');
      this.terrainService.analyzeAllCells();

      console.log('Generating regions...');
      this.regionService.generateRegions();

      await this.initializeWorldSync();

      console.log('Initialization complete.');
    }, 100);

    this.setupEventListeners();
  }

  private async initializeWorldSync(): Promise<void> {
    if (!this.worldSync.isEnabled) {
      this.isWorldLive = false;
      this.setSyncStatus('disabled', 'Мир не синхронизирован (Отключён)');
      console.warn('Supabase sync is disabled. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable shared world state.');
      return;
    }

    this.setSyncStatus('connecting', 'Процесс синхронизации... (сохранение изменений)');

    try {
      const snapshot = await this.worldSync.loadWorld(this.createWorldBaseline());
      this.applyWorldSnapshot(snapshot);
      this.subscribeToWorldChanges();
    } catch (error) {
      console.error('Failed to initialize Supabase sync:', error);
      this.isWorldLive = false;
      this.setSyncStatus('disabled', 'Мир не синхронизирован (Отключён)');
    }
  }

  private createWorldBaseline(): WorldBaseline {
    return {
      groups: this.groupService.getAllGroups().map(group => ({
        id: group.id,
        name: group.name,
        color: group.color,
        capitalRegionId: group.capitalRegionId ?? null
      })),
      ownership: this.regionService.getAllRegions().map(region => ({
        regionId: region.id,
        groupId: region.groupId
      }))
    };
  }

  private applyWorldSnapshot(snapshot: WorldSnapshot): void {
    const deletedGroupIds: string[] = [];

    for (const group of snapshot.groups) {
      if (group.deletedAt) {
        deletedGroupIds.push(group.id);
        continue;
      }

      this.groupService.upsertGroup({
        id: group.id,
        name: group.name,
        color: group.color,
        capitalRegionId: group.capitalRegionId
      }, { emit: false });
    }

    this.groupService.notifyGroupsChanged();

    this.regionService.setRegionGroups(snapshot.ownership.map(ownership => ({
      regionId: ownership.regionId,
      groupId: ownership.groupId
    })));

    for (const groupId of deletedGroupIds) {
      this.applyDeletedGroup(groupId);
    }

    this.renderer.needsRedraw = true;
  }

  private subscribeToWorldChanges(): void {
    this.unsubscribeWorldSync?.();
    this.unsubscribeWorldSync = this.worldSync.subscribe({
      onGroupChange: group => this.applySyncedGroup(group),
      onOwnershipChange: ownership => this.applySyncedOwnership(ownership),
      onPresenceChange: players => {
        this.lobbyPanel.updatePlayers(players);
        this.renderer.setRemoteCursors(players);
      },
      onStatusChange: status => {
        if (status === 'SUBSCRIBED') {
          this.isWorldLive = true;
          this.setSyncStatus('synced', 'Мир синхронизирован (live)');
          this.lobbyPanel.updatePlayers(this.lobbyPanel.players);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.isWorldLive = false;
          console.warn(`Supabase Realtime status: ${status}. World sync is disconnected.`);
          this.setSyncStatus('disabled', 'Мир не синхронизирован (Отключён)');
          this.lobbyPanel.setDisconnectedStatus();
        }
      }
    });
  }

  private applySyncedGroup(group: SyncedGroup): void {
    if (group.deletedAt) {
      this.applyDeletedGroup(group.id);
      return;
    }

    this.groupService.upsertGroup({
      id: group.id,
      name: group.name,
      color: group.color,
      capitalRegionId: group.capitalRegionId
    });
    this.renderer.needsRedraw = true;
  }

  private applySyncedOwnership(ownership: SyncedRegionOwnership): void {
    this.regionService.setRegionGroup(ownership.regionId, ownership.groupId);
  }

  private applyDeletedGroup(groupId: string): void {
    this.groupService.removeGroup(groupId);
    this.regionService.clearGroupAssignments(groupId);

    if (this.selectedGroupId === groupId) {
      this.selectedGroupId = 'none';
      this.controlPanel.setSelectedGroup('none');
    }
  }

  private assignRegion(regionId: string, groupId: string): void {
    const region = this.regionService.getRegion(regionId);
    if (!region || region.groupId === groupId) return;

    const previousGroupId = region.groupId;
    this.regionService.setRegionGroup(regionId, groupId);

    this.syncMutation(
      () => this.worldSync.assignRegion(regionId, groupId),
      () => this.regionService.setRegionGroup(regionId, previousGroupId)
    );
  }

  private addGroup(name: string): void {
    const group = this.groupService.addGroup(name);

    this.syncMutation(
      () => this.worldSync.addGroup({
        id: group.id,
        name: group.name,
        color: group.color,
        capitalRegionId: group.capitalRegionId ?? null
      }),
      () => this.groupService.removeGroup(group.id)
    );
  }

  private removeGroup(groupId: string): void {
    if (groupId === 'none') return;

    const group = this.groupService.getGroup(groupId);
    if (!group) return;

    const groupSnapshot = {
      id: group.id,
      name: group.name,
      color: group.color,
      capitalRegionId: group.capitalRegionId ?? null
    };
    const previousAssignments = this.regionService.getRegionsByGroup(groupId).map(region => ({
      regionId: region.id,
      groupId
    }));

    this.groupService.removeGroup(groupId);
    this.regionService.clearGroupAssignments(groupId);

    if (this.selectedGroupId === groupId) {
      this.selectedGroupId = 'none';
      this.controlPanel.setSelectedGroup('none');
    }

    this.syncMutation(
      () => this.worldSync.removeGroup(groupId),
      () => {
        this.groupService.upsertGroup(groupSnapshot);
        this.regionService.setRegionGroups(previousAssignments);
      }
    );
  }

  private setCapital(groupId: string, regionId: string): void {
    const group = this.groupService.getGroup(groupId);
    if (!group) return;

    const previousCapitalRegionId = group.capitalRegionId;
    this.groupService.setGroupCapital(groupId, regionId);
    this.renderer.needsRedraw = true;

    this.syncMutation(
      () => this.worldSync.setCapital(groupId, regionId),
      () => {
        this.groupService.setGroupCapital(groupId, previousCapitalRegionId);
        this.renderer.needsRedraw = true;
      }
    );
  }

  private syncMutation(operation: () => Promise<void>, rollback: () => void): void {
    if (!this.worldSync.isEnabled) return;

    this.setSyncStatus('saving', 'Процесс синхронизации... (сохранение изменений)');

    void operation()
      .then(() => {
        if (this.isWorldLive) {
          this.setSyncStatus('synced', 'Мир синхронизирован (live)');
        } else {
          this.setSyncStatus('disabled', 'Мир не синхронизирован (Отключён)');
        }
      })
      .catch(error => {
        console.error('Failed to persist world change:', error);
        rollback();
        this.renderer.needsRedraw = true;
        this.setSyncStatus('disabled', 'Мир не синхронизирован (Отключён)');
      });
  }

  private setSyncStatus(status: 'disabled' | 'connecting' | 'saving' | 'synced' | 'error', message: string): void {
    this.syncStatusElement.className = `sync-status sync-status-${status}`;
    this.syncStatusElement.textContent = message;
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('click', this.onClick.bind(this));
    this.canvas.addEventListener('contextmenu', this.onContextMenu.bind(this));
    window.addEventListener('resize', () => this.renderer.recenter());
  }

  private onMouseMove(e: MouseEvent): void {
    const worldPos = this.renderer.viewportInstance.screenToWorld(e.clientX, e.clientY);
    const cell = this.hexGridService.getCellAtWorld(worldPos.x, worldPos.y);
    const region = cell ? this.regionService.getRegionByCell(cell.q, cell.r) : undefined;

    if (cell && region) {
      this.renderer.setHoveredCell(cell);
      this.renderer.setHoveredRegion(region);

      // Show tooltip
      this.tooltip.show(cell, this.regionService);
    } else {
      this.renderer.setHoveredCell(null);
      this.renderer.setHoveredRegion(null);
      this.tooltip.hide();
    }
  }

  private onClick(e: MouseEvent): void {
    if (this.contextMenu.visible) {
      this.contextMenu.hide();
      return;
    }

    const worldPos = this.renderer.viewportInstance.screenToWorld(e.clientX, e.clientY);
    const cell = this.hexGridService.getCellAtWorld(worldPos.x, worldPos.y);

    if (cell) {
      const region = this.regionService.getRegionByCell(cell.q, cell.r);
      if (region) {
        console.log('Clicked region:', region.id, 'Group:', region.groupId);

        // Рисуем регион выбранным государством только если включен режим рисования
        if (this.controlPanel.isEditModeActive() && this.selectedGroupId !== 'none') {
          this.assignRegion(region.id, this.selectedGroupId);
        } else if (region.groupId && region.groupId !== 'none') {
          // Иначе (в обычном режиме) прокручиваем список к государству-владельцу
          this.controlPanel.scrollToGroup(region.groupId);
        }
      }
    }
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();

    const worldPos = this.renderer.viewportInstance.screenToWorld(e.clientX, e.clientY);
    const cell = this.hexGridService.getCellAtWorld(worldPos.x, worldPos.y);

    if (cell) {
      const region = this.regionService.getRegionByCell(cell.q, cell.r);
      if (region) {
        const currentRegionId = region.id;

        // Update callback to target this region
        (this.contextMenu as any).config.onSelectGroup = (groupId: string) => {
          this.assignRegion(currentRegionId, groupId);
        };

        const group = this.groupService.getGroup(region.groupId);
        const groupName = group ? group.name : '';

        this.contextMenu.show(e.clientX, e.clientY, {
          id: region.id,
          groupId: region.groupId,
          groupName
        });
      }
    }
  }

  public destroy(): void {
    console.log('🧹 Cleaning up previous App instance...');
    
    // Unsubscribe from world sync
    this.unsubscribeWorldSync?.();
    this.worldSync.unsubscribe();
    
    // Stop map renderer
    this.renderer.stop();
    
    // Remove UI elements
    this.lobbyPanel?.destroy?.();
    this.syncStatusElement?.remove();
  }
}
