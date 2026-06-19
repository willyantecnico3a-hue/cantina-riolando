/* =========================================================
   app.js COMPLETO E CORRIGIDO - Totem Cantina Riolando
   Corrige: "await is only valid in async functions"
========================================================= */

let produtos = [];
let carrinho = [];
let categoriaAtual = "Todos";
let buscaProdutos = "";
let paginaProdutos = 1;

const CATEGORIAS_PADRAO = ["Todos", "Bebidas", "Lanches", "Bolos", "Doces", "Salgados", "Combos", "Outros"];
const PRODUTOS_POR_PAGINA = 10;

document.addEventListener("DOMContentLoaded", async function () {
  prepararPwa();
  await iniciarTotem();
});

async function iniciarTotem() {
  const banco = obterBanco();

  if (!banco) {
    mostrarErroProdutos("Erro: conexão com o Supabase não encontrada. Confira config.js e supabaseClient.js.");
    return;
  }

  await verificarTotemPausado();
  await carregarProdutos();
  renderizarCarrinho();
}

function obterBanco() {
  if (typeof window !== "undefined" && window.db) return window.db;
  if (typeof db !== "undefined") return db;
  return null;
}

async function verificarTotemPausado() {
  if (typeof window.buscarConfig !== "function") return;

  const config = await window.buscarConfig();

  if (config && config.totem_pausado) {
    const main = document.querySelector("main");
    if (main) {
      main.innerHTML = `
        <section class="card">
          <h2>Totem pausado</h2>
          <p>As vendas estão temporariamente pausadas pela administração.</p>
        </section>
      `;
    }
  }
}

async function carregarProdutos() {
  const banco = obterBanco();
  const area = document.getElementById("produtos");

  if (!area) {
    alert("Erro: não encontrei a área #produtos no index.html.");
    return;
  }

  if (!banco) {
    area.innerHTML = `<p class="erro">Erro: Supabase não conectado.</p>`;
    return;
  }

  area.innerHTML = `
    <div class="loading-produtos">
      <strong>Carregando produtos...</strong>
      <p>Aguarde um instante.</p>
    </div>
  `;

  let data = [];
  let error = null;

  const respostaAtivos = await banco
    .from("produtos")
    .select("*")
    .eq("ativo", true)
    .order("categoria", { ascending: true })
    .order("nome", { ascending: true });

  data = respostaAtivos.data;
  error = respostaAtivos.error;

  if (error) {
    console.warn("Erro ao buscar produtos ativos. Tentando buscar todos:", error);

    const respostaTodos = await banco
      .from("produtos")
      .select("*")
      .order("categoria", { ascending: true })
      .order("nome", { ascending: true });

    data = respostaTodos.data;
    error = respostaTodos.error;
  }

  if (error) {
    console.error("Erro ao carregar produtos:", error);
    area.innerHTML = `
      <div class="erro-box">
        <h3>Erro ao carregar produtos</h3>
        <p>${htmlSeguro(error.message)}</p>
        <p>Confira se a tabela se chama <strong>produtos</strong> e se existe permissão de leitura no Supabase.</p>
      </div>
    `;
    return;
  }

  produtos = data || [];
  console.log("Produtos carregados:", produtos);

  if (produtos.length === 0) {
    area.innerHTML = `
      <div class="aviso-produtos">
        <h3>Nenhum produto encontrado</h3>
        <p>Confira no painel Admin se os produtos estão cadastrados.</p>
        <p>Se existir a coluna <strong>ativo</strong>, os produtos precisam estar com <strong>ativo = true</strong>.</p>
      </div>
    `;
    return;
  }

  montarEstruturaProdutos();
  renderizarCategorias();
  renderizarProdutos();
}

