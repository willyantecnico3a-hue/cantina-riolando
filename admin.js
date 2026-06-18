<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cantina Riolando - Administração</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="topo">
    <div>
      <h1>Painel Administrativo</h1>
      <p>Produtos, preços, estoque, promoções e relatórios</p>
    </div>
    <nav>
      <a href="index.html">Totem</a>
      <a href="balcao.html">Balcão</a>
      <a href="admin.html">Admin</a>
      <a href="app.html">App</a>
    </nav>
  </header>

  <main class="admin-grid">
    <section class="card">
      <h2>Cadastrar produto</h2>
      <label>Nome</label>
      <input id="produtoNome" placeholder="Ex: Suco de uva" />

      <label>Categoria</label>
      <input id="produtoCategoria" placeholder="Ex: Bebidas" />

      <label>Preço</label>
      <input id="produtoPreco" type="number" step="0.01" placeholder="Ex: 5.00" />

      <label>Estoque</label>
      <input id="produtoEstoque" type="number" placeholder="Ex: 30" />

      <label>URL da imagem</label>
      <input id="produtoImagem" placeholder="Opcional" />

      <button class="btn principal" onclick="salvarProduto()">Salvar produto</button>
    </section>

    <section class="card">
      <h2>Configurações</h2>
      <label>Chave Pix da cantina/APM</label>
      <input id="pixChave" placeholder="Digite a chave Pix" />

      <label>Nome do recebedor</label>
      <input id="pixNome" placeholder="Ex: APM Riolando Canno" />

      <label>Cidade</label>
      <input id="pixCidade" placeholder="Ex: DIADEMA" />

      <button class="btn principal" onclick="salvarConfig()">Salvar Pix</button>
      <button class="btn alerta" onclick="alternarTotem()">Pausar/Ativar totem</button>
      <p id="statusTotem"></p>
    </section>

    <section class="card grande">
      <h2>Produtos cadastrados</h2>
      <div id="listaProdutosAdmin" class="lista"></div>
    </section>

    <section class="card grande">
      <h2>Relatórios</h2>
      <div class="filtros">
        <select id="periodoRelatorio">
          <option value="dia">Diário</option>
          <option value="semana">Semanal</option>
          <option value="mes">Mensal</option>
          <option value="ano">Anual</option>
        </select>
        <select id="turnoRelatorio">
          <option value="">Todos os turnos</option>
          <option value="manha">Manhã</option>
          <option value="tarde">Tarde</option>
          <option value="noite">Noite</option>
        </select>
        <button class="btn" onclick="carregarRelatorios()">Atualizar</button>
      </div>

      <div id="relatorios" class="relatorios"></div>
    </section>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="config.js"></script>
  <script src="supabaseClient.js"></script>
  <script src="admin.js"></script>
</body>
</html>
