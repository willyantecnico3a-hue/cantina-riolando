/* =========================================================
   netlify/functions/cancelar-pedidos-expirados.js

   Cancela pedidos aguardando pagamento há mais de 5 minutos.

   Variáveis necessárias no Netlify:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
========================================================= */

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return resposta(405, { ok: false, erro: "Método não permitido." });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return resposta(500, {
        ok: false,
        erro: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados no Netlify."
      });
    }

    const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cancelar_pedidos_expirados`, {
      method: "POST",
      headers: headersSupabase(SUPABASE_SERVICE_ROLE_KEY),
      body: JSON.stringify({})
    });

    const rpcText = await rpcResp.text();

    if (rpcResp.ok) {
      return resposta(200, {
        ok: true,
        origem: "rpc",
        cancelados: rpcText ? JSON.parse(rpcText) : 0
      });
    }

    console.error("Erro na RPC cancelar_pedidos_expirados:", rpcText);

    const cincoMinutosAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const patchUrl =
      `${SUPABASE_URL}/rest/v1/pedidos` +
      `?status=eq.aguardando_pagamento` +
      `&created_at=lt.${encodeURIComponent(cincoMinutosAtras)}`;

    const patchResp = await fetch(patchUrl, {
      method: "PATCH",
      headers: {
        ...headersSupabase(SUPABASE_SERVICE_ROLE_KEY),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        status: "expirado",
        status_pagamento: "expired",
        cancelado_em: new Date().toISOString()
      })
    });

    const patchText = await patchResp.text();

    if (!patchResp.ok) {
      return resposta(500, {
        ok: false,
        erro: "Erro ao cancelar pedidos expirados.",
        detalhes: patchText
      });
    }

    let pedidosCancelados = [];

    try {
      pedidosCancelados = patchText ? JSON.parse(patchText) : [];
    } catch {
      pedidosCancelados = [];
    }

    return resposta(200, {
      ok: true,
      origem: "fallback",
      cancelados: pedidosCancelados.length
    });

  } catch (erro) {
    console.error("Erro geral cancelar-pedidos-expirados:", erro);
    return resposta(500, {
      ok: false,
      erro: erro.message || "Erro interno."
    });
  }
};

function headersSupabase(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function resposta(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
