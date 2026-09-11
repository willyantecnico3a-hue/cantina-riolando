let usuarioConta = null;
let atualizadorPedidos = null;

document.addEventListener("DOMContentLoaded", async function () {
  document.getElementById("botaoGoogle")?.addEventListener("click", entrarComGoogle);
  document.getElementById("botaoSair")?.addEventListener("click", sairDaConta);
  document.getElementById("botaoAtualizarPedidos")?.addEventListener("click", carregarMeusPedidos);

  const { data, error } = await db.auth.getUser();
  if (error) {
    console.error("Erro ao recuperar sessão do cliente:", error);
    return;
  }
  if (data?.user) mostrarConta(data.user);

  db.auth.onAuthStateChange(function (_event, session) {
    if (session?.user) {
      mostrarConta(session.user);
    } else if (usuarioConta) {
      usuarioConta = null;
      pararAtualizacaoPedidos();
      document.getElementById("areaPedidos").hidden = true;
      document.getElementById("areaAutenticacao").hidden = false;
    }
  });
});

async function entrarComGoogle() {
  const mensagem = document.getElementById("mensagemConta");
  const botao = document.getElementById("botaoGoogle");
  botao.disabled = true;
  botao.textContent = "Abrindo Google...";
  mensagem.hidden = true;

  const { error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` }
  });

  if (error) {
    mensagem.textContent = "Não foi possível iniciar o acesso com Google. Tente novamente.";
    mensagem.hidden = false;
    botao.disabled = false;
    botao.innerHTML = "<span>G</span> Continuar com Google";
  }
}

function mostrarConta(usuario) {
  usuarioConta = usuario;
  const nome = usuario.user_metadata?.full_name || usuario.user_metadata?.name || usuario.email?.split("@")[0] || "Cliente";
  document.getElementById("areaAutenticacao").hidden = true;
  document.getElementById("areaPedidos").hidden = false;
  document.getElementById("nomeUsuario").textContent = nome;
  document.getElementById("emailUsuario").textContent = usuario.email || "";
  document.getElementById("avatarUsuario").textContent = nome.charAt(0).toUpperCase();
  carregarMeusPedidos();
  pararAtualizacaoPedidos();
  atualizadorPedidos = window.setInterval(carregarMeusPedidos, 15000);
}

async function carregarMeusPedidos() {
  const area = document.getElementById("listaMeusPedidos");
  if (!usuarioConta?.email || !area) return;
  area.innerHTML = '<div class="conta-carregando">Atualizando seus pedidos...</div>';

  const { data, error } = await db
    .from("pedidos")
    .select("id, numero_pedido, cliente_nome, total, status, status_pagamento, canal_venda, created_at, pago_em, horario_pagamento_confirmado, itens_pedido(produto_nome, quantidade, subtotal)")
    .eq("cliente_email", usuarioConta.email.trim().toLowerCase())
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao carregar pedidos do cliente:", error);
    area.innerHTML = '<div class="conta-vazio">Não foi possível carregar seus pedidos agora.</div>';
    return;
  }

  if (!data?.length) {
    area.innerHTML = `
      <div class="conta-vazio">
        <div>🧾</div>
        <strong>Nenhum pedido encontrado</strong>
        <p>Pedidos feitos com o e-mail ${escaparHtml(usuarioConta.email)} aparecerão aqui.</p>
        <a href="app.html">Ir para o cardápio</a>
      </div>`;
    return;
  }

  area.innerHTML = data.map(renderizarPedidoCliente).join("");
}

function renderizarPedidoCliente(pedido) {
  const status = statusDoPedido(pedido);
  const itens = (pedido.itens_pedido || [])
    .map((item) => `${Number(item.quantidade || 0)}x ${escaparHtml(item.produto_nome || "Produto")}`)
    .join(" · ");
  const etapas = etapasDoPedido(pedido);

  return `
    <article class="pedido-cliente">
      <div class="pedido-cliente-topo">
        <div><span>Pedido nº ${escaparHtml(pedido.numero_pedido)}</span><small>${formatarData(pedido.created_at)}</small></div>
        <strong>${formatarMoedaCliente(pedido.total)}</strong>
      </div>
      <p class="pedido-cliente-itens">${itens || "Itens do pedido"}</p>
      <div class="pedido-progresso" aria-label="Status do pedido">
        ${etapas.map((etapa) => `
          <div class="etapa-pedido ${etapa.estado}">
            <span class="etapa-ponto"></span>
            <small>${etapa.texto}</small>
          </div>`).join("")}
      </div>
      <div class="pedido-cliente-rodape">
        <span class="status-cliente status-${status.chave}"><i></i>${status.texto}</span>
        <span class="pedido-canal">${pedido.canal_venda === "totem" ? "Totem" : "Aplicativo"}</span>
      </div>
    </article>`;
}

function statusDoPedido(pedido) {
  if (pedido.status === "em_preparo") return { chave: "preparo", texto: "Em preparo" };
  if (pedido.status === "pronto") return { chave: "pronto", texto: "Pronto para retirar" };
  if (pedido.status === "entregue") return { chave: "entregue", texto: "Pedido entregue" };
  if (pedido.status === "expirado") return { chave: "expirado", texto: "Pagamento expirado" };
  if (pedido.status_pagamento === "approved" || pedido.status === "pago") return { chave: "pago", texto: "Pagamento efetuado" };
  return { chave: "aguardando", texto: "Aguardando pagamento" };
}

function etapasDoPedido(pedido) {
  if (pedido.status === "expirado") {
    return [
      { texto: "Pedido criado", estado: "concluida" },
      { texto: "Pagamento expirado", estado: "cancelada" },
      { texto: "Retirada", estado: "futura" }
    ];
  }

  const pagamentoConfirmado = pedido.status_pagamento === "approved" || pedido.status === "pago" || ["em_preparo", "pronto", "entregue"].includes(pedido.status);
  const preparoIniciado = ["em_preparo", "pronto", "entregue"].includes(pedido.status);
  const pronto = ["pronto", "entregue"].includes(pedido.status);
  const entregue = pedido.status === "entregue";
  return [
    { texto: pagamentoConfirmado ? "Pagamento confirmado" : "Aguardando pagamento", estado: pagamentoConfirmado ? "concluida" : "atual" },
    { texto: "Em preparo", estado: preparoIniciado ? (pronto ? "concluida" : "atual") : "futura" },
    { texto: entregue ? "Pedido retirado" : "Pronto para retirar", estado: entregue ? "concluida" : (pronto ? "atual" : "futura") }
  ];
}

async function sairDaConta() {
  await db.auth.signOut();
  pararAtualizacaoPedidos();
  usuarioConta = null;
  document.getElementById("areaPedidos").hidden = true;
  document.getElementById("areaAutenticacao").hidden = false;
}

function pararAtualizacaoPedidos() {
  if (atualizadorPedidos) {
    window.clearInterval(atualizadorPedidos);
    atualizadorPedidos = null;
  }
}

function formatarMoedaCliente(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(valor) {
  return new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function escaparHtml(valor) {
  const div = document.createElement("div");
  div.textContent = String(valor ?? "");
  return div.innerHTML;
}
