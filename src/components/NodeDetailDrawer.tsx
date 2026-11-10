import React, { useState } from 'react';
import {
  X,
  Battery,
  MapPin,
  Navigation,
  Compass,
  Gauge,
  Signal,
  History,
  Copy,
  Check,
  Radio,
  TrendingUp,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { LoraNode } from '../types/tactical';
import { formatTacticalCoords } from '../utils/geo';

interface NodeDetailDrawerProps {
  node: LoraNode | null;
  onClose: () => void;
  onLoadFullHistory: (nodeId: number) => Promise<void>;
}

export const NodeDetailDrawer: React.FC<NodeDetailDrawerProps> = ({
  node,
  onClose,
  onLoadFullHistory,
}) => {
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!node) return null;

  const positions = node.latest_positions || [];
  const lastPos = positions.length > 0 ? positions[positions.length - 1] : null;
  const battery = node.current_telemetry?.bat ?? null;

  const handleLoadHistory = async () => {
    setLoadingHistory(true);
    try {
      await onLoadFullHistory(node.id);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCopyCoords = () => {
    if (!lastPos) return;
    const text = `${lastPos.lat.toFixed(6)}, ${lastPos.lon.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Dados para o gráfico de altitude / velocidade
  const chartData = positions.map((p, idx) => ({
    index: idx + 1,
    alt: p.alt,
    speed: p.speed ? Math.round(p.speed) : 0,
    time: new Date(p.received_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[460px] bg-[#0b1324]/98 backdrop-blur-xl border-l border-cyan-500/30 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 font-tactical">
      {/* Topo do Drawer */}
      <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center gap-3">
          <div
            className="w-3.5 h-3.5 rounded-full shadow-cyan-glow"
            style={{ backgroundColor: node.color || '#06b6d4' }}
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100 tracking-wider">
                {node.name}
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                ID: {node.id}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Status: <span className={node.status === 'active' ? 'text-emerald-400 font-bold' : 'text-slate-500'}>{node.status?.toUpperCase() || 'OFFLINE'}</span>
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

      {/* Corpo com Scroll */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Bloco de Bateria */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <Battery className="w-4 h-4 text-cyan-400" />
              <span>Bateria do Dispositivo</span>
            </div>
            <span className={`font-bold ${battery != null && battery <= 20 ? 'text-red-400' : 'text-emerald-400'}`}>
              {battery != null ? `${battery}%` : 'Não informada'}
            </span>
          </div>
          {battery != null && (
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(0, battery))}%`,
                  backgroundColor: battery <= 20 ? '#ef4444' : battery <= 50 ? '#f59e0b' : '#10b981',
                }}
              />
            </div>
          )}
        </div>

        {/* Localização Atual e Coordenadas */}
        {lastPos ? (
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <span>Último Fix Geográfico</span>
              </div>
              <button
                onClick={handleCopyCoords}
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-800 text-cyan-300 hover:bg-cyan-950/60 border border-slate-700 transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800/80 text-xs flex flex-col gap-1">
              <div className="text-slate-300 tracking-wider">
                {lastPos.lat.toFixed(6)}°, {lastPos.lon.toFixed(6)}°
              </div>
              <div className="text-[11px] text-cyan-400/90 font-mono">
                {formatTacticalCoords(lastPos.lat, lastPos.lon)}
              </div>
            </div>

            {/* Grid de Métricas Táticas */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Altitude:</span>
                </div>
                <span className="font-bold text-slate-200">{lastPos.alt} m</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Signal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Satélites:</span>
                </div>
                <span className="font-bold text-slate-200">{lastPos.sat}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Gauge className="w-3.5 h-3.5 text-amber-400" />
                  <span>Velocidade:</span>
                </div>
                <span className="font-bold text-slate-200">
                  {lastPos.speed ? `${lastPos.speed.toFixed(1)} km/h` : '0 km/h'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Compass className="w-3.5 h-3.5 text-purple-400" />
                  <span>Rumo:</span>
                </div>
                <span className="font-bold text-slate-200">
                  {lastPos.heading ? `${lastPos.heading}°` : '0°'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-500">
            Nenhum pacote de posição registrado ainda para este dispositivo.
          </div>
        )}

        {/* Gráfico de Telemetria de Altitude / Velocidade */}
        {chartData.length > 2 && (
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <span className="font-bold">Perfil de Altitude da Missão</span>
              </div>
              <span className="text-[10px] text-slate-500">{chartData.length} pontos</span>
            </div>

            <div className="h-36 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="altGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} unit="m" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0b1324',
                      borderColor: '#06b6d4',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="alt"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#altGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Botão de Carga Completa do Histórico da Rota /v1/node/:id */}
        <button
          onClick={handleLoadHistory}
          disabled={loadingHistory}
          className="w-full py-2.5 px-4 rounded-xl bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500 hover:text-slate-950 transition-all text-xs font-bold tracking-wider flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
        >
          <History className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
          <span>{loadingHistory ? 'CARREGANDO TRILHA COMPLETA...' : 'REQUISITAR HISTÓRICO TOTAL (REST /v1/node/:id)'}</span>
        </button>
      </div>
    </div>
  );
};