function montarEstruturaProdutos() {
  const area = document.getElementById("produtos");
  if (!area) return;

  area.innerHTML = `
    <div class="topo-produtos-totem">
      <div>
        <h3>Cardápio</h3>
        <p>Escolha uma categoria e toque em adicionar</p>
      </div>
      <button class="btn-atualizar" onclick="carregarProdutos()">Atualizar</button>
    </div>

    <label class="busca-produtos-label" for="buscaProdutos">Buscar produto</label>
    <input
      id="buscaProdutos"
      class="busca-produtos"
      type="search"
      placeholder="Digite as primeiras letras. Ex: suc"
      autocomplete="off"
      oninput="buscarProdutosPorNome(this.value)"
    />

    <div id="categoriasProdutos" class="categorias-scroll"></div>
    <div id="ancoraCarrinhoApp"></div>
    <div id="listaProdutos" class="produtos-grid"></div>
    <div id="paginacaoProdutos" class="paginacao-produtos"></div>
  `;

  posicionarCarrinhoApp();
}

function obterCategorias() {
  const categoriasBanco = produtos
    .map(function (produto) { return normalizarCategoria(produto.categoria); })
    .filter(Boolean);

  return [...new Set(CATEGORIAS_PADRAO.concat(categoriasBanco))];
}

function normalizarCategoria(categoria) {
  const valor = String(categoria || "").trim();
  if (!valor) return "Outros";

  const lower = valor.toLowerCase();
  if (lower.includes("bebida")) return "Bebidas";
  if (lower.includes("lanche")) return "Lanches";
  if (lower.includes("bolo")) return "Bolos";
  if (lower.includes("doce")) return "Doces";
  if (lower.includes("salgado")) return "Salgados";
  if (lower.includes("combo")) return "Combos";

  return valor.charAt(0).toUpperCase() + valor.slice(1);
}

function renderizarCategorias() {
  const area = document.getElementById("categoriasProdutos");
  if (!area) return;

  const categorias = obterCategorias();
  area.innerHTML = "";

  categorias.forEach(function (categoria) {
    const totalCategoria = categoria === "Todos"
      ? produtos.length
      : produtos.filter(function (produto) { return normalizarCategoria(produto.categoria) === categoria; }).length;

    if (categoria !== "Todos" && totalCategoria === 0) return;

    const btn = document.createElement("button");
    btn.className = categoria === categoriaAtual ? "categoria-chip ativa" : "categoria-chip";
    btn.innerHTML = `<span>${htmlSeguro(categoria)}</span><small>${totalCategoria}</small>`;
    btn.onclick = function () { filtrarCategoria(categoria); };
    area.appendChild(btn);
  });
}

function filtrarCategoria(categoria) {
  categoriaAtual = categoria;
  paginaProdutos = 1;
  renderizarCategorias();
  renderizarProdutos();
}

function buscarProdutosPorNome(valor) {
  buscaProdutos = normalizarBusca(valor);
  paginaProdutos = 1;
  renderizarProdutos();
}

function renderizarProdutos() {
  let lista = document.getElementById("listaProdutos");

  if (!lista) {
    montarEstruturaProdutos();
    renderizarCategorias();
    lista = document.getElementById("listaProdutos");
    if (!lista) return;
  }

  const produtosFiltrados = obterProdutosFiltrados();
  const totalPaginas = Math.max(1, Math.ceil(produtosFiltrados.length / PRODUTOS_POR_PAGINA));
  if (paginaProdutos > totalPaginas) paginaProdutos = totalPaginas;

  const inicio = (paginaProdutos - 1) * PRODUTOS_POR_PAGINA;
  const produtosPagina = produtosFiltrados.slice(inicio, inicio + PRODUTOS_POR_PAGINA);

  lista.innerHTML = "";

  if (produtosFiltrados.length === 0) {
    lista.innerHTML = `<div class="aviso-produtos"><h3>Nenhum produto encontrado</h3><p>Tente outra categoria ou limpe a busca.</p></div>`;
    renderizarPaginacaoProdutos(0, 0, 0);
    return;
  }

  produtosPagina.forEach(function (produto) {
    const estoque = Number(produto.estoque || 0);
    const semEstoque = estoque <= 0;

    const div = document.createElement("div");
    div.className = semEstoque ? "produto-card produto-esgotado" : "produto-card";

    div.innerHTML = `
      <div class="produto-imagem-box">
        <img src="${htmlSeguro(produto.imagem_url || "https://placehold.co/500x350?text=Cantina+Riolando")}" alt="${htmlSeguro(produto.nome || "Produto")}" loading="lazy">
        ${semEstoque ? `<span class="selo-esgotado">Acabou</span>` : `<span class="selo-disponivel">Disponível</span>`}
      </div>

      <div class="produto-info">
        <span class="produto-categoria">${htmlSeguro(normalizarCategoria(produto.categoria))}</span>
        <h3>${htmlSeguro(produto.nome || "Produto")}</h3>
        <p class="produto-descricao">${htmlSeguro(produto.descricao || "Produto da Cantina Riolando")}</p>

        <div class="produto-rodape">
          <div>
            <p class="preco">${formatarMoedaLocal(produto.preco)}</p>
            <p class="estoque-info">Estoque: ${estoque}</p>
          </div>

          ${semEstoque
            ? `<button class="btn-produto esgotado" disabled>Indisponível</button>`
            : `<button class="btn-produto" onclick="adicionarCarrinho('${produto.id}')">Adicionar</button>`}
        </div>
      </div>
    `;

    lista.appendChild(div);
  });

  renderizarPaginacaoProdutos(produtosFiltrados.length, inicio + 1, inicio + produtosPagina.length);
}

