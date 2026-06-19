/* =========================================================
   netlify/functions/webhook-mercadopago.js
   Webhook de confirmação automática do Pix.
========================================================= */

exports.handler = async function (event) {
  try {
    if (event.httpMethod === "GET") {
      return resposta(200, { ok: true, mensagem: "Webhook Mercado Pago ativo." });
    }

    if (event.httpMethod !== "POST") {
      return resposta(405, { ok: false, erro: "Método não permitido. Use POST." });
    }

    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!MP_ACCESS_TOKEN) {
      return resposta(500, { ok: false, erro: "MP_ACCESS_TOKEN não configurado no Netlify." });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return resposta(500, {
        ok: false,
        erro: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados no Netlify."
      });
    }

    let body = {};
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch (e) {
      console.error("Body inválido recebido no webhook:", event.body);
      body = {};
    }

    const query = event.queryStringParameters || {};

    console.log("Webhook recebido:", JSON.stringify(body, null, 2));
    console.log("Query params:", query);

    const paymentId =
      body?.data?.id ||
      body?.id ||
      query?.["data.id"] ||
      query?.id;

    const tipo =
      body?.type ||
      body?.topic ||
      query?.type ||
      query?.topic;

    if (!paymentId) {
      return resposta(200, {
        ok: true,
        mensagem: "Notificação recebida, mas sem paymentId. Ignorada.",
        tipo
      });
    }

    const pagamentoResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    const pagamento = await pagamentoResp.json();

    console.log("Pagamento consultado:", JSON.stringify(pagamento, null, 2));

    if (!pagamentoResp.ok) {
      return resposta(500, {
        ok: false,
        erro: "Erro ao consultar pagamento no Mercado Pago.",
        detalhes: pagamento
      });
    }

    const statusPagamento = pagamento.status;
    const statusDetail = pagamento.status_detail || null;
    const externalReference = pagamento.external_reference || null;
    const valorPago = pagamento.transaction_amount || pagamento.total_paid_amount || null;

    await atualizarPedido({
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      paymentId,
      externalReference,
      dadosAtualizacao: {
        mercado_pago_payment_id: String(paymentId),
        status_pagamento: statusPagamento,
        mp_status_detail: statusDetail
      }
    });

    if (statusPagamento !== "approved") {
      return resposta(200, {
        ok: true,
        mensagem: "Pagamento ainda não aprovado. Pedido não liberado.",
        paymentId,
        statusPagamento,
        statusDetail,
        externalReference
      });
    }

    const resultadoUpdate = await atualizarPedido({
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      paymentId,
      externalReference,
      dadosAtualizacao: {
        mercado_pago_payment_id: String(paymentId),
        status_pagamento: "approved",
        mp_status_detail: statusDetail,
        status: "pago",
        pago_em: new Date().toISOString()
      }
    });

    return resposta(200, {
      ok: true,
      mensagem: "Pagamento aprovado. Pedido atualizado para pago.",
      paymentId,
      externalReference,
      valorPago,
      resultadoUpdate
    });
  } catch (erro) {
    console.error("Erro geral no webhook:", erro);
    return resposta(500, {
      ok: false,
      erro: erro.message || "Erro interno no webhook."
    });
  }
};

async function atualizarPedido({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  paymentId,
  externalReference,
  dadosAtualizacao
}) {
  let atualizadoPor = null;
  let ultimoErro = null;

  if (externalReference) {
    const url = `${SUPABASE_URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(String(externalReference))}`;

    const resp = await fetch(url, {
      method: "PATCH",
      headers: {
        ...headersSupabase(SUPABASE_SERVICE_ROLE_KEY),
        Prefer: "return=representation"
      },
      body: JSON.stringify(dadosAtualizacao)
    });

    const texto = await resp.text();

    if (!resp.ok) {
      ultimoErro = texto;
      console.error("Erro ao atualizar pedido por external_reference/id:", texto);
    } else {
      try {
        const dados = texto ? JSON.parse(texto) : [];
        if (Array.isArray(dados) && dados.length > 0) {
          atualizadoPor = "external_reference";
        }
      } catch {
        atualizadoPor = "external_reference";
      }
    }
  }

  if (!atualizadoPor) {
    const url = `${SUPABASE_URL}/rest/v1/pedidos?mercado_pago_payment_id=eq.${encodeURIComponent(String(paymentId))}`;

    const resp = await fetch(url, {
      method: "PATCH",
      headers: {
        ...headersSupabase(SUPABASE_SERVICE_ROLE_KEY),
        Prefer: "return=representation"
      },
      body: JSON.stringify(dadosAtualizacao)
    });

    const texto = await resp.text();

    if (!resp.ok) {
      ultimoErro = texto;
      console.error("Erro ao atualizar pedido por mercado_pago_payment_id:", texto);
    } else {
      try {
        const dados = texto ? JSON.parse(texto) : [];
        if (Array.isArray(dados) && dados.length > 0) {
          atualizadoPor = "mercado_pago_payment_id";
        }
      } catch {
        atualizadoPor = "mercado_pago_payment_id";
      }
    }
  }

  return {
    paymentId,
    externalReference,
    atualizado: Boolean(atualizadoPor),
    atualizadoPor,
    ultimoErro
  };
}

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
