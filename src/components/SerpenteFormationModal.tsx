import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  ShieldAlert,
  CheckCircle,
  Play,
  Square,
  AlertTriangle,
  ArrowDown,
  MapPin,
  Battery,
  Clock,
} from 'lucide-react';
import { LoraNode, SerpenteFormation, SerpenteMember } from '../types/tactical';
import { calculateDistanceMeters } from '../utils/geo';
import { TacticalStorage } from '../services/storage';

interface SerpenteFormationModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: LoraNode[];
  onFocusNode: (id: number) => void;
}

export const SerpenteFormationModal: React.FC<SerpenteFormationModalProps> = ({
  isOpen,
  onClose,
  nodes,
  onFocusNode,
}) => {
  const [formation, setFormation] = useState<SerpenteFormation | null>(() => TacticalStorage.getSerpente());
  const [formationName, setFormationName] = useState('Pelotão Charlie - Coluna');
  const [maxGapMeters, setMaxGapMeters] = useState(250);
  const [selectedLeaderId, setSelectedLeaderId] = useState<number | null>(null);

  // Se não houver formação aberta, pré-seleciona o primeiro nó como líder
  useEffect(() => {
    if (!selectedLeaderId && nodes.length > 0) {
      setSelectedLeaderId(nodes[0].id);
    }
  }, [nodes, selectedLeaderId]);

  if (!isOpen) return null;

  // Iniciar formação Serpente
  const handleStartFormation = () => {
    if (!selectedLeaderId) return;

    const leaderNode = nodes.find((n) => n.id === selectedLeaderId);
    const leaderPos = leaderNode?.latest_positions?.[leaderNode.latest_positions.length - 1];

    // Monta a lista ordenada de membros
    const members: SerpenteMember[] = nodes.map((node, idx) => {
      const isLeader = node.id === selectedLeaderId;
      const pos = node.latest_positions?.[node.latest_positions.length - 1];
      return {
        nodeId: node.id,
        name: node.name,
        order: isLeader ? 0 : idx + 1,
        role: isLeader ? 'leader' : idx === nodes.length - 1 ? 'sweep' : 'operator',
        lat: pos?.lat ?? null,
        lon: pos?.lon ?? null,
        battery: node.current_telemetry?.bat ?? null,
        lastSeen: pos ? new Date(pos.received_at).getTime() : null,
      };
    });

    // Ordena: líder primeiro, depois os demais
    members.sort((a, b) => a.order - b.order);

    const newFormation: SerpenteFormation = {
      id: `serpente-${Date.now()}`,
      name: formationName,
      isOpen: true,
      createdAt: Date.now(),
      leaderId: selectedLeaderId,
      members,
      maxAcceptableGapMeters: maxGapMeters,
    };

    setFormation(newFormation);
    TacticalStorage.saveSerpente(newFormation);
  };

  // Encerrar formação
  const handleStopFormation = () => {
    setFormation(null);
    TacticalStorage.saveSerpente(null);
  };

  // Atualiza distâncias em relação ao líder
  const evaluatedMembers = (formation?.members || []).map((member) => {
    const node = nodes.find((n) => n.id === member.nodeId);
    const leaderNode = nodes.find((n) => n.id === formation?.leaderId);

    const memberPos = node?.latest_positions?.[node.latest_positions.length - 1];
    const leaderPos = leaderNode?.latest_positions?.[leaderNode.latest_positions.length - 1];

    let gap: number | undefined;
    if (memberPos && leaderPos && member.nodeId !== formation?.leaderId) {
      gap = Math.round(calculateDistanceMeters(leaderPos.lat, leaderPos.lon, memberPos.lat, memberPos.lon));
    }

    const isBreached = gap != null && gap > (formation?.maxAcceptableGapMeters || 250);

    return {
      ...member,
      name: node?.name || member.name,
      battery: node?.current_telemetry?.bat ?? member.battery,
      gap,
      isBreached,
    };
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 font-tactical select-none">
      <div className="w-full max-w-2xl bg-[#0b1324] border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-cyan-500/20 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-950 border border-cyan-500/50 text-cyan-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 tracking-wider">
                FORMAÇÃO TÁTICA SERPENTE
              </h2>
              <p className="text-[11px] text-slate-400">
                Alinhamento e controle de dispersão da tropa/equipe em marcha
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-5">
          {!formation?.isOpen ? (
            /* Formulário de Inicialização */
            <div className="flex flex-col gap-4">
              <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs text-cyan-300 leading-relaxed">
                O protocolo <strong>Serpente</strong> monitora a coluna inteira em campo. Selecione o líder (guia da ponta) e o raio máximo de dispersão. Caso qualquer operador se afaste além do limite de segurança ou perca sinal LoRa, o sistema dispara alertas imediatos.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 font-semibold">Nome da Formação:</label>
                  <input
                    type="text"
                    value={formationName}
                    onChange={(e) => setFormationName(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 font-semibold">Distância Máxima de Tolerância:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="50"
                      max="2000"
                      step="50"
                      value={maxGapMeters}
                      onChange={(e) => setMaxGapMeters(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400"
                    />
                    <span className="text-slate-400 text-xs">metros</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-semibold">Definir Líder da Ponta (Ponta da Serpente):</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {nodes.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setSelectedLeaderId(node.id)}
                      className={`p-2.5 rounded-lg border text-left text-xs transition-colors flex items-center justify-between ${
                        selectedLeaderId === node.id
                          ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 font-bold shadow-cyan-glow'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>{node.name}</span>
                      {selectedLeaderId === node.id && <CheckCircle className="w-4 h-4 text-cyan-400" />}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleStartFormation}
                disabled={!selectedLeaderId}
                className="mt-2 py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm tracking-wider flex items-center justify-center gap-2 shadow-cyan-glow transition-all disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>INICIAR PROTOCOLO SERPENTE</span>
              </button>
            </div>
          ) : (
            /* Monitor da Formação Ativa */
            <div className="flex flex-col gap-4">
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-cyan-500/30 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="font-bold text-sm text-slate-100">{formation.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Distância Máx. Tolerada: <span className="text-cyan-300 font-bold">{formation.maxAcceptableGapMeters}m</span>
                  </p>
                </div>

                <button
                  onClick={handleStopFormation}
                  className="py-1.5 px-3 rounded-lg bg-red-950/80 border border-red-500/40 text-red-400 hover:bg-red-900/60 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Square className="w-3.5 h-3.5 fill-red-400" />
                  <span>FECHAR SERPENTE</span>
                </button>
              </div>

              {/* Coluna Visual da Formação */}
              <div className="flex flex-col gap-2">
                {evaluatedMembers.map((member, idx) => {
                  const isLeader = member.nodeId === formation.leaderId;
                  return (
                    <React.Fragment key={member.nodeId}>
                      <div
                        onClick={() => {
                          onFocusNode(member.nodeId);
                          onClose();
                        }}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          member.isBreached
                            ? 'bg-red-950/40 border-red-500 shadow-red-glow'
                            : isLeader
                            ? 'bg-cyan-950/40 border-cyan-400 shadow-cyan-glow'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-slate-800 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold text-xs">
                            {idx + 1}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-100">
                                {member.name}
                              </span>
                              {isLeader && (
                                <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold">
                                  LÍDER DA PONTA
                                </span>
                              )}
                              {member.isBreached && (
                                <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-red-500/20 text-red-300 border border-red-500/40 font-bold flex items-center gap-1 animate-pulse">
                                  <AlertTriangle className="w-3 h-3 text-red-400" />
                                  GAP CRÍTICO
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
                              <span>Bat: {member.battery != null ? `${member.battery}%` : '--'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right text-xs font-mono">
                          {isLeader ? (
                            <span className="text-cyan-400 font-bold">REFERÊNCIA (0m)</span>
                          ) : member.gap != null ? (
                            <span className={member.isBreached ? 'text-red-400 font-bold text-sm' : 'text-slate-300'}>
                              {member.gap}m da ponta
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">Sem GPS</span>
                          )}
                        </div>
                      </div>

                      {idx < evaluatedMembers.length - 1 && (
                        <div className="flex justify-center -my-1 text-cyan-500/40">
                          <ArrowDown className="w-4 h-4" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
