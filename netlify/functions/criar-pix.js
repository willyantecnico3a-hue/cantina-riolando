/* =========================================================
   netlify/functions/criar-pix.js
   Versão segura para corrigir erro 502 no Netlify
========================================================= */

exports.handler = async function (event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return resposta(200, { ok: true });
    }

    if (event.httpMethod === "GET") {
      return resposta(200, {
        ok: true,
        mensagem: "Função criar-pix ativa. Para gerar Pix, use POST pelo app.js."
      });
    }

    if (event.httpMethod !== "POST") {
      return resposta(405, {
        ok: false,
        error: "Método não permitido. Use POST."
      });
    }

    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!MP_ACCESS_TOKEN) {
      return resposta(500, {
        ok: false,
        error: "MP_ACCESS_TOKEN não configurado no Netlify."
      });
    }

    if (!SUPABASE_URL) {
      return resposta(500, {
        ok: false,
        error: "SUPABASE_URL não configurado no Netlify."
      });
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return resposta(500, {
        ok: false,
        error: "SUPABASE_SERVICE_ROLE_KEY não configurado no Netlify."
      });
    }

    let body = {};

    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch (jsonError) {
      return resposta(400, {
        ok: false,
        error: "Body JSON inválido enviado pelo app.js.",
        detalhes: jsonError.message
      });
    }

    console.log("Body recebido em criar-pix:", JSON.stringify(body, null, 2));

    const pedidoId = body.pedido_id;
    const numeroPedido = body.numero_pedido || "sem-numero";
    const total = Number(body.total || body.valor || 0);
    const clienteNome = body.cliente_nome || "Cliente";
    const clienteEmail = body.cliente_email || "cliente@email.com";

    if (!pedidoId) {
      return resposta(400, {
        ok: false,
        error: "pedido_id não enviado pelo app.js."
      });
    }

    if (!total || total <= 0) {
      return resposta(400, {
        ok: false,
        error: "Valor do pedido inválido.",
        total_recebido: body.total,
        valor_recebido: body.valor
      });
    }

    const expiresAt = body.expires_at || new Date(Date.now() + 15 * 60 * 1000).toISOString()

    const webhookUrl =
      process.env.MP_WEBHOOK_URL ||
      (process.env.URL
        ? `${process.env.URL}/.netlify/functions/webhook-mercadopago`
        : undefined);

    const pagamentoPayload = {
      transaction_amount: Number(total.toFixed(2)),
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

    console.log("Payload Mercado Pago:", JSON.stringify(pagamentoPayload, null, 2));

    const mpResp = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": gerarIdempotencyKey()
      },
      body: JSON.stringify(pagamentoPayload)
    });

    const pagamentoTexto = await mpResp.text();
    let pagamento = {};

    try {
      pagamento = pagamentoTexto ? JSON.parse(pagamentoTexto) : {};
    } catch {
      pagamento = { resposta_bruta: pagamentoTexto };
    }

    console.log("Resposta Mercado Pago:", JSON.stringify(pagamento, null, 2));

    if (!mpResp.ok) {
      return resposta(500, {
        ok: false,
        error: "Erro ao criar Pix no Mercado Pago.",
        status_mercado_pago: mpResp.status,
        detalhes: pagamento
      });
    }

    const transactionData = pagamento?.point_of_interaction?.transaction_data || {};

    const qrCodeBase64 = transactionData.qr_code_base64 || null;
    const qrCode = transactionData.qr_code || null;
    const ticketUrl = transactionData.ticket_url || null;

    if (!pagamento.id) {
      return resposta(500, {
        ok: false,
        error: "Mercado Pago respondeu sem ID de pagamento.",
        detalhes: pagamento
      });
    }

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
      console.error("Erro Supabase ao salvar payment_id:", updateText);

      return resposta(500, {
        ok: false,
        error: "Pix criado, mas houve erro ao salvar payment_id no Supabase.",
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
      error: "Erro interno na função criar-pix.",
      detalhes: erro.message || String(erro)
    });
  }
};

function gerarIdempotencyKey() {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch (e) {}

  return `pix-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
