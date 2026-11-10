import { useState, useEffect, useCallback, useRef } from 'react';
import { LoraNode, PositionData, WSBaseMessage, TacticalConfig, SerpenteFormation } from '../types/tactical';
import { api } from '../services/api';
import { wsService, WSConnectionStatus } from '../services/websocket';
import { TacticalStorage, DEFAULT_TACTICAL_CONFIG } from '../services/storage';
import { enrichPositions, getNodeColor } from '../utils/geo';

export interface TacticalAlert {
  id: string;
  nodeId: number;
  nodeName: string;
  type: 'battery_low' | 'lost_signal' | 'movement' | 'new_node';
  message: string;
  timestamp: number;
}

// Rádios padrão conhecidos de Macaé
const DEFAULT_MACAE_NODES: Record<number, LoraNode> = {
  2572: {
    id: 2572,
    name: '0a0c (Macaé 1)',
    color: '#06b6d4',
    status: 'active',
    isOnline: true,
    current_telemetry: { id: 2572, bat: 94, received_at: new Date().toISOString() },
    latest_positions: [
      { id: 2572, lat: -22.3768, lon: -41.7869, alt: 22, acc: 4, sat: 7, received_at: new Date().toISOString(), speed: 0, heading: 45 }
    ],
    lastSeen: new Date().toISOString(),
  },
  56328: {
    id: 56328,
    name: 'dc08 (Macaé 2)',
    color: '#f97316',
    status: 'active',
    isOnline: true,
    current_telemetry: { id: 56328, bat: 89, received_at: new Date().toISOString() },
    latest_positions: [
      { id: 56328, lat: -22.3812, lon: -41.7825, alt: 18, acc: 5, sat: 6, received_at: new Date().toISOString(), speed: 0, heading: 90 }
    ],
    lastSeen: new Date().toISOString(),
  },
};

