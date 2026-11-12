# RAS — Divisão de Rastreamento dos Legendários

Sistema de rastreamento e comando tático para dispositivos LoRa/Meshtastic.

## Stack

React 18 · TypeScript (strict) · Vite 6 · Tailwind CSS 3 · Leaflet (Canvas/GPU) · MQTT

## Como executar

```powershell
npm install
npm run dev:all
```

`dev:all` sobe **duas** coisas:

| Processo | Porta | Função |
|---|---|---|
| Vite (app) | 3000 | Interface tática |
| Sync relay | 8901 | Converte WebSocket ↔ MQTT para sincronizar entre PCs |

Acesse `http://localhost:3000/`.

Para rodar separadamente:

```powershell
npm run dev    # só o app
npm run sync   # só o relay
```

## Arquitetura de rede

```
Navegador ──ws──▶ Vite :3000 ──wss──▶ logistica.legendariosrio.com.br/ws
     │                 (REST /v1/* com Authorization Basic)
     │
     └─ws─▶ Vite :3000 ──▶ relay :8901 ──mqtt(tcp)──▶ mqtt.legendariosrio.com.br:1883
                           (tópico ras/sync/legendarios)
```

O broker MQTT dos Legendários aceita **apenas MQTT nativo (TCP 1883)** — não tem
WebSocket. Como o navegador não fala TCP, o relay local faz a conversão.

### Canais de dados

| Canal | Transporte | Uso |
|---|---|---|
| Telemetria e posições | **WebSocket** (`/ws`) | Eventos ao vivo dos rádios |
| Consulta de nós | **REST** (`/v1/node`) | Lista e histórico |
| Reserva | Polling 4s | Ativa sozinho se o WebSocket cair |
| Sincronização entre PCs | **WebSocket + MQTT** (`/sync`) | Formações e seleção de nó |

O badge no topo indica o estado: `WS LIVE` (WebSocket ativo),
`DEGRADADO · POLLING 4s` (polling de reserva) ou `SEM SINAL`.

## Endpoints do backend

| Rota | Descrição |
|---|---|
| `GET /v1/node?from=YYYY-MM-DDTHH:MM:SS` | Nós com posições desde o timestamp. **O parâmetro é `from` (absoluto), não `hours`.** Sem ele a janela default é 3h. |
| `GET /v1/node/<id>` | Histórico completo de um nó |
| `WS /ws` | Stream de eventos `{id, lat, lon, alt, acc, sat, received_at}` e `{id, bat, received_at}` |

Autenticação: header `Authorization: Basic <token>`. O valor é configurável no
painel de configurações e fica no armazenamento local do navegador — não é
versionado no repositório. O nginx de produção bloqueia CORS (403 no preflight),
então o proxy do Vite é obrigatório.

## Formações táticas

Duas formações rodam simultaneamente, cada uma com líder, tolerância de gap e cor própria:

- **Santarem** — ciano (`#06b6d4`)
- **Represa** — laranja (`#f97316`)

Criadas e monitoradas pelo botão `SERPENTE` no topo. Cada uma desenha sua linha de
comando no mapa e alerta quando um operador se afasta além da tolerância.

O estado das formações é sincronizado entre PCs via MQTT.

## Regra do GPS

Posição só é usada quando o rádio reporta **satélites** (`sat > 0`).

Rádios com GPS sem fix (`sat = 0`) continuam publicando pacotes, mas com a
**posição fixa do firmware**, que pode ficar vários quilômetros do ponto real.
Essas posições não são desenhadas no mapa — a lista lateral exibe
*"Sem fix GPS (N sats) — posição não confiável"*.

## Camadas de mapa

| Camada | Provider |
|---|---|
| **OpenTopoMap** (padrão) | Relevo topográfico com curvas de nível |
| Satélite HD | Esri World Imagery |
| Cyber Dark | OpenStreetMap com filtro dark via CSS |
| OpenStreetMap | Cartografia padrão |

## Configuração

Pelo botão de engrenagem no topo:

- **Backend REST** e **WebSocket** — endpoints
- **Authorization header** — token Basic
- **Broker MQTT** — host, porta, usuário e senha
- **Janela de posições** — 1h a 1 ano
- **Limpar cache local** — descarta o cache do navegador

Credenciais do broker MQTT dos rádios são configuradas pelo painel de
configurações (botão de engrenagem) e ficam apenas no armazenamento local do
navegador — não são versionadas no repositório.

## Publicação

```powershell
git push origin main
```

Deploy na Vercel: importar o repositório. O `vercel.json` já roteia `/v1/*` e `/ws`
para o backend. Para sincronização entre PCs em produção, o relay precisa rodar
como serviço (Node) ou a troca passa a ser por polling.

## Verificação

```powershell
npm run typecheck
npm run build
```
