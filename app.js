/* =========================================================
   app.js corrigido
   Totem Cantina Riolando
   Funções:
   - Carrega produtos ativos do Supabase
   - Mostra produtos na tela
   - Controla carrinho
   - Cria pedido
   - Chama a função Netlify criar-pix
   - Mostra QR Code Pix, copia e cola e link do pagamento
========================================================= */

let produtos = [];
let carrinho = [];

document.addEventListener("DOMContentLoaded", async () => {
  await iniciarTotem();
});

async function iniciarTotem() {
  const banco = obterBanco();

  if (!banco) {
    mostrarErroProdutos("Erro: conexão com o Supabase não encontrada. Verifique config.js e supabaseClient.js.");
    return;
  }

  await verificarTotem();
  await carregarProdutos();
  renderizarCarrinho();
}

function obterBanco() {
  if (typeof window !== "undefined" && window.db) {
    return window.db;
  }

  if (typeof db !== "undefined") {
    return db;
  }

  return null;
}

async function verificarTotem() {
  if (typeof buscarConfig !== "function") {
    console.warn("Função buscarConfig não encontrada. O totem seguirá ativo.");
    return;
  }

  const config = await buscarConfig();

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
    alert("Erro: não encontrei a área #produtos no HTML.");
    return;
  }

  area.innerHTML = "<p>Carregando produtos...</p>";

  const { data, error } = await banco
    .from("produtos")
    .select("*")
    .eq("ativo", true)
    .order("categoria", { ascending: true });

  if (error) {
    console.error("Erro ao carregar produtos:", error);
    area.innerHTML = `
      <p class="erro">
        Erro ao carregar produtos: ${htmlSeguro(error.message)}
      </p>
    `;
    return;
  }

  produtos = data || [];

  if (produtos.length === 0) {
    area.innerHTML = `
      <p class="aviso">
        Nenhum produto ativo encontrado.
        Verifique no painel Admin se os produtos estão cadastrados e com ativo = true.
      </p>
    `;
    return;
  }

  renderizarProdutos();
}

function renderizarProdutos() {
  const area = document.getElementById("produtos");

  if (!area) {
    alert("Erro: área #produtos não encontrada.");
    return;
  }

  area.innerHTML = "";

  produtos.forEach((produto) => {
    const estoque = Number(produto.estoque || 0);
    const semEstoque = estoque <= 0;

    const div = document.createElement("div");
    div.className = "produto";

    div.innerHTML = `
      <img
        src="${htmlSeguro(produto.imagem_url || "https://placehold.co/400x250?text=Cantina+Riolando")}"
        alt="${htmlSeguro(produto.nome || "Produto")}"
      >

      <h3>${htmlSeguro(produto.nome || "Produto")}</h3>
      <p>${htmlSeguro(produto.categoria || "Geral")}</p>
      <p class="preco">${moeda(produto.preco)}</p>
      <p>Disponível: ${estoque}</p>

      ${
        semEstoque
          ? `<p class="esgotado">Esgotado</p>`
          : `<button class="btn principal" onclick="adicionarCarrinho('${produto.id}')">Adicionar</button>`
      }
    `;

    area.appendChild(div);
  });
}

function adicionarCarrinho(id) {
  const produto = produtos.find((p) => String(p.id) === String(id));

  if (!produto) {
    alert("Produto não encontrado.");
    return;
  }

  if (Number(produto.estoque || 0) <= 0) {
    alert("Produto sem estoque.");
    return;
  }

  const item = carrinho.find((i) => String(i.id) === String(id));
  const quantidadeAtual = item ? Number(item.quantidade || 0) : 0;

  if (quantidadeAtual + 1 > Number(produto.estoque || 0)) {
    alert("Quantidade maior que o estoque disponível.");
    return;
  }

  if (item) {
    item.quantidade++;
  } else {
    carrinho.push({
      ...produto,
      quantidade: 1
    });
  }

  renderizarCarrinho();
}

