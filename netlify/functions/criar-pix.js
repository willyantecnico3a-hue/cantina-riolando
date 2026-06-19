const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

exports.handler = async function (event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return resposta(200, { ok: true });
    }

    if (event.httpMethod === "GET") {
      return resposta(200, {
        ok: true,
        mensagem: "Funcao criar-pix ativa. Ela cria o pedido e gera Pix pelo Mercado Pago."
      });
    }

    if (event.httpMethod !== "POST") {
      return resposta(405, {
        ok: false,
        error: "Metodo nao permitido. Use POST."
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return resposta(500, {
        ok: false,
        error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao configurados no Netlify."
      });
    }

    if (!MP_ACCESS_TOKEN) {
      return resposta(500, {
        ok: false,
        error: "MP_ACCESS_TOKEN nao configurado no Netlify. O Pix automatico precisa do token do Mercado Pago."
      });
    }

    const body = parseBody(event.body);
    const clienteNome = normalizarCampo(body.cliente_nome || body.nome || "Cliente", 80);
    const clienteEmail = normalizarEmail(body.cliente_email || body.email);
    const total = Number(body.total || body.valor || 0);
    const itens = Array.isArray(body.itens) ? body.itens : [];
    const canalVenda = normalizarCampo(body.canal_venda || "totem", 20);
    const turno = normalizarCampo(body.turno || "", 20) || null;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const numeroPedido = gerarNumeroPedido(body.numero_pedido);

    if (!Number.isFinite(total) || total <= 0) {
      return resposta(400, {
        ok: false,
        error: "Valor do pedido invalido.",
        total_recebido: body.total,
        valor_recebido: body.valor
      });
    }

    if (!clienteNome || !clienteEmail) {
      return resposta(400, {
        ok: false,
        error: "Nome e e-mail do cliente sao obrigatorios."
      });
    }

    if (itens.length === 0) {
      return resposta(400, {
        ok: false,
        error: "Lista de itens vazia."
      });
    }

    const pedidoCriado = await criarPedidoNoBanco({
      numeroPedido,
      clienteNome,
      clienteEmail,
      total,
      canalVenda,
      turno,
      expiresAt
    });

    if (!pedidoCriado.ok) {
      return resposta(500, {
        ok: false,
        error: "Erro ao criar pedido no banco.",
        detalhes: pedidoCriado.detalhes
      });
    }

    const itensCriados = await inserirItensNoBanco(pedidoCriado.pedido.id, itens);

    if (!itensCriados.ok) {
      await atualizarPedido(pedidoCriado.pedido.id, {
        status: "erro_pagamento",
        status_pagamento: "erro_itens",
        mp_status_detail: itensCriados.detalhes
      });

      return resposta(500, {
        ok: false,
        error: "Pedido criado, mas houve erro ao salvar os itens.",
        detalhes: itensCriados.detalhes,
        pedido: pedidoCriado.pedido
      });
    }

    const descricao = normalizarCampo(
      body.description || body.descricao || `Pedido ${numeroPedido} - Cantina Riolando`,
      120
    );

    const pagamento = await criarPagamentoPixMercadoPago({
      pedidoId: pedidoCriado.pedido.id,
      total,
      descricao,
      clienteNome,
      clienteEmail,
      expiresAt,
      notificationUrl: montarNotificationUrl(event)
    });

    if (!pagamento.ok) {
      await atualizarPedido(pedidoCriado.pedido.id, {
        status: "erro_pagamento",
        status_pagamento: "rejected",
        mp_status_detail: pagamento.detalhes
      });

      return resposta(502, {
        ok: false,
        error: "Mercado Pago recusou a criacao do Pix.",
        detalhes: pagamento.detalhes,
        pedido: pedidoCriado.pedido
      });
    }

    const payment = pagamento.payment;
    const transactionData = payment?.point_of_interaction?.transaction_data || {};

    if (payment.status === "rejected" || (!transactionData.qr_code && !transactionData.ticket_url)) {
      await atualizarPedido(pedidoCriado.pedido.id, {
        mercado_pago_payment_id: payment?.id ? String(payment.id) : null,
        status: "erro_pagamento",
        status_pagamento: payment.status || "rejected",
        mp_status_detail: payment.status_detail || "pix_sem_qr_code",
        expires_at: expiresAt
      });

      return resposta(502, {
        ok: false,
        error: "Pagamento Pix rejeitado pelo Mercado Pago.",
        status: payment.status || null,
        status_detail: payment.status_detail || null,
        detalhes: payment,
        pedido: pedidoCriado.pedido
      });
    }

    await atualizarPedido(pedidoCriado.pedido.id, {
      mercado_pago_payment_id: String(payment.id),
      status_pagamento: payment.status || "pending",
      mp_status_detail: payment.status_detail || null,
      pix_qr_code: transactionData.qr_code || null,
      pix_qr_code_base64: transactionData.qr_code_base64 || null,
      pix_ticket_url: transactionData.ticket_url || null,
      expires_at: expiresAt
    });

    return resposta(200, {
      ok: true,
      pedido: pedidoCriado.pedido,
      payment_id: String(payment.id),
      status: payment.status || "pending",
      status_detail: payment.status_detail || null,
      external_reference: String(pedidoCriado.pedido.id),
      expires_at: expiresAt,
      qr_code_base64: transactionData.qr_code_base64 || null,
      qr_code: transactionData.qr_code || null,
      ticket_url: transactionData.ticket_url || null,
      pix_qr_url: transactionData.ticket_url || null,
      pix_qr_code: transactionData.qr_code || null,
      pix_qr_code_base64: transactionData.qr_code_base64 || null,
      pix_ticket_url: transactionData.ticket_url || null
    });
  } catch (erro) {
    console.error("Erro geral criar-pix:", erro);

    return resposta(500, {
      ok: false,
      error: "Erro interno na funcao criar-pix.",
      detalhes: erro.message || String(erro)
    });
  }
};

