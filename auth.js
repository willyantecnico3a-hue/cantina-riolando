/* Autenticação das áreas operacionais e administrativas. */
(function () {
  const paginasProtegidas = new Set(["admin.html", "balcao.html"]);
  const paginaAtual = () => window.location.pathname.split("/").pop() || "index.html";
  const destinoSeguro = (destino) => paginasProtegidas.has(destino) ? destino : "admin.html";

  function irParaLogin() {
    window.location.replace(`login.html?destino=${encodeURIComponent(destinoSeguro(paginaAtual()))}`);
  }

  async function usuarioAdministrador() {
    const { data: sessaoData } = await db.auth.getSession();
    const usuario = sessaoData.session?.user;
    if (!usuario) return null;
    const { data, error } = await db.rpc("is_admin");
    return error || data !== true ? null : usuario;
  }

  window.exigirAdministrador = async function () {
    if (!(await usuarioAdministrador())) {
      irParaLogin();
      return false;
    }
    return true;
  };

  window.sairDoSistema = async function () {
    await db.auth.signOut();
    window.location.replace("login.html");
  };

  document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("formLogin");
    if (!form) return;
    if (await usuarioAdministrador()) {
      window.location.replace(destinoSeguro(new URLSearchParams(window.location.search).get("destino")));
      return;
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const mensagem = document.getElementById("mensagemLogin");
      const botao = document.getElementById("botaoLogin");
      botao.disabled = true;
      botao.textContent = "Entrando...";
      mensagem.hidden = true;
      const email = document.getElementById("emailLogin").value.trim();
      const senha = document.getElementById("senhaLogin").value;
      const { error } = await db.auth.signInWithPassword({ email, password: senha });
      if (error || !(await usuarioAdministrador())) {
        await db.auth.signOut();
        mensagem.textContent = error ? "Não foi possível entrar. Confira e-mail e senha." : "Esta conta não tem permissão administrativa.";
        mensagem.hidden = false;
        botao.disabled = false;
        botao.textContent = "Entrar";
        return;
      }
      window.location.replace(destinoSeguro(new URLSearchParams(window.location.search).get("destino")));
    });
  });
})();
