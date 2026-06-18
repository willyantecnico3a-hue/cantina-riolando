

document.addEventListener("DOMContentLoaded", async () => {
  await carregarPedidos();
  ouvirPedidosTempoReal();
});

async function carregarPedidos() {
  const { data, error } = await db
    .from("pedidos")
    .select("*, itens_pedido(*)")
    .in("status", ["aguardando_pagamento", "pago", "em_preparo", "pronto"])
    .order("created_at", { ascending: true });

  if (error) {
    alert("Erro ao carregar pedidos: " + error.message);
    return;
  }

  renderizarPedidos(data || []);
}

function renderizarPedidos(pedidos) {
  const area = document.getElementById("pedidosBalcao");
  area.innerHTML = "";

  if (pedidos.length === 0) {
    area.innerHTML = "<p>Nenhum pedido aberto.</p>";
    return;
  }

  pedidos.forEach(pedido => {
    const itens = pedido.itens_pedido?.map(i => `${i.quantidade}x ${i.produto_nome}`).join("<br>") || "";

    const div = document.createElement("div");
    div.className = "pedido";
    div.innerHTML = `
      <h2>Pedido nº ${pedido.numero_pedido}</h2>
      <p><strong>Cliente:</strong> ${pedido.cliente_nome}</p>
      <p><strong>Status:</strong> ${pedido.status}</p>
      <p><strong>Total:</strong> ${moeda(pedido.total)}</p>
      <p><strong>Itens:</strong><br>${itens}</p>

      <button class="btn principal" onclick="alterarStatus('${pedido.id}', 'pago')">Confirmar Pix</button>
      <button class="btn" onclick="alterarStatus('${pedido.id}', 'em_preparo')">Em preparo</button>
      <button class="btn" onclick="alterarStatus('${pedido.id}', 'pronto')">Pronto</button>
      <button class="btn alerta" onclick="entregarPedido('${pedido.id}')">Entregue / Baixar</button>
    `;
    area.appendChild(div);
  });
}

async function alterarStatus(id, status) {
  const { error } = await db.from("pedidos").update({ status }).eq("id", id);
  if (error) alert("Erro ao atualizar: " + error.message);
  await carregarPedidos();
}

async function entregarPedido(id) {
  const { data: itens, error: erroItens } = await db
    .from("itens_pedido")
    .select("*")
    .eq("pedido_id", id);

  if (erroItens) {
    alert("Erro ao buscar itens: " + erroItens.message);
    return;
  }

  for (const item of itens) {
    const { data: produto } = await db
      .from("produtos")
      .select("estoque")
      .eq("id", item.produto_id)
      .single();

    const novoEstoque = Math.max(0, Number(produto.estoque) - Number(item.quantidade));

    await db
      .from("produtos")
      .update({ estoque: novoEstoque })
      .eq("id", item.produto_id);
  }

  const { error } = await db
    .from("pedidos")
    .update({ status: "entregue", entregue_em: new Date().toISOString() })
    .eq("id", id);

  if (error) alert("Erro ao baixar pedido: " + error.message);
  await carregarPedidos();
}

function ouvirPedidosTempoReal() {
  db.channel("pedidos-balcao")
    .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, carregarPedidos)
    .on("postgres_changes", { event: "*", schema: "public", table: "itens_pedido" }, carregarPedidos)
    .subscribe();
}
