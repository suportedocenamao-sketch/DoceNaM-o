/* Painel do administrador: negócios, acessos, links visitados e chamados de suporte. */
const TIPOS = { login: '🔑 Login', app_aberto: '📱 Abriu o app', agenda_vista: '👀 Viu o cardápio', meus_pedidos_visto: '📲 Cliente viu "Meus pedidos"', pedido_agenda: '🛎️ Pedido pelo cardápio', orcamento_whatsapp: '💬 Pediu orçamento no WhatsApp' };
const CAT = { duvida: 'Dúvida', problema: 'Problema', sugestao: 'Sugestão', financeiro: 'Financeiro' };
const STS = { aberto: 'Aberto', em_andamento: 'Em andamento', aguardando: 'Aguardando cliente', resolvido: 'Resolvido' };
let aba = 'geral', negs = [], fTipo = '', fNeg = '', fSt = 'abertos';

function abrir(html) { $('#sheetBody').innerHTML = html; $('#sheet').classList.add('open'); $('#sheetBg').classList.add('open'); $('#sheet').scrollTop = 0; }
function fechar() { $('#sheet').classList.remove('open'); $('#sheetBg').classList.remove('open'); }
$('#sheetBg').onclick = fechar; $('#sheetX').onclick = fechar;
const desde = s => { if (!s) return 'nunca'; const h = (Date.now() - new Date(s).getTime()) / 3600e3; if (h < 1) return 'agora há pouco'; if (h < 24) return `há ${Math.floor(h)} h`; const d = Math.floor(h / 24); return `há ${d} ${d === 1 ? 'dia' : 'dias'}`; };

function telaLogin(msg) {
  $('#app').innerHTML = `<div class="hero"><span class="logo"><span class="mark">dm</span><strong>Administrador</strong></span><p>${msg || 'Entre com a conta de administrador.'}</p></div>
  <div class="card"><label class="f" for="aMail">E-mail</label><input class="t" id="aMail" type="email" autocomplete="email">
  <label class="f" for="aSenha">Senha</label><input class="t" id="aSenha" type="password" autocomplete="current-password">
  <p class="err" id="aErr"></p><button class="btn go" id="aOk">Entrar</button></div>`;
  $('#aOk').onclick = async () => { try { await DB.entrar($('#aMail').value.trim(), $('#aSenha').value); iniciar(); } catch (e) { $('#aErr').textContent = e.message; } };
}

async function iniciar() {
  try {
    const s = await DB.sessao(); if (!s) return telaLogin();
    if (!(await DB.souAdmin())) return telaLogin('Esta conta não é de administrador. Veja no README como liberar o acesso.');
    negs = await DB.adminNegocios();
    render();
  } catch (e) { $('#app').innerHTML = `<div class="empty" style="margin-top:40px">${esc(e.message)}</div>`; }
}

function render() {
  const tabs = [['geral', 'Visão geral'], ['negocios', 'Negócios'], ['acessos', 'Acessos'], ['chamados', 'Chamados']];
  const abertos = negs.reduce((a, n) => a + Number(n.chamados_abertos || 0), 0);
  $('#app').innerHTML = `${DB.online ? '' : '<p class="demo-flag">Modo demonstração: dados de exemplo.</p>'}
  <header class="top"><div><h1>🛡️ Administrador</h1><p class="sub">Doce na Mão</p></div><a class="iconbtn" href="index.html" aria-label="Voltar ao app">↩</a></header>
  <div class="chips">${tabs.map(([k, l]) => `<button class="chip" data-aba="${k}" aria-pressed="${aba === k}">${l}${k === 'chamados' && abertos ? ` (${abertos})` : ''}</button>`).join('')}</div>
  <div id="conteudo"><p class="loading">Carregando…</p></div>`;
  $$('[data-aba]').forEach(b => b.onclick = () => { aba = b.dataset.aba; render(); });
  ({ geral, negocios, acessos, chamados })[aba]();
}

