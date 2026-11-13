export interface TelemetryData {
  id: number;
  bat: number; // Porcentagem da bateria (0 - 100+)
  received_at: string;
}

export interface PositionData {
  id: number;
  lat: number;
  lon: number;
  alt: number;
  acc: number;
  sat: number;
  received_at: string;
  speed?: number;
  heading?: number;
}

export interface LoraNode {
  id: number;
  name: string;
  short_name?: string;
  long_name?: string;
  role?: string;
  isFixed?: boolean;
  current_telemetry: TelemetryData | null;
  latest_positions: PositionData[] | null;
  // Campos derivados em tempo real no frontend:
  /** Timestamp do último pacote de qualquer tipo (posição ou telemetria). */
  lastSeen?: string;
  /** Timestamp do último pacote de POSIÇÃO com GPS. */
  lastPositionAt?: string;
  /** Verdadeiro quando o rádio ainda transmite (enlace vivo). */
  isOnline?: boolean;
  /** Situação do enlace: active (<5m), stale (5-15m), offline (>15m). */
  status?: 'active' | 'stale' | 'offline';
  /** Idade da última posição GPS em minutos. null se nunca houve fix. */
  positionAgeMinutes?: number | null;
  /** true para nós criados pelo simulador de ensaio (não são rádios reais). */
  isSimulation?: boolean;
  color?: string; // Cor tática atribuída
  callsign?: string;
}

export interface NodeListResponse {
  nodes: LoraNode[];
}

export interface NodeDetailResponse {
  node: LoraNode;
}

// Eventos recebidos via WebSocket (/ws)
export type WSEventType = 'name' | 'position' | 'telemetry' | 'node_registered';

export interface WSBaseMessage {
  type?: WSEventType;
  event?: string;
  node_id?: number;
  id?: number;
  payload?: any;
  timestamp?: string;
  [key: string]: any;
}

// Membro da formação "Serpente" (Marcha tática / Linha de pelotão)
export interface SerpenteMember {
  nodeId: number;
  name: string;
  order: number; // 0 = Ponto/Ponta, 1..N = Coluna, Último = Retaguarda
  role: 'leader' | 'scout' | 'operator' | 'sweep';
  lat: number | null;
  lon: number | null;
  battery: number | null;
  lastSeen: number | null;
  distanceFromLeaderMeters?: number;
}

export interface SerpenteFormation {
  id: string;
  name: string;
  color: string; // Ex: '#06b6d4' para Serpente 1, '#f97316' para Serpente 2
  isOpen: boolean;
  createdAt: number;
  leaderId: number | null;
  members: SerpenteMember[];
  maxAcceptableGapMeters: number; // Alerta se alguém distanciar mais que X metros
}

// Camadas de Mapa suportadas
export type MapTileLayer = 'dark' | 'satellite' | 'topo' | 'osm';

// Configurações do Sistema
export interface TacticalConfig {
  apiBaseUrl: string;
  wsUrl: string;
  authHeader: string; // Configurado localmente; nunca versionar o segredo
  mqttHost: string;
  mqttPort: number;
  autoCenterFollow: boolean;
  soundAlerts: boolean;
  showTrails: boolean;
  showMeshLinks: boolean;
  showAccuracyCircles: boolean;
  trailDurationHours: number; // 1, 3, 6, 24 horas
  speedUnit: 'kmh' | 'knots' | 'ms';
}
