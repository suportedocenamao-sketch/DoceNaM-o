/* Utilitários usados pelo app, pela agenda pública e por "Meus pedidos". */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); };
const addMonths = (s, n) => { const d = new Date(s + 'T12:00'); d.setMonth(d.getMonth() + n); return iso(d); };
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const fmtD = s => { if (!s) return 'sem data'; if (s === today()) return 'hoje'; const d = new Date(s + 'T12:00'); return WD[d.getDay()] + ', ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const t = String(v ?? '').trim(); if (!t) return 0; return parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) || 0; };
const r2 = v => Math.round(v * 100) / 100;
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const noPad = n => String(n).padStart(4, '0');
const numBR = (v, max = 3) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: max });

/* unidades de medida */
const UNIDADES = { un: { nome: 'Unidade', curto: 'un', passo: 1 }, kg: { nome: 'Quilo (kg)', curto: 'kg', passo: 0.5 }, cento: { nome: 'Cento', curto: 'cento', passo: 0.5 } };
const fmtQtd = (q, un) => {
  const n = numBR(q);
  if (un === 'kg') return n + ' kg';
  if (un === 'cento') return n + (Number(q) > 1 ? ' centos' : ' cento');
  return n + ' un';
};
const precoUn = (preco, un) => brl(preco) + '/' + (UNIDADES[un] || UNIDADES.un).curto;
const resumoItens = itens => itens.map(i => fmtQtd(i.qtd, i.un) + ' ' + i.desc).join(', ');

/* status */
const STATUS_NOMES = { solicitado: 'Pedido novo (agenda)', aguardando: 'Aguardando sinal', confirmado: 'A fazer', producao: 'Em andamento', pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado' };

/* WhatsApp */
const telWa = t => { const d = String(t || '').replace(/\D/g, ''); return d ? (d.startsWith('55') && d.length > 11 ? d : '55' + d) : ''; };
const waLinkTel = (tel, txt) => `https://wa.me/${telWa(tel)}?text=${encodeURIComponent(txt)}`;
const fmtTel = t => { const d = String(t || '').replace(/\D/g, ''); if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return d; };

/* endereço base do site (para links públicos) */
const baseSite = () => {
  const cfg = window.DNM_CONFIG || {};
  const b = cfg.SITE_URL || (location.protocol.startsWith('http') ? location.origin + location.pathname.replace(/[^/]*$/, '') : '');
  return String(b).split('#')[0].replace(/\/+$/, '');
};

/* miniatura de produto: foto ou inicial colorida */
const CORES = ['#E59AB0', '#F2C57C', '#A8D5BA', '#B9C7F0', '#E8B4D8', '#F4A27E'];
function thumb(foto, nome, tam = 56) {
  if (foto) return `<img class="thumb" src="${esc(foto)}" alt="" width="${tam}" height="${tam}" loading="lazy" style="width:${tam}px;height:${tam}px">`;
  const c = CORES[[...String(nome)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % CORES.length];
  return `<span class="thumb ph" style="width:${tam}px;height:${tam}px;background:${c}">${esc(String(nome).trim().charAt(0).toUpperCase())}</span>`;
}

/* reduz a foto antes de enviar (celular tira fotos de 4 MB+) */
async function reduzirFoto(file, max = 900, q = 0.8) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(res, 'image/jpeg', q));
  } finally { URL.revokeObjectURL(url); }
}

function toast(m) { const t = $('#toast'); if (!t) return alert(m); t.textContent = m; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600); }
function copiar(txt, msg) { try { navigator.clipboard.writeText(txt).then(() => toast(msg), () => prompt('Copie o texto:', txt)); } catch (e) { prompt('Copie o texto:', txt); } }

/* ---------- entrega, pagamento e horários (mesma regra do servidor) ---------- */
const PAGAMENTOS_PADRAO = [
  { nome: 'Pix', taxa: 0, ativo: true }, { nome: 'Dinheiro', taxa: 0, ativo: true },
  { nome: 'Cartão de débito', taxa: 1.99, ativo: true }, { nome: 'Cartão de crédito', taxa: 4.99, ativo: true }
];
function configCompleta(c) {
  c = c || {};
  const e = c.entrega || {};
  return {
    entrega: { retirada: e.retirada !== false, endereco_retirada: e.endereco_retirada || '', entrega: !!e.entrega,
      taxa_padrao: Number(e.taxa_padrao || 0), regioes: Array.isArray(e.regioes) ? e.regioes.map(r => ({ nome: String(r.nome || ''), valor: Number(r.valor || 0) })).filter(r => r.nome) : [] },
    pagamentos: Array.isArray(c.pagamentos) && c.pagamentos.length ? c.pagamentos.map(p => ({ nome: String(p.nome), taxa: Number(p.taxa || 0), ativo: p.ativo !== false })) : PAGAMENTOS_PADRAO.map(p => ({ ...p })),
    horarios: { inicio: (c.horarios && c.horarios.inicio) || '09:00', fim: (c.horarios && c.horarios.fim) || '18:00', intervalo: Number((c.horarios && c.horarios.intervalo) || 60) }
  };
}
/* taxa de entrega e da forma de pagamento sobre (produtos + entrega) */
function calcTaxas(produtos, cfg, entrega, regiao, forma) {
  let taxaEnt = 0;
  if (entrega === 'entrega') {
    const r = cfg.entrega.regioes.find(x => x.nome === regiao);
    taxaEnt = cfg.entrega.regioes.length ? (r ? r.valor : 0) : cfg.entrega.taxa_padrao;
  }
  const pg = cfg.pagamentos.find(p => p.nome === forma && p.ativo);
  const pct = pg ? Math.max(0, Math.min(30, pg.taxa)) : 0;
  const taxaPag = r2((produtos + taxaEnt) * pct / 100);
  return { taxaEnt: r2(taxaEnt), pct, taxaPag, total: r2(produtos + taxaEnt + taxaPag) };
}
function horariosDoDia(cfg) {
  const h = cfg.horarios, m = s => { const [a, b] = String(s).split(':').map(Number); return a * 60 + (b || 0); };
  const out = [], passo = Math.max(15, h.intervalo || 60);
  for (let t = m(h.inicio); t <= m(h.fim); t += passo) out.push(pad(Math.floor(t / 60)) + ':' + pad(t % 60));
  return out;
}
const fmtPct = v => numBR(v, 2) + '%';
const quando = (data, hora) => (data ? fmtD(data) : '') + (hora ? ' às ' + hora : '');
const fmtDataHora = s => { const d = new Date(s); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };

/* inspirações: escolher, reduzir e enviar fotos */
const LEGENDAS = ['Topper', 'Bolo', 'Docinhos', 'Decoração', 'Embalagem', 'Outro'];
