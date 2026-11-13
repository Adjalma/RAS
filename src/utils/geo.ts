import { PositionData } from '../types/tactical';

/**
 * Calcula a distância em metros entre dois pontos geográficos (fórmula de Haversine)
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Raio da Terra em metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calcula o rumo (bearing) inicial em graus de P1 para P2 (0° a 360°)
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const lambdaDiff = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(lambdaDiff) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambdaDiff);
  const theta = Math.atan2(y, x);
  const bearing = ((theta * 180) / Math.PI + 360) % 360;
  return Math.round(bearing);
}

/**
 * Converte graus decimais para formato tático militar amigável (DMS)
 */
export function formatTacticalCoords(lat: number, lon: number): string {
  const formatDMS = (val: number, isLat: boolean) => {
    const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
    const absVal = Math.abs(val);
    const deg = Math.floor(absVal);
    const minFloat = (absVal - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(1);
    return `${deg}°${min}'${sec}"${dir}`;
  };
  return `${formatDMS(lat, true)} ${formatDMS(lon, false)}`;
}

/**
 * Retorna uma cor vibrante consistente para cada ID de nó (paleta tática)
 */
export function getNodeColor(id: number): string {
  const palette = [
    '#06b6d4', // Cyan
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#a855f7', // Purple
    '#ec4899', // Pink
    '#3b82f6', // Blue
    '#14b8a6', // Teal
    '#84cc16', // Lime
  ];
  const index = Math.abs(id) % palette.length;
  return palette[index];
}

/**
 * Identifica se o nó é uma estação fixa, repetidora, roteador ou nó de infraestrutura.
 * Esses rádios tipicamente operam em pontos fixos (morros, torres, bases)
 * e usam coordenadas manuais (Fixed Position) no Meshtastic sem fix de satélite (sat=0).
 */
export function isStationOrRepeater(name?: string | null, role?: string | null): boolean {
  if (!name && !role) return false;
  const normalized = `${name || ''} ${role || ''}`.toUpperCase();
  return (
    normalized.includes('REP') ||
    normalized.includes('AAAA') ||
    normalized.includes('ROUTER') ||
    normalized.includes('REPEATER') ||
    normalized.includes('BASE') ||
    normalized.includes('TORRE') ||
    normalized.includes('FIXO') ||
    normalized.includes('FIXED') ||
    normalized.includes('GATEWAY') ||
    normalized.includes('GW')
  );
}

/**
 * Verifica se uma posição tem fix confiável ou é uma estação fixa/repetidora configurada.
 *
 * Rádios móveis em campo necessitam de satélites (sat > 0) para evitar a coordenada de fábrica.
 * Rádios de infraestrutura / repetidoras (como REP01, AAAA) utilizam coordenadas fixas
 * válidas configuradas no rádio, mesmo que sat=0.
 */
export function hasGpsFix(
  pos: { lat?: number | null; lon?: number | null; sat?: number | null } | null | undefined,
  nodeName?: string | null,
  role?: string | null
): boolean {
  if (!pos) return false;
  if (pos.lat == null || pos.lon == null || (pos.lat === 0 && pos.lon === 0)) return false;

  // Se for repetidora ou estação fixa conhecida, suas coordenadas configuradas são válidas
  if (isStationOrRepeater(nodeName, role)) {
    return true;
  }

  // Sem informação de satélites no payload, aceita se coordenadas forem plausíveis
  if (pos.sat == null) return true;
  return pos.sat > 0;
}

/**
 * Enriquece posições com velocidade calculada e rumo quando não fornecidos
 */
export function enrichPositions(positions: PositionData[]): PositionData[] {
  if (!positions || positions.length === 0) return [];

  const sorted = [...positions].sort(
    (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
  );

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const distMeters = calculateDistanceMeters(prev.lat, prev.lon, curr.lat, curr.lon);
    const dtSeconds = Math.max(
      1,
      (new Date(curr.received_at).getTime() - new Date(prev.received_at).getTime()) / 1000
    );

    // Velocidade em km/h
    const speedKmh = (distMeters / dtSeconds) * 3.6;
    curr.speed = Math.min(speedKmh, 200); // cap para evitar spikes de GPS
    curr.heading = calculateBearing(prev.lat, prev.lon, curr.lat, curr.lon);
  }

  return sorted;
}
