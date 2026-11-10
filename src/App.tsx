import React, { useState } from 'react';
import { useTacticalData } from './hooks/useTacticalData';
import { HeaderHUD } from './components/HeaderHUD';
import { NodeListSidebar } from './components/NodeListSidebar';
import { TacticalMap } from './components/TacticalMap';
import { NodeDetailDrawer } from './components/NodeDetailDrawer';
import { SerpenteFormationModal } from './components/SerpenteFormationModal';
import { ConfigModal } from './components/ConfigModal';
import { AlertsModal } from './components/AlertsModal';
import { AddNodeModal } from './components/AddNodeModal';
import { TacticalStorage } from './services/storage';
import { Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const {
    nodes,
    selectedNodeId,
    selectedNode,
    setSelectedNodeId,
    loading,
    connectionStatus,
    lastSyncTime,
    alerts,
    clearAlerts,
    refresh,
    loadNodeFullHistory,
    simulateNodeTelemetry,
    formations,
    saveFormation,
    removeFormation,
    config,
    updateConfig,
  } = useTacticalData();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isSerpenteOpen, setIsSerpenteOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isAddNodeOpen, setIsAddNodeOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Verifica se há alguma Serpente ativa
  const hasActiveSerpente = formations.some((f) => f.isOpen);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleToggleConfig = (key: keyof typeof config) => {
    updateConfig({ [key]: !config[key] });
  };

  const activeNodesCount = nodes.filter((n) => n.status === 'active').length;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#070b12] text-slate-100 select-none">
      {/* 1. Header Tático HUD Superior */}
      <HeaderHUD
        connectionStatus={connectionStatus}
        totalNodes={nodes.length}
        activeNodes={activeNodesCount}
        lastSyncTime={lastSyncTime}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        config={config}
        onToggleConfig={handleToggleConfig}
        onOpenSettings={() => setIsConfigOpen(true)}
        onOpenSerpente={() => setIsSerpenteOpen(true)}
        isSerpenteOpen={hasActiveSerpente}
        alertsCount={alerts.length}
        onOpenAlerts={() => setIsAlertsOpen(true)}
        onOpenAddNode={() => setIsAddNodeOpen(true)}
      />

      {/* 2. Área Central de Operações */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Sidebar de Dispositivos e Telemetria */}
        <NodeListSidebar
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          onSelectNode={(id) => setSelectedNodeId(id)}
          isOpen={sidebarOpen}
          onToggleOpen={() => setSidebarOpen((prev) => !prev)}
        />

        {/* Mapa Tático de Alta Precisão */}
        {loading && nodes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#070b12] font-tactical text-xs text-cyan-400">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
            <span className="tracking-wider">INICIALIZANDO MALHA DE RASTREAMENTO LORA...</span>
          </div>
        ) : (
          <TacticalMap
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={(id) => setSelectedNodeId(id)}
            showTrails={config.showTrails}
            showMeshLinks={config.showMeshLinks}
            showAccuracyCircles={config.showAccuracyCircles}
            formations={formations}
          />
        )}

        {/* Drawer Lateral com Raio-X do Nó Selecionado */}
        {selectedNode && (
          <NodeDetailDrawer
            node={selectedNode}
            onClose={() => setSelectedNodeId(null)}
            onLoadFullHistory={loadNodeFullHistory}
          />
        )}
      </div>

      {/* 3. Modais Táticos */}
      <SerpenteFormationModal
        isOpen={isSerpenteOpen}
        onClose={() => setIsSerpenteOpen(false)}
        nodes={nodes}
        formations={formations}
        onSaveFormation={saveFormation}
        onRemoveFormation={removeFormation}
        onFocusNode={(id) => setSelectedNodeId(id)}
      />

      <ConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        config={config}
        onSave={(newCfg) => updateConfig(newCfg)}
      />

      <AlertsModal
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        alerts={alerts}
        onClearAlerts={clearAlerts}
        onSelectNode={(id) => setSelectedNodeId(id)}
      />

      <AddNodeModal
        isOpen={isAddNodeOpen}
        onClose={() => setIsAddNodeOpen(false)}
        onSimulateNodeTelemetry={simulateNodeTelemetry}
        onSelectNode={(id) => setSelectedNodeId(id)}
      />
    </div>
  );
};

export default App;
