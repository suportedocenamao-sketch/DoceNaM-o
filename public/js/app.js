/* Doce na Mão — app */
const $ = s => document.querySelector(s);
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); };
const addMonths = (s, n) => { const d = new Date(s + 'T12:00'); d.setMonth(d.getMonth() + n); return iso(d); };
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const fmtD = s => { if (!s) return 'sem data'; const d = new Date(s + 'T12:00'); return WD[d.getDay()] + ', ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const t = String(v).trim(); return parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) || 0; };
const slug = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const noPad = n => String(n).padStart(4, '0');

const SEGMENTOS = {
  doces:   { nome: 'Doces e bolos',       p: 'Encomenda', pl: 'Encomendas', ex: 'Bolo de chocolate 2 kg',       extra: 'Sabor, tema, retirada ou entrega' },
  marmita: { nome: 'Marmitas',            p: 'Pedido',    pl: 'Pedidos',    ex: '10 marmitas fit (frango)',     extra: 'Cardápio, endereço de entrega' },
  cestas:  { nome: 'Cestas e presentes',  p: 'Encomenda', pl: 'Encomendas', ex: 'Cesta café da manhã',          extra: 'Itens da cesta, texto do cartão' },
  arte:    { nome: 'Artesanato',          p: 'Encomenda', pl: 'Encomendas', ex: 'Caneca personalizada (2 un.)', extra: 'Personalização, cores' },
  servico: { nome: 'Serviço recorrente',  p: 'Visita',    pl: 'Visitas',    ex: 'Limpeza da piscina',           extra: 'Endereço, o que levar' }
};
const STATUS = [['aguardando', 'Aguardando sinal'], ['confirmado', 'Confirmado'], ['producao', 'Em produção'], ['entregue', 'Entregue']];

/* ---------- estado ---------- */
let S = { neg: null, pedidos: [], bloqueios: [] };
let tab = 'hoje', filtro = 'abertos', mesAg = today().slice(0, 7), modoEntrada = 'entrar';

const voc = () => SEGMENTOS[S.neg?.seg] || SEGMENTOS.doces;
const pago = p => p.pagamentos.reduce((a, x) => a + Number(x.v), 0);
const saldo = p => Math.max(0, p.valor - pago(p));
const quitado = p => saldo(p) <= 0.009;
const ativo = p => p.status !== 'cancelado';
const atrasado = p => ativo(p) && !quitado(p) && p.data && p.data < today();
const sinalPendente = p => ativo(p) && p.status === 'aguardando' && p.sinal > 0 && pago(p) < p.sinal;
const contaNoDia = d => S.pedidos.filter(p => ativo(p) && p.data === d).length;
const linkAgenda = () => ((window.DNM_CONFIG.SITE_URL || (location.protocol.startsWith('http') ? location.origin + location.pathname.replace(/[^/]*$/, '') : '')).replace(/\/$/, '')) + '/agenda.html?n=' + S.neg.slug;

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2400); }
async function tenta(fn, botao) {
  if (botao) botao.disabled = true;
  try { return await fn(); }
  catch (e) { toast(e.message || 'Algo deu errado. Tente de novo.'); throw e; }
  finally { if (botao) botao.disabled = false; }
}
function copiar(txt, msg) { try { navigator.clipboard.writeText(txt).then(() => toast(msg), () => toast(txt)); } catch (e) { toast(txt); } }

