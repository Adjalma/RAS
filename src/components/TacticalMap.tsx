import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { LoraNode, MapTileLayer, PositionData, SerpenteFormation } from '../types/tactical';
import { formatTacticalCoords, calculateDistanceMeters, hasGpsFix } from '../utils/geo';
import { Layers, Crosshair, ZoomIn, ZoomOut, Radio, Satellite, Map as MapIcon, Loader2 } from 'lucide-react';

interface TacticalMapProps {
  nodes: LoraNode[];
  selectedNodeId: number | null;
  onSelectNode: (id: number) => void;
  showTrails: boolean;
  showMeshLinks: boolean;
  showAccuracyCircles: boolean;
  formations?: SerpenteFormation[];
}

// Provedores 100% livres de alta velocidade e sem necessidade de API key
const TILE_PROVIDERS: Record<MapTileLayer, { url: string; subdomains?: string; attribution: string; maxZoom: number; className?: string }> = {
  topo: {
    // OpenTopoMap: relevo topografico com curvas de nivel (padrao).
    // Acima de z=17 o servidor devolve tiles vazios, por isso o maxZoom
    // fica em 17 e o Leaflet estica o ultimo nivel disponivel.
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
  },
  satellite: {
    // Esri World Imagery (livre e público, satélite real de alta resolução)
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, Earthstar',
    maxZoom: 19,
  },
  dark: {
    // OpenStreetMap oficial com filtro dark militar aplicado via CSS (zero risco de API Key)
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    className: 'tactical-dark-layer',
  },
  osm: {
    // OpenStreetMap padrão
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  },
};

/**
 * Cria a camada de tiles com maxNativeZoom (para esticar o ultimo nivel
 * disponivel em vez de mostrar preto) e fallback automatico quando o
 * servidor de tiles falha.
 */
function createTileLayer(layer: MapTileLayer): L.TileLayer {
  const provider = TILE_PROVIDERS[layer];
  const tileLayer = L.tileLayer(provider.url, {
    attribution: provider.attribution,
    subdomains: provider.subdomains || 'abc',
    maxZoom: 19,
    maxNativeZoom: provider.maxZoom,
    minZoom: 2,
    keepBuffer: 4,          // mantem tiles em memoria durante o zoom
    updateWhenIdle: true,
    crossOrigin: true,
    className: provider.className,
  });

  // Se o servidor de tiles estiver indisponivel, cai para o OSM
  // (rapido e sempre disponivel) em vez de deixar a tela preta.
  let fellBack = false;
  tileLayer.on('tileerror', () => {
    if (fellBack || layer === 'osm') return;
    fellBack = true;
    console.warn(`[mapa] tiles de "${layer}" falharam. Alternando para OpenStreetMap.`);
    const map = mapInstanceRef.current;
    if (!map) return;
    if (currentTileLayerRef.current) map.removeLayer(currentTileLayerRef.current);
    const fallback = createTileLayer('osm');
    fallback.addTo(map);
    currentTileLayerRef.current = fallback;
  });

  return tileLayer;
}

