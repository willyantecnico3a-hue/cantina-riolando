/* =========================================================
   netlify/functions/criar-pix.js
   Cria Pix no Mercado Pago e salva payment_id no Supabase.

   Variáveis no Netlify:
   - MP_ACCESS_TOKEN
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - MP_WEBHOOK_URL opcional
========================================================= */

const crypto = require("crypto");

exports.handler = async function (event) {
  try {
    if (event.httpMethod === "OPTIONS") return resposta(200, { ok: true });

    if (event.httpMethod !== "POST") {
      return resposta(405, { ok: false, error: "Método não permitido. Use POST." });
    }

    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!MP_ACCESS_TOKEN) {
      return resposta(500, { ok: false, error: "MP_ACCESS_TOKEN não configurado no Netlify." });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return resposta(500, {
        ok: false,
        error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados no Netlify."
      });
    }

    const body = event.body ? JSON.parse(event.body) : {};

    const pedidoId = body.pedido_id;
    const numeroPedido = body.numero_pedido || "sem-numero";
    const total = Number(body.total || body.valor || 0);
    const clienteNome = body.cliente_nome || "Cliente";
    const clienteEmail = body.cliente_email || "cliente@email.com";

    if (!pedidoId) {
      return resposta(400, { ok: false, error: "pedido_id não enviado pelo app.js." });
    }

    if (!total || total <= 0) {
      return resposta(400, { ok: false, error: "Valor do pedido inválido." });
    }

    const webhookUrl =
      process.env.MP_WEBHOOK_URL ||
      (process.env.URL
        ? `${process.env.URL}/.netlify/functions/webhook-mercadopago`
        : undefined);

    const pagamentoPayload = {
      transaction_amount: total,
      description: `Pedido ${numeroPedido} - Cantina Riolando`,
      payment_method_id: "pix",
      external_reference: String(pedidoId),
      payer: {
        email: clienteEmail,
        first_name: clienteNome
      }
    };

    if (webhookUrl) {
      pagamentoPayload.notification_url = webhookUrl;
    }

    const mpResp = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify(pagamentoPayload)
    });

    const pagamento = await mpResp.json();

    console.log("Resposta Mercado Pago criar Pix:", JSON.stringify(pagamento, null, 2));

    if (!mpResp.ok) {
      return resposta(500, {
        ok: false,
        error: "Erro ao criar Pix no Mercado Pago.",
        detalhes: pagamento
      });
    }

    const transactionData = pagamento?.point_of_interaction?.transaction_data || {};

    const qrCodeBase64 = transactionData.qr_code_base64 || null;
    const qrCode = transactionData.qr_code || null;
    const ticketUrl = transactionData.ticket_url || null;

    const updateResp = await fetch(
      `${SUPABASE_URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(String(pedidoId))}`,
      {
        method: "PATCH",
        headers: headersSupabase(SUPABASE_SERVICE_ROLE_KEY),
        body: JSON.stringify({
          mercado_pago_payment_id: String(pagamento.id),
          status_pagamento: pagamento.status || "pending",
          mp_status_detail: pagamento.status_detail || null
        })
      }
    );

    const updateText = await updateResp.text();

    if (!updateResp.ok) {
      console.error("Erro ao salvar payment_id no Supabase:", updateText);
      return resposta(500, {
        ok: false,
        error: "Pix criado, mas erro ao salvar payment_id no Supabase.",
        detalhes: updateText,
        payment_id: pagamento.id,
        qr_code_base64: qrCodeBase64,
        qr_code: qrCode,
        ticket_url: ticketUrl
      });
    }

    return resposta(200, {
      ok: true,
      payment_id: pagamento.id,
      status: pagamento.status,
      status_detail: pagamento.status_detail,
      external_reference: pagamento.external_reference,
      qr_code_base64: qrCodeBase64,
      qr_code: qrCode,
      ticket_url: ticketUrl
    });
  } catch (erro) {
    console.error("Erro geral criar-pix:", erro);
    return resposta(500, {
      ok: false,
      error: erro.message || "Erro interno ao gerar Pix."
    });
  }
};

function headersSupabase(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal"
  };
}

