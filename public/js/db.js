// Camada de dados: Supabase (online) ou localStorage (modo demo).
// O app só fala com DB.*, então trocar de backend não mexe nas telas.
const TEXTO_PADRAO = 'Oi, {cliente}! Aqui é da {negocio}. Seu pedido #{numero} ({descricao}) está confirmado para {data}. Valor total {valor}. {linha_sinal}Pix: {pix}. Obrigada!';

const DB = (() => {
  const cfg = window.DNM_CONFIG || {};
  const online = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const sb = online ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  const dia = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const mais = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return dia(d); };

  /* ---------- conversões banco <-> app ---------- */
  const deNeg = r => r && ({ id: r.id, nome: r.nome, slug: r.slug, seg: r.segmento, pix: r.pix || '', whats: r.whatsapp || '', limite: r.limite_dia, texto: r.texto_cobranca || TEXTO_PADRAO });
  const paraNeg = n => ({ nome: n.nome, segmento: n.seg, pix: n.pix || null, whatsapp: n.whats || null, limite_dia: n.limite, texto_cobranca: n.texto });
  const dePed = r => ({
    id: r.id, no: r.numero, cliente: r.cliente_nome, tel: r.cliente_tel || '', desc: r.descricao,
    valor: Number(r.valor), sinal: Number(r.sinal || 0), data: r.data_entrega || '', status: r.status,
    obs: r.obs || '', repetir: r.repetir || '', criado: (r.criado_em || '').slice(0, 10),
    pagamentos: (r.pagamentos || []).map(x => ({ id: x.id, v: Number(x.valor), d: x.pago_em, f: x.forma }))
      .sort((a, b) => a.d.localeCompare(b.d))
  });
  const paraPed = p => ({
    cliente_nome: p.cliente, cliente_tel: p.tel || null, descricao: p.desc, valor: p.valor, sinal: p.sinal || 0,
    data_entrega: p.data || null, status: p.status, obs: p.obs || null, repetir: p.repetir || null
  });
  const CAMPOS = { cliente: 'cliente_nome', tel: 'cliente_tel', desc: 'descricao', valor: 'valor', sinal: 'sinal', data: 'data_entrega', status: 'status', obs: 'obs', repetir: 'repetir' };

  const erro = e => {
    const m = (e && e.message) || String(e);
    if (/Invalid login/i.test(m)) return new Error('E-mail ou senha incorretos.');
    if (/already registered|already been registered/i.test(m)) return new Error('Esse e-mail já tem conta. Use "Entrar".');
    if (/Password should be/i.test(m)) return new Error('A senha precisa ter pelo menos 6 caracteres.');
    if (/Email not confirmed/i.test(m)) return new Error('Confirme seu e-mail pelo link que enviamos e tente de novo.');
    if (/Failed to fetch|NetworkError/i.test(m)) return new Error('Sem internet. Tente de novo em instantes.');
    return new Error(m);
  };
  const ok = ({ data, error }) => { if (error) throw erro(error); return data; };

  /* ---------- modo demo (localStorage) ---------- */
  const KEY = 'doce-na-mao-demo';
  const ler = () => { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) {} return null; };
  const gravar = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  function exemplo() {
    const t = dia(); let seq = 0;
    const p = (cli, tel, desc, valor, sinal, data, status, pags) => ({ id: 'd' + (++seq), no: seq, cliente: cli, tel, desc, valor, sinal, data, status, obs: '', repetir: '', criado: t, pagamentos: pags || [] });
    return {
      neg: { id: 'demo', nome: 'Doces da Lu', slug: 'doces-da-lu', seg: 'doces', pix: 'lu.doces@email.com', whats: '', limite: 3, texto: TEXTO_PADRAO },
      seq: 8, bloqueios: [mais(t, 4)],
      pedidos: [
        p('Rafael Lima', '61999990003', 'Bolo de aniversário 3 kg', 210, 105, mais(t, -14), 'entregue', [{ v: 210, d: mais(t, -14), f: 'Pix' }]),
        p('Marcos Teles', '61999990005', 'Torta de limão', 75, 0, mais(t, -6), 'entregue'),
        p('Patrícia Gomes', '61999990006', '50 brownies', 125, 60, mais(t, -3), 'entregue', [{ v: 60, d: mais(t, -9), f: 'Pix' }]),
        p('Carla Menezes', '61999990001', 'Bolo de cenoura com chocolate', 90, 45, t, 'producao', [{ v: 45, d: mais(t, -5), f: 'Pix' }]),
        p('Ana Souza', '61999990002', 'Bolo de chocolate 2 kg', 120, 60, mais(t, 2), 'aguardando'),
        p('Rafael Lima', '61999990003', '100 brigadinhos sortidos', 150, 75, mais(t, 2), 'confirmado', [{ v: 75, d: mais(t, -2), f: 'Pix' }]),
        p('Júlia Prado', '61999990004', 'Bolo de festa tema safári', 280, 140, mais(t, 2), 'confirmado', [{ v: 140, d: mais(t, -1), f: 'Pix' }]),
        p('Bruno Alves', '61999990007', 'Cento de docinhos', 110, 55, mais(t, 6), 'aguardando')
      ]
    };
  }
  let demo = online ? null : (ler() || exemplo());
  const salvarDemo = () => gravar(demo);

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
      if (!online) return JSON.parse(JSON.stringify({ neg: demo.neg, pedidos: demo.pedidos, bloqueios: demo.bloqueios }));
      const neg = deNeg(ok(await sb.from('negocios').select('*').maybeSingle()));
      if (!neg) return { neg: null, pedidos: [], bloqueios: [] };
      const peds = ok(await sb.from('pedidos').select('*, pagamentos(*)').order('numero'));
      const bls = ok(await sb.from('bloqueios').select('data'));
      return { neg, pedidos: peds.map(dePed), bloqueios: bls.map(b => b.data) };
    },

    /* ---- negócio ---- */
    async criarNegocio(n) {
      const base = (n.slug || 'meu-negocio').slice(0, 32);
      for (let i = 0; i < 5; i++) {
        const slug = i ? base + '-' + Math.floor(100 + Math.random() * 900) : base;
        const { data, error } = await sb.from('negocios').insert({ ...paraNeg(n), slug }).select().single();
        if (!error) return deNeg(data);
        if (!/duplicate key.*slug/i.test(error.message)) throw erro(error);
      }
      throw new Error('Não consegui criar o endereço da agenda. Tente outro nome.');
    },
    async salvarNegocio(n) {
      if (!online) { demo.neg = { ...demo.neg, ...n }; salvarDemo(); return demo.neg; }
      return deNeg(ok(await sb.from('negocios').update(paraNeg(n)).eq('id', n.id).select().single()));
    },

    /* ---- pedidos ---- */
    async criarPedido(p) {
      if (!online) {
        const novo = { ...p, id: 'd' + Date.now(), no: ++demo.seq, criado: dia(), pagamentos: [] };
        demo.pedidos.push(novo); salvarDemo(); return JSON.parse(JSON.stringify(novo));
      }
      return dePed(ok(await sb.from('pedidos').insert(paraPed(p)).select('*, pagamentos(*)').single()));
    },
    async atualizarPedido(id, campos) {
      if (!online) { const p = demo.pedidos.find(x => x.id === id); Object.assign(p, campos); salvarDemo(); return; }
      const linha = {}; for (const k in campos) if (CAMPOS[k]) linha[CAMPOS[k]] = campos[k] === '' ? null : campos[k];
      ok(await sb.from('pedidos').update(linha).eq('id', id));
    },
    async registrarPagamento(pedidoId, pg) {
      if (!online) { const p = demo.pedidos.find(x => x.id === pedidoId); const n = { id: 'g' + Date.now(), ...pg }; p.pagamentos.push(n); salvarDemo(); return n; }
      const r = ok(await sb.from('pagamentos').insert({ pedido_id: pedidoId, valor: pg.v, pago_em: pg.d, forma: pg.f }).select().single());
      return { id: r.id, v: Number(r.valor), d: r.pago_em, f: r.forma };
    },

    /* ---- agenda ---- */
    async bloquear(data, sim) {
      if (!online) { demo.bloqueios = sim ? [...new Set([...demo.bloqueios, data])] : demo.bloqueios.filter(x => x !== data); salvarDemo(); return; }
      if (sim) ok(await sb.from('bloqueios').insert({ data }));
      else ok(await sb.from('bloqueios').delete().eq('data', data));
    },

    /* ---- página pública ---- */
    async agendaPublica(slug, dias = 30) {
      if (!online) {
        const t = dia(), out = [];
        for (let i = 0; i < dias; i++) { const d = mais(t, i); const n = demo.pedidos.filter(p => p.status !== 'cancelado' && p.data === d).length; out.push({ dia: d, livre: !demo.bloqueios.includes(d) && n < demo.neg.limite }); }
        return { neg: { nome: demo.neg.nome, whatsapp: demo.neg.whats, segmento: demo.neg.seg }, dias: out };
      }
      const negs = ok(await sb.rpc('negocio_publico', { p_slug: slug }));
      if (!negs || !negs.length) return { neg: null, dias: [] };
      const dias_ = ok(await sb.rpc('agenda_publica', { p_slug: slug, p_dias: dias }));
      return { neg: negs[0], dias: dias_ };
    }
  };
})();
