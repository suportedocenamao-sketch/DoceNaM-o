// Camada de dados: Supabase (online) ou localStorage (modo demo).
// As telas só falam com DB.*, então trocar de backend não mexe nelas.
const TEXTOS_ANTIGOS = [
  'Oi, {cliente}! Aqui é da {negocio}. Seu pedido #{numero} ({descricao}) está confirmado para {data}. Valor total {valor}. {linha_sinal}Pix: {pix}. Obrigada!',
  'Oi, {cliente}! Aqui é da {negocio}.\nPedido #{numero}: {itens}\nEntrega: {data} · Pagar até: {vencimento}\nTotal {valor} · Já pago {pago}\n{linha_sinal}Pix: {pix}\nAcompanhe seus pedidos: {link}'
];
const TEXTO_PADRAO = [
  'Olá, {cliente}! 🌷',
  'Passando com carinho para lembrar do seu pedido na {negocio} 💕',
  '🧾 Pedido #{numero}\n🍰 {itens}',
  '📅 Entrega: {data}\n⏳ Pagar até: {vencimento}',
  '💰 Total: {valor}\n✅ Já pago: {pago}\n{linha_sinal}',
  '🔑 Pix: {pix}',
  '📲 Acompanhe por aqui: {link}',
  'Obrigada pela confiança! 🥰'
].join('\n\n');