async function criarPagamentoPixMercadoPago({
  pedidoId,
  total,
  descricao,
  clienteNome,
  clienteEmail,
  expiresAt,
  notificationUrl
}) {
  const payload = {
    transaction_amount: Number(total.toFixed(2)),
    description: descricao,
    payment_method_id: "pix",
    external_reference: String(pedidoId),
    date_of_expiration: expiresAt,
    payer: {
      email: clienteEmail,
      first_name: clienteNome
    }
  };

  if (notificationUrl) {
    payload.notification_url = notificationUrl;
  }

  const resp = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `pedido-${pedidoId}`
    },
    body: JSON.stringify(payload)
  });

  const texto = await resp.text();
  let payment = null;

  try {
    payment = texto ? JSON.parse(texto) : null;
  } catch {
    payment = texto;
  }

  if (!resp.ok) {
    return {
      ok: false,
      detalhes: typeof payment === "string" ? payment : JSON.stringify(payment)
    };
  }

  return { ok: true, payment };
}

async function criarPedidoNoBanco({ numeroPedido, clienteNome, clienteEmail, total, canalVenda, turno, expiresAt }) {
  const url = `${SUPABASE_URL}/rest/v1/pedidos`;

  const resp = await fetch(url, {
    method: "POST",
    headers: headersSupabase(SUPABASE_SERVICE_ROLE_KEY),
    body: JSON.stringify({
      numero_pedido: numeroPedido,
      cliente_nome: clienteNome,
      cliente_email: clienteEmail,
      total: Number(total.toFixed(2)),
      canal_venda: canalVenda,
      turno,
      status: "aguardando_pagamento",
      status_pagamento: "pending",
      expires_at: expiresAt
    })
  });

  const texto = await resp.text();

  if (!resp.ok) {
    return { ok: false, detalhes: texto };
  }

  let dados = [];
  try {
    dados = texto ? JSON.parse(texto) : [];
  } catch {
    dados = [];
  }

  const pedido = Array.isArray(dados) ? dados[0] : dados;

  if (!pedido || !pedido.id) {
    return { ok: false, detalhes: "Supabase nao retornou o pedido criado." };
  }

  return { ok: true, pedido };
}

async function inserirItensNoBanco(pedidoId, itens) {
  const url = `${SUPABASE_URL}/rest/v1/itens_pedido`;

  const itensLimpos = itens.map((item) => ({
    pedido_id: pedidoId,
    produto_id: item.produto_id,
    produto_nome: normalizarCampo(item.produto_nome || item.nome || "Produto", 120),
    quantidade: Number(item.quantidade || 1),
    preco_unitario: Number(item.preco_unitario || item.preco || 0),
    subtotal: Number(item.subtotal || (Number(item.preco_unitario || item.preco || 0) * Number(item.quantidade || 1)))
  }));

  const resp = await fetch(url, {
    method: "POST",
    headers: headersSupabase(SUPABASE_SERVICE_ROLE_KEY),
    body: JSON.stringify(itensLimpos)
  });

  const texto = await resp.text();

  if (!resp.ok) {
    return { ok: false, detalhes: texto };
  }

  return { ok: true, detalhes: texto };
}

async function atualizarPedido(pedidoId, dadosAtualizacao) {
  const url = `${SUPABASE_URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(pedidoId)}`;

  const resp = await fetch(url, {
    method: "PATCH",
    headers: headersSupabase(SUPABASE_SERVICE_ROLE_KEY),
    body: JSON.stringify(dadosAtualizacao)
  });

  if (!resp.ok) {
    const texto = await resp.text();
    console.error("Erro ao atualizar pedido:", texto);
  }
}

function montarNotificationUrl(event) {
  if (process.env.MP_NOTIFICATION_URL) return process.env.MP_NOTIFICATION_URL;
  if (process.env.MP_WEBHOOK_URL) return process.env.MP_WEBHOOK_URL;

  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (siteUrl && siteUrl.startsWith("https://")) {
    return `${siteUrl.replace(/\/$/, "")}/.netlify/functions/webhook-mercadopago`;
  }

  const host = event.headers?.host || event.headers?.Host;
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    return `https://${host}/.netlify/functions/webhook-mercadopago`;
  }

  return null;
}

function normalizarCampo(valor, limite) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s\-\.]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limite);
}

function normalizarEmail(valor) {
  return String(valor || "").trim().toLowerCase();
}

function gerarNumeroPedido(numeroPedidoEnviado) {
  const numero = Number(numeroPedidoEnviado);
  if (Number.isInteger(numero) && numero > 0) return numero;

  return Math.floor(1000 + Math.random() * 9000);
}

function headersSupabase(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };
}

function parseBody(body) {
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
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
