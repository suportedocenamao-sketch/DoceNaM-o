/* Página pública: cardápio com fotos, data, horário, entrega, pagamento (com taxas), inspirações e pedido. */
(async () => {
  const app = $('#app');
  const slugNeg = new URLSearchParams(location.search).get('n') || '';
  const chaveCli = 'dnm-cliente-' + slugNeg;
  const lerCli = () => { try { return JSON.parse(localStorage.getItem(chaveCli) || '{}'); } catch (e) { return {}; } };
  const gravarCli = o => { try { localStorage.setItem(chaveCli, JSON.stringify({ ...lerCli(), ...o })); } catch (e) {} };

  let neg, dias, cardapio;
  try {
    const r = await DB.agendaPublica(slugNeg, 30);
    neg = r.neg; dias = r.dias;
    if (!neg) { app.innerHTML = '<div class="empty" style="margin-top:40px">Agenda não encontrada. Confira o link com quem te enviou.</div>'; return; }
    cardapio = await DB.cardapio(slugNeg);
  } catch (e) {
    app.innerHTML = '<div class="empty" style="margin-top:40px">Não consegui carregar agora. Tente de novo em instantes.</div>'; return;
  }
  try { if (!sessionStorage.getItem('dnm-visita-' + slugNeg)) { sessionStorage.setItem('dnm-visita-' + slugNeg, '1'); DB.visita(slugNeg, 'agenda_vista'); } } catch (e) { DB.visita(slugNeg, 'agenda_vista'); }

  document.title = neg.nome + ' — cardápio e agenda';
  const cfg = neg.config;
  const palavra = neg.segmento === 'servico' ? 'um horário' : (neg.segmento === 'marmita' ? 'um pedido' : 'uma encomenda');
  const cli = lerCli();
  const carrinho = {};
  const formas = cfg.pagamentos.filter(p => p.ativo);
  const st = {
    data: '', hora: '', entrega: cfg.entrega.retirada ? 'retirada' : 'entrega', regiao: '', pagamento: formas[0] ? formas[0].nome : '',
    nome: cli.nome || '', sobrenome: cli.sobrenome || '', whatsapp: cli.whatsapp || '', endereco: cli.endereco || '', obs: '', anexos: []
  };
  const horas = horariosDoDia(cfg);

  const itensCarrinho = () => cardapio.filter(p => carrinho[p.id] > 0).map(p => ({ ...p, qtd: carrinho[p.id] }));
  const produtos = () => r2(itensCarrinho().reduce((a, p) => a + r2(p.qtd * p.preco), 0));
  const contas = forma => calcTaxas(produtos(), cfg, st.entrega, st.regiao, forma ?? st.pagamento);

  function msgOrcamento() {
    const its = itensCarrinho(), t = contas(), l = [`Oi! 🌸 Vi o cardápio da ${neg.nome} e queria ${palavra}${st.data ? ' para ' + quando(st.data, st.hora) : ''}.`];
    if (its.length) {
      l.push(its.map(p => `• ${fmtQtd(p.qtd, p.unidade)} ${p.nome} — ${brl(r2(p.qtd * p.preco))}`).join('\n'));
      const v = [];
      if (t.taxaEnt) v.push(`🚗 Entrega${st.regiao ? ' (' + st.regiao + ')' : ''}: ${brl(t.taxaEnt)}`);
      if (t.taxaPag) v.push(`💳 ${st.pagamento}: + ${brl(t.taxaPag)}`);
      v.push(`💰 Total estimado: ${brl(t.total)}`); l.push(v.join('\n'));
    }
    if (st.nome) l.push(`Meu nome é ${st.nome} 😊`);
    return l.join('\n\n');
  }

  function desenha() {
    const grupos = {};
    cardapio.forEach(p => { const g = p.grupo || 'Outros'; (grupos[g] = grupos[g] || []).push(p); });
    const temCardapio = cardapio.length > 0, its = itensCarrinho(), t = contas();
    const regioes = cfg.entrega.regioes;
    let n = 0; const passoN = () => (temCardapio ? (++n) + '. ' : '');
    app.innerHTML = `
      <header class="pub-head">
        <div><h1>${esc(neg.nome)}</h1><p class="sub">${temCardapio ? 'Monte seu pedido e veja o valor na hora 💕' : 'Escolha uma data livre e me chame no WhatsApp.'}</p></div>
        ${cli.token ? `<a class="btn ghost mini" href="meus-pedidos.html?c=${encodeURIComponent(cli.token)}">Meus pedidos</a>` : ''}
      </header>

      ${temCardapio ? `<h2>${passoN()}Cardápio</h2>
      ${Object.entries(grupos).map(([g, ps]) => `<h3 class="grp">${esc(g)}</h3><div class="menu-pub">${ps.map(p => `
        <div class="mp ${carrinho[p.id] ? 'on' : ''}">
          ${p.foto_url ? `<img src="${esc(p.foto_url)}" alt="${esc(p.nome)}" loading="lazy">` : `<span class="gph">${thumb('', p.nome, 72)}</span>`}
          <div class="mp-body"><strong>${esc(p.nome)}</strong>${p.subgrupo ? `<span class="small muted">${esc(p.subgrupo)}</span>` : ''}
            <span class="money">${precoUn(p.preco, p.unidade)}</span>
            <div class="qty"><button type="button" data-menos="${p.id}" aria-label="Menos">−</button><span>${carrinho[p.id] ? fmtQtd(carrinho[p.id], p.unidade) : '0'}</span><button type="button" data-mais="${p.id}" aria-label="Mais">+</button></div>
          </div></div>`).join('')}</div>`).join('')}` : ''}

      <h2>${passoN()}Data e horário</h2>
      <div class="public"><div class="days">${dias.map(d => `<button type="button" data-d="${d.dia}" ${d.livre ? '' : 'disabled'} aria-pressed="${st.data === d.dia}">${fmtD(d.dia)}</button>`).join('')}</div>
        ${st.data ? `<p class="small muted" style="margin:12px 0 6px">Horário ${st.entrega === 'entrega' ? 'da entrega' : 'da retirada'}:</p><div class="days horas">${horas.map(h => `<button type="button" data-h="${h}" aria-pressed="${st.hora === h}">${h}</button>`).join('')}</div>` : ''}
      </div>

      ${temCardapio ? `
      <h2>${passoN()}Entrega</h2>
      <div class="card" style="margin-top:0">
        ${cfg.entrega.retirada && cfg.entrega.entrega ? `<div class="seg"><button type="button" data-ent="retirada" aria-pressed="${st.entrega === 'retirada'}">🏠 Vou retirar</button><button type="button" data-ent="entrega" aria-pressed="${st.entrega === 'entrega'}">🚗 Quero entrega</button></div>` : `<p style="margin:0"><strong>${cfg.entrega.entrega ? '🚗 Entrega' : '🏠 Retirada no local'}</strong></p>`}
        ${st.entrega === 'retirada' && cfg.entrega.endereco_retirada ? `<p class="small muted" style="margin:8px 0 0">📍 Retirada em: ${esc(cfg.entrega.endereco_retirada)}</p>` : ''}
        ${st.entrega === 'entrega' ? (regioes.length ? `<label class="f" for="cReg">Região</label><select class="t" id="cReg"><option value="">Escolha a região…</option>${regioes.map(r => `<option value="${esc(r.nome)}" ${st.regiao === r.nome ? 'selected' : ''}>${esc(r.nome)} · ${r.valor ? brl(r.valor) : 'grátis'}</option>`).join('')}</select>` : `<p class="small muted" style="margin:8px 0 0">Taxa de entrega: ${cfg.entrega.taxa_padrao ? brl(cfg.entrega.taxa_padrao) : 'grátis'}</p>`)
          + `<label class="f" for="cEnd">Endereço de entrega</label><input class="t" id="cEnd" autocomplete="street-address" value="${esc(st.endereco)}">` : ''}
      </div>

      ${formas.length ? `<h2>${passoN()}Pagamento</h2>
      <div class="formas">${formas.map(f => { const c = contas(f.nome); return `<button type="button" class="forma ${st.pagamento === f.nome ? 'on' : ''}" data-pg="${esc(f.nome)}">
        <span><strong>${esc(f.nome)}</strong>${f.taxa ? `<br><span class="small muted">+${fmtPct(f.taxa)} da maquininha</span>` : ''}</span><strong>${its.length ? brl(c.total) : ''}</strong></button>`; }).join('')}</div>` : ''}

      <h2>${passoN()}Inspirações <span class="small muted" style="font-weight:600">(opcional)</span></h2>
      <p class="small muted" style="margin-top:0">Mande fotos de referência: topper, bolo, docinhos, decoração…</p>
      <div class="anexos">${st.anexos.map((a, k) => `<div class="anexo"><img src="${esc(a.url)}" alt=""><select data-leg="${k}">${LEGENDAS.map(l => `<option ${a.legenda === l ? 'selected' : ''}>${l}</option>`).join('')}</select><button type="button" class="x" data-rmanexo="${k}" aria-label="Tirar">×</button></div>`).join('')}</div>
      ${st.anexos.length < 6 ? `<label class="btn ghost mini" for="cArq" style="margin-top:6px">📷 Anexar foto</label><input type="file" id="cArq" accept="image/*" hidden>` : ''}

      <h2>${passoN()}Seus dados</h2>
      <div class="card" style="margin-top:0">
        <div class="two"><div><label class="f" for="cNome">Nome</label><input class="t" id="cNome" autocomplete="given-name" value="${esc(st.nome)}"></div>
        <div><label class="f" for="cSob">Sobrenome</label><input class="t" id="cSob" autocomplete="family-name" value="${esc(st.sobrenome)}"></div></div>
        <label class="f" for="cWa">WhatsApp</label><input class="t" id="cWa" inputmode="tel" autocomplete="tel" placeholder="61 99999-0000" value="${esc(st.whatsapp)}">
        <label class="f" for="cObs">Observação <em>(sabor, tema, nome no topper…)</em></label><textarea class="t" id="cObs">${esc(st.obs)}</textarea>
      </div>

      ${its.length ? `<div class="card resumo">
        <h3 style="margin:0 0 6px">🧾 Resumo</h3>
        ${its.map(p => `<div class="kv"><span>${fmtQtd(p.qtd, p.unidade)} ${esc(p.nome)}</span><span>${brl(r2(p.qtd * p.preco))}</span></div>`).join('')}
        ${t.taxaEnt ? `<div class="kv"><span>🚗 Entrega${st.regiao ? ' · ' + esc(st.regiao) : ''}</span><span>${brl(t.taxaEnt)}</span></div>` : ''}
        ${t.taxaPag ? `<div class="kv"><span>💳 ${esc(st.pagamento)} (+${fmtPct(t.pct)})</span><span>${brl(t.taxaPag)}</span></div>` : ''}
        <div class="kv big"><span>Total</span><strong>${brl(t.total)}</strong></div>
        ${st.data ? `<p class="small" style="margin:6px 0 0">📅 ${st.entrega === 'entrega' ? 'Entrega' : 'Retirada'}: ${quando(st.data, st.hora)}</p>` : ''}
      </div>` : ''}
      <p class="err" id="cErr"></p>
      <button class="btn go" id="cEnviar">Enviar pedido</button>
      <p class="small muted" style="text-align:center">${esc(neg.nome)} confirma o pedido e o sinal pelo WhatsApp 💕</p>` : ''}
      <a class="btn ${temCardapio ? 'ghost' : 'wa'}" id="cOrc" href="${waLinkTel(neg.whatsapp, msgOrcamento())}" target="_blank" rel="noopener">${temCardapio ? 'Só quero um orçamento pelo WhatsApp' : (st.data ? 'Pedir para ' + fmtD(st.data) : 'Chamar no WhatsApp')}</a>
      <p class="small muted" style="text-align:center;margin-top:18px">feito com Doce na Mão</p>
      ${its.length ? `<div class="cart-bar"><span><strong>${brl(t.total)}</strong><br><span class="small">${its.length} ${its.length === 1 ? 'item' : 'itens'}${st.data ? ' · ' + quando(st.data, st.hora) : ''}</span></span><button class="btn go mini" id="cIr">${st.data ? 'Finalizar' : 'Escolher data'}</button></div>` : ''}`;
    ligar();
  }

  function ligar() {
    const passo = id => (UNIDADES[(cardapio.find(p => p.id === id) || {}).unidade] || UNIDADES.un).passo;
    const redesenha = () => { const y = window.scrollY; desenha(); window.scrollTo(0, y); };
    const campo = (id, k, salva) => { const e = $('#' + id); if (e) e.oninput = () => { st[k] = e.value; if (salva) gravarCli({ [k]: e.value.trim() }); }; };
    campo('cNome', 'nome', 1); campo('cSob', 'sobrenome', 1); campo('cWa', 'whatsapp', 1); campo('cEnd', 'endereco', 1); campo('cObs', 'obs');
    $$('[data-mais]').forEach(b => b.onclick = () => { const id = b.dataset.mais; carrinho[id] = r2((carrinho[id] || 0) + passo(id)); redesenha(); });
    $$('[data-menos]').forEach(b => b.onclick = () => { const id = b.dataset.menos; carrinho[id] = Math.max(0, r2((carrinho[id] || 0) - passo(id))); redesenha(); });
    $$('[data-d]').forEach(b => b.onclick = () => { st.data = st.data === b.dataset.d ? '' : b.dataset.d; redesenha(); });
    $$('[data-h]').forEach(b => b.onclick = () => { st.hora = st.hora === b.dataset.h ? '' : b.dataset.h; redesenha(); });
    $$('[data-ent]').forEach(b => b.onclick = () => { st.entrega = b.dataset.ent; redesenha(); });
    if ($('#cReg')) $('#cReg').onchange = e => { st.regiao = e.target.value; redesenha(); };
    $$('[data-pg]').forEach(b => b.onclick = () => { st.pagamento = b.dataset.pg; redesenha(); });
    $$('[data-leg]').forEach(s => s.onchange = () => st.anexos[+s.dataset.leg].legenda = s.value);
    $$('[data-rmanexo]').forEach(b => b.onclick = () => { st.anexos.splice(+b.dataset.rmanexo, 1); redesenha(); });
    if ($('#cArq')) $('#cArq').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      toast('Enviando foto…');
      try { const blob = await reduzirFoto(f, DB.online ? 1200 : 500, DB.online ? 0.8 : 0.7); const url = await DB.enviarArquivo('inspiracoes', neg.id, blob); st.anexos.push({ url, legenda: 'Bolo' }); redesenha(); toast('Foto anexada ✨'); }
      catch (err) { toast('Não consegui enviar a foto. Tente outra.'); }
    };
    $('#cOrc').addEventListener('click', () => { $('#cOrc').href = waLinkTel(neg.whatsapp, msgOrcamento()); DB.visita(slugNeg, 'orcamento_whatsapp'); });
    if ($('#cIr')) $('#cIr').onclick = () => { const alvo = st.data ? $('#cNome') : $('.days'); alvo?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    if ($('#cEnviar')) $('#cEnviar').onclick = enviar;
  }

  async function enviar() {
    const erro = m => { $('#cErr').textContent = m; $('#cErr').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    const its = itensCarrinho();
    if (!its.length) return erro('Escolha pelo menos um produto no cardápio.');
    if (!st.data) return erro('Escolha uma data.');
    if (!st.hora) return erro('Escolha um horário.');
    if (st.entrega === 'entrega' && cfg.entrega.regioes.length && !st.regiao) return erro('Escolha a região de entrega.');
    if (st.entrega === 'entrega' && !st.endereco.trim()) return erro('Informe o endereço de entrega.');
    if (!st.nome.trim()) return erro('Digite seu nome.');
    if (st.whatsapp.replace(/\D/g, '').length < 10) return erro('Digite seu WhatsApp com DDD.');
    const d = { nome: st.nome.trim(), sobrenome: st.sobrenome.trim(), whatsapp: st.whatsapp.trim(), endereco: st.endereco.trim(), obs: st.obs.trim(),
      data: st.data, hora: st.hora, entrega: st.entrega, regiao: st.regiao, pagamento: st.pagamento, anexos: st.anexos, token: cli.token || null,
      itens: its.map(p => ({ produto_id: p.id, quantidade: p.qtd })) };
    $('#cEnviar').disabled = true; $('#cErr').textContent = '';
    try {
      const r = await DB.solicitar(slugNeg, d);
      if (r.token) gravarCli({ token: r.token });
      const token = r.token || cli.token;
      const aviso = [`Oi! 🌸 Acabei de fazer o pedido #${noPad(r.numero)} pelo cardápio da ${neg.nome}.`,
        its.map(p => `• ${fmtQtd(p.qtd, p.unidade)} ${p.nome}`).join('\n'),
        `📅 ${st.entrega === 'entrega' ? 'Entrega' : 'Retirada'}: ${quando(st.data, st.hora)}${st.regiao ? '\n📍 ' + st.regiao : ''}`,
        `💳 ${st.pagamento || 'Pagamento a combinar'}\n💰 Total: ${brl(r.total)}`,
        `Meu nome é ${(d.nome + ' ' + d.sobrenome).trim()} 😊`].join('\n\n');
      app.innerHTML = `<div class="card ok-card">
        <h1>Pedido #${noPad(r.numero)} enviado! 🎉</h1>
        <p>${esc(neg.nome)} vai conferir e confirmar pelo WhatsApp, junto com o valor do sinal 💕</p>
        ${r.taxa_entrega ? `<div class="kv"><span>🚗 Entrega</span><span>${brl(r.taxa_entrega)}</span></div>` : ''}
        ${r.taxa_pagamento ? `<div class="kv"><span>💳 Taxa ${esc(st.pagamento)}</span><span>${brl(r.taxa_pagamento)}</span></div>` : ''}
        <div class="kv big"><span>Total</span><strong>${brl(r.total)}</strong></div>
        <a class="btn wa" href="${waLinkTel(neg.whatsapp, aviso)}" target="_blank" rel="noopener">Avisar no WhatsApp</a>
        ${token ? `<a class="btn go" href="meus-pedidos.html?c=${encodeURIComponent(token)}">Acompanhar meus pedidos</a>
          <p class="small muted">Este aparelho já guardou seu acesso. Para ver de outro celular, peça o link "Meus pedidos" para ${esc(neg.nome)}.</p>`
          : `<p class="small muted">Para acompanhar seus pedidos, peça o seu link "Meus pedidos" para ${esc(neg.nome)} pelo WhatsApp.</p>`}
        <button class="btn ghost" id="cNovo">Fazer outro pedido</button></div>`;
      $('#cNovo').onclick = () => location.reload();
      window.scrollTo(0, 0);
    } catch (e) {
      const b = $('#cEnviar'); if (b) b.disabled = false;
      if (/lotar/i.test(e.message || '')) { const r = await DB.agendaPublica(slugNeg, 30); dias = r.dias; st.data = ''; desenha(); }
      erro(e.message || 'Não consegui enviar. Tente de novo.');
    }
  }

  desenha();
})();