/* ---------- entrada ---------- */
function telaEntrada() {
  document.body.classList.add('sem-nav');
  const cad = modoEntrada === 'cadastrar';
  $('#app').innerHTML = `
  <div class="hero"><span class="logo"><span class="mark">dm</span><strong>Doce na Mão</strong></span>
  <p>Suas encomendas num lugar só. Cobre o sinal pelo WhatsApp e mostre suas datas livres.</p></div>
  <div class="card">
    <div class="seg"><button data-m="entrar" aria-pressed="${!cad}">Entrar</button><button data-m="cadastrar" aria-pressed="${cad}">Criar conta</button></div>
    <label class="f" for="eMail">E-mail</label><input class="t" id="eMail" type="email" autocomplete="email" inputmode="email">
    <label class="f" for="eSenha">Senha ${cad ? '<em>(mínimo 6 caracteres)</em>' : ''}</label><input class="t" id="eSenha" type="password" autocomplete="${cad ? 'new-password' : 'current-password'}">
    <p class="err" id="eErr"></p>
    <button class="btn go" id="eOk">${cad ? 'Criar conta grátis' : 'Entrar'}</button>
    ${cad ? '' : '<button class="more" id="eEsqueci" type="button">Esqueci a senha</button>'}
  </div>`;
  document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { modoEntrada = b.dataset.m; telaEntrada(); });
  const erro = m => $('#eErr').textContent = m;
  $('#eOk').onclick = async () => {
    const email = $('#eMail').value.trim(), senha = $('#eSenha').value;
    if (!email || !senha) return erro('Preencha e-mail e senha.');
    $('#eOk').disabled = true; erro('');
    try {
      if (cad) {
        const s = await DB.cadastrar(email, senha);
        if (!s) { erro(''); $('.card').innerHTML = `<h2 style="margin-top:0">Confirme seu e-mail</h2><p>Enviamos um link para <strong>${esc(email)}</strong>. Abra, confirme e volte aqui para entrar.</p><button class="btn ghost" onclick="modoEntrada='entrar';telaEntrada()">Voltar para entrar</button>`; return; }
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
    <label class="f" for="bPix">Chave Pix <em>(vai na mensagem de cobrança)</em></label><input class="t" id="bPix">
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

/* ---------- ticket ---------- */
function ticket(p) {
  const cls = quitado(p) ? 'is-paid' : (atrasado(p) ? 'is-late' : '');
  let badge;
  if (p.status === 'cancelado') badge = '<span class="badge">Cancelado</span>';
  else if (quitado(p)) badge = '<span class="badge go">Pago</span>';
  else if (atrasado(p)) badge = `<span class="badge late">Deve ${brl(saldo(p))}</span>`;
  else if (sinalPendente(p)) badge = '<span class="badge rose">Sinal pendente</span>';
  else badge = `<span class="badge">Falta ${brl(saldo(p))}</span>`;
  const st = (STATUS.find(s => s[0] === p.status) || [, 'Cancelado'])[1];
  return `<button class="ticket ${cls}" data-open="${p.id}">
    <span class="stub"><span class="no">#${noPad(p.no)}</span><span class="d">${p.data ? fmtD(p.data) : 'avulsa'}</span></span>
    <span class="body"><span class="who">${esc(p.cliente)}</span>
      <span class="what" style="display:block">${esc(p.desc)}</span>
      <span class="row"><span class="money">${brl(p.valor)}</span>${badge}</span>
      <span class="small muted">${st}${p.repetir ? ' · repete ' + (p.repetir === 'semanal' ? 'toda semana' : 'todo mês') : ''}</span>
    </span></button>`;
}
function bindTickets() { document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => abrirPedido(b.dataset.open)); }

/* ---------- telas principais ---------- */
function telaHoje() {
  const t = today(), v = voc();
  const hoje = S.pedidos.filter(p => ativo(p) && p.data === t && p.status !== 'entregue');
  const late = S.pedidos.filter(atrasado);
  const sinais = S.pedidos.filter(p => sinalPendente(p) && !hoje.includes(p) && !late.includes(p));
  const prox = S.pedidos.filter(p => ativo(p) && p.data > t && p.data <= addDays(t, 7) && !sinais.includes(p)).sort((a, b) => a.data.localeCompare(b.data));
  const receber = S.pedidos.filter(ativo).reduce((a, p) => a + saldo(p), 0);
  const d = new Date();
  return `${DB.online ? '' : '<p class="demo-flag">Modo demonstração: os dados ficam só neste aparelho.</p>'}
  <header class="top"><div><h1>Oi, ${esc(S.neg.nome)}</h1><p class="sub">${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][d.getDay()]}, ${d.getDate()} de ${d.toLocaleString('pt-BR', { month: 'long' })}</p></div>
    <button class="iconbtn" id="ajustes" aria-label="Ajustes">⚙️</button></header>
  <div class="sums">
    <div class="sum"><b>${brl(receber)}</b><span>a receber</span></div>
    <div class="sum ${late.length ? 'late' : ''}"><b>${late.length}</b><span>${late.length === 1 ? 'cliente atrasado' : 'clientes atrasados'}</span></div>
  </div>
  <h2>Para hoje</h2>
  ${hoje.length ? hoje.map(ticket).join('') : '<div class="empty">Nada para entregar hoje.</div>'}
  ${late.length ? `<h2>Atrasados</h2>${late.map(ticket).join('')}` : ''}
  ${sinais.length ? `<h2>Esperando o sinal</h2>${sinais.map(ticket).join('')}` : ''}
  <h2>Próximos 7 dias</h2>
  ${prox.length ? prox.map(ticket).join('') : `<div class="empty">Nenhuma ${v.p.toLowerCase()} na semana. Mande o link da agenda para seus clientes.</div>`}`;
}
function telaPedidos() {
  const v = voc();
  const F = { abertos: p => ativo(p) && (!quitado(p) || p.status !== 'entregue'), devendo: p => ativo(p) && !quitado(p), pagos: p => quitado(p), todos: () => true };
  const lista = S.pedidos.filter(F[filtro]).sort((a, b) => (b.data || '9999').localeCompare(a.data || '9999') || b.no - a.no);
  const ch = (k, l) => `<button class="chip" data-f="${k}" aria-pressed="${filtro === k}">${l}</button>`;
  return `<header class="top"><div><h1>${v.pl}</h1><p class="sub">${S.pedidos.length} no total</p></div></header>
  <div class="chips">${ch('abertos', 'Em aberto')}${ch('devendo', 'Quem deve')}${ch('pagos', 'Pagos')}${ch('todos', 'Todos')}</div>
  ${lista.length ? lista.map(ticket).join('') : `<div class="empty">Nada por aqui. Toque em + para lançar.</div>`}`;
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
  const nome = first.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  return `<header class="top"><div><h1>Agenda</h1><p class="sub">Toque num dia para ver ou bloquear</p></div></header>
  <div class="sum" style="display:flex;justify-content:space-between;align-items:center">
    <div><strong>Aceito por dia</strong><br><span class="small muted">Depois disso o dia aparece lotado</span></div>
    <div class="stepper"><button id="menos" aria-label="Menos">−</button><b>${S.neg.limite}</b><button id="mais" aria-label="Mais">+</button></div>
  </div>
  <div class="monthnav"><button class="iconbtn" id="mPrev" aria-label="Mês anterior">‹</button><strong style="text-transform:capitalize">${nome}</strong><button class="iconbtn" id="mNext" aria-label="Próximo mês">›</button></div>
  <div class="cal">${cells}</div>
  <div class="legend"><span><i style="background:var(--paper)"></i>Com vaga</span><span><i style="background:var(--rose-soft)"></i>Lotado</span><span><i style="background:repeating-linear-gradient(45deg,var(--bg),var(--bg) 3px,var(--line) 3px,var(--line) 5px)"></i>Folga</span></div>
  <button class="btn go" id="link">Copiar link para clientes</button>
  <a class="btn ghost" id="preview" href="${esc(linkAgenda())}" target="_blank" rel="noopener">Ver como o cliente vê</a>`;
}
function telaRelatorio() {
  const mes = today().slice(0, 7);
  const doMes = S.pedidos.filter(p => ativo(p) && ((p.data || p.criado).slice(0, 7) === mes));
  const vendido = doMes.reduce((a, p) => a + p.valor, 0);
  const recebido = S.pedidos.flatMap(p => p.pagamentos).filter(x => x.d.slice(0, 7) === mes).reduce((a, x) => a + Number(x.v), 0);
  const receber = S.pedidos.filter(ativo).reduce((a, p) => a + saldo(p), 0);
  const top = key => { const m = {}; S.pedidos.filter(ativo).forEach(p => { const k = key(p); m[k] = (m[k] || 0) + p.valor; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5); };
  const bars = arr => { if (!arr.length) return '<p class="muted small">Ainda sem dados.</p>'; const mx = arr[0][1] || 1; return `<div class="bars">${arr.map(([k, v]) => `<div class="b"><div><span>${esc(k)}</span><strong>${brl(v)}</strong></div><i style="width:${Math.max(4, v / mx * 100)}%"></i></div>`).join('')}</div>`; };
  return `<header class="top"><div><h1>Relatório</h1><p class="sub" style="text-transform:capitalize">${new Date().toLocaleString('pt-BR', { month: 'long' })}</p></div></header>
  <div class="sums">
    <div class="sum"><b>${brl(vendido)}</b><span>vendido no mês (${doMes.length})</span></div>
    <div class="sum"><b>${brl(recebido)}</b><span>recebido no mês</span></div>
    <div class="sum"><b>${brl(receber)}</b><span>a receber</span></div>
    <div class="sum"><b>${doMes.length ? brl(vendido / doMes.length) : brl(0)}</b><span>valor médio</span></div>
  </div>
  <h2>Clientes que mais compram</h2>${bars(top(p => p.cliente))}
  <h2>O que mais sai</h2>${bars(top(p => p.desc.replace(/\s*\(.*\)$/, '').split(/\s\d/)[0]))}
  <p class="muted small">Tudo calculado a partir dos seus ${voc().pl.toLowerCase()}.</p>`;
}

function render() {
  if (!S.neg) return;
  document.body.classList.remove('sem-nav');
  const v = voc();
  document.querySelectorAll('[data-voc="plural"]').forEach(e => e.textContent = v.pl);
  $('#fab').setAttribute('aria-label', 'Novo ' + v.p.toLowerCase());
  document.querySelectorAll('nav.bar [data-tab]').forEach(b => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#app').innerHTML = { hoje: telaHoje, pedidos: telaPedidos, agenda: telaAgenda, relatorio: telaRelatorio }[tab]();
  bindTickets();
  if (tab === 'hoje') $('#ajustes').onclick = abrirAjustes;
  if (tab === 'pedidos') document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filtro = b.dataset.f; render(); });
  if (tab === 'agenda') {
    const muda = async d => { const n = Math.max(1, Math.min(50, S.neg.limite + d)); if (n === S.neg.limite) return; S.neg.limite = n; render(); await tenta(() => DB.salvarNegocio(S.neg)).catch(() => {}); };
    $('#menos').onclick = () => muda(-1); $('#mais').onclick = () => muda(1);
    $('#mPrev').onclick = () => { mesAg = addMonths(mesAg + '-01', -1).slice(0, 7); render(); };
    $('#mNext').onclick = () => { mesAg = addMonths(mesAg + '-01', 1).slice(0, 7); render(); };
    document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => abrirDia(b.dataset.day));
    $('#link').onclick = () => copiar(linkAgenda(), 'Link copiado. Cole na bio do Instagram ou no WhatsApp.');
  }
}
function go(t) { tab = t; render(); window.scrollTo(0, 0); }

/* ---------- folha (sheet) ---------- */
function abrir(html) { $('#sheetBody').innerHTML = html; $('#sheet').classList.add('open'); $('#sheetBg').classList.add('open'); }
function fechar() { $('#sheet').classList.remove('open'); $('#sheetBg').classList.remove('open'); }

/* ---------- novo pedido ---------- */
function abrirNovo(dataPre) {
  const v = voc(), rec = S.neg.seg === 'servico';
  abrir(`<h1 style="font-size:24px">Novo ${v.p.toLowerCase()}</h1>
  <p class="sub">Só 4 coisas. O resto é opcional.</p>
  <label class="f" for="nCli">Cliente</label><input class="t" id="nCli" list="clientes" placeholder="Nome" autocomplete="off">
  <datalist id="clientes">${[...new Set(S.pedidos.map(p => p.cliente))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>
  <label class="f" for="nDesc">O que é</label><input class="t" id="nDesc" placeholder="${esc(v.ex)}">
  <div class="two"><div><label class="f" for="nVal">Valor (R$)</label><input class="t" id="nVal" inputmode="decimal" placeholder="0,00"></div>
  <div><label class="f" for="nData">Data <em>(opcional)</em></label><input class="t" id="nData" type="date" value="${dataPre || ''}"></div></div>
  <div id="nWarn"></div>
  <button class="more" id="nMais" type="button">+ WhatsApp, sinal e observação</button>
  <div id="nExtra" hidden>
    <label class="f" for="nTel">WhatsApp do cliente <em>(com DDD)</em></label><input class="t" id="nTel" inputmode="tel" placeholder="61 99999-0000">
    <label class="f" for="nSinal">Sinal (R$) <em>— vazio = metade; 0 = sem sinal</em></label><input class="t" id="nSinal" inputmode="decimal">
    ${rec ? `<label class="f" for="nRep">Repetir</label><select class="t" id="nRep"><option value="">Não repete</option><option value="semanal">Toda semana</option><option value="mensal">Todo mês</option></select>` : ''}
    <label class="f" for="nObs">Observação <em>(${esc(v.extra.toLowerCase())})</em></label><textarea class="t" id="nObs"></textarea>
  </div>
  <button class="btn go" id="nSalvar">Salvar ${v.p.toLowerCase()}</button>
  <p class="small muted" style="text-align:center">Sem data, vira venda avulsa (produto pronto).</p>`);
  $('#nMais').onclick = () => { $('#nExtra').hidden = false; $('#nMais').remove(); };
  const chk = () => { const d = $('#nData').value; let w = ''; if (d) { if (S.bloqueios.includes(d)) w = 'Esse dia está marcado como folga.'; else if (contaNoDia(d) >= S.neg.limite) w = `Esse dia já tem ${contaNoDia(d)} de ${S.neg.limite}. Vai aceitar mesmo assim?`; } $('#nWarn').innerHTML = w ? `<div class="warn">${w}</div>` : ''; };
  $('#nData').onchange = chk; chk();
  $('#nCli').onchange = () => { const ant = S.pedidos.find(p => p.cliente === $('#nCli').value && p.tel); if (ant && $('#nTel')) $('#nTel').value = ant.tel; };
  $('#nSalvar').onclick = async () => {
    const cli = $('#nCli').value.trim(), desc = $('#nDesc').value.trim(), val = num($('#nVal').value);
    if (!cli || !desc || !val) { toast('Preencha cliente, o que é e valor.'); return; }
    const data = $('#nData').value;
    const ant = S.pedidos.find(p => p.cliente === cli && p.tel);
    const tel = (($('#nTel') ? $('#nTel').value : '') || (ant ? ant.tel : '')).replace(/\D/g, '');
    const sTxt = $('#nSinal') ? $('#nSinal').value.trim() : '';
    const sinal = sTxt !== '' ? num(sTxt) : (data ? Math.round(val / 2 * 100) / 100 : 0);
    const novo = { cliente: cli, tel, desc, valor: val, sinal, data, status: data ? (sinal > 0 ? 'aguardando' : 'confirmado') : 'entregue', obs: $('#nObs') ? $('#nObs').value : '', repetir: $('#nRep') ? $('#nRep').value : '' };
    await tenta(async () => {
      const p = await DB.criarPedido(novo);
      S.pedidos.push(p); render(); abrirPedido(p.id); toast(`#${noPad(p.no)} salvo`);
    }, $('#nSalvar')).catch(() => {});
  };
  setTimeout(() => { const e = $('#nCli'); if (e) e.focus(); }, 250);
}

/* ---------- cobrança ---------- */
function mensagem(p) {
  const s = saldo(p), pg = pago(p);
  let linha;
  if (p.status === 'aguardando' && p.sinal > pg) linha = `Para garantir a data, o sinal é de ${brl(p.sinal - pg)}. `;
  else if (s > 0) linha = `Falta pagar ${brl(s)}. `;
  else linha = 'Está tudo pago, obrigada! ';
  return (S.neg.texto || TEXTO_PADRAO)
    .replaceAll('{cliente}', p.cliente.split(' ')[0]).replaceAll('{negocio}', S.neg.nome)
    .replaceAll('{numero}', noPad(p.no)).replaceAll('{descricao}', p.desc)
    .replaceAll('{data}', p.data ? fmtD(p.data) : 'hoje').replaceAll('{valor}', brl(p.valor))
    .replaceAll('{linha_sinal}', linha).replaceAll('{pix}', S.neg.pix || '');
}
function waLink(p) { const tel = p.tel ? ('55' + p.tel.replace(/^55/, '')) : ''; return `https://wa.me/${tel}?text=${encodeURIComponent(mensagem(p))}`; }

/* ---------- detalhe do pedido ---------- */
function abrirPedido(id) {
  const p = S.pedidos.find(x => String(x.id) === String(id)); if (!p) return;
  const v = voc(), idx = STATUS.findIndex(s => s[0] === p.status);
  const steps = STATUS.map((s, i) => `<button data-st="${s[0]}" class="${p.status === s[0] ? 'on' : (i < idx ? 'done' : '')}">${s[1]}</button>`).join('');
  const sugerido = (p.status === 'aguardando' && p.sinal > pago(p)) ? p.sinal - pago(p) : saldo(p);
  abrir(`<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
    <h1 style="font-size:26px">#${noPad(p.no)}</h1>${quitado(p) ? '<span class="badge go">Pago</span>' : (atrasado(p) ? '<span class="badge late">Atrasado</span>' : '')}</div>
  <p style="margin:2px 0 0;font-weight:700">${esc(p.cliente)}</p><p class="sub">${esc(p.desc)} · ${p.data ? fmtD(p.data) : 'venda avulsa'}</p>
  ${p.status === 'cancelado' ? '<p class="warn">Cancelado</p>' : `<div class="steps">${steps}</div>`}
  <div class="kv"><span>Valor</span><strong>${brl(p.valor)}</strong></div>
  ${p.sinal ? `<div class="kv"><span>Sinal combinado</span><span>${brl(p.sinal)}</span></div>` : ''}
  <div class="kv"><span>Já pago</span><span>${brl(pago(p))}</span></div>
  <div class="kv"><span>Falta</span><strong style="color:${saldo(p) ? 'var(--late)' : 'var(--go)'}">${brl(saldo(p))}</strong></div>
  ${p.obs ? `<p class="small" style="margin-top:8px"><strong>Obs.:</strong> ${esc(p.obs)}</p>` : ''}
  ${p.pagamentos.length ? `<p class="small muted" style="margin-top:8px">${p.pagamentos.map(x => `${brl(x.v)} em ${fmtD(x.d)} (${esc(x.f)})`).join('<br>')}</p>` : ''}
  <h2 style="font-size:17px">Mensagem que vai no WhatsApp</h2>
  <div class="msg">${esc(mensagem(p))}</div>
  ${!p.tel ? '<p class="small muted">Sem WhatsApp cadastrado: você escolhe o contato quando o WhatsApp abrir.</p>' : ''}
  <a class="btn wa" href="${waLink(p)}" target="_blank" rel="noopener">Cobrar no WhatsApp</a>
  ${saldo(p) > 0 && p.status !== 'cancelado' ? `<div class="two" style="align-items:end"><div><label class="f" for="pgV">Recebi (R$)</label><input class="t" id="pgV" inputmode="decimal" value="${sugerido.toFixed(2).replace('.', ',')}"></div>
    <div><label class="f" for="pgF">Como</label><select class="t" id="pgF"><option>Pix</option><option>Dinheiro</option><option>Cartão</option></select></div></div>
    <button class="btn go" id="pgOk">Registrar pagamento</button>` : ''}
  <button class="btn ghost" id="pCopia">Copiar mensagem</button>
  ${p.status !== 'cancelado' ? `<button class="btn danger" id="pCancel">Cancelar ${v.p.toLowerCase()}</button>` : ''}`);

  document.querySelectorAll('[data-st]').forEach(b => b.onclick = async () => {
    const novo = b.dataset.st; if (novo === p.status) return;
    const virouEntregue = novo === 'entregue' && p.status !== 'entregue';
    await tenta(async () => {
      await DB.atualizarPedido(p.id, { status: novo }); p.status = novo;
      if (virouEntregue && p.repetir && p.data) {
        const nd = p.repetir === 'semanal' ? addDays(p.data, 7) : addMonths(p.data, 1);
        const prox = await DB.criarPedido({ cliente: p.cliente, tel: p.tel, desc: p.desc, valor: p.valor, sinal: p.sinal, data: nd, status: 'confirmado', obs: p.obs, repetir: p.repetir });
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
  $('#pCopia').onclick = () => copiar(mensagem(p), 'Mensagem copiada');
  if ($('#pCancel')) $('#pCancel').onclick = async () => {
    if (!confirm('Cancelar este pedido?')) return;
    await tenta(async () => { await DB.atualizarPedido(p.id, { status: 'cancelado' }); p.status = 'cancelado'; render(); fechar(); toast('Cancelado'); }).catch(() => {});
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
  bindTickets();
  if ($('#dNovo')) $('#dNovo').onclick = () => abrirNovo(ds);
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
  <p class="small muted">Muda os nomes e exemplos das telas. Seus dados continuam os mesmos.</p>
  <label class="f" for="aWa">Seu WhatsApp</label><input class="t" id="aWa" inputmode="tel" value="${esc(S.neg.whats)}">
  <label class="f" for="aPix">Chave Pix</label><input class="t" id="aPix" value="${esc(S.neg.pix)}">
  <label class="f" for="aTxt">Texto da cobrança</label><textarea class="t" id="aTxt" style="min-height:120px">${esc(S.neg.texto)}</textarea>
  <p class="small muted">Use {cliente}, {numero}, {descricao}, {data}, {valor}, {linha_sinal}, {pix} e {negocio}.</p>
  <button class="btn go" id="aOk">Salvar ajustes</button>
  ${DB.online ? '<button class="btn ghost" id="aSair">Sair da conta</button>' : '<button class="btn ghost" id="aDemo">Recomeçar com exemplos</button>'}`);
  $('#aOk').onclick = async () => {
    const n = { ...S.neg, nome: $('#aNome').value.trim() || S.neg.nome, seg: $('#aSeg').value, whats: $('#aWa').value.replace(/\D/g, ''), pix: $('#aPix').value.trim(), texto: $('#aTxt').value || TEXTO_PADRAO };
    await tenta(async () => { S.neg = await DB.salvarNegocio(n); render(); fechar(); toast('Ajustes salvos'); }, $('#aOk')).catch(() => {});
  };
  if ($('#aSair')) $('#aSair').onclick = sair;
  if ($('#aDemo')) $('#aDemo').onclick = async () => { if (confirm('Apagar tudo e voltar aos exemplos?')) { DB.reiniciarDemo(); fechar(); await iniciar(); toast('Exemplos restaurados'); } };
}

async function sair() { fechar(); await DB.sair(); S = { neg: null, pedidos: [], bloqueios: [] }; modoEntrada = 'entrar'; telaEntrada(); }

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
    $('#app').innerHTML = `<div class="empty" style="margin-top:40px">${esc(e.message)}<br><button class="btn go" onclick="iniciar()">Tentar de novo</button></div>`;
  }
}

document.querySelectorAll('nav.bar [data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab));
$('#fab').onclick = () => abrirNovo();
$('#sheetBg').onclick = fechar;
document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });
DB.aoMudarSessao(s => { if (!s && S.neg) { S = { neg: null, pedidos: [], bloqueios: [] }; telaEntrada(); } });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
iniciar();
