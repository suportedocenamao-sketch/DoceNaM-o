/* Doce na Mão — app da confeiteira (v2) */
const SEGMENTOS = {
  doces:   { nome: 'Doces e bolos',      p: 'Encomenda', pl: 'Encomendas', ex: 'Bolo de chocolate', extra: 'Sabor, tema, retirada ou entrega' },
  marmita: { nome: 'Marmitas',           p: 'Pedido',    pl: 'Pedidos',    ex: 'Marmita fit frango', extra: 'Cardápio, endereço de entrega' },
  cestas:  { nome: 'Cestas e presentes', p: 'Encomenda', pl: 'Encomendas', ex: 'Cesta café da manhã', extra: 'Itens da cesta, texto do cartão' },
  arte:    { nome: 'Artesanato',         p: 'Encomenda', pl: 'Encomendas', ex: 'Caneca personalizada', extra: 'Personalização, cores' },
  servico: { nome: 'Serviço recorrente', p: 'Visita',    pl: 'Visitas',    ex: 'Limpeza da piscina', extra: 'Endereço, o que levar' }
};
const STATUS = [['aguardando', 'Aguardando sinal'], ['confirmado', 'Confirmado'], ['producao', 'Em produção'], ['entregue', 'Entregue']];

/* ---------- estado ---------- */
const VAZIO = () => ({ neg: null, pedidos: [], bloqueios: [], clientes: [], produtos: [] });
let S = VAZIO();
let tab = 'hoje', filtro = 'abertos', mesAg = today().slice(0, 7), modoEntrada = 'entrar', buscaCli = '';

const voc = () => SEGMENTOS[S.neg?.seg] || SEGMENTOS.doces;
const pago = p => p.pagamentos.reduce((a, x) => a + Number(x.v), 0);
const saldo = p => Math.max(0, r2(p.valor - pago(p)));
const quitado = p => saldo(p) <= 0.009;
const ativo = p => p.status !== 'cancelado';
const aceito = p => ativo(p) && p.status !== 'solicitado';
const venc = p => p.venc || p.data;
const atrasado = p => aceito(p) && !quitado(p) && venc(p) && venc(p) < today();
const pagarHoje = p => aceito(p) && !quitado(p) && venc(p) === today();
const sinalPendente = p => aceito(p) && p.status === 'aguardando' && p.sinal > 0 && pago(p) < p.sinal;
const contaNoDia = d => S.pedidos.filter(p => ativo(p) && p.data === d).length;
const cliDe = p => S.clientes.find(c => c.id === p.clienteId);
const nomeCompleto = c => (c.nome + ' ' + (c.sobrenome || '')).trim();
const nomeCliente = p => { const c = cliDe(p); return c ? nomeCompleto(c) : p.cliente; };
const telCliente = p => (cliDe(p) || {}).whats || p.tel;
const linkAgenda = () => baseSite() + '/agenda.html?n=' + S.neg.slug;
const linkCliente = c => c && c.token ? baseSite() + '/meus-pedidos.html?c=' + c.token : '';
const totTabela = itens => r2(itens.reduce((a, i) => a + r2(i.qtd * i.precoTab), 0));
const totItens = itens => r2(itens.reduce((a, i) => a + r2(i.qtd * i.preco), 0));
const difPedido = p => p.itens.length ? r2(totItens(p.itens) - totTabela(p.itens) + (p.ajuste || 0)) : 0;

/* quem já foi cobrado hoje (fica só neste aparelho) */
const cobrados = {
  ler() { try { const o = JSON.parse(localStorage.getItem('dnm-cobrados') || '{}'); return o.dia === today() ? o.ids : []; } catch (e) { return []; } },
  marcar(id) { try { const ids = [...new Set([...this.ler(), String(id)])]; localStorage.setItem('dnm-cobrados', JSON.stringify({ dia: today(), ids })); } catch (e) {} },
  tem(id) { return this.ler().includes(String(id)); }
};

async function tenta(fn, botao) {
  if (botao) botao.disabled = true;
  try { return await fn(); }
  catch (e) { toast(e.message || 'Algo deu errado. Tente de novo.'); throw e; }
  finally { if (botao) botao.disabled = false; }
}

/* ---------- entrada ---------- */
function telaEntrada() {
  document.body.classList.add('sem-nav');
  const cad = modoEntrada === 'cadastrar';
  $('#app').innerHTML = `
  <div class="hero"><span class="logo"><span class="mark">dm</span><strong>Doce na Mão</strong></span>
  <p>Suas encomendas num lugar só. Cobre pelo WhatsApp e mostre seu cardápio e suas datas livres.</p></div>
  <div class="card">
    <div class="seg"><button data-m="entrar" aria-pressed="${!cad}">Entrar</button><button data-m="cadastrar" aria-pressed="${cad}">Criar conta</button></div>
    <label class="f" for="eMail">E-mail</label><input class="t" id="eMail" type="email" autocomplete="email" inputmode="email">
    <label class="f" for="eSenha">Senha ${cad ? '<em>(mínimo 6 caracteres)</em>' : ''}</label><input class="t" id="eSenha" type="password" autocomplete="${cad ? 'new-password' : 'current-password'}">
    <p class="err" id="eErr"></p>
    <button class="btn go" id="eOk">${cad ? 'Criar conta grátis' : 'Entrar'}</button>
    ${cad ? '' : '<button class="more" id="eEsqueci" type="button">Esqueci a senha</button>'}
  </div>`;
  $$('[data-m]').forEach(b => b.onclick = () => { modoEntrada = b.dataset.m; telaEntrada(); });
  const erro = m => $('#eErr').textContent = m;
  $('#eOk').onclick = async () => {
    const email = $('#eMail').value.trim(), senha = $('#eSenha').value;
    if (!email || !senha) return erro('Preencha e-mail e senha.');
    $('#eOk').disabled = true; erro('');
    try {
      if (cad) {
        const s = await DB.cadastrar(email, senha);
        if (!s) { $('.card').innerHTML = `<h2 style="margin-top:0">Confirme seu e-mail</h2><p>Enviamos um link para <strong>${esc(email)}</strong>. Abra, confirme e volte aqui para entrar.</p><button class="btn ghost" id="eVolta">Voltar para entrar</button>`; $('#eVolta').onclick = () => { modoEntrada = 'entrar'; telaEntrada(); }; return; }
      } else await DB.entrar(email, senha);
      await iniciar();
    } catch (e) { erro(e.message); } finally { const b = $('#eOk'); if (b) b.disabled = false; }
  };
  if ($('#eEsqueci')) $('#eEsqueci').onclick = async () => {
    const email = $('#eMail').value.trim(); if (!email) return erro('Digite seu e-mail acima primeiro.');
    try { await DB.recuperarSenha(email); erro(''); toast('Enviamos um link para trocar a senha.'); } catch (e) { erro(e.message); }
  };
}

function telaBoasVindas() {
  document.body.classList.add('sem-nav');
  $('#app').innerHTML = `
  <div class="hero"><span class="logo"><span class="mark">dm</span><strong>Quase lá</strong></span>
  <p>Conte rapidinho sobre o seu negócio. Dá para mudar tudo depois em Ajustes.</p></div>
  <div class="card">
    <label class="f" for="bNome">Nome do negócio</label><input class="t" id="bNome" placeholder="Ex.: Doces da Lu">
    <label class="f" for="bSeg">O que você vende</label><select class="t" id="bSeg">${Object.entries(SEGMENTOS).map(([k, s]) => `<option value="${k}">${s.nome}</option>`).join('')}</select>
    <label class="f" for="bWa">Seu WhatsApp <em>(clientes falam com você por ele)</em></label><input class="t" id="bWa" inputmode="tel" placeholder="61 99999-0000">
    <label class="f" for="bPix">Chave Pix <em>(vai nas mensagens de cobrança)</em></label><input class="t" id="bPix">
    <p class="err" id="bErr"></p>
    <button class="btn go" id="bOk">Começar</button>
  </div>
  <button class="more" id="bSair" style="display:block;margin:16px auto">Sair</button>`;
  $('#bSair').onclick = sair;
  $('#bOk').onclick = async () => {
    const nome = $('#bNome').value.trim(); if (!nome) return $('#bErr').textContent = 'Digite o nome do negócio.';
    await tenta(async () => {
      S.neg = await DB.criarNegocio({ nome, slug: slug(nome), seg: $('#bSeg').value, whats: $('#bWa').value.replace(/\D/g, ''), pix: $('#bPix').value.trim(), limite: 3, texto: TEXTO_PADRAO });
      await iniciar();
    }, $('#bOk')).catch(() => {});
  };
}

