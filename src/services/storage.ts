import { LoraNode, SerpenteFormation, TacticalConfig } from '../types/tactical';
import { DEFAULT_CONFIG } from './api';

const STORAGE_KEYS = {
  CONFIG: 'ras.tactical.config.v1',
  CACHED_NODES: 'ras.tactical.nodes.v1',
  SERPENTE: 'ras.tactical.serpente.v1',
  BOOKMARKED_NODES: 'ras.tactical.bookmarks.v1',
} as const;

export const DEFAULT_TACTICAL_CONFIG: TacticalConfig = {
  apiBaseUrl: DEFAULT_CONFIG.apiBaseUrl,
  wsUrl: DEFAULT_CONFIG.wsUrl,
  authHeader: DEFAULT_CONFIG.authHeader,
  mqttHost: DEFAULT_CONFIG.mqttHost,
  mqttPort: DEFAULT_CONFIG.mqttPort,
  autoCenterFollow: false,
  soundAlerts: true,
  showTrails: true,
  showMeshLinks: true,
  showAccuracyCircles: true,
  trailDurationHours: 72,
  speedUnit: 'kmh',
};

export class TacticalStorage {
  static getConfig(): TacticalConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (!raw) return DEFAULT_TACTICAL_CONFIG;
      return { ...DEFAULT_TACTICAL_CONFIG, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_TACTICAL_CONFIG;
    }
  }

  static saveConfig(config: TacticalConfig): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
    } catch (e) {
      console.warn('[Storage] Quota exceeded saving config', e);
    }
  }

  static getCachedNodes(): Record<number, LoraNode> {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CACHED_NODES);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  static saveNodes(nodes: LoraNode[]): void {
    try {
      const map: Record<number, LoraNode> = {};
      nodes.forEach((n) => {
        map[n.id] = n;
      });
      localStorage.setItem(STORAGE_KEYS.CACHED_NODES, JSON.stringify(map));
    } catch (e) {
      console.warn('[Storage] Quota exceeded saving nodes', e);
    }
  }

  static getFormations(): SerpenteFormation[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SERPENTE);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Suporta retrocompatibilidade se for objeto único
      if (!Array.isArray(parsed)) {
        return parsed ? [parsed] : [];
      }
      return parsed;
    } catch {
      return [];
    }
  }

  static saveFormations(formations: SerpenteFormation[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SERPENTE, JSON.stringify(formations));
    } catch {}
  }

  static getSerpente(): SerpenteFormation | null {
    const all = this.getFormations();
    return all.length > 0 ? all[0] : null;
  }

  static saveSerpente(formation: SerpenteFormation | null): void {
    if (!formation) {
      this.saveFormations([]);
    } else {
      this.saveFormations([formation]);
    }
  }
}
