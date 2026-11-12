import { NodeListResponse, NodeDetailResponse, LoraNode } from '../types/tactical';

// Em ambiente de navegador, usar rotas relativas para passar pelo proxy Vite (sem CORS)
const isBrowser = typeof window !== 'undefined';
const defaultBase = isBrowser ? '' : 'https://logistica.legendariosrio.com.br';

export const DEFAULT_CONFIG = {
  apiBaseUrl: defaultBase,
  wsUrl: isBrowser ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws` : 'wss://logistica.legendariosrio.com.br/ws',
  // Defina VITE_MESH_AUTH_HEADER em .env.local para desenvolvimento.
  // Nunca coloque o valor real no código ou em arquivos versionados.
  authHeader: (import.meta.env.VITE_MESH_AUTH_HEADER as string | undefined) ?? '',
  mqttHost: 'mqtt.legendariosrio.com.br',
  mqttPort: 1883,
};

export class TacticalApiClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(baseUrl = DEFAULT_CONFIG.apiBaseUrl, authHeader = DEFAULT_CONFIG.authHeader) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.authHeader = authHeader;
  }

  setCredentials(baseUrl: string, authHeader: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.authHeader = authHeader;
  }

  private async request<T>(endpoint: string): Promise<T> {
    // Se a baseUrl for vazia, usa endpoint relativo (proxy)
    const url = this.baseUrl ? `${this.baseUrl}${endpoint}` : endpoint;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    // Adiciona o cabeçalho Authorization
    if (this.authHeader) {
      headers['Authorization'] = this.authHeader;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      throw new Error(`API Error ${res.status}: ${res.statusText} at ${endpoint}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * GET /v1/node
   * Retorna todos os rastreadores com últimas posições e telemetria atual.
   *
   * O backend filtra por um timestamp ABSOLUTO no parâmetro `from`
   * (formato `2006-01-02T15:04:05`). Sem ele, o servidor aplica a janela
   * default de 3 horas e devolve `latest_positions` vazio para os rádios
   * que não transmitiram nesse intervalo.
   */
  async getNodes(hours?: number): Promise<LoraNode[]> {
    let query = '';
    if (hours && hours > 0) {
      const from = new Date(Date.now() - hours * 3600 * 1000);
      // Formato Go: 2006-01-02T15:04:05 (UTC, sem milissegundos, sem Z)
      const stamp = from.toISOString().slice(0, 19);
      query = `?from=${encodeURIComponent(stamp)}`;
    }
    const data = await this.request<NodeListResponse>(`/v1/node${query}`);
    return data.nodes || [];
  }

  /**
   * GET /v1/node/:id
   * Retorna histórico completo do rastreador especificado
   */
  async getNodeDetail(nodeId: number): Promise<LoraNode> {
    const data = await this.request<NodeDetailResponse>(`/v1/node/${nodeId}`);
    return data.node;
  }
}

export const api = new TacticalApiClient();