function removerCarrinho(id) {
  carrinho = carrinho.filter((item) => String(item.id) !== String(id));
  renderizarCarrinho();
}

function renderizarCarrinho() {
  const area = document.getElementById("itensCarrinho");
  const totalEl = document.getElementById("total");

  if (!area || !totalEl) {
    return;
  }

  area.innerHTML = "";

  if (carrinho.length === 0) {
    area.innerHTML = "<p>Nenhum item no carrinho.</p>";
  }

  carrinho.forEach((item) => {
    const div = document.createElement("div");
    div.className = "item-carrinho";

    div.innerHTML = `
      <strong>${htmlSeguro(item.nome)}</strong><br>
      Quantidade: ${Number(item.quantidade)}<br>
      Subtotal: ${moeda(Number(item.preco) * Number(item.quantidade))}
      <br>
      <button class="btn" onclick="removerCarrinho('${item.id}')">Remover</button>
    `;

    area.appendChild(div);
  });

  const total = carrinho.reduce((soma, item) => {
    return soma + Number(item.preco || 0) * Number(item.quantidade || 0);
  }, 0);

  totalEl.textContent = moeda(total);
}

function limparCarrinho() {
  carrinho = [];
  renderizarCarrinho();

  const resultado = document.getElementById("resultadoPedido");
  if (resultado) {
    resultado.innerHTML = "";
  }
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

  resultado.innerHTML = `
    <div class="resultado-pedido pix-box">
      <h3>Gerando Pix...</h3>
      <p>Aguarde enquanto o QR Code é criado.</p>
    </div>
  `;

  const total = carrinho.reduce((soma, item) => {
    return soma + Number(item.preco || 0) * Number(item.quantidade || 0);
  }, 0);

  const numero = numeroPedido();

  // 1. Cria pedido no Supabase
  const { data: pedido, error } = await banco
    .from("pedidos")
    .insert({
      numero_pedido: numero,
      cliente_nome: clienteNome,
      cliente_email: clienteEmail,
      total,
      canal_venda: "totem",
      turno: turnoAtual(),
      status: "aguardando_pagamento"
    })
    .select()
    .single();

  if (error) {
    console.error("Erro ao criar pedido:", error);
    resultado.innerHTML = `
      <div class="resultado-pedido erro">
        <h3>Erro ao criar pedido</h3>
        <p>${htmlSeguro(error.message)}</p>
      </div>
    `;
    return;
  }

  // 2. Salva itens do pedido
  const itens = carrinho.map((item) => ({
    pedido_id: pedido.id,
    produto_id: item.id,
    produto_nome: item.nome,
    quantidade: Number(item.quantidade),
    preco_unitario: Number(item.preco),
    subtotal: Number(item.preco) * Number(item.quantidade)
  }));

  const { error: erroItens } = await banco
    .from("itens_pedido")
    .insert(itens);

  if (erroItens) {
    console.error("Erro ao salvar itens:", erroItens);
    resultado.innerHTML = `
      <div class="resultado-pedido erro">
        <h3>Erro ao salvar itens</h3>
        <p>${htmlSeguro(erroItens.message)}</p>
      </div>
    `;
    return;
  }

  // 3. Chama função serverless do Netlify para gerar Pix
  let respostaPix;
  let dadosPix;

  try {
    respostaPix = await fetch("/.netlify/functions/criar-pix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        pedido_id: pedido.id,
        numero_pedido: numero,
        total,
        valor: total,
        description: `Pedido ${numero} - Cantina Riolando`,
        descricao: `Pedido ${numero} - Cantina Riolando`,
        cliente_nome: clienteNome,
        cliente_email: clienteEmail,
        itens
      })
    });

    dadosPix = await respostaPix.json();
  } catch (erroFetch) {
    console.error("Erro ao chamar função criar-pix:", erroFetch);

    resultado.innerHTML = `
      <div class="resultado-pedido erro">
        <h3>Erro ao gerar Pix</h3>
        <p>Não foi possível chamar a função criar-pix.</p>
        <p>Confira se o arquivo netlify/functions/criar-pix.js existe e se o deploy do Netlify foi concluído.</p>
      </div>
    `;
    return;
  }

  if (!respostaPix.ok) {
    console.error("Erro retornado pela função criar-pix:", dadosPix);

    resultado.innerHTML = `
      <div class="resultado-pedido erro">
        <h3>Erro ao gerar Pix</h3>
        <p>${htmlSeguro(dadosPix?.error || dadosPix?.message || "A função criar-pix retornou erro.")}</p>
        <p>Confira a variável MP_ACCESS_TOKEN no Netlify.</p>
      </div>
    `;
    return;
  }

  console.log("Resposta do Pix:", dadosPix);

  const qrCodeBase64 =
    dadosPix?.qr_code_base64 ||
    dadosPix?.qrCodeBase64 ||
    dadosPix?.qr_code_base64_img ||
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
    dadosPix?.link_pagamento ||
    dadosPix?.point_of_interaction?.transaction_data?.ticket_url ||
    dadosPix?.payment?.point_of_interaction?.transaction_data?.ticket_url;

  if (!qrCodeBase64 && !qrCodeTexto && !ticketUrl) {
    resultado.innerHTML = `
      <div class="resultado-pedido erro">
        <h3>Pix criado, mas QR Code não foi encontrado</h3>
        <p>A função criar-pix respondeu, mas não enviou qr_code_base64, qr_code ou ticket_url.</p>
        <p>Abra o Console do navegador e veja a resposta em "Resposta do Pix".</p>
      </div>
    `;
    return;
  }

  resultado.innerHTML = `
    <div class="resultado-pedido pix-box">
      <h3>Pedido nº ${htmlSeguro(numero)}</h3>

      <p>Total: <strong>${moeda(total)}</strong></p>

      <h3>Pagamento via Pix</h3>
      <p>Escaneie o QR Code abaixo para pagar:</p>

      ${
        qrCodeBase64
          ? `<img class="pix-qrcode" src="data:image/png;base64,${qrCodeBase64}" alt="QR Code Pix">`
          : ""
      }

      ${
        qrCodeTexto
          ? `
            <p><strong>Pix copia e cola:</strong></p>
            <textarea class="pix-copia-cola" readonly>${htmlSeguro(qrCodeTexto)}</textarea>
            <button class="btn principal" onclick="copiarPix()">Copiar código Pix</button>
          `
          : ""
      }

      ${
        ticketUrl
          ? `<p><a class="btn" href="${htmlSeguro(ticketUrl)}" target="_blank" rel="noopener noreferrer">Abrir pagamento</a></p>`
          : ""
      }

      <p class="aviso-pix">
        Após o pagamento ser confirmado, o pedido aparecerá no balcão.
      </p>
    </div>
  `;

  // Limpa só o carrinho, mantendo o QR Code na tela
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
    .then(() => alert("Código Pix copiado!"))
    .catch(() => {
      document.execCommand("copy");
      alert("Código Pix copiado!");
    });
}

function moeda(valor) {
  if (typeof window !== "undefined" && typeof window.moeda === "function") {
    return window.moeda(valor);
  }

  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function numeroPedido() {
  if (typeof window !== "undefined" && typeof window.numeroPedido === "function") {
    return window.numeroPedido();
  }

  return Math.floor(1000 + Math.random() * 9000).toString();
}

function turnoAtual() {
  if (typeof window !== "undefined" && typeof window.turnoAtual === "function") {
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

  if (area) {
    area.innerHTML = `<p class="erro">${htmlSeguro(mensagem)}</p>`;
  } else {
    alert(mensagem);
  }
}

// Expondo funções para onclick do HTML
window.adicionarCarrinho = adicionarCarrinho;
window.removerCarrinho = removerCarrinho;
window.limparCarrinho = limparCarrinho;
window.finalizarPedido = finalizarPedido;
window.copiarPix = copiarPix;
window.carregarProdutos = carregarProdutos;
