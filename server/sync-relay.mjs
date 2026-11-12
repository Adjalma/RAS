/**
 * Relay MQTT <-> WebSocket para sincronizacao entre estacoes.
 *
 * O broker `mqtt.legendariosrio.com.br` aceita apenas MQTT nativo (TCP 1883),
 * sem suporte a WebSocket. O browser nao fala TCP, entao este relay roda
 * junto do servidor de desenvolvimento e converte:
 *
 *   browser --ws--> relay --mqtt(tcp)--> broker
 *
 * Quando o relay nao esta disponivel (ex: deploy estatico), o frontend
 * cai automaticamente para sincronizacao via REST + polling.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import mqtt from 'mqtt';

// Carrega o .env local (formato KEY=VALUE) sem depender de dependencias.
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    const key = match[1];
    const value = match[2].replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const HTTP_PORT = Number(process.env.SYNC_PORT || 8901);
const MQTT_HOST = process.env.MQTT_HOST || 'mqtt.legendariosrio.com.br';
const MQTT_PORT = Number(process.env.MQTT_PORT || 1883);
const MQTT_USER = process.env.MQTT_USER || '';
const MQTT_PASS = process.env.MQTT_PASS || '';
const SYNC_TOPIC = 'ras/sync/legendarios';

// O clientId precisa ser unico por instancia: o broker desconecta a
// sessao anterior quando dois clientes usam o mesmo ID, o que colocaria
// o relay em loop de reconexao caso mais de uma instancia rode local.
const CLIENT_ID = `ras-sync-relay-${HTTP_PORT}-${Math.random().toString(36).slice(2, 8)}`;

const broker = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, {
  username: MQTT_USER || undefined,
  password: MQTT_PASS || undefined,
  clientId: CLIENT_ID,
  clean: true,
  reconnectPeriod: 5000,
});

if (!MQTT_USER || !MQTT_PASS) {
  console.warn(
    '[sync-relay] MQTT_USER/MQTT_PASS nao definidos. Defina as variaveis de ' +
      'ambiente ou use um arquivo .env (veja .env.example). A sincronizacao ' +
      'entre estacoes permanecera desativada.'
  );
}

broker.on('connect', () => {
  console.log(`[sync-relay] conectado ao broker ${MQTT_HOST}:${MQTT_PORT}`);
  broker.subscribe(SYNC_TOPIC, { qos: 1 });
});

broker.on('message', (topic, payload) => {
  if (topic !== SYNC_TOPIC) return;
  const data = payload.toString();
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
});

broker.on('error', (err) => {
  console.error('[sync-relay] erro no broker:', err.message);
});

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: wss.clients.size, broker: broker.connected }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: '/sync' });

wss.on('connection', (ws) => {
  console.log(`[sync-relay] cliente conectado (${wss.clients.size} ativos)`);

  ws.on('message', (raw) => {
    const text = raw.toString('utf-8').trim();
    if (!text) return;
    broker.publish(SYNC_TOPIC, text, { qos: 1 });
  });

  ws.on('close', () => {
    console.log(`[sync-relay] cliente desconectado (${wss.clients.size} ativos)`);
  });

  ws.on('error', () => {});
});

server.listen(HTTP_PORT, () => {
  console.log(`[sync-relay] escutando em ws://localhost:${HTTP_PORT}/sync`);
});
