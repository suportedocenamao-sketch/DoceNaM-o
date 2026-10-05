/* Doce na Mão — app da confeiteira (v3) */
const SEGMENTOS = {
  doces:   { nome: 'Doces e bolos',      p: 'Encomenda', pl: 'Encomendas', ex: 'Bolo de chocolate', extra: 'Sabor, tema, retirada ou entrega' },
  marmita: { nome: 'Marmitas',           p: 'Pedido',    pl: 'Pedidos',    ex: 'Marmita fit frango', extra: 'Cardápio, endereço de entrega' },
  cestas:  { nome: 'Cestas e presentes', p: 'Encomenda', pl: 'Encomendas', ex: 'Cesta café da manhã', extra: 'Itens da cesta, texto do cartão' },
  arte:    { nome: 'Artesanato',         p: 'Encomenda', pl: 'Encomendas', ex: 'Caneca personalizada', extra: 'Personalização, cores' },
  servico: { nome: 'Serviço recorrente', p: 'Visita',    pl: 'Visitas',    ex: 'Limpeza da piscina', extra: 'Endereço, o que levar' }
};
const STATUS = [['aguardando', 'Aguardando sinal'], ['confirmado', 'A fazer'], ['producao', 'Em andamento'], ['pronto', 'Pronto'], ['entregue', 'Entregue']];
const PROXIMO = { aguardando: ['producao', '▶ Iniciar'], confirmado: ['producao', '▶ Iniciar'], producao: ['pronto', '✓ Pronto'], pronto: ['entregue', '📦 Entregue'] };
const CAT_CHAMADO = { duvida: 'Dúvida', problema: 'Problema', sugestao: 'Sugestão', financeiro: 'Financeiro' };
const ST_CHAMADO = { aberto: 'Aberto', em_andamento: 'Em andamento', aguardando: 'Aguardando você', resolvido: 'Resolvido' };

/* ---------- estado ---------- */
const VAZIO = () => ({ neg: null, pedidos: [], bloqueios: [], clientes: [], produtos: [], categorias: [], chamadosNaoLidos: 0 });
let S = VAZIO();
let tab = 'hoje', filtro = 'abertos', mesAg = today().slice(0, 7), diaAg = today(), modoAg = 'dia', modoEntrada = 'entrar', buscaCli = '';
let relMes = today().slice(0, 7), relGrupo = '', relSub = '', souAdmin = false;

const voc = () => SEGMENTOS[S.neg?.seg] || SEGMENTOS.doces;
const cfgNeg = () => S.neg.config || configCompleta({});
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
const primeiroNome = p => { const c = cliDe(p); return c ? c.nome : String(p.cliente).split(' ')[0]; };
const telCliente = p => (cliDe(p) || {}).whats || p.tel;
const linkAgenda = () => baseSite() + '/agenda.html?n=' + S.neg.slug;
const linkCliente = c => c && c.token ? baseSite() + '/meus-pedidos.html?c=' + c.token : '';
const totTabela = itens => r2(itens.reduce((a, i) => a + r2(i.qtd * i.precoTab), 0));
const totItens = itens => r2(itens.reduce((a, i) => a + r2(i.qtd * i.preco), 0));
const produtosPed = p => p.itens.length ? r2(totItens(p.itens) + (p.ajuste || 0)) : r2(p.valor - (p.taxaEnt || 0) - (p.taxaPag || 0));
const difPedido = p => p.itens.length ? r2(totItens(p.itens) - totTabela(p.itens) + (p.ajuste || 0)) : 0;
const grupos = () => S.categorias.filter(c => !c.paiId).sort((a, b) => a.nome.localeCompare(b.nome));
const subgrupos = g => S.categorias.filter(c => c.paiId === g).sort((a, b) => a.nome.localeCompare(b.nome));
const nomeCat = id => (S.categorias.find(c => c.id === id) || {}).nome || '';
const entregaTxt = p => p.entrega === 'entrega' ? '🚗 Entrega' + (p.regiao ? ' · ' + p.regiao : '') : '🏠 Retirada';

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
      await iniciar('login');
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
      S.neg = await DB.criarNegocio({ nome, slug: slug(nome), seg: $('#bSeg').value, whats: $('#bWa').value.replace(/\D/g, ''), pix: $('#bPix').value.trim(), limite: 3, texto: TEXTO_PADRAO, config: configCompleta({}) });
      await iniciar();
    }, $('#bOk')).catch(() => {});
  };
}

/* ---------- ticket de pedido ---------- */
function badgePagamento(p) {
  if (p.status === 'cancelado') return '<span class="badge">Cancelado</span>';
  if (p.status === 'solicitado') return '<span class="badge rose">Novo · responder</span>';
  if (quitado(p)) return '<span class="badge go">Pago</span>';
  if (atrasado(p)) return `<span class="badge late">Deve ${brl(saldo(p))}</span>`;
  if (pagarHoje(p)) return `<span class="badge late">Pagar hoje ${brl(saldo(p))}</span>`;
  if (sinalPendente(p)) return '<span class="badge rose">Sinal pendente</span>';
  return `<span class="badge">Falta ${brl(saldo(p))}</span>`;
}
function ticket(p) {
  const cls = p.status === 'solicitado' ? 'is-new' : quitado(p) ? 'is-paid' : (atrasado(p) ? 'is-late' : '');
  const desc = p.itens.length ? resumoItens(p.itens) : p.desc;
  return `<button class="ticket ${cls}" data-open="${p.id}">
    <span class="stub"><span class="no">#${noPad(p.no)}</span><span class="d">${p.data ? fmtD(p.data) : 'avulsa'}${p.hora ? '<br>' + p.hora : ''}</span></span>
    <span class="body"><span class="who">${esc(nomeCliente(p))}</span>
      <span class="what" style="display:block">${esc(desc)}</span>
      <span class="row"><span class="money">${brl(p.valor)}</span>${badgePagamento(p)}</span>
      <span class="small muted">${STATUS_NOMES[p.status]} · ${entregaTxt(p)}${cobrados.tem(p.id) ? ' · cobrado hoje' : ''}</span>
    </span></button>`;
}
function bindTickets(raiz = document) { raiz.querySelectorAll('[data-open]').forEach(b => b.onclick = () => abrirPedido(b.dataset.open)); }

/* ---------- alertas ---------- */
function alertas() {
  const t = today();
  return [
    { k: 'novos', ic: '🛎️', titulo: n => `${n} ${n === 1 ? 'pedido novo' : 'pedidos novos'} pela agenda`, sub: 'Revise e responda', lista: S.pedidos.filter(p => p.status === 'solicitado'), urg: true },
    { k: 'entregar', ic: '📦', titulo: n => `${n} para entregar hoje`, sub: 'Abrir a agenda do dia', lista: S.pedidos.filter(p => aceito(p) && p.data === t && p.status !== 'entregue'), agenda: true },
    { k: 'receber', ic: '💰', titulo: n => `${n} para receber hoje`, sub: 'Fila de cobrança', lista: S.pedidos.filter(pagarHoje), cobrar: true, urg: true },
    { k: 'atrasados', ic: '⏰', titulo: n => `${n} ${n === 1 ? 'pagamento atrasado' : 'pagamentos atrasados'}`, sub: 'Fila de cobrança', lista: S.pedidos.filter(atrasado), cobrar: true, urg: true },
    { k: 'sinais', ic: '✋', titulo: n => `${n} ${n === 1 ? 'sinal pendente' : 'sinais pendentes'} para os próximos 2 dias`, sub: 'Cobre para garantir a data', lista: S.pedidos.filter(p => sinalPendente(p) && p.data && p.data <= addDays(t, 2) && p.data >= t), cobrar: true },
    { k: 'suporte', ic: '💬', titulo: n => `${n} ${n === 1 ? 'resposta nova' : 'respostas novas'} do suporte`, sub: 'Abrir chamados', lista: Array(S.chamadosNaoLidos || 0).fill(0), suporte: true }
  ].filter(a => a.lista.length);
}
function abrirFila(a) {
  abrir(`<h1 class="sh-title">${a.ic} ${esc(a.titulo(a.lista.length))}</h1>
  <p class="sub">${a.cobrar ? 'Toque em Cobrar: o WhatsApp abre com a mensagem pronta. Quem você já cobrou hoje fica marcado.' : esc(a.sub)}</p>
  <div id="filaLista">${a.lista.map(p => a.cobrar ? `
    <div class="fila-row">
      <button class="fila-info" data-open="${p.id}"><strong>${esc(nomeCliente(p))}</strong><span class="small muted">#${noPad(p.no)} · ${p.data ? fmtD(p.data) : 'avulsa'} · falta ${brl(saldo(p))}</span></button>
      ${cobrados.tem(p.id) ? '<span class="badge go">Cobrado</span>' : `<a class="btn wa mini" href="${waLinkTel(telCliente(p), msgCobranca(p))}" target="_blank" rel="noopener" data-cobrar="${p.id}">Cobrar</a>`}
    </div>` : ticket(p)).join('')}</div>`);
  bindTickets($('#filaLista'));
  $$('[data-cobrar]').forEach(b => b.addEventListener('click', () => { cobrados.marcar(b.dataset.cobrar); setTimeout(() => { render(); abrirFila(a); }, 300); }));
}

