const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function turnoAtual() {
  const hora = new Date().getHours();
  if (hora >= 6 && hora < 12) return "manha";
  if (hora >= 12 && hora < 18) return "tarde";
  return "noite";
}

function numeroPedido() {
  return Math.floor(1000 + Math.random() * 9000);
}

async function buscarConfig() {
  const { data } = await db.from("configuracoes").select("*").limit(1).single();
  return data;
}
