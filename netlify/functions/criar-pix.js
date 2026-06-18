const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

function responder(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return responder(200, { ok: true });
  }

  if (!MP_ACCESS_TOKEN) {
    return responder(500, {
      erro: "Variável de ambiente MP_ACCESS_TOKEN não configurada."
    });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return responder(400, { erro: "Corpo da requisição inválido." });
  }

  const valor = Number(payload.valor);

  if (!payload.numero_pedido || !payload.pedido_id || !Number.isFinite(valor) || valor <= 0) {
    return responder(400, { erro: "Dados incompletos para gerar Pix." });
  }

  const nomeCliente = String(payload.cliente_nome || "Cliente").slice(0, 60);
  const descricao = String(payload.descricao || `Pedido ${payload.numero_pedido}`).slice(0, 250);

  try {
    const resposta = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `${payload.pedido_id}`
      },
      body: JSON.stringify({
        transaction_amount: valor,
        description: descricao,
        payment_method_id: "pix",
        payer: {
          email: payload.cliente_email || "cliente@exemplo.com",
          first_name: nomeCliente
        }
      })
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      return responder(resposta.status, {
        erro: "Mercado Pago retornou erro ao criar o Pix.",
        detalhes: dados
      });
    }

    const qrCode = dados.point_of_interaction?.transaction_data?.qr_code;
    const qrCodeBase64 = dados.point_of_interaction?.transaction_data?.qr_code_base64;
    const ticketUrl = dados.point_of_interaction?.transaction_data?.ticket_url;

    return responder(200, {
      ok: true,
      payment_id: dados.id,
      pix_qr_code: qrCode,
      pix_qr_code_base64: qrCodeBase64,
      pix_ticket_url: ticketUrl,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      ticket_url: ticketUrl
    });
  } catch (error) {
    return responder(500, {
      erro: "Erro interno ao gerar Pix.",
      detalhes: error.message
    });
  }
};