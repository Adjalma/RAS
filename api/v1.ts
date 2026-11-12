import type { VercelRequest, VercelResponse } from '@vercel/node';

const BACKEND_BASE = 'https://logistica.legendariosrio.com.br';

/**
 * BFF (Backend-For-Frontend) Serverless na Vercel.
 *
 * O navegador chama este endpoint sem nenhum token ou credencial.
 * A autorizacao ocorre no lado do servidor usando a variavel de ambiente
 * secreta `MESH_AUTH_HEADER` configurada no painel da Vercel.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Variavel de ambiente segura no servidor Vercel (nunca exposta ao bundle do cliente)
  const authHeader = process.env.MESH_AUTH_HEADER || process.env.VITE_MESH_AUTH_HEADER || '';

  if (!authHeader) {
    return res.status(500).json({
      error: 'MESH_AUTH_HEADER não configurada nas variáveis de ambiente da Vercel.',
    });
  }

  // Extrai o caminho e query string
  // Exemplo: /api/v1?path=node ou /api/v1/node?from=2026-11-12...
  const pathParam = req.query.path;
  const subPath = Array.isArray(pathParam) ? pathParam.join('/') : pathParam || 'node';

  // Clona os parametros de query exceto o proprio "path"
  const queryParams = new URLSearchParams();
  Object.entries(req.query).forEach(([key, value]) => {
    if (key !== 'path' && value != null) {
      queryParams.set(key, String(value));
    }
  });

  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const targetUrl = `${BACKEND_BASE}/v1/${subPath}${queryString}`;

  try {
    const backendRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
    });

    const data = await backendRes.json();

    // Cache suave de 2 segundos para evitar sobrecarga no backend
    res.setHeader('Cache-Control', 's-maxage=2, stale-while-revalidate=5');
    return res.status(backendRes.status).json(data);
  } catch (error: any) {
    console.error('[BFF Error]', error);
    return res.status(502).json({
      error: 'Falha de comunicação com o backend mesh.',
      detail: error?.message,
    });
  }
}
