import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { GroupSeed, RegionGroupAssignment } from '../core/services';

export interface WorldSnapshot {
  groups: SyncedGroup[];
  ownership: SyncedRegionOwnership[];
}

export interface SyncedGroup extends GroupSeed {
  deletedAt: string | null;
}

export interface SyncedRegionOwnership extends RegionGroupAssignment {
  version: number;
  updatedAt: string;
  clientId: string | null;
  note?: string | null;
}


export interface WorldSubscriptionHandlers {
  onGroupChange: (group: SyncedGroup) => void;
  onOwnershipChange: (ownership: SyncedRegionOwnership) => void;
  onStatusChange?: (status: string) => void;
  onError?: (error: Error) => void;
  onPresenceChange?: (players: { clientId: string; name: string; color: string; x: number; y: number }[]) => void;
}

interface WorldGroupRow {
  world_id: string;
  id: string;
  name: string;
  color: string;
  capital_region_id: string | null;
  deleted_at: string | null;
  updated_at: string;
}

interface RegionOwnershipRow {
  world_id: string;
  region_id: string;
  group_id: string;
  note: string | null;
  version: number;
  updated_at: string;
  client_id: string | null;
}

interface WorldRow {
  id: string;
  schema_version: number;
  map_version: string;
}

export class WorldSyncService {
  public readonly worldId: string;
  public readonly clientId: string;

  private readonly client?: SupabaseClient;
  private readonly mapVersion: string;
  private channel?: RealtimeChannel;



  constructor(mapVersion: string) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    this.worldId = import.meta.env.VITE_WORLD_ID || 'default';
    this.mapVersion = mapVersion;
    this.clientId = this.getOrCreateClientId();

