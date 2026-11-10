import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { LoraNode, MapTileLayer, PositionData } from '../types/tactical';
import { formatTacticalCoords, calculateDistanceMeters } from '../utils/geo';
import { Layers, Crosshair, ZoomIn, ZoomOut, Radio } from 'lucide-react';

interface TacticalMapProps {
  nodes: LoraNode[];
  selectedNodeId: number | null;
  onSelectNode: (id: number) => void;
  showTrails: boolean;
  showMeshLinks: boolean;
  showAccuracyCircles: boolean;
}

// Provedores 100% livres de alta velocidade e sem necessidade de API key
const TILE_PROVIDERS: Record<MapTileLayer, { url: string; attribution: string; maxZoom: number; className?: string }> = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, Earthstar',
    maxZoom: 19,
  },
  dark: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    className: 'tactical-dark-layer',
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  },
  topo: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, HERE, Garmin',
    maxZoom: 19,
  },
};

export const TacticalMap: React.FC<TacticalMapProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  showTrails,
  showMeshLinks,
  showAccuracyCircles,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);

  // Camadas vetoriais
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const trailsLayerRef = useRef<L.LayerGroup | null>(null);
  const meshLayerRef = useRef<L.LayerGroup | null>(null);
  const accuracyLayerRef = useRef<L.LayerGroup | null>(null);

  // Cache de marcadores instanciados para reaproveitamento ultra-rápido (zero travamento de DOM)
  const markerCacheRef = useRef<Map<number, L.Marker>>(new Map());

  const [activeLayer, setActiveLayer] = useState<MapTileLayer>('satellite');
  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(13);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState<boolean>(false);
  const hasAutoCenteredRef = useRef(false);

  // Posições mais recentes válidas por nó
  const nodesWithValidPos = useMemo(() => {
    return nodes.filter((n) => {
      const pos = n.latest_positions;
      if (!pos || pos.length === 0) return false;
      const last = pos[pos.length - 1];
      return (
        typeof last.lat === 'number' &&
        typeof last.lon === 'number' &&
        !isNaN(last.lat) &&
        !isNaN(last.lon) &&
        !(last.lat === 0 && last.lon === 0)
      );
    });
  }, [nodes]);

  // 1. Inicializa o mapa com máxima fluidez e aceleração GPU
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Ponto central padrão: Macaé / Rio de Janeiro
    const initialCenter: [number, number] = [-22.3768, -41.7869]; // Macaé Centro

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true, // Renderizador Canvas 2D/GPU
      fadeAnimation: false,
      zoomAnimation: true,
      markerZoomAnimation: true,
    });

    trailsLayerRef.current = L.layerGroup().addTo(map);
    meshLayerRef.current = L.layerGroup().addTo(map);
    accuracyLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);

    const provider = TILE_PROVIDERS[activeLayer];
    const tileLayer = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      maxZoom: provider.maxZoom,
      className: provider.className,
    }).addTo(map);
    currentTileLayerRef.current = tileLayer;

    map.on('mousemove', (e) => {
      setMouseCoords({ lat: e.latlng.lat, lon: e.latlng.lng });
    });
    map.on('zoomend', () => {
      setZoomLevel(map.getZoom());
    });

    mapInstanceRef.current = map;
    const timer = setTimeout(() => map.invalidateSize(), 150);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
      markerCacheRef.current.clear();
    };
  }, []);

  // 2. Troca de camada sem recarregar o mapa
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (currentTileLayerRef.current) {
      map.removeLayer(currentTileLayerRef.current);
    }

    const provider = TILE_PROVIDERS[activeLayer];
    const newTileLayer = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      maxZoom: provider.maxZoom,
      className: provider.className,
    }).addTo(map);

    newTileLayer.bringToBack();
    currentTileLayerRef.current = newTileLayer;
  }, [activeLayer]);

  // 3. Auto-center na carga inicial
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || hasAutoCenteredRef.current || nodesWithValidPos.length === 0) return;

    const bounds = L.latLngBounds(
      nodesWithValidPos.map((n) => {
        const pos = n.latest_positions!;
        const last = pos[pos.length - 1];
        return [last.lat, last.lon];
      })
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    hasAutoCenteredRef.current = true;
  }, [nodesWithValidPos]);

  // 4. Renderização Otimizada com Diffing de Marcadores (Zero gargalo de DOM)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !markersLayerRef.current || !trailsLayerRef.current || !meshLayerRef.current || !accuracyLayerRef.current) return;

    // Atualiza trilhas e malha
    trailsLayerRef.current.clearLayers();
    meshLayerRef.current.clearLayers();
    accuracyLayerRef.current.clearLayers();

    const currentIds = new Set<number>();
    const positionsMap: Array<{ node: LoraNode; pos: PositionData }> = [];

    nodesWithValidPos.forEach((node) => {
      const positions = node.latest_positions || [];
      if (positions.length === 0) return;
      const latestPos = positions[positions.length - 1];
      currentIds.add(node.id);
      positionsMap.push({ node, pos: latestPos });

      const isSelected = selectedNodeId === node.id;
      const nodeColor = node.color || '#ea580c';
      const batteryPercent = node.current_telemetry?.bat ?? null;
      const heading = latestPos.heading ?? 0;

      let batColor = '#10b981';
      if (batteryPercent != null) {
        if (batteryPercent <= 20) batColor = '#ef4444';
        else if (batteryPercent <= 50) batColor = '#f59e0b';
      }

      // Trilha vetorial em Canvas
      if (showTrails && positions.length > 1) {
        const latLngs = positions.map((p) => [p.lat, p.lon] as [number, number]);
        L.polyline(latLngs, {
          color: nodeColor,
          weight: isSelected ? 3.5 : 2,
          opacity: isSelected ? 0.9 : 0.6,
        }).addTo(trailsLayerRef.current!);
      }

      // Círculo de precisão de GPS
      if (showAccuracyCircles && latestPos.acc && latestPos.acc > 0) {
        L.circle([latestPos.lat, latestPos.lon], {
          radius: Math.min(latestPos.acc, 300),
          color: nodeColor,
          fillColor: nodeColor,
          fillOpacity: 0.08,
          weight: 1,
        }).addTo(accuracyLayerRef.current!);
      }

      // HTML do ícone
      const markerHtml = `
        <div class="relative flex items-center justify-center cursor-pointer" style="width: 44px; height: 44px; margin-left: -22px; margin-top: -22px;">
          <div class="relative flex items-center justify-center w-7 h-7 rounded-full shadow-lg ${isSelected ? 'scale-125 ring-2 ring-white' : ''}" style="background: #0b1324; border: 2px solid ${nodeColor};">
            <div class="w-full h-full flex items-center justify-center" style="transform: rotate(${heading}deg);">
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="${nodeColor}">
                <path d="M12 2L4 20l8-4 8 4L12 2z"/>
              </svg>
            </div>
          </div>
          <div class="absolute -top-6 whitespace-nowrap px-1.5 py-0.2 rounded text-[9px] font-tactical font-semibold flex items-center gap-1 shadow pointer-events-none" style="background: rgba(11, 19, 36, 0.95); border: 1px solid ${nodeColor}88; color: #fff;">
            <span>${node.name}</span>
            ${batteryPercent != null ? `<span style="color: ${batColor}; font-weight: bold;">${batteryPercent}%</span>` : ''}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'tactical-node-icon',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      // Se o marcador já existe, apenas move a posição (super fluido)
      const existingMarker = markerCacheRef.current.get(node.id);
      if (existingMarker) {
        existingMarker.setLatLng([latestPos.lat, latestPos.lon]);
        existingMarker.setIcon(customIcon);
      } else {
        const newMarker = L.marker([latestPos.lat, latestPos.lon], { icon: customIcon });
        newMarker.on('click', () => onSelectNode(node.id));
        newMarker.addTo(markersLayerRef.current!);
        markerCacheRef.current.set(node.id, newMarker);
      }
    });

    // Remove marcadores que não estão mais na lista
    markerCacheRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        markersLayerRef.current?.removeLayer(marker);
        markerCacheRef.current.delete(id);
      }
    });

    // Mesh Links LoRa
    if (showMeshLinks && positionsMap.length > 1) {
      for (let i = 0; i < positionsMap.length; i++) {
        for (let j = i + 1; j < positionsMap.length; j++) {
          const nodeA = positionsMap[i];
          const nodeB = positionsMap[j];
          const distKm = calculateDistanceMeters(nodeA.pos.lat, nodeA.pos.lon, nodeB.pos.lat, nodeB.pos.lon) / 1000;
          if (distKm <= 25) {
            L.polyline(
              [
                [nodeA.pos.lat, nodeA.pos.lon],
                [nodeB.pos.lat, nodeB.pos.lon],
              ],
              {
                color: '#f97316',
                weight: 1,
                opacity: 0.35,
                dashArray: '4, 4',
              }
            ).addTo(meshLayerRef.current!);
          }
        }
      }
    }
  }, [nodesWithValidPos, selectedNodeId, showTrails, showMeshLinks, showAccuracyCircles, onSelectNode]);

  // Centralizar no nó selecionado
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || selectedNodeId == null) return;
    const targetNode = nodes.find((n) => n.id === selectedNodeId);
    const positions = targetNode?.latest_positions;
    if (positions && positions.length > 0) {
      const last = positions[positions.length - 1];
      map.flyTo([last.lat, last.lon], Math.max(map.getZoom(), 15), {
        duration: 0.6,
      });
    }
  }, [selectedNodeId, nodes]);

  const handleFitAll = () => {
    const map = mapInstanceRef.current;
    if (!map || nodesWithValidPos.length === 0) return;
    const bounds = L.latLngBounds(
      nodesWithValidPos.map((n) => {
        const pos = n.latest_positions!;
        const last = pos[pos.length - 1];
        return [last.lat, last.lon];
      })
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
  };

  // Botão rápido para ir para Macaé
  const handleGoToMacae = () => {
    mapInstanceRef.current?.flyTo([-22.3768, -41.7869], 13, { duration: 0.8 });
  };

  return (
    <div className="relative w-full h-full flex-1 overflow-hidden bg-[#070b12]">
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* HUD Superior Esquerdo */}
      <div className="absolute top-3 left-3 z-[400] flex flex-col gap-1 pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md border border-orange-500/30 px-3 py-1 rounded-lg shadow-xl text-xs font-tactical text-slate-200 flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-orange-400 font-bold">
            <Crosshair className="w-3.5 h-3.5" />
            <span>GPS:</span>
          </div>
          <span className="tracking-wider">
            {mouseCoords
              ? `${mouseCoords.lat.toFixed(5)}°, ${mouseCoords.lon.toFixed(5)}°`
              : 'MONITORANDO MALHA'}
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-orange-300 font-bold">Z:{zoomLevel}</span>
        </div>
      </div>

      {/* HUD Controles */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
        <div className="relative">
          <button
            onClick={() => setIsLayerMenuOpen((prev) => !prev)}
            className="w-9 h-9 rounded-lg bg-slate-900/90 backdrop-blur-md border border-orange-500/40 text-orange-400 flex items-center justify-center hover:bg-orange-500 hover:text-slate-950 transition-all shadow-lg"
            title="Camadas do Mapa"
          >
            <Layers className="w-4 h-4" />
          </button>

          {isLayerMenuOpen && (
            <div className="absolute right-11 top-0 bg-slate-900/95 backdrop-blur-lg border border-orange-500/40 rounded-xl p-1.5 flex flex-col gap-1 w-48 shadow-2xl">
              <div className="text-[10px] font-tactical text-slate-400 px-2 py-1 uppercase tracking-wider border-b border-slate-800">
                Camadas Táticas
              </div>
              <button
                onClick={() => { setActiveLayer('satellite'); setIsLayerMenuOpen(false); }}
                className={`text-left px-2 py-1.5 rounded text-xs font-tactical ${activeLayer === 'satellite' ? 'bg-orange-500/20 text-orange-300 font-bold border border-orange-500/40' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                🛰️ Satélite Militar HD
              </button>
              <button
                onClick={() => { setActiveLayer('dark'); setIsLayerMenuOpen(false); }}
                className={`text-left px-2 py-1.5 rounded text-xs font-tactical ${activeLayer === 'dark' ? 'bg-orange-500/20 text-orange-300 font-bold border border-orange-500/40' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                🕶️ Cyber Dark Tático
              </button>
              <button
                onClick={() => { setActiveLayer('topo'); setIsLayerMenuOpen(false); }}
                className={`text-left px-2 py-1.5 rounded text-xs font-tactical ${activeLayer === 'topo' ? 'bg-orange-500/20 text-orange-300 font-bold border border-orange-500/40' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                🗺️ Topografia & Vias
              </button>
              <button
                onClick={() => { setActiveLayer('osm'); setIsLayerMenuOpen(false); }}
                className={`text-left px-2 py-1.5 rounded text-xs font-tactical ${activeLayer === 'osm' ? 'bg-orange-500/20 text-orange-300 font-bold border border-orange-500/40' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                🌐 OpenStreetMap Claro
              </button>
            </div>
          )}
        </div>

        {/* Centralizar Frota */}
        <button
          onClick={handleFitAll}
          className="w-9 h-9 rounded-lg bg-slate-900/90 backdrop-blur-md border border-orange-500/40 text-orange-400 flex items-center justify-center hover:bg-orange-500 hover:text-slate-950 transition-all shadow-lg"
          title="Centralizar Todos os Rastreadores"
        >
          <Crosshair className="w-4 h-4" />
        </button>

        {/* Foco Rápido em Macaé */}
        <button
          onClick={handleGoToMacae}
          className="w-9 h-9 rounded-lg bg-slate-900/90 backdrop-blur-md border border-slate-700 text-cyan-400 flex items-center justify-center hover:bg-cyan-950/80 transition-all font-tactical text-[10px] font-bold"
          title="Ir para Setor Macaé"
        >
          MAC
        </button>

        <button
          onClick={() => mapInstanceRef.current?.zoomIn()}
          className="w-9 h-9 rounded-lg bg-slate-900/90 backdrop-blur-md border border-slate-700 text-slate-200 flex items-center justify-center hover:bg-slate-800 transition-all"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => mapInstanceRef.current?.zoomOut()}
          className="w-9 h-9 rounded-lg bg-slate-900/90 backdrop-blur-md border border-slate-700 text-slate-200 flex items-center justify-center hover:bg-slate-800 transition-all"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>

      {/* HUD Inferior */}
      <div className="absolute bottom-3 left-3 z-[400] flex items-center gap-2">
        <div className="bg-slate-900/90 backdrop-blur-md border border-orange-500/30 px-3 py-1.5 rounded-lg shadow-xl flex items-center gap-3 text-xs font-tactical">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-400 animate-ping" />
            <span className="text-slate-400">NÓS NO MAPA:</span>
            <span className="text-orange-400 font-bold">{nodesWithValidPos.length} / {nodes.length}</span>
          </div>
          <div className="h-3.5 w-px bg-slate-800" />
          <div className="flex items-center gap-1.5 text-slate-400">
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span>MALHA:</span>
            <span className="text-emerald-400 font-bold">ATIVA</span>
          </div>
        </div>
      </div>
    </div>
  );
};
