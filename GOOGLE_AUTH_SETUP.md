# Login Google para clientes

1. No Supabase, abra **Authentication > Providers > Google** e habilite o provedor.
2. No Google Cloud Console, crie um cliente OAuth Web e informe o Client ID e o Client Secret no Supabase.
3. No Google Cloud, inclua como URI de redirecionamento autorizado:

   `https://zozybbovlhxtnmjnunhu.supabase.co/auth/v1/callback`

4. No Supabase, em **Authentication > URL Configuration**, inclua as URLs do site, principalmente:

   `https://SEU-DOMINIO/minha-conta.html`

5. Execute o trecho mais recente de `database.sql` no SQL Editor do Supabase. Ele cria as políticas que deixam cada cliente ver apenas pedidos feitos com o e-mail da própria conta Google.

Pedidos feitos no totem aparecem em **Meus pedidos** quando o e-mail digitado no totem for igual ao e-mail usado no login Google.