function obterProdutosFiltrados() {
  return produtos.filter(function (produto) {
    const categoriaOk = categoriaAtual === "Todos" || normalizarCategoria(produto.categoria) === categoriaAtual;
    const nomeProduto = normalizarBusca(produto.nome || "");
    const buscaOk = !buscaProdutos || nomeProduto.startsWith(buscaProdutos);
    return categoriaOk && buscaOk;
  });
}

function renderizarPaginacaoProdutos(totalProdutos, inicio, fim) {
  const area = document.getElementById("paginacaoProdutos");
  if (!area) return;

  if (totalProdutos <= PRODUTOS_POR_PAGINA) {
    area.innerHTML = totalProdutos > 0
      ? `<span class="paginacao-info">Mostrando ${inicio} ate ${fim} de ${totalProdutos}</span>`
      : "";
    return;
  }

  const totalPaginas = Math.ceil(totalProdutos / PRODUTOS_POR_PAGINA);
  const botoes = [];

  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    const faixaInicio = (pagina - 1) * PRODUTOS_POR_PAGINA + 1;
    const faixaFim = Math.min(pagina * PRODUTOS_POR_PAGINA, totalProdutos);
    const ativo = pagina === paginaProdutos ? " ativa" : "";
    botoes.push(
      `<button class="pagina-produtos-btn${ativo}" onclick="irParaPaginaProdutos(${pagina})">${faixaInicio}-${faixaFim}</button>`
    );
  }

  area.innerHTML = `
    <span class="paginacao-info">Mostrando ${inicio} ate ${fim} de ${totalProdutos}</span>
    <div class="paginacao-botoes">${botoes.join("")}</div>
  `;
}

