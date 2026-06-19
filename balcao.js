/* =========================================================
   balcao.js corrigido
   Sistema de Balcão - Totem Cantina Riolando

   Mostra automaticamente pedidos pagos pelo webhook:
   status = "pago" aparece como "Pago - aguardando retirada".
========================================================= */

let canalPedidosBalcao = null;
let timerAtualizacaoBalcao = null;

document.addEventListener("DOMContentLoaded", iniciarBalcao);

async function iniciarBalcao() {
  const banco = obterBanco();

  if (!banco) {
    mostrarErroBalcao("Erro: conexão com o Supabase não encontrada. Verifique config.js e supabaseClient.js.");
    return;
  }

  const area = document.getElementById("pedidosBalcao");

  if (!area) {
    alert("Erro: não encontrei a área #pedidosBalcao no arquivo balcao.html.");
    return;
  }

  await carregarPedidos();
  ouvirPedidosTempoReal();
}

function obterBanco() {
  if (typeof window !== "undefined" && window.db) return window.db;
  if (typeof db !== "undefined") return db;
  return null;
}

async function carregarPedidos() {
  const banco = obterBanco();
  const area = document.getElementById("pedidosBalcao");

  if (!area) return;

  if (!banco) {
    mostrarErroBalcao("Erro: Supabase não conectado.");
    return;
  }

  area.innerHTML = "<p>Carregando pedidos...</p>";

  const { data, error } = await banco
    .from("pedidos")
    .select("*, itens_pedido(*)")
    .in("status", ["aguardando_pagamento", "pago", "em_preparo", "pronto"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erro ao carregar pedidos:", error);
    area.innerHTML = `<p class="erro">Erro ao carregar pedidos: ${htmlSeguro(error.message)}</p>`;
    return;
  }

  renderizarPedidos(data || []);
}

function renderizarPedidos(pedidos) {
  const area = document.getElementById("pedidosBalcao");
  if (!area) return;

  area.innerHTML = "";

  if (!pedidos || pedidos.length === 0) {
    area.innerHTML = "<p>Nenhum pedido aberto no momento.</p>";
    return;
  }

  pedidos.forEach((pedido) => {
    const itens = montarListaItens(pedido);
    const statusTexto = formatarStatus(pedido.status);

    const div = document.createElement("div");
    div.className = `pedido status-${htmlSeguro(pedido.status)}`;

    div.innerHTML = `
      <h2>Pedido nº ${htmlSeguro(pedido.numero_pedido)}</h2>

      <p><strong>Cliente:</strong> ${htmlSeguro(pedido.cliente_nome)}</p>
      <p><strong>E-mail:</strong> ${htmlSeguro(pedido.cliente_email || "")}</p>
      <p><strong>Status:</strong> <span class="status">${statusTexto}</span></p>
      <p><strong>Total:</strong> ${formatarMoeda(pedido.total)}</p>
      <p><strong>Itens:</strong><br>${itens}</p>

      <div class="acoes-pedido">
        ${montarBotoesPedido(pedido)}
      </div>
    `;

    area.appendChild(div);
  });
}

function montarListaItens(pedido) {
  if (!pedido.itens_pedido || pedido.itens_pedido.length === 0) {
    return "Nenhum item encontrado.";
  }

  return pedido.itens_pedido
    .map((item) => {
      const quantidade = Number(item.quantidade || 0);
      const nome = htmlSeguro(item.produto_nome || "Produto");
      return `${quantidade}x ${nome}`;
    })
    .join("<br>");
}

function montarBotoesPedido(pedido) {
  const id = htmlSeguro(pedido.id);

  if (pedido.status === "aguardando_pagamento") {
    return `<button class="btn" disabled>Aguardando Pix</button>`;
  }

  if (pedido.status === "pago") {
    return `
      <button class="btn principal" onclick="alterarStatus('${id}', 'em_preparo')">
        Iniciar preparo
      </button>
    `;
  }

  if (pedido.status === "em_preparo") {
    return `
      <button class="btn principal" onclick="alterarStatus('${id}', 'pronto')">
        Marcar como pronto
      </button>
    `;
  }

  if (pedido.status === "pronto") {
    return `
      <button class="btn alerta" onclick="entregarPedido('${id}')">
        Entregue / Baixar estoque
      </button>
    `;
  }

  return "";
}

async function alterarStatus(id, status) {
  const banco = obterBanco();

  if (!banco) {
    alert("Erro: Supabase não conectado.");
    return;
  }

  const statusPermitidos = ["aguardando_pagamento", "pago", "em_preparo", "pronto", "entregue"];

  if (!statusPermitidos.includes(status)) {
    alert("Status inválido.");
    return;
  }

  const { error } = await banco
    .from("pedidos")
    .update({ status })
    .eq("id", id);

  if (error) {
    console.error("Erro ao atualizar status:", error);
    alert("Erro ao atualizar pedido: " + error.message);
    return;
  }

  await carregarPedidos();
}

async function entregarPedido(id) {
  const banco = obterBanco();

  if (!banco) {
    alert("Erro: Supabase não conectado.");
    return;
  }

  const confirmar = confirm("Confirmar que este pedido foi entregue e baixar o estoque?");
  if (!confirmar) return;

  const { data: pedido, error: erroPedido } = await banco
    .from("pedidos")
    .select("id, status, numero_pedido")
    .eq("id", id)
    .single();

  if (erroPedido || !pedido) {
    console.error("Erro ao buscar pedido:", erroPedido);
    alert("Erro ao buscar pedido.");
    return;
  }

  if (pedido.status === "entregue") {
    alert("Este pedido já foi entregue.");
    await carregarPedidos();
    return;
  }

  if (pedido.status !== "pronto") {
    alert("O pedido precisa estar com status PRONTO antes de ser entregue.");
    await carregarPedidos();
    return;
  }

  const { data: itens, error: erroItens } = await banco
    .from("itens_pedido")
    .select("*")
    .eq("pedido_id", id);

  if (erroItens) {
    console.error("Erro ao buscar itens:", erroItens);
    alert("Erro ao buscar itens do pedido: " + erroItens.message);
    return;
  }

  if (!itens || itens.length === 0) {
    alert("Este pedido não possui itens cadastrados.");
    return;
  }

  const produtosParaAtualizar = [];

  for (const item of itens) {
    const { data: produto, error: erroProduto } = await banco
      .from("produtos")
      .select("id, nome, estoque")
      .eq("id", item.produto_id)
      .single();

    if (erroProduto || !produto) {
      console.error("Erro ao buscar produto:", erroProduto);
      alert(`Erro ao buscar produto do item: ${item.produto_nome}`);
      return;
    }

    const estoqueAtual = Number(produto.estoque || 0);
    const quantidadeVendida = Number(item.quantidade || 0);
    const novoEstoque = estoqueAtual - quantidadeVendida;

    if (novoEstoque < 0) {
      alert(
        `Estoque insuficiente para "${produto.nome}".\n` +
        `Estoque atual: ${estoqueAtual}\n` +
        `Quantidade do pedido: ${quantidadeVendida}`
      );
      return;
    }

    produtosParaAtualizar.push({
      id: produto.id,
      nome: produto.nome,
      novoEstoque
    });
  }

  for (const produto of produtosParaAtualizar) {
    const { error: erroAtualizarEstoque } = await banco
      .from("produtos")
      .update({ estoque: produto.novoEstoque })
      .eq("id", produto.id);

    if (erroAtualizarEstoque) {
      console.error("Erro ao atualizar estoque:", erroAtualizarEstoque);
      alert(`Erro ao atualizar estoque do produto "${produto.nome}".`);
      return;
    }
  }

  const { error: erroBaixarPedido } = await banco
    .from("pedidos")
    .update({
      status: "entregue",
      entregue_em: new Date().toISOString()
    })
    .eq("id", id);

  if (erroBaixarPedido) {
    console.error("Erro ao baixar pedido:", erroBaixarPedido);
    alert("Estoque baixado, mas houve erro ao marcar pedido como entregue: " + erroBaixarPedido.message);
    return;
  }

  alert(`Pedido nº ${pedido.numero_pedido} entregue com sucesso!`);
  await carregarPedidos();
}

function ouvirPedidosTempoReal() {
  const banco = obterBanco();

  if (!banco || !banco.channel) {
    console.warn("Realtime não disponível nesta conexão do Supabase.");
    return;
  }

  if (canalPedidosBalcao) {
    try {
      banco.removeChannel(canalPedidosBalcao);
    } catch (e) {
      console.warn("Não foi possível remover canal anterior:", e);
    }
  }

  canalPedidosBalcao = banco
    .channel("pedidos-balcao")
    .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, atualizarPedidosComDelay)
    .on("postgres_changes", { event: "*", schema: "public", table: "itens_pedido" }, atualizarPedidosComDelay)
    .subscribe((status) => {
      console.log("Realtime balcão:", status);
    });
}

function atualizarPedidosComDelay() {
  clearTimeout(timerAtualizacaoBalcao);
  timerAtualizacaoBalcao = setTimeout(() => carregarPedidos(), 400);
}

function formatarStatus(status) {
  const nomes = {
    aguardando_pagamento: "Aguardando pagamento",
    pago: "Pago - aguardando retirada",
    em_preparo: "Em preparo",
    pronto: "Pronto para retirada",
    entregue: "Entregue"
  };

  return nomes[status] || htmlSeguro(status);
}

function formatarMoeda(valor) {
  if (typeof window !== "undefined" && typeof window.moeda === "function") {
    return window.moeda(valor);
  }

  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function htmlSeguro(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mostrarErroBalcao(mensagem) {
  const area = document.getElementById("pedidosBalcao");

  if (area) {
    area.innerHTML = `<p class="erro">${htmlSeguro(mensagem)}</p>`;
  } else {
    alert(mensagem);
  }
}

window.carregarPedidos = carregarPedidos;
window.alterarStatus = alterarStatus;
window.entregarPedido = entregarPedido;
