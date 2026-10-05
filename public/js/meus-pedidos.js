/* "Meus pedidos": o cliente acompanha o andamento e o histórico pelo link pessoal. */
(async () => {
  const app = $('#app');
  const token = new URLSearchParams(location.search).get('c') || '';
  const ETAPAS = [['solicitado', 'Enviado'], ['aguardando', 'Aguardando sinal'], ['confirmado', 'Confirmado'], ['producao', 'Em produção'], ['entregue', 'Entregue']];
  let r;
  try { r = token ? await DB.meusPedidos(token) : null; } catch (e) { r = undefined; }
  if (r === undefined) { app.innerHTML = '<div class="empty" style="margin-top:40px">Não consegui carregar agora. Tente de novo em instantes.</div>'; return; }
  if (!r) { app.innerHTML = '<div class="empty" style="margin-top:40px">Link inválido. Peça o seu link "Meus pedidos" para quem te atende.</div>'; return; }
  try { localStorage.setItem('dnm-cliente-' + r.negocio.slug, JSON.stringify({ nome: r.cliente.nome, sobrenome: r.cliente.sobrenome || '', whatsapp: fmtTel(r.cliente.whatsapp), endereco: r.cliente.endereco || '', token })); } catch (e) {}
  document.title = 'Meus pedidos — ' + r.negocio.nome;
  const hoje = today();
  const abertos = r.pedidos.filter(p => p.status !== 'cancelado' && p.status !== 'entregue');
  const devendo = r.pedidos.filter(p => p.status !== 'cancelado' && p.status !== 'solicitado').reduce((a, p) => a + Math.max(0, r2(p.valor - p.pago)), 0);

  const card = p => {
    const falta = Math.max(0, r2(p.valor - p.pago));
    const idx = ETAPAS.findIndex(e => e[0] === p.status);
    const etapas = p.status === 'cancelado' ? '<span class="badge">Cancelado</span>'
      : `<ol class="timeline">${ETAPAS.filter(e => e[0] !== 'aguardando' || p.status === 'aguardando').map(e => { const i = ETAPAS.findIndex(x => x[0] === e[0]); return `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}">${e[1]}</li>`; }).join('')}</ol>`;
    const vencido = falta > 0 && p.vencimento && p.vencimento < hoje && p.status !== 'solicitado';
    return `<article class="card mp-card">
      <div class="row-top"><strong>Pedido #${noPad(p.numero)}</strong><span class="small muted">${p.data ? 'Entrega ' + fmtD(p.data) : ''}</span></div>
      ${etapas}
      <ul class="lista-itens">${(p.itens.length ? p.itens.map(i => `<li><span>${fmtQtd(i.quantidade, i.unidade)} ${esc(i.descricao)}</span><span>${brl(r2(i.quantidade * i.preco))}</span></li>`) : [`<li><span>${esc(p.descricao)}</span></li>`]).join('')}</ul>
      <div class="kv big"><span>Total</span><strong>${brl(p.valor)}</strong></div>
      ${p.status === 'solicitado' ? '<p class="small muted">Aguardando confirmação. O valor pode ser ajustado na confirmação.</p>'
        : p.status === 'cancelado' ? '' : falta > 0 ? `<div class="kv"><span>Pago</span><span>${brl(p.pago)}</span></div>
          <div class="kv"><span>Falta${p.vencimento ? ' (até ' + fmtD(p.vencimento) + ')' : ''}</span><strong style="color:var(--late)">${brl(falta)}</strong></div>
          ${vencido ? '<p class="warn">Pagamento vencido</p>' : ''}` : '<p class="badge go" style="margin-top:8px">Pago</p>'}
    </article>`;
  };

  app.innerHTML = `
    <header class="pub-head"><div><p class="small muted" style="margin:0">${esc(r.negocio.nome)}</p><h1>Olá, ${esc(r.cliente.nome)}!</h1></div></header>
    ${devendo > 0 ? `<div class="card" style="margin-top:0"><div class="kv big" style="border:0"><span>Total em aberto</span><strong style="color:var(--late)">${brl(devendo)}</strong></div>
      ${r.negocio.pix ? `<p class="small" style="margin:0">Pix: <strong>${esc(r.negocio.pix)}</strong></p><button class="btn ghost mini" id="mpPix">Copiar chave Pix</button>` : ''}</div>` : ''}
    <div class="two"><a class="btn go" href="agenda.html?n=${encodeURIComponent(r.negocio.slug)}">Fazer novo pedido</a>
    <a class="btn wa" href="${waLinkTel(r.negocio.whatsapp, 'Oi! Sou ' + r.cliente.nome + ', queria falar sobre meu pedido.')}" target="_blank" rel="noopener">Falar no WhatsApp</a></div>
    <h2>Em andamento (${abertos.length})</h2>
    ${abertos.length ? abertos.map(card).join('') : '<div class="empty">Nenhum pedido em andamento.</div>'}
    ${r.pedidos.length > abertos.length ? `<h2>Histórico</h2>${r.pedidos.filter(p => !abertos.includes(p)).map(card).join('')}` : ''}
    <p class="small muted" style="text-align:center;margin-top:18px">Salve esta página nos favoritos ou na tela inicial para acompanhar.<br>feito com Doce na Mão</p>`;
  if ($('#mpPix')) $('#mpPix').onclick = () => copiar(r.negocio.pix, 'Chave Pix copiada');
})();
