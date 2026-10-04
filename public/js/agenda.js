/* Página pública da agenda: mostra só dias livres/lotados e abre o WhatsApp do negócio. */
(async () => {
  const app = document.getElementById('app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const fmt = s => { const d = new Date(s + 'T12:00'); return WD[d.getDay()] + ', ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); };
  const slug = new URLSearchParams(location.search).get('n') || '';
  try {
    const { neg, dias } = await DB.agendaPublica(slug, 30);
    if (!neg) { app.innerHTML = '<div class="empty" style="margin-top:40px">Agenda não encontrada. Confira o link com quem te enviou.</div>'; return; }
    document.title = neg.nome + ' — agenda';
    const palavra = neg.segmento === 'servico' ? 'um horário' : (neg.segmento === 'marmita' ? 'um pedido' : 'uma encomenda');
    let escolhido = '';
    const desenha = () => {
      const txt = escolhido ? `Oi! Vi sua agenda e queria ${palavra} para ${fmt(escolhido)}.` : `Oi! Vi sua agenda e queria fazer ${palavra}.`;
      const tel = neg.whatsapp ? '55' + String(neg.whatsapp).replace(/\D/g, '').replace(/^55/, '') : '';
      app.innerHTML = `<div class="public" style="margin-top:12px">
        <h1 style="font-size:26px">${esc(neg.nome)}</h1>
        <p class="sub">Datas com vaga nos próximos 30 dias. Toque em uma e me chame no WhatsApp.</p>
        <div class="days">${dias.map(d => `<button data-d="${d.dia}" ${d.livre ? '' : 'disabled'} aria-pressed="${escolhido === d.dia}">${fmt(d.dia)}</button>`).join('')}</div>
        <a class="btn wa" href="https://wa.me/${tel}?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">${escolhido ? 'Pedir para ' + fmt(escolhido) : 'Chamar no WhatsApp'}</a>
        <p class="small muted" style="text-align:center;margin-bottom:0">feito com Doce na Mão</p></div>`;
      app.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { escolhido = escolhido === b.dataset.d ? '' : b.dataset.d; desenha(); });
    };
    desenha();
  } catch (e) {
    app.innerHTML = `<div class="empty" style="margin-top:40px">Não consegui carregar a agenda agora. Tente de novo em instantes.</div>`;
  }
})();
