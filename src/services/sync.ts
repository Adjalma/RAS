import { RasSyncEnvelope, RasSyncListener } from '../types/sync';

/**
 * Sincronizacao de estado entre PCs distintos.
 *
 * O broker `mqtt.legendariosrio.com.br` aceita apenas MQTT nativo (TCP 1883),
 * sem WebSocket. Como o browser nao fala TCP, usamos o relay local
 * (`server/sync-relay.mjs`) que converte WebSocket <-> MQTT.
 *
 * Se o relay nao estiver no ar, o sistema continua funcionando: apenas a
 * propagacao instantanea entre PCs fica indisponivel e o estado passa a
 * ser lido do backend no proximo ciclo.
 */

const SYNC_PATH = '/sync';

export interface SyncOptions {
  /** URL do relay. Vazio = mesma origem do app. */
  relayUrl?: string;
  /** Usuario do broker MQTT (usado pelo relay). */
  mqttUser?: string;
  /** Senha do broker MQTT (usada pelo relay). */
  mqttPass?: string;
}

export class RasSyncClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<RasSyncListener>();
  private originId: string;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private closed = false;
  private options: SyncOptions;

  constructor(options: SyncOptions = {}) {
    this.originId = `pc-${Math.random().toString(36).slice(2, 10)}`;
    this.options = options;
  }

  get id(): string {
    return this.originId;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  subscribe(listener: RasSyncListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  connect() {
    this.closed = false;
    this.open();
  }

  private resolveUrl(): string {
    const base = this.options.relayUrl ?? '';
    const wsBase = base
      ? base.replace(/^http/, 'ws').replace(/\/$/, '')
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    return `${wsBase}${SYNC_PATH}`;
  }

  private open() {
    try {
      this.ws = new WebSocket(this.resolveUrl());

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data) as RasSyncEnvelope;
          if (!envelope || envelope.origin === this.originId) return;
          this.listeners.forEach((l) => l(envelope));
        } catch {
          // payload invalido
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        try {
          this.ws?.close();
        } catch {}
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer != null) return;
    this.reconnectAttempts++;
    const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts), 15000);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  publish(kind: RasSyncEnvelope['kind'], data: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    const envelope: RasSyncEnvelope = {
      origin: this.originId,
      kind,
      data,
      ts: Date.now(),
    };
    try {
      this.ws.send(JSON.stringify(envelope));
      return true;
    } catch {
      return false;
    }
  }

  disconnect() {
    this.closed = true;
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }
}

export const rasSync = new RasSyncClient();