function irParaPaginaProdutos(pagina) {
  paginaProdutos = Number(pagina) || 1;
  renderizarProdutos();
  document.getElementById("listaProdutos")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function normalizarBusca(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function posicionarCarrinhoApp() {
  if (detectarCanalVenda() !== "app") return;

  const carrinhoEl = document.querySelector(".app-carrinho");
  const ancora = document.getElementById("ancoraCarrinhoApp");

  if (carrinhoEl && ancora && carrinhoEl.parentElement !== ancora) {
    ancora.appendChild(carrinhoEl);
  }
}

function adicionarCarrinho(id) {
  const produto = produtos.find(function (p) { return String(p.id) === String(id); });

  if (!produto) {
    alert("Produto não encontrado.");
    return;
  }

  if (Number(produto.estoque || 0) <= 0) {
    alert("Esse produto acabou.");
    return;
  }

  const item = carrinho.find(function (i) { return String(i.id) === String(id); });
  const quantidadeAtual = item ? Number(item.quantidade || 0) : 0;

  if (quantidadeAtual + 1 > Number(produto.estoque || 0)) {
    alert("Quantidade maior que o estoque disponível.");
    return;
  }

  if (item) item.quantidade++;
  else carrinho.push({ ...produto, quantidade: 1 });

  renderizarCarrinho();
}

function aumentarQuantidade(id) {
  adicionarCarrinho(id);
}

function diminuirQuantidade(id) {
  const item = carrinho.find(function (i) { return String(i.id) === String(id); });
  if (!item) return;

  item.quantidade--;

  if (item.quantidade <= 0) {
    carrinho = carrinho.filter(function (i) { return String(i.id) !== String(id); });
  }

  renderizarCarrinho();
}

function removerCarrinho(id) {
  carrinho = carrinho.filter(function (item) { return String(item.id) !== String(id); });
  renderizarCarrinho();
}

function renderizarCarrinho() {
  const area = document.getElementById("itensCarrinho");
  const totalEl = document.getElementById("total");
  if (!area || !totalEl) return;

  area.innerHTML = "";

  if (carrinho.length === 0) {
    area.innerHTML = `<div class="carrinho-vazio"><p>Nenhum item no carrinho.</p></div>`;
  }

  carrinho.forEach(function (item) {
    const subtotal = Number(item.preco || 0) * Number(item.quantidade || 0);
    const div = document.createElement("div");
    div.className = "item-carrinho";

    div.innerHTML = `
      <div>
        <strong>${htmlSeguro(item.nome)}</strong>
        <p>${formatarMoedaLocal(item.preco)} cada</p>
        <p>Subtotal: ${formatarMoedaLocal(subtotal)}</p>
      </div>

      <div class="controle-qtd">
        <button onclick="diminuirQuantidade('${item.id}')">−</button>
        <span>${Number(item.quantidade)}</span>
        <button onclick="aumentarQuantidade('${item.id}')">+</button>
      </div>

      <button class="btn-remover" onclick="removerCarrinho('${item.id}')">Remover</button>
    `;

    area.appendChild(div);
  });

  const total = carrinho.reduce(function (soma, item) {
    return soma + Number(item.preco || 0) * Number(item.quantidade || 0);
  }, 0);

  totalEl.textContent = formatarMoedaLocal(total);
  atualizarResumoCarrinhoApp(total);
}

function atualizarResumoCarrinhoApp(total) {
  const resumo = document.getElementById("resumoCarrinhoApp");
  const qtdEl = document.getElementById("resumoCarrinhoQtd");
  const totalResumoEl = document.getElementById("resumoCarrinhoTotal");

  if (!resumo || !qtdEl || !totalResumoEl) return;

  const quantidade = carrinho.reduce(function (soma, item) {
    return soma + Number(item.quantidade || 0);
  }, 0);

  qtdEl.textContent = quantidade === 1 ? "1 item" : `${quantidade} itens`;
  totalResumoEl.textContent = formatarMoedaLocal(total);
  resumo.classList.toggle("tem-itens", quantidade > 0);
}

function abrirCarrinhoApp() {
  const carrinhoEl = document.querySelector(".app-carrinho");
  if (!carrinhoEl) return;

  carrinhoEl.scrollIntoView({ behavior: "smooth", block: "start" });
  carrinhoEl.classList.add("destacar-carrinho");
  setTimeout(function () {
    carrinhoEl.classList.remove("destacar-carrinho");
  }, 900);
}

function limparCarrinho() {
  carrinho = [];
  renderizarCarrinho();

  const resultado = document.getElementById("resultadoPedido");
  if (resultado) resultado.innerHTML = "";
}

async function finalizarPedido() {
  const banco = obterBanco();

  if (!banco) {
    alert("Erro: Supabase não conectado.");
    return;
  }

  const clienteNome = document.getElementById("clienteNome")?.value.trim();
  const clienteEmail = document.getElementById("clienteEmail")?.value.trim();
  const resultado = document.getElementById("resultadoPedido");

  if (!resultado) {
    alert("Erro: área #resultadoPedido não encontrada.");
    return;
  }

  if (!clienteNome || !clienteEmail) {
    alert("Informe nome e e-mail institucional.");
    return;
  }

  if (carrinho.length === 0) {
    alert("Adicione pelo menos um produto.");
    return;
  }

  resultado.innerHTML = `<div class="resultado-pedido pix-box"><h3>Gerando Pix...</h3><p>Aguarde enquanto o QR Code é criado.</p></div>`;

  const total = carrinho.reduce(function (soma, item) {
    return soma + Number(item.preco || 0) * Number(item.quantidade || 0);
  }, 0);

  const numero = gerarNumeroPedidoLocal();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const itens = carrinho.map(function (item) {
    return {
      produto_id: item.id,
      produto_nome: item.nome,
      quantidade: Number(item.quantidade),
      preco_unitario: Number(item.preco),
      subtotal: Number(item.preco) * Number(item.quantidade)
    };
  });

  let respostaPix;
  let dadosPix;

  try {
    respostaPix = await fetch("/.netlify/functions/criar-pix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        numero_pedido: numero,
        total: total,
        valor: total,
        expires_at: expiresAt,
        description: `Pedido ${numero} - Cantina Riolando`,
        descricao: `Pedido ${numero} - Cantina Riolando`,
        cliente_nome: clienteNome,
        cliente_email: clienteEmail,
        canal_venda: detectarCanalVenda(),
        turno: obterTurnoAtualLocal(),
        itens: itens
      })
    });

    dadosPix = await respostaPix.json();
  } catch (erroFetch) {
    console.error("Erro ao chamar criar-pix:", erroFetch);
    resultado.innerHTML = `<div class="resultado-pedido erro"><h3>Erro ao gerar Pix</h3><p>Não foi possível chamar a função criar-pix.</p></div>`;
    return;
  }

  if (!respostaPix.ok) {
    console.error("Erro retornado por criar-pix:", dadosPix);
    const detalheMercadoPago = dadosPix?.status_detail
      ? `<p><strong>Detalhe Mercado Pago:</strong> ${htmlSeguro(dadosPix.status_detail)}</p>`
      : "";
    resultado.innerHTML = `
      <div class="resultado-pedido erro">
        <h3>Erro ao gerar Pix</h3>
        <p>${htmlSeguro(dadosPix?.error || dadosPix?.message || "A funcao criar-pix retornou erro.")}</p>
        ${detalheMercadoPago}
      </div>
    `;
    return;
  }

  const pedido = dadosPix?.pedido || null;

  const qrCodeBase64 =
    dadosPix?.qr_code_base64 ||
    dadosPix?.qrCodeBase64 ||
    dadosPix?.point_of_interaction?.transaction_data?.qr_code_base64 ||
    dadosPix?.payment?.point_of_interaction?.transaction_data?.qr_code_base64;

  const qrCodeTexto =
    dadosPix?.qr_code ||
    dadosPix?.qrCode ||
    dadosPix?.copia_e_cola ||
    dadosPix?.copiaECola ||
    dadosPix?.point_of_interaction?.transaction_data?.qr_code ||
    dadosPix?.payment?.point_of_interaction?.transaction_data?.qr_code;

  const ticketUrl =
    dadosPix?.ticket_url ||
    dadosPix?.ticketUrl ||
    dadosPix?.point_of_interaction?.transaction_data?.ticket_url ||
    dadosPix?.payment?.point_of_interaction?.transaction_data?.ticket_url;

  const qrCodeUrl =
    dadosPix?.pix_qr_url ||
    dadosPix?.qr_code_url ||
    dadosPix?.pix_ticket_url ||
    ticketUrl;

  const numeroPedidoExibicao = pedido?.numero_pedido || numero;

  if (!qrCodeBase64 && !qrCodeTexto && !ticketUrl) {
    resultado.innerHTML = `<div class="resultado-pedido erro"><h3>Pix criado, mas QR Code não foi encontrado</h3><p>A função respondeu, mas não enviou QR Code ou copia e cola.</p></div>`;
    return;
  }

  resultado.innerHTML = `
    <div class="resultado-pedido pix-box">
      <h3>Pedido nº ${htmlSeguro(numeroPedidoExibicao)}</h3>
      <p>Total: <strong>${formatarMoedaLocal(total)}</strong></p>

      <h3>Pagamento via Pix</h3>
      <p>Escaneie o QR Code abaixo para pagar:</p>

      ${qrCodeBase64 ? `<img class="pix-qrcode" src="data:image/png;base64,${qrCodeBase64}" alt="QR Code Pix">` : ""}
      ${!qrCodeBase64 && qrCodeUrl ? `<img class="pix-qrcode" src="${htmlSeguro(qrCodeUrl)}" alt="QR Code Pix">` : ""}

      ${qrCodeTexto ? `
        <p><strong>Pix copia e cola:</strong></p>
        <textarea class="pix-copia-cola" readonly>${htmlSeguro(qrCodeTexto)}</textarea>
        <button class="btn principal" onclick="copiarPix()">Copiar código Pix</button>
      ` : ""}

      ${ticketUrl ? `<p><a class="btn" href="${htmlSeguro(ticketUrl)}" target="_blank" rel="noopener noreferrer">Abrir pagamento</a></p>` : ""}

      <p class="aviso-pix">Este Pix expira em 30 minutos. Após a confirmação, o pedido aparece no balcão.</p>
    </div>
  `;

  carrinho = [];
  renderizarCarrinho();
}