function resposta(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

/* =========================================================
   netlify/functions/criar-pix.js
   Versão com expiração de 5 minutos e external_reference.

   Variáveis necessárias no Netlify:
   - MP_ACCESS_TOKEN
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - MP_WEBHOOK_URL opcional
========================================================= */

const crypto = require("crypto");

exports.handler = async function (event) {
  try {
    if (event.httpMethod === "OPTIONS") return resposta(200, { ok: true });

    if (event.httpMethod !== "POST") {
      return resposta(405, { ok: false, error: "Método não permitido. Use POST." });
    }

    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!MP_ACCESS_TOKEN) {
      return resposta(500, { ok: false, error: "MP_ACCESS_TOKEN não configurado no Netlify." });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return resposta(500, {
        ok: false,
        error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados no Netlify."
      });
    }

    const body = event.body ? JSON.parse(event.body) : {};

    const pedidoId = body.pedido_id;
    const numeroPedido = body.numero_pedido || "sem-numero";
    const total = Number(body.total || body.valor || 0);
    const clienteNome = body.cliente_nome || "Cliente";
    const clienteEmail = body.cliente_email || "cliente@email.com";
    const expiresAt = body.expires_at || new Date(Date.now() + 5 * 60 * 1000).toISOString();

    if (!pedidoId) {
      return resposta(400, { ok: false, error: "pedido_id não enviado pelo app.js." });
    }

    if (!total || total <= 0) {
      return resposta(400, { ok: false, error: "Valor do pedido inválido." });
    }

    const webhookUrl =
      process.env.MP_WEBHOOK_URL ||
      (process.env.URL
        ? `${process.env.URL}/.netlify/functions/webhook-mercadopago`
        : undefined);

    const pagamentoPayload = {
      transaction_amount: total,
      description: `Pedido ${numeroPedido} - Cantina Riolando`,
      payment_method_id: "pix",
      external_reference: String(pedidoId),
      date_of_expiration: expiresAt,
      payer: {
        email: clienteEmail,
        first_name: clienteNome
      }
    };

    if (webhookUrl) {
      pagamentoPayload.notification_url = webhookUrl;
    }

    const mpResp = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify(pagamentoPayload)
    });

    const pagamento = await mpResp.json();

    console.log("Resposta Mercado Pago criar Pix:", JSON.stringify(pagamento, null, 2));

    if (!mpResp.ok) {
      return resposta(500, {
        ok: false,
        error: "Erro ao criar Pix no Mercado Pago.",
        detalhes: pagamento
      });
    }

    const transactionData = pagamento?.point_of_interaction?.transaction_data || {};

    const qrCodeBase64 = transactionData.qr_code_base64 || null;
    const qrCode = transactionData.qr_code || null;
    const ticketUrl = transactionData.ticket_url || null;

    const updateResp = await fetch(
      `${SUPABASE_URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(String(pedidoId))}`,
      {
        method: "PATCH",
        headers: headersSupabase(SUPABASE_SERVICE_ROLE_KEY),
        body: JSON.stringify({
          mercado_pago_payment_id: String(pagamento.id),
          status_pagamento: pagamento.status || "pending",
          mp_status_detail: pagamento.status_detail || null,
          expires_at: expiresAt
        })
      }
    );

    const updateText = await updateResp.text();

    if (!updateResp.ok) {
      console.error("Erro ao salvar payment_id no Supabase:", updateText);

      return resposta(500, {
        ok: false,
        error: "Pix criado, mas erro ao salvar payment_id no Supabase.",
        detalhes: updateText,
        payment_id: pagamento.id,
        qr_code_base64: qrCodeBase64,
        qr_code: qrCode,
        ticket_url: ticketUrl
      });
    }

    return resposta(200, {
      ok: true,
      payment_id: pagamento.id,
      status: pagamento.status,
      status_detail: pagamento.status_detail,
      external_reference: pagamento.external_reference,
      expires_at: expiresAt,
      qr_code_base64: qrCodeBase64,
      qr_code: qrCode,
      ticket_url: ticketUrl
    });

  } catch (erro) {
    console.error("Erro geral criar-pix:", erro);

    return resposta(500, {
      ok: false,
      error: erro.message || "Erro interno ao gerar Pix."
    });
  }
};

function headersSupabase(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal"
  };
}

function resposta(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

