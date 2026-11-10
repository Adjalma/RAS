import React, { useState } from 'react';
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
  Plus,
  Radio,
} from 'lucide-react';
import { LoraNode, SerpenteFormation, SerpenteMember } from '../types/tactical';
import { calculateDistanceMeters } from '../utils/geo';

interface SerpenteFormationModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: LoraNode[];
  formations: SerpenteFormation[];
  onSaveFormation: (formation: SerpenteFormation) => void;
  onRemoveFormation: (id: string) => void;
  onFocusNode: (id: number) => void;
}

export const SerpenteFormationModal: React.FC<SerpenteFormationModalProps> = ({
  isOpen,
  onClose,
  nodes,
  formations,
  onSaveFormation,
  onRemoveFormation,
  onFocusNode,
}) => {
  // 1 = Serpente 1, 2 = Serpente 2
  const [activeTab, setActiveTab] = useState<'serpente_1' | 'serpente_2'>('serpente_1');

  // Dados locais de criação para a Serpente 1
  const form1 = formations.find((f) => f.id === 'serpente_1') || null;
  const form2 = formations.find((f) => f.id === 'serpente_2') || null;

  const [name1, setName1] = useState('Serpente 1 — Pelotão Alfa');
  const [name2, setName2] = useState('Serpente 2 — Pelotão Bravo (Macaé)');

  const [leader1, setLeader1] = useState<number | null>(nodes[0]?.id || null);
  const [leader2, setLeader2] = useState<number | null>(2572); // Nó 0a0c Macaé

  const [gapLimit, setGapLimit] = useState(250);

  if (!isOpen) return null;

  const handleStart = (id: 'serpente_1' | 'serpente_2') => {
    const leaderId = id === 'serpente_1' ? leader1 : leader2;
    const name = id === 'serpente_1' ? name1 : name2;
    const color = id === 'serpente_1' ? '#06b6d4' : '#f97316';

    if (!leaderId) return;

    // Para Serpente 2 (Macaé), prioriza os rádios 0a0c, dc08, CCCC, DDDD
    let assignedNodes = nodes;
    if (id === 'serpente_2') {
      const macaeGroup = nodes.filter((n) => n.id === 2572 || n.id === 56328 || n.name.includes('0a0c') || n.name.includes('dc08') || n.name === 'CCCC' || n.name === 'DDDD');
      if (macaeGroup.length > 0) assignedNodes = macaeGroup;
    }

    const members: SerpenteMember[] = assignedNodes.map((node, idx) => {
      const isLeader = node.id === leaderId;
      const pos = node.latest_positions?.[node.latest_positions.length - 1];
      return {
        nodeId: node.id,
        name: node.name,
        order: isLeader ? 0 : idx + 1,
        role: isLeader ? 'leader' : idx === assignedNodes.length - 1 ? 'sweep' : 'operator',
        lat: pos?.lat ?? null,
        lon: pos?.lon ?? null,
        battery: node.current_telemetry?.bat ?? null,
        lastSeen: pos ? new Date(pos.received_at).getTime() : null,
      };
    });

    members.sort((a, b) => a.order - b.order);

    const newFormation: SerpenteFormation = {
      id,
      name,
      color,
      isOpen: true,
      createdAt: Date.now(),
      leaderId,
      members,
      maxAcceptableGapMeters: gapLimit,
    };

    onSaveFormation(newFormation);
  };

  const currentActiveForm = activeTab === 'serpente_1' ? form1 : form2;
  const currentActiveId = activeTab;

  // Avaliação de distâncias da Serpente ativa
  const evaluatedMembers = (currentActiveForm?.members || []).map((member) => {
    const node = nodes.find((n) => n.id === member.nodeId);
    const leaderNode = nodes.find((n) => n.id === currentActiveForm?.leaderId);

    const memberPos = node?.latest_positions?.[node.latest_positions.length - 1];
    const leaderPos = leaderNode?.latest_positions?.[leaderNode.latest_positions.length - 1];

    let gap: number | undefined;
    if (memberPos && leaderPos && member.nodeId !== currentActiveForm?.leaderId) {
      gap = Math.round(calculateDistanceMeters(leaderPos.lat, leaderPos.lon, memberPos.lat, memberPos.lon));
    }

    const isBreached = gap != null && gap > (currentActiveForm?.maxAcceptableGapMeters || 250);

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
                CONTROLE DE MÚLTIPLAS SERPENTES TÁTICAS
              </h2>
              <p className="text-[11px] text-slate-400">
                Monitoramento simultâneo de 2 pelotões em marcha pelo mapa
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

        {/* Seletor de Serpentes: 1 e 2 */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950/60 px-4 pt-2 gap-3 text-xs">
          <button
            onClick={() => setActiveTab('serpente_1')}
            className={`px-4 py-2 border-b-2 font-bold transition-all flex items-center gap-2 ${
              activeTab === 'serpente_1'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            <span>SERPENTE 1 (ALFA)</span>
            {form1?.isOpen && (
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                ATIVA
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('serpente_2')}
            className={`px-4 py-2 border-b-2 font-bold transition-all flex items-center gap-2 ${
              activeTab === 'serpente_2'
                ? 'border-orange-500 text-orange-400 bg-orange-950/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            <span>SERPENTE 2 (BRAVO / MACAÉ)</span>
            {form2?.isOpen && (
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                ATIVA
              </span>
            )}
          </button>
        </div>

        {/* Conteúdo da Serpente Ativa */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-4 text-xs">
          {!currentActiveForm?.isOpen ? (
            /* Inicializar Formação */
            <div className="flex flex-col gap-4">
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 leading-relaxed">
                Defina os parâmetros para a <strong className={activeTab === 'serpente_1' ? 'text-cyan-400' : 'text-orange-400'}>{activeTab === 'serpente_1' ? 'Serpente 1' : 'Serpente 2 (Macaé)'}</strong>. O mapa traçará uma linha de comando exclusiva para esta coluna.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 font-semibold">Nome da Formação:</label>
                  <input
                    type="text"
                    value={activeTab === 'serpente_1' ? name1 : name2}
                    onChange={(e) => activeTab === 'serpente_1' ? setName1(e.target.value) : setName2(e.target.value)}
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
                      value={gapLimit}
                      onChange={(e) => setGapLimit(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400"
                    />
                    <span className="text-slate-400">metros</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-slate-400 font-semibold">Escolher Líder da Ponta:</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {nodes.map((node) => {
                    const isChosen = (activeTab === 'serpente_1' ? leader1 : leader2) === node.id;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => activeTab === 'serpente_1' ? setLeader1(node.id) : setLeader2(node.id)}
                        className={`p-2.5 rounded-lg border text-left text-xs transition-colors flex items-center justify-between ${
                          isChosen
                            ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 font-bold'
                            : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span>{node.name}</span>
                        {isChosen && <CheckCircle className="w-4 h-4 text-cyan-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => handleStart(activeTab)}
                className={`mt-2 py-3 px-4 rounded-xl font-bold text-slate-950 text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
                  activeTab === 'serpente_1'
                    ? 'bg-cyan-500 hover:bg-cyan-400 shadow-cyan-glow'
                    : 'bg-orange-500 hover:bg-orange-400 shadow-orange-glow'
                }`}
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>INICIAR {activeTab === 'serpente_1' ? 'SERPENTE 1' : 'SERPENTE 2'}</span>
              </button>
            </div>
          ) : (
            /* Monitoramento Ativo */
            <div className="flex flex-col gap-4">
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full animate-ping"
                      style={{ backgroundColor: currentActiveForm.color }}
                    />
                    <span className="font-bold text-sm text-slate-100">
                      {currentActiveForm.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tolerância de Distância: <span className="text-cyan-300 font-bold">{currentActiveForm.maxAcceptableGapMeters}m</span>
                  </p>
                </div>

                <button
                  onClick={() => onRemoveFormation(currentActiveId)}
                  className="py-1.5 px-3 rounded-lg bg-red-950/80 border border-red-500/40 text-red-400 hover:bg-red-900/60 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Square className="w-3.5 h-3.5 fill-red-400" />
                  <span>ENCERRAR</span>
                </button>
              </div>

              {/* Membros da Linha */}
              <div className="flex flex-col gap-2">
                {evaluatedMembers.map((member, idx) => {
                  const isLeader = member.nodeId === currentActiveForm.leaderId;
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
                            {idx + 1}
                          </span>
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
                              <span>Bateria: {member.battery != null ? `${member.battery}%` : '--'}</span>
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
