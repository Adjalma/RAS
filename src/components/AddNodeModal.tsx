import React, { useState } from 'react';
import {
  X,
  Radio,
  Plus,
  Wifi,
  Cpu,
  CheckCircle,
  HelpCircle,
  RefreshCw,
  Signal,
  Battery,
  MapPin,
  Send,
} from 'lucide-react';
import { LoraNode } from '../types/tactical';
import { api } from '../services/api';

interface AddNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSimulateNodeTelemetry?: (nodeId: number, name: string, lat: number, lon: number, bat: number) => void;
  onSelectNode: (id: number) => void;
}

export const AddNodeModal: React.FC<AddNodeModalProps> = ({
  isOpen,
  onClose,
  onSimulateNodeTelemetry,
  onSelectNode,
}) => {
  const [tab, setTab] = useState<'guide' | 'test' | 'simulate'>('guide');
  const [searchId, setSearchId] = useState('');
  const [checking, setChecking] = useState(false);
  const [foundNode, setFoundNode] = useState<LoraNode | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Campos para simulação de ensaio em bancada.
  // O prefixo SIM- deixa claro na lista de nós que não é um rádio real.
  const [simName, setSimName] = useState('SIM-EQUIPE-01');
  const [simId, setSimId] = useState(Math.floor(1000000000 + Math.random() * 9000000000));
  const [simLat, setSimLat] = useState(-23.00755);
  const [simLon, setSimLon] = useState(-43.42027);
  const [simBat, setSimBat] = useState(98);

  if (!isOpen) return null;

  const handleCheckNode = async () => {
    if (!searchId.trim()) return;
    setChecking(true);
    setCheckError(null);
    setFoundNode(null);

    try {
      const idNum = Number(searchId.trim());
      if (isNaN(idNum)) {
        throw new Error('O ID do nó deve ser um número inteiro (ex: 3872223057)');
      }
      const node = await api.getNodeDetail(idNum);
      if (node && node.id) {
        setFoundNode(node);
      } else {
        throw new Error(`Nó #${idNum} ainda não foi visto pelo servidor.`);
      }
    } catch (err: any) {
      setCheckError(err?.message || 'Rastreador ainda não transmitiu nenhum pacote de telemetria.');
    } finally {
      setChecking(false);
    }
  };

  const handleSimulate = () => {
    if (onSimulateNodeTelemetry) {
      onSimulateNodeTelemetry(simId, simName, simLat, simLon, simBat);
      onSelectNode(simId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 font-tactical select-none">
      <div className="w-full max-w-2xl bg-[#0b1324] border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-cyan-500/20 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-orange-950/80 border border-orange-500/50 text-orange-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 tracking-wider flex items-center gap-2">
                CONEXÃO DE NOVO RASTREADOR LORA
              </h2>
              <p className="text-[11px] text-slate-400">
                Guia de emparelhamento, configuração de rádio e teste de transmissão
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

        {/* Abas */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950/50 px-4 pt-2 gap-2 text-xs">
          <button
            onClick={() => setTab('guide')}
            className={`px-3 py-2 border-b-2 font-bold transition-colors flex items-center gap-1.5 ${
              tab === 'guide'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>1. Como Funciona a Conexão</span>
          </button>
          <button
            onClick={() => setTab('test')}
            className={`px-3 py-2 border-b-2 font-bold transition-colors flex items-center gap-1.5 ${
              tab === 'test'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Signal className="w-3.5 h-3.5" />
            <span>2. Checar Rastreador pelo ID</span>
          </button>
          <button
            onClick={() => setTab('simulate')}
            className={`px-3 py-2 border-b-2 font-bold transition-colors flex items-center gap-1.5 ${
              tab === 'simulate'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>3. Simular Dispositivo (Ensaio)</span>
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-5 overflow-y-auto flex-1 text-xs text-slate-300 flex flex-col gap-4">
          {tab === 'guide' && (
            <div className="flex flex-col gap-3.5 leading-relaxed">
              <div className="p-3.5 rounded-xl bg-orange-950/20 border border-orange-500/30 text-orange-200 text-xs">
                <strong className="font-bold block mb-1">📡 Conexão Automática na Malha LoRa Mesh:</strong>
                No ecossistema de rastreamento dos Legendários, você <span className="text-white font-bold">não precisa cadastrar manualmente</span> o nó na tela! Basta ligar o dispositivo LoRa. Assim que ele enviar o primeiro pacote de rádio com seu nome ou coordenadas, o servidor registra o nó e ele surge instantaneamente no mapa e na barra lateral.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
                    <Radio className="w-4 h-4" />
                    <span>Parâmetros do Rádio LoRa:</span>
                  </div>
                  <ul className="text-[11px] text-slate-400 flex flex-col gap-1 list-disc pl-4">
                    <li><span className="text-slate-200 font-semibold">Região:</span> AU915 / 915 MHz (Brasil)</li>
                    <li><span className="text-slate-200 font-semibold">Modem:</span> LongFast ou MediumFast</li>
                    <li><span className="text-slate-200 font-semibold">Intervalo de Posição:</span> 30 a 60 seg</li>
                    <li><span className="text-slate-200 font-semibold">Telemetria:</span> Habilitar leitura de bateria</li>
                  </ul>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-purple-400 font-bold text-xs">
                    <Cpu className="w-4 h-4" />
                    <span>Apontamento do Gateway:</span>
                  </div>
                  <ul className="text-[11px] text-slate-400 flex flex-col gap-1 list-disc pl-4">
                    <li><span className="text-slate-200 font-semibold">Broker MQTT:</span> mqtt.legendariosrio.com.br</li>
                    <li><span className="text-slate-200 font-semibold">Porta:</span> 1883 (TCP / LoRa Gateway)</li>
                    <li><span className="text-slate-200 font-semibold">Servidor HTTP/WS:</span> logistica.legendariosrio.com.br</li>
                  </ul>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col gap-1.5 text-xs">
                <span className="font-bold text-slate-200">Como saber se está conectado?</span>
                <p className="text-slate-400 text-[11px]">
                  1. No topo direito, o indicador <span className="text-emerald-400 font-bold">WS LIVE</span> ou <span className="text-cyan-400 font-bold">POLLING 4s</span> mostra que sua central está escutando o servidor.
                  <br />
                  2. Na barra lateral esquerda, cada rastreador com ponto <span className="text-emerald-400 font-bold">Verde Pulsante</span> transmitiu dados nos últimos 5 minutos.
                  <br />
                  3. Se o ponto estiver <span className="text-amber-400 font-bold">Âmbar</span>, faz entre 5 e 15 minutos sem novo pacote. Se estiver <span className="text-slate-500 font-bold">Cinza</span>, está offline.
                </p>
              </div>
            </div>
          )}

          {tab === 'test' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-300 font-semibold text-xs">Digite o ID do Rastreador (Decimal):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchId}
                    onChange={(e) => setSearchId(e.target.value)}
                    placeholder="Ex: 1715330230, 3872223057..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                  />
                  <button
                    onClick={handleCheckNode}
                    disabled={checking || !searchId.trim()}
                    className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                    <span>Consultar</span>
                  </button>
                </div>
              </div>

              {checkError && (
                <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-red-300 text-xs">
                  {checkError}
                </div>
              )}

              {foundNode && (
                <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/40 flex flex-col gap-2.5 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                      <CheckCircle className="w-4 h-4" />
                      <span>{foundNode.name} (#{foundNode.id})</span>
                    </div>
                    <button
                      onClick={() => {
                        onSelectNode(foundNode.id);
                        onClose();
                      }}
                      className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs hover:bg-emerald-500/30 font-bold"
                    >
                      Ver no Mapa
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-400 grid grid-cols-2 gap-2 mt-1">
                    <div>Bateria: <span className="text-slate-200 font-semibold">{foundNode.current_telemetry?.bat ?? '--'}%</span></div>
                    <div>Posições Gravadas: <span className="text-slate-200 font-semibold">{foundNode.latest_positions?.length ?? 0}</span></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'simulate' && (
            <div className="flex flex-col gap-3.5">
              <div className="text-xs text-slate-400 leading-relaxed">
                Quer fazer um teste de bancada ou treinamento sem precisar de rádio físico agora? Gere um nó virtual diretamente no mapa operacional.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400 font-semibold">Nome do Rastreador:</label>
                  <input
                    type="text"
                    value={simName}
                    onChange={(e) => setSimName(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-400 font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400 font-semibold">ID do Rádio:</label>
                  <input
                    type="number"
                    value={simId}
                    onChange={(e) => setSimId(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-400 font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400 font-semibold">Latitude:</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={simLat}
                    onChange={(e) => setSimLat(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-400 font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400 font-semibold">Longitude:</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={simLon}
                    onChange={(e) => setSimLon(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-400 font-mono"
                  />
                </div>
              </div>

              <button
                onClick={handleSimulate}
                className="mt-2 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-emerald-glow transition-all"
              >
                <Send className="w-4 h-4" />
                <span>DISPARAR PACOTE DE BEACON NA MALHA</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
