/* Página pública: cardápio com fotos, orçamento, escolha da data e pedido feito pelo próprio cliente. */
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
  document.title = neg.nome + ' — cardápio e agenda';
  const palavra = neg.segmento === 'servico' ? 'um horário' : (neg.segmento === 'marmita' ? 'um pedido' : 'uma encomenda');
  const carrinho = {};       // produto_id -> quantidade
  let escolhido = '';
  const cli = lerCli();

  const itensCarrinho = () => cardapio.filter(p => carrinho[p.id] > 0).map(p => ({ ...p, qtd: carrinho[p.id] }));
  const total = () => r2(itensCarrinho().reduce((a, p) => a + r2(p.qtd * p.preco), 0));
  const telNeg = neg.whatsapp;

  function msgOrcamento() {
    const its = itensCarrinho();
    const l = [`Oi! Vi seu cardápio e queria ${palavra}${escolhido ? ' para ' + fmtD(escolhido) : ''}.`];
    if (its.length) { its.forEach(p => l.push(`• ${fmtQtd(p.qtd, p.unidade)} ${p.nome} — ${brl(r2(p.qtd * p.preco))}`)); l.push(`Total estimado: ${brl(total())}`); }
    const nome = ($('#cNome')?.value || cli.nome || '').trim();
    if (nome) l.push(`Meu nome: ${nome}`);
    return l.join('\n');
  }

  function desenha() {
    const grupos = {};
    cardapio.forEach(p => { const g = p.grupo || 'Outros'; (grupos[g] = grupos[g] || []).push(p); });
    const temCardapio = cardapio.length > 0;
    const its = itensCarrinho();
    app.innerHTML = `
      <header class="pub-head">
        <div><h1>${esc(neg.nome)}</h1><p class="sub">${temCardapio ? 'Monte seu pedido, escolha a data e envie.' : 'Escolha uma data livre e me chame no WhatsApp.'}</p></div>
        ${cli.token ? `<a class="btn ghost mini" href="meus-pedidos.html?c=${encodeURIComponent(cli.token)}">Meus pedidos</a>` : ''}
      </header>

      ${temCardapio ? `<h2>1. Cardápio</h2>
      ${Object.entries(grupos).map(([g, ps]) => `<h3 class="grp">${esc(g)}</h3><div class="menu-pub">${ps.map(p => `
        <div class="mp ${carrinho[p.id] ? 'on' : ''}">
          ${p.foto_url ? `<img src="${esc(p.foto_url)}" alt="${esc(p.nome)}" loading="lazy">` : `<span class="gph">${thumb('', p.nome, 72)}</span>`}
          <div class="mp-body"><strong>${esc(p.nome)}</strong>${p.subgrupo ? `<span class="small muted">${esc(p.subgrupo)}</span>` : ''}
            <span class="money">${precoUn(p.preco, p.unidade)}</span>
            <div class="qty"><button type="button" data-menos="${p.id}" aria-label="Menos">−</button><span>${carrinho[p.id] ? fmtQtd(carrinho[p.id], p.unidade) : '0'}</span><button type="button" data-mais="${p.id}" aria-label="Mais">+</button></div>
          </div></div>`).join('')}</div>`).join('')}` : ''}

      <h2>${temCardapio ? '2. ' : ''}Data</h2>
      <div class="public"><div class="days">${dias.map(d => `<button type="button" data-d="${d.dia}" ${d.livre ? '' : 'disabled'} aria-pressed="${escolhido === d.dia}">${fmtD(d.dia)}</button>`).join('')}</div></div>

      ${temCardapio ? `<h2>3. Seus dados</h2>
      <div class="card" style="margin-top:0">
        <div class="two"><div><label class="f" for="cNome">Nome</label><input class="t" id="cNome" autocomplete="given-name" value="${esc(cli.nome || '')}"></div>
        <div><label class="f" for="cSob">Sobrenome</label><input class="t" id="cSob" autocomplete="family-name" value="${esc(cli.sobrenome || '')}"></div></div>
        <label class="f" for="cWa">WhatsApp</label><input class="t" id="cWa" inputmode="tel" autocomplete="tel" placeholder="61 99999-0000" value="${esc(cli.whatsapp || '')}">
        <label class="f" for="cEnd">Endereço para entrega <em>(se for entrega)</em></label><input class="t" id="cEnd" autocomplete="street-address" value="${esc(cli.endereco || '')}">
        <label class="f" for="cObs">Observação <em>(sabor, tema, horário…)</em></label><textarea class="t" id="cObs"></textarea>
        <p class="err" id="cErr"></p>
        <button class="btn go" id="cEnviar">Enviar pedido</button>
        <p class="small muted" style="text-align:center">${esc(neg.nome)} confirma o pedido e o valor do sinal pelo WhatsApp.</p>
      </div>` : ''}
      <a class="btn ${temCardapio ? 'ghost' : 'wa'}" id="cOrc" href="${waLinkTel(telNeg, msgOrcamento())}" target="_blank" rel="noopener">${temCardapio ? 'Só quero um orçamento pelo WhatsApp' : (escolhido ? 'Pedir para ' + fmtD(escolhido) : 'Chamar no WhatsApp')}</a>
      <p class="small muted" style="text-align:center;margin-top:18px">feito com Doce na Mão</p>
      ${its.length ? `<div class="cart-bar"><span><strong>${brl(total())}</strong><br><span class="small">${its.length} ${its.length === 1 ? 'item' : 'itens'}${escolhido ? ' · ' + fmtD(escolhido) : ''}</span></span><button class="btn go mini" id="cIr">${escolhido ? 'Seus dados' : 'Escolher data'}</button></div>` : ''}`;

    const passo = id => (UNIDADES[(cardapio.find(p => p.id === id) || {}).unidade] || UNIDADES.un).passo;
    const salvarDigitado = () => { if ($('#cNome')) gravarCli({ nome: $('#cNome').value.trim(), sobrenome: $('#cSob').value.trim(), whatsapp: $('#cWa').value.trim(), endereco: $('#cEnd').value.trim() }); Object.assign(cli, lerCli()); };
    const redesenha = () => { const y = window.scrollY; salvarDigitado(); const obs = $('#cObs')?.value || ''; desenha(); if ($('#cObs')) $('#cObs').value = obs; window.scrollTo(0, y); };
    $$('[data-mais]').forEach(b => b.onclick = () => { const id = b.dataset.mais; carrinho[id] = r2((carrinho[id] || 0) + passo(id)); redesenha(); });
    $$('[data-menos]').forEach(b => b.onclick = () => { const id = b.dataset.menos; carrinho[id] = Math.max(0, r2((carrinho[id] || 0) - passo(id))); redesenha(); });
    $$('[data-d]').forEach(b => b.onclick = () => { escolhido = escolhido === b.dataset.d ? '' : b.dataset.d; redesenha(); });
    $('#cOrc').addEventListener('click', () => { $('#cOrc').href = waLinkTel(telNeg, msgOrcamento()); });
    if ($('#cIr')) $('#cIr').onclick = () => { const alvo = escolhido ? $('#cNome') : $('.days'); alvo?.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (escolhido) $('#cNome')?.focus(); };
    if ($('#cEnviar')) $('#cEnviar').onclick = enviar;
  }

  async function enviar() {
    const erro = m => { $('#cErr').textContent = m; };
    const its = itensCarrinho();
    if (!its.length) return erro('Escolha pelo menos um produto no cardápio.');
    if (!escolhido) return erro('Escolha uma data.');
    const d = { nome: $('#cNome').value.trim(), sobrenome: $('#cSob').value.trim(), whatsapp: $('#cWa').value.trim(), endereco: $('#cEnd').value.trim(), obs: $('#cObs').value.trim(), data: escolhido, token: cli.token || null,
      itens: its.map(p => ({ produto_id: p.id, quantidade: p.qtd })) };
    if (!d.nome) return erro('Digite seu nome.');
    const tel = d.whatsapp.replace(/\D/g, '');
    if (tel.length < 10) return erro('Digite seu WhatsApp com DDD.');
    gravarCli({ nome: d.nome, sobrenome: d.sobrenome, whatsapp: d.whatsapp, endereco: d.endereco });
    $('#cEnviar').disabled = true; erro('');
    try {
      const r = await DB.solicitar(slugNeg, d);
      if (r.token) gravarCli({ token: r.token });
      const token = r.token || cli.token;
      const aviso = [`Oi! Acabei de fazer o pedido #${noPad(r.numero)} pelo cardápio, para ${fmtD(escolhido)}:`, ...its.map(p => `• ${fmtQtd(p.qtd, p.unidade)} ${p.nome}`), `Total: ${brl(r.total)}`, `Nome: ${d.nome} ${d.sobrenome}`.trim()].join('\n');
      app.innerHTML = `<div class="card ok-card">
        <h1>Pedido #${noPad(r.numero)} enviado!</h1>
        <p>${esc(neg.nome)} vai conferir e confirmar pelo WhatsApp, junto com o valor do sinal.</p>
        <div class="kv big"><span>Total</span><strong>${brl(r.total)}</strong></div>
        <a class="btn wa" href="${waLinkTel(telNeg, aviso)}" target="_blank" rel="noopener">Avisar no WhatsApp</a>
        ${token ? `<a class="btn go" href="meus-pedidos.html?c=${encodeURIComponent(token)}">Acompanhar meus pedidos</a>
          <p class="small muted">Este aparelho já guardou seu acesso. Para ver de outro celular, peça o link "Meus pedidos" para ${esc(neg.nome)}.</p>`
          : `<p class="small muted">Para acompanhar seus pedidos, peça o seu link "Meus pedidos" para ${esc(neg.nome)} pelo WhatsApp.</p>`}
        <button class="btn ghost" id="cNovo">Fazer outro pedido</button></div>`;
      $('#cNovo').onclick = () => location.reload();
      window.scrollTo(0, 0);
    } catch (e) {
      erro(e.message || 'Não consegui enviar. Tente de novo.');
      if (/lotar/i.test(e.message || '')) { const r = await DB.agendaPublica(slugNeg, 30); dias = r.dias; escolhido = ''; desenha(); $('#cErr').textContent = e.message; }
    } finally { const b = $('#cEnviar'); if (b) b.disabled = false; }
  }

  desenha();
})();
