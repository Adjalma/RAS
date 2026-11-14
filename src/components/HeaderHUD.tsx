import React from 'react';
import {
  Radio,
  Wifi,
  WifiOff,
  Activity,
  Sliders,
  Bell,
  BellOff,
  Share2,
  Footprints,
  RefreshCw,
  Users,
  ShieldAlert,
} from 'lucide-react';
import { WSConnectionStatus } from '../services/websocket';
import { TacticalConfig } from '../types/tactical';

interface HeaderHUDProps {
  connectionStatus: WSConnectionStatus;
  totalNodes: number;
  activeNodes: number;
  lastSyncTime: Date | null;
  onRefresh: () => void;
  isRefreshing: boolean;
  config: TacticalConfig;
  onToggleConfig: (key: keyof TacticalConfig) => void;
  onOpenSettings: () => void;
  onOpenSerpente: () => void;
  isSerpenteOpen: boolean;
  alertsCount: number;
  onOpenAlerts: () => void;
  onOpenAddNode: () => void;
}

export const HeaderHUD: React.FC<HeaderHUDProps> = ({
  connectionStatus,
  totalNodes,
  activeNodes,
  lastSyncTime,
  onRefresh,
  isRefreshing,
  config,
  onToggleConfig,
  onOpenSettings,
  onOpenSerpente,
  isSerpenteOpen,
  alertsCount,
  onOpenAlerts,
  onOpenAddNode,
}) => {
  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          text: 'WS LIVE',
          color: 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40',
          icon: <Wifi className="w-3.5 h-3.5 text-emerald-400" />,
        };
      case 'polling_fallback':
        return {
          text: 'MALHA ATIVA (4s)',
          color: 'text-cyan-400 bg-cyan-950/60 border-cyan-500/40',
          icon: <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />,
        };
      case 'connecting':
        return {
          text: 'CONECTANDO',
          color: 'text-amber-400 bg-amber-950/60 border-amber-500/40',
          icon: <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />,
        };
      default:
        return {
          text: 'SEM SINAL',
          color: 'text-slate-400 bg-slate-800/60 border-slate-700',
          icon: <WifiOff className="w-3.5 h-3.5 text-slate-400" />,
        };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <header className="h-14 bg-[#0b1324]/95 backdrop-blur-md border-b border-cyan-500/20 px-4 flex items-center justify-between z-30 select-none">
      {/* Identidade Oficial: RAS - Divisão de Rastreamento dos Legendários */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-11 h-11 rounded-full p-0.5 bg-gradient-to-tr from-orange-600 via-slate-800 to-amber-500 shadow-xl shadow-orange-950/70 ring-1 ring-orange-500/50">
          <img
            src="/logo.png"
            alt="RAS Logo Oficial"
            className="w-full h-full object-cover rounded-full"
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-extrabold tracking-widest font-tactical text-slate-100 flex items-center gap-1.5">
              <span className="text-orange-500 font-black drop-shadow-[0_0_12px_rgba(249,115,22,0.4)]">RAS</span>
            </h1>
            <span className="text-[9px] uppercase font-tactical font-bold px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-400 border border-orange-500/40 tracking-wider">
              LORA MESH
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-tactical tracking-wide -mt-0.5">
            Divisão de Rastreamento dos Legendários
          </p>
        </div>
      </div>

      {/* Telemetria e Status Central */}
      <div className="hidden md:flex items-center gap-4 text-xs font-tactical">
        {/* Status do Link */}
        <div className={`px-2.5 py-1 rounded-md border flex items-center gap-1.5 text-[11px] font-semibold ${statusBadge.color}`}>
          {statusBadge.icon}
          <span>{statusBadge.text}</span>
        </div>

        {/* Nós Ativos / Total */}
        <div className="bg-slate-900/80 px-3 py-1 rounded-md border border-slate-800 flex items-center gap-2 text-slate-300">
          <span className="text-slate-500">NÓS:</span>
          <span className="text-emerald-400 font-bold">{activeNodes}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">{totalNodes}</span>
        </div>

        {/* Última Sincronização */}
        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <span className="text-slate-500">SYNC:</span>
          <span className="text-cyan-300">
            {lastSyncTime ? lastSyncTime.toLocaleTimeString('pt-BR') : '--:--:--'}
          </span>
        </div>
      </div>

      {/* Controles de Ação Direita */}
      <div className="flex items-center gap-2">
        {/* Botão Novo Rastreador */}
        <button
          onClick={onOpenAddNode}
          className="px-3 py-1.5 rounded-lg text-xs font-tactical flex items-center gap-1.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-slate-950 font-bold border border-orange-400 shadow-orange-glow transition-all"
          title="Como conectar ou simular novo rádio LoRa"
        >
          <Radio className="w-3.5 h-3.5 fill-slate-950" />
          <span className="hidden sm:inline">+ RASTREADOR</span>
        </button>

        {/* Botão Serpente */}
        <button
          onClick={onOpenSerpente}
          className={`px-3 py-1.5 rounded-lg text-xs font-tactical flex items-center gap-2 transition-all border ${
            isSerpenteOpen
              ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow-cyan-glow'
              : 'bg-slate-900/80 text-cyan-400 border-cyan-500/30 hover:bg-cyan-950/60'
          }`}
          title="Abrir ou Gerenciar Formação Tática Serpente"
        >
          <Users className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">SERPENTE</span>
          {isSerpenteOpen && (
            <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping" />
          )}
        </button>

        {/* Toggle Trilhas */}
        <button
          onClick={() => onToggleConfig('showTrails')}
          className={`p-2 rounded-lg border text-xs font-tactical transition-colors ${
            config.showTrails
              ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40'
              : 'bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300'
          }`}
          title="Ativar / Desativar Trilhas Históricas"
        >
          <Footprints className="w-4 h-4" />
        </button>

        {/* Toggle Mesh Links */}
        <button
          onClick={() => onToggleConfig('showMeshLinks')}
          className={`p-2 rounded-lg border text-xs font-tactical transition-colors ${
            config.showMeshLinks
              ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40'
              : 'bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300'
          }`}
          title="Ativar / Desativar Topologia Mesh"
        >
          <Share2 className="w-4 h-4" />
        </button>

        {/* Toggle Áudio Bip */}
        <button
          onClick={() => onToggleConfig('soundAlerts')}
          className={`p-2 rounded-lg border text-xs font-tactical transition-colors ${
            config.soundAlerts
              ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40'
              : 'bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300'
          }`}
          title="Alertas Sonoros"
        >
          {config.soundAlerts ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        </button>

        {/* Alertas Críticos */}
        {alertsCount > 0 && (
          <button
            onClick={onOpenAlerts}
            className="relative p-2 rounded-lg bg-red-950/80 border border-red-500/50 text-red-400 hover:bg-red-900/60 transition-colors shadow-red-glow animate-pulse"
            title="Ver Alertas Táticos"
          >
            <ShieldAlert className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-slate-950 font-bold text-[9px] flex items-center justify-center">
              {alertsCount > 9 ? '9+' : alertsCount}
            </span>
          </button>
        )}

        {/* Botão Atualizar Manual */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors disabled:opacity-50"
          title="Forçar Atualização de Dados"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
        </button>

        {/* Configurações */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors"
          title="Configurações de Rede & MQTT"
        >
          <Sliders className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