/* ---------- ticket de pedido ---------- */
function ticket(p) {
  const cls = p.status === 'solicitado' ? 'is-new' : quitado(p) ? 'is-paid' : (atrasado(p) ? 'is-late' : '');
  let badge;
  if (p.status === 'cancelado') badge = '<span class="badge">Cancelado</span>';
  else if (p.status === 'solicitado') badge = '<span class="badge rose">Novo · responder</span>';
  else if (quitado(p)) badge = '<span class="badge go">Pago</span>';
  else if (atrasado(p)) badge = `<span class="badge late">Deve ${brl(saldo(p))}</span>`;
  else if (pagarHoje(p)) badge = `<span class="badge late">Pagar hoje ${brl(saldo(p))}</span>`;
  else if (sinalPendente(p)) badge = '<span class="badge rose">Sinal pendente</span>';
  else badge = `<span class="badge">Falta ${brl(saldo(p))}</span>`;
  const desc = p.itens.length ? resumoItens(p.itens) : p.desc;
  return `<button class="ticket ${cls}" data-open="${p.id}">
    <span class="stub"><span class="no">#${noPad(p.no)}</span><span class="d">${p.data ? fmtD(p.data) : 'avulsa'}</span></span>
    <span class="body"><span class="who">${esc(nomeCliente(p))}</span>
      <span class="what" style="display:block">${esc(desc)}</span>
      <span class="row"><span class="money">${brl(p.valor)}</span>${badge}</span>
      <span class="small muted">${STATUS_NOMES[p.status]}${p.repetir ? ' · repete ' + (p.repetir === 'semanal' ? 'toda semana' : 'todo mês') : ''}${cobrados.tem(p.id) ? ' · cobrado hoje' : ''}</span>
    </span></button>`;
}
function bindTickets(raiz = document) { raiz.querySelectorAll('[data-open]').forEach(b => b.onclick = () => abrirPedido(b.dataset.open)); }

/* ---------- alertas ---------- */
function alertas() {
  const t = today();
  return [
    { k: 'novos', ic: '🛎️', titulo: n => `${n} ${n === 1 ? 'pedido novo' : 'pedidos novos'} pela agenda`, sub: 'Revise e responda', lista: S.pedidos.filter(p => p.status === 'solicitado'), urg: true },
    { k: 'entregar', ic: '📦', titulo: n => `${n} para entregar hoje`, sub: 'Toque para ver', lista: S.pedidos.filter(p => aceito(p) && p.data === t && p.status !== 'entregue') },
    { k: 'receber', ic: '💰', titulo: n => `${n} para receber hoje`, sub: 'Fila de cobrança', lista: S.pedidos.filter(pagarHoje), cobrar: true, urg: true },
    { k: 'atrasados', ic: '⏰', titulo: n => `${n} ${n === 1 ? 'pagamento atrasado' : 'pagamentos atrasados'}`, sub: 'Fila de cobrança', lista: S.pedidos.filter(atrasado), cobrar: true, urg: true },
    { k: 'sinais', ic: '✋', titulo: n => `${n} ${n === 1 ? 'sinal pendente' : 'sinais pendentes'} para os próximos 2 dias`, sub: 'Cobre para garantir a data', lista: S.pedidos.filter(p => sinalPendente(p) && p.data && p.data <= addDays(t, 2) && p.data >= t), cobrar: true }
  ].filter(a => a.lista.length);
}
function abrirFila(a) {
  abrir(`<h1 style="font-size:24px">${a.ic} ${esc(a.titulo(a.lista.length))}</h1>
  <p class="sub">${a.cobrar ? 'Toque em Cobrar: o WhatsApp abre com a mensagem pronta. Quem você já cobrou hoje fica marcado.' : esc(a.sub)}</p>
  <div id="filaLista">${a.lista.map(p => a.cobrar ? `
    <div class="fila-row">
      <button class="fila-info" data-open="${p.id}"><strong>${esc(nomeCliente(p))}</strong><span class="small muted">#${noPad(p.no)} · ${p.data ? fmtD(p.data) : 'avulsa'} · falta ${brl(saldo(p))}</span></button>
      ${cobrados.tem(p.id) ? '<span class="badge go">Cobrado</span>' : `<a class="btn wa mini" href="${waLinkTel(telCliente(p), msgCobranca(p))}" target="_blank" rel="noopener" data-cobrar="${p.id}">Cobrar</a>`}
    </div>` : ticket(p)).join('')}</div>`);
  bindTickets($('#filaLista'));
  $$('[data-cobrar]').forEach(b => b.addEventListener('click', () => { cobrados.marcar(b.dataset.cobrar); setTimeout(() => { render(); abrirFila({ ...a, lista: a.lista }); }, 300); }));
}

