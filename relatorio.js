/* =========================================================
   relatorio.js
   Relatório de vendas confirmadas por Pix

   Regras:
   - Soma somente pedidos com status_pagamento = 'approved'
   - Mostra nome, e-mail, canal de venda, horário da compra,
     horário da confirmação e itens comprados.
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  await carregarRelatorioConfirmado();
  ouvirRelatorioTempoReal();
});

async function carregarRelatorioConfirmado() {
  await cancelarPedidosExpirados();

  const area = document.getElementById("relatorioConfirmados");
  const totalEl = document.getElementById("totalConfirmado");
  const qtdEl = document.getElementById("qtdVendasConfirmadas");
  const atualizadoEl = document.getElementById("ultimaAtualizacaoRelatorio");

  if (!area) {
    console.warn("Área #relatorioConfirmados não encontrada no HTML.");
    return;
  }

  area.innerHTML = "<p>Carregando relatório...</p>";

  const { data, error } = await db
    .from("relatorio_vendas_confirmadas")
    .select("*")
    .order("horario_pagamento_confirmado", { ascending: false });

  if (error) {
    console.error("Erro ao carregar relatório:", error);

    area.innerHTML = `
      <p class="erro">
        Erro ao carregar relatório: ${htmlSeguro(error.message)}
      </p>
      <p>Confira se você executou o SQL que cria a view <strong>relatorio_vendas_confirmadas</strong>.</p>
    `;
    return;
  }

  const vendas = data || [];

  const total = vendas.reduce((soma, pedido) => {
    return soma + Number(pedido.total || 0);
  }, 0);

  if (totalEl) totalEl.textContent = formatarMoedaRelatorio(total);
  if (qtdEl) qtdEl.textContent = String(vendas.length);
  if (atualizadoEl) atualizadoEl.textContent = formatarDataHora(new Date().toISOString());

  if (vendas.length === 0) {
    area.innerHTML = `
      <p>Nenhuma venda com Pix confirmado até o momento.</p>
      <p>Pedidos aguardando pagamento ou expirados não entram neste relatório.</p>
    `;
    return;
  }

  area.innerHTML = "";

  vendas.forEach((pedido) => {
    const itens = montarItensRelatorio(pedido.itens);

    const div = document.createElement("div");
    div.className = "pedido-relatorio";

    div.innerHTML = `
      <h3>Pedido nº ${htmlSeguro(pedido.numero_pedido)}</h3>

      <p><strong>Cliente:</strong> ${htmlSeguro(pedido.cliente_nome)}</p>
      <p><strong>E-mail:</strong> ${htmlSeguro(pedido.cliente_email || "")}</p>
      <p><strong>Canal:</strong> ${formatarCanalVenda(pedido.canal_venda)}</p>
      <p><strong>Horário da compra:</strong> ${formatarDataHora(pedido.horario_compra)}</p>
      <p><strong>Pagamento confirmado:</strong> ${formatarDataHora(pedido.horario_pagamento_confirmado)}</p>
      <p><strong>Status:</strong> Pix confirmado</p>
      <p><strong>Total:</strong> ${formatarMoedaRelatorio(pedido.total)}</p>

      <p><strong>Itens:</strong></p>
      <div class="itens-relatorio">
        ${itens}
      </div>
    `;

    area.appendChild(div);
  });
}

async function cancelarPedidosExpirados() {
  try {
    await fetch("/.netlify/functions/cancelar-pedidos-expirados", {
      method: "POST"
    });
  } catch (erro) {
    console.warn("Não foi possível chamar cancelar-pedidos-expirados:", erro);
  }
}

function montarItensRelatorio(itens) {
  let lista = itens;

  if (typeof itens === "string") {
    try {
      lista = JSON.parse(itens);
    } catch {
      lista = [];
    }
  }

  if (!Array.isArray(lista) || lista.length === 0) {
    return "<p>Nenhum item encontrado.</p>";
  }

  return lista.map((item) => {
    return `
      <div class="item-relatorio">
        ${Number(item.quantidade || 0)}x ${htmlSeguro(item.produto_nome || "Produto")}
        — ${formatarMoedaRelatorio(item.subtotal || 0)}
      </div>
    `;
  }).join("");
}

function ouvirRelatorioTempoReal() {
  if (!db || !db.channel) return;

  db.channel("relatorio-confirmados")
    .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, carregarRelatorioConfirmado)
    .on("postgres_changes", { event: "*", schema: "public", table: "itens_pedido" }, carregarRelatorioConfirmado)
    .subscribe();
}

function formatarCanalVenda(canal) {
  const canais = {
    totem: "Totem",
    smartphone: "Smartphone",
    app: "Smartphone",
    mobile: "Smartphone"
  };

  return canais[canal] || htmlSeguro(canal || "Não informado");
}

function formatarDataHora(valor) {
  if (!valor) return "Não informado";

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return "Data inválida";
  }

  return data.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium"
  });
}

function formatarMoedaRelatorio(valor) {
  if (typeof window.moeda === "function") {
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

window.carregarRelatorioConfirmado = carregarRelatorioConfirmado;