export const TacticalMap: React.FC<TacticalMapProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  showTrails,
  showMeshLinks,
  showAccuracyCircles,
  formations = [],
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
  // Assinatura do conteudo do icone: evita setIcon() (recriacao de DOM)
  // quando nada visualmente mudou.
  const markerSignatureRef = useRef<Map<number, string>>(new Map());
  // Assinatura das trilhas: evita redesenhar polylines a cada polling.
  const trailSignatureRef = useRef<Map<number, string>>(new Map());
  // Polylines de trilha por no, para poder remover/reescrever so uma.
  const trailLayerRef = useRef<Map<number, L.Polyline>>(new Map());
  // Camada exclusiva das linhas de formacao (redesenhada so quando muda).
  const formationLayerRef = useRef<L.LayerGroup | null>(null);
  // Assinaturas de topologia (mesh links e formacoes).
  const meshSignatureRef = useRef<string>('');
  const formationSignatureRef = useRef<string>('');

  const [activeLayer, setActiveLayer] = useState<MapTileLayer>('topo');
  const [tilesLoading, setTilesLoading] = useState<boolean>(true);
  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(13);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState<boolean>(false);
  const hasAutoCenteredRef = useRef(false);

  // Posições mais recentes válidas por nó.
  // Um fix só é confiável quando o GPS reporta satélites. Radio com sat=0
  // devolve a posição fixa do firmware (vários km do ponto real), então
  // é tratado como "sem GPS" e não é desenhado no mapa.
  const nodesWithValidPos = useMemo(() => {
    return nodes.filter((n) => {
      // Nos de ensaio ficam fora do mapa: sao ficticios e poluiriam a
      // operacao real. Aparecem apenas na lista, marcados como SIMULACAO.
      if (n.isSimulation) return false;
      const pos = n.latest_positions;
      if (!pos || pos.length === 0) return false;
      const last = pos[pos.length - 1];
      return (
        typeof last.lat === 'number' &&
        typeof last.lon === 'number' &&
        !isNaN(last.lat) &&
        !isNaN(last.lon) &&
        !(last.lat === 0 && last.lon === 0) &&
        hasGpsFix(last)
      );
    });
  }, [nodes]);

  // 1. Inicializa o mapa com máxima fluidez e aceleração GPU
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Ponto central neutro (regiao RJ)
    const initialCenter: [number, number] = [-22.9068, -43.1729];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,        // renderizador Canvas 2D/GPU
      fadeAnimation: false,      // sem fade: menos repaint
      zoomAnimation: false,      // zoom instantaneo, sem animacao que trava
      markerZoomAnimation: false, // marcadores nao animam no zoom
      zoomSnap: 0.5,             // zoom granular para operacao fina
      wheelPxPerZoomLevel: 90,   // scroll mais suave
      trackResize: false,        // evita resize storms
    });

    trailsLayerRef.current = L.layerGroup().addTo(map);
    meshLayerRef.current = L.layerGroup().addTo(map);
    accuracyLayerRef.current = L.layerGroup().addTo(map);
    formationLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);

    const provider = TILE_PROVIDERS[activeLayer];
    const tileLayer = createTileLayer(activeLayer).addTo(map);
    currentTileLayerRef.current = tileLayer;

    // Precarrega os tiles do nivel inicial em paralelo: sem isso a
    // primeira abertura espera cada tile em fila e parece travada.
    const preload = new Image();
    preload.decoding = 'async';
    const px = Math.round((initialCenter[1] + 180) / 360 * 2 ** 12);
    const py = Math.round(
      (1 - Math.asinh(Math.tan((initialCenter[0] * Math.PI) / 180)) / Math.PI) / 2 * 2 ** 12
    );
    preload.src = provider.url
      .replace('{s}', 'a')
      .replace('{z}', '12')
      .replace('{x}', String(px))
      .replace('{y}', String(py));

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

    const newTileLayer = createTileLayer(activeLayer).addTo(map);
    newTileLayer.bringToBack();
    currentTileLayerRef.current = newTileLayer;

    // Indicador de carregamento: some quando os tiles terminarem de chegar.
    setTilesLoading(true);
    let pending = 0;
    newTileLayer.on('tileload', () => {
      pending = Math.max(0, pending - 1);
      if (pending === 0) setTilesLoading(false);
    });
    newTileLayer.on('load', () => setTilesLoading(false));
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

    // As trilhas, mesh links e formacoes tem cache proprio (redesenham
    // apenas quando mudam). Aqui so limpamos o que nao tem cache.
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

      // Trilha vetorial em Canvas. So redesenha quando a trilha mudou de
      // fato: recriar a polyline a cada polling(forca recriacao de canvas).
      if (showTrails && positions.length > 1) {
        const trailSignature = `${positions.length}|${latestPos.received_at}|${isSelected}`;
        if (trailSignatureRef.current.get(node.id) !== trailSignature) {
          trailSignatureRef.current.set(node.id, trailSignature);
          const previous = trailLayerRef.current.get(node.id);
          if (previous) {
            trailsLayerRef.current?.removeLayer(previous);
          }
          const latLngs = positions.map((p) => [p.lat, p.lon] as [number, number]);
          const line = L.polyline(latLngs, {
            color: nodeColor,
            weight: isSelected ? 3.5 : 2,
            opacity: isSelected ? 0.9 : 0.6,
          }).addTo(trailsLayerRef.current!);
          trailLayerRef.current.set(node.id, line);
        }
      } else {
        const previous = trailLayerRef.current.get(node.id);
        if (previous) {
          trailsLayerRef.current?.removeLayer(previous);
          trailLayerRef.current.delete(node.id);
          trailSignatureRef.current.delete(node.id);
        }
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
      // Quando o GPS é antigo mas o enlace esta vivo, o marcador fica
      // esmaecido com selo de "GPS antigo" para nao passar por posicao atual.
      const posAgeMin = node.positionAgeMinutes ?? (latestPos.received_at
        ? Math.max(0, Math.round((Date.now() - new Date(latestPos.received_at).getTime()) / 60000))
        : null);
      const isStaleGps = posAgeMin != null && posAgeMin > 15;
      const opacity = isStaleGps ? 0.55 : 1;

      const markerHtml = `
        <div class="relative flex items-center justify-center cursor-pointer" style="width: 44px; height: 44px; margin-left: -22px; margin-top: -22px; opacity: ${opacity};">
          ${isStaleGps ? `<div class="absolute w-8 h-8 rounded-full border border-dashed" style="border-color: ${nodeColor}66;"></div>` : ''}
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
            ${isStaleGps ? `<span style="color: #fb923c; font-weight: bold;" title="Ultimo GPS ha ${posAgeMin} min">GPS ${posAgeMin}m</span>` : ''}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'tactical-node-icon',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      // Se o marcador ja existe, apenas move a posicao. O setIcon() so
      // acontece quando o conteudo do icone realmente mudou: recriar o
      // DOM a cada polling (4s) era o principal gargalo de fluidez.
      const existingMarker = markerCacheRef.current.get(node.id);
      if (existingMarker) {
        const moved = existingMarker.getLatLng();
        if (moved.lat !== latestPos.lat || moved.lng !== latestPos.lon) {
          existingMarker.setLatLng([latestPos.lat, latestPos.lon]);
        }
        const signature = `${isSelected}|${batteryPercent}|${heading}|${isStaleGps}|${posAgeMin}`;
        if (markerSignatureRef.current.get(node.id) !== signature) {
          existingMarker.setIcon(customIcon);
          markerSignatureRef.current.set(node.id, signature);
        }
      } else {
        const newMarker = L.marker([latestPos.lat, latestPos.lon], { icon: customIcon });
        newMarker.on('click', () => onSelectNode(node.id));
        newMarker.addTo(markersLayerRef.current!);
        markerCacheRef.current.set(node.id, newMarker);
        markerSignatureRef.current.set(node.id, `${isSelected}|${batteryPercent}|${heading}|${isStaleGps}|${posAgeMin}`);
      }
    });

    // Remove marcadores que não estão mais na lista
    markerCacheRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        markersLayerRef.current?.removeLayer(marker);
        markerCacheRef.current.delete(id);
      }
    });

    // Mesh Links LoRa e linhas das Serpentes.
    // Redesenhados apenas quando a topologia muda: recriar essas polylines
    // a cada polling (4s) forca o canvas a se redesenhar e trava o zoom.
    const topologySignature = positionsMap
      .map((p) => `${p.node.id}:${p.pos.lat.toFixed(5)},${p.pos.lon.toFixed(5)}`)
      .join('|');
    const formationSignature = formations
      .map((f) => `${f.id}:${f.isOpen}:${f.members.length}`)
      .join('|');

    if (meshSignatureRef.current !== `${topologySignature}#${showMeshLinks}`) {
      meshSignatureRef.current = `${topologySignature}#${showMeshLinks}`;
      meshLayerRef.current.clearLayers();

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
    }

    if (formationSignatureRef.current !== `${formationSignature}#${topologySignature}`) {
      formationSignatureRef.current = `${formationSignature}#${topologySignature}`;
      formationLayerRef.current.clearLayers();

      formations.forEach((form) => {
        if (!form.isOpen || form.members.length < 2) return;
        const formCoords: [number, number][] = [];

        form.members.forEach((m) => {
          const liveNode = nodes.find((n) => n.id === m.nodeId);
          const pos = liveNode?.latest_positions?.[liveNode.latest_positions.length - 1];
          if (pos && typeof pos.lat === 'number' && typeof pos.lon === 'number') {
            formCoords.push([pos.lat, pos.lon]);
          }
        });

        if (formCoords.length > 1) {
          L.polyline(formCoords, {
            color: form.color || '#06b6d4',
            weight: 4,
            opacity: 0.85,
            dashArray: '6, 6',
          }).addTo(formationLayerRef.current!);
        }
      });
    }
  }, [nodesWithValidPos, selectedNodeId, showTrails, showMeshLinks, showAccuracyCircles, formations, onSelectNode]);

  // Centralizar no nó selecionado.
  // So reage a mudanca de selecao: reagir a `nodes` fazia o mapa dar um
  // salto a cada polling, brigando com o zoom que o usuario ajustou.
  const lastCenteredRef = useRef<number | null>(null);
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || selectedNodeId == null) return;
    if (lastCenteredRef.current === selectedNodeId) return;
    lastCenteredRef.current = selectedNodeId;

    const targetNode = nodes.find((n) => n.id === selectedNodeId);
    const positions = targetNode?.latest_positions;
    if (positions && positions.length > 0) {
      const last = positions[positions.length - 1];
      map.flyTo([last.lat, last.lon], Math.max(map.getZoom(), 15), {
        duration: 0.6,
      });
    }
  }, [selectedNodeId, nodes]);

  // Ao limpar a selecao, permite re-centralizar no mesmo no depois.
  useEffect(() => {
    if (selectedNodeId == null) lastCenteredRef.current = null;
  }, [selectedNodeId]);

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

  return (
    <div className="relative w-full h-full flex-1 overflow-hidden bg-[#070b12]">
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Indicador de carregamento de tiles */}
      {tilesLoading && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[500] flex flex-col items-center gap-2 pointer-events-none">
          <Loader2 className="w-7 h-7 text-orange-400 animate-spin" />
          <span className="text-[10px] font-tactical text-orange-300 bg-slate-900/90 border border-orange-500/30 px-2.5 py-1 rounded">
            CARREGANDO MAPA
          </span>
        </div>
      )}

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
        {/* Alternancia rapida Topo <-> Satelite */}
        <button
          onClick={() => setActiveLayer((prev) => (prev === 'topo' ? 'satellite' : 'topo'))}
          className="px-2.5 h-9 rounded-lg bg-slate-900/90 backdrop-blur-md border border-orange-500/40 text-orange-400 flex items-center gap-1.5 hover:bg-orange-500 hover:text-slate-950 transition-all shadow-lg font-tactical text-[10px] font-bold"
          title={activeLayer === 'topo' ? 'Trocar para Satélite HD' : 'Trocar para OpenTopoMap'}
        >
          {activeLayer === 'topo' ? (
            <>
              <Satellite className="w-4 h-4" />
              <span>SAT</span>
            </>
          ) : (
            <>
              <MapIcon className="w-4 h-4" />
              <span>TOPO</span>
            </>
          )}
        </button>

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
                onClick={() => { setActiveLayer('topo'); setIsLayerMenuOpen(false); }}
                className={`text-left px-2 py-1.5 rounded text-xs font-tactical ${activeLayer === 'topo' ? 'bg-orange-500/20 text-orange-300 font-bold border border-orange-500/40' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                🗺️ OpenTopoMap (Relevo)
              </button>
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