/* ---------- telas ---------- */
function telaHoje() {
  const t = today(), v = voc(), d = new Date();
  const al = alertas();
  const hoje = S.pedidos.filter(p => aceito(p) && p.data === t && p.status !== 'entregue');
  const prox = S.pedidos.filter(p => ativo(p) && p.data > t && p.data <= addDays(t, 7)).sort((a, b) => a.data.localeCompare(b.data));
  const receber = S.pedidos.filter(aceito).reduce((a, p) => a + saldo(p), 0);
  const recebidoHoje = S.pedidos.flatMap(p => p.pagamentos).filter(x => x.d === t).reduce((a, x) => a + x.v, 0);
  return `${DB.online ? '' : '<p class="demo-flag">Modo demonstração: os dados ficam só neste aparelho.</p>'}
  <header class="top"><div><h1>Oi, ${esc(S.neg.nome)}</h1><p class="sub">${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][d.getDay()]}, ${d.getDate()} de ${d.toLocaleString('pt-BR', { month: 'long' })}</p></div>
    <button class="iconbtn" id="ajustes" aria-label="Ajustes">⚙️</button></header>
  <section class="alerts" aria-label="Alertas">
    ${al.length ? al.map((a, i) => `<button class="alert ${a.urg ? 'urg' : ''}" data-al="${i}"><span class="ic">${a.ic}</span><span><strong>${esc(a.titulo(a.lista.length))}</strong><br><span class="small muted">${esc(a.sub)}</span></span><span class="chev">›</span></button>`).join('')
      : '<div class="alert ok"><span class="ic">✅</span><span><strong>Tudo em dia</strong><br><span class="small muted">Nada para cobrar ou responder agora.</span></span></div>'}
  </section>
  <div class="sums" style="margin-top:12px">
    <div class="sum"><b>${brl(receber)}</b><span>a receber</span></div>
    <div class="sum"><b>${brl(recebidoHoje)}</b><span>recebido hoje</span></div>
  </div>
  <h2>Para hoje</h2>
  ${hoje.length ? hoje.map(ticket).join('') : '<div class="empty">Nada para entregar hoje.</div>'}
  <h2>Próximos 7 dias</h2>
  ${prox.length ? prox.map(ticket).join('') : `<div class="empty">Nenhuma ${v.p.toLowerCase()} na semana. Mande o link do cardápio para seus clientes.</div>`}`;
}
function telaPedidos() {
  const v = voc();
  const F = { novos: p => p.status === 'solicitado', abertos: p => aceito(p) && (!quitado(p) || p.status !== 'entregue'), devendo: p => aceito(p) && !quitado(p), pagos: p => quitado(p) && p.valor > 0, todos: () => true };
  const lista = S.pedidos.filter(F[filtro]).sort((a, b) => (b.data || '9999').localeCompare(a.data || '9999') || b.no - a.no);
  const nNovos = S.pedidos.filter(F.novos).length;
  const ch = (k, l) => `<button class="chip" data-f="${k}" aria-pressed="${filtro === k}">${l}</button>`;
  return `<header class="top"><div><h1>${v.pl}</h1><p class="sub">${S.pedidos.length} no total</p></div></header>
  <div class="chips">${nNovos ? ch('novos', `Novos (${nNovos})`) : ''}${ch('abertos', 'Em aberto')}${ch('devendo', 'Quem deve')}${ch('pagos', 'Pagos')}${ch('todos', 'Todos')}</div>
  ${lista.length ? lista.map(ticket).join('') : '<div class="empty">Nada por aqui. Toque em + para lançar.</div>'}`;
}
function telaAgenda() {
  const [y, m] = mesAg.split('-').map(Number);
  const first = new Date(y, m - 1, 1), dias = new Date(y, m, 0).getDate(), t = today();
  let cells = WD.map(w => `<span class="wd">${w}</span>`).join('');
  for (let i = 0; i < first.getDay(); i++) cells += '<span class="pad"></span>';
  for (let d = 1; d <= dias; d++) {
    const ds = `${y}-${pad(m)}-${pad(d)}`, n = contaNoDia(ds), bl = S.bloqueios.includes(ds);
    const cls = [bl ? 'blocked' : (n >= S.neg.limite ? 'full' : ''), ds < t ? 'past' : '', ds === t ? 'today' : ''].join(' ');
    cells += `<button class="${cls}" data-day="${ds}" aria-label="${fmtD(ds)}: ${bl ? 'folga' : n + ' de ' + S.neg.limite}">${d}<small>${bl ? 'folga' : n + '/' + S.neg.limite}</small></button>`;
  }
  return `<header class="top"><div><h1>Agenda</h1><p class="sub">Toque num dia para ver ou bloquear</p></div></header>
  <div class="sum" style="display:flex;justify-content:space-between;align-items:center">
    <div><strong>Aceito por dia</strong><br><span class="small muted">Depois disso o dia aparece lotado</span></div>
    <div class="stepper"><button id="menos" aria-label="Menos">−</button><b>${S.neg.limite}</b><button id="mais" aria-label="Mais">+</button></div>
  </div>
  <div class="monthnav"><button class="iconbtn" id="mPrev" aria-label="Mês anterior">‹</button><strong style="text-transform:capitalize">${first.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</strong><button class="iconbtn" id="mNext" aria-label="Próximo mês">›</button></div>
  <div class="cal">${cells}</div>
  <div class="legend"><span><i style="background:var(--paper)"></i>Com vaga</span><span><i style="background:var(--rose-soft)"></i>Lotado</span><span><i style="background:repeating-linear-gradient(45deg,var(--bg),var(--bg) 3px,var(--line) 3px,var(--line) 5px)"></i>Folga</span></div>
  <div class="linkbox"><span class="small muted">Link do cardápio e agenda para clientes</span><code>${esc(linkAgenda())}</code></div>
  <button class="btn go" id="link">Copiar link</button>
  <a class="btn ghost" href="${esc(linkAgenda())}" target="_blank" rel="noopener">Ver como o cliente vê</a>`;
}
function telaMais() {
  const nAt = S.produtos.filter(p => p.ativo).length;
  const item = (go, ic, t, s) => `<button class="menu-item" data-go="${go}"><span class="ic">${ic}</span><span><strong>${t}</strong><br><span class="small muted">${s}</span></span><span class="chev">›</span></button>`;
  return `<header class="top"><div><h1>Mais</h1></div></header>
  <div class="menu">
    ${item('produtos', '🧁', 'Produtos e cardápio', `${nAt} ${nAt === 1 ? 'produto ativo' : 'produtos ativos'}`)}
    ${item('clientes', '👥', 'Clientes', `${S.clientes.length} ${S.clientes.length === 1 ? 'cliente' : 'clientes'}`)}
    ${item('relatorio', '📊', 'Relatório', 'Vendas, recebidos e descontos do mês')}
    ${item('ajustes', '⚙️', 'Ajustes', 'Nome, Pix, WhatsApp e mensagens')}
  </div>
  <button class="btn ghost" id="mLink">Copiar link do cardápio para clientes</button>`;
}
function telaClientes() {
  const q = norm(buscaCli);
  const lista = S.clientes.filter(c => !q || norm(nomeCompleto(c) + ' ' + c.whats).includes(q)).sort((a, b) => nomeCompleto(a).localeCompare(nomeCompleto(b)));
  const info = c => { const ps = S.pedidos.filter(p => p.clienteId === c.id && aceito(p)); const deve = ps.reduce((a, p) => a + saldo(p), 0); return { n: ps.length, total: ps.reduce((a, p) => a + p.valor, 0), deve }; };
  return `<header class="top"><div><button class="more back" data-go="mais">‹ Mais</button><h1>Clientes</h1></div><button class="iconbtn" id="cNovo" aria-label="Novo cliente">＋</button></header>
  <input class="t" id="cBusca" placeholder="Buscar por nome ou WhatsApp" value="${esc(buscaCli)}" autocomplete="off">
  <div id="cLista">${lista.length ? lista.map(c => { const i = info(c); return `<button class="row-card" data-cli="${c.id}">
      <span class="avatar">${esc(c.nome.charAt(0).toUpperCase())}</span>
      <span class="grow"><strong>${esc(nomeCompleto(c))}</strong>${c.origem === 'agenda' ? ' <span class="badge rose">veio da agenda</span>' : ''}<br><span class="small muted">${c.whats ? fmtTel(c.whats) : 'sem WhatsApp'} · ${i.n} ${i.n === 1 ? 'pedido' : 'pedidos'} · ${brl(i.total)}</span></span>
      ${i.deve > 0 ? `<span class="badge late">deve ${brl(i.deve)}</span>` : ''}</button>`; }).join('') : '<div class="empty" style="margin-top:12px">Nenhum cliente encontrado.</div>'}</div>`;
}
function telaProdutos() {
  const grupos = {};
  S.produtos.slice().sort((a, b) => (a.grupo || 'zzz').localeCompare(b.grupo || 'zzz') || (a.subgrupo || '').localeCompare(b.subgrupo || '') || a.nome.localeCompare(b.nome))
    .forEach(p => { const g = p.grupo || 'Sem grupo'; (grupos[g] = grupos[g] || []).push(p); });
  return `<header class="top"><div><button class="more back" data-go="mais">‹ Mais</button><h1>Produtos</h1><p class="sub">O que estiver "no cardápio" aparece para os clientes</p></div><button class="iconbtn" id="pNovo" aria-label="Novo produto">＋</button></header>
  ${Object.keys(grupos).length ? Object.entries(grupos).map(([g, ps]) => `<h2>${esc(g)}</h2>${ps.map(p => `
    <button class="row-card ${p.ativo ? '' : 'off'}" data-prod="${p.id}">${thumb(p.foto, p.nome)}
      <span class="grow"><strong>${esc(p.nome)}</strong><br><span class="small muted">${p.subgrupo ? esc(p.subgrupo) + ' · ' : ''}${precoUn(p.preco, p.un)}</span></span>
      ${!p.ativo ? '<span class="badge">inativo</span>' : !p.cardapio ? '<span class="badge">fora do cardápio</span>' : ''}</button>`).join('')}`).join('')
    : '<div class="empty" style="margin-top:12px">Cadastre seus produtos com foto e preço. Eles viram o cardápio que o cliente vê no link.</div>'}`;
}
function telaRelatorio() {
  const mes = today().slice(0, 7);
  const doMes = S.pedidos.filter(p => aceito(p) && ((p.data || p.criado).slice(0, 7) === mes));
  const vendido = doMes.reduce((a, p) => a + p.valor, 0);
  const recebido = S.pedidos.flatMap(p => p.pagamentos).filter(x => x.d.slice(0, 7) === mes).reduce((a, x) => a + Number(x.v), 0);
  const receber = S.pedidos.filter(aceito).reduce((a, p) => a + saldo(p), 0);
  let abaixo = 0, acima = 0, tabela = 0;
  doMes.forEach(p => {
    p.itens.forEach(i => { const d = r2(i.qtd * (i.preco - i.precoTab)); if (d < 0) abaixo += d; else acima += d; tabela += r2(i.qtd * i.precoTab); });
    if (p.itens.length) { if (p.ajuste < 0) abaixo += p.ajuste; else acima += p.ajuste; }
  });
  const liquido = r2(acima + abaixo);
  const top = (fn) => { const m = {}; doMes.forEach(p => fn(p, m)); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6); };
  const porGrupo = top((p, m) => p.itens.forEach(i => { const pr = S.produtos.find(x => x.id === i.produtoId); const k = (pr && pr.grupo) || 'Sem grupo'; m[k] = (m[k] || 0) + r2(i.qtd * i.preco); }));
  const porProduto = top((p, m) => { if (p.itens.length) p.itens.forEach(i => m[i.desc] = (m[i.desc] || 0) + r2(i.qtd * i.preco)); else m[p.desc] = (m[p.desc] || 0) + p.valor; });
  const porCliente = top((p, m) => { const k = nomeCliente(p); m[k] = (m[k] || 0) + p.valor; });
  const bars = arr => { if (!arr.length) return '<p class="muted small">Ainda sem vendas neste mês.</p>'; const mx = arr[0][1] || 1; return `<div class="bars">${arr.map(([k, v]) => `<div class="b"><div><span>${esc(k)}</span><strong>${brl(v)}</strong></div><i style="width:${Math.max(4, v / mx * 100)}%"></i></div>`).join('')}</div>`; };
  return `<header class="top"><div><button class="more back" data-go="mais">‹ Mais</button><h1>Relatório</h1><p class="sub" style="text-transform:capitalize">${new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</p></div></header>
  <div class="sums">
    <div class="sum"><b>${brl(vendido)}</b><span>vendido (${doMes.length} ${doMes.length === 1 ? 'pedido' : 'pedidos'})</span></div>
    <div class="sum"><b>${brl(recebido)}</b><span>recebido no mês</span></div>
    <div class="sum"><b>${brl(receber)}</b><span>a receber (tudo)</span></div>
    <div class="sum"><b>${doMes.length ? brl(vendido / doMes.length) : brl(0)}</b><span>valor médio</span></div>
  </div>
  <h2>Preço praticado × tabela</h2>
  <div class="card" style="margin-top:0">
    <div class="kv"><span>Pela tabela seria</span><strong>${brl(tabela)}</strong></div>
    <div class="kv"><span>Descontos dados</span><strong style="color:var(--late)">${brl(abaixo)}</strong></div>
    <div class="kv"><span>Acréscimos cobrados</span><strong style="color:var(--go)">${brl(acima)}</strong></div>
    <div class="kv" style="border:0"><span>Resultado</span><strong style="color:${liquido < 0 ? 'var(--late)' : 'var(--go)'}">${liquido < 0 ? 'vendeu ' + brl(-liquido) + ' abaixo' : liquido > 0 ? 'vendeu ' + brl(liquido) + ' acima' : 'igual à tabela'}</strong></div>
    <p class="small muted" style="margin:6px 0 0">Conta só pedidos com produtos cadastrados.</p>
  </div>
  <h2>Vendas por grupo</h2>${bars(porGrupo)}
  <h2>O que mais sai</h2>${bars(porProduto)}
  <h2>Clientes que mais compram</h2>${bars(porCliente)}`;
}