function geral() {
  const sum = k => negs.reduce((a, n) => a + Number(n[k] || 0), 0);
  const ativos = negs.filter(n => Number(n.acessos_7d) > 0).length;
  const parados = negs.filter(n => !n.ultimo_acesso || Date.now() - new Date(n.ultimo_acesso).getTime() > 7 * 864e5);
  $('#conteudo').innerHTML = `<div class="sums">
    <div class="sum"><b>${negs.length}</b><span>negócios cadastrados</span></div>
    <div class="sum"><b>${ativos}</b><span>usaram o app em 7 dias</span></div>
    <div class="sum"><b>${sum('visitas_link_7d')}</b><span>visitas aos links (7 dias)</span></div>
    <div class="sum"><b>${sum('pedidos_agenda_30d')}</b><span>pedidos pelo cardápio (30 dias)</span></div>
    <div class="sum"><b>${sum('pedidos_30d')}</b><span>pedidos lançados (30 dias)</span></div>
    <div class="sum ${sum('chamados_abertos') ? 'late' : ''}"><b>${sum('chamados_abertos')}</b><span>chamados em aberto</span></div>
  </div>
  <h2>⚠️ Sem usar há mais de 7 dias (${parados.length})</h2>
  ${parados.length ? parados.map(n => `<div class="row-card"><span class="grow"><strong>${esc(n.nome)}</strong><br><span class="small muted">${esc(n.email || '')} · último acesso ${desde(n.ultimo_acesso)}</span></span></div>`).join('') : '<div class="empty">Todo mundo usou o app esta semana 🎉</div>'}
  <p class="small muted">Por privacidade, o painel mostra números e acessos, nunca os pedidos ou os clientes de cada negócio.</p>`;
}

function negocios() {
  $('#conteudo').innerHTML = negs.map(n => `<div class="card adm-neg">
    <div class="g-top"><strong>${esc(n.nome)}</strong><span class="small muted">${esc(n.email || '')}</span></div>
    <p class="small muted" style="margin:2px 0 8px">Desde ${new Date(n.criado_em).toLocaleDateString('pt-BR')} · último acesso ${desde(n.ultimo_acesso)}</p>
    <div class="mini-grid">
      <span><b>${n.acessos_7d}</b>acessos 7d</span><span><b>${n.visitas_link_7d}</b>visitas link 7d</span><span><b>${n.visitas_link_30d}</b>visitas 30d</span>
      <span><b>${n.pedidos_30d}</b>pedidos 30d</span><span><b>${n.pedidos_agenda_30d}</b>pelo cardápio</span><span><b>${n.clientes}</b>clientes</span>
      <span><b>${n.produtos}</b>produtos</span><span><b>${n.chamados_abertos}</b>chamados</span>
    </div>
    <div class="two"><button class="btn ghost mini" data-vernegs="${n.id}">Ver acessos</button><a class="btn ghost mini" href="${esc(baseSite() + '/agenda.html?n=' + n.slug)}" target="_blank" rel="noopener">Abrir cardápio</a></div>
  </div>`).join('') || '<div class="empty">Nenhum negócio ainda.</div>';
  $$('[data-vernegs]').forEach(b => b.onclick = () => { fNeg = b.dataset.vernegs; aba = 'acessos'; render(); });
}

async function acessos() {
  const filtros = `<div class="two"><select class="t" id="fTipo"><option value="">Todos os tipos</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${fTipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <select class="t" id="fNeg"><option value="">Todos os negócios</option>${negs.map(n => `<option value="${n.id}" ${fNeg === n.id ? 'selected' : ''}>${esc(n.nome)}</option>`).join('')}</select></div>`;
  $('#conteudo').innerHTML = filtros + '<p class="loading">Carregando…</p>';
  const lista = await DB.adminAcessos({ tipo: fTipo, negocioId: fNeg, limite: 200 }).catch(e => { toast(e.message); return []; });
  const slugDe = id => (negs.find(n => n.id === id) || {}).slug;
  $('#conteudo').innerHTML = filtros + (lista.length ? `<div class="log">${lista.map(a => {
    const link = ['agenda_vista', 'orcamento_whatsapp', 'pedido_agenda'].includes(a.tipo) && slugDe(a.negocioId) ? `/agenda.html?n=${slugDe(a.negocioId)}` : a.tipo === 'meus_pedidos_visto' ? '/meus-pedidos.html' : '';
    return `<div class="log-row"><span class="small muted">${fmtDataHora(a.criado)}</span><span><strong>${TIPOS[a.tipo] || a.tipo}</strong>${a.detalhe ? ' ' + esc(a.detalhe) : ''}<br><span class="small muted">${esc(a.negocio)}${a.dispositivo ? ' · ' + esc(a.dispositivo) : ''}${link ? ' · <code>' + esc(link) + '</code>' : ''}</span></span></div>`;
  }).join('')}</div>` : '<div class="empty">Nenhum acesso com esses filtros.</div>');
  $('#fTipo').onchange = e => { fTipo = e.target.value; acessos(); };
  $('#fNeg').onchange = e => { fNeg = e.target.value; acessos(); };
}

