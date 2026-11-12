import { useState, useEffect, useCallback, useRef } from 'react';
import { LoraNode, PositionData, WSBaseMessage, TacticalConfig, SerpenteFormation } from '../types/tactical';
import { api } from '../services/api';
import { wsService, WSConnectionStatus } from '../services/websocket';
import { TacticalStorage, DEFAULT_TACTICAL_CONFIG } from '../services/storage';
import { rasSync } from '../services/sync';
import { enrichPositions, getNodeColor } from '../utils/geo';

export interface TacticalAlert {
  id: string;
  nodeId: number;
  nodeName: string;
  type: 'battery_low' | 'lost_signal' | 'movement' | 'new_node';
  message: string;
  timestamp: number;
}

export function useTacticalData() {
  const [nodes, setNodes] = useState<Record<number, LoraNode>>(() => TacticalStorage.getCachedNodes());
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

      // Remove nos de ensaio (simulador) que nao estao mais ativos: eles
      // nao vem do backend e ficariam na lista como se fossem radios reais.
      const serverIds = new Set(incomingNodes.map((n) => n.id));
      Object.keys(next).forEach((key) => {
        const id = Number(key);
        const node = next[id];
        if (node?.isSimulation && !serverIds.has(id)) {
          delete next[id];
        }
      });

      incomingNodes.forEach((node) => {
        const existing = next[node.id];
        const enrichedPos = node.latest_positions ? enrichPositions(node.latest_positions) : existing?.latest_positions ?? null;

        const lastPos = enrichedPos && enrichedPos.length > 0 ? enrichedPos[enrichedPos.length - 1] : null;

        // O ENLACE é considered vivo se houve QUALQUER pacote (posição ou
        // telemetria). A POSIÇÃO GPS é um dado separado e pode ser antiga.
        const positionAt = lastPos?.received_at ?? existing?.lastPositionAt ?? null;
        const telemetryAt = node.current_telemetry?.received_at ?? existing?.current_telemetry?.received_at ?? null;

        const newestEvent = [positionAt, telemetryAt]
          .filter((v): v is string => !!v)
          .sort()
          .pop() ?? null;

        let status: 'active' | 'stale' | 'offline' = 'offline';
        if (newestEvent) {
          const ageMinutes = (now - new Date(newestEvent).getTime()) / (1000 * 60);
          if (ageMinutes <= 5) status = 'active';
          else if (ageMinutes <= 15) status = 'stale';
          else status = 'offline';
        }

        // Idade da posição GPS em minutos (null se nunca houve fix)
        const positionAgeMinutes = positionAt
          ? Math.max(0, Math.round((now - new Date(positionAt).getTime()) / 60000))
          : null;

        // Positions podem vir vazias na janela; nesse caso o histórico
        // completo do nó é consultado em background (ver fetchNodes).

        // Checa alerta de bateria crítica (< 15%)
        if (node.current_telemetry && node.current_telemetry.bat <= 15 && (!existing?.current_telemetry || existing.current_telemetry.bat > 15)) {
          addAlert({
            nodeId: node.id,
            nodeName: node.name || `Node ${node.id}`,
            type: 'battery_low',
            message: `Bateria crítica: ${node.current_telemetry.bat}%`,
          });
        }

        next[node.id] = {
          ...node,
          name: node.name || existing?.name || `NÓ-${node.id}`,
          current_telemetry: node.current_telemetry ?? existing?.current_telemetry ?? null,
          latest_positions: enrichedPos,
          lastSeen: newestEvent,
          lastPositionAt: positionAt,
          positionAgeMinutes,
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

    // Nodos sem posicoes na janela atual: busca o historico completo do no
    // para recuperar a ultima coordenada gravada (pode ser de horas atras).
    incomingNodes.forEach((node) => {
      if (!node.latest_positions || node.latest_positions.length === 0) {
        api.getNodeDetail(node.id).then((detail) => {
          if (detail && detail.latest_positions && detail.latest_positions.length > 0) {
            setNodes((prev) => {
              const curr = prev[node.id];
              if (!curr) return prev;
              const enriched = enrichPositions(detail.latest_positions || []);
              const lastPos = enriched[enriched.length - 1];
              const positionAt = lastPos.received_at;
              const newest = [positionAt, curr.current_telemetry?.received_at]
                .filter((v): v is string => !!v)
                .sort()
                .pop() ?? null;

              let status: 'active' | 'stale' | 'offline' = 'offline';
              if (newest) {
                const ageMin = (Date.now() - new Date(newest).getTime()) / 60000;
                if (ageMin <= 5) status = 'active';
                else if (ageMin <= 15) status = 'stale';
                else status = 'offline';
              }

              return {
                ...prev,
                [node.id]: {
                  ...curr,
                  latest_positions: enriched,
                  lastPositionAt: positionAt,
                  lastSeen: newest,
                  positionAgeMinutes: positionAt
                    ? Math.max(0, Math.round((Date.now() - new Date(positionAt).getTime()) / 60000))
                    : null,
                  status,
                  isOnline: status === 'active',
                },
              };
            });
          }
        }).catch(() => {});
      }
    });
  }, [addAlert]);

  /**
   * Busca lista de nós no backend.
   * Retorna true quando a leitura foi bem-sucedida, para que o serviço de
   * WebSocket possa tratar o polling como trafego de dados valido.
   */
  const fetchNodes = useCallback(async (): Promise<boolean> => {
    try {
      const raw = await api.getNodes(config.trailDurationHours);
      processNodesList(raw);
      setError(null);
      return true;
    } catch (err: any) {
      console.error('[Tactical] Erro ao sincronizar nós:', err);
      setError(err?.message || 'Falha de conexão com a API de rastreamento');
      return false;
    }
  }, [config.trailDurationHours, processNodesList]);

  /**
   * Trata mensagens vindas via WebSocket (/ws)
   */
  const handleWsMessage = useCallback((msg: WSBaseMessage) => {
    console.debug('[WS] Mensagem recebida:', msg);

    const nodeId = msg.node_id || msg.id;
    if (!nodeId) return;

    // Bip tático apenas em eventos relevantes (nova posição ou bateria crítica),
    // evitando bipe contínuo no ruído de telemetria.
    const isPosition = msg.lat != null && msg.lon != null;
    const isCriticalBattery = msg.bat != null && msg.bat <= 15;
    if (isPosition || isCriticalBattery) {
      playTacticalBeep(isCriticalBattery ? 640 : 1200, 0.05);
    }

    setNodes((prev) => {
      const existing = prev[nodeId] || {
        id: nodeId,
        name: `NÓ-${nodeId}`,
        current_telemetry: null,
        latest_positions: null,
        color: getNodeColor(nodeId),
      };

      let updated = { ...existing };

      // Evento de nome do backend (store.User -> campo JSON "short_name").
      // Nunca aceita nome vindo de outra fonte para nao sobrescrever o
      // callsign real do radio.
      const incomingName =
        typeof msg.short_name === 'string'
          ? msg.short_name
          : typeof msg.payload?.short_name === 'string'
          ? msg.payload.short_name
          : null;
      if (incomingName && incomingName.trim()) {
        updated.name = incomingName.trim();
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
        // Evita duplicar o mesmo fix (o polling REST reenvia o último ponto)
        const lastOld = oldPositions[oldPositions.length - 1];
        const isDuplicate =
          lastOld != null &&
          lastOld.lat === newPos.lat &&
          lastOld.lon === newPos.lon &&
          lastOld.received_at === newPos.received_at;

        if (!isDuplicate) {
          updated.latest_positions = enrichPositions([...oldPositions, newPos]);
        }
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
   * Cria um nó de ENSAIO (simulado) para treinamento de equipe.
   *
   * Fica separado dos rádios reais: o nome sempre começa com "SIM-" e o
   * nó é marcado como simulação, para nunca ser confundido com um
   * dispositivo real em operação.
   */
  const simulateNodeTelemetry = useCallback((nodeId: number, name: string, lat: number, lon: number, bat: number) => {
    const simName = name.startsWith('SIM-') ? name : `SIM-${name}`;

    setNodes((prev) => {
      const existing = prev[nodeId];
      const positions = existing?.latest_positions ?? [];
      const newPos: PositionData = {
        id: nodeId,
        lat,
        lon,
        alt: 45,
        acc: 3,
        sat: 8,
        received_at: new Date().toISOString(),
      };
      const enriched = enrichPositions([...positions, newPos]);

      return {
        ...prev,
        [nodeId]: {
          id: nodeId,
          name: simName,
          current_telemetry: { id: nodeId, bat, received_at: new Date().toISOString() },
          latest_positions: enriched,
          lastSeen: newPos.received_at,
          lastPositionAt: newPos.received_at,
          positionAgeMinutes: 0,
          status: 'active',
          isOnline: true,
          color: existing?.color || getNodeColor(nodeId),
          isSimulation: true,
        },
      };
    });

    addAlert({
      nodeId,
      nodeName: simName,
      type: 'new_node',
      message: `Nó de ensaio criado: ${simName} (não é um rádio real).`,
    });
  }, [addAlert]);

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
   * Gerenciamento de Múltiplas Serpentes.
   * Cada alteração é publicada no barramento de sincronização para que
   * apareça nas demais estações (PCs) em uso.
   */
  const saveFormation = useCallback((formation: SerpenteFormation) => {
    setFormations((prev) => {
      const filtered = prev.filter((f) => f.id !== formation.id);
      const next = [...filtered, formation];
      TacticalStorage.saveFormations(next);
      rasSync.publish('formations', next);
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
      rasSync.publish('formations', next);
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

  // Sincronizacao entre estacoes: formacoes e selecao de no
  // publicada no barramento e replicada nas outras maquinas.
  useEffect(() => {
    rasSync.connect();

    const unsubscribe = rasSync.subscribe((envelope) => {
      if (envelope.kind === 'formations') {
        const incoming = envelope.data as SerpenteFormation[];
        if (!Array.isArray(incoming)) return;
        setFormations(incoming);
        TacticalStorage.saveFormations(incoming);
        console.debug('[Sync] formacoes atualizadas de outra estacao');
      } else if (envelope.kind === 'selection') {
        const id = envelope.data as number | null;
        setSelectedNodeId(typeof id === 'number' ? id : null);
      }
    });

    return () => {
      unsubscribe();
      rasSync.disconnect();
    };
  }, []);

  // Publica a selecao de no para as demais estacoes
  useEffect(() => {
    rasSync.publish('selection', selectedNodeId);
  }, [selectedNodeId]);

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
