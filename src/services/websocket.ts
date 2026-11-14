import { WSBaseMessage } from '../types/tactical';
import { DEFAULT_CONFIG } from './api';

export type WSConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'polling_fallback';

export interface WSListener {
  onMessage: (msg: WSBaseMessage) => void;
  onStatusChange: (status: WSConnectionStatus, error?: string) => void;
}

export class TacticalWebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private authHeader: string;
  private listeners: Set<WSListener> = new Set();
  private status: WSConnectionStatus = 'disconnected';
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private isExplicitlyClosed = false;
  private pingInterval: number | null = null;
  private pollingFallbackInterval: number | null = null;
  private onPollingTick: (() => Promise<void>) | null = null;
  /** Ultimo instante em que houve trafego de dados (WS ou polling). */
  private lastDataAt = 0;
  private dataTimer: number | null = null;

  constructor(url = DEFAULT_CONFIG.wsUrl, authHeader = DEFAULT_CONFIG.authHeader) {
    this.url = url;
    this.authHeader = authHeader;
  }

  setUrls(wsUrl: string, authHeader: string) {
    this.url = wsUrl;
    this.authHeader = authHeader;
    if (this.status === 'connected' || this.status === 'connecting') {
      this.disconnect();
      this.connect();
    }
  }

  setPollingFallback(tickFn: () => Promise<void>) {
    this.onPollingTick = tickFn;
  }

  subscribe(listener: WSListener): () => void {
    this.listeners.add(listener);
    listener.onStatusChange(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyStatus(status: WSConnectionStatus, error?: string) {
    // Nao sobrescreve um estado com dados frescos por um "desconectado".
    // Se o socket caiu mas o polling segue entregando dados, o estado
    // operacional e "degradado", nunca "offline".
    if (status === 'disconnected' && this.status === 'polling_fallback') {
      this.status = 'polling_fallback';
      this.listeners.forEach((l) => l.onStatusChange(this.status, error));
      return;
    }
    this.status = status;
    this.listeners.forEach((l) => l.onStatusChange(this.status, error));
  }

  private notifyMessage(msg: WSBaseMessage) {
    this.markData();
    this.listeners.forEach((l) => l.onMessage(msg));
  }

  /** Registra que houve dados recebidos com sucesso. */
  private markData() {
    this.lastDataAt = Date.now();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (this.status !== 'connected') {
        this.status = 'connected';
        this.listeners.forEach((l) => l.onStatusChange(this.status));
      }
    } else {
      if (this.status !== 'polling_fallback') {
        this.status = 'polling_fallback';
        this.listeners.forEach((l) => l.onStatusChange(this.status));
      }
    }
  }

  connect() {
    this.isExplicitlyClosed = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Só notifica "connecting" na primeira conexão ou se estiver desconectado,
    // para não sobrescrever um polling de dados ativo.
    if (this.status === 'disconnected') {
      this.notifyStatus('connecting');
    }

    try {
      let wsUri = this.url;
      if (typeof window !== 'undefined' && !this.url.startsWith('ws://') && !this.url.startsWith('wss://')) {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUri = `${proto}//${window.location.host}${this.url.startsWith('/') ? '' : '/'}${this.url}`;
      }

      this.ws = new WebSocket(wsUri);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.stopPollingFallback();
        this.notifyStatus('connected');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.notifyMessage(data);
        } catch (err) {
          console.debug('[WS] Non-JSON payload received:', event.data);
        }
      };

      this.ws.onerror = () => {
        this.startPollingFallback();
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        if (!this.isExplicitlyClosed) {
          this.startPollingFallback();
          this.scheduleReconnect();
        }
      };
    } catch (error: any) {
      this.startPollingFallback();
      this.scheduleReconnect();
    }
  }

  private startPollingFallback() {
    if (this.pollingFallbackInterval != null) return;
    this.notifyStatus('polling_fallback');
    const tick = () => {
      if (this.onPollingTick) {
        this.onPollingTick()
          .then(() => this.markData())
          .catch(() => {});
      }
    };
    tick();
    this.pollingFallbackInterval = window.setInterval(tick, 4000);
  }

  private stopPollingFallback() {
    if (this.pollingFallbackInterval != null) {
      clearInterval(this.pollingFallbackInterval);
      this.pollingFallbackInterval = null;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch {}
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.pingInterval != null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.isExplicitlyClosed || this.reconnectTimer != null) return;
    this.reconnectAttempts++;
    // Intervalo suave de tentativa de WebSocket sem travar o polling
    const delay = Math.min(10000 * this.reconnectAttempts, 45000);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  disconnect() {
    this.isExplicitlyClosed = true;
    this.stopHeartbeat();
    this.stopPollingFallback();
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.status = 'disconnected';
    this.listeners.forEach((l) => l.onStatusChange(this.status));
  }
}

export const wsService = new TacticalWebSocketService();