const DB = (() => {
  const cfg = window.DNM_CONFIG || {};
  const online = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const sb = online ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  const dia = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const mais = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return dia(d); };
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now() + Math.random().toString(16).slice(2));
  const copia = o => JSON.parse(JSON.stringify(o));
  const arred = v => Math.round(v * 100) / 100;
  const agoraISO = () => new Date().toISOString();
  const disp = () => (/Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'celular' : 'computador');

  /* ---------- conversões banco <-> app ---------- */
  const deNeg = r => r && ({ id: r.id, nome: r.nome, slug: r.slug, seg: r.segmento, pix: r.pix || '', whats: r.whatsapp || '', limite: r.limite_dia,
    texto: (!r.texto_cobranca || TEXTOS_ANTIGOS.includes(r.texto_cobranca)) ? TEXTO_PADRAO : r.texto_cobranca, config: configCompleta(r.config) });
  const paraNeg = n => ({ nome: n.nome, segmento: n.seg, pix: n.pix || null, whatsapp: n.whats || null, limite_dia: n.limite, texto_cobranca: n.texto, config: n.config || {} });
  const deCli = r => ({ id: r.id, nome: r.nome, sobrenome: r.sobrenome || '', whats: r.whatsapp || '', endereco: r.endereco || '', obs: r.obs || '', token: r.token, origem: r.origem || 'app' });
  const paraCli = c => ({ nome: c.nome, sobrenome: c.sobrenome || null, whatsapp: c.whats || null, endereco: c.endereco || null, obs: c.obs || null });
  const deCat = r => ({ id: r.id, nome: r.nome, paiId: r.pai_id || '' });
  const deProd = r => ({ id: r.id, nome: r.nome, grupoId: r.grupo_id || '', subgrupoId: r.subgrupo_id || '', grupo: r.grupo || '', subgrupo: r.subgrupo || '', un: r.unidade,
    preco: Number(r.preco), custo: Number(r.custo || 0), foto: r.foto_url || '', ativo: r.ativo !== false, cardapio: r.no_cardapio !== false });
  const paraProd = p => ({ nome: p.nome, grupo_id: p.grupoId || null, subgrupo_id: p.subgrupoId || null, unidade: p.un, preco: p.preco, custo: p.custo || 0,
    foto_url: p.foto || null, ativo: p.ativo !== false, no_cardapio: p.cardapio !== false });
  const deItem = i => ({ id: i.id, produtoId: i.produto_id, desc: i.descricao, un: i.unidade, qtd: Number(i.quantidade), precoTab: Number(i.preco_tabela), preco: Number(i.preco), custo: Number(i.custo || 0) });
  const dePed = r => ({
    id: r.id, no: r.numero, clienteId: r.cliente_id || '', cliente: r.cliente_nome, tel: r.cliente_tel || '', desc: r.descricao,
    valor: Number(r.valor), sinal: Number(r.sinal || 0), ajuste: Number(r.ajuste || 0), data: r.data_entrega || '', venc: r.vencimento || '',
    hora: r.hora_entrega ? String(r.hora_entrega).slice(0, 5) : '', entrega: r.entrega_tipo || 'retirada', regiao: r.entrega_regiao || '',
    taxaEnt: Number(r.taxa_entrega || 0), forma: r.forma_pagamento || '', taxaPag: Number(r.taxa_pagamento || 0), anexos: r.anexos || [],
    status: r.status, obs: r.obs || '', repetir: r.repetir || '', origem: r.origem || 'app', criado: (r.criado_em || '').slice(0, 10),
    pagamentos: (r.pagamentos || []).map(x => ({ id: x.id, v: Number(x.valor), d: x.pago_em, f: x.forma })).sort((a, b) => a.d.localeCompare(b.d)),
    itens: (r.pedido_itens || []).slice().sort((a, b) => a.ordem - b.ordem).map(deItem)
  });
  const paraPed = p => ({
    cliente_id: p.clienteId || null, cliente_nome: p.cliente, cliente_tel: p.tel || null, descricao: p.desc, valor: p.valor, sinal: p.sinal || 0,
    ajuste: p.ajuste || 0, data_entrega: p.data || null, vencimento: p.venc || null, hora_entrega: p.hora || null,
    entrega_tipo: p.entrega || 'retirada', entrega_regiao: p.regiao || null, taxa_entrega: p.taxaEnt || 0,
    forma_pagamento: p.forma || null, taxa_pagamento: p.taxaPag || 0, anexos: p.anexos || [],
    status: p.status, obs: p.obs || null, repetir: p.repetir || null, origem: p.origem || 'app'
  });
  const paraItens = (pedidoId, itens) => itens.map((i, k) => ({ pedido_id: pedidoId, produto_id: i.produtoId || null, descricao: i.desc, unidade: i.un, quantidade: i.qtd, preco_tabela: i.precoTab, preco: i.preco, custo: i.custo || 0, ordem: k }));
  const CAMPOS = { cliente: 'cliente_nome', tel: 'cliente_tel', desc: 'descricao', valor: 'valor', sinal: 'sinal', data: 'data_entrega', venc: 'vencimento', status: 'status', obs: 'obs', repetir: 'repetir', ajuste: 'ajuste', hora: 'hora_entrega' };
  const SEL_PED = '*, pagamentos(*), pedido_itens(*)';
  const deCham = r => ({ id: r.id, numero: r.numero, negocioId: r.negocio_id, negocio: r.negocios ? r.negocios.nome : '', assunto: r.assunto, categoria: r.categoria, prioridade: r.prioridade,
    status: r.status, naoLidoCliente: r.nao_lido_cliente, naoLidoSuporte: r.nao_lido_suporte, criado: r.criado_em, atualizado: r.atualizado_em });
  const deMsg = r => ({ id: r.id, autor: r.autor, texto: r.texto, anexo: r.anexo_url || '', criado: r.criado_em });

  const erro = e => {
    const m = (e && e.message) || String(e);
    if (/Invalid login/i.test(m)) return new Error('E-mail ou senha incorretos.');
    if (/already registered|already been registered/i.test(m)) return new Error('Esse e-mail já tem conta. Use "Entrar".');
    if (/Password should be/i.test(m)) return new Error('A senha precisa ter pelo menos 6 caracteres.');
    if (/Email not confirmed/i.test(m)) return new Error('Confirme seu e-mail pelo link que enviamos e tente de novo.');
    if (/Email logins are disabled/i.test(m)) return new Error('Login por e-mail desligado no Supabase (Authentication > Sign In / Providers > Email).');
    if (/clientes_negocio_whats/i.test(m)) return new Error('Já existe um cliente com esse WhatsApp.');
    if (/categorias_unica/i.test(m)) return new Error('Já existe um grupo/subgrupo com esse nome.');
    if (/column .* does not exist|Could not find the .* column|relation .* does not exist|Could not find the table|Could not find the function/i.test(m)) return new Error('O banco está desatualizado: rode os arquivos SQL da pasta supabase (v2 e v3) no Supabase.');
    if (/payload too large|exceeded the maximum allowed size/i.test(m)) return new Error('Imagem muito grande. Tente outra foto.');
    if (/Failed to fetch|NetworkError/i.test(m)) return new Error('Sem internet. Tente de novo em instantes.');
    return new Error(m);
  };
  const ok = ({ data, error }) => { if (error) throw erro(error); return data; };
  let meuId = null;

  /* ---------- modo demo (localStorage) ---------- */
  const KEY = 'doce-na-mao-demo-v3';
  const ler = () => { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) {} return null; };
  const salvarDemo = () => { try { localStorage.setItem(KEY, JSON.stringify(demo)); } catch (e) { console.warn('Armazenamento cheio', e); } };
  function exemplo() {
    const t = dia();
    const cats = [];
    const cat = (nome, pai) => { const c = { id: uid(), nome, paiId: pai ? pai.id : '' }; cats.push(c); return c; };
    const gB = cat('Bolos'), gD = cat('Docinhos'), gP = cat('Potes'), gA = cat('Assados');
    const sT = cat('Tradicionais', gB), sF = cat('Festa', gB), sDT = cat('Tradicionais', gD), sDG = cat('Gourmet', gD);
    const P = (nome, g, s, un, preco, custo) => ({ id: uid(), nome, grupoId: g.id, subgrupoId: s ? s.id : '', grupo: g.nome, subgrupo: s ? s.nome : '', un, preco, custo, foto: '', ativo: true, cardapio: true });
    const produtos = [
      P('Bolo de chocolate', gB, sT, 'kg', 85, 32), P('Bolo de cenoura com chocolate', gB, sT, 'kg', 75, 26),
      P('Bolo de festa', gB, sF, 'kg', 110, 45), P('Brigadeiro tradicional', gD, sDT, 'cento', 120, 42),
      P('Brigadeiro gourmet', gD, sDG, 'cento', 160, 65), P('Bolo de pote', gP, null, 'un', 12, 4.5), P('Brownie', gA, null, 'un', 8, 2.8)
    ];
    const C = (nome, sobrenome, whats, endereco) => ({ id: uid(), nome, sobrenome, whats, endereco, obs: '', token: uid(), origem: 'app' });
    const clientes = [C('Ana', 'Souza', '61999990002', 'Quadra 3, casa 10'), C('Rafael', 'Lima', '61999990003', ''), C('Carla', 'Menezes', '61999990001', 'Rua das Flores, 45'),
      C('Júlia', 'Prado', '61999990004', 'SQS 308 bloco C'), C('Patrícia', 'Gomes', '61999990006', ''), C('Bruno', 'Alves', '61999990007', '')];
    let seq = 0;
    const I = (prod, qtd, preco) => ({ id: uid(), produtoId: prod.id, desc: prod.nome, un: prod.un, qtd, precoTab: prod.preco, preco: preco ?? prod.preco, custo: prod.custo });
    const Ped = (cli, itens, o) => {
      const prod = arred(itens.reduce((a, i) => a + arred(i.qtd * i.preco), 0) + (o.ajuste || 0));
      const taxaPag = arred((prod + (o.taxaEnt || 0)) * (o.pct || 0) / 100);
      return { id: uid(), no: ++seq, clienteId: cli.id, cliente: cli.nome + ' ' + cli.sobrenome, tel: cli.whats, desc: itens.map(i => i.qtd + ' ' + i.desc).join(', '),
        valor: arred(prod + (o.taxaEnt || 0) + taxaPag), sinal: o.sinal || 0, ajuste: o.ajuste || 0, data: o.data, venc: o.venc || o.data, hora: o.hora || '',
        entrega: o.taxaEnt != null ? 'entrega' : 'retirada', regiao: o.regiao || '', taxaEnt: o.taxaEnt || 0, forma: o.forma || 'Pix', taxaPag, anexos: [],
        status: o.status, obs: o.obs || '', repetir: '', origem: o.origem || 'app', criado: mais(t, -3), pagamentos: o.pags || [], itens };
    };
    const [bc, bce, bf, bt, bg, bp, br] = produtos, [ana, raf, car, jul, pat, bru] = clientes;
    const pedidos = [
      Ped(raf, [I(bf, 3)], { ajuste: -20, data: mais(t, -14), status: 'entregue', sinal: 160, pags: [{ id: uid(), v: 310, d: mais(t, -14), f: 'Pix' }] }),
      Ped(pat, [I(br, 50, 7)], { data: mais(t, -3), status: 'entregue', sinal: 175, pags: [{ id: uid(), v: 100, d: mais(t, -9), f: 'Pix' }] }),
      Ped(car, [I(bce, 1.5)], { data: t, venc: t, hora: '10:00', status: 'pronto', sinal: 56.25, pags: [{ id: uid(), v: 56.25, d: mais(t, -5), f: 'Pix' }] }),
      Ped(jul, [I(bp, 6)], { data: t, hora: '10:00', status: 'producao', taxaEnt: 12, regiao: 'Asa Sul', sinal: 0, pags: [{ id: uid(), v: 84, d: mais(t, -1), f: 'Pix' }] }),
      Ped(ana, [I(bc, 2), I(bp, 6)], { data: t, hora: '15:00', status: 'confirmado', forma: 'Cartão de crédito', pct: 4.99, sinal: 0 }),
      Ped(ana, [I(bc, 2), I(bp, 6)], { data: mais(t, 2), hora: '14:00', status: 'aguardando', sinal: 121 }),
      Ped(raf, [I(bt, 1)], { ajuste: 10, data: mais(t, 2), hora: '16:00', status: 'confirmado', sinal: 65, pags: [{ id: uid(), v: 65, d: mais(t, -2), f: 'Pix' }] }),
      Ped(bru, [I(bt, 0.5), I(br, 10)], { data: mais(t, 6), hora: '11:00', status: 'solicitado', origem: 'agenda', obs: 'Topper com o nome Léo, tema dinossauro' })
    ];
    const negId = 'demo';
    const acessos = [];
    const ev = (tipo, horas, d) => acessos.push({ id: uid(), negocioId: negId, negocio: 'Doces da Lu', tipo, detalhe: d || '', dispositivo: horas % 2 ? 'celular' : 'computador', criado: new Date(Date.now() - horas * 3600e3).toISOString() });
    [1, 3, 5, 26, 30, 50, 72].forEach(h => ev('app_aberto', h)); [2, 4, 8, 12, 20, 40, 60, 90].forEach(h => ev('agenda_vista', h)); ev('meus_pedidos_visto', 6); ev('pedido_agenda', 9, '#8');
    const chamados = [{ id: uid(), numero: 1, negocioId: negId, negocio: 'Doces da Lu', assunto: 'Como coloco a taxa do cartão?', categoria: 'duvida', prioridade: 'normal', status: 'em_andamento',
      naoLidoCliente: true, naoLidoSuporte: false, criado: new Date(Date.now() - 30 * 3600e3).toISOString(), atualizado: new Date(Date.now() - 2 * 3600e3).toISOString(),
      mensagens: [{ id: uid(), autor: 'cliente', texto: 'Quero cobrar a taxa da maquininha no crédito. Onde configuro?', anexo: '', criado: new Date(Date.now() - 30 * 3600e3).toISOString() },
        { id: uid(), autor: 'suporte', texto: 'Oi! É em Mais › Entrega, pagamento e horários. Lá você coloca o percentual de cada forma de pagamento 😊', anexo: '', criado: new Date(Date.now() - 2 * 3600e3).toISOString() }] }];
    return {
      neg: { id: negId, nome: 'Doces da Lu', slug: 'doces-da-lu', seg: 'doces', pix: 'lu.doces@email.com', whats: '61999990000', limite: 4, texto: TEXTO_PADRAO,
        config: configCompleta({ entrega: { retirada: true, endereco_retirada: 'Quadra 10, casa 5', entrega: true, taxa_padrao: 10, regioes: [{ nome: 'Asa Sul', valor: 12 }, { nome: 'Asa Norte', valor: 15 }, { nome: 'Guará', valor: 20 }] } }) },
      seq, bloqueios: [mais(t, 4)], pedidos, clientes, produtos, categorias: cats, acessos, chamados, chamadoSeq: 1
    };
  }
  let demo = online ? null : (ler() || exemplo());
  const recarregarDemo = () => { const d = ler(); if (d) demo = d; };
  const blobParaDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  const demoEvento = (tipo, detalhe) => { demo.acessos.unshift({ id: uid(), negocioId: demo.neg.id, negocio: demo.neg.nome, tipo, detalhe: detalhe || '', dispositivo: disp(), criado: agoraISO() }); demo.acessos = demo.acessos.slice(0, 300); salvarDemo(); };

  return {
    online,
    disp,

    /* ---- conta ---- */
    async sessao() { if (!online) return { demo: true }; const s = ok(await sb.auth.getSession()).session; meuId = s ? s.user.id : null; return s; },
    aoMudarSessao(cb) { if (online) sb.auth.onAuthStateChange((_e, s) => { meuId = s ? s.user.id : null; cb(s); }); },
    async entrar(email, senha) { const d = ok(await sb.auth.signInWithPassword({ email, password: senha })); meuId = d.user.id; },
    async cadastrar(email, senha) { const d = ok(await sb.auth.signUp({ email, password: senha })); if (d.user) meuId = d.user.id; return d.session; },
    async recuperarSenha(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
    async sair() { if (online) await sb.auth.signOut(); },
    reiniciarDemo() { demo = exemplo(); salvarDemo(); },

    /* ---- leitura ---- */
    async carregar() {
      if (!online) { recarregarDemo(); return copia({ neg: demo.neg, pedidos: demo.pedidos, bloqueios: demo.bloqueios, clientes: demo.clientes, produtos: demo.produtos, categorias: demo.categorias, chamadosNaoLidos: demo.chamados.filter(c => c.naoLidoCliente).length }); }
      const neg = deNeg(ok(await sb.from('negocios').select('*').eq('dono', meuId).maybeSingle()));
      if (!neg) return { neg: null, pedidos: [], bloqueios: [], clientes: [], produtos: [], categorias: [], chamadosNaoLidos: 0 };
      const [peds, bls, clis, prods, cats, chs] = await Promise.all([
        sb.from('pedidos').select(SEL_PED).order('numero'),
        sb.from('bloqueios').select('data'),
        sb.from('clientes').select('*').order('nome'),
        sb.from('produtos').select('*').order('nome'),
        sb.from('categorias').select('*').order('nome'),
        sb.from('chamados').select('id', { count: 'exact', head: true }).eq('negocio_id', neg.id).eq('nao_lido_cliente', true)
      ]);
      return { neg, pedidos: ok(peds).map(dePed), bloqueios: ok(bls).map(b => b.data), clientes: ok(clis).map(deCli), produtos: ok(prods).map(deProd),
        categorias: ok(cats).map(deCat), chamadosNaoLidos: chs.error ? 0 : (chs.count || 0) };
    },
    async evento(tipo, detalhe) {
      try {
        if (!online) return demoEvento(tipo, detalhe);
        const n = ok(await sb.from('negocios').select('id').eq('dono', meuId).maybeSingle()); if (!n) return;
        await sb.from('acessos').insert({ negocio_id: n.id, tipo, detalhe: detalhe || null, dispositivo: disp() });
      } catch (e) {}
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

    /* ---- grupos e subgrupos ---- */
    async salvarCategoria(c) {
      if (!online) {
        const dup = demo.categorias.some(x => x.id !== c.id && (x.paiId || '') === (c.paiId || '') && x.nome.toLowerCase() === c.nome.toLowerCase());
        if (dup) throw new Error('Já existe um grupo/subgrupo com esse nome.');
        if (c.id) {
          const i = demo.categorias.findIndex(x => x.id === c.id); demo.categorias[i] = { ...demo.categorias[i], nome: c.nome };
          demo.produtos.forEach(p => { if (p.grupoId === c.id) p.grupo = c.nome; if (p.subgrupoId === c.id) p.subgrupo = c.nome; });
          salvarDemo(); return copia(demo.categorias[i]);
        }
        const nova = { id: uid(), nome: c.nome, paiId: c.paiId || '' }; demo.categorias.push(nova); salvarDemo(); return copia(nova);
      }
      const q = c.id ? sb.from('categorias').update({ nome: c.nome }).eq('id', c.id) : sb.from('categorias').insert({ nome: c.nome, pai_id: c.paiId || null });
      return deCat(ok(await q.select().single()));
    },
    async removerCategoria(id) {
      if (!online) { const filhos = demo.categorias.filter(x => x.paiId === id).map(x => x.id); demo.categorias = demo.categorias.filter(x => x.id !== id && !filhos.includes(x.id)); salvarDemo(); return; }
      ok(await sb.from('categorias').delete().eq('id', id));
    },

    /* ---- produtos ---- */
    async salvarProduto(p) {
      if (!online) {
        const nomeCat = id => (demo.categorias.find(c => c.id === id) || {}).nome || '';
        const comNomes = { ...p, grupo: nomeCat(p.grupoId), subgrupo: nomeCat(p.subgrupoId) };
        if (p.id) { const i = demo.produtos.findIndex(x => x.id === p.id); demo.produtos[i] = { ...demo.produtos[i], ...comNomes }; salvarDemo(); return copia(demo.produtos[i]); }
        const novo = { ativo: true, cardapio: true, foto: '', custo: 0, ...comNomes, id: uid() }; demo.produtos.push(novo); salvarDemo(); return copia(novo);
      }
      const q = p.id ? sb.from('produtos').update(paraProd(p)).eq('id', p.id) : sb.from('produtos').insert(paraProd(p));
      return deProd(ok(await q.select().single()));
    },

    /* ---- arquivos (fotos de produto, inspirações, prints do suporte) ---- */
    async enviarArquivo(bucket, pasta, blob) {
      if (!online) return blobParaDataURL(blob);
      const caminho = `${pasta}/${uid()}.jpg`;
      ok(await sb.storage.from(bucket).upload(caminho, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }));
      return sb.storage.from(bucket).getPublicUrl(caminho).data.publicUrl;
    },
    async enviarFoto(negId, blob) { return this.enviarArquivo('produtos', negId, blob); },

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
    async estornarPagamento(pedidoId, pagamentoId) {
      if (!online) { const p = demo.pedidos.find(x => x.id === pedidoId); p.pagamentos = p.pagamentos.filter(x => x.id !== pagamentoId); salvarDemo(); return; }
      ok(await sb.from('pagamentos').delete().eq('id', pagamentoId));
    },

    /* ---- agenda ---- */
    async bloquear(data, sim) {
      if (!online) { demo.bloqueios = sim ? [...new Set([...demo.bloqueios, data])] : demo.bloqueios.filter(x => x !== data); salvarDemo(); return; }
      if (sim) ok(await sb.from('bloqueios').insert({ data }));
      else ok(await sb.from('bloqueios').delete().eq('data', data));
    },

    /* ---- suporte (chamados) ---- */
    async chamados(todos) {
      if (!online) { recarregarDemo(); return copia(demo.chamados).map(({ mensagens, ...c }) => c).sort((a, b) => b.atualizado.localeCompare(a.atualizado)); }
      let q = sb.from('chamados').select('*, negocios(nome)').order('atualizado_em', { ascending: false });
      if (!todos) { const n = ok(await sb.from('negocios').select('id').eq('dono', meuId).maybeSingle()); if (!n) return []; q = q.eq('negocio_id', n.id); }
      return ok(await q).map(deCham);
    },
    async abrirChamado(c) {
      if (!online) {
        const novo = { id: uid(), numero: ++demo.chamadoSeq, negocioId: demo.neg.id, negocio: demo.neg.nome, assunto: c.assunto, categoria: c.categoria, prioridade: 'normal', status: 'aberto',
          naoLidoCliente: false, naoLidoSuporte: true, criado: agoraISO(), atualizado: agoraISO(), mensagens: [{ id: uid(), autor: 'cliente', texto: c.texto, anexo: c.anexo || '', criado: agoraISO() }] };
        demo.chamados.unshift(novo); salvarDemo(); const { mensagens, ...r } = novo; return copia(r);
      }
      const ch = ok(await sb.from('chamados').insert({ assunto: c.assunto, categoria: c.categoria }).select('*, negocios(nome)').single());
      ok(await sb.from('chamado_mensagens').insert({ chamado_id: ch.id, autor: 'cliente', texto: c.texto, anexo_url: c.anexo || null }));
      return deCham(ch);
    },
    async mensagens(chamadoId) {
      if (!online) { recarregarDemo(); return copia((demo.chamados.find(c => c.id === chamadoId) || { mensagens: [] }).mensagens); }
      return ok(await sb.from('chamado_mensagens').select('*').eq('chamado_id', chamadoId).order('criado_em')).map(deMsg);
    },
    async responder(chamadoId, autor, texto, anexo) {
      if (!online) {
        const c = demo.chamados.find(x => x.id === chamadoId);
        c.mensagens.push({ id: uid(), autor, texto, anexo: anexo || '', criado: agoraISO() });
        c.atualizado = agoraISO(); c.naoLidoCliente = autor === 'suporte'; c.naoLidoSuporte = autor === 'cliente';
        if (autor === 'cliente' && ['aguardando', 'resolvido'].includes(c.status)) c.status = 'aberto';
        if (autor === 'suporte' && c.status === 'aberto') c.status = 'em_andamento';
        salvarDemo(); return;
      }
      ok(await sb.from('chamado_mensagens').insert({ chamado_id: chamadoId, autor, texto, anexo_url: anexo || null }));
    },
    async atualizarChamado(id, campos) {
      const mapa = { status: 'status', prioridade: 'prioridade', naoLidoCliente: 'nao_lido_cliente', naoLidoSuporte: 'nao_lido_suporte' };
      if (!online) { const c = demo.chamados.find(x => x.id === id); Object.assign(c, campos); salvarDemo(); return; }
      const linha = {}; for (const k in campos) if (mapa[k]) linha[mapa[k]] = campos[k];
      ok(await sb.from('chamados').update(linha).eq('id', id));
    },

    /* ---- administrador ---- */
    async souAdmin() { if (!online) return true; return !!ok(await sb.rpc('sou_admin')); },
    async adminNegocios() {
      if (!online) {
        recarregarDemo();
        const n = demo.neg, a = demo.acessos, d7 = Date.now() - 7 * 864e5, d30 = Date.now() - 30 * 864e5, t = x => new Date(x.criado).getTime();
        const app = a.filter(x => ['login', 'app_aberto'].includes(x.tipo)), link = a.filter(x => ['agenda_vista', 'meus_pedidos_visto'].includes(x.tipo));
        return [{ id: n.id, nome: n.nome, slug: n.slug, email: 'lu@exemplo.com', criado_em: new Date(Date.now() - 40 * 864e5).toISOString(), ultimo_acesso: app[0] ? app[0].criado : null,
          acessos_7d: app.filter(x => t(x) > d7).length, visitas_link_7d: link.filter(x => t(x) > d7).length, visitas_link_30d: link.filter(x => t(x) > d30).length,
          pedidos_30d: demo.pedidos.length, pedidos_agenda_30d: demo.pedidos.filter(p => p.origem === 'agenda').length, clientes: demo.clientes.length,
          produtos: demo.produtos.filter(p => p.ativo).length, chamados_abertos: demo.chamados.filter(c => c.status !== 'resolvido').length },
        { id: 'demo2', nome: 'Marmitas da Rô', slug: 'marmitas-da-ro', email: 'ro@exemplo.com', criado_em: new Date(Date.now() - 12 * 864e5).toISOString(), ultimo_acesso: new Date(Date.now() - 9 * 864e5).toISOString(),
          acessos_7d: 0, visitas_link_7d: 2, visitas_link_30d: 11, pedidos_30d: 6, pedidos_agenda_30d: 1, clientes: 5, produtos: 4, chamados_abertos: 0 }];
      }
      return ok(await sb.rpc('admin_negocios'));
    },
    async adminAcessos(f = {}) {
      if (!online) { recarregarDemo(); return copia(demo.acessos.filter(x => (!f.tipo || x.tipo === f.tipo) && (!f.negocioId || x.negocioId === f.negocioId)).slice(0, f.limite || 100)); }
      let q = sb.from('acessos').select('*, negocios(nome)').order('criado_em', { ascending: false }).limit(f.limite || 100);
      if (f.tipo) q = q.eq('tipo', f.tipo);
      if (f.negocioId) q = q.eq('negocio_id', f.negocioId);
      return ok(await q).map(r => ({ id: r.id, negocioId: r.negocio_id, negocio: r.negocios ? r.negocios.nome : '', tipo: r.tipo, detalhe: r.detalhe || '', dispositivo: r.dispositivo || '', criado: r.criado_em }));
    },

    /* ---- páginas públicas ---- */
    async agendaPublica(slug, dias = 30) {
      if (!online) {
        recarregarDemo();
        const t = dia(), out = [];
        for (let i = 0; i < dias; i++) { const d = mais(t, i); const n = demo.pedidos.filter(p => p.status !== 'cancelado' && p.data === d).length; out.push({ dia: d, livre: !demo.bloqueios.includes(d) && n < demo.neg.limite }); }
        return { neg: { id: demo.neg.id, nome: demo.neg.nome, whatsapp: demo.neg.whats, segmento: demo.neg.seg, config: configCompleta(demo.neg.config) }, dias: out };
      }
      const negs = ok(await sb.rpc('negocio_publico', { p_slug: slug }));
      if (!negs || !negs.length) return { neg: null, dias: [] };
      const neg = { ...negs[0], config: configCompleta(negs[0].config) };
      return { neg, dias: ok(await sb.rpc('agenda_publica', { p_slug: slug, p_dias: dias })) };
    },
    async cardapio(slug) {
      if (!online) { recarregarDemo(); return demo.produtos.filter(p => p.ativo && p.cardapio).map(p => ({ id: p.id, nome: p.nome, grupo: p.grupo, subgrupo: p.subgrupo, unidade: p.un, preco: p.preco, foto_url: p.foto })); }
      try { return (ok(await sb.rpc('cardapio_publico', { p_slug: slug })) || []).map(p => ({ ...p, preco: Number(p.preco) })); }
      catch (e) { return []; }
    },
    async visita(slug, tipo, detalhe) {
      try {
        if (!online) { recarregarDemo(); demo.acessos.unshift({ id: uid(), negocioId: demo.neg.id, negocio: demo.neg.nome, tipo, detalhe: detalhe || '', dispositivo: disp(), criado: agoraISO() }); salvarDemo(); return; }
        await sb.rpc('registrar_visita', { p_slug: slug, p_tipo: tipo, p_dispositivo: disp(), p_detalhe: detalhe || null });
      } catch (e) {}
    },
    async solicitar(slug, d) {
      if (!online) {
        recarregarDemo();
        const tel = String(d.whatsapp).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
        if (tel.length < 10 || tel.length > 11) throw new Error('Informe seu WhatsApp com DDD');
        if (!d.nome.trim()) throw new Error('Informe seu nome');
        if (!d.data) throw new Error('Escolha uma data válida');
        if (d.entrega === 'entrega' && !(d.endereco || '').trim()) throw new Error('Informe o endereço de entrega');
        let c = demo.clientes.find(x => x.whats === tel), novo = false;
        if (!c) { c = { id: uid(), nome: d.nome.trim(), sobrenome: (d.sobrenome || '').trim(), whats: tel, endereco: (d.endereco || '').trim(), obs: '', token: uid(), origem: 'agenda' }; demo.clientes.push(c); novo = true; }
        else if ((d.endereco || '').trim()) c.endereco = d.endereco.trim();
        const itens = d.itens.map(it => { const p = demo.produtos.find(x => x.id === it.produto_id); return { id: uid(), produtoId: p.id, desc: p.nome, un: p.un, qtd: it.quantidade, precoTab: p.preco, preco: p.preco, custo: p.custo || 0 }; });
        const produtos = arred(itens.reduce((a, i) => a + arred(i.qtd * i.preco), 0));
        const tx = calcTaxas(produtos, configCompleta(demo.neg.config), d.entrega, d.regiao, d.pagamento);
        const ped = { id: uid(), no: ++demo.seq, clienteId: c.id, cliente: (d.nome + ' ' + (d.sobrenome || '')).trim(), tel, desc: itens.map(i => i.qtd + ' ' + i.desc).join(', '),
          valor: tx.total, sinal: 0, ajuste: 0, data: d.data, venc: d.data, hora: d.hora || '', entrega: d.entrega || 'retirada', regiao: d.regiao || '', taxaEnt: tx.taxaEnt,
          forma: d.pagamento || '', taxaPag: tx.taxaPag, anexos: (d.anexos || []).slice(0, 6), status: 'solicitado', obs: d.obs || '', repetir: '', origem: 'agenda', criado: dia(), pagamentos: [], itens };
        demo.pedidos.push(ped); demoEvento('pedido_agenda', '#' + ped.no);
        return { numero: ped.no, total: tx.total, produtos, taxa_entrega: tx.taxaEnt, taxa_pagamento: tx.taxaPag, token: (novo || d.token === c.token) ? c.token : null };
      }
      return ok(await sb.rpc('solicitar_pedido_v3', { p_slug: slug, p_dados: d }));
    },
    async meusPedidos(token) {
      if (!online) {
        recarregarDemo();
        const c = demo.clientes.find(x => x.token === token); if (!c) return null;
        return {
          cliente: { nome: c.nome, sobrenome: c.sobrenome, endereco: c.endereco, whatsapp: c.whats },
          negocio: { nome: demo.neg.nome, slug: demo.neg.slug, whatsapp: demo.neg.whats, pix: demo.neg.pix },
          pedidos: demo.pedidos.filter(p => p.clienteId === c.id).sort((a, b) => b.no - a.no).map(p => ({
            numero: p.no, data: p.data, hora: p.hora, status: p.status, valor: p.valor, sinal: p.sinal, vencimento: p.venc, descricao: p.desc,
            entrega_tipo: p.entrega, entrega_regiao: p.regiao, taxa_entrega: p.taxaEnt, forma_pagamento: p.forma, taxa_pagamento: p.taxaPag, anexos: p.anexos,
            pago: p.pagamentos.reduce((a, x) => a + x.v, 0), itens: p.itens.map(i => ({ descricao: i.desc, quantidade: i.qtd, unidade: i.un, preco: i.preco }))
          }))
        };
      }
      return ok(await sb.rpc('meus_pedidos', { p_token: token }));
    }
  };
})();