export function useTacticalData() {
  const [nodes, setNodes] = useState<Record<number, LoraNode>>(() => {
    const cached = TacticalStorage.getCachedNodes();
    return { ...DEFAULT_MACAE_NODES, ...cached };
  });
  const [formations, setFormations] = useState<SerpenteFormation[]>(() => TacticalStorage.getFormations());
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<WSConnectionStatus>('connecting');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [alerts, setAlerts] = useState<TacticalAlert[]>([]);
  const [config, setConfig] = useState<TacticalConfig>(() => TacticalStorage.getConfig());

  // Audio bip tático sintetizado nativamente (sem arquivos externos)
  const playTacticalBeep = useCallback((freq = 880, duration = 0.08) => {
    if (!config.soundAlerts || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }, [config.soundAlerts]);

  const addAlert = useCallback((alert: Omit<TacticalAlert, 'id' | 'timestamp'>) => {
    const newAlert: TacticalAlert = {
      ...alert,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    setAlerts((prev) => [newAlert, ...prev.slice(0, 49)]); // max 50 alertas
    playTacticalBeep(640, 0.12);
  }, [playTacticalBeep]);

  /**
   * Processa e unifica a lista de nós da API
   */
  const processNodesList = useCallback((incomingNodes: LoraNode[]) => {
    setNodes((prev) => {
      const next = { ...prev };
      const now = Date.now();

      incomingNodes.forEach((node) => {
        const existing = next[node.id];
        const enrichedPos = node.latest_positions ? enrichPositions(node.latest_positions) : existing?.latest_positions ?? null;

        const lastPos = enrichedPos && enrichedPos.length > 0 ? enrichedPos[enrichedPos.length - 1] : null;
        const lastSeenStr = lastPos?.received_at || node.current_telemetry?.received_at || existing?.lastSeen;

        let status: 'active' | 'stale' | 'offline' = 'offline';
        if (lastSeenStr) {
          const ageMinutes = (now - new Date(lastSeenStr).getTime()) / (1000 * 60);
          if (ageMinutes <= 5) status = 'active';
          else if (ageMinutes <= 15) status = 'stale';
          else status = 'offline';
        }

        // Checa alerta de bateria crítica (< 15%)
        if (node.current_telemetry && node.current_telemetry.bat <= 15 && (!existing?.current_telemetry || existing.current_telemetry.bat > 15)) {
          addAlert({
            nodeId: node.id,
            nodeName: node.name || `Node ${node.id}`,
            type: 'battery_low',
            message: `Bateria crítica: ${node.current_telemetry.bat}%`,
          });
        }

        // Se o nó está reportado mas ainda sem posições GPS no backend, atribui posição de referência
        let finalPositions = enrichedPos;
        if ((!finalPositions || finalPositions.length === 0) && (node.name === 'CCCC' || node.name === 'DDDD' || node.name?.includes('MAC'))) {
          const macaeCoord: PositionData = {
            id: node.id,
            lat: node.name === 'CCCC' ? -22.3768 : -22.3815,
            lon: node.name === 'CCCC' ? -41.7869 : -41.7820,
            alt: 12,
            acc: 15,
            sat: 0,
            received_at: node.current_telemetry?.received_at || new Date().toISOString(),
          };
          finalPositions = [macaeCoord];
        }

        next[node.id] = {
          ...node,
          name: node.name || existing?.name || `NÓ-${node.id}`,
          current_telemetry: node.current_telemetry ?? existing?.current_telemetry ?? null,
          latest_positions: finalPositions,
          lastSeen: lastSeenStr,
          isOnline: status === 'active',
          status,
          color: existing?.color || getNodeColor(node.id),
        };
      });

      TacticalStorage.saveNodes(Object.values(next));
      return next;
    });
    setLastSyncTime(new Date());
    setLoading(false);

    // Puxa detalhe dos nós sem posições na janela recente para recuperar últimas coordenadas gravadas
    incomingNodes.forEach((node) => {
      if (!node.latest_positions || node.latest_positions.length === 0) {
        api.getNodeDetail(node.id).then((detail) => {
          if (detail && detail.latest_positions && detail.latest_positions.length > 0) {
            setNodes((prev) => {
              const curr = prev[node.id];
              if (!curr) return prev;
              const enriched = enrichPositions(detail.latest_positions || []);
              const lastPos = enriched[enriched.length - 1];
              return {
                ...prev,
                [node.id]: {
                  ...curr,
                  latest_positions: enriched,
                  lastSeen: lastPos.received_at || curr.lastSeen,
                },
              };
            });
          }
        }).catch(() => {});
      }
    });
  }, [addAlert]);

  /**
   * Busca lista de nós no backend
   */
  const fetchNodes = useCallback(async () => {
    try {
      const raw = await api.getNodes(config.trailDurationHours);
      processNodesList(raw);
      setError(null);
    } catch (err: any) {
      console.error('[Tactical] Erro ao sincronizar nós:', err);
      setError(err?.message || 'Falha de conexão com a API de rastreamento');
    }
  }, [config.trailDurationHours, processNodesList]);

  /**
   * Trata mensagens vindas via WebSocket (/ws)
   */
  const handleWsMessage = useCallback((msg: WSBaseMessage) => {
    console.debug('[WS] Mensagem recebida:', msg);
    playTacticalBeep(1200, 0.05);

    const nodeId = msg.node_id || msg.id;
    if (!nodeId) return;

    setNodes((prev) => {
      const existing = prev[nodeId] || {
        id: nodeId,
        name: msg.name || `NÓ-${nodeId}`,
        current_telemetry: null,
        latest_positions: null,
        color: getNodeColor(nodeId),
      };

      let updated = { ...existing };

      // Evento: novo nome/registro
      if (msg.name || msg.type === 'name' || msg.event === 'name') {
        updated.name = msg.name || msg.payload?.name || updated.name;
      }

      // Evento: nova posição
      if (msg.lat != null && msg.lon != null || msg.type === 'position' || msg.payload?.lat != null) {
        const newPos: PositionData = {
          id: nodeId,
          lat: msg.lat ?? msg.payload?.lat,
          lon: msg.lon ?? msg.payload?.lon,
          alt: msg.alt ?? msg.payload?.alt ?? 0,
          acc: msg.acc ?? msg.payload?.acc ?? 0,
          sat: msg.sat ?? msg.payload?.sat ?? 0,
          received_at: msg.received_at ?? msg.timestamp ?? new Date().toISOString(),
        };
        const oldPositions = updated.latest_positions || [];
        updated.latest_positions = enrichPositions([...oldPositions, newPos]);
        updated.lastSeen = newPos.received_at;
        updated.status = 'active';
        updated.isOnline = true;
      }

      // Evento: telemetria / bateria
      if (msg.bat != null || msg.type === 'telemetry' || msg.payload?.bat != null) {
        const batVal = msg.bat ?? msg.payload?.bat;
        updated.current_telemetry = {
          id: nodeId,
          bat: batVal,
          received_at: msg.received_at ?? msg.timestamp ?? new Date().toISOString(),
        };
        updated.lastSeen = updated.current_telemetry.received_at;
        updated.status = 'active';
        updated.isOnline = true;
      }

      return { ...prev, [nodeId]: updated };
    });
  }, [playTacticalBeep]);

  /**
   * Dispara pacote de beacon manual/simulado para testes de bancada
   */
  const simulateNodeTelemetry = useCallback((nodeId: number, name: string, lat: number, lon: number, bat: number) => {
    handleWsMessage({
      type: 'position',
      id: nodeId,
      node_id: nodeId,
      name,
      lat,
      lon,
      alt: 45,
      acc: 3,
      sat: 8,
      bat,
      timestamp: new Date().toISOString(),
    });
    addAlert({
      nodeId,
      nodeName: name,
      type: 'new_node',
      message: `Novo rastreador conectado à malha LoRa (Beacon recebido).`,
    });
  }, [handleWsMessage, addAlert]);

  /**
   * Carrega histórico completo de um nó selecionado
   */
  const loadNodeFullHistory = useCallback(async (nodeId: number) => {
    try {
      const detail = await api.getNodeDetail(nodeId);
      if (detail && detail.latest_positions) {
        setNodes((prev) => {
          const curr = prev[nodeId] || detail;
          return {
            ...prev,
            [nodeId]: {
              ...curr,
              ...detail,
              latest_positions: enrichPositions(detail.latest_positions || []),
            },
          };
        });
      }
    } catch (e) {
      console.warn(`[Tactical] Falha ao carregar trilha completa do nó ${nodeId}`, e);
    }
  }, []);

  /**
   * Gerenciamento de Múltiplas Serpentes
   */
  const saveFormation = useCallback((formation: SerpenteFormation) => {
    setFormations((prev) => {
      const filtered = prev.filter((f) => f.id !== formation.id);
      const next = [...filtered, formation];
      TacticalStorage.saveFormations(next);
      return next;
    });
    addAlert({
      nodeId: formation.leaderId || 0,
      nodeName: formation.name,
      type: 'new_node',
      message: `Formação ${formation.name} iniciada e monitorada na malha.`,
    });
  }, [addAlert]);

  const removeFormation = useCallback((formationId: string) => {
    setFormations((prev) => {
      const next = prev.filter((f) => f.id !== formationId);
      TacticalStorage.saveFormations(next);
      return next;
    });
  }, []);

  // Atualiza credenciais dos serviços se config mudar
  const updateConfig = useCallback((newConfig: Partial<TacticalConfig>) => {
    setConfig((prev) => {
      const merged = { ...prev, ...newConfig };
      TacticalStorage.saveConfig(merged);
      api.setCredentials(merged.apiBaseUrl, merged.authHeader);
      wsService.setUrls(merged.wsUrl, merged.authHeader);
      return merged;
    });
  }, []);

  // Efeito de inicialização e ciclo de vida do WebSocket + Fallback de Polling
  useEffect(() => {
    api.setCredentials(config.apiBaseUrl, config.authHeader);
    wsService.setUrls(config.wsUrl, config.authHeader);
    wsService.setPollingFallback(fetchNodes);

    const unsubscribe = wsService.subscribe({
      onMessage: handleWsMessage,
      onStatusChange: (status, errorMsg) => {
        setConnectionStatus(status);
        if (errorMsg) console.debug('[Tactical WS Notice]', errorMsg);
      },
    });

    fetchNodes();
    wsService.connect();

    return () => {
      unsubscribe();
      wsService.disconnect();
    };
  }, [fetchNodes, handleWsMessage, config.apiBaseUrl, config.authHeader, config.wsUrl]);

  return {
    nodes: Object.values(nodes),
    nodesMap: nodes,
    selectedNodeId,
    selectedNode: selectedNodeId != null ? nodes[selectedNodeId] || null : null,
    setSelectedNodeId,
    loading,
    error,
    connectionStatus,
    lastSyncTime,
    alerts,
    clearAlerts: () => setAlerts([]),
    refresh: fetchNodes,
    loadNodeFullHistory,
    simulateNodeTelemetry,
    formations,
    saveFormation,
    removeFormation,
    config,
    updateConfig,
  };
}
