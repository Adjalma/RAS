import React, { useState } from 'react';
import {
  X,
  Settings,
  Radio,
  Save,
  RotateCcw,
  Server,
  Wifi,
  Key,
  Clock,
  Trash2,
} from 'lucide-react';
import { TacticalConfig } from '../types/tactical';
import { TacticalStorage, DEFAULT_TACTICAL_CONFIG } from '../services/storage';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: TacticalConfig;
  onSave: (config: TacticalConfig) => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
}) => {
  const [formData, setFormData] = useState<TacticalConfig>(config);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1000);
  };

  const handleResetDefaults = () => {
    setFormData(DEFAULT_TACTICAL_CONFIG);
  };

  const handleClearCache = () => {
    TacticalStorage.clearCachedNodes();
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 font-tactical select-none">
      <div className="w-full max-w-xl bg-[#0b1324] border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-cyan-500/20 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-950 border border-cyan-500/50 text-cyan-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 tracking-wider">
                CONFIGURAÇÕES DE REDE & APONTAMENTO
              </h2>
              <p className="text-[11px] text-slate-400">
                Endpoints do Backend, WebSocket e Broker MQTT dos Legendários
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

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 text-xs">
          {/* 1. API Base URL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-300 font-semibold flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-cyan-400" />
              <span>Backend REST Base URL (/v1/node):</span>
            </label>
            <input
              type="text"
              value={formData.apiBaseUrl}
              onChange={(e) => setFormData({ ...formData, apiBaseUrl: e.target.value })}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              required
            />
          </div>

          {/* 2. WebSocket URL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-300 font-semibold flex items-center gap-2">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>WebSocket Live URL (/ws):</span>
            </label>
            <input
              type="text"
              value={formData.wsUrl}
              onChange={(e) => setFormData({ ...formData, wsUrl: e.target.value })}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              required
            />
          </div>

          {/* 3. Authorization Header */}
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-300 font-semibold flex items-center gap-2">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Authorization Header (configurado localmente):</span>
            </label>
            <input
              type="text"
              value={formData.authHeader}
              onChange={(e) => setFormData({ ...formData, authHeader: e.target.value })}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              required
            />
          </div>

          {/* 4. Apontamento MQTT LoRa */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="text-slate-300 font-semibold flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-purple-400" />
                <span>MQTT Broker Host:</span>
              </label>
              <input
                type="text"
                value={formData.mqttHost}
                onChange={(e) => setFormData({ ...formData, mqttHost: e.target.value })}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-slate-300 font-semibold">Porta:</label>
              <input
                type="number"
                value={formData.mqttPort}
                onChange={(e) => setFormData({ ...formData, mqttPort: Number(e.target.value) })}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                required
              />
            </div>
          </div>

          {/* 5. Duração da Trilha */}
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-300 font-semibold flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Janela Padrão de Posições (Horas):</span>
            </label>
            <select
              value={formData.trailDurationHours}
              onChange={(e) => setFormData({ ...formData, trailDurationHours: Number(e.target.value) })}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400"
            >
              <option value={1}>Última 1 hora</option>
              <option value={3}>Últimas 3 horas (Padrão do Backend)</option>
              <option value={6}>Últimas 6 horas</option>
              <option value={24}>Últimas 24 horas</option>
              <option value={72}>Últimas 72 horas</option>
              <option value={168}>Últimos 7 dias</option>
              <option value={8760}>Histórico completo (1 ano)</option>
            </select>
          </div>

          {/* Rodapé de Ações */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800 mt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-xs flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar Padrões</span>
              </button>
              <button
                type="button"
                onClick={handleClearCache}
                title="Descarta os nós guardados no navegador e força nova leitura do servidor"
                className="px-3 py-2 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-950/40 text-xs flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar Cache Local</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-cyan-glow transition-all"
              >
                <Save className="w-4 h-4" />
                <span>{savedSuccess ? 'Salvo!' : 'Salvar Alterações'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
