let produtos = [];
let carrinho = [];

document.addEventListener("DOMContentLoaded", async () => {
  await verificarTotem();
  await carregarProdutos();
});

function htmlSeguro(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function verificarTotem() {
  const config = await buscarConfig();
  if (config && config.totem_pausado) {
    document.querySelector("main").innerHTML = `
      <section class="card">
        <h2>Totem pausado</h2>
        <p>As vendas estão temporariamente pausadas pela administração.</p>
      </section>`;
  }
}

async function carregarProdutos() {
  const { data, error } = await db
    .from("produtos")
    .select("*")
    .eq("ativo", true)
    .order("categoria", { ascending: true });

  if (error) {
    alert("Erro ao carregar produtos: " + error.message);
    return;
  }

  produtos = data || [];
  renderizarProdutos();
}

function renderizarProdutos() {
  const area = document.getElementById("produtos");
  area.innerHTML = "";

  produtos.forEach(produto => {
    const semEstoque = produto.estoque <= 0;
    const div = document.createElement("div");
    div.className = "produto";
    div.innerHTML = `
      <img src="${produto.imagem_url || 'https://placehold.co/400x250?text=Cantina+Riolando'}" alt="${produto.nome}">
      <h3>${produto.nome}</h3>
      <p>${produto.categoria || "Geral"}</p>
      <p class="preco">${moeda(produto.preco)}</p>
      <p>Disponível: ${produto.estoque}</p>
      ${semEstoque ? '<p class="esgotado">Esgotado</p>' : `<button class="btn principal" onclick="adicionarCarrinho('${produto.id}')">Adicionar</button>`}
    `;
    area.appendChild(div);
  });
}

function adicionarCarrinho(id) {
  const produto = produtos.find(p => p.id === id);
  if (!produto || produto.estoque <= 0) return;

  const item = carrinho.find(i => i.id === id);
  const quantidadeAtual = item ? item.quantidade : 0;

  if (quantidadeAtual + 1 > produto.estoque) {
    alert("Quantidade maior que o estoque disponível.");
    return;
  }

  if (item) item.quantidade++;
  else carrinho.push({ ...produto, quantidade: 1 });

  renderizarCarrinho();
}

function removerCarrinho(id) {
  carrinho = carrinho.filter(i => i.id !== id);
  renderizarCarrinho();
}

function renderizarCarrinho() {
  const area = document.getElementById("itensCarrinho");
  area.innerHTML = "";

  carrinho.forEach(item => {
    const div = document.createElement("div");
    div.className = "item-carrinho";
    div.innerHTML = `
      <strong>${item.nome}</strong><br>
      Quantidade: ${item.quantidade}<br>
      Subtotal: ${moeda(item.preco * item.quantidade)}
      <button class="btn" onclick="removerCarrinho('${item.id}')">Remover</button>
    `;
    area.appendChild(div);
  });

  const total = carrinho.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
  document.getElementById("total").textContent = moeda(total);
}

function limparCarrinho() {
  carrinho = [];
  renderizarCarrinho();
  document.getElementById("resultadoPedido").innerHTML = "";
}

======================================================== */

async function finalizarPedido() {
  const clienteNome = document.getElementById("clienteNome").value.trim();
  const clienteEmail = document.getElementById("clienteEmail").value.trim();

  if (!clienteNome || !clienteEmail) {
    alert("Informe nome e e-mail institucional.");
    return;
  }

  if (carrinho.length === 0) {
    alert("Adicione pelo menos um produto.");
    return;
  }

  const resultado = document.getElementById("resultadoPedido");
  resultado.innerHTML = `
    <div class="resultado-pedido">
      <h3>Gerando Pix...</h3>
      <p>Aguarde enquanto o QR Code é criado.</p>
    </div>
  `;

  const total = carrinho.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
  const numero = numeroPedido();

  // 1. Cria pedido no Supabase
  const { data: pedido, error } = await db
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
        <p>${error.message}</p>
      </div>
    `;
    return;
  }

  // 2. Salva os itens do pedido
  const itens = carrinho.map(item => ({
    pedido_id: pedido.id,
    produto_id: item.id,
    produto_nome: item.nome,
    quantidade: item.quantidade,
    preco_unitario: item.preco,
    subtotal: item.preco * item.quantidade
  }));

  const { error: erroItens } = await db
    .from("itens_pedido")
    .insert(itens);

  if (erroItens) {
    console.error("Erro ao salvar itens:", erroItens);
    resultado.innerHTML = `
      <div class="resultado-pedido erro">
        <h3>Erro ao salvar itens</h3>
        <p>${erroItens.message}</p>
      </div>
    `;
    return;
  }

  // 3. Chama a função serverless do Netlify para criar Pix no Mercado Pago
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
        total: total,
        valor: total,
        description: `Pedido ${numero} - Cantina Riolando`,
        descricao: `Pedido ${numero} - Cantina Riolando`,
        cliente_nome: clienteNome,
        cliente_email: clienteEmail,
        itens: itens
      })
    });

    dadosPix = await respostaPix.json();
  } catch (erroFetch) {
    console.error("Erro ao chamar função criar-pix:", erroFetch);
    resultado.innerHTML = `
      <div class="resultado-pedido erro">
        <h3>Erro ao gerar Pix</h3>
        <p>Não foi possível chamar a função criar-pix.</p>
        <p>Confira se o arquivo netlify/functions/criar-pix.js existe no projeto.</p>
      </div>
    `;
    return;
  }

  if (!respostaPix.ok) {
    console.error("Erro retornado pela função criar-pix:", dadosPix);
    resultado.innerHTML = `
      <div class="resultado-pedido erro">
        <h3>Erro ao gerar Pix</h3>
        <p>${dadosPix?.error || dadosPix?.message || "A função criar-pix retornou erro."}</p>
        <p>Confira a variável MP_ACCESS_TOKEN no Netlify.</p>
      </div>
    `;
    return;
  }

  console.log("Resposta do Pix:", dadosPix);

  // 4. Aceita vários nomes de campos possíveis
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

  // 5. Se não vier QR Code, mostra mensagem clara
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

  // 6. Renderiza QR Code no centro da tela
  resultado.innerHTML = `
    <div class="resultado-pedido pix-box">
      <h3>Pedido nº ${numero}</h3>

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
            <textarea class="pix-copia-cola" readonly>${qrCodeTexto}</textarea>
            <button class="btn principal" onclick="copiarPix()">Copiar código Pix</button>
          `
          : ""
      }

      ${
        ticketUrl
          ? `<p><a class="btn" href="${ticketUrl}" target="_blank" rel="noopener noreferrer">Abrir pagamento</a></p>`
          : ""
      }

      <p class="aviso-pix">
        Após o pagamento ser confirmado, o pedido aparecerá no balcão.
      </p>
    </div>
  `;

  // 7. Limpa apenas o carrinho, sem apagar o resultado do Pix
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

window.finalizarPedido = finalizarPedido;
window.copiarPix = copiarPix;