    if (supabaseUrl && supabaseAnonKey) {
      this.client = createClient(supabaseUrl, supabaseAnonKey);
    }
  }

  get isEnabled(): boolean {
    return Boolean(this.client);
  }

  async loadWorld(): Promise<WorldSnapshot> {
    this.assertEnabled();

    await this.ensureWorld();
    const groups = await this.fetchGroups();
    const ownership = await this.fetchOwnership();

    return { groups, ownership };
  }

  async addGroup(group: GroupSeed): Promise<void> {
    this.assertEnabled();
    await this.ensureWorld();

    const { error } = await this.client!
      .from('world_groups')
      .upsert({
        world_id: this.worldId,
        id: group.id,
        name: group.name,
        color: group.color,
        capital_region_id: group.capitalRegionId ?? null,
        deleted_at: null
      }, {
        onConflict: 'world_id,id'
      });

    if (error) throw error;
  }

  async assignRegion(regionId: string, groupId: string): Promise<void> {
    this.assertEnabled();

    const { error } = await this.client!.rpc('set_region_group', {
      p_world_id: this.worldId,
      p_region_id: regionId,
      p_group_id: groupId,
      p_client_id: this.clientId
    });

    if (error) throw error;
  }

  async saveRegionNote(regionId: string, note: string): Promise<void> {
    this.assertEnabled();

    const { error } = await this.client!.rpc('set_region_note', {
      p_world_id: this.worldId,
      p_region_id: regionId,
      p_note: note,
      p_client_id: this.clientId
    });

    if (error) throw error;
  }

  async removeGroup(groupId: string): Promise<void> {
    this.assertEnabled();

    const { error } = await this.client!.rpc('remove_group', {
      p_world_id: this.worldId,
      p_group_id: groupId,
      p_client_id: this.clientId
    });

    if (error) throw error;
  }

  async setCapital(groupId: string, regionId: string): Promise<void> {
    this.assertEnabled();

    const { error } = await this.client!.rpc('set_group_capital', {
      p_world_id: this.worldId,
      p_group_id: groupId,
      p_region_id: regionId
    });

    if (error) throw error;
  }

  subscribe(handlers: WorldSubscriptionHandlers): () => void {
    if (!this.client) return () => undefined;

    this.unsubscribe();
    this.channel = this.client
      .channel(`world:${this.worldId}`, {
        config: {
          presence: {
            key: this.clientId
          }
        }
      })
      .on(
        'presence',
        { event: 'sync' },
        () => {
          if (handlers.onPresenceChange) {
            const state = this.channel!.presenceState();
            const players: { clientId: string; name: string; color: string; x: number; y: number }[] = [];
            for (const key of Object.keys(state)) {
              if (key === this.clientId) continue;
              const presences = state[key] as any[];
              if (presences && presences.length > 0) {
                const p = presences[0];
                players.push({
                  clientId: key,
                  name: p.name || 'Аноним',
                  color: p.color || '#818cf8',
                  x: Number(p.x) || 0,
                  y: Number(p.y) || 0
                });
              }
            }
            handlers.onPresenceChange(players);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'world_groups', filter: `world_id=eq.${this.worldId}` },
        payload => {
          const row = payload.new as WorldGroupRow;
          if (row?.id) {
            handlers.onGroupChange(this.toSyncedGroup(row));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'region_ownership', filter: `world_id=eq.${this.worldId}` },
        payload => {
          const row = payload.new as RegionOwnershipRow;
          if (row?.region_id) {
            handlers.onOwnershipChange(this.toSyncedOwnership(row));
          }
        }
      )
      .subscribe(status => {
        handlers.onStatusChange?.(status);
        if (status === 'SUBSCRIBED') {
          const name = this.getOrCreateUserName();
          const color = this.getOrCreateUserColor();
          void this.channel!.track({
            name,
            color
          });
        }
      });

    return () => this.unsubscribe();
  }

  unsubscribe(): void {
    if (this.channel && this.client) {
      void this.client.removeChannel(this.channel);
      this.channel = undefined;
    }
  }

  private async ensureWorld(): Promise<void> {
    const row: WorldRow = {
      id: this.worldId,
      schema_version: 1,
      map_version: this.mapVersion
    };

    const { error } = await this.client!
      .from('worlds')
      .upsert(row, { onConflict: 'id' });

    if (error) throw error;
  }


  private async fetchGroups(): Promise<SyncedGroup[]> {
    const rows = await this.fetchAll<WorldGroupRow>('world_groups', 'world_id,id,name,color,capital_region_id,deleted_at,updated_at');
    return rows.map(row => this.toSyncedGroup(row));
  }

  private async fetchOwnership(): Promise<SyncedRegionOwnership[]> {
    const rows = await this.fetchAll<RegionOwnershipRow>('region_ownership', 'world_id,region_id,group_id,note,version,updated_at,client_id');
    return rows.map(row => this.toSyncedOwnership(row));
  }

  private async fetchAll<Row>(table: 'world_groups' | 'region_ownership', columns: string): Promise<Row[]> {
    const pageSize = 1000;
    const rows: Row[] = [];

    for (let from = 0; ; from += pageSize) {
      const to = from + pageSize - 1;
      const { data, error } = await this.client!
        .from(table)
        .select(columns)
        .eq('world_id', this.worldId)
        .range(from, to);

      if (error) throw error;
      const page = (data ?? []) as Row[];
      rows.push(...page);

      if (page.length < pageSize) break;
    }

    return rows;
  }

  private toSyncedGroup(row: WorldGroupRow): SyncedGroup {
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      capitalRegionId: row.capital_region_id,
      deletedAt: row.deleted_at
    };
  }

  private toSyncedOwnership(row: RegionOwnershipRow): SyncedRegionOwnership {
    return {
      regionId: row.region_id,
      groupId: row.group_id,
      version: row.version,
      updatedAt: row.updated_at,
      clientId: row.client_id,
      note: row.note
    };
  }

  private assertEnabled(): void {
    if (!this.client) {
      throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    }
  }

  private getOrCreateClientId(): string {
    const storageKey = 'hexagonal_cells_client_id';
    const fallback = () => crypto.randomUUID();

    try {
      const existing = window.localStorage.getItem(storageKey);
      if (existing) return existing;

      const created = fallback();
      window.localStorage.setItem(storageKey, created);
      return created;
    } catch {
      return fallback();
    }
  }

  public getOrCreateUserName(): string {
    const storageKey = 'hexagonal_cells_username';
    try {
      const existing = window.localStorage.getItem(storageKey);
      if (existing) return existing;
    } catch {}

    const titles = ['Император', 'Маршал', 'Генерал', 'Канцлер', 'Герцог', 'Барон', 'Президент', 'Консул', 'Сенатор', 'Вождь'];
    const names = ['Альфа', 'Бета', 'Гамма', 'Дельта', 'Зета', 'Омега', 'Арес', 'Гелиос', 'Атлас', 'Орион'];
    const randomTitle = titles[Math.floor(Math.random() * titles.length)];
    const randomName = names[Math.floor(Math.random() * names.length)];
    const num = Math.floor(Math.random() * 900) + 100;
    const created = `${randomTitle} ${randomName} #${num}`;
    
    try {
      window.localStorage.setItem(storageKey, created);
    } catch {}
    return created;
  }

  public getOrCreateUserColor(): string {
    const storageKey = 'hexagonal_cells_usercolor';
    try {
      const existing = window.localStorage.getItem(storageKey);
      if (existing) return existing;
    } catch {}

    const colors = [
      '#818cf8', // Premium Indigo
      '#f87171', // Soft Red
      '#38bdf8', // Sky Blue
      '#34d399', // Emerald
      '#fb7185', // Rose
      '#fbbf24', // Amber
      '#a78bfa', // Lavender
      '#2dd4bf', // Teal
      '#f472b6'  // Pink
    ];
    const created = colors[Math.floor(Math.random() * colors.length)];
    
    try {
      window.localStorage.setItem(storageKey, created);
    } catch {}
    return created;
  }

  updatePresence(_x: number, _y: number): void {
    // Mouse tracking disabled
  }

  updateUsername(newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) return;

    try {
      window.localStorage.setItem('hexagonal_cells_username', trimmed);
    } catch {}

    if (this.client && this.channel) {
      const color = this.getOrCreateUserColor();
      void this.channel.track({
        name: trimmed,
        color
      });
    }
  }
}