async function chamados() {
  const filtros = `<div class="chips">${[['abertos', 'Em aberto'], ['resolvido', 'Resolvidos'], ['todos', 'Todos']].map(([k, l]) => `<button class="chip" data-fst="${k}" aria-pressed="${fSt === k}">${l}</button>`).join('')}</div>`;
  $('#conteudo').innerHTML = filtros + '<p class="loading">Carregando…</p>';
  let lista = await DB.chamados(true).catch(e => { toast(e.message); return []; });
  lista = lista.filter(c => fSt === 'todos' || (fSt === 'resolvido' ? c.status === 'resolvido' : c.status !== 'resolvido'));
  const ordemP = { alta: 0, normal: 1, baixa: 2 };
  lista.sort((a, b) => (b.naoLidoSuporte - a.naoLidoSuporte) || (ordemP[a.prioridade] - ordemP[b.prioridade]) || b.atualizado.localeCompare(a.atualizado));
  $('#conteudo').innerHTML = filtros + (lista.length ? lista.map(c => `<button class="row-card" data-ch="${c.id}">
    <span class="grow"><strong>#${c.numero} · ${esc(c.assunto)}</strong>${c.naoLidoSuporte ? ' <span class="badge late">aguardando resposta</span>' : ''}${c.prioridade === 'alta' ? ' <span class="badge late">alta</span>' : ''}<br>
    <span class="small muted">${esc(c.negocio)} · ${CAT[c.categoria]} · ${STS[c.status]} · ${desde(c.atualizado)}</span></span><span class="chev">›</span></button>`).join('') : '<div class="empty">Nenhum chamado aqui.</div>');
  $$('[data-fst]').forEach(b => b.onclick = () => { fSt = b.dataset.fst; chamados(); });
  $$('[data-ch]').forEach(b => b.onclick = () => abrirChamado(lista.find(c => c.id === b.dataset.ch)));
}

async function abrirChamado(c) {
  abrir('<p class="loading">Carregando…</p>');
  const msgs = await DB.mensagens(c.id).catch(() => []);
  if (c.naoLidoSuporte) { DB.atualizarChamado(c.id, { naoLidoSuporte: false }).catch(() => {}); c.naoLidoSuporte = false; }
  let anexo = '';
  abrir(`<h1 class="sh-title">#${c.numero} · ${esc(c.assunto)}</h1>
  <p class="sub">${esc(c.negocio)} · ${CAT[c.categoria]} · aberto ${desde(c.criado)}</p>
  <div class="two"><div><label class="f" for="cSt">Status</label><select class="t" id="cSt">${Object.entries(STS).map(([k, v]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
  <div><label class="f" for="cPr">Prioridade</label><select class="t" id="cPr">${['baixa', 'normal', 'alta'].map(k => `<option value="${k}" ${c.prioridade === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
  <div class="thread">${msgs.map(m => `<div class="bolha ${m.autor === 'suporte' ? 'cliente' : 'suporte'}"><span class="small muted">${m.autor === 'suporte' ? 'Suporte (você)' : esc(c.negocio)} · ${fmtDataHora(m.criado)}</span><p>${esc(m.texto).replace(/\n/g, '<br>')}</p>${m.anexo ? `<a href="${esc(m.anexo)}" target="_blank" rel="noopener"><img src="${esc(m.anexo)}" alt="" class="print"></a>` : ''}</div>`).join('')}</div>
  <label class="f" for="cResp">Responder como suporte</label><textarea class="t" id="cResp"></textarea>
  <div id="cPrev"></div>
  <div class="two"><label class="btn ghost mini" for="cArq" style="margin-top:8px;text-align:center">📷 Print</label><button class="btn go" id="cEnviar" style="margin-top:8px">Enviar resposta</button></div><input type="file" id="cArq" accept="image/*" hidden>`);
  $('#cSt').onchange = async e => { await DB.atualizarChamado(c.id, { status: e.target.value }).catch(err => toast(err.message)); c.status = e.target.value; toast('Status atualizado'); };
  $('#cPr').onchange = async e => { await DB.atualizarChamado(c.id, { prioridade: e.target.value }).catch(err => toast(err.message)); c.prioridade = e.target.value; toast('Prioridade atualizada'); };
  $('#cArq').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { anexo = await DB.enviarArquivo('suporte', 'admin', await reduzirFoto(f, 1400, 0.8)); $('#cPrev').innerHTML = `<img src="${esc(anexo)}" alt="" class="print">`; } catch (err) { toast(err.message); } };
  $('#cEnviar').onclick = async () => {
    const t = $('#cResp').value.trim(); if (!t) return;
    try { await DB.responder(c.id, 'suporte', t, anexo); if (c.status === 'aberto') c.status = 'em_andamento'; c.atualizado = new Date().toISOString(); abrirChamado(c); toast('Resposta enviada'); } catch (e) { toast(e.message); }
  };
}

iniciar();
