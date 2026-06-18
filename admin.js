let produtoEmEdicaoId = null;

document.addEventListener("DOMContentLoaded", async () => {
  await carregarConfiguracao();
  await carregarProdutosAdmin();
  await carregarRelatorios();
});

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function normalizarTexto(valor) {
  return String(valor || "").trim();
}

async function obterConfiguracaoAtual() {
  const { data, error } = await db
    .from("configuracoes")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

async function carregarConfiguracao() {
  try {
    const config = await obterConfiguracaoAtual();
    if (!config) return;

    document.getElementById("pixChave").value = config.pix_chave || "";
    document.getElementById("pixNome").value = config.pix_nome || "";
    document.getElementById("pixCidade").value = config.pix_cidade || "";
    document.getElementById("statusTotem").textContent = config.totem_pausado
      ? "Totem pausado"
      : "Totem ativo";
  } catch (error) {
    alert("Erro ao carregar configurações: " + error.message);
  }
}

async function salvarConfig() {
  const pix_chave = normalizarTexto(document.getElementById("pixChave").value);
  const pix_nome = normalizarTexto(document.getElementById("pixNome").value);
  const pix_cidade = normalizarTexto(document.getElementById("pixCidade").value);

  try {
    const config = await obterConfiguracaoAtual();
    const payload = { pix_chave, pix_nome, pix_cidade };

    let error;
    if (config) {
      ({ error } = await db.from("configuracoes").update(payload).eq("id", config.id));
    } else {
      ({ error } = await db.from("configuracoes").insert([{ ...payload, totem_pausado: false }]));
    }

    if (error) throw error;

    await carregarConfiguracao();
    alert("Configurações salvas.");
  } catch (error) {
    alert("Erro ao salvar configurações: " + error.message);
  }
}

async function alternarTotem() {
  try {
    const config = await obterConfiguracaoAtual();
    if (!config) {
      alert("Configure o painel antes de alternar o totem.");
      return;
    }

    const { error } = await db
      .from("configuracoes")
      .update({ totem_pausado: !config.totem_pausado })
      .eq("id", config.id);

    if (error) throw error;

    await carregarConfiguracao();
  } catch (error) {
    alert("Erro ao alternar totem: " + error.message);
  }
}

async function salvarProduto() {
  const nome = normalizarTexto(document.getElementById("produtoNome").value);
  const categoria = normalizarTexto(document.getElementById("produtoCategoria").value);
  const preco = Number(document.getElementById("produtoPreco").value);
  const estoque = Number(document.getElementById("produtoEstoque").value);
  const imagem_url = normalizarTexto(document.getElementById("produtoImagem").value);

  if (!nome || Number.isNaN(preco) || Number.isNaN(estoque)) {
    alert("Preencha nome, preço e estoque corretamente.");
    return;
  }

  try {
    const payload = {
      nome,
      categoria,
      preco,
      estoque,
      imagem_url,
      ativo: true
    };

    let error;
    if (produtoEmEdicaoId) {
      ({ error } = await db.from("produtos").update(payload).eq("id", produtoEmEdicaoId));
    } else {
      ({ error } = await db.from("produtos").insert([payload]));
    }

    if (error) throw error;

    produtoEmEdicaoId = null;
    document.getElementById("produtoNome").value = "";
    document.getElementById("produtoCategoria").value = "";
    document.getElementById("produtoPreco").value = "";
    document.getElementById("produtoEstoque").value = "";
    document.getElementById("produtoImagem").value = "";

    await carregarProdutosAdmin();
    alert("Produto salvo.");
  } catch (error) {
    alert("Erro ao salvar produto: " + error.message);
  }
}

async function carregarProdutosAdmin() {
  try {
    const { data, error } = await db
      .from("produtos")
      .select("*")
      .order("ativo", { ascending: false })
      .order("categoria", { ascending: true })
      .order("nome", { ascending: true });

    if (error) throw error;

    const area = document.getElementById("listaProdutosAdmin");
    if (!data || data.length === 0) {
      area.innerHTML = "<p>Nenhum produto cadastrado.</p>";
      return;
    }

    area.innerHTML = data
      .map(
        produto => `
          <article class="item-admin">
            <div>
              <strong>${produto.nome}</strong>
              <p>${produto.categoria || "Geral"}</p>
              <p>${moeda(produto.preco)} • Estoque: ${produto.estoque}</p>
              <p>${produto.ativo ? "Ativo" : "Inativo"}</p>
            </div>
            <div class="acoes-admin">
              <button class="btn" onclick="editarProduto('${produto.id}')">Editar</button>
              <button class="btn" onclick="alternarAtivoProduto('${produto.id}', ${produto.ativo ? "false" : "true"})">${produto.ativo ? "Desativar" : "Ativar"}</button>
              <button class="btn alerta" onclick="excluirProduto('${produto.id}')">Excluir</button>
            </div>
          </article>
        `
      )
      .join("");
  } catch (error) {
    alert("Erro ao carregar produtos: " + error.message);
  }
}

async function editarProduto(id) {
  try {
    const { data, error } = await db.from("produtos").select("*").eq("id", id).single();
    if (error) throw error;

    produtoEmEdicaoId = id;
    document.getElementById("produtoNome").value = data.nome || "";
    document.getElementById("produtoCategoria").value = data.categoria || "";
    document.getElementById("produtoPreco").value = data.preco ?? "";
    document.getElementById("produtoEstoque").value = data.estoque ?? "";
    document.getElementById("produtoImagem").value = data.imagem_url || "";
  } catch (error) {
    alert("Erro ao abrir produto: " + error.message);
  }
}

async function alternarAtivoProduto(id, ativo) {
  try {
    const { error } = await db.from("produtos").update({ ativo }).eq("id", id);
    if (error) throw error;
    await carregarProdutosAdmin();
  } catch (error) {
    alert("Erro ao atualizar produto: " + error.message);
  }
}

async function excluirProduto(id) {
  if (!confirm("Tem certeza que deseja excluir este produto?")) return;

  try {
    const { error } = await db.from("produtos").delete().eq("id", id);
    if (error) throw error;
    if (produtoEmEdicaoId === id) produtoEmEdicaoId = null;
    await carregarProdutosAdmin();
  } catch (error) {
    alert("Erro ao excluir produto: " + error.message);
  }
}

function inicioPeriodo(periodo) {
  const agora = new Date();

  if (periodo === "dia") {
    agora.setHours(0, 0, 0, 0);
    return agora;
  }

  if (periodo === "semana") {
    agora.setDate(agora.getDate() - 7);
    return agora;
  }

  if (periodo === "mes") {
    agora.setDate(agora.getDate() - 30);
    return agora;
  }

  if (periodo === "ano") {
    agora.setDate(agora.getDate() - 365);
    return agora;
  }

  return agora;
}

async function carregarRelatorios() {
  const periodo = document.getElementById("periodoRelatorio").value;
  const turno = document.getElementById("turnoRelatorio").value;
  const dataInicial = inicioPeriodo(periodo).toISOString();

  try {
    let query = db
      .from("pedidos")
      .select("id, numero_pedido, cliente_nome, total, status, turno, created_at")
      .gte("created_at", dataInicial)
      .order("created_at", { ascending: false });

    if (turno) {
      query = query.eq("turno", turno);
    }

    const { data, error } = await query;
    if (error) throw error;

    const pedidos = data || [];
    const totalVendas = pedidos.reduce((soma, pedido) => soma + Number(pedido.total || 0), 0);
    const statusResumo = pedidos.reduce((resumo, pedido) => {
      resumo[pedido.status || "sem_status"] = (resumo[pedido.status || "sem_status"] || 0) + 1;
      return resumo;
    }, {});

    document.getElementById("relatorios").innerHTML = `
      <div class="resumo-relatorio">
        <p><strong>Pedidos:</strong> ${pedidos.length}</p>
        <p><strong>Total vendido:</strong> ${moeda(totalVendas)}</p>
        <p><strong>Média por pedido:</strong> ${moeda(pedidos.length ? totalVendas / pedidos.length : 0)}</p>
        <p><strong>Status:</strong> ${Object.entries(statusResumo)
          .map(([status, quantidade]) => `${status}: ${quantidade}`)
          .join(" | ") || "Sem pedidos"}</p>
      </div>
      <div class="lista-relatorio">
        ${pedidos
          .slice(0, 10)
          .map(
            pedido => `
              <article class="item-relatorio">
                <strong>Pedido ${pedido.numero_pedido}</strong>
                <p>${pedido.cliente_nome}</p>
                <p>${moeda(pedido.total)} • ${pedido.status || "sem status"} • ${pedido.turno || "sem turno"}</p>
              </article>
            `
          )
          .join("") || "<p>Nenhum pedido encontrado no período.</p>"}
      </div>
    `;
  } catch (error) {
    alert("Erro ao carregar relatórios: " + error.message);
  }
}
