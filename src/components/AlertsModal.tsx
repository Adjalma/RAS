import React from 'react';
import {
  X,
  ShieldAlert,
  BatteryLow,
  Radio,
  Trash2,
  Clock,
} from 'lucide-react';
import { TacticalAlert } from '../hooks/useTacticalData';

interface AlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: TacticalAlert[];
  onClearAlerts: () => void;
  onSelectNode: (id: number) => void;
}

export const AlertsModal: React.FC<AlertsModalProps> = ({
  isOpen,
  onClose,
  alerts,
  onClearAlerts,
  onSelectNode,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 font-tactical select-none">
      <div className="w-full max-w-lg bg-[#0b1324] border border-red-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-red-500/20 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-950 border border-red-500/50 text-red-400">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 tracking-wider">
                LOG DE ALERTAS TÁTICOS
              </h2>
              <p className="text-[11px] text-slate-400">
                Ocorrências de telemetria crítica e avisos da malha LoRa
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

        {/* Lista de Alertas */}
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-2">
          {alerts.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Nenhum alerta crítico ativo no momento. Todos os nós operando nominalmente.
            </div>
          ) : (
            alerts.map((al) => (
              <div
                key={al.id}
                onClick={() => {
                  onSelectNode(al.nodeId);
                  onClose();
                }}
                className="p-3 rounded-xl bg-slate-900/80 border border-red-500/30 hover:border-red-400 cursor-pointer transition-all flex items-start gap-3 select-none"
              >
                <div className="p-1.5 rounded-lg bg-red-950/80 text-red-400 mt-0.5">
                  {al.type === 'battery_low' ? (
                    <BatteryLow className="w-4 h-4" />
                  ) : (
                    <Radio className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">{al.nodeName}</span>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(al.timestamp).toLocaleTimeString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-slate-300 mt-0.5">{al.message}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Rodapé */}
        {alerts.length > 0 && (
          <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex justify-end">
            <button
              onClick={onClearAlerts}
              className="px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-950/60 border border-red-500/30 flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar Histórico de Alertas</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
