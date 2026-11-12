/**
 * Envelope de sincronizacao entre estacoes (PCs) do RAS.
 * Travelado pelo relay WebSocket <-> MQTT.
 */

export interface RasSyncEnvelope {
  /** Identificador unico da aba/navegador que originou a mensagem. */
  origin: string;
  /** Tipo de estado sincronizado. */
  kind: 'formation' | 'formations' | 'selection';
  /** Payload do estado. */
  data: unknown;
  /** Timestamp de emissao (epoch ms). */
  ts: number;
}

export type RasSyncListener = (envelope: RasSyncEnvelope) => void;
