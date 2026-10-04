# Doce na Mão

Site instalável como app (PWA) para quem vende sob encomenda: lançar pedidos em segundos, cobrar pelo WhatsApp com número do pedido e Pix, agenda com limite por dia e link público de datas livres, e relatório do mês.

Mesmo código serve para três formas de uso:

1. **Site + PWA** (recomendado para a validação): a confeiteira abre o link no celular e toca em "Adicionar à tela inicial". Fica com ícone e tela cheia, como app.
2. **App Android** (Google Play) e **app iOS** (App Store) com Capacitor, empacotando a pasta `public/`.
3. **Modo demo**: sem configurar nada, roda com dados de exemplo só no aparelho. Bom para mostrar nas entrevistas.

## Estrutura

```
public/            o app (é isso que vai para o Vercel e para o Capacitor)
  index.html       app da confeiteira (login, Hoje, Encomendas, Agenda, Relatório)
  agenda.html      página pública que o cliente final vê (?n=slug-do-negocio)
  js/config.js     URL e chave do Supabase  <-- único arquivo que você edita
  js/db.js         camada de dados (Supabase ou modo demo)
  js/app.js        telas e regras
  js/agenda.js     página pública
  sw.js, manifest.webmanifest, icons/   o que faz virar "app instalável"
supabase/schema.sql   tabelas, segurança por conta e funções da agenda pública
capacitor.config.json, package.json   para gerar Android/iOS
```

## 1. Banco de dados (Supabase) — 10 minutos

1. Crie um projeto novo em supabase.com (pode ser separado da VINA).
2. Abra **SQL Editor**, cole todo o conteúdo de `supabase/schema.sql` e rode.
3. Em **Authentication > Sign In / Providers > Email**: para a fase de testes, desligue "Confirm email" (a pessoa cria a conta e já entra). Ligue de novo antes de abrir para o público.
4. Em **Authentication > URL Configuration**, coloque em Site URL o endereço do Vercel (passo 2).
5. Em **Project Settings > API**, copie a *Project URL* e a chave *anon public* para `public/js/config.js`.

A chave *anon* pode ficar no código: quem protege os dados são as regras do banco (cada conta só enxerga o próprio negócio; a agenda pública só devolve nome, WhatsApp e se o dia está livre).

## 2. Publicar (GitHub + Vercel)

1. Suba esta pasta para um repositório no GitHub.
2. No Vercel: **Add New > Project**, escolha o repositório. Não precisa de build: o `vercel.json` já aponta para `public/`.
3. Depois do primeiro deploy, coloque o endereço em `SITE_URL` no `config.js` (é o que vai no link da agenda) e faça commit.

Para testar no computador antes: `npx serve public` e abra o endereço mostrado.

## 3. Instalar no celular como app (PWA)

- **Android (Chrome)**: abrir o site > menu ⋮ > "Instalar app" ou "Adicionar à tela inicial".
- **iPhone (Safari)**: abrir o site > botão Compartilhar > "Adicionar à Tela de Início".

Isso já basta para validar com as 10 primeiras confeiteiras, sem loja e sem custo.

## 4. Gerar os apps de loja (Capacitor)

Pré-requisitos: Node 20+, Android Studio (para Android) e um Mac com Xcode (para iOS).

```bash
npm install
npx cap add android      # cria a pasta android/
npx cap add ios          # cria a pasta ios/ (só no Mac)
npm run android          # sincroniza e abre no Android Studio
npm run ios              # sincroniza e abre no Xcode
```

Sempre que mudar algo em `public/`, rode `npx cap sync` antes de gerar o app.

No app de loja, preencha `SITE_URL` no `config.js`: dentro do app o endereço local não serve como link para clientes.

Ícones e tela de abertura: use `public/icons/icon-1024.png` como base (`npx @capacitor/assets generate` gera todos os tamanhos).

Custos e cuidados das lojas:

- Google Play: taxa única de cadastro de desenvolvedor (cerca de US$ 25).
- App Store: assinatura anual do Apple Developer Program (cerca de US$ 99/ano).
- A Apple costuma recusar apps que são só um site embrulhado. Antes de mandar para a App Store, vale ter algo nativo, como notificação de entrega do dia (plugin `@capacitor/local-notifications`).

## 5. Validar com uso real

O banco já é o seu painel de validação. No SQL Editor (roda como admin, vê todas as contas):

```sql
-- quantas contas lançam pedidos por semana (o número que importa)
select date_trunc('week', p.criado_em)::date as semana,
       count(distinct p.negocio_id) as negocios_ativos,
       count(*) as pedidos
from pedidos p group by 1 order by 1 desc;

-- quem está usando de verdade
select n.nome, n.criado_em::date as entrou, count(p.id) as pedidos,
       max(p.criado_em)::date as ultimo_pedido
from negocios n left join pedidos p on p.negocio_id = n.id
group by n.id order by pedidos desc;
```

Sinal forte: a pessoa ainda lança pedidos na 3ª e 4ª semana sem você lembrar.

## O que fica para a v2

- Tabela própria de clientes e produtos (hoje o cliente vai no próprio pedido).
- Precificação (custo, margem, preço mínimo).
- Cobrança automática (Pix Automático ou parceiro de pagamento).
- Plano pago e limite do plano grátis.