/* ---------- telas ---------- */
function telaHoje() {
  const t = today(), v = voc(), d = new Date();
  const al = alertas();
  const hoje = S.pedidos.filter(p => aceito(p) && p.data === t && p.status !== 'entregue').sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99'));
  const prox = S.pedidos.filter(p => ativo(p) && p.data > t && p.data <= addDays(t, 7)).sort((a, b) => (a.data + (a.hora || '99')).localeCompare(b.data + (b.hora || '99')));
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
  ${hoje.length ? hoje.map(ticket).join('') + '<button class="btn ghost" data-diaag="' + t + '">Abrir agenda do dia</button>' : '<div class="empty">Nada para entregar hoje.</div>'}
  <h2>Próximos 7 dias</h2>
  ${prox.length ? prox.map(ticket).join('') : `<div class="empty">Nenhuma ${v.p.toLowerCase()} na semana. Mande o link do cardápio para seus clientes.</div>`}`;
}
function telaPedidos() {
  const v = voc();
  const F = { novos: p => p.status === 'solicitado', abertos: p => aceito(p) && (!quitado(p) || p.status !== 'entregue'), devendo: p => aceito(p) && !quitado(p), pagos: p => quitado(p) && p.valor > 0, todos: () => true };
  const lista = S.pedidos.filter(F[filtro]).sort((a, b) => ((b.data || '9999') + (b.hora || '')).localeCompare((a.data || '9999') + (a.hora || '')) || b.no - a.no);
  const nNovos = S.pedidos.filter(F.novos).length;
  const ch = (k, l) => `<button class="chip" data-f="${k}" aria-pressed="${filtro === k}">${l}</button>`;
  return `<header class="top"><div><h1>${v.pl}</h1><p class="sub">${S.pedidos.length} no total</p></div></header>
  <div class="chips">${nNovos ? ch('novos', `Novos (${nNovos})`) : ''}${ch('abertos', 'Em aberto')}${ch('devendo', 'Quem deve')}${ch('pagos', 'Pagos')}${ch('todos', 'Todos')}</div>
  ${lista.length ? lista.map(ticket).join('') : '<div class="empty">Nada por aqui. Toque em + para lançar.</div>'}`;
}

/* agenda: dia (organização por horário) e mês (vagas e folgas) */
function telaAgenda() {
  const tabs = `<div class="seg" style="margin-bottom:12px"><button data-modo="dia" aria-pressed="${modoAg === 'dia'}">Dia</button><button data-modo="mes" aria-pressed="${modoAg === 'mes'}">Mês</button></div>`;
  return `<header class="top"><div><h1>Agenda</h1></div></header>${tabs}${modoAg === 'dia' ? agendaDia() : agendaMes()}`;
}
function agendaDia() {
  const lista = S.pedidos.filter(p => ativo(p) && p.data === diaAg).sort((a, b) => (a.hora || '99:99').localeCompare(b.hora || '99:99') || a.no - b.no);
  const cont = s => lista.filter(p => s.includes(p.status)).length;
  const prod = {};
  lista.filter(aceito).forEach(p => p.itens.forEach(i => { const k = i.desc + '|' + i.un; prod[k] = (prod[k] || 0) + i.qtd; }));
  const porHora = {};
  lista.forEach(p => { const h = p.hora || 'Sem horário'; (porHora[h] = porHora[h] || []).push(p); });
  const card = p => {
    const prox = PROXIMO[p.status];
    return `<div class="ag-card st-${p.status}">
      <button class="ag-info" data-open="${p.id}">
        <span class="ag-top"><strong>${esc(nomeCliente(p))}</strong><span class="ag-st">${STATUS_NOMES[p.status]}</span></span>
        <span class="small">${esc(p.itens.length ? resumoItens(p.itens) : p.desc)}</span>
        <span class="small muted">#${noPad(p.no)} · ${entregaTxt(p)} · ${quitado(p) ? '✅ pago' : 'falta ' + brl(saldo(p))}</span>
      </button>
      ${p.status === 'solicitado' ? `<button class="btn mini ghost" data-open="${p.id}">Responder</button>` : prox ? `<button class="btn mini ${p.status === 'pronto' ? 'go' : 'ghost'}" data-avanca="${p.id}">${prox[1]}</button>` : '<span class="badge go">Entregue</span>'}
    </div>`;
  };
  return `<div class="monthnav"><button class="iconbtn" id="dPrev" aria-label="Dia anterior">‹</button>
    <button class="dia-titulo" id="dHoje"><strong>${fmtD(diaAg)}</strong>${diaAg !== today() ? '<br><span class="small muted">voltar para hoje</span>' : ''}</button>
    <button class="iconbtn" id="dNext" aria-label="Próximo dia">›</button></div>
  ${lista.length ? `<div class="chips etapas"><span class="chip">A fazer ${cont(['aguardando', 'confirmado'])}</span><span class="chip">Em andamento ${cont(['producao'])}</span><span class="chip">Pronto ${cont(['pronto'])}</span><span class="chip">Entregue ${cont(['entregue'])}</span></div>
  ${Object.keys(prod).length ? `<details class="card producao" ${diaAg === today() ? 'open' : ''}><summary><strong>🧁 Produção do dia</strong></summary>${Object.entries(prod).map(([k, q]) => { const [d, u] = k.split('|'); return `<div class="kv"><span>${esc(d)}</span><strong>${fmtQtd(q, u)}</strong></div>`; }).join('')}</details>` : ''}
  ${Object.entries(porHora).map(([h, ps]) => `<div class="hora-bloco"><div class="hora">${esc(h)}${ps.length > 1 ? `<span class="small muted"> · ${ps.length} pedidos</span>` : ''}</div>${ps.map(card).join('')}</div>`).join('')}`
    : `<div class="empty">Nenhum pedido para ${fmtD(diaAg)}.</div>`}
  <button class="btn go" id="dNovo">Novo ${voc().p.toLowerCase()} para ${fmtD(diaAg)}</button>`;
}
function agendaMes() {
  const [y, m] = mesAg.split('-').map(Number);
  const first = new Date(y, m - 1, 1), dias = new Date(y, m, 0).getDate(), t = today();
  let cells = WD.map(w => `<span class="wd">${w}</span>`).join('');
  for (let i = 0; i < first.getDay(); i++) cells += '<span class="pad"></span>';
  for (let d = 1; d <= dias; d++) {
    const ds = `${y}-${pad(m)}-${pad(d)}`, n = contaNoDia(ds), bl = S.bloqueios.includes(ds);
    const cls = [bl ? 'blocked' : (n >= S.neg.limite ? 'full' : ''), ds < t ? 'past' : '', ds === t ? 'today' : ''].join(' ');
    cells += `<button class="${cls}" data-day="${ds}" aria-label="${fmtD(ds)}: ${bl ? 'folga' : n + ' de ' + S.neg.limite}">${d}<small>${bl ? 'folga' : n + '/' + S.neg.limite}</small></button>`;
  }
  return `<div class="sum" style="display:flex;justify-content:space-between;align-items:center">
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
  const item = (go, ic, t, s, badge) => `<button class="menu-item" data-go="${go}"><span class="ic">${ic}</span><span><strong>${t}</strong>${badge ? ` <span class="badge late">${badge}</span>` : ''}<br><span class="small muted">${s}</span></span><span class="chev">›</span></button>`;
  return `<header class="top"><div><h1>Mais</h1></div></header>
  <div class="menu">
    ${item('produtos', '🧁', 'Produtos e cardápio', `${nAt} ${nAt === 1 ? 'produto ativo' : 'produtos ativos'}`)}
    ${item('grupos', '🗂️', 'Grupos e subgrupos', `${grupos().length} ${grupos().length === 1 ? 'grupo' : 'grupos'}`)}
    ${item('clientes', '👥', 'Clientes', `${S.clientes.length} ${S.clientes.length === 1 ? 'cliente' : 'clientes'}`)}
    ${item('relatorio', '📊', 'Relatório e lucratividade', 'Vendas, custos, descontos e taxas')}
    ${item('entrega', '🚗', 'Entrega, pagamento e horários', 'Taxas de deslocamento e da maquininha')}
    ${item('ajustes', '⚙️', 'Ajustes e mensagens', 'Nome, Pix, WhatsApp e texto de cobrança')}
    ${item('suporte', '💬', 'Suporte', 'Abrir e acompanhar chamados', S.chamadosNaoLidos ? S.chamadosNaoLidos + ' nova' + (S.chamadosNaoLidos > 1 ? 's' : '') : '')}
    ${souAdmin ? `<a class="menu-item" href="admin.html"><span class="ic">🛡️</span><span><strong>Painel do administrador</strong><br><span class="small muted">Acessos, links visitados e chamados</span></span><span class="chev">›</span></a>` : ''}
  </div>
  <button class="btn ghost" id="mLink">Copiar link do cardápio para clientes</button>`;
}
function telaClientes() {
  const q = norm(buscaCli);
  const lista = S.clientes.filter(c => !q || norm(nomeCompleto(c) + ' ' + c.whats).includes(q)).sort((a, b) => nomeCompleto(a).localeCompare(nomeCompleto(b)));
  const info = c => { const ps = S.pedidos.filter(p => p.clienteId === c.id && aceito(p)); return { n: ps.length, total: ps.reduce((a, p) => a + p.valor, 0), deve: ps.reduce((a, p) => a + saldo(p), 0) }; };
  return `<header class="top"><div><button class="more back" data-go="mais">‹ Mais</button><h1>Clientes</h1></div><button class="iconbtn" id="cNovo" aria-label="Novo cliente">＋</button></header>
  <input class="t" id="cBusca" placeholder="Buscar por nome ou WhatsApp" value="${esc(buscaCli)}" autocomplete="off">
  <div id="cLista">${lista.length ? lista.map(c => { const i = info(c); return `<button class="row-card" data-cli="${c.id}">
      <span class="avatar">${esc(c.nome.charAt(0).toUpperCase())}</span>
      <span class="grow"><strong>${esc(nomeCompleto(c))}</strong>${c.origem === 'agenda' ? ' <span class="badge rose">veio da agenda</span>' : ''}<br><span class="small muted">${c.whats ? fmtTel(c.whats) : 'sem WhatsApp'} · ${i.n} ${i.n === 1 ? 'pedido' : 'pedidos'} · ${brl(i.total)}</span></span>
      ${i.deve > 0 ? `<span class="badge late">deve ${brl(i.deve)}</span>` : ''}</button>`; }).join('') : '<div class="empty" style="margin-top:12px">Nenhum cliente encontrado.</div>'}</div>`;
}
function telaProdutos() {
  const porGrupo = {};
  S.produtos.slice().sort((a, b) => (nomeCat(a.grupoId) || 'zzz').localeCompare(nomeCat(b.grupoId) || 'zzz') || nomeCat(a.subgrupoId).localeCompare(nomeCat(b.subgrupoId)) || a.nome.localeCompare(b.nome))
    .forEach(p => { const g = nomeCat(p.grupoId) || 'Sem grupo'; (porGrupo[g] = porGrupo[g] || []).push(p); });
  const margem = p => p.preco > 0 && p.custo > 0 ? Math.round((p.preco - p.custo) / p.preco * 100) : null;
  return `<header class="top"><div><button class="more back" data-go="mais">‹ Mais</button><h1>Produtos</h1><p class="sub">O que estiver "no cardápio" aparece para os clientes</p></div><button class="iconbtn" id="pNovo" aria-label="Novo produto">＋</button></header>
  ${Object.keys(porGrupo).length ? Object.entries(porGrupo).map(([g, ps]) => `<h2>${esc(g)}</h2>${ps.map(p => { const mg = margem(p); return `
    <button class="row-card ${p.ativo ? '' : 'off'}" data-prod="${p.id}">${thumb(p.foto, p.nome)}
      <span class="grow"><strong>${esc(p.nome)}</strong><br><span class="small muted">${p.subgrupoId ? esc(nomeCat(p.subgrupoId)) + ' · ' : ''}${precoUn(p.preco, p.un)}${mg != null ? ' · margem ' + mg + '%' : ' · <span style="color:var(--late)">sem custo</span>'}</span></span>
      ${!p.ativo ? '<span class="badge">inativo</span>' : !p.cardapio ? '<span class="badge">fora do cardápio</span>' : ''}</button>`; }).join('')}`).join('')
    : '<div class="empty" style="margin-top:12px">Cadastre seus produtos com foto, preço e custo. Eles viram o cardápio que o cliente vê no link.</div>'}`;
}
function telaGrupos() {
  return `<header class="top"><div><button class="more back" data-go="mais">‹ Mais</button><h1>Grupos e subgrupos</h1><p class="sub">Organizam o cardápio e filtram os relatórios</p></div><button class="iconbtn" id="gNovo" aria-label="Novo grupo">＋</button></header>
  ${grupos().length ? grupos().map(g => { const n = S.produtos.filter(p => p.grupoId === g.id).length; return `<div class="card grupo-card">
    <div class="g-top"><strong>${esc(g.nome)}</strong><span class="small muted">${n} ${n === 1 ? 'produto' : 'produtos'}</span><button class="more" data-ecat="${g.id}">Editar</button></div>
    <div class="subs">${subgrupos(g.id).map(s => `<button class="chip" data-ecat="${s.id}">${esc(s.nome)}</button>`).join('')}<button class="chip novo" data-nsub="${g.id}">＋ subgrupo</button></div>
  </div>`; }).join('') : '<div class="empty">Crie grupos como Bolos, Docinhos, Salgados. Dentro deles, subgrupos como Festa, Tradicionais, Gourmet.</div>'}`;
}
function telaSuporte() {
  return `<header class="top"><div><button class="more back" data-go="mais">‹ Mais</button><h1>Suporte</h1><p class="sub">Dúvidas, problemas ou sugestões</p></div></header>
  <button class="btn go" id="sNovo">Abrir chamado</button>
  ${window.DNM_CONFIG?.SUPORTE_WHATSAPP ? `<a class="btn wa" href="${waLinkTel(window.DNM_CONFIG.SUPORTE_WHATSAPP, 'Oi! Sou da ' + S.neg.nome + ' e preciso de ajuda com o Doce na Mão.')}" target="_blank" rel="noopener">Falar com o suporte no WhatsApp</a>` : ''}
  <h2>Meus chamados</h2><div id="sLista"><p class="loading">Carregando…</p></div>`;
}
function telaRelatorio() {
  const [y, m] = relMes.split('-').map(Number);
  const doMes = S.pedidos.filter(p => aceito(p) && ((p.data || p.criado).slice(0, 7) === relMes));
  const filtraItem = i => { if (!relGrupo && !relSub) return true; const pr = S.produtos.find(x => x.id === i.produtoId); if (!pr) return false; return (!relGrupo || pr.grupoId === relGrupo) && (!relSub || pr.subgrupoId === relSub); };
  const filtrando = !!(relGrupo || relSub);
  const vendido = doMes.reduce((a, p) => a + p.valor, 0);
  const recebido = S.pedidos.flatMap(p => p.pagamentos).filter(x => x.d.slice(0, 7) === relMes).reduce((a, x) => a + Number(x.v), 0);
  const receber = S.pedidos.filter(aceito).reduce((a, p) => a + saldo(p), 0);
  let receita = 0, custo = 0, semCusto = 0, abaixo = 0, acima = 0, tabela = 0, txEnt = 0, txPag = 0;
  const porProd = {}, porGrupo = {}, porCli = {};
  doMes.forEach(p => {
    txEnt += p.taxaEnt || 0; txPag += p.taxaPag || 0;
    p.itens.filter(filtraItem).forEach(i => {
      const rec = r2(i.qtd * i.preco), cu = r2(i.qtd * (i.custo || 0)), d = r2(i.qtd * (i.preco - i.precoTab));
      receita += rec; custo += cu; tabela += r2(i.qtd * i.precoTab); if (!i.custo) semCusto += rec;
      if (d < 0) abaixo += d; else acima += d;
      const pr = S.produtos.find(x => x.id === i.produtoId);
      const g = pr ? (relGrupo ? nomeCat(pr.subgrupoId) || 'Sem subgrupo' : nomeCat(pr.grupoId) || 'Sem grupo') : 'Sem grupo';
      porGrupo[g] = (porGrupo[g] || 0) + rec;
      const o = porProd[i.desc] = porProd[i.desc] || { rec: 0, lucro: 0, semCusto: false }; o.rec += rec; o.lucro += rec - cu; if (!i.custo) o.semCusto = true;
    });
    if (!filtrando && p.itens.length) { receita += p.ajuste || 0; if (p.ajuste < 0) abaixo += p.ajuste; else acima += p.ajuste; }
    if (!filtrando && !p.itens.length) { const v = produtosPed(p); receita += v; semCusto += v; }
    if (!filtrando || p.itens.some(filtraItem)) { const k = nomeCliente(p); porCli[k] = (porCli[k] || 0) + p.valor; }
  });
  receita = r2(receita); custo = r2(custo);
  const lucro = r2(receita - custo), mg = receita > 0 ? Math.round(lucro / receita * 100) : 0, liquido = r2(acima + abaixo);
  const bars = (arr, fmt = v => brl(v)) => { if (!arr.length) return '<p class="muted small">Sem dados neste período.</p>'; const mx = Math.max(...arr.map(x => Math.abs(x[1]))) || 1; return `<div class="bars">${arr.map(([k, v, extra]) => `<div class="b"><div><span>${esc(k)}${extra || ''}</span><strong>${fmt(v)}</strong></div><i style="width:${Math.max(4, Math.abs(v) / mx * 100)}%"></i></div>`).join('')}</div>`; };
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const lucroProd = Object.entries(porProd).map(([k, o]) => [k, r2(o.lucro), o.semCusto ? ' <span class="badge late">sem custo</span>' : '']).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `<header class="top"><div><button class="more back" data-go="mais">‹ Mais</button><h1>Relatório</h1></div></header>
  <div class="monthnav"><button class="iconbtn" id="rPrev" aria-label="Mês anterior">‹</button><strong style="text-transform:capitalize">${new Date(y, m - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</strong><button class="iconbtn" id="rNext" aria-label="Próximo mês">›</button></div>
  <div class="two"><select class="t" id="rGrupo"><option value="">Todos os grupos</option>${grupos().map(g => `<option value="${g.id}" ${relGrupo === g.id ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')}</select>
  <select class="t" id="rSub" ${relGrupo ? '' : 'disabled'}><option value="">Todos os subgrupos</option>${relGrupo ? subgrupos(relGrupo).map(s => `<option value="${s.id}" ${relSub === s.id ? 'selected' : ''}>${esc(s.nome)}</option>`).join('') : ''}</select></div>
  ${!filtrando ? `<div class="sums" style="margin-top:12px">
    <div class="sum"><b>${brl(vendido)}</b><span>vendido (${doMes.length} ${doMes.length === 1 ? 'pedido' : 'pedidos'})</span></div>
    <div class="sum"><b>${brl(recebido)}</b><span>recebido no mês</span></div>
    <div class="sum"><b>${brl(receber)}</b><span>a receber (tudo)</span></div>
    <div class="sum"><b>${doMes.length ? brl(vendido / doMes.length) : brl(0)}</b><span>valor médio</span></div>
  </div>` : ''}
  <h2>💰 Lucratividade${filtrando ? ' do filtro' : ''}</h2>
  <div class="card" style="margin-top:0">
    <div class="kv"><span>Receita de produtos</span><strong>${brl(receita)}</strong></div>
    <div class="kv"><span>Custo dos produtos</span><strong style="color:var(--late)">−${brl(custo)}</strong></div>
    <div class="kv big"><span>Lucro bruto</span><strong style="color:${lucro < 0 ? 'var(--late)' : 'var(--go)'}">${brl(lucro)}</strong></div>
    <div class="kv" style="border:0"><span>Margem</span><strong>${mg}%</strong></div>
    ${semCusto > 0 ? `<p class="warn" style="margin:6px 0 0">${brl(semCusto)} vendidos sem custo cadastrado. Preencha o custo em Produtos para o lucro ficar certo.</p>` : ''}
  </div>
  <h2>🏷️ Preço praticado × tabela</h2>
  <div class="card" style="margin-top:0">
    <div class="kv"><span>Pela tabela seria</span><strong>${brl(tabela)}</strong></div>
    <div class="kv"><span>Descontos dados</span><strong style="color:var(--late)">${brl(abaixo)}</strong></div>
    <div class="kv"><span>Acréscimos cobrados</span><strong style="color:var(--go)">${brl(acima)}</strong></div>
    <div class="kv" style="border:0"><span>Resultado</span><strong style="color:${liquido < 0 ? 'var(--late)' : 'var(--go)'}">${liquido < 0 ? 'vendeu ' + brl(-liquido) + ' abaixo' : liquido > 0 ? 'vendeu ' + brl(liquido) + ' acima' : 'igual à tabela'}</strong></div>
  </div>
  ${!filtrando ? `<h2>🚗 Taxas cobradas dos clientes</h2>
  <div class="card" style="margin-top:0">
    <div class="kv"><span>Taxas de entrega</span><strong>${brl(txEnt)}</strong></div>
    <div class="kv" style="border:0"><span>Taxas de maquininha repassadas</span><strong>${brl(txPag)}</strong></div>
    <p class="small muted" style="margin:6px 0 0">A taxa da maquininha cobre o que a operadora desconta; não entra no lucro.</p>
  </div>` : ''}
  <h2>${relGrupo ? 'Vendas por subgrupo' : 'Vendas por grupo'}</h2>${bars(top(porGrupo))}
  <h2>Produtos que mais dão lucro</h2>${bars(lucroProd)}
  <h2>Clientes que mais compram</h2>${bars(top(porCli))}`;
}

function render() {
  if (!S.neg) return;
  document.body.classList.remove('sem-nav');
  const v = voc();
  $$('[data-voc="plural"]').forEach(e => e.textContent = v.pl);
  $('#fab').setAttribute('aria-label', 'Novo ' + v.p.toLowerCase());
  const navTab = ['clientes', 'produtos', 'relatorio', 'grupos', 'suporte'].includes(tab) ? 'mais' : tab;
  $$('nav.bar [data-tab]').forEach(b => { if (b.dataset.tab === navTab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const dot = $('#dotNovos'); if (dot) dot.hidden = !S.pedidos.some(p => p.status === 'solicitado');
  const dotM = $('#dotMais'); if (dotM) dotM.hidden = !S.chamadosNaoLidos;
  $('#app').innerHTML = { hoje: telaHoje, pedidos: telaPedidos, agenda: telaAgenda, mais: telaMais, clientes: telaClientes, produtos: telaProdutos, relatorio: telaRelatorio, grupos: telaGrupos, suporte: telaSuporte }[tab]();
  bindTickets($('#app'));
  $$('#app [data-go]').forEach(b => b.onclick = () => b.dataset.go === 'ajustes' ? abrirAjustes() : b.dataset.go === 'entrega' ? abrirEntregaPagamento() : go(b.dataset.go));
  $$('#app [data-diaag]').forEach(b => b.onclick = () => { diaAg = b.dataset.diaag; modoAg = 'dia'; go('agenda'); });
  if (tab === 'hoje') {
    $('#ajustes').onclick = abrirAjustes;
    const al = alertas();
    $$('[data-al]').forEach(b => b.onclick = () => { const a = al[+b.dataset.al]; if (a.suporte) return go('suporte'); if (a.agenda) { diaAg = today(); modoAg = 'dia'; return go('agenda'); } if (a.lista.length === 1 && !a.cobrar) abrirPedido(a.lista[0].id); else abrirFila(a); });
  }
  if (tab === 'pedidos') $$('[data-f]').forEach(b => b.onclick = () => { filtro = b.dataset.f; render(); });
  if (tab === 'agenda') {
    $$('[data-modo]').forEach(b => b.onclick = () => { modoAg = b.dataset.modo; render(); });
    if (modoAg === 'dia') {
      $('#dPrev').onclick = () => { diaAg = addDays(diaAg, -1); render(); };
      $('#dNext').onclick = () => { diaAg = addDays(diaAg, 1); render(); };
      $('#dHoje').onclick = () => { diaAg = today(); render(); };
      $('#dNovo').onclick = () => abrirFormPedido(null, { data: diaAg });
      $$('[data-avanca]').forEach(b => b.onclick = () => mudarStatus(S.pedidos.find(p => String(p.id) === b.dataset.avanca), PROXIMO[S.pedidos.find(p => String(p.id) === b.dataset.avanca).status][0], b));
    } else {
      const muda = async d => { const n = Math.max(1, Math.min(50, S.neg.limite + d)); if (n === S.neg.limite) return; S.neg.limite = n; render(); await tenta(() => DB.salvarNegocio(S.neg)).catch(() => {}); };
      $('#menos').onclick = () => muda(-1); $('#mais').onclick = () => muda(1);
      $('#mPrev').onclick = () => { mesAg = addMonths(mesAg + '-01', -1).slice(0, 7); render(); };
      $('#mNext').onclick = () => { mesAg = addMonths(mesAg + '-01', 1).slice(0, 7); render(); };
      $$('[data-day]').forEach(b => b.onclick = () => abrirDia(b.dataset.day));
      $('#link').onclick = () => copiar(linkAgenda(), 'Link copiado. Cole na bio do Instagram ou no WhatsApp.');
    }
  }
  if (tab === 'mais') $('#mLink').onclick = () => copiar(linkAgenda(), 'Link copiado. Cole na bio do Instagram ou no WhatsApp.');
  if (tab === 'clientes') {
    $('#cNovo').onclick = () => abrirCliente(null);
    $$('[data-cli]').forEach(b => b.onclick = () => abrirCliente(b.dataset.cli));
    const inp = $('#cBusca'); inp.oninput = () => { buscaCli = inp.value; const pos = inp.selectionStart; render(); const n = $('#cBusca'); n.focus(); n.setSelectionRange(pos, pos); };
  }
  if (tab === 'produtos') { $('#pNovo').onclick = () => abrirProduto(null); $$('[data-prod]').forEach(b => b.onclick = () => abrirProduto(b.dataset.prod)); }
  if (tab === 'grupos') {
    $('#gNovo').onclick = () => abrirCategoria(null, '');
    $$('[data-ecat]').forEach(b => b.onclick = () => abrirCategoria(b.dataset.ecat));
    $$('[data-nsub]').forEach(b => b.onclick = () => abrirCategoria(null, b.dataset.nsub));
  }
  if (tab === 'relatorio') {
    $('#rPrev').onclick = () => { relMes = addMonths(relMes + '-01', -1).slice(0, 7); render(); };
    $('#rNext').onclick = () => { relMes = addMonths(relMes + '-01', 1).slice(0, 7); render(); };
    $('#rGrupo').onchange = e => { relGrupo = e.target.value; relSub = ''; render(); };
    $('#rSub').onchange = e => { relSub = e.target.value; render(); };
  }
  if (tab === 'suporte') { $('#sNovo').onclick = abrirNovoChamado; carregarChamados(); }
}
function go(t) { tab = t; render(); window.scrollTo(0, 0); }

/* ---------- folha (sheet) com botão de fechar, arrastar e voltar ---------- */
let sheetHist = false;
function abrir(html) {
  $('#sheetBody').innerHTML = html;
  const sh = $('#sheet'); sh.classList.add('open'); sh.style.transform = ''; $('#sheetBg').classList.add('open'); sh.scrollTop = 0;
  document.body.classList.add('sheet-aberta');
  if (!sheetHist) { try { history.pushState({ sheet: 1 }, ''); sheetHist = true; } catch (e) {} }
}
function fecharSheet() { $('#sheet').classList.remove('open'); $('#sheetBg').classList.remove('open'); document.body.classList.remove('sheet-aberta'); }
function fechar() { if (sheetHist) { sheetHist = false; try { history.back(); } catch (e) {} } fecharSheet(); }
window.addEventListener('popstate', () => { if ($('#sheet').classList.contains('open')) { sheetHist = false; fecharSheet(); } });
(function arrastarParaFechar() {
  const topo = $('#sheetTopo'), sh = $('#sheet'); let y0 = null, dy = 0;
  topo.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; dy = 0; sh.style.transition = 'none'; }, { passive: true });
  topo.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
  topo.addEventListener('touchend', () => { sh.style.transition = ''; if (dy > 90) fechar(); else sh.style.transform = ''; y0 = null; });
})();

/* ---------- mensagens (com carinho e espaço entre as informações) ---------- */
function linhasItens(p) {
  const l = p.itens.length ? p.itens.map(i => `• ${fmtQtd(i.qtd, i.un)} ${i.desc} — ${brl(r2(i.qtd * i.preco))}`) : [`• ${p.desc}`];
  if (p.itens.length && p.ajuste) l.push(`${p.ajuste < 0 ? '🎁 Desconto' : '➕ Acréscimo'}: ${brl(Math.abs(p.ajuste))}`);
  return l.join('\n');
}
function blocoValores(p) {
  const l = [];
  if (p.taxaEnt) l.push(`🚗 Entrega${p.regiao ? ' (' + p.regiao + ')' : ''}: ${brl(p.taxaEnt)}`);
  if (p.taxaPag) l.push(`💳 Taxa ${p.forma ? 'do ' + p.forma.toLowerCase() : 'da maquininha'}: ${brl(p.taxaPag)}`);
  l.push(`💰 Total: ${brl(p.valor)}`);
  return l.join('\n');
}
function blocoEntrega(p) {
  const c = cliDe(p), cfg = cfgNeg(), l = [];
  if (p.data) l.push(`📅 ${p.entrega === 'entrega' ? 'Entrega' : 'Retirada'}: ${quando(p.data, p.hora)}`);
  if (p.entrega === 'entrega' && c && c.endereco) l.push(`📍 Endereço: ${c.endereco}`);
  if (p.entrega !== 'entrega' && cfg.entrega.endereco_retirada) l.push(`📍 Retirada em: ${cfg.entrega.endereco_retirada}`);
  return l.join('\n');
}
function msgPedido(p) {
  const c = cliDe(p), link = linkCliente(c), pg = pago(p), blocos = [];
  blocos.push(`Olá, ${primeiroNome(p)}! 🌸`);
  blocos.push(`Aqui é da ${S.neg.nome}, que alegria preparar o seu pedido! 💕`);
  blocos.push(`🧾 Pedido #${noPad(p.no)}\n${linhasItens(p)}`);
  blocos.push(blocoValores(p));
  const ent = blocoEntrega(p); if (ent) blocos.push(ent);
  if (p.forma) blocos.push(`💳 Pagamento: ${p.forma}`);
  if (p.status === 'aguardando' && p.sinal > pg) blocos.push(`✨ Para garantir a sua data, o sinal é de ${brl(r2(p.sinal - pg))}.` + (S.neg.pix ? `\n🔑 Pix: ${S.neg.pix}` : ''));
  else if (saldo(p) > 0) blocos.push(`💸 Falta pagar ${brl(saldo(p))}${venc(p) ? ' até ' + fmtD(venc(p)) : ''}.` + (S.neg.pix ? `\n🔑 Pix: ${S.neg.pix}` : ''));
  else blocos.push('🎉 Está tudo pago, obrigada!');
  if (p.obs) blocos.push(`📝 ${p.obs}`);
  if (link) blocos.push(`📲 Acompanhe seus pedidos por aqui:\n${link}`);
  blocos.push('Qualquer dúvida, é só me chamar! 🥰');
  return blocos.join('\n\n');
}
function msgCobranca(p) {
  const c = cliDe(p), s = saldo(p), pg = pago(p);
  let linha;
  if (p.status === 'aguardando' && p.sinal > pg) linha = `✨ Sinal para garantir a data: ${brl(r2(p.sinal - pg))}`;
  else if (s > 0) linha = `💸 Falta pagar: ${brl(s)}${atrasado(p) ? ' (venceu ' + fmtD(venc(p)) + ')' : ''}`;
  else linha = '🎉 Está tudo pago!';
  const rep = {
    '{cliente}': primeiroNome(p), '{negocio}': S.neg.nome, '{numero}': noPad(p.no),
    '{descricao}': p.itens.length ? resumoItens(p.itens) : p.desc, '{itens}': p.itens.length ? resumoItens(p.itens) : p.desc,
    '{data}': p.data ? quando(p.data, p.hora) : 'hoje', '{vencimento}': venc(p) ? fmtD(venc(p)) : 'hoje', '{valor}': brl(p.valor),
    '{pago}': brl(pg), '{falta}': brl(s), '{linha_sinal}': linha, '{pix}': S.neg.pix || '', '{endereco}': c?.endereco || '',
    '{link}': linkCliente(c) || ''
  };
  let txt = S.neg.texto || TEXTO_PADRAO;
  for (const k in rep) txt = txt.split(k).join(rep[k]);
  return txt.split('\n\n').filter(b => !/(:\s*|aqui:\s*)$/.test(b.trim())).join('\n\n').trim();
}
function msgPagamento(p, valor, forma) {
  const s = saldo(p), blocos = [`Oi, ${primeiroNome(p)}! 💖`, `Recebi seu pagamento de ${brl(valor)}${forma ? ' via ' + forma : ''}. Muito obrigada! 🙏✨`,
    `🧾 Pedido #${noPad(p.no)}\n✅ Pago até agora: ${brl(pago(p))}\n${s > 0 ? '💸 Falta: ' + brl(s) : '🎉 Pedido quitado!'}`];
  if (p.data) blocos.push(`📅 ${p.entrega === 'entrega' ? 'Entrega' : 'Retirada'}: ${quando(p.data, p.hora)}`);
  blocos.push(`Com carinho, ${S.neg.nome} 🌸`);
  return blocos.join('\n\n');
}
function msgPronto(p) {
  const cfg = cfgNeg(), blocos = [`Oi, ${primeiroNome(p)}! 🎉`, `Seu pedido #${noPad(p.no)} está prontinho e ficou lindo! 😍`];
  blocos.push(p.entrega === 'entrega' ? `🚗 Já já sai para entrega${p.hora ? ', previsão às ' + p.hora : ''}.` : `🏠 Pode vir buscar${p.hora ? ' a partir das ' + p.hora : ''}${cfg.entrega.endereco_retirada ? '\n📍 ' + cfg.entrega.endereco_retirada : ''}`);
  if (saldo(p) > 0) blocos.push(`💸 Falta pagar ${brl(saldo(p))}${S.neg.pix ? '\n🔑 Pix: ' + S.neg.pix : ''}`);
  blocos.push(`Com carinho, ${S.neg.nome} 🌸`);
  return blocos.join('\n\n');
}
function msgRecusa(p) {
  return [`Oi, ${primeiroNome(p)}! 🌷`, `Aqui é da ${S.neg.nome}. Muito obrigada pelo carinho de escolher a gente 💕`,
    `Recebi seu pedido #${noPad(p.no)} para ${quando(p.data, p.hora)}, mas infelizmente não vou conseguir atender nessa data. 😔`,
    'Posso te sugerir outro dia? Vou adorar preparar para você! 🥰'].join('\n\n');
}

/* ---------- mudança de etapa (usada na agenda do dia e no pedido) ---------- */
async function mudarStatus(p, novo, botao, depois) {
  if (!p || novo === p.status) return;
  const v = voc(), virouEntregue = novo === 'entregue' && p.status !== 'entregue';
  await tenta(async () => {
    await DB.atualizarPedido(p.id, { status: novo }); p.status = novo;
    if (virouEntregue && p.repetir && p.data) {
      const nd = p.repetir === 'semanal' ? addDays(p.data, 7) : addMonths(p.data, 1);
      const dados = { ...p, data: nd, venc: nd, status: 'confirmado', origem: 'app', anexos: [] };
      const prox = await DB.salvarPedido(null, dados, p.itens.map(({ id, ...i }) => i));
      S.pedidos.push(prox); toast(`Próxima ${v.p.toLowerCase()} criada para ${fmtD(nd)}`);
    }
    render();
    if (novo === 'pronto') abrirAvisoPronto(p);
    else if (depois) depois();
    else toast(STATUS_NOMES[novo]);
  }, botao).catch(() => {});
}
function abrirAvisoPronto(p) {
  abrir(`<h1 class="sh-title">✓ #${noPad(p.no)} está pronto</h1><p class="sub">Quer avisar ${esc(primeiroNome(p))}? A mensagem já está pronta.</p>
    <div class="msg">${esc(msgPronto(p))}</div>
    <a class="btn wa" href="${waLinkTel(telCliente(p), msgPronto(p))}" target="_blank" rel="noopener">Avisar no WhatsApp</a>
    <button class="btn ghost" id="apVer">Ver pedido</button>`);
  $('#apVer').onclick = () => abrirPedido(p.id);
}

/* =========================================================
   Formulário de pedido (novo, editar, revisar pedido da agenda)
   ========================================================= */
function abrirFormPedido(ped = null, opts = {}) {
  const v = voc(), rec = S.neg.seg === 'servico', aceitar = !!opts.aceitar, cfg = cfgNeg();
  const st = {
    cli: ped ? (cliDe(ped) || null) : (opts.cliente || null),
    itens: ped ? ped.itens.map(i => ({ ...i })) : [],
    anexos: ped ? (ped.anexos || []).map(a => ({ ...a })) : [],
    dirtySob: false, taxaEntManual: ped && ped.entrega === 'entrega' ? ped.taxaEnt : null
  };
  const nomeIni = ped && !st.cli ? ped.cliente : '';
  const titulo = aceitar ? `Revisar pedido #${noPad(ped.no)}` : ped ? `Editar #${noPad(ped.no)}` : `Novo ${v.p.toLowerCase()}`;
  const ajusteIni = ped ? (ped.ajuste || 0) : 0;
  const sinalIni = ped ? (aceitar && !ped.sinal ? '' : String(ped.sinal).replace('.', ',')) : '';
  const horas = horariosDoDia(cfg);
  const entIni = ped ? ped.entrega : (cfg.entrega.retirada ? 'retirada' : 'entrega');
  const formas = cfg.pagamentos.filter(x => x.ativo || (ped && x.nome === ped.forma));
  abrir(`<h1 class="sh-title">${titulo}</h1>
  ${aceitar ? '<p class="sub">Confira itens, entrega e pagamento. Ajuste o que precisar e aceite.</p>' : '<p class="sub">Escolha o cliente e os produtos. O resto é opcional.</p>'}

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
    <div><input class="t" id="fValor" inputmode="decimal" placeholder="Valor R$" value="${ped && !ped.itens.length ? String(produtosPed(ped)).replace('.', ',') : ''}"></div></div>
  </div>
  <div id="fAjusteBox">
    <label class="f">Desconto ou acréscimo nos produtos <em>(opcional)</em></label>
    <div class="two"><select class="t" id="fAjTipo"><option value="-1" ${ajusteIni < 0 ? 'selected' : ''}>Desconto</option><option value="1" ${ajusteIni > 0 ? 'selected' : ''}>Acréscimo</option></select>
    <input class="t" id="fAjVal" inputmode="decimal" placeholder="R$ 0,00" value="${ajusteIni ? String(Math.abs(ajusteIni)).replace('.', ',') : ''}"></div>
  </div>

  <div class="two"><div><label class="f" for="fData">Data <em>(opcional)</em></label><input class="t" id="fData" type="date" value="${ped ? ped.data : (opts.data || '')}"></div>
  <div><label class="f" for="fHora">Horário</label><input class="t" id="fHora" type="time" list="fHoras" value="${ped ? ped.hora : ''}"><datalist id="fHoras">${horas.map(h => `<option value="${h}">`).join('')}</datalist></div></div>
  <div id="fWarn"></div>

  <label class="f">Entrega</label>
  <div class="seg" id="fEnt"><button type="button" data-ent="retirada" aria-pressed="${entIni === 'retirada'}">🏠 Retirada</button><button type="button" data-ent="entrega" aria-pressed="${entIni === 'entrega'}">🚗 Entrega</button></div>
  <div id="fEntBox" class="two" style="margin-top:8px">
    <div>${cfg.entrega.regioes.length ? `<select class="t" id="fRegiao"><option value="">Região…</option>${cfg.entrega.regioes.map(r => `<option value="${esc(r.nome)}" ${ped && ped.regiao === r.nome ? 'selected' : ''}>${esc(r.nome)} · ${brl(r.valor)}</option>`).join('')}</select>` : '<input class="t" id="fRegiao" placeholder="Bairro (opcional)" value="' + esc(ped?.regiao || '') + '">'}</div>
    <div><input class="t" id="fTxEnt" inputmode="decimal" placeholder="Taxa R$"></div>
  </div>

  <label class="f" for="fForma">Forma de pagamento</label>
  <select class="t" id="fForma"><option value="">Não informada</option>${formas.map(x => `<option value="${esc(x.nome)}" ${ped && ped.forma === x.nome ? 'selected' : ''}>${esc(x.nome)}${x.taxa ? ' (+' + fmtPct(x.taxa) + ')' : ''}</option>`).join('')}</select>
  <div id="fTotais" class="totais"></div>

  <div class="two"><div><label class="f" for="fVenc">Pagar até</label><input class="t" id="fVenc" type="date" value="${ped ? (ped.venc || '') : (opts.data || '')}"></div>
  <div><label class="f" for="fSinal">Sinal (R$)</label><input class="t" id="fSinal" inputmode="decimal" value="${sinalIni}" placeholder="vazio = metade"></div></div>

  <label class="f">Inspirações <em>(fotos de topper, bolo, docinhos…)</em></label>
  <div id="fAnexos" class="anexos"></div>
  <label class="btn ghost mini" for="fAnexoArq" style="margin-top:6px">📷 Anexar foto</label><input type="file" id="fAnexoArq" accept="image/*" hidden>

  ${rec ? `<label class="f" for="fRep">Repetir</label><select class="t" id="fRep"><option value="">Não repete</option><option value="semanal" ${ped?.repetir === 'semanal' ? 'selected' : ''}>Toda semana</option><option value="mensal" ${ped?.repetir === 'mensal' ? 'selected' : ''}>Todo mês</option></select>` : ''}
  <label class="f" for="fObs">Observação <em>(${esc(v.extra.toLowerCase())})</em></label><textarea class="t" id="fObs">${esc(ped?.obs || '')}</textarea>
  <button class="btn go" id="fSalvar">${aceitar ? 'Aceitar pedido' : ped ? 'Salvar alterações' : 'Salvar ' + v.p.toLowerCase()}</button>
  ${!ped ? '<p class="small muted" style="text-align:center">Sem data, vira venda avulsa (produto pronto).</p>' : ''}`);

  let entrega = entIni;

  /* ----- cliente ----- */
  function renderCli() {
    const box = $('#fCliBox');
    if (st.cli) {
      box.innerHTML = `<div class="sel-card"><span class="avatar">${esc(st.cli.nome.charAt(0).toUpperCase())}</span>
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
        <label class="f" for="fEnd">Endereço <em>(para entrega)</em></label><input class="t" id="fEnd">
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
      if (novo && !st.dirtySob) $('#fSob').value = txt.split(/\s+/).slice(1).join(' ');
    };
    inp.oninput = atualiza; atualiza();
    if (ped && !st.cli && ped.tel) $('#fWa').value = ped.tel;
  }

  /* ----- itens ----- */
  function renderItens() {
    $('#fItens').innerHTML = st.itens.map((i, k) => {
      const prod = S.produtos.find(p => p.id === i.produtoId), u = (UNIDADES[i.un] || UNIDADES.un).curto;
      return `<div class="item">
        ${thumb(prod?.foto, i.desc, 44)}
        <div class="grow"><strong>${esc(i.desc)}</strong><span class="small muted"> · tabela ${precoUn(i.precoTab, i.un)}</span>
          <div class="item-in">
            <label><span class="small muted">Qtd (${u})</span><input class="t" inputmode="decimal" data-q="${k}" value="${numBR(i.qtd)}"></label>
            <label><span class="small muted">Preço por ${u}</span><input class="t" inputmode="decimal" data-p="${k}" value="${i.preco.toFixed(2).replace('.', ',')}"></label>
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
    else st.itens.push({ produtoId: p.id, desc: p.nome, un: p.un, qtd: 1, precoTab: p.preco, preco: p.preco, custo: p.custo || 0 });
    $('#fBusca').value = ''; $('#fRes').innerHTML = ''; $('#fRes').dataset.cardapio = '';
    renderItens(); renderTotais(); toast(p.nome + ' adicionado');
  }
  const listaProdutos = lista => `<div class="pick">${lista.map(p => `<button type="button" class="pick-item" data-add="${p.id}">${thumb(p.foto, p.nome, 48)}<span class="grow"><strong>${esc(p.nome)}</strong><br><span class="small muted">${p.grupoId ? esc(nomeCat(p.grupoId)) + (p.subgrupoId ? ' › ' + esc(nomeCat(p.subgrupoId)) : '') + ' · ' : ''}${precoUn(p.preco, p.un)}</span></span><span class="plus">＋</span></button>`).join('')}</div>`;
  const bindPick = () => $$('#fRes [data-add]').forEach(b => b.onclick = () => addItem(S.produtos.find(p => p.id === b.dataset.add)));
  function busca() {
    const txt = $('#fBusca').value.trim(), q = norm(txt);
    if (!q) { $('#fRes').innerHTML = ''; return; }
    const achados = S.produtos.filter(p => p.ativo && norm(p.nome + ' ' + nomeCat(p.grupoId) + ' ' + nomeCat(p.subgrupoId)).includes(q)).slice(0, 8);
    const exato = achados.some(p => norm(p.nome) === q);
    $('#fRes').innerHTML = listaProdutos(achados) + (!exato ? `<button type="button" class="sug novo" id="fCriaProd">＋ Cadastrar produto “${esc(txt)}”</button><div id="fNovoProd"></div>` : '');
    bindPick();
    if ($('#fCriaProd')) $('#fCriaProd').onclick = () => formRapidoProduto(txt);
  }
  function formRapidoProduto(nome) {
    $('#fCriaProd').remove();
    $('#fNovoProd').innerHTML = `<div class="card" style="margin-top:8px">
      <p class="novo-tag" style="margin-top:0">Produto novo: “${esc(nome)}”</p>
      <div class="two"><div><label class="f" for="npUn">Unidade</label><select class="t" id="npUn">${Object.entries(UNIDADES).map(([k, u]) => `<option value="${k}">${u.nome}</option>`).join('')}</select></div>
      <div><label class="f" for="npPreco">Preço de venda</label><input class="t" id="npPreco" inputmode="decimal" placeholder="0,00"></div></div>
      <div class="two"><div><label class="f" for="npGrupo">Grupo</label>${selectGrupo('npGrupo', '')}</div>
      <div><label class="f" for="npSub">Subgrupo</label>${selectSub('npSub', '', '')}</div></div>
      <label class="f" for="npCusto">Custo <em>(opcional, para o lucro)</em></label><input class="t" id="npCusto" inputmode="decimal" placeholder="0,00">
      <button class="btn go" type="button" id="npOk">Cadastrar e adicionar</button></div>`;
    ligarGrupoSub('npGrupo', 'npSub');
    $('#npPreco').focus();
    $('#npOk').onclick = async () => {
      await tenta(async () => {
        const p = await DB.salvarProduto({ nome, un: $('#npUn').value, preco: num($('#npPreco').value), custo: num($('#npCusto').value), grupoId: $('#npGrupo').value, subgrupoId: $('#npSub').value, ativo: true, cardapio: true });
        S.produtos.push(p); addItem(p);
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

  /* ----- entrega ----- */
  function renderEntrega() {
    $$('#fEnt [data-ent]').forEach(b => b.setAttribute('aria-pressed', b.dataset.ent === entrega));
    $('#fEntBox').hidden = entrega !== 'entrega';
    if (entrega === 'entrega') {
      const auto = calcTaxas(0, cfg, 'entrega', $('#fRegiao').value, '').taxaEnt;
      if (st.taxaEntManual == null) $('#fTxEnt').value = auto ? String(auto).replace('.', ',') : '';
    }
  }
  $$('#fEnt [data-ent]').forEach(b => b.onclick = () => { entrega = b.dataset.ent; renderEntrega(); renderTotais(); });
  $('#fRegiao').addEventListener(cfg.entrega.regioes.length ? 'change' : 'input', () => { st.taxaEntManual = null; renderEntrega(); renderTotais(); });
  $('#fTxEnt').oninput = () => { st.taxaEntManual = num($('#fTxEnt').value); renderTotais(); };
  if (st.taxaEntManual != null) $('#fTxEnt').value = String(st.taxaEntManual).replace('.', ',');

  /* ----- totais ----- */
  const ajusteAtual = () => st.itens.length ? r2(num($('#fAjVal').value) * Number($('#fAjTipo').value)) : 0;
  const produtosAtual = () => st.itens.length ? r2(totItens(st.itens) + ajusteAtual()) : num($('#fValor').value);
  const taxas = () => {
    const prod = produtosAtual(), txEnt = entrega === 'entrega' ? num($('#fTxEnt').value) : 0;
    const pg = cfg.pagamentos.find(x => x.nome === $('#fForma').value), pct = pg ? pg.taxa : 0;
    const txPag = r2((prod + txEnt) * pct / 100);
    return { prod, txEnt, pct, txPag, total: r2(prod + txEnt + txPag) };
  };
  function renderTotais() {
    const t = taxas();
    if (!st.itens.length && !t.prod) { $('#fTotais').innerHTML = ''; return; }
    const tab = totTabela(st.itens), dif = st.itens.length ? r2(t.prod - tab) : 0;
    $('#fTotais').innerHTML = `
      ${st.itens.length ? `<div class="kv"><span>Produtos pela tabela</span><span>${brl(tab)}</span></div>` : ''}
      ${dif ? `<div class="kv"><span>${dif < 0 ? 'Desconto' : 'Acréscimo'}</span><strong style="color:${dif < 0 ? 'var(--late)' : 'var(--go)'}">${dif < 0 ? '' : '+'}${brl(dif)}</strong></div>` : ''}
      ${t.txEnt ? `<div class="kv"><span>🚗 Entrega</span><span>${brl(t.txEnt)}</span></div>` : ''}
      ${t.txPag ? `<div class="kv"><span>💳 Taxa ${esc($('#fForma').value.toLowerCase())} (${fmtPct(t.pct)})</span><span>${brl(t.txPag)}</span></div>` : ''}
      <div class="kv big"><span>Total</span><strong>${brl(t.total)}</strong></div>`;
  }
  $('#fAjVal').oninput = renderTotais; $('#fAjTipo').onchange = renderTotais; $('#fForma').onchange = renderTotais;
  $('#fValor').oninput = renderTotais;

  /* ----- anexos ----- */
  function renderAnexos() {
    $('#fAnexos').innerHTML = st.anexos.map((a, k) => `<div class="anexo"><a href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt=""></a>
      <select data-leg="${k}">${LEGENDAS.map(l => `<option ${a.legenda === l ? 'selected' : ''}>${l}</option>`).join('')}</select><button type="button" class="x" data-rmanexo="${k}" aria-label="Tirar">×</button></div>`).join('');
    $$('#fAnexos [data-leg]').forEach(s => s.onchange = () => st.anexos[+s.dataset.leg].legenda = s.value);
    $$('#fAnexos [data-rmanexo]').forEach(b => b.onclick = () => { st.anexos.splice(+b.dataset.rmanexo, 1); renderAnexos(); });
  }
  $('#fAnexoArq').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (st.anexos.length >= 6) return toast('Até 6 fotos por pedido.');
    toast('Enviando foto…');
    try { const blob = await reduzirFoto(f, DB.online ? 1200 : 500, DB.online ? 0.8 : 0.7); const url = await DB.enviarArquivo('inspiracoes', S.neg.id, blob); st.anexos.push({ url, legenda: 'Bolo' }); renderAnexos(); toast('Foto anexada'); }
    catch (err) { toast('Não consegui enviar a foto: ' + err.message); }
  };

  /* ----- data / avisos ----- */
  const chk = () => {
    const d = $('#fData').value; let w = '';
    const outros = d ? S.pedidos.filter(p => ativo(p) && p.data === d && (!ped || p.id !== ped.id)).length : 0;
    if (d) { if (S.bloqueios.includes(d)) w = 'Esse dia está marcado como folga.'; else if (outros >= S.neg.limite) w = `Esse dia já tem ${outros} de ${S.neg.limite}. Vai aceitar mesmo assim?`; }
    const h = $('#fHora').value, mesmaHora = d && h ? S.pedidos.filter(p => ativo(p) && p.data === d && p.hora === h && (!ped || p.id !== ped.id)).length : 0;
    if (mesmaHora) w += (w ? '<br>' : '') + `Já há ${mesmaHora} ${mesmaHora === 1 ? 'pedido' : 'pedidos'} às ${h}. Tudo bem, só para você saber.`;
    $('#fWarn').innerHTML = w ? `<div class="warn">${w}</div>` : '';
  };
  let vencMexido = !!(ped && ped.venc && ped.venc !== ped.data);
  $('#fVenc').oninput = () => vencMexido = true;
  $('#fData').onchange = () => { if (!vencMexido) $('#fVenc').value = $('#fData').value; chk(); };
  $('#fHora').onchange = chk;

  renderCli(); renderItens(); renderEntrega(); renderTotais(); renderAnexos(); chk();

  /* ----- salvar ----- */
  $('#fSalvar').onclick = async () => {
    let cli = st.cli, novoCli = null;
    if (!cli) {
      const txt = ($('#fCli') ? $('#fCli').value : '').trim();
      if (!txt) { toast('Escolha ou digite o cliente.'); $('#fCli')?.focus(); return; }
      if (!$('#fCliNovo').hidden) novoCli = { nome: txt.split(/\s+/)[0], sobrenome: $('#fSob').value.trim(), whats: $('#fWa').value.replace(/\D/g, ''), endereco: $('#fEnd').value.trim() };
      else cli = S.clientes.find(c => norm(nomeCompleto(c)) === norm(txt) || norm(c.nome) === norm(txt));
    }
    if (st.itens.some(i => !(i.qtd > 0))) { toast('Tem item com quantidade zerada.'); return; }
    const itens = st.itens;
    const descLivre = $('#fDesc').value.trim();
    if (!itens.length && (!descLivre || !num($('#fValor').value))) { toast('Adicione um produto, ou descreva e informe o valor.'); return; }
    const t = taxas();
    if (t.prod < 0) { toast('O desconto ficou maior que o valor dos produtos.'); return; }
    if (entrega === 'entrega' && cfg.entrega.regioes.length && !$('#fRegiao').value && !num($('#fTxEnt').value)) { toast('Escolha a região de entrega ou informe a taxa.'); return; }
    const data = $('#fData').value, vencimento = $('#fVenc').value || data;
    const sTxt = $('#fSinal').value.trim();
    const sinal = sTxt !== '' ? num(sTxt) : (data ? r2(t.total / 2) : 0);
    let status;
    if (ped && !aceitar) status = ped.status;
    else status = data ? (sinal > 0 ? 'aguardando' : 'confirmado') : 'entregue';
    if (ped && !aceitar && ped.status === 'aguardando' && pago(ped) >= sinal) status = 'confirmado';
    await tenta(async () => {
      if (novoCli) { cli = await DB.salvarCliente(novoCli); S.clientes.push(cli); }
      const dados = {
        clienteId: cli ? cli.id : '', cliente: cli ? nomeCompleto(cli) : (ped ? ped.cliente : ''), tel: cli ? cli.whats : (ped ? ped.tel : ''),
        desc: itens.length ? resumoItens(itens).slice(0, 200) : descLivre, valor: t.total, ajuste: itens.length ? ajusteAtual() : 0,
        sinal, data, venc: vencimento, hora: $('#fHora').value, entrega, regiao: entrega === 'entrega' ? $('#fRegiao').value.trim() : '',
        taxaEnt: t.txEnt, forma: $('#fForma').value, taxaPag: t.txPag, anexos: st.anexos,
        status, obs: $('#fObs').value.trim(), repetir: $('#fRep') ? $('#fRep').value : (ped?.repetir || ''), origem: ped ? ped.origem : 'app'
      };
      const salvo = await DB.salvarPedido(ped ? ped.id : null, dados, itens);
      if (ped) { const i = S.pedidos.findIndex(x => x.id === ped.id); S.pedidos[i] = { ...salvo, pagamentos: ped.pagamentos }; }
      else S.pedidos.push(salvo);
      render(); abrirPedido(salvo.id, { recemCriado: !ped || aceitar });
      toast(aceitar ? 'Pedido aceito. Avise o cliente 💕' : ped ? 'Alterações salvas' : `#${noPad(salvo.no)} salvo`);
    }, $('#fSalvar')).catch(() => {});
  };
  if (!ped && !opts.cliente) setTimeout(() => { const e = $('#fCli'); if (e) e.focus(); }, 250);
}

/* ---------- seleção de grupo e subgrupo (com "criar novo") ---------- */
function selectGrupo(id, valor) {
  return `<select class="t" id="${id}"><option value="">Sem grupo</option>${grupos().map(g => `<option value="${g.id}" ${valor === g.id ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')}<option value="__novo">＋ Novo grupo…</option></select>`;
}
function selectSub(id, grupoId, valor) {
  return `<select class="t" id="${id}" ${grupoId ? '' : 'disabled'}><option value="">Sem subgrupo</option>${grupoId ? subgrupos(grupoId).map(s => `<option value="${s.id}" ${valor === s.id ? 'selected' : ''}>${esc(s.nome)}</option>`).join('') + '<option value="__novo">＋ Novo subgrupo…</option>' : ''}</select>`;
}
function ligarGrupoSub(idG, idS) {
  const sg = () => $('#' + idG), ss = () => $('#' + idS);
  const trocaSub = (valor = '') => { ss().outerHTML = selectSub(idS, sg().value, valor); ss().onchange = onSub; };
  const onSub = async () => {
    if (ss().value !== '__novo') return;
    const nome = (prompt('Nome do novo subgrupo:') || '').trim();
    if (!nome) { ss().value = ''; return; }
    try { const c = await DB.salvarCategoria({ nome, paiId: sg().value }); S.categorias.push(c); trocaSub(c.id); } catch (e) { toast(e.message); ss().value = ''; }
  };
  sg().onchange = async () => {
    if (sg().value === '__novo') {
      const nome = (prompt('Nome do novo grupo:') || '').trim();
      if (!nome) { sg().value = ''; trocaSub(); return; }
      try { const c = await DB.salvarCategoria({ nome, paiId: '' }); S.categorias.push(c); sg().outerHTML = selectGrupo(idG, c.id); ligarGrupoSub(idG, idS); trocaSub(); return; }
      catch (e) { toast(e.message); sg().value = ''; }
    }
    trocaSub();
  };
  ss().onchange = onSub;
}

/* ---------- detalhe do pedido ---------- */
function abrirPedido(id, opts = {}) {
  const p = S.pedidos.find(x => String(x.id) === String(id)); if (!p) return;
  const v = voc(), idx = STATUS.findIndex(s => s[0] === p.status), c = cliDe(p), tel = telCliente(p);
  const steps = STATUS.map((s, i) => `<button data-st="${s[0]}" class="${p.status === s[0] ? 'on' : (i < idx ? 'done' : '')}">${s[1]}</button>`).join('');
  const sugerido = (p.status === 'aguardando' && p.sinal > pago(p)) ? p.sinal - pago(p) : saldo(p);
  const dif = difPedido(p);
  abrir(`<div class="sh-head"><h1 class="sh-title">#${noPad(p.no)}</h1>${p.status === 'solicitado' ? '<span class="badge rose">Pedido novo</span>' : quitado(p) ? '<span class="badge go">Pago</span>' : (atrasado(p) ? '<span class="badge late">Atrasado</span>' : '')}</div>
  <button class="cli-link" ${c ? `data-vercli="${c.id}"` : 'disabled'}><strong>${esc(nomeCliente(p))}</strong>${tel ? ' · ' + fmtTel(tel) : ''}${c && c.endereco ? '<br><span class="small muted">' + esc(c.endereco) + '</span>' : ''}</button>
  <p class="sub">${p.data ? quando(p.data, p.hora) : 'Venda avulsa'} · ${entregaTxt(p)}${p.forma ? ' · 💳 ' + esc(p.forma) : ''}${venc(p) && aceito(p) ? '<br>Pagar até ' + fmtD(venc(p)) : ''}</p>
  ${p.status === 'solicitado' ? `<div class="warn" style="background:var(--rose-soft);color:var(--ink)">Este pedido foi feito pelo cliente no link do cardápio. Revise, ajuste se precisar e aceite, ou recuse.</div>
     <button class="btn go" id="pAceitar">Revisar e aceitar</button><button class="btn danger" id="pRecusar">Recusar</button>`
    : p.status === 'cancelado' ? '<p class="warn">Cancelado</p>' : `<div class="steps">${steps}</div>`}
  ${p.itens.length ? `<div class="itens-lista">${p.itens.map(i => { const d = r2(i.qtd * (i.preco - i.precoTab)); return `<div class="kv"><span>${fmtQtd(i.qtd, i.un)} ${esc(i.desc)}<br><span class="small muted">${precoUn(i.preco, i.un)}${d ? ` · <span style="color:${d < 0 ? 'var(--late)' : 'var(--go)'}">${d < 0 ? '' : '+'}${brl(d)} da tabela</span>` : ''}</span></span><span>${brl(r2(i.qtd * i.preco))}</span></div>`; }).join('')}
     ${p.ajuste ? `<div class="kv"><span>${p.ajuste < 0 ? 'Desconto' : 'Acréscimo'}</span><span>${brl(p.ajuste)}</span></div>` : ''}</div>`
    : `<p style="margin:10px 0 0">${esc(p.desc)}</p>`}
  ${p.taxaEnt ? `<div class="kv"><span>🚗 Entrega${p.regiao ? ' · ' + esc(p.regiao) : ''}</span><span>${brl(p.taxaEnt)}</span></div>` : ''}
  ${p.taxaPag ? `<div class="kv"><span>💳 Taxa ${esc((p.forma || 'maquininha').toLowerCase())}</span><span>${brl(p.taxaPag)}</span></div>` : ''}
  <div class="kv big"><span>Total</span><strong>${brl(p.valor)}</strong></div>
  ${dif ? `<p class="small" style="margin:2px 0 6px;color:${dif < 0 ? 'var(--late)' : 'var(--go)'}">${dif < 0 ? brl(-dif) + ' abaixo da tabela' : brl(dif) + ' acima da tabela'}</p>` : ''}
  ${p.sinal ? `<div class="kv"><span>Sinal combinado</span><span>${brl(p.sinal)}</span></div>` : ''}
  <div class="kv"><span>Já pago</span><span>${brl(pago(p))}</span></div>
  ${p.pagamentos.length ? `<div class="pags">${p.pagamentos.map(x => `<div class="pag"><span>✅ ${brl(x.v)} · ${fmtD(x.d)} · ${esc(x.f)}</span><button class="more estorno" data-estorno="${x.id}">Estornar</button></div>`).join('')}</div>` : ''}
  <div class="kv"><span>Falta</span><strong style="color:${saldo(p) ? 'var(--late)' : 'var(--go)'}">${brl(saldo(p))}</strong></div>
  ${p.obs ? `<p class="small" style="margin-top:8px"><strong>Obs.:</strong> ${esc(p.obs)}</p>` : ''}
  ${p.anexos && p.anexos.length ? `<h2 style="font-size:17px">Inspirações</h2><div class="anexos ver">${p.anexos.map(a => `<a class="anexo" href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="${esc(a.legenda)}"><span>${esc(a.legenda)}</span></a>`).join('')}</div>` : ''}

  ${p.status !== 'solicitado' && p.status !== 'cancelado' ? `
  ${opts.recemCriado ? '<div class="dica">Próximo passo: envie o pedido para o cliente conferir 💌</div>' : ''}
  <div class="two">
    <a class="btn wa" href="${waLinkTel(tel, msgPedido(p))}" target="_blank" rel="noopener">Enviar pedido</a>
    <a class="btn wa" href="${waLinkTel(tel, msgCobranca(p))}" target="_blank" rel="noopener" id="pCobrar" ${quitado(p) ? 'aria-disabled="true" style="opacity:.5"' : ''}>Cobrar</a>
  </div>
  ${p.status === 'pronto' ? `<a class="btn wa" href="${waLinkTel(tel, msgPronto(p))}" target="_blank" rel="noopener">Avisar que está pronto</a>` : ''}
  ${!tel ? '<p class="small muted">Sem WhatsApp do cliente: você escolhe o contato quando o WhatsApp abrir.</p>' : ''}
  <details class="prev"><summary>Ver as mensagens</summary><p class="small muted">Pedido</p><div class="msg">${esc(msgPedido(p))}</div><p class="small muted">Cobrança</p><div class="msg">${esc(msgCobranca(p))}</div></details>
  ${saldo(p) > 0 ? `<div class="two" style="align-items:end"><div><label class="f" for="pgV">Recebi (R$)</label><input class="t" id="pgV" inputmode="decimal" value="${sugerido.toFixed(2).replace('.', ',')}"></div>
    <div><label class="f" for="pgF">Como</label><select class="t" id="pgF">${[...new Set([p.forma, ...cfgNeg().pagamentos.filter(x => x.ativo).map(x => x.nome)].filter(Boolean))].map(f => `<option>${esc(f)}</option>`).join('')}</select></div></div>
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
      abrir(`<h1 class="sh-title">Pedido recusado</h1><p class="sub">Avise o cliente com carinho. A mensagem já está pronta.</p>
        <div class="msg">${esc(msgRecusa(p))}</div>
        <a class="btn wa" href="${waLinkTel(telCliente(p), msgRecusa(p))}" target="_blank" rel="noopener">Avisar no WhatsApp</a>`);
    }, $('#pRecusar')).catch(() => {});
  };
  $$('[data-st]').forEach(b => b.onclick = () => mudarStatus(p, b.dataset.st, b, () => abrirPedido(p.id)));
  $$('[data-estorno]').forEach(b => b.onclick = async () => {
    const pg = p.pagamentos.find(x => String(x.id) === b.dataset.estorno);
    if (!confirm(`Estornar o pagamento de ${brl(pg.v)} de ${fmtD(pg.d)}? Ele sai do pedido e do relatório.`)) return;
    await tenta(async () => {
      await DB.estornarPagamento(p.id, pg.id);
      p.pagamentos = p.pagamentos.filter(x => x.id !== pg.id);
      if (p.status === 'confirmado' && p.sinal > 0 && pago(p) < p.sinal && p.data && p.data >= today()) { await DB.atualizarPedido(p.id, { status: 'aguardando' }); p.status = 'aguardando'; }
      render(); abrirPedido(p.id); toast('Pagamento estornado');
    }, b).catch(() => {});
  });
  if ($('#pgOk')) $('#pgOk').onclick = async () => {
    const val = num($('#pgV').value); if (!val) return;
    const forma = $('#pgF').value;
    await tenta(async () => {
      const pg = await DB.registrarPagamento(p.id, { v: val, d: today(), f: forma });
      p.pagamentos.push(pg);
      if (p.status === 'aguardando' && pago(p) >= p.sinal) { await DB.atualizarPedido(p.id, { status: 'confirmado' }); p.status = 'confirmado'; }
      render();
      abrir(`<h1 class="sh-title">💖 Pagamento registrado</h1><p class="sub">${brl(val)} · ${esc(forma)} · ${quitado(p) ? 'pedido quitado' : 'falta ' + brl(saldo(p))}</p>
        <div class="msg">${esc(msgPagamento(p, val, forma))}</div>
        <a class="btn wa" href="${waLinkTel(telCliente(p), msgPagamento(p, val, forma))}" target="_blank" rel="noopener">Agradecer no WhatsApp</a>
        <button class="btn ghost" id="pgVoltar">Voltar ao pedido</button>
        <button class="more estorno" id="pgDesfaz" style="display:block;margin:10px auto">Lancei errado, estornar</button>`);
      $('#pgVoltar').onclick = () => abrirPedido(p.id);
      $('#pgDesfaz').onclick = async () => { await tenta(async () => { await DB.estornarPagamento(p.id, pg.id); p.pagamentos = p.pagamentos.filter(x => x.id !== pg.id); if (p.status === 'confirmado' && p.sinal > pago(p)) { await DB.atualizarPedido(p.id, { status: 'aguardando' }); p.status = 'aguardando'; } render(); abrirPedido(p.id); toast('Pagamento estornado'); }).catch(() => {}); };
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
  abrir(`<h1 class="sh-title">${c ? esc(nomeCompleto(c)) : 'Novo cliente'}</h1>
  ${c && deve > 0 ? `<p class="warn">Deve ${brl(deve)} no total</p>` : ''}
  <div class="two"><div><label class="f" for="clNome">Nome</label><input class="t" id="clNome" value="${esc(c?.nome || '')}"></div>
  <div><label class="f" for="clSob">Sobrenome</label><input class="t" id="clSob" value="${esc(c?.sobrenome || '')}"></div></div>
  <label class="f" for="clWa">WhatsApp</label><input class="t" id="clWa" inputmode="tel" value="${esc(c?.whats ? fmtTel(c.whats) : '')}" placeholder="61 99999-0000">
  <label class="f" for="clEnd">Endereço</label><input class="t" id="clEnd" value="${esc(c?.endereco || '')}">
  <label class="f" for="clObs">Observação</label><textarea class="t" id="clObs">${esc(c?.obs || '')}</textarea>
  <button class="btn go" id="clOk">${c ? 'Salvar cliente' : 'Cadastrar cliente'}</button>
  ${c ? `<button class="btn ghost" id="clPed">Novo pedido para ${esc(c.nome)}</button>
    ${link ? `<a class="btn wa" href="${waLinkTel(c.whats, `Oi, ${c.nome}! 🌸\n\nAqui é da ${S.neg.nome}. Preparei um cantinho só seu para acompanhar seus pedidos e fazer novos quando quiser 💕\n\n📲 ${link}\n\nSalve nos favoritos! 🥰`)}" target="_blank" rel="noopener">Mandar link "Meus pedidos"</a>` : ''}
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
  abrir(`<h1 class="sh-title">${p ? 'Editar produto' : 'Novo produto'}</h1>
  <div class="foto-box">
    <div id="prFotoPrev">${foto ? `<img src="${esc(foto)}" alt="">` : thumb('', p?.nome || '?', 96)}</div>
    <div><label class="btn ghost mini" for="prFoto" style="margin:0">${foto ? 'Trocar foto' : 'Colocar foto'}</label>
      <input type="file" id="prFoto" accept="image/*" hidden>
      ${foto ? '<button class="more" id="prTiraFoto" type="button">Tirar foto</button>' : ''}
      <p class="small muted" style="margin:6px 0 0">Aparece no cardápio do cliente.</p></div>
  </div>
  <label class="f" for="prNome">Nome</label><input class="t" id="prNome" value="${esc(p?.nome || '')}" placeholder="Ex.: Bolo de chocolate">
  <div class="two"><div><label class="f" for="prGrupo">Grupo</label>${selectGrupo('prGrupo', p?.grupoId || '')}</div>
  <div><label class="f" for="prSub">Subgrupo</label>${selectSub('prSub', p?.grupoId || '', p?.subgrupoId || '')}</div></div>
  <div class="two"><div><label class="f" for="prUn">Unidade</label><select class="t" id="prUn">${Object.entries(UNIDADES).map(([k, u]) => `<option value="${k}" ${p?.un === k ? 'selected' : ''}>${u.nome}</option>`).join('')}</select></div>
  <div><label class="f" for="prPreco">Preço de venda</label><input class="t" id="prPreco" inputmode="decimal" value="${p ? p.preco.toFixed(2).replace('.', ',') : ''}" placeholder="0,00"></div></div>
  <label class="f" for="prCusto">Preço de custo <em>(ingredientes, embalagem, gás…)</em></label><input class="t" id="prCusto" inputmode="decimal" value="${p && p.custo ? p.custo.toFixed(2).replace('.', ',') : ''}" placeholder="0,00">
  <p class="small" id="prMargem"></p>
  <label class="check"><input type="checkbox" id="prCard" ${!p || p.cardapio ? 'checked' : ''}> Mostrar no cardápio para clientes</label>
  <label class="check"><input type="checkbox" id="prAtivo" ${!p || p.ativo ? 'checked' : ''}> Produto ativo <span class="small muted">(desmarque em vez de apagar)</span></label>
  <button class="btn go" id="prOk">${p ? 'Salvar produto' : 'Cadastrar produto'}</button>`);
  ligarGrupoSub('prGrupo', 'prSub');
  const margem = () => { const pr = num($('#prPreco').value), cu = num($('#prCusto').value); $('#prMargem').innerHTML = pr && cu ? `Lucro de ${brl(pr - cu)} por ${(UNIDADES[$('#prUn').value] || UNIDADES.un).curto} · <strong style="color:${pr - cu < 0 ? 'var(--late)' : 'var(--go)'}">margem ${Math.round((pr - cu) / pr * 100)}%</strong>` : ''; };
  $('#prPreco').oninput = margem; $('#prCusto').oninput = margem; $('#prUn').onchange = margem; margem();
  $('#prFoto').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    $('#prFotoPrev').innerHTML = '<span class="small muted">Preparando foto…</span>';
    try { const blob = await reduzirFoto(f, DB.online ? 900 : 400, DB.online ? 0.8 : 0.7); foto = await DB.enviarFoto(S.neg.id, blob); $('#prFotoPrev').innerHTML = `<img src="${esc(foto)}" alt="">`; }
    catch (err) { $('#prFotoPrev').innerHTML = thumb('', p?.nome || '?', 96); toast('Não consegui enviar a foto: ' + err.message); }
  };
  if ($('#prTiraFoto')) $('#prTiraFoto').onclick = () => { foto = ''; $('#prFotoPrev').innerHTML = thumb('', p?.nome || '?', 96); };
  $('#prOk').onclick = async () => {
    const g = $('#prGrupo').value, s = $('#prSub').value;
    const dados = { id: p?.id, nome: $('#prNome').value.trim(), grupoId: g === '__novo' ? '' : g, subgrupoId: s === '__novo' ? '' : s, un: $('#prUn').value, preco: num($('#prPreco').value), custo: num($('#prCusto').value), foto, cardapio: $('#prCard').checked, ativo: $('#prAtivo').checked };
    if (!dados.nome) { toast('Digite o nome do produto.'); return; }
    await tenta(async () => {
      const salvo = await DB.salvarProduto(dados);
      if (p) Object.assign(p, salvo); else S.produtos.push(salvo);
      render(); fechar(); toast('Produto salvo');
    }, $('#prOk')).catch(() => {});
  };
}

/* ---------- grupo / subgrupo ---------- */
function abrirCategoria(id, paiId) {
  const c = id ? S.categorias.find(x => x.id === id) : null;
  const pai = c ? c.paiId : paiId;
  const ehSub = !!pai;
  const usados = c ? S.produtos.filter(p => p.grupoId === c.id || p.subgrupoId === c.id).length : 0;
  abrir(`<h1 class="sh-title">${c ? 'Editar ' : 'Novo '}${ehSub ? 'subgrupo' : 'grupo'}</h1>
  ${ehSub ? `<p class="sub">Dentro de ${esc(nomeCat(pai))}</p>` : ''}
  <label class="f" for="catNome">Nome</label><input class="t" id="catNome" value="${esc(c?.nome || '')}" placeholder="${ehSub ? 'Ex.: Festa' : 'Ex.: Bolos'}">
  <button class="btn go" id="catOk">Salvar</button>
  ${c ? `<button class="btn danger" id="catDel">Excluir ${ehSub ? 'subgrupo' : 'grupo'}</button><p class="small muted">${usados ? usados + ' produto(s) usam este cadastro e ficarão sem ' + (ehSub ? 'subgrupo' : 'grupo') + '.' : 'Nenhum produto usa este cadastro.'}</p>` : ''}`);
  setTimeout(() => $('#catNome')?.focus(), 200);
  $('#catOk').onclick = async () => {
    const nome = $('#catNome').value.trim(); if (!nome) return toast('Digite o nome.');
    await tenta(async () => {
      const salvo = await DB.salvarCategoria({ id: c?.id, nome, paiId: pai || '' });
      if (c) { Object.assign(c, salvo); S.produtos.forEach(p => { if (p.grupoId === c.id) p.grupo = nome; if (p.subgrupoId === c.id) p.subgrupo = nome; }); } else S.categorias.push(salvo);
      render(); fechar(); toast('Salvo');
    }, $('#catOk')).catch(() => {});
  };
  if ($('#catDel')) $('#catDel').onclick = async () => {
    if (!confirm('Excluir? Os produtos continuam, só ficam sem essa classificação.')) return;
    await tenta(async () => {
      await DB.removerCategoria(c.id);
      const ids = [c.id, ...S.categorias.filter(x => x.paiId === c.id).map(x => x.id)];
      S.categorias = S.categorias.filter(x => !ids.includes(x.id));
      S.produtos.forEach(p => { if (ids.includes(p.grupoId)) { p.grupoId = ''; p.subgrupoId = ''; } if (ids.includes(p.subgrupoId)) p.subgrupoId = ''; });
      render(); fechar(); toast('Excluído');
    }, $('#catDel')).catch(() => {});
  };
}

/* ---------- entrega, pagamento e horários ---------- */
function abrirEntregaPagamento() {
  const cfg = JSON.parse(JSON.stringify(cfgNeg()));
  const desenha = () => {
    const ex = calcTaxas(100, cfg, '', '', '');
    abrir(`<h1 class="sh-title">🚗 Entrega, pagamento e horários</h1>
    <h2>Entrega</h2>
    <label class="check"><input type="checkbox" id="epRet" ${cfg.entrega.retirada ? 'checked' : ''}> Cliente pode retirar</label>
    <input class="t" id="epRetEnd" placeholder="Endereço de retirada (vai nas mensagens)" value="${esc(cfg.entrega.endereco_retirada)}" style="margin-top:6px">
    <label class="check"><input type="checkbox" id="epEnt" ${cfg.entrega.entrega ? 'checked' : ''}> Faço entrega</label>
    <div id="epEntBox" ${cfg.entrega.entrega ? '' : 'hidden'}>
      <p class="small muted">Taxa de deslocamento por região. Sem regiões, vale a taxa padrão para todos.</p>
      ${cfg.entrega.regioes.map((r, k) => `<div class="linha-cfg"><input class="t" data-rn="${k}" value="${esc(r.nome)}" placeholder="Região/bairro"><input class="t curto" data-rv="${k}" inputmode="decimal" value="${String(r.valor).replace('.', ',')}" placeholder="R$"><button class="x" data-rrm="${k}" aria-label="Tirar">×</button></div>`).join('')}
      <button class="more" id="epAddReg">＋ Adicionar região</button>
      ${!cfg.entrega.regioes.length ? `<label class="f" for="epTaxa">Taxa padrão de entrega (R$)</label><input class="t" id="epTaxa" inputmode="decimal" value="${String(cfg.entrega.taxa_padrao || '').replace('.', ',')}">` : ''}
    </div>
    <h2>Formas de pagamento</h2>
    <p class="small muted">A taxa (%) é somada ao total quando o cliente escolhe essa forma, para cobrir o desconto da maquininha.</p>
    ${cfg.pagamentos.map((p, k) => `<div class="linha-cfg"><input type="checkbox" data-pa="${k}" ${p.ativo ? 'checked' : ''} aria-label="Ativa"><input class="t" data-pn="${k}" value="${esc(p.nome)}"><input class="t curto" data-pt="${k}" inputmode="decimal" value="${String(p.taxa).replace('.', ',')}" aria-label="Taxa %"><span class="small muted">%</span><button class="x" data-prm="${k}" aria-label="Tirar">×</button></div>`).join('')}
    <button class="more" id="epAddPag">＋ Adicionar forma de pagamento</button>
    <div class="card"><p class="small" style="margin:0"><strong>Exemplo:</strong> num pedido de R$ 100,00, o cliente paga</p>${cfg.pagamentos.filter(p => p.ativo).map(p => `<div class="kv"><span>${esc(p.nome)}</span><strong>${brl(calcTaxas(100, cfg, '', '', p.nome).total)}</strong></div>`).join('')}</div>
    <h2>Horários de entrega</h2>
    <div class="two"><div><label class="f" for="epIni">Primeiro horário</label><input class="t" id="epIni" type="time" value="${cfg.horarios.inicio}"></div>
    <div><label class="f" for="epFim">Último horário</label><input class="t" id="epFim" type="time" value="${cfg.horarios.fim}"></div></div>
    <label class="f" for="epInt">De quanto em quanto tempo</label><select class="t" id="epInt">${[30, 60, 90, 120].map(m => `<option value="${m}" ${cfg.horarios.intervalo === m ? 'selected' : ''}>${m < 60 ? m + ' minutos' : (m / 60).toString().replace('.', ',') + (m === 60 ? ' hora' : ' horas')}</option>`).join('')}</select>
    <p class="small muted">O cliente escolhe um desses horários. Mais de um pedido no mesmo horário é permitido.</p>
    <button class="btn go" id="epOk">Salvar</button>`);
    const le = () => {
      cfg.entrega.retirada = $('#epRet').checked; cfg.entrega.endereco_retirada = $('#epRetEnd').value.trim(); cfg.entrega.entrega = $('#epEnt').checked;
      $$('[data-rn]').forEach(e => cfg.entrega.regioes[+e.dataset.rn].nome = e.value.trim());
      $$('[data-rv]').forEach(e => cfg.entrega.regioes[+e.dataset.rv].valor = num(e.value));
      if ($('#epTaxa')) cfg.entrega.taxa_padrao = num($('#epTaxa').value);
      $$('[data-pn]').forEach(e => cfg.pagamentos[+e.dataset.pn].nome = e.value.trim());
      $$('[data-pt]').forEach(e => cfg.pagamentos[+e.dataset.pt].taxa = num(e.value));
      $$('[data-pa]').forEach(e => cfg.pagamentos[+e.dataset.pa].ativo = e.checked);
      cfg.horarios = { inicio: $('#epIni').value || '09:00', fim: $('#epFim').value || '18:00', intervalo: Number($('#epInt').value) };
    };
    const redesenha = () => { const y = $('#sheet').scrollTop; le(); desenha(); $('#sheet').scrollTop = y; };
    $('#epEnt').onchange = redesenha;
    $$('[data-pt],[data-pa],[data-rv]').forEach(e => e.addEventListener('change', redesenha));
    $('#epAddReg').onclick = () => { le(); cfg.entrega.regioes.push({ nome: '', valor: 0 }); desenha(); $$('[data-rn]').pop()?.focus(); };
    $('#epAddPag').onclick = () => { le(); cfg.pagamentos.push({ nome: '', taxa: 0, ativo: true }); desenha(); $$('[data-pn]').pop()?.focus(); };
    $$('[data-rrm]').forEach(b => b.onclick = () => { le(); cfg.entrega.regioes.splice(+b.dataset.rrm, 1); desenha(); });
    $$('[data-prm]').forEach(b => b.onclick = () => { le(); cfg.pagamentos.splice(+b.dataset.prm, 1); desenha(); });
    $('#epOk').onclick = async () => {
      le();
      cfg.entrega.regioes = cfg.entrega.regioes.filter(r => r.nome);
      cfg.pagamentos = cfg.pagamentos.filter(p => p.nome);
      if (!cfg.entrega.retirada && !cfg.entrega.entrega) return toast('Deixe pelo menos retirada ou entrega.');
      await tenta(async () => { S.neg = await DB.salvarNegocio({ ...S.neg, config: cfg }); render(); fechar(); toast('Salvo'); }, $('#epOk')).catch(() => {});
    };
  };
  desenha();
}

/* ---------- suporte ---------- */
async function carregarChamados() {
  try {
    const lista = await DB.chamados(false);
    const el = $('#sLista'); if (!el) return;
    el.innerHTML = lista.length ? lista.map(c => `<button class="row-card" data-ch="${c.id}">
      <span class="grow"><strong>#${c.numero} · ${esc(c.assunto)}</strong>${c.naoLidoCliente ? ' <span class="badge late">resposta nova</span>' : ''}<br>
      <span class="small muted">${CAT_CHAMADO[c.categoria]} · ${ST_CHAMADO[c.status]} · ${fmtDataHora(c.atualizado)}</span></span><span class="chev">›</span></button>`).join('')
      : '<div class="empty">Nenhum chamado ainda. Se algo não funcionar ou tiver uma ideia, abra um chamado.</div>';
    $$('[data-ch]').forEach(b => b.onclick = () => abrirChamado(lista.find(c => c.id === b.dataset.ch)));
  } catch (e) { const el = $('#sLista'); if (el) el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
function abrirNovoChamado() {
  let anexo = '';
  abrir(`<h1 class="sh-title">Abrir chamado</h1>
  <label class="f" for="chCat">Tipo</label><select class="t" id="chCat">${Object.entries(CAT_CHAMADO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
  <label class="f" for="chAss">Assunto</label><input class="t" id="chAss" placeholder="Ex.: Não consigo enviar foto do produto">
  <label class="f" for="chTxt">Conte o que aconteceu</label><textarea class="t" id="chTxt" style="min-height:120px" placeholder="O que você fez, o que esperava e o que apareceu na tela"></textarea>
  <div id="chPrev"></div>
  <label class="btn ghost mini" for="chArq" style="margin-top:8px">📷 Anexar print</label><input type="file" id="chArq" accept="image/*" hidden>
  <button class="btn go" id="chOk">Enviar chamado</button>`);
  $('#chArq').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { anexo = await DB.enviarArquivo('suporte', S.neg.id, await reduzirFoto(f, DB.online ? 1400 : 500, 0.8)); $('#chPrev').innerHTML = `<img src="${esc(anexo)}" alt="" class="print">`; } catch (err) { toast('Não consegui enviar o print: ' + err.message); }
  };
  $('#chOk').onclick = async () => {
    const assunto = $('#chAss').value.trim(), texto = $('#chTxt').value.trim();
    if (!assunto || !texto) return toast('Preencha o assunto e a descrição.');
    await tenta(async () => { const c = await DB.abrirChamado({ assunto, categoria: $('#chCat').value, texto, anexo }); fechar(); go('suporte'); toast(`Chamado #${c.numero} aberto 💬`); }, $('#chOk')).catch(() => {});
  };
}
async function abrirChamado(c) {
  abrir('<p class="loading">Carregando…</p>');
  const msgs = await DB.mensagens(c.id).catch(() => []);
  if (c.naoLidoCliente) { DB.atualizarChamado(c.id, { naoLidoCliente: false }).catch(() => {}); c.naoLidoCliente = false; S.chamadosNaoLidos = Math.max(0, (S.chamadosNaoLidos || 0) - 1); }
  let anexo = '';
  abrir(`<h1 class="sh-title">#${c.numero} · ${esc(c.assunto)}</h1>
  <p class="sub">${CAT_CHAMADO[c.categoria]} · <strong>${ST_CHAMADO[c.status]}</strong></p>
  <div class="thread">${msgs.map(m => `<div class="bolha ${m.autor}"><span class="small muted">${m.autor === 'suporte' ? 'Suporte' : 'Você'} · ${fmtDataHora(m.criado)}</span><p>${esc(m.texto).replace(/\n/g, '<br>')}</p>${m.anexo ? `<a href="${esc(m.anexo)}" target="_blank" rel="noopener"><img src="${esc(m.anexo)}" alt="" class="print"></a>` : ''}</div>`).join('')}</div>
  <label class="f" for="chResp">Responder</label><textarea class="t" id="chResp"></textarea>
  <div id="chPrev"></div>
  <div class="two"><label class="btn ghost mini" for="chArq" style="margin-top:8px;text-align:center">📷 Print</label><button class="btn go" id="chEnviar" style="margin-top:8px">Enviar</button></div><input type="file" id="chArq" accept="image/*" hidden>
  ${c.status !== 'resolvido' ? '<button class="btn ghost" id="chResolver">Meu problema foi resolvido</button>' : ''}`);
  render();
  $('#chArq').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { anexo = await DB.enviarArquivo('suporte', S.neg.id, await reduzirFoto(f, DB.online ? 1400 : 500, 0.8)); $('#chPrev').innerHTML = `<img src="${esc(anexo)}" alt="" class="print">`; } catch (err) { toast(err.message); } };
  $('#chEnviar').onclick = async () => {
    const t = $('#chResp').value.trim(); if (!t) return;
    await tenta(async () => { await DB.responder(c.id, 'cliente', t, anexo); if (['aguardando', 'resolvido'].includes(c.status)) c.status = 'aberto'; abrirChamado(c); }, $('#chEnviar')).catch(() => {});
  };
  if ($('#chResolver')) $('#chResolver').onclick = async () => { await tenta(async () => { await DB.atualizarChamado(c.id, { status: 'resolvido' }); c.status = 'resolvido'; fechar(); go('suporte'); toast('Que bom! Chamado encerrado 💕'); }).catch(() => {}); };
}

/* ---------- dia da agenda (visão mês) ---------- */
function abrirDia(ds) {
  const lista = S.pedidos.filter(p => ativo(p) && p.data === ds), bl = S.bloqueios.includes(ds);
  abrir(`<h1 class="sh-title">${fmtD(ds)}</h1>
  <p class="sub">${bl ? 'Marcado como folga' : `${lista.length} de ${S.neg.limite} ocupados`}</p>
  ${lista.length ? `<button class="btn ghost" id="dVerDia">Abrir agenda do dia</button>` : ''}
  ${lista.map(ticket).join('') || '<div class="empty" style="margin-top:12px">Dia livre.</div>'}
  ${!bl && ds >= today() ? `<button class="btn go" id="dNovo2">Novo ${voc().p.toLowerCase()} neste dia</button>` : ''}
  <button class="btn ghost" id="dBloq">${bl ? 'Desbloquear dia' : 'Bloquear dia (folga)'}</button>`);
  bindTickets($('#sheetBody'));
  if ($('#dVerDia')) $('#dVerDia').onclick = () => { fechar(); diaAg = ds; modoAg = 'dia'; render(); };
  if ($('#dNovo2')) $('#dNovo2').onclick = () => abrirFormPedido(null, { data: ds });
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
  abrir(`<h1 class="sh-title">⚙️ Ajustes</h1>
  <label class="f" for="aNome">Nome do negócio</label><input class="t" id="aNome" value="${esc(S.neg.nome)}">
  <label class="f" for="aSeg">O que você vende</label><select class="t" id="aSeg">${Object.entries(SEGMENTOS).map(([k, s]) => `<option value="${k}" ${S.neg.seg === k ? 'selected' : ''}>${s.nome}</option>`).join('')}</select>
  <label class="f" for="aWa">Seu WhatsApp <em>(recebe os pedidos da agenda)</em></label><input class="t" id="aWa" inputmode="tel" value="${esc(fmtTel(S.neg.whats))}">
  <label class="f" for="aPix">Chave Pix</label><input class="t" id="aPix" value="${esc(S.neg.pix)}">
  <label class="f" for="aTxt">Mensagem de cobrança</label><textarea class="t" id="aTxt" style="min-height:260px">${esc(S.neg.texto)}</textarea>
  <p class="small muted">Deixe uma linha em branco entre as informações. Campos: {cliente}, {numero}, {itens}, {data}, {vencimento}, {valor}, {pago}, {falta}, {linha_sinal}, {pix}, {endereco}, {link} e {negocio}.</p>
  <button class="more" id="aPadrao" type="button">Voltar ao texto padrão</button>
  <button class="btn go" id="aOk">Salvar ajustes</button>
  <button class="btn ghost" id="aEntrega">Entrega, pagamento e horários</button>
  ${DB.online ? '<button class="btn ghost" id="aSair">Sair da conta</button>' : '<button class="btn ghost" id="aDemo">Recomeçar com exemplos</button>'}`);
  $('#aPadrao').onclick = () => $('#aTxt').value = TEXTO_PADRAO;
  $('#aEntrega').onclick = abrirEntregaPagamento;
  $('#aOk').onclick = async () => {
    const n = { ...S.neg, nome: $('#aNome').value.trim() || S.neg.nome, seg: $('#aSeg').value, whats: $('#aWa').value.replace(/\D/g, ''), pix: $('#aPix').value.trim(), texto: $('#aTxt').value || TEXTO_PADRAO };
    await tenta(async () => { S.neg = await DB.salvarNegocio(n); render(); fechar(); toast('Ajustes salvos'); }, $('#aOk')).catch(() => {});
  };
  if ($('#aSair')) $('#aSair').onclick = sair;
  if ($('#aDemo')) $('#aDemo').onclick = async () => { if (confirm('Apagar tudo e voltar aos exemplos?')) { DB.reiniciarDemo(); fechar(); await iniciar(); toast('Exemplos restaurados'); } };
}

async function sair() { fechar(); await DB.sair(); S = VAZIO(); modoEntrada = 'entrar'; telaEntrada(); }

/* ---------- início ---------- */
async function iniciar(motivo) {
  $('#app').innerHTML = '<p class="loading">Carregando…</p>';
  try {
    const sessao = await DB.sessao();
    if (!sessao) return telaEntrada();
    S = await DB.carregar();
    if (!S.neg) return telaBoasVindas();
    render();
    souAdmin = await DB.souAdmin().catch(() => false);
    if (tab === 'mais') render();
    registrarAbertura(motivo);
  } catch (e) {
    $('#app').innerHTML = `<div class="empty" style="margin-top:40px">${esc(e.message)}<br><button class="btn go" id="tentaDeNovo">Tentar de novo</button></div>`;
    $('#tentaDeNovo').onclick = () => iniciar();
  }
}
function registrarAbertura(motivo) {
  try {
    const k = 'dnm-ultimo-evento', ult = Number(localStorage.getItem(k) || 0);
    if (motivo === 'login') { DB.evento('login'); localStorage.setItem(k, Date.now()); return; }
    if (Date.now() - ult > 3600e3) { DB.evento('app_aberto'); localStorage.setItem(k, Date.now()); }
  } catch (e) {}
}

let ultimaCarga = Date.now();
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !S.neg || Date.now() - ultimaCarga < 60000) return;
  if ($('#sheet').classList.contains('open')) return;
  try { ultimaCarga = Date.now(); const novo = await DB.carregar(); if (novo.neg) { S = novo; render(); registrarAbertura(); } } catch (e) {}
});

$$('nav.bar [data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab));
$('#fab').onclick = () => abrirFormPedido();
$('#sheetBg').onclick = fechar;
$('#sheetX').onclick = fechar;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheet').classList.contains('open')) fechar(); });
DB.aoMudarSessao(s => { if (!s && S.neg) { S = VAZIO(); telaEntrada(); } });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
iniciar();