function copiarPix() {
  const campo = document.querySelector(".pix-copia-cola");

  if (!campo) {
    alert("Código Pix não encontrado.");
    return;
  }

  campo.select();
  campo.setSelectionRange(0, 99999);

  navigator.clipboard.writeText(campo.value)
    .then(function () { alert("Código Pix copiado!"); })
    .catch(function () {
      document.execCommand("copy");
      alert("Código Pix copiado!");
    });
}

function detectarCanalVenda() {
  const pagina = window.location.pathname.toLowerCase();
  if (pagina.includes("totem")) return "totem";
  if (pagina.includes("app")) return "app";
  return "site";
}

function prepararPwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(function (erro) {
      console.warn("Nao foi possivel registrar o service worker:", erro);
    });
  }

  let promptInstalacao = null;
  const botaoInstalar = document.getElementById("installPwaButton");

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    promptInstalacao = event;

    if (botaoInstalar) {
      botaoInstalar.hidden = false;
    }
  });

  if (botaoInstalar) {
    botaoInstalar.addEventListener("click", async function () {
      if (!promptInstalacao) return;

      promptInstalacao.prompt();
      await promptInstalacao.userChoice;
      promptInstalacao = null;
      botaoInstalar.hidden = true;
    });
  }
}

function formatarMoedaLocal(valor) {
  if (typeof window !== "undefined" && typeof window.moeda === "function" && window.moeda !== formatarMoedaLocal) {
    return window.moeda(valor);
  }

  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function gerarNumeroPedidoLocal() {
  if (typeof window !== "undefined" && typeof window.numeroPedido === "function" && window.numeroPedido !== gerarNumeroPedidoLocal) {
    return window.numeroPedido();
  }

  return Math.floor(1000 + Math.random() * 9000).toString();
}

function obterTurnoAtualLocal() {
  if (typeof window !== "undefined" && typeof window.turnoAtual === "function" && window.turnoAtual !== obterTurnoAtualLocal) {
    return window.turnoAtual();
  }

  const hora = new Date().getHours();
  if (hora >= 6 && hora < 12) return "manha";
  if (hora >= 12 && hora < 18) return "tarde";
  return "noite";
}

function htmlSeguro(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mostrarErroProdutos(mensagem) {
  const area = document.getElementById("produtos");
  if (area) area.innerHTML = `<p class="erro">${htmlSeguro(mensagem)}</p>`;
  else alert(mensagem);
}

window.carregarProdutos = carregarProdutos;
window.filtrarCategoria = filtrarCategoria;
window.buscarProdutosPorNome = buscarProdutosPorNome;
window.irParaPaginaProdutos = irParaPaginaProdutos;
window.abrirCarrinhoApp = abrirCarrinhoApp;
window.adicionarCarrinho = adicionarCarrinho;
window.aumentarQuantidade = aumentarQuantidade;
window.diminuirQuantidade = diminuirQuantidade;
window.removerCarrinho = removerCarrinho;
window.limparCarrinho = limparCarrinho;
window.finalizarPedido = finalizarPedido;
window.copiarPix = copiarPix;