function render() {
  if (!S.neg) return;
  document.body.classList.remove('sem-nav');
  const v = voc();
  $$('[data-voc="plural"]').forEach(e => e.textContent = v.pl);
  $('#fab').setAttribute('aria-label', 'Novo ' + v.p.toLowerCase());
  const navTab = ['clientes', 'produtos', 'relatorio'].includes(tab) ? 'mais' : tab;
  $$('nav.bar [data-tab]').forEach(b => { if (b.dataset.tab === navTab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const nNovos = S.pedidos.filter(p => p.status === 'solicitado').length;
  const dot = $('#dotNovos'); if (dot) dot.hidden = !nNovos;
  $('#app').innerHTML = { hoje: telaHoje, pedidos: telaPedidos, agenda: telaAgenda, mais: telaMais, clientes: telaClientes, produtos: telaProdutos, relatorio: telaRelatorio }[tab]();
  bindTickets();
  $$('[data-go]').forEach(b => b.onclick = () => b.dataset.go === 'ajustes' ? abrirAjustes() : go(b.dataset.go));
  if (tab === 'hoje') {
    $('#ajustes').onclick = abrirAjustes;
    const al = alertas(); $$('[data-al]').forEach(b => b.onclick = () => { const a = al[+b.dataset.al]; if (a.lista.length === 1 && !a.cobrar) abrirPedido(a.lista[0].id); else abrirFila(a); });
  }
  if (tab === 'pedidos') $$('[data-f]').forEach(b => b.onclick = () => { filtro = b.dataset.f; render(); });
  if (tab === 'agenda') {
    const muda = async d => { const n = Math.max(1, Math.min(50, S.neg.limite + d)); if (n === S.neg.limite) return; S.neg.limite = n; render(); await tenta(() => DB.salvarNegocio(S.neg)).catch(() => {}); };
    $('#menos').onclick = () => muda(-1); $('#mais').onclick = () => muda(1);
    $('#mPrev').onclick = () => { mesAg = addMonths(mesAg + '-01', -1).slice(0, 7); render(); };
    $('#mNext').onclick = () => { mesAg = addMonths(mesAg + '-01', 1).slice(0, 7); render(); };
    $$('[data-day]').forEach(b => b.onclick = () => abrirDia(b.dataset.day));
    $('#link').onclick = () => copiar(linkAgenda(), 'Link copiado. Cole na bio do Instagram ou no WhatsApp.');
  }
  if (tab === 'mais') $('#mLink').onclick = () => copiar(linkAgenda(), 'Link copiado. Cole na bio do Instagram ou no WhatsApp.');
  if (tab === 'clientes') {
    $('#cNovo').onclick = () => abrirCliente(null);
    $$('[data-cli]').forEach(b => b.onclick = () => abrirCliente(b.dataset.cli));
    const inp = $('#cBusca'); inp.oninput = () => { buscaCli = inp.value; const pos = inp.selectionStart; render(); const n = $('#cBusca'); n.focus(); n.setSelectionRange(pos, pos); };
  }
  if (tab === 'produtos') { $('#pNovo').onclick = () => abrirProduto(null); $$('[data-prod]').forEach(b => b.onclick = () => abrirProduto(b.dataset.prod)); }
}
function go(t) { tab = t; render(); window.scrollTo(0, 0); }

/* ---------- folha (sheet) ---------- */
function abrir(html) { $('#sheetBody').innerHTML = html; $('#sheet').classList.add('open'); $('#sheetBg').classList.add('open'); $('#sheet').scrollTop = 0; }
function fechar() { $('#sheet').classList.remove('open'); $('#sheetBg').classList.remove('open'); }

/* =========================================================
   Formulário de pedido (novo, editar, revisar pedido da agenda)
   ========================================================= */
function abrirFormPedido(ped = null, opts = {}) {
  const v = voc(), rec = S.neg.seg === 'servico', aceitar = !!opts.aceitar;
  const st = {
    cli: ped ? (cliDe(ped) || null) : (opts.cliente || null),
    itens: ped ? ped.itens.map(i => ({ ...i })) : [],
    dirtySob: false
  };
  const nomeIni = ped && !st.cli ? ped.cliente : '';
  const titulo = aceitar ? `Revisar pedido #${noPad(ped.no)}` : ped ? `Editar #${noPad(ped.no)}` : `Novo ${v.p.toLowerCase()}`;
  const ajusteIni = ped ? (ped.ajuste || 0) : 0;
  const sinalIni = ped ? (aceitar && !ped.sinal ? '' : String(ped.sinal).replace('.', ',')) : '';
  abrir(`<h1 style="font-size:24px">${titulo}</h1>
  ${aceitar ? '<p class="sub">Confira os itens e o preço. Se quiser, dê desconto ou ajuste antes de aceitar.</p>' : '<p class="sub">Escolha o cliente e os produtos. O resto é opcional.</p>'}

  <label class="f">Cliente</label>
  <div id="fCliBox"></div>

  <label class="f">Produtos</label>
  <div id="fItens"></div>
  <div class="busca-prod">
    <input class="t" id="fBusca" placeholder="Buscar ou cadastrar produto" autocomplete="off">
    <button class="btn ghost mini" id="fCardapio" type="button">Ver cardápio</button>
  </div>
  <div id="fRes"></div>
  <div id="fLivre">
    <p class="small muted" style="margin:8px 0 0">Sem produto cadastrado? Descreva e informe o valor:</p>
    <div class="two"><div><input class="t" id="fDesc" placeholder="${esc(v.ex)}" value="${ped && !ped.itens.length ? esc(ped.desc) : ''}"></div>
    <div><input class="t" id="fValor" inputmode="decimal" placeholder="Valor R$" value="${ped && !ped.itens.length ? String(ped.valor).replace('.', ',') : ''}"></div></div>
  </div>

  <div id="fAjusteBox">
    <label class="f">Desconto ou acréscimo no total <em>(opcional)</em></label>
    <div class="two"><select class="t" id="fAjTipo"><option value="-1" ${ajusteIni < 0 ? 'selected' : ''}>Desconto</option><option value="1" ${ajusteIni > 0 ? 'selected' : ''}>Acréscimo</option></select>
    <input class="t" id="fAjVal" inputmode="decimal" placeholder="R$ 0,00" value="${ajusteIni ? String(Math.abs(ajusteIni)).replace('.', ',') : ''}"></div>
  </div>
  <div id="fTotais" class="totais"></div>

  <div class="two"><div><label class="f" for="fData">Entrega <em>(opcional)</em></label><input class="t" id="fData" type="date" value="${ped ? ped.data : (opts.data || '')}"></div>
  <div><label class="f" for="fVenc">Pagar até</label><input class="t" id="fVenc" type="date" value="${ped ? (ped.venc || '') : (opts.data || '')}"></div></div>
  <div id="fWarn"></div>
  <label class="f" for="fSinal">Sinal (R$) <em>— vazio = metade; 0 = sem sinal</em></label><input class="t" id="fSinal" inputmode="decimal" value="${sinalIni}">
  ${rec ? `<label class="f" for="fRep">Repetir</label><select class="t" id="fRep"><option value="">Não repete</option><option value="semanal" ${ped?.repetir === 'semanal' ? 'selected' : ''}>Toda semana</option><option value="mensal" ${ped?.repetir === 'mensal' ? 'selected' : ''}>Todo mês</option></select>` : ''}
  <label class="f" for="fObs">Observação <em>(${esc(v.extra.toLowerCase())})</em></label><textarea class="t" id="fObs">${esc(ped?.obs || '')}</textarea>
  <button class="btn go" id="fSalvar">${aceitar ? 'Aceitar pedido' : ped ? 'Salvar alterações' : 'Salvar ' + v.p.toLowerCase()}</button>
  ${!ped ? '<p class="small muted" style="text-align:center">Sem data de entrega, vira venda avulsa (produto pronto).</p>' : ''}`);

  /* ----- cliente ----- */
  function renderCli() {
    const box = $('#fCliBox');
    if (st.cli) {
      box.innerHTML = `<div class="sel-card">${'<span class="avatar">' + esc(st.cli.nome.charAt(0).toUpperCase()) + '</span>'}
        <span class="grow"><strong>${esc(nomeCompleto(st.cli))}</strong><br><span class="small muted">${st.cli.whats ? fmtTel(st.cli.whats) : 'sem WhatsApp'}${st.cli.endereco ? ' · ' + esc(st.cli.endereco) : ''}</span></span>
        <button class="more" id="fTrocaCli" type="button">Trocar</button></div>`;
      $('#fTrocaCli').onclick = () => { st.cli = null; renderCli(); $('#fCli').focus(); };
      return;
    }
    box.innerHTML = `<input class="t" id="fCli" placeholder="Nome do cliente" autocomplete="off" value="${esc(nomeIni)}">
      <div id="fCliSug"></div>
      <div id="fCliNovo" hidden>
        <p class="novo-tag">Cliente novo: vai ser cadastrado ao salvar</p>
        <div class="two"><div><label class="f" for="fSob">Sobrenome</label><input class="t" id="fSob"></div>
        <div><label class="f" for="fWa">WhatsApp</label><input class="t" id="fWa" inputmode="tel" placeholder="61 99999-0000"></div></div>
        <label class="f" for="fEnd">Endereço <em>(opcional)</em></label><input class="t" id="fEnd">
      </div>`;
    const inp = $('#fCli');
    $('#fSob').oninput = () => st.dirtySob = true;
    const atualiza = () => {
      const txt = inp.value.trim(), q = norm(txt);
      const achados = q ? S.clientes.filter(c => norm(nomeCompleto(c) + ' ' + c.whats).includes(q)).slice(0, 6) : [];
      const exato = achados.some(c => norm(nomeCompleto(c)) === q || norm(c.nome) === q);
      $('#fCliSug').innerHTML = achados.map(c => `<button type="button" class="sug" data-c="${c.id}"><strong>${esc(nomeCompleto(c))}</strong> <span class="small muted">${c.whats ? fmtTel(c.whats) : ''}</span></button>`).join('');
      $$('#fCliSug [data-c]').forEach(b => b.onclick = () => { st.cli = S.clientes.find(c => c.id === b.dataset.c); renderCli(); });
      const novo = !!txt && !exato;
      $('#fCliNovo').hidden = !novo;
      if (novo && !st.dirtySob) { const partes = txt.split(/\s+/); $('#fSob').value = partes.slice(1).join(' '); }
    };
    inp.oninput = atualiza; atualiza();
    if (ped && !st.cli && ped.tel) $('#fWa').value = ped.tel;
  }

  /* ----- itens ----- */
  function renderItens() {
    const box = $('#fItens');
    box.innerHTML = st.itens.map((i, k) => {
      const prod = S.produtos.find(p => p.id === i.produtoId);
      return `<div class="item" data-i="${k}">
        ${thumb(prod?.foto, i.desc, 44)}
        <div class="grow"><strong>${esc(i.desc)}</strong><span class="small muted"> · tabela ${precoUn(i.precoTab, i.un)}</span>
          <div class="item-in">
            <label><span class="small muted">Qtd (${(UNIDADES[i.un] || UNIDADES.un).curto})</span><input class="t" inputmode="decimal" data-q="${k}" value="${numBR(i.qtd)}"></label>
            <label><span class="small muted">Preço por ${(UNIDADES[i.un] || UNIDADES.un).curto}</span><input class="t" inputmode="decimal" data-p="${k}" value="${i.preco.toFixed(2).replace('.', ',')}"></label>
          </div>
          <div class="item-tot" id="it${k}"></div>
        </div>
        <button class="x" type="button" data-rm="${k}" aria-label="Tirar">×</button></div>`;
    }).join('');
    st.itens.forEach((_, k) => atualizaLinha(k));
    $$('#fItens [data-q]').forEach(e => e.oninput = () => { st.itens[+e.dataset.q].qtd = num(e.value); atualizaLinha(+e.dataset.q); renderTotais(); });
    $$('#fItens [data-p]').forEach(e => e.oninput = () => { st.itens[+e.dataset.p].preco = num(e.value); atualizaLinha(+e.dataset.p); renderTotais(); });
    $$('#fItens [data-rm]').forEach(b => b.onclick = () => { st.itens.splice(+b.dataset.rm, 1); renderItens(); renderTotais(); });
    $('#fLivre').hidden = st.itens.length > 0;
    $('#fAjusteBox').hidden = st.itens.length === 0;
  }
  function atualizaLinha(k) {
    const i = st.itens[k], el = $('#it' + k); if (!el) return;
    const sub = r2(i.qtd * i.preco), dif = r2(i.qtd * (i.preco - i.precoTab));
    el.innerHTML = `<strong>${brl(sub)}</strong> ${dif < 0 ? `<span class="badge late">${brl(dif)} desconto</span>` : dif > 0 ? `<span class="badge go">+${brl(dif)} acréscimo</span>` : ''}`;
  }
  function addItem(p) {
    const ex = st.itens.find(i => i.produtoId === p.id);
    if (ex) ex.qtd = r2(ex.qtd + (UNIDADES[p.un] || UNIDADES.un).passo);
    else st.itens.push({ produtoId: p.id, desc: p.nome, un: p.un, qtd: 1, precoTab: p.preco, preco: p.preco });
    $('#fBusca').value = ''; $('#fRes').innerHTML = '';
    renderItens(); renderTotais();
    toast(p.nome + ' adicionado');
  }

  /* ----- busca e cadastro rápido de produto ----- */
  function listaProdutos(lista) {
    return `<div class="pick">${lista.map(p => `<button type="button" class="pick-item" data-add="${p.id}">${thumb(p.foto, p.nome, 48)}<span class="grow"><strong>${esc(p.nome)}</strong><br><span class="small muted">${p.grupo ? esc(p.grupo) + (p.subgrupo ? ' › ' + esc(p.subgrupo) : '') + ' · ' : ''}${precoUn(p.preco, p.un)}</span></span><span class="plus">＋</span></button>`).join('')}</div>`;
  }
  function bindPick() { $$('#fRes [data-add]').forEach(b => b.onclick = () => addItem(S.produtos.find(p => p.id === b.dataset.add))); }
  function busca() {
    const txt = $('#fBusca').value.trim(), q = norm(txt);
    if (!q) { $('#fRes').innerHTML = ''; return; }
    const achados = S.produtos.filter(p => p.ativo && norm(p.nome + ' ' + p.grupo + ' ' + p.subgrupo).includes(q)).slice(0, 8);
    const exato = achados.some(p => norm(p.nome) === q);
    $('#fRes').innerHTML = listaProdutos(achados) + (!exato ? `<button type="button" class="sug novo" id="fCriaProd">＋ Cadastrar produto “${esc(txt)}”</button><div id="fNovoProd"></div>` : '');
    bindPick();
    if ($('#fCriaProd')) $('#fCriaProd').onclick = () => formRapidoProduto(txt);
  }
  function formRapidoProduto(nome) {
    $('#fCriaProd').remove();
    const grupos = [...new Set(S.produtos.map(p => p.grupo).filter(Boolean))];
    $('#fNovoProd').innerHTML = `<div class="card" style="margin-top:8px">
      <p class="novo-tag" style="margin-top:0">Produto novo: “${esc(nome)}”</p>
      <div class="two"><div><label class="f" for="npUn">Unidade</label><select class="t" id="npUn">${Object.entries(UNIDADES).map(([k, u]) => `<option value="${k}">${u.nome}</option>`).join('')}</select></div>
      <div><label class="f" for="npPreco">Preço</label><input class="t" id="npPreco" inputmode="decimal" placeholder="0,00"></div></div>
      <div class="two"><div><label class="f" for="npGrupo">Grupo</label><input class="t" id="npGrupo" list="npGrupos" placeholder="Ex.: Bolos"><datalist id="npGrupos">${grupos.map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>
      <div><label class="f" for="npSub">Subgrupo</label><input class="t" id="npSub" placeholder="Ex.: Festa"></div></div>
      <p class="small muted">A foto você coloca depois em Mais › Produtos.</p>
      <button class="btn go" type="button" id="npOk">Cadastrar e adicionar</button></div>`;
    $('#npPreco').focus();
    $('#npOk').onclick = async () => {
      const preco = num($('#npPreco').value);
      await tenta(async () => {
        const p = await DB.salvarProduto({ nome, un: $('#npUn').value, preco, grupo: $('#npGrupo').value.trim(), subgrupo: $('#npSub').value.trim(), ativo: true, cardapio: true });
        S.produtos.push(p); addItem(p); toast('Produto cadastrado');
      }, $('#npOk')).catch(() => {});
    };
  }
  $('#fBusca').oninput = busca;
  $('#fCardapio').onclick = () => {
    if ($('#fRes').dataset.cardapio === '1') { $('#fRes').innerHTML = ''; $('#fRes').dataset.cardapio = ''; return; }
    const ativos = S.produtos.filter(p => p.ativo);
    $('#fRes').dataset.cardapio = '1';
    $('#fRes').innerHTML = ativos.length ? `<div class="grid-card">${ativos.map(p => `<button type="button" class="gcard" data-add="${p.id}">${p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy">` : `<span class="gph">${thumb('', p.nome, 64)}</span>`}<span class="gname">${esc(p.nome)}</span><span class="small muted">${precoUn(p.preco, p.un)}</span></button>`).join('')}</div>` : '<p class="small muted">Nenhum produto ainda. Digite um nome acima para cadastrar.</p>';
    bindPick();
  };

  /* ----- totais ----- */
  const ajusteAtual = () => st.itens.length ? r2(num($('#fAjVal').value) * Number($('#fAjTipo').value)) : 0;
  const totalAtual = () => st.itens.length ? r2(totItens(st.itens) + ajusteAtual()) : num($('#fValor').value);
  function renderTotais() {
    if (!st.itens.length) { $('#fTotais').innerHTML = ''; return; }
    const tab = totTabela(st.itens), tot = totalAtual(), dif = r2(tot - tab);
    $('#fTotais').innerHTML = `
      <div class="kv"><span>Pela tabela</span><span>${brl(tab)}</span></div>
      ${dif ? `<div class="kv"><span>${dif < 0 ? 'Desconto total' : 'Acréscimo total'}</span><strong style="color:${dif < 0 ? 'var(--late)' : 'var(--go)'}">${dif < 0 ? '' : '+'}${brl(dif)}</strong></div>` : ''}
      <div class="kv big"><span>Total</span><strong>${brl(tot)}</strong></div>`;
  }
  $('#fAjVal').oninput = renderTotais; $('#fAjTipo').onchange = renderTotais;

  /* ----- data / avisos ----- */
  const chk = () => {
    const d = $('#fData').value; let w = '';
    const outros = d ? S.pedidos.filter(p => ativo(p) && p.data === d && (!ped || p.id !== ped.id)).length : 0;
    if (d) { if (S.bloqueios.includes(d)) w = 'Esse dia está marcado como folga.'; else if (outros >= S.neg.limite) w = `Esse dia já tem ${outros} de ${S.neg.limite}. Vai aceitar mesmo assim?`; }
    $('#fWarn').innerHTML = w ? `<div class="warn">${w}</div>` : '';
  };
  let vencMexido = !!(ped && ped.venc && ped.venc !== ped.data);
  $('#fVenc').oninput = () => vencMexido = true;
  $('#fData').onchange = () => { if (!vencMexido) $('#fVenc').value = $('#fData').value; chk(); };
  chk();

  renderCli(); renderItens(); renderTotais();

  /* ----- salvar ----- */
  $('#fSalvar').onclick = async () => {
    let cli = st.cli, novoCli = null;
    if (!cli) {
      const txt = ($('#fCli') ? $('#fCli').value : '').trim();
      if (!txt) { toast('Escolha ou digite o cliente.'); $('#fCli')?.focus(); return; }
      if (!$('#fCliNovo').hidden) {
        const partes = txt.split(/\s+/);
        novoCli = { nome: partes[0], sobrenome: $('#fSob').value.trim(), whats: $('#fWa').value.replace(/\D/g, ''), endereco: $('#fEnd').value.trim() };
      } else { cli = S.clientes.find(c => norm(nomeCompleto(c)) === norm(txt) || norm(c.nome) === norm(txt)); }
    }
    const itens = st.itens.filter(i => i.qtd > 0);
    if (st.itens.some(i => !(i.qtd > 0))) { toast('Tem item com quantidade zerada.'); return; }
    const descLivre = $('#fDesc').value.trim();
    if (!itens.length && (!descLivre || !num($('#fValor').value))) { toast('Adicione um produto, ou descreva e informe o valor.'); return; }
    const total = totalAtual();
    if (total < 0) { toast('O desconto ficou maior que o total.'); return; }
    const data = $('#fData').value, vencimento = $('#fVenc').value || data;
    const sTxt = $('#fSinal').value.trim();
    const sinal = sTxt !== '' ? num(sTxt) : (data ? r2(total / 2) : 0);
    let status;
    if (ped && !aceitar) status = ped.status;
    else status = data ? (sinal > 0 ? 'aguardando' : 'confirmado') : 'entregue';
    if (ped && !aceitar && ped.status === 'aguardando' && pago(ped) >= sinal) status = 'confirmado';

    await tenta(async () => {
      if (novoCli) { cli = await DB.salvarCliente(novoCli); S.clientes.push(cli); }
      const dados = {
        clienteId: cli ? cli.id : '', cliente: cli ? nomeCompleto(cli) : (ped ? ped.cliente : ''), tel: cli ? cli.whats : (ped ? ped.tel : ''),
        desc: itens.length ? resumoItens(itens).slice(0, 200) : descLivre, valor: total, ajuste: itens.length ? ajusteAtual() : 0,
        sinal, data, venc: vencimento, status, obs: $('#fObs').value.trim(), repetir: $('#fRep') ? $('#fRep').value : (ped?.repetir || ''),
        origem: ped ? ped.origem : 'app'
      };
      const salvo = await DB.salvarPedido(ped ? ped.id : null, dados, itens);
      if (ped) { const i = S.pedidos.findIndex(x => x.id === ped.id); S.pedidos[i] = { ...salvo, pagamentos: ped.pagamentos }; }
      else S.pedidos.push(salvo);
      render(); abrirPedido(salvo.id, { recemCriado: !ped || aceitar });
      toast(aceitar ? 'Pedido aceito. Avise o cliente.' : ped ? 'Alterações salvas' : `#${noPad(salvo.no)} salvo`);
    }, $('#fSalvar')).catch(() => {});
  };
  if (!ped && !opts.cliente) setTimeout(() => { const e = $('#fCli'); if (e) e.focus(); }, 250);
}

/* ---------- mensagens ---------- */
function msgPedido(p) {
  const c = cliDe(p), link = linkCliente(c);
  const linhas = [`Oi, ${(c ? c.nome : p.cliente.split(' ')[0])}! Aqui é da ${S.neg.nome}.`, `Seu pedido #${noPad(p.no)}:`];
  if (p.itens.length) p.itens.forEach(i => linhas.push(`• ${fmtQtd(i.qtd, i.un)} ${i.desc} — ${brl(r2(i.qtd * i.preco))}`));
  else linhas.push(`• ${p.desc}`);
  if (p.itens.length && p.ajuste) linhas.push(`${p.ajuste < 0 ? 'Desconto' : 'Acréscimo'}: ${brl(Math.abs(p.ajuste))}`);
  linhas.push(`Total: ${brl(p.valor)}`);
  if (p.data) linhas.push(`Entrega: ${fmtD(p.data)}`);
  if (c && c.endereco) linhas.push(`Endereço: ${c.endereco}`);
  const pg = pago(p);
  if (p.sinal > pg && p.status === 'aguardando') linhas.push(`Para confirmar a data, o sinal é de ${brl(p.sinal - pg)}.`);
  else if (saldo(p) > 0) linhas.push(`Falta pagar: ${brl(saldo(p))}${venc(p) ? ' até ' + fmtD(venc(p)) : ''}.`);
  else linhas.push('Está tudo pago. Obrigada!');
  if (saldo(p) > 0 && S.neg.pix) linhas.push(`Pix: ${S.neg.pix}`);
  if (p.obs) linhas.push(`Obs.: ${p.obs}`);
  if (link) linhas.push('', `Acompanhe seus pedidos: ${link}`);
  return linhas.join('\n');
}
function msgCobranca(p) {
  const c = cliDe(p), s = saldo(p), pg = pago(p);
  let linha;
  if (p.status === 'aguardando' && p.sinal > pg) linha = `Para garantir a data, o sinal é de ${brl(p.sinal - pg)}.\n`;
  else if (s > 0) linha = `Falta pagar ${brl(s)}${atrasado(p) ? ' (venceu ' + fmtD(venc(p)) + ')' : ''}.\n`;
  else linha = 'Está tudo pago, obrigada!\n';
  const rep = {
    '{cliente}': c ? c.nome : p.cliente.split(' ')[0], '{negocio}': S.neg.nome, '{numero}': noPad(p.no),
    '{descricao}': p.itens.length ? resumoItens(p.itens) : p.desc, '{itens}': p.itens.length ? resumoItens(p.itens) : p.desc,
    '{data}': p.data ? fmtD(p.data) : 'hoje', '{vencimento}': venc(p) ? fmtD(venc(p)) : 'hoje', '{valor}': brl(p.valor),
    '{pago}': brl(pg), '{falta}': brl(s), '{linha_sinal}': linha, '{pix}': S.neg.pix || '', '{endereco}': c?.endereco || '',
    '{link}': linkCliente(c) || ''
  };
  let txt = S.neg.texto || TEXTO_PADRAO;
  for (const k in rep) txt = txt.split(k).join(rep[k]);
  return txt.replace(/\n?Acompanhe seus pedidos: *$/, '').trim();
}
function msgRecusa(p) {
  const c = cliDe(p);
  return `Oi, ${c ? c.nome : p.cliente.split(' ')[0]}! Aqui é da ${S.neg.nome}. Recebi seu pedido #${noPad(p.no)} para ${fmtD(p.data)}, mas infelizmente não consigo atender nessa data. Posso te sugerir outro dia?`;
}

/* ---------- detalhe do pedido ---------- */
function abrirPedido(id, opts = {}) {
  const p = S.pedidos.find(x => String(x.id) === String(id)); if (!p) return;
  const v = voc(), idx = STATUS.findIndex(s => s[0] === p.status), c = cliDe(p), tel = telCliente(p);
  const steps = STATUS.map((s, i) => `<button data-st="${s[0]}" class="${p.status === s[0] ? 'on' : (i < idx ? 'done' : '')}">${s[1]}</button>`).join('');
  const sugerido = (p.status === 'aguardando' && p.sinal > pago(p)) ? p.sinal - pago(p) : saldo(p);
  const dif = difPedido(p);
  abrir(`<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
    <h1 style="font-size:26px">#${noPad(p.no)}</h1>${p.status === 'solicitado' ? '<span class="badge rose">Pedido novo</span>' : quitado(p) ? '<span class="badge go">Pago</span>' : (atrasado(p) ? '<span class="badge late">Atrasado</span>' : '')}</div>
  <button class="cli-link" ${c ? `data-vercli="${c.id}"` : 'disabled'}><strong>${esc(nomeCliente(p))}</strong>${tel ? ' · ' + fmtTel(tel) : ''}${c && c.endereco ? '<br><span class="small muted">' + esc(c.endereco) + '</span>' : ''}</button>
  <p class="sub">${p.data ? 'Entrega ' + fmtD(p.data) : 'Venda avulsa'}${venc(p) && aceito(p) ? ' · pagar até ' + fmtD(venc(p)) : ''}</p>
  ${p.status === 'solicitado' ? `<div class="warn" style="background:var(--rose-soft);color:var(--ink)">Este pedido foi feito pelo cliente no link do cardápio. Revise, ajuste se precisar e aceite, ou recuse.</div>
     <button class="btn go" id="pAceitar">Revisar e aceitar</button><button class="btn danger" id="pRecusar">Recusar</button>`
    : p.status === 'cancelado' ? '<p class="warn">Cancelado</p>' : `<div class="steps">${steps}</div>`}
  ${p.itens.length ? `<div class="itens-lista">${p.itens.map(i => { const d = r2(i.qtd * (i.preco - i.precoTab)); return `<div class="kv"><span>${fmtQtd(i.qtd, i.un)} ${esc(i.desc)}<br><span class="small muted">${precoUn(i.preco, i.un)}${d ? ` · <span style="color:${d < 0 ? 'var(--late)' : 'var(--go)'}">${d < 0 ? '' : '+'}${brl(d)} da tabela</span>` : ''}</span></span><span>${brl(r2(i.qtd * i.preco))}</span></div>`; }).join('')}
     ${p.ajuste ? `<div class="kv"><span>${p.ajuste < 0 ? 'Desconto' : 'Acréscimo'} no total</span><span>${brl(p.ajuste)}</span></div>` : ''}</div>`
    : `<p style="margin:10px 0 0">${esc(p.desc)}</p>`}
  <div class="kv big"><span>Total</span><strong>${brl(p.valor)}</strong></div>
  ${dif ? `<p class="small" style="margin:2px 0 6px;color:${dif < 0 ? 'var(--late)' : 'var(--go)'}">${dif < 0 ? brl(-dif) + ' abaixo da tabela' : brl(dif) + ' acima da tabela'}</p>` : ''}
  ${p.sinal ? `<div class="kv"><span>Sinal combinado</span><span>${brl(p.sinal)}</span></div>` : ''}
  <div class="kv"><span>Já pago</span><span>${brl(pago(p))}</span></div>
  <div class="kv"><span>Falta</span><strong style="color:${saldo(p) ? 'var(--late)' : 'var(--go)'}">${brl(saldo(p))}</strong></div>
  ${p.obs ? `<p class="small" style="margin-top:8px"><strong>Obs.:</strong> ${esc(p.obs)}</p>` : ''}
  ${p.pagamentos.length ? `<p class="small muted" style="margin-top:8px">${p.pagamentos.map(x => `${brl(x.v)} em ${fmtD(x.d)} (${esc(x.f)})`).join('<br>')}</p>` : ''}

  ${p.status !== 'solicitado' && p.status !== 'cancelado' ? `
  ${opts.recemCriado ? '<div class="dica">Próximo passo: envie o pedido para o cliente conferir.</div>' : ''}
  <div class="two">
    <a class="btn wa" href="${waLinkTel(tel, msgPedido(p))}" target="_blank" rel="noopener" id="pEnviar">Enviar pedido</a>
    <a class="btn wa" href="${waLinkTel(tel, msgCobranca(p))}" target="_blank" rel="noopener" id="pCobrar" ${quitado(p) ? 'aria-disabled="true" style="opacity:.5"' : ''}>Cobrar</a>
  </div>
  ${!tel ? '<p class="small muted">Sem WhatsApp do cliente: você escolhe o contato quando o WhatsApp abrir.</p>' : ''}
  <details class="prev"><summary>Ver as mensagens</summary><p class="small muted">Pedido</p><div class="msg">${esc(msgPedido(p))}</div><p class="small muted">Cobrança</p><div class="msg">${esc(msgCobranca(p))}</div></details>
  ${saldo(p) > 0 ? `<div class="two" style="align-items:end"><div><label class="f" for="pgV">Recebi (R$)</label><input class="t" id="pgV" inputmode="decimal" value="${sugerido.toFixed(2).replace('.', ',')}"></div>
    <div><label class="f" for="pgF">Como</label><select class="t" id="pgF"><option>Pix</option><option>Dinheiro</option><option>Cartão</option></select></div></div>
    <button class="btn go" id="pgOk">Registrar pagamento</button>` : ''}
  <button class="btn ghost" id="pEditar">Editar pedido</button>
  <button class="btn danger" id="pCancel">Cancelar ${v.p.toLowerCase()}</button>` : ''}`);

  if ($('[data-vercli]')) $('[data-vercli]').onclick = () => abrirCliente(c.id);
  if ($('#pCobrar')) $('#pCobrar').addEventListener('click', () => cobrados.marcar(p.id));
  if ($('#pAceitar')) $('#pAceitar').onclick = () => abrirFormPedido(p, { aceitar: true });
  if ($('#pRecusar')) $('#pRecusar').onclick = async () => {
    if (!confirm('Recusar este pedido? A data fica livre de novo.')) return;
    await tenta(async () => {
      await DB.atualizarPedido(p.id, { status: 'cancelado' }); p.status = 'cancelado'; render();
      abrir(`<h1 style="font-size:24px">Pedido recusado</h1><p class="sub">Avise o cliente com educação. A mensagem já está pronta.</p>
        <div class="msg">${esc(msgRecusa(p))}</div>
        <a class="btn wa" href="${waLinkTel(telCliente(p), msgRecusa(p))}" target="_blank" rel="noopener">Avisar no WhatsApp</a>`);
    }, $('#pRecusar')).catch(() => {});
  };
  $$('[data-st]').forEach(b => b.onclick = async () => {
    const novo = b.dataset.st; if (novo === p.status) return;
    const virouEntregue = novo === 'entregue' && p.status !== 'entregue';
    await tenta(async () => {
      await DB.atualizarPedido(p.id, { status: novo }); p.status = novo;
      if (virouEntregue && p.repetir && p.data) {
        const nd = p.repetir === 'semanal' ? addDays(p.data, 7) : addMonths(p.data, 1);
        const dados = { clienteId: p.clienteId, cliente: p.cliente, tel: p.tel, desc: p.desc, valor: p.valor, ajuste: p.ajuste, sinal: p.sinal, data: nd, venc: nd, status: 'confirmado', obs: p.obs, repetir: p.repetir, origem: 'app' };
        const prox = await DB.salvarPedido(null, dados, p.itens.map(({ id, ...i }) => i));
        S.pedidos.push(prox); toast(`Próxima ${v.p.toLowerCase()} criada para ${fmtD(nd)}`);
      }
      render(); abrirPedido(p.id);
    }, b).catch(() => {});
  });
  if ($('#pgOk')) $('#pgOk').onclick = async () => {
    const val = num($('#pgV').value); if (!val) return;
    await tenta(async () => {
      const pg = await DB.registrarPagamento(p.id, { v: val, d: today(), f: $('#pgF').value });
      p.pagamentos.push(pg);
      if (p.status === 'aguardando' && pago(p) >= p.sinal) { await DB.atualizarPedido(p.id, { status: 'confirmado' }); p.status = 'confirmado'; }
      render(); abrirPedido(p.id); toast(quitado(p) ? 'Tudo pago' : 'Pagamento registrado');
    }, $('#pgOk')).catch(() => {});
  };
  if ($('#pEditar')) $('#pEditar').onclick = () => abrirFormPedido(p);
  if ($('#pCancel')) $('#pCancel').onclick = async () => {
    if (!confirm('Cancelar este pedido?')) return;
    await tenta(async () => { await DB.atualizarPedido(p.id, { status: 'cancelado' }); p.status = 'cancelado'; render(); fechar(); toast('Cancelado'); }).catch(() => {});
  };
}

/* ---------- cliente ---------- */
function abrirCliente(id) {
  const c = id ? S.clientes.find(x => x.id === id) : null;
  const ps = c ? S.pedidos.filter(p => p.clienteId === c.id).sort((a, b) => b.no - a.no) : [];
  const deve = ps.filter(aceito).reduce((a, p) => a + saldo(p), 0);
  const link = linkCliente(c);
  abrir(`<h1 style="font-size:24px">${c ? esc(nomeCompleto(c)) : 'Novo cliente'}</h1>
  ${c && deve > 0 ? `<p class="warn">Deve ${brl(deve)} no total</p>` : ''}
  <div class="two"><div><label class="f" for="clNome">Nome</label><input class="t" id="clNome" value="${esc(c?.nome || '')}"></div>
  <div><label class="f" for="clSob">Sobrenome</label><input class="t" id="clSob" value="${esc(c?.sobrenome || '')}"></div></div>
  <label class="f" for="clWa">WhatsApp</label><input class="t" id="clWa" inputmode="tel" value="${esc(c?.whats ? fmtTel(c.whats) : '')}" placeholder="61 99999-0000">
  <label class="f" for="clEnd">Endereço</label><input class="t" id="clEnd" value="${esc(c?.endereco || '')}">
  <label class="f" for="clObs">Observação</label><textarea class="t" id="clObs">${esc(c?.obs || '')}</textarea>
  <button class="btn go" id="clOk">${c ? 'Salvar cliente' : 'Cadastrar cliente'}</button>
  ${c ? `<button class="btn ghost" id="clPed">Novo pedido para ${esc(c.nome)}</button>
    ${link ? `<a class="btn wa" href="${waLinkTel(c.whats, `Oi, ${c.nome}! Aqui é da ${S.neg.nome}. Por este link você acompanha seus pedidos e faz novos quando quiser: ${link}`)}" target="_blank" rel="noopener">Mandar link "Meus pedidos"</a>` : ''}
    <h2>Histórico (${ps.length})</h2>${ps.length ? ps.map(ticket).join('') : '<div class="empty">Ainda sem pedidos.</div>'}` : ''}`);
  bindTickets($('#sheetBody'));
  $('#clOk').onclick = async () => {
    const dados = { id: c?.id, nome: $('#clNome').value.trim(), sobrenome: $('#clSob').value.trim(), whats: $('#clWa').value.replace(/\D/g, ''), endereco: $('#clEnd').value.trim(), obs: $('#clObs').value.trim() };
    if (!dados.nome) { toast('Digite o nome.'); return; }
    if (dados.whats && (dados.whats.length < 10 || dados.whats.length > 11)) { toast('WhatsApp com DDD, ex.: 61 99999-0000'); return; }
    await tenta(async () => {
      const salvo = await DB.salvarCliente(dados);
      if (c) Object.assign(c, salvo); else S.clientes.push(salvo);
      render(); abrirCliente(salvo.id); toast('Cliente salvo');
    }, $('#clOk')).catch(() => {});
  };
  if ($('#clPed')) $('#clPed').onclick = () => abrirFormPedido(null, { cliente: c });
}

/* ---------- produto ---------- */
function abrirProduto(id) {
  const p = id ? S.produtos.find(x => x.id === id) : null;
  let foto = p?.foto || '';
  const grupos = [...new Set(S.produtos.map(x => x.grupo).filter(Boolean))].sort();
  const subs = g => [...new Set(S.produtos.filter(x => x.grupo === g).map(x => x.subgrupo).filter(Boolean))].sort();
  abrir(`<h1 style="font-size:24px">${p ? 'Editar produto' : 'Novo produto'}</h1>
  <div class="foto-box">
    <div id="prFotoPrev">${foto ? `<img src="${esc(foto)}" alt="">` : thumb('', p?.nome || '?', 96)}</div>
    <div><label class="btn ghost mini" for="prFoto" style="margin:0">${foto ? 'Trocar foto' : 'Colocar foto'}</label>
      <input type="file" id="prFoto" accept="image/*" hidden>
      ${foto ? '<button class="more" id="prTiraFoto" type="button">Tirar foto</button>' : ''}
      <p class="small muted" style="margin:6px 0 0">Aparece no cardápio do cliente.</p></div>
  </div>
  <label class="f" for="prNome">Nome</label><input class="t" id="prNome" value="${esc(p?.nome || '')}" placeholder="Ex.: Bolo de chocolate">
  <div class="two"><div><label class="f" for="prGrupo">Grupo</label><input class="t" id="prGrupo" list="prGrupos" value="${esc(p?.grupo || '')}" placeholder="Ex.: Bolos"><datalist id="prGrupos">${grupos.map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>
  <div><label class="f" for="prSub">Subgrupo</label><input class="t" id="prSub" list="prSubs" value="${esc(p?.subgrupo || '')}" placeholder="Ex.: Festa"><datalist id="prSubs"></datalist></div></div>
  <div class="two"><div><label class="f" for="prUn">Unidade</label><select class="t" id="prUn">${Object.entries(UNIDADES).map(([k, u]) => `<option value="${k}" ${p?.un === k ? 'selected' : ''}>${u.nome}</option>`).join('')}</select></div>
  <div><label class="f" for="prPreco">Preço</label><input class="t" id="prPreco" inputmode="decimal" value="${p ? p.preco.toFixed(2).replace('.', ',') : ''}" placeholder="0,00"></div></div>
  <label class="check"><input type="checkbox" id="prCard" ${!p || p.cardapio ? 'checked' : ''}> Mostrar no cardápio para clientes</label>
  <label class="check"><input type="checkbox" id="prAtivo" ${!p || p.ativo ? 'checked' : ''}> Produto ativo <span class="small muted">(desmarque em vez de apagar)</span></label>
  <button class="btn go" id="prOk">${p ? 'Salvar produto' : 'Cadastrar produto'}</button>`);
  const atualizaSubs = () => $('#prSubs').innerHTML = subs($('#prGrupo').value.trim()).map(s => `<option value="${esc(s)}">`).join('');
  $('#prGrupo').oninput = atualizaSubs; atualizaSubs();
  $('#prFoto').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    $('#prFotoPrev').innerHTML = '<span class="small muted">Preparando foto…</span>';
    try {
      const blob = await reduzirFoto(f, DB.online ? 900 : 400, DB.online ? 0.8 : 0.7);
      foto = await DB.enviarFoto(S.neg.id, blob);
      $('#prFotoPrev').innerHTML = `<img src="${esc(foto)}" alt="">`;
    } catch (err) { $('#prFotoPrev').innerHTML = thumb('', p?.nome || '?', 96); toast('Não consegui enviar a foto: ' + err.message); }
  };
  if ($('#prTiraFoto')) $('#prTiraFoto').onclick = () => { foto = ''; $('#prFotoPrev').innerHTML = thumb('', p?.nome || '?', 96); };
  $('#prOk').onclick = async () => {
    const dados = { id: p?.id, nome: $('#prNome').value.trim(), grupo: $('#prGrupo').value.trim(), subgrupo: $('#prSub').value.trim(), un: $('#prUn').value, preco: num($('#prPreco').value), foto, cardapio: $('#prCard').checked, ativo: $('#prAtivo').checked };
    if (!dados.nome) { toast('Digite o nome do produto.'); return; }
    await tenta(async () => {
      const salvo = await DB.salvarProduto(dados);
      if (p) Object.assign(p, salvo); else S.produtos.push(salvo);
      render(); fechar(); toast('Produto salvo');
    }, $('#prOk')).catch(() => {});
  };
}

/* ---------- dia da agenda ---------- */
function abrirDia(ds) {
  const lista = S.pedidos.filter(p => ativo(p) && p.data === ds), bl = S.bloqueios.includes(ds);
  abrir(`<h1 style="font-size:24px">${fmtD(ds)}</h1>
  <p class="sub">${bl ? 'Marcado como folga' : `${lista.length} de ${S.neg.limite} ocupados`}</p>
  ${lista.map(ticket).join('') || '<div class="empty" style="margin-top:12px">Dia livre.</div>'}
  ${!bl && ds >= today() ? `<button class="btn go" id="dNovo">Novo ${voc().p.toLowerCase()} neste dia</button>` : ''}
  <button class="btn ghost" id="dBloq">${bl ? 'Desbloquear dia' : 'Bloquear dia (folga)'}</button>`);
  bindTickets($('#sheetBody'));
  if ($('#dNovo')) $('#dNovo').onclick = () => abrirFormPedido(null, { data: ds });
  $('#dBloq').onclick = async () => {
    await tenta(async () => {
      await DB.bloquear(ds, !bl);
      S.bloqueios = bl ? S.bloqueios.filter(x => x !== ds) : [...S.bloqueios, ds];
      render(); fechar(); toast(bl ? 'Dia liberado' : 'Dia bloqueado');
    }, $('#dBloq')).catch(() => {});
  };
}

/* ---------- ajustes ---------- */
function abrirAjustes() {
  abrir(`<h1 style="font-size:24px">Ajustes</h1>
  <label class="f" for="aNome">Nome do negócio</label><input class="t" id="aNome" value="${esc(S.neg.nome)}">
  <label class="f" for="aSeg">O que você vende</label><select class="t" id="aSeg">${Object.entries(SEGMENTOS).map(([k, s]) => `<option value="${k}" ${S.neg.seg === k ? 'selected' : ''}>${s.nome}</option>`).join('')}</select>
  <label class="f" for="aWa">Seu WhatsApp <em>(recebe os pedidos da agenda)</em></label><input class="t" id="aWa" inputmode="tel" value="${esc(fmtTel(S.neg.whats))}">
  <label class="f" for="aPix">Chave Pix</label><input class="t" id="aPix" value="${esc(S.neg.pix)}">
  <label class="f" for="aTxt">Mensagem de cobrança</label><textarea class="t" id="aTxt" style="min-height:160px">${esc(S.neg.texto)}</textarea>
  <p class="small muted">Campos que viram dados do pedido: {cliente}, {numero}, {itens}, {data}, {vencimento}, {valor}, {pago}, {falta}, {linha_sinal}, {pix}, {endereco}, {link} e {negocio}.</p>
  <button class="more" id="aPadrao" type="button">Voltar ao texto padrão</button>
  <button class="btn go" id="aOk">Salvar ajustes</button>
  ${DB.online ? '<button class="btn ghost" id="aSair">Sair da conta</button>' : '<button class="btn ghost" id="aDemo">Recomeçar com exemplos</button>'}`);
  $('#aPadrao').onclick = () => $('#aTxt').value = TEXTO_PADRAO;
  $('#aOk').onclick = async () => {
    const n = { ...S.neg, nome: $('#aNome').value.trim() || S.neg.nome, seg: $('#aSeg').value, whats: $('#aWa').value.replace(/\D/g, ''), pix: $('#aPix').value.trim(), texto: $('#aTxt').value || TEXTO_PADRAO };
    await tenta(async () => { S.neg = await DB.salvarNegocio(n); render(); fechar(); toast('Ajustes salvos'); }, $('#aOk')).catch(() => {});
  };
  if ($('#aSair')) $('#aSair').onclick = sair;
  if ($('#aDemo')) $('#aDemo').onclick = async () => { if (confirm('Apagar tudo e voltar aos exemplos?')) { DB.reiniciarDemo(); fechar(); await iniciar(); toast('Exemplos restaurados'); } };
}

async function sair() { fechar(); await DB.sair(); S = VAZIO(); modoEntrada = 'entrar'; telaEntrada(); }

/* ---------- início ---------- */
async function iniciar() {
  $('#app').innerHTML = '<p class="loading">Carregando…</p>';
  try {
    const sessao = await DB.sessao();
    if (!sessao) return telaEntrada();
    S = await DB.carregar();
    if (!S.neg) return telaBoasVindas();
    render();
  } catch (e) {
    $('#app').innerHTML = `<div class="empty" style="margin-top:40px">${esc(e.message)}<br><button class="btn go" id="tentaDeNovo">Tentar de novo</button></div>`;
    $('#tentaDeNovo').onclick = iniciar;
  }
}

/* recarrega ao voltar para o app (pega pedidos novos feitos pela agenda) */
let ultimaCarga = Date.now();
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !S.neg || Date.now() - ultimaCarga < 60000) return;
  if ($('#sheet').classList.contains('open')) return;
  try { ultimaCarga = Date.now(); const novo = await DB.carregar(); if (novo.neg) { S = novo; render(); } } catch (e) {}
});

$$('nav.bar [data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab));
$('#fab').onclick = () => abrirFormPedido();
$('#sheetBg').onclick = fechar;
document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });
DB.aoMudarSessao(s => { if (!s && S.neg) { S = VAZIO(); telaEntrada(); } });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
iniciar();
