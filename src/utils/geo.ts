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
 * Verifica se uma posição tem fix de GPS confiável.
 *
 * Radio Meshtastic com GPS desligado ou sem visada de satelite continua
 * publicando o pacote de posicao, mas com `sat=0` e a coordenada fixa
 * configurada no firmware (ou a ultima conhecida). Esses valores podem
 * ficar varios quilometros do ponto real, entao nao devem ser usados
 * para posicionar o operador no mapa.
 */
export function hasGpsFix(pos: { sat?: number | null } | null | undefined): boolean {
  if (!pos) return false;
  // Sem o campo `sat` (backend antigo), aceitamos a posicao.
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
