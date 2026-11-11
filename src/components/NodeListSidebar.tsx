import React, { useState, useMemo } from 'react';
import {
  Search,
  Battery,
  BatteryLow,
  BatteryWarning,
  Navigation,
  Radio,
  ChevronLeft,
  ChevronRight,
  Signal,
  Gauge,
  Compass,
  MapPin,
} from 'lucide-react';
import { LoraNode } from '../types/tactical';

interface NodeListSidebarProps {
  nodes: LoraNode[];
  selectedNodeId: number | null;
  onSelectNode: (id: number) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const NodeListSidebar: React.FC<NodeListSidebarProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  isOpen,
  onToggleOpen,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'gps' | 'low_bat'>('all');

  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      const matchText =
        n.name.toLowerCase().includes(search.toLowerCase()) ||
        n.id.toString().includes(search);

      if (!matchText) return false;

      if (filter === 'gps') {
        return n.latest_positions && n.latest_positions.length > 0;
      }
      if (filter === 'low_bat') {
        return (
          n.current_telemetry != null && n.current_telemetry.bat <= 25
        );
      }
      return true;
    });
  }, [nodes, search, filter]);

  const formatAge = (dateStr?: string) => {
    if (!dateStr) return 'Sem contato';
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return `há ${Math.max(0, seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `há ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `há ${hours}h`;
  };

  const renderBatteryIcon = (bat?: number | null) => {
    if (bat == null) return <span className="text-slate-600 text-[10px]">N/A</span>;
    if (bat <= 15) return <BatteryLow className="w-4 h-4 text-red-500 animate-pulse" />;
    if (bat <= 35) return <BatteryWarning className="w-4 h-4 text-amber-400" />;
    return <Battery className="w-4 h-4 text-emerald-400" />;
  };

  return (
    <aside
      className={`relative z-20 h-full bg-[#0b1324]/95 backdrop-blur-md border-r border-cyan-500/20 flex flex-col transition-all duration-300 ${
        isOpen ? 'w-80 sm:w-96' : 'w-0'
      }`}
    >
      {/* Botão de Toggle Sidebar */}
      <button
        onClick={onToggleOpen}
        className="absolute -right-7 top-4 z-30 w-7 h-10 bg-[#0b1324] border border-l-0 border-cyan-500/30 rounded-r-md flex items-center justify-center text-cyan-400 hover:text-white transition-colors shadow-lg"
        title={isOpen ? 'Recolher Painel' : 'Expandir Painel'}
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="flex flex-col h-full overflow-hidden p-3 gap-3">
          {/* Topo do painel com Busca */}
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou ID..."
                className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs font-tactical text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>

            {/* Filtros Rápidos */}
            <div className="flex items-center gap-1.5 text-[11px] font-tactical">
              <button
                onClick={() => setFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filter === 'all'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                Todos ({nodes.length})
              </button>
              <button
                onClick={() => setFilter('gps')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filter === 'gps'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                Com GPS
              </button>
              <button
                onClick={() => setFilter('low_bat')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filter === 'low_bat'
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40 font-semibold'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                Bat. Baixa
              </button>
            </div>
          </div>

          {/* Lista de Cards de Nós */}
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
            {filteredNodes.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs font-tactical">
                Nenhum dispositivo encontrado no setor.
              </div>
            ) : (
              filteredNodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const positions = node.latest_positions || [];
                const lastPos = positions.length > 0 ? positions[positions.length - 1] : null;
                const battery = node.current_telemetry?.bat ?? null;
                const hasGps = lastPos != null && lastPos.lat !== 0;

                return (
                  <div
                    key={node.id}
                    onClick={() => onSelectNode(node.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 select-none ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-400 shadow-cyan-glow ring-1 ring-cyan-400/50'
                        : 'bg-slate-900/60 border-slate-800/80 hover:border-cyan-500/30 hover:bg-slate-900/90'
                    }`}
                  >
                    {/* Linha 1: Nome, Indicador e Bateria */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            node.status === 'active'
                              ? 'bg-emerald-400 animate-ping-slow'
                              : node.status === 'stale'
                              ? 'bg-amber-400'
                              : 'bg-slate-600'
                          }`}
                          title={
                            node.status === 'active'
                              ? 'Enlace ativo (pacote recebido nos ultimos 5 min)'
                              : node.status === 'stale'
                              ? 'Enlace atrasado (5 a 15 min sem pacote)'
                              : 'Enlace offline (mais de 15 min sem pacote)'
                          }
                        />
                        <span className="font-bold font-tactical text-sm text-slate-100 tracking-wide">
                          {node.name}
                        </span>
                        <span className="text-[10px] font-tactical text-slate-500">
                          #{node.id}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 font-tactical text-xs text-slate-300">
                        {renderBatteryIcon(battery)}
                        <span className={battery != null && battery <= 20 ? 'text-red-400 font-bold' : ''}>
                          {battery != null ? `${battery}%` : '--'}
                        </span>
                      </div>
                    </div>

                    {/* Linha 2: Telemetria GPS (se houver) */}
                    {hasGps ? (
                      <div className="grid grid-cols-3 gap-1.5 py-1.5 px-2 bg-slate-950/60 rounded-lg text-[10px] font-tactical text-slate-400 my-1.5 border border-slate-800/50">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-cyan-400" />
                          <span>{lastPos.alt}m</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Signal className="w-3 h-3 text-emerald-400" />
                          <span>{lastPos.sat} sats</span>
                        </div>
                        <div className="flex items-center gap-1 justify-end">
                          <Gauge className="w-3 h-3 text-amber-400" />
                          <span>{lastPos.speed ? `${lastPos.speed.toFixed(0)} km/h` : '0 km/h'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="py-1 text-[10px] font-tactical text-slate-500 italic">
                        Aguardando sinal GPS / rádio...
                      </div>
                    )}

                    {/* Linha 3: Enlace, idade do GPS e contagem de trajetos */}
                    <div className="flex items-center justify-between text-[10px] font-tactical text-slate-400 mt-1">
                      <span
                        className="text-slate-500"
                        title="Ultimo pacote de qualquer tipo (posicao ou telemetria)"
                      >
                        enlace {formatAge(node.lastSeen)}
                      </span>
                      {hasGps && node.positionAgeMinutes != null && (
                        <span
                          className={
                            node.positionAgeMinutes <= 5
                              ? 'text-emerald-400/90'
                              : node.positionAgeMinutes <= 30
                              ? 'text-amber-400/90'
                              : 'text-orange-400/90'
                          }
                          title="Idade da ultima coordenada GPS"
                        >
                          GPS {formatAge(lastPos?.received_at)}
                        </span>
                      )}
                      <span className="text-cyan-400/80">
                        {positions.length} posições
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
