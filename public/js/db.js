// Camada de dados: Supabase (online) ou localStorage (modo demo).
// As telas só falam com DB.*, então trocar de backend não mexe nelas.
const TEXTO_ANTIGO = 'Oi, {cliente}! Aqui é da {negocio}. Seu pedido #{numero} ({descricao}) está confirmado para {data}. Valor total {valor}. {linha_sinal}Pix: {pix}. Obrigada!';
const TEXTO_PADRAO = 'Oi, {cliente}! Aqui é da {negocio}.\nPedido #{numero}: {itens}\nEntrega: {data} · Pagar até: {vencimento}\nTotal {valor} · Já pago {pago}\n{linha_sinal}Pix: {pix}\nAcompanhe seus pedidos: {link}';

const DB = (() => {
  const cfg = window.DNM_CONFIG || {};
  const online = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const sb = online ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  const dia = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const mais = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return dia(d); };
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now() + Math.random().toString(16).slice(2));
  const copia = o => JSON.parse(JSON.stringify(o));
  const r2 = v => Math.round(v * 100) / 100;

  /* ---------- conversões banco <-> app ---------- */
  const deNeg = r => r && ({ id: r.id, nome: r.nome, slug: r.slug, seg: r.segmento, pix: r.pix || '', whats: r.whatsapp || '', limite: r.limite_dia,
    texto: (!r.texto_cobranca || r.texto_cobranca === TEXTO_ANTIGO) ? TEXTO_PADRAO : r.texto_cobranca });
  const paraNeg = n => ({ nome: n.nome, segmento: n.seg, pix: n.pix || null, whatsapp: n.whats || null, limite_dia: n.limite, texto_cobranca: n.texto });
  const deCli = r => ({ id: r.id, nome: r.nome, sobrenome: r.sobrenome || '', whats: r.whatsapp || '', endereco: r.endereco || '', obs: r.obs || '', token: r.token, origem: r.origem || 'app' });
  const paraCli = c => ({ nome: c.nome, sobrenome: c.sobrenome || null, whatsapp: c.whats || null, endereco: c.endereco || null, obs: c.obs || null });
  const deProd = r => ({ id: r.id, nome: r.nome, grupo: r.grupo || '', subgrupo: r.subgrupo || '', un: r.unidade, preco: Number(r.preco), foto: r.foto_url || '', ativo: r.ativo !== false, cardapio: r.no_cardapio !== false });
  const paraProd = p => ({ nome: p.nome, grupo: p.grupo || null, subgrupo: p.subgrupo || null, unidade: p.un, preco: p.preco, foto_url: p.foto || null, ativo: p.ativo !== false, no_cardapio: p.cardapio !== false });
  const deItem = i => ({ id: i.id, produtoId: i.produto_id, desc: i.descricao, un: i.unidade, qtd: Number(i.quantidade), precoTab: Number(i.preco_tabela), preco: Number(i.preco) });
  const dePed = r => ({
    id: r.id, no: r.numero, clienteId: r.cliente_id || '', cliente: r.cliente_nome, tel: r.cliente_tel || '', desc: r.descricao,
    valor: Number(r.valor), sinal: Number(r.sinal || 0), ajuste: Number(r.ajuste || 0), data: r.data_entrega || '', venc: r.vencimento || '',
    status: r.status, obs: r.obs || '', repetir: r.repetir || '', origem: r.origem || 'app', criado: (r.criado_em || '').slice(0, 10),
    pagamentos: (r.pagamentos || []).map(x => ({ id: x.id, v: Number(x.valor), d: x.pago_em, f: x.forma })).sort((a, b) => a.d.localeCompare(b.d)),
    itens: (r.pedido_itens || []).slice().sort((a, b) => a.ordem - b.ordem).map(deItem)
  });
  const paraPed = p => ({
    cliente_id: p.clienteId || null, cliente_nome: p.cliente, cliente_tel: p.tel || null, descricao: p.desc, valor: p.valor, sinal: p.sinal || 0,
    ajuste: p.ajuste || 0, data_entrega: p.data || null, vencimento: p.venc || null, status: p.status, obs: p.obs || null,
    repetir: p.repetir || null, origem: p.origem || 'app'
  });
  const paraItens = (pedidoId, itens) => itens.map((i, k) => ({ pedido_id: pedidoId, produto_id: i.produtoId || null, descricao: i.desc, unidade: i.un, quantidade: i.qtd, preco_tabela: i.precoTab, preco: i.preco, ordem: k }));
  const CAMPOS = { cliente: 'cliente_nome', tel: 'cliente_tel', desc: 'descricao', valor: 'valor', sinal: 'sinal', data: 'data_entrega', venc: 'vencimento', status: 'status', obs: 'obs', repetir: 'repetir', ajuste: 'ajuste' };
  const SEL_PED = '*, pagamentos(*), pedido_itens(*)';

  const erro = e => {
    const m = (e && e.message) || String(e);
    if (/Invalid login/i.test(m)) return new Error('E-mail ou senha incorretos.');
    if (/already registered|already been registered/i.test(m)) return new Error('Esse e-mail já tem conta. Use "Entrar".');
    if (/Password should be/i.test(m)) return new Error('A senha precisa ter pelo menos 6 caracteres.');
    if (/Email not confirmed/i.test(m)) return new Error('Confirme seu e-mail pelo link que enviamos e tente de novo.');
    if (/Email logins are disabled/i.test(m)) return new Error('Login por e-mail desligado no Supabase (Authentication > Sign In / Providers > Email).');
    if (/clientes_negocio_whats/i.test(m)) return new Error('Já existe um cliente com esse WhatsApp.');
    if (/relation .*(clientes|produtos|pedido_itens).* does not exist|Could not find the table/i.test(m)) return new Error('Falta rodar o arquivo v2-clientes-produtos.sql no Supabase.');
    if (/Failed to fetch|NetworkError/i.test(m)) return new Error('Sem internet. Tente de novo em instantes.');
    return new Error(m);
  };
  const ok = ({ data, error }) => { if (error) throw erro(error); return data; };

  /* ---------- modo demo (localStorage) ---------- */
  const KEY = 'doce-na-mao-demo-v2';
  const ler = () => { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) {} return null; };
  const salvarDemo = () => { try { localStorage.setItem(KEY, JSON.stringify(demo)); } catch (e) { console.warn('Armazenamento cheio', e); } };
  function exemplo() {
    const t = dia();
    const P = (nome, grupo, subgrupo, un, preco) => ({ id: uid(), nome, grupo, subgrupo, un, preco, foto: '', ativo: true, cardapio: true });
    const produtos = [
      P('Bolo de chocolate', 'Bolos', 'Tradicionais', 'kg', 85), P('Bolo de cenoura com chocolate', 'Bolos', 'Tradicionais', 'kg', 75),
      P('Bolo de festa', 'Bolos', 'Festa', 'kg', 110), P('Brigadeiro tradicional', 'Docinhos', 'Tradicionais', 'cento', 120),
      P('Brigadeiro gourmet', 'Docinhos', 'Gourmet', 'cento', 160), P('Bolo de pote', 'Potes', '', 'un', 12), P('Brownie', 'Assados', '', 'un', 8)
    ];
    const C = (nome, sobrenome, whats, endereco) => ({ id: uid(), nome, sobrenome, whats, endereco, obs: '', token: uid(), origem: 'app' });
    const clientes = [C('Ana', 'Souza', '61999990002', 'Quadra 3, casa 10'), C('Rafael', 'Lima', '61999990003', ''), C('Carla', 'Menezes', '61999990001', 'Rua das Flores, 45'),
      C('Júlia', 'Prado', '61999990004', ''), C('Patrícia', 'Gomes', '61999990006', ''), C('Bruno', 'Alves', '61999990007', '')];
    let seq = 0;
    const I = (prod, qtd, preco) => ({ id: uid(), produtoId: prod.id, desc: prod.nome, un: prod.un, qtd, precoTab: prod.preco, preco: preco ?? prod.preco });
    const Ped = (cli, itens, ajuste, data, status, sinal, pags, origem) => {
      const valor = r2(itens.reduce((a, i) => a + r2(i.qtd * i.preco), 0) + ajuste);
      return { id: uid(), no: ++seq, clienteId: cli.id, cliente: cli.nome + ' ' + cli.sobrenome, tel: cli.whats, desc: itens.map(i => i.qtd + ' ' + i.desc).join(', '),
        valor, sinal, ajuste, data, venc: data, status, obs: '', repetir: '', origem: origem || 'app', criado: mais(t, -3), pagamentos: pags || [], itens };
    };
    const [bc, bce, bf, bt, bg, bp, br] = produtos, [ana, raf, car, jul, pat, bru] = clientes;
    const pedidos = [
      Ped(raf, [I(bf, 3)], -20, mais(t, -14), 'entregue', 160, [{ id: uid(), v: 310, d: mais(t, -14), f: 'Pix' }]),
      Ped(pat, [I(br, 50, 7)], 0, mais(t, -3), 'entregue', 175, [{ id: uid(), v: 100, d: mais(t, -9), f: 'Pix' }]),
      Ped(car, [I(bce, 1.5)], 0, t, 'producao', 56.25, [{ id: uid(), v: 56.25, d: mais(t, -5), f: 'Pix' }]),
      Ped(ana, [I(bc, 2), I(bp, 6)], 0, mais(t, 2), 'aguardando', 121),
      Ped(raf, [I(bt, 1)], 10, mais(t, 2), 'confirmado', 65, [{ id: uid(), v: 65, d: mais(t, -2), f: 'Pix' }]),
      Ped(jul, [I(bf, 2.5, 100), I(bg, 1)], 0, mais(t, 3), 'confirmado', 205, [{ id: uid(), v: 205, d: mais(t, -1), f: 'Pix' }]),
      Ped(bru, [I(bt, 0.5), I(br, 10)], 0, mais(t, 6), 'solicitado', 0, [], 'agenda')
    ];
    pedidos[2].venc = t; // Carla paga o resto hoje
    return {
      neg: { id: 'demo', nome: 'Doces da Lu', slug: 'doces-da-lu', seg: 'doces', pix: 'lu.doces@email.com', whats: '61999990000', limite: 3, texto: TEXTO_PADRAO },
      seq, bloqueios: [mais(t, 4)], pedidos, clientes, produtos
    };
  }
  let demo = online ? null : (ler() || exemplo());
  const recarregarDemo = () => { const d = ler(); if (d) demo = d; };
  const blobParaDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });

  return {
    online,

    /* ---- conta ---- */
    async sessao() { if (!online) return { demo: true }; return ok(await sb.auth.getSession()).session; },
    aoMudarSessao(cb) { if (online) sb.auth.onAuthStateChange((_e, s) => cb(s)); },
    async entrar(email, senha) { ok(await sb.auth.signInWithPassword({ email, password: senha })); },
    async cadastrar(email, senha) { return ok(await sb.auth.signUp({ email, password: senha })).session; },
    async recuperarSenha(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
    async sair() { if (online) await sb.auth.signOut(); },
    reiniciarDemo() { demo = exemplo(); salvarDemo(); },

    /* ---- leitura ---- */
    async carregar() {
      if (!online) { recarregarDemo(); return copia({ neg: demo.neg, pedidos: demo.pedidos, bloqueios: demo.bloqueios, clientes: demo.clientes, produtos: demo.produtos }); }
      const neg = deNeg(ok(await sb.from('negocios').select('*').maybeSingle()));
      if (!neg) return { neg: null, pedidos: [], bloqueios: [], clientes: [], produtos: [] };
      const [peds, bls, clis, prods] = await Promise.all([
        sb.from('pedidos').select(SEL_PED).order('numero'),
        sb.from('bloqueios').select('data'),
        sb.from('clientes').select('*').order('nome'),
        sb.from('produtos').select('*').order('nome')
      ]);
      return { neg, pedidos: ok(peds).map(dePed), bloqueios: ok(bls).map(b => b.data), clientes: ok(clis).map(deCli), produtos: ok(prods).map(deProd) };
    },

    /* ---- negócio ---- */
    async criarNegocio(n) {
      const base = (n.slug || 'meu-negocio').slice(0, 32).replace(/-+$/, '') || 'meu-negocio';
      for (let i = 0; i < 5; i++) {
        const slug = i ? base + '-' + Math.floor(100 + Math.random() * 900) : (base.length < 3 ? base + '-doces' : base);
        const { data, error } = await sb.from('negocios').insert({ ...paraNeg(n), slug }).select().single();
        if (!error) return deNeg(data);
        if (!/duplicate key.*slug/i.test(error.message)) throw erro(error);
      }
      throw new Error('Não consegui criar o endereço da agenda. Tente outro nome.');
    },
    async salvarNegocio(n) {
      if (!online) { demo.neg = { ...demo.neg, ...n }; salvarDemo(); return copia(demo.neg); }
      return deNeg(ok(await sb.from('negocios').update(paraNeg(n)).eq('id', n.id).select().single()));
    },

    /* ---- clientes ---- */
    async salvarCliente(c) {
      if (!online) {
        if (c.whats && demo.clientes.some(x => x.whats === c.whats && x.id !== c.id)) throw new Error('Já existe um cliente com esse WhatsApp.');
        if (c.id) { const i = demo.clientes.findIndex(x => x.id === c.id); demo.clientes[i] = { ...demo.clientes[i], ...c }; salvarDemo(); return copia(demo.clientes[i]); }
        const novo = { ...c, id: uid(), token: uid(), origem: 'app' }; demo.clientes.push(novo); salvarDemo(); return copia(novo);
      }
      const q = c.id ? sb.from('clientes').update(paraCli(c)).eq('id', c.id) : sb.from('clientes').insert(paraCli(c));
      return deCli(ok(await q.select().single()));
    },

    /* ---- produtos ---- */
    async salvarProduto(p) {
      if (!online) {
        if (p.id) { const i = demo.produtos.findIndex(x => x.id === p.id); demo.produtos[i] = { ...demo.produtos[i], ...p }; salvarDemo(); return copia(demo.produtos[i]); }
        const novo = { ativo: true, cardapio: true, foto: '', ...p, id: uid() }; demo.produtos.push(novo); salvarDemo(); return copia(novo);
      }
      const q = p.id ? sb.from('produtos').update(paraProd(p)).eq('id', p.id) : sb.from('produtos').insert(paraProd(p));
      return deProd(ok(await q.select().single()));
    },
    async enviarFoto(negId, blob) {
      if (!online) return blobParaDataURL(blob);
      const caminho = `${negId}/${uid()}.jpg`;
      ok(await sb.storage.from('produtos').upload(caminho, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }));
      return sb.storage.from('produtos').getPublicUrl(caminho).data.publicUrl;
    },

    /* ---- pedidos ---- */
    async salvarPedido(id, p, itens) {
      if (!online) {
        if (id) { const i = demo.pedidos.findIndex(x => x.id === id); demo.pedidos[i] = { ...demo.pedidos[i], ...p, itens: itens.map(x => ({ ...x, id: x.id || uid() })) }; salvarDemo(); return copia(demo.pedidos[i]); }
        const novo = { ...p, id: uid(), no: ++demo.seq, criado: dia(), pagamentos: [], itens: itens.map(x => ({ ...x, id: uid() })) };
        demo.pedidos.push(novo); salvarDemo(); return copia(novo);
      }
      let pedId = id;
      if (id) ok(await sb.from('pedidos').update(paraPed(p)).eq('id', id));
      else pedId = ok(await sb.from('pedidos').insert(paraPed(p)).select('id').single()).id;
      if (id) ok(await sb.from('pedido_itens').delete().eq('pedido_id', id));
      if (itens.length) ok(await sb.from('pedido_itens').insert(paraItens(pedId, itens)));
      return dePed(ok(await sb.from('pedidos').select(SEL_PED).eq('id', pedId).single()));
    },
    async atualizarPedido(id, campos) {
      if (!online) { const p = demo.pedidos.find(x => x.id === id); Object.assign(p, campos); salvarDemo(); return; }
      const linha = {}; for (const k in campos) if (CAMPOS[k]) linha[CAMPOS[k]] = campos[k] === '' ? null : campos[k];
      ok(await sb.from('pedidos').update(linha).eq('id', id));
    },
    async registrarPagamento(pedidoId, pg) {
      if (!online) { const p = demo.pedidos.find(x => x.id === pedidoId); const n = { id: uid(), ...pg }; p.pagamentos.push(n); salvarDemo(); return n; }
      const r = ok(await sb.from('pagamentos').insert({ pedido_id: pedidoId, valor: pg.v, pago_em: pg.d, forma: pg.f }).select().single());
      return { id: r.id, v: Number(r.valor), d: r.pago_em, f: r.forma };
    },

    /* ---- agenda ---- */
    async bloquear(data, sim) {
      if (!online) { demo.bloqueios = sim ? [...new Set([...demo.bloqueios, data])] : demo.bloqueios.filter(x => x !== data); salvarDemo(); return; }
      if (sim) ok(await sb.from('bloqueios').insert({ data }));
      else ok(await sb.from('bloqueios').delete().eq('data', data));
    },

    /* ---- páginas públicas ---- */
    async agendaPublica(slug, dias = 30) {
      if (!online) {
        recarregarDemo();
        const t = dia(), out = [];
        for (let i = 0; i < dias; i++) { const d = mais(t, i); const n = demo.pedidos.filter(p => p.status !== 'cancelado' && p.data === d).length; out.push({ dia: d, livre: !demo.bloqueios.includes(d) && n < demo.neg.limite }); }
        return { neg: { nome: demo.neg.nome, whatsapp: demo.neg.whats, segmento: demo.neg.seg }, dias: out };
      }
      const negs = ok(await sb.rpc('negocio_publico', { p_slug: slug }));
      if (!negs || !negs.length) return { neg: null, dias: [] };
      return { neg: negs[0], dias: ok(await sb.rpc('agenda_publica', { p_slug: slug, p_dias: dias })) };
    },
    async cardapio(slug) {
      if (!online) { recarregarDemo(); return demo.produtos.filter(p => p.ativo && p.cardapio).map(p => ({ id: p.id, nome: p.nome, grupo: p.grupo, subgrupo: p.subgrupo, unidade: p.un, preco: p.preco, foto_url: p.foto })); }
      try { return (ok(await sb.rpc('cardapio_publico', { p_slug: slug })) || []).map(p => ({ ...p, preco: Number(p.preco) })); }
      catch (e) { return []; } // v2 ainda não instalada: agenda funciona sem cardápio
    },
    async solicitar(slug, d) {
      if (!online) {
        recarregarDemo();
        const tel = String(d.whatsapp).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
        if (tel.length < 10 || tel.length > 11) throw new Error('Informe seu WhatsApp com DDD');
        if (!d.nome.trim()) throw new Error('Informe seu nome');
        if (!d.data) throw new Error('Escolha uma data válida');
        let c = demo.clientes.find(x => x.whats === tel), novo = false;
        if (!c) { c = { id: uid(), nome: d.nome.trim(), sobrenome: (d.sobrenome || '').trim(), whats: tel, endereco: (d.endereco || '').trim(), obs: '', token: uid(), origem: 'agenda' }; demo.clientes.push(c); novo = true; }
        else if ((d.endereco || '').trim()) c.endereco = d.endereco.trim();
        const itens = d.itens.map(it => { const p = demo.produtos.find(x => x.id === it.produto_id); return { id: uid(), produtoId: p.id, desc: p.nome, un: p.un, qtd: it.quantidade, precoTab: p.preco, preco: p.preco }; });
        const valor = r2(itens.reduce((a, i) => a + r2(i.qtd * i.preco), 0));
        const ped = { id: uid(), no: ++demo.seq, clienteId: c.id, cliente: (d.nome + ' ' + (d.sobrenome || '')).trim(), tel, desc: itens.map(i => i.qtd + ' ' + i.desc).join(', '),
          valor, sinal: 0, ajuste: 0, data: d.data, venc: d.data, status: 'solicitado', obs: d.obs || '', repetir: '', origem: 'agenda', criado: dia(), pagamentos: [], itens };
        demo.pedidos.push(ped); salvarDemo();
        return { numero: ped.no, total: valor, token: (novo || d.token === c.token) ? c.token : null };
      }
      return ok(await sb.rpc('solicitar_pedido', {
        p_slug: slug, p_nome: d.nome, p_sobrenome: d.sobrenome || null, p_whatsapp: d.whatsapp, p_endereco: d.endereco || null,
        p_data: d.data, p_itens: d.itens, p_obs: d.obs || null, p_token: d.token || null
      }));
    },
    async meusPedidos(token) {
      if (!online) {
        recarregarDemo();
        const c = demo.clientes.find(x => x.token === token); if (!c) return null;
        return {
          cliente: { nome: c.nome, sobrenome: c.sobrenome, endereco: c.endereco, whatsapp: c.whats },
          negocio: { nome: demo.neg.nome, slug: demo.neg.slug, whatsapp: demo.neg.whats, pix: demo.neg.pix },
          pedidos: demo.pedidos.filter(p => p.clienteId === c.id).sort((a, b) => b.no - a.no).map(p => ({
            numero: p.no, data: p.data, status: p.status, valor: p.valor, sinal: p.sinal, vencimento: p.venc, descricao: p.desc,
            pago: p.pagamentos.reduce((a, x) => a + x.v, 0), itens: p.itens.map(i => ({ descricao: i.desc, quantidade: i.qtd, unidade: i.un, preco: i.preco }))
          }))
        };
      }
      return ok(await sb.rpc('meus_pedidos', { p_token: token }));
    }
  };
})();
