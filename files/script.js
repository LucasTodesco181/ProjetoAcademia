"use strict";

/* ---------- Dados ---------- */
const CHAVE = "ferro-giz-v4";
const PLANOS = [
  { id: 1, nome: "Mensal", valor: 119.9 },
  { id: 2, nome: "Trimestral", valor: 99.9 },
  { id: 3, nome: "Anual", valor: 79.9 },
];
const DIA = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const diasAtras = (n) => iso(new Date(Date.now() - n * DIA));
const diffDias = (a, b = iso(new Date())) => Math.round((new Date(b) - new Date(a)) / DIA);
const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (s) => (s ? s.split("-").reverse().join("/") : "-");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s) => document.querySelector(s);

/* ---- Configuração ----
   USAR_API = false: usa dados de exemplo salvos no navegador (localStorage).
   USAR_API = true : conversa com a sua API em C# (endpoints listados em "const API"). */
const USAR_API = false;
const API_URL = "http://localhost:5000";

const PERMISSOES = {
  admin: ["painel", "alunos", "pagamentos", "checkin", "risco", "fichas", "ficha", "equipe"],
  instrutor: ["painel", "alunos", "checkin", "risco", "fichas", "ficha"],
  aluno: ["minhaarea", "agenda"],
};
const ROTULOS = { admin: "Administrador", instrutor: "Instrutor", aluno: "Aluno" };

let banco, estado, sessao, fichaEdit; // banco = "banco de dados" de exemplo; estado = só o que este usuário pode ver

/* ---- CPF e telefone: máscara e validação ---- */
const DDDS = new Set("11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(" "));

function mascaraCPF(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}
function validarCPF(v) {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dig = (n) => { let t = 0; for (let i = 0; i < n; i++) t += +d[i] * (n + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r; };
  return dig(9) === +d[9] && dig(10) === +d[10];
}
function cpfDe(n) { // gera um CPF válido a partir de 9 dígitos (usado só nos dados de exemplo)
  const b = String(n).padStart(9, "0").split("").map(Number);
  const calc = (arr) => { const t = arr.reduce((x, y, i) => x + y * (arr.length + 1 - i), 0); const r = (t * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = calc(b), d2 = calc([...b, d1]);
  return mascaraCPF([...b, d1, d2].join(""));
}
/* Celular: (11) 9 1234-5678. Fixo: (11) 3456-7890. */
function mascaraTel(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (!d) return "";
  const ddd = d.slice(0, 2), resto = d.slice(2);
  if (!resto) return "(" + ddd;
  if (resto[0] === "9") return `(${ddd}) 9` + (resto.length > 1 ? " " + resto.slice(1, 5) : "") + (resto.length > 5 ? "-" + resto.slice(5) : "");
  return `(${ddd}) ` + resto.slice(0, 4) + (resto.length > 4 ? "-" + resto.slice(4, 8) : "");
}
function validarTel(v) {
  const d = v.replace(/\D/g, "");
  if (!DDDS.has(d.slice(0, 2))) return false;
  if (d.length === 11) return d[2] === "9";
  return d.length === 10 && /[2-5]/.test(d[2]);
}
function validarContato(d) {
  if (!validarCPF(d.cpf)) throw new Error("CPF inválido. Confira os números.");
  if (!validarTel(d.tel)) throw new Error("Telefone inválido. Use DDD e número, como (11) 9 1234-5678.");
  d.cpf = mascaraCPF(d.cpf);
  d.tel = mascaraTel(d.tel);
}

/* ---- Fichas de treino ---- */
const DIAS = [["seg", "Segunda"], ["ter", "Terça"], ["qua", "Quarta"], ["qui", "Quinta"], ["sex", "Sexta"], ["sab", "Sábado"]];
const PREF = { "": "Deixar com o instrutor", AB: "Treino A e B", ABC: "Treino A, B e C", SEMANA: "Um treino por dia, de segunda a sábado" };
const NOMES = { AB: { A: "Superiores", B: "Inferiores" }, ABC: { A: "Peito e tríceps", B: "Costas e bíceps", C: "Pernas e ombros" } };
const ESPALHA = { 2: ["seg", "qui"], 3: ["seg", "qua", "sex"], 4: ["seg", "ter", "qui", "sex"], 5: ["seg", "ter", "qua", "qui", "sex"], 6: ["seg", "ter", "qua", "qui", "sex", "sab"] };
const EXERCICIOS = ["Supino reto", "Supino inclinado", "Crucifixo", "Flexão de braço", "Remada curvada", "Puxada frontal", "Remada baixa", "Levantamento terra", "Desenvolvimento com halteres", "Elevação lateral", "Rosca direta", "Rosca martelo", "Tríceps corda", "Tríceps testa", "Agachamento livre", "Leg press", "Cadeira extensora", "Mesa flexora", "Afundo", "Stiff", "Panturrilha em pé", "Abdominal", "Prancha", "Esteira", "Bicicleta ergométrica"];

const chaves = (tipo) => (tipo === "SEMANA" ? DIAS.map((d) => d[0]) : tipo.split(""));
function modeloTreinos(tipo, antigo = {}) {
  const r = {};
  chaves(tipo).forEach((k) => { r[k] = antigo[k] || { nome: tipo === "SEMANA" ? "" : NOMES[tipo][k], exercicios: [] }; });
  return r;
}
function agendaPadrao(tipo, dias) {
  const ag = {};
  DIAS.forEach(([d]) => { ag[d] = tipo === "SEMANA" ? d : ""; });
  if (tipo !== "SEMANA") { const ks = chaves(tipo); (ESPALHA[dias] || ESPALHA[3]).forEach((d, i) => { ag[d] = ks[i % ks.length]; }); }
  return ag;
}
function sugerirTipo(a) {
  const n = a.anamnese;
  if (!n) return "ABC";
  if (n.preferencia) return n.preferencia;
  return n.dias <= 2 ? "AB" : n.dias === 3 ? "ABC" : n.dias === 4 ? "AB" : "SEMANA";
}
function anamneseExemplo(i) {
  const obj = ["Emagrecer", "Ganhar massa muscular", "Definir o corpo", "Ficar mais forte", "Saúde e bem-estar"];
  const lesoes = { 3: "Dor no joelho direito", 6: "Hérnia de disco lombar" };
  return {
    idade: [28, 34, 41, 23, 30, 37, 45, 26, 32, 29][i], sexo: i % 2 ? "Masculino" : "Feminino", peso: 60 + i * 3.5, altura: 160 + i * 2,
    objetivo: obj[i % 5], nivel: ["Iniciante (até 6 meses)", "Intermediário (6 meses a 2 anos)", "Avançado (mais de 2 anos)"][i % 3],
    dias: [4, 5, 3, 3, 5, 4, 3, 4, 5, 3][i], tempo: 60, preferencia: "", lesao: !!lesoes[i], lesaoDetalhe: lesoes[i] || "",
    condicoes: i === 6 ? ["Problema de coluna ou articulações"] : [], medicamentos: "", cirurgia: false, obs: "",
  };
}
function fichaExemplo(alunoId, tipo, instrutorId) {
  const pool = ["Supino reto", "Agachamento livre", "Remada curvada", "Desenvolvimento com halteres", "Leg press", "Rosca direta"];
  const treinos = modeloTreinos(tipo);
  chaves(tipo).forEach((k, j) => { treinos[k].exercicios = [0, 1, 2].map((n) => ({ nome: pool[(j + n * 2) % pool.length], series: "3", reps: "12", carga: "", obs: "" })); });
  return { alunoId, instrutorId, tipo, treinos, agenda: agendaPadrao(tipo, 3), atualizada: diasAtras(5) };
}

function gerarExemplo() {
  // [nome, plano, frequência antiga/sem, frequência recente/sem, mensalidades em atraso]
  const base = [
    ["Marina Alves", 3, 4, 4, 0], ["Carlos Pereira", 1, 5, 1, 1], ["Juliana Costa", 2, 3, 3, 0],
    ["Rafael Souza", 1, 4, 0.3, 2], ["Beatriz Lima", 3, 5, 5, 0], ["Thiago Martins", 2, 4, 2, 0],
    ["Larissa Rocha", 1, 3, 0.5, 1], ["Diego Santos", 3, 3, 4, 0], ["Camila Ferraz", 2, 5, 3, 0],
    ["Eduardo Nunes", 1, 4, 0.2, 2],
  ];
  let sem = 7;
  const rnd = () => ((sem = (sem * 9301 + 49297) % 233280) / 233280);
  const alunos = [], checkins = [], pagamentos = [];
  const usuarios = [
    { id: 1, nome: "Administrador", email: "admin@ferro.com", senha: "admin123", perfil: "admin" },
    { id: 2, nome: "Paulo Mendes", email: "paulo@ferro.com", senha: "instrutor123", perfil: "instrutor", instrutorId: 1 },
    { id: 3, nome: "Renata Duarte", email: "renata@ferro.com", senha: "instrutor123", perfil: "instrutor", instrutorId: 2 },
  ];
  base.forEach(([nome, plano, antes, agora, atrasos], i) => {
    const id = i + 1;
    alunos.push({ id, nome, cpf: cpfDe(104567890 + i * 7919), tel: `(11) 9 ${8000 + i * 37}-${1000 + i * 91}`, plano, ativo: true, desde: diasAtras(120), instrutorId: (i % 2) + 1, anamnese: anamneseExemplo(i) });
    usuarios.push({ id: 10 + id, nome, email: nome.split(" ")[0].toLowerCase() + "@aluno.com", senha: "aluno123", perfil: "aluno", alunoId: id });
    for (let d = 56; d >= 0; d--) {
      const p = (d > 14 ? antes : agora) / 7;
      if (rnd() < p) checkins.push({ alunoId: id, data: diasAtras(d) });
    }
    const valor = PLANOS.find((p) => p.id === plano).valor;
    [50, 20, -10].forEach((d, k) => {
      const emAtraso = d > 0 && k >= 2 - atrasos;
      pagamentos.push({ id: pagamentos.length + 1, alunoId: id, valor, venc: diasAtras(d), pago: d > 0 && !emAtraso ? diasAtras(d - 1) : null });
    });
  });
  return { alunos, checkins, pagamentos, usuarios, fichas: [fichaExemplo(1, "ABC", 1), fichaExemplo(2, "AB", 2)], instrutores: [{ id: 1, nome: "Paulo Mendes" }, { id: 2, nome: "Renata Duarte" }] };
}

function carregar() {
  if (USAR_API) return;
  try { banco = JSON.parse(localStorage.getItem(CHAVE)); } catch { banco = null; }
  if (!banco) { banco = gerarExemplo(); salvar(); }
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(banco)); } catch { /* sem armazenamento */ }
}

/* Só devolve o que o perfil logado pode ver (na API real, quem faz isso é o servidor). */
function filtrar() {
  let alunos = banco.alunos;
  if (sessao.perfil === "instrutor") alunos = alunos.filter((a) => a.instrutorId === sessao.instrutorId);
  if (sessao.perfil === "aluno") alunos = alunos.filter((a) => a.id === sessao.alunoId);
  const ids = new Set(alunos.map((a) => a.id));
  return {
    alunos,
    checkins: banco.checkins.filter((c) => ids.has(c.alunoId)),
    pagamentos: banco.pagamentos.filter((p) => ids.has(p.alunoId)),
    fichas: banco.fichas.filter((f) => ids.has(f.alunoId)),
    equipe: sessao.perfil === "admin" ? banco.usuarios.filter((u) => u.perfil !== "aluno").map(({ id, nome, email, perfil }) => ({ id, nome, email, perfil })) : [],
  };
}

/* ---------- Camada de acesso ao banco ----------
   Cada função abaixo tem a versão com a API real (USAR_API = true) e a versão de exemplo.
   Endpoints esperados na API em C#:
     POST /api/login                     {email, senha}  -> {token, nome, perfil, alunoId, instrutorId}
     GET  /api/dados                     -> {alunos, checkins, pagamentos}  (já filtrado pelo perfil do token)
     POST /api/checkins                  {alunoId}
     POST /api/pagamentos/{id}/pagar     (só admin)
     POST /api/alunos/{id}/alternar      (só admin)
     POST /api/alunos                    {nome, cpf, tel, plano}  (só admin; o servidor também valida CPF e telefone)
     POST /api/usuarios                  {nome, email, senha, perfil: "admin"|"instrutor"}  (só admin)
     PUT  /api/alunos/{id}/ficha         {tipo, treinos, agenda}  (admin, ou o instrutor dono do aluno)
     (POST /api/cadastro também recebe "anamnese": {idade, sexo, peso, altura, objetivo, nivel, dias, tempo, preferencia, lesao, lesaoDetalhe, condicoes[], medicamentos, cirurgia, obs})
     (GET /api/dados também devolve "fichas", alunos[].anamnese e "equipe": [{id, nome, email, perfil}] quando o token é de admin)
   Erros devem voltar com status 4xx e JSON {"erro": "mensagem"}. */
async function chamar(metodo, rota, corpo) {
  const headers = { "Content-Type": "application/json" };
  if (sessao) headers.Authorization = "Bearer " + sessao.token;
  const r = await fetch(API_URL + rota, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || "Erro " + r.status);
  return dados;
}
const instrutorMenosOcupado = () =>
  banco.instrutores.map((i) => [i.id, banco.alunos.filter((a) => a.instrutorId === i.id).length]).sort((x, y) => x[1] - y[1])[0][0];
const exigir = (...perfis) => { if (!perfis.includes(sessao.perfil)) throw new Error("Você não tem permissão para esta ação."); };

const API = {
  async login(email, senha) {
    if (USAR_API) return chamar("POST", "/api/login", { email, senha });
    const u = banco.usuarios.find((x) => x.email === email.toLowerCase() && x.senha === senha);
    if (!u) throw new Error("E-mail ou senha incorretos.");
    return { token: "demo-" + u.id, nome: u.nome, perfil: u.perfil, alunoId: u.alunoId, instrutorId: u.instrutorId };
  },
  async novoUsuario(d) {
    if (USAR_API) return chamar("POST", "/api/usuarios", d);
    exigir("admin");
    if (!["admin", "instrutor"].includes(d.perfil)) throw new Error("Perfil inválido.");
    const email = d.email.toLowerCase();
    if (banco.usuarios.some((u) => u.email === email)) throw new Error("Já existe uma conta com este e-mail.");
    const u = { id: Math.max(...banco.usuarios.map((x) => x.id)) + 1, nome: d.nome, email, senha: d.senha, perfil: d.perfil };
    if (d.perfil === "instrutor") {
      u.instrutorId = Math.max(0, ...banco.instrutores.map((i) => i.id)) + 1;
      banco.instrutores.push({ id: u.instrutorId, nome: d.nome });
    }
    banco.usuarios.push(u);
    salvar();
  },
  async salvarFicha(alunoId, f) {
    if (USAR_API) return chamar("PUT", `/api/alunos/${alunoId}/ficha`, f);
    exigir("admin", "instrutor");
    const a = banco.alunos.find((x) => x.id === alunoId);
    if (!a || (sessao.perfil === "instrutor" && a.instrutorId !== sessao.instrutorId)) throw new Error("Você não pode editar a ficha deste aluno.");
    const ficha = { ...f, alunoId, instrutorId: sessao.instrutorId || a.instrutorId, atualizada: iso(new Date()) };
    banco.fichas = banco.fichas.filter((x) => x.alunoId !== alunoId).concat(ficha);
    salvar();
  },
  /* Cadastro público: sempre cria um ALUNO. O perfil nunca vem do cliente. */
  async cadastrar(d) {
    if (USAR_API) return chamar("POST", "/api/cadastro", d);
    validarContato(d);
    const email = d.email.toLowerCase();
    if (banco.usuarios.some((u) => u.email === email)) throw new Error("Já existe uma conta com este e-mail.");
    if (banco.alunos.some((a) => a.cpf === d.cpf)) throw new Error("Já existe um aluno com este CPF.");
    const id = Math.max(0, ...banco.alunos.map((a) => a.id)) + 1;
    banco.alunos.push({ id, nome: d.nome, cpf: d.cpf, tel: d.tel, plano: d.plano, ativo: true, desde: iso(new Date()), instrutorId: instrutorMenosOcupado(), anamnese: d.anamnese });
    banco.pagamentos.push({ id: Math.max(0, ...banco.pagamentos.map((p) => p.id)) + 1, alunoId: id, valor: PLANOS.find((p) => p.id === d.plano).valor, venc: diasAtras(-30), pago: null });
    const uid = Math.max(...banco.usuarios.map((u) => u.id)) + 1;
    banco.usuarios.push({ id: uid, nome: d.nome, email, senha: d.senha, perfil: "aluno", alunoId: id });
    salvar();
    return { token: "demo-" + uid, nome: d.nome, perfil: "aluno", alunoId: id };
  },
  async dados() {
    return USAR_API ? chamar("GET", "/api/dados") : filtrar();
  },
  async checkin(alunoId) {
    if (USAR_API) return chamar("POST", "/api/checkins", { alunoId });
    const a = estado.alunos.find((x) => x.id === alunoId);
    if (!a) throw new Error("Aluno não encontrado.");
    if (!a.ativo) throw new Error(`${a.nome} está com a matrícula inativa.`);
    const maior = Math.max(0, ...atrasosDe(a.id).map((p) => diffDias(p.venc)));
    if (maior > 10) throw new Error(`Entrada bloqueada: mensalidade em atraso há ${maior} dias.`);
    const hoje = iso(new Date());
    if (estado.checkins.some((c) => c.alunoId === a.id && c.data === hoje)) throw new Error(`${a.nome} já fez check-in hoje.`);
    banco.checkins.push({ alunoId, data: hoje, hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) });
    salvar();
  },
  async pagar(id) {
    if (USAR_API) return chamar("POST", `/api/pagamentos/${id}/pagar`);
    exigir("admin");
    banco.pagamentos.find((p) => p.id === id).pago = iso(new Date());
    salvar();
  },
  async alternar(id) {
    if (USAR_API) return chamar("POST", `/api/alunos/${id}/alternar`);
    exigir("admin");
    const a = banco.alunos.find((x) => x.id === id);
    a.ativo = !a.ativo;
    salvar();
  },
  async novoAluno(d) {
    if (USAR_API) return chamar("POST", "/api/alunos", d);
    exigir("admin");
    validarContato(d);
    if (banco.alunos.some((a) => a.cpf === d.cpf)) throw new Error("Já existe um aluno com este CPF.");
    const id = Math.max(0, ...banco.alunos.map((a) => a.id)) + 1;
    banco.alunos.push({ id, nome: d.nome, cpf: d.cpf, tel: d.tel, plano: d.plano, ativo: true, desde: iso(new Date()), instrutorId: instrutorMenosOcupado(), anamnese: null });
    banco.pagamentos.push({ id: Math.max(0, ...banco.pagamentos.map((p) => p.id)) + 1, alunoId: id, valor: PLANOS.find((p) => p.id === d.plano).valor, venc: diasAtras(-30), pago: null });
    const login = d.nome.split(" ")[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") + "@aluno.com";
    banco.usuarios.push({ id: Math.max(...banco.usuarios.map((u) => u.id)) + 1, nome: d.nome, email: login, senha: "aluno123", perfil: "aluno", alunoId: id });
    salvar();
    return { login };
  },
};

/* ---------- Regras de negócio ---------- */
const aluno = (id) => estado.alunos.find((a) => a.id === id);
const planoDe = (a) => PLANOS.find((p) => p.id === a.plano);
const situacao = (p) => (p.pago ? "pago" : p.venc < iso(new Date()) ? "atrasado" : "pendente");
const atrasosDe = (id) => estado.pagamentos.filter((p) => p.alunoId === id && situacao(p) === "atrasado");
const checkinsDe = (id) => estado.checkins.filter((c) => c.alunoId === id).map((c) => c.data).sort();
const ultimoCheckin = (id) => checkinsDe(id).slice(-1)[0] || null;

function risco(a) {
  const datas = checkinsDe(a.id);
  const motivos = [];
  let pts = 0;
  const ult = datas[datas.length - 1];
  const sem = ult ? diffDias(ult) : 99;
  if (sem > 14) { pts += 40; motivos.push(`${sem >= 99 ? "Nunca treinou" : sem + " dias sem treinar"}`); }
  else if (sem > 7) { pts += 20; motivos.push(`${sem} dias sem treinar`); }
  const recente = datas.filter((d) => diffDias(d) <= 14).length / 2;
  const antes = datas.filter((d) => diffDias(d) > 14 && diffDias(d) <= 42).length / 4;
  const queda = antes > 0 && recente < antes * 0.5;
  if (queda) { pts += 30; motivos.push(`Frequência caiu de ${antes.toFixed(1)} para ${recente.toFixed(1)} treinos/semana`); }
  const at = atrasosDe(a.id).length;
  if (at) { pts += Math.min(at * 15, 30); motivos.push(`${at} mensalidade(s) em atraso`); }
  pts = Math.min(pts, 100);
  return { pts, nivel: pts >= 60 ? "alto" : pts >= 30 ? "medio" : "baixo", motivos, sem, queda, at };
}
const emRisco = () => estado.alunos.filter((a) => a.ativo).map((a) => ({ a, r: risco(a) })).sort((x, y) => y.r.pts - x.r.pts);

/* ---------- Telas ---------- */
const TITULOS = { painel: "Painel", alunos: "Alunos", pagamentos: "Mensalidades", checkin: "Check-in", risco: "Risco de evasão", minhaarea: "Minha área", equipe: "Equipe", agenda: "Agenda de treino", fichas: "Fichas de treino", ficha: "Ficha de treino" };

function renderPainel() {
  const hoje = iso(new Date());
  const ativos = estado.alunos.filter((a) => a.ativo).length;
  const hojeN = estado.checkins.filter((c) => c.data === hoje).length;
  const inad = new Set(estado.pagamentos.filter((p) => situacao(p) === "atrasado").map((p) => p.alunoId)).size;
  const mes = hoje.slice(0, 7);
  const receita = estado.pagamentos.filter((p) => p.pago && p.pago.startsWith(mes)).reduce((s, p) => s + p.valor, 0);
  const altos = emRisco().filter((x) => x.r.nivel === "alto").length;
  $("#kpis").innerHTML = [
    [ativos, "alunos ativos", ""], [hojeN, "check-ins hoje", ""],
    [inad, "alunos inadimplentes", inad ? "alerta" : ""], [altos, "com risco alto de evasão", altos ? "alerta" : ""],
    ...(sessao.perfil === "admin" ? [[brl(receita), "recebido neste mês", ""]] : []),
  ].map(([v, t, c]) => `<div class="kpi ${c}"><strong>${v}</strong><span>${t}</span></div>`).join("");

  const dias = [...Array(7)].map((_, i) => 6 - i);
  const cont = dias.map((d) => estado.checkins.filter((c) => c.data === diasAtras(d)).length);
  const max = Math.max(...cont, 1);
  const nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  $("#barras").innerHTML = dias.map((d, i) =>
    `<div class="barra"><b>${cont[i]}</b><i style="height:${(cont[i] / max) * 100}%"></i>${nomes[new Date(Date.now() - d * DIA).getDay()]}</div>`).join("");

  const top = emRisco().filter((x) => x.r.pts >= 30).slice(0, 5);
  $("#topRisco").innerHTML = top.length
    ? top.map(({ a, r }) => `<li><span>${esc(a.nome)}</span><span class="tag ${r.nivel}">${r.pts} pts</span></li>`).join("")
    : `<li class="vazio">Nenhum aluno em risco agora.</li>`;
}

function renderAlunos() {
  const q = $("#busca").value.trim().toLowerCase();
  const lista = estado.alunos.filter((a) => !q || a.nome.toLowerCase().includes(q) || a.cpf.includes(q));
  $("#tabAlunos").innerHTML = `<tr><th>Matrícula</th><th>Nome</th><th>CPF</th><th>Plano</th><th>Último treino</th><th>Situação</th><th></th></tr>` +
    (lista.map((a) => `<tr><td>${a.id}</td><td>${esc(a.nome)}</td><td>${esc(a.cpf)}</td><td>${planoDe(a).nome}</td>
      <td>${dataBR(ultimoCheckin(a.id))}</td><td><span class="tag ${a.ativo ? "ativo" : "inativo"}">${a.ativo ? "Ativo" : "Inativo"}</span></td>
      <td>${sessao.perfil === "admin" ? `<button class="mini" data-alt="${a.id}">${a.ativo ? "Desativar" : "Reativar"}</button>` : ""}</td></tr>`).join("") ||
      `<tr><td colspan="7" class="vazio">Nenhum aluno encontrado.</td></tr>`);
}

function renderPagamentos() {
  const f = $("#filtroPag").value;
  const lista = estado.pagamentos.filter((p) => f === "todos" || situacao(p) === f).sort((a, b) => b.venc.localeCompare(a.venc));
  $("#tabPag").innerHTML = `<tr><th>Aluno</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th></th></tr>` +
    (lista.map((p) => { const s = situacao(p); return `<tr><td>${esc(aluno(p.alunoId).nome)}</td><td>${dataBR(p.venc)}</td><td>${brl(p.valor)}</td>
      <td><span class="tag ${s}">${{ pago: "Paga em " + dataBR(p.pago), atrasado: "Atrasada", pendente: "A vencer" }[s]}</span></td>
      <td>${p.pago ? "" : `<button class="mini" data-pagar="${p.id}">Registrar pagamento</button>`}</td></tr>`; }).join("") ||
      `<tr><td colspan="5" class="vazio">Nenhuma mensalidade neste filtro.</td></tr>`);
}

function renderCheckin() {
  const hoje = iso(new Date());
  const lista = estado.checkins.filter((c) => c.data === hoje);
  $("#listaHoje").innerHTML = lista.length
    ? lista.map((c) => `<li><span>${esc(aluno(c.alunoId).nome)}</span><span class="muted">${c.hora || ""}</span></li>`).join("")
    : `<li class="vazio">Ninguém entrou ainda hoje.</li>`;
}

function renderRisco() {
  $("#gradeRisco").innerHTML = emRisco().map(({ a, r }) => `
    <article class="card ${r.nivel}">
      <h3>${esc(a.nome)}</h3>
      <span class="tag ${r.nivel}">Risco ${{ alto: "alto", medio: "médio", baixo: "baixo" }[r.nivel]}</span>
      <div class="medidor"><i style="width:${r.pts}%"></i></div>
      <ul>${(r.motivos.length ? r.motivos : ["Frequência e pagamentos em dia"]).map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
      ${r.pts >= 30 ? `<button class="mini primario" data-msg="${a.id}">Chamar no WhatsApp</button>` : ""}
    </article>`).join("");
}

function renderMinhaArea() {
  const a = estado.alunos[0];
  if (!a) { $("#minhaKpis").innerHTML = `<p class="vazio">Cadastro de aluno não encontrado.</p>`; $("#tabMinhas").innerHTML = ""; return; }
  const ult = ultimoCheckin(a.id);
  const mes = checkinsDe(a.id).filter((d) => diffDias(d) <= 30).length;
  const at = atrasosDe(a.id).length;
  $("#minhaKpis").innerHTML = [
    [mes, "treinos nos últimos 30 dias", ""], [ult ? dataBR(ult) : "-", "último treino", ""],
    [planoDe(a).nome, "seu plano", ""], [at, "mensalidades em atraso", at ? "alerta" : ""],
  ].map(([v, t, c]) => `<div class="kpi ${c}"><strong>${v}</strong><span>${t}</span></div>`).join("");
  const lista = estado.pagamentos.slice().sort((x, y) => y.venc.localeCompare(x.venc));
  $("#tabMinhas").innerHTML = `<tr><th>Vencimento</th><th>Valor</th><th>Situação</th></tr>` + lista.map((p) => {
    const s = situacao(p);
    return `<tr><td>${dataBR(p.venc)}</td><td>${brl(p.valor)}</td><td><span class="tag ${s}">${{ pago: "Paga em " + dataBR(p.pago), atrasado: "Atrasada", pendente: "A vencer" }[s]}</span></td></tr>`;
  }).join("");
}

function renderAgenda() {
  const a = estado.alunos[0], f = a && estado.fichas.find((x) => x.alunoId === a.id), el = $("#agendaConteudo");
  if (!f) {
    el.innerHTML = `<div class="bloco estreito"><h3>Sua ficha ainda não está pronta</h3><p class="muted">Seu instrutor monta o treino com base nas respostas do seu cadastro. Quando ele salvar, a agenda aparece aqui.</p></div>`;
    return;
  }
  const hoje = DIAS[new Date().getDay() - 1];
  const dias = DIAS.map(([d, nome]) => {
    const t = f.treinos[f.tipo === "SEMANA" ? d : f.agenda[d]];
    const eHoje = hoje && hoje[0] === d ? "hoje" : "";
    if (!t || !t.exercicios.length) return `<div class="dia folga ${eHoje}"><h3>${nome}</h3><p class="muted">Descanso</p></div>`;
    const rotulo = f.tipo === "SEMANA" ? t.nome || nome : `Treino ${f.agenda[d]}` + (t.nome ? ", " + t.nome : "");
    return `<details class="dia ${eHoje}" ${eHoje ? "open" : ""}><summary><h3>${nome}</h3><span>${esc(rotulo)}</span></summary><ul class="lista">${
      t.exercicios.map((x) => `<li><span>${esc(x.nome)}</span><span class="muted">${esc(x.series)} x ${esc(x.reps)}${x.carga ? ", " + esc(x.carga) : ""}</span></li>`).join("")}</ul></details>`;
  }).join("");
  el.innerHTML = `<p class="muted">Divisão: ${PREF[f.tipo]}. Atualizada em ${dataBR(f.atualizada)}.${a.anamnese ? " Objetivo: " + esc(a.anamnese.objetivo) + "." : ""}</p><div class="semana">${dias}</div>`;
}

function renderFichas() {
  $("#tabFichas").innerHTML = `<tr><th>Aluno</th><th>Objetivo</th><th>Idade</th><th>Saúde</th><th>Ficha</th><th></th></tr>` +
    (estado.alunos.filter((a) => a.ativo).map((a) => {
      const n = a.anamnese, f = estado.fichas.find((x) => x.alunoId === a.id);
      const alerta = !n ? `<span class="tag inativo">Sem questionário</span>` : n.lesao || n.condicoes.length ? `<span class="tag alto">Atenção</span>` : `<span class="tag baixo">Sem alertas</span>`;
      return `<tr><td>${esc(a.nome)}</td><td>${n ? esc(n.objetivo) : "-"}</td><td>${n ? n.idade : "-"}</td><td>${alerta}</td>
        <td>${f ? `${f.tipo === "SEMANA" ? "Seg a sáb" : f.tipo}, atualizada em ${dataBR(f.atualizada)}` : `<span class="tag pendente">Sem ficha</span>`}</td>
        <td><button class="mini primario" data-ficha="${a.id}">${f ? "Editar ficha" : "Montar ficha"}</button></td></tr>`;
    }).join("") || `<tr><td colspan="6" class="vazio">Nenhum aluno ativo.</td></tr>`);
}

function abrirFicha(id) {
  const a = estado.alunos.find((x) => x.id === id);
  const ex = estado.fichas.find((f) => f.alunoId === id);
  if (ex) fichaEdit = JSON.parse(JSON.stringify(ex));
  else { const tipo = sugerirTipo(a); fichaEdit = { alunoId: id, tipo, treinos: modeloTreinos(tipo), agenda: agendaPadrao(tipo, a.anamnese ? a.anamnese.dias : 3) }; }
  ir("ficha");
  $("#titulo").textContent = "Ficha de " + a.nome;
}

function trocarTipo(tipo) {
  const a = estado.alunos.find((x) => x.id === fichaEdit.alunoId);
  fichaEdit.treinos = modeloTreinos(tipo, fichaEdit.treinos);
  fichaEdit.tipo = tipo;
  fichaEdit.agenda = agendaPadrao(tipo, a.anamnese ? a.anamnese.dias : 3);
  renderFicha();
}

function renderFicha() {
  const f = fichaEdit, a = estado.alunos.find((x) => x.id === f.alunoId), n = a.anamnese;
  let resumo = `<p class="muted">O aluno ainda não respondeu o questionário de cadastro.</p>`;
  if (n) {
    const imc = n.peso && n.altura ? (n.peso / (n.altura / 100) ** 2).toFixed(1) : "-";
    const item = (t, v) => `<div><span class="muted">${t}</span><br><strong>${esc(v)}</strong></div>`;
    const alertas = [];
    if (n.lesao) alertas.push("Lesão ou impedimento: " + (n.lesaoDetalhe || "não detalhado"));
    if (n.condicoes.length) alertas.push("Condições de saúde: " + n.condicoes.join(", "));
    if (n.condicoes.includes("Problema cardíaco")) alertas.push("Recomende liberação médica antes de treinos intensos.");
    if (n.medicamentos) alertas.push("Medicamentos: " + n.medicamentos);
    if (n.cirurgia) alertas.push("Fez cirurgia nos últimos 12 meses.");
    if (n.obs) alertas.push("Observações do aluno: " + n.obs);
    resumo = `<div class="resumo">${item("Idade", n.idade + " anos")}${item("Sexo", n.sexo || "-")}${item("Peso e altura", `${n.peso} kg, ${n.altura} cm (IMC ${imc})`)}${item("Objetivo", n.objetivo)}${item("Experiência", n.nivel)}${item("Disponibilidade", `${n.dias} dias por semana, ${n.tempo} min`)}${item("Divisão que prefere", PREF[n.preferencia])}</div>` +
      (alertas.length ? `<ul class="alerta-saude">${alertas.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "") +
      `<p class="muted">Sugestão pelo perfil: ${PREF[sugerirTipo(a)]}.</p>`;
  }
  const ks = chaves(f.tipo);
  const tituloDe = (k) => (f.tipo === "SEMANA" ? DIAS.find((d) => d[0] === k)[1] : "Treino " + k);
  const agenda = f.tipo === "SEMANA"
    ? `<p class="muted">Cada dia tem o seu treino. Deixe um dia sem exercícios para marcar descanso.</p>`
    : `<div class="agenda-sel">${DIAS.map(([d, nome]) => `<label>${nome}<select data-ag="${d}"><option value="">Folga</option>${ks.map((k) => `<option value="${k}" ${f.agenda[d] === k ? "selected" : ""}>Treino ${k}</option>`).join("")}</select></label>`).join("")}</div>`;
  const campo = (k, i, c, ph, v, extra = "") => `<input ${extra} data-t="${k}" data-i="${i}" data-f="${c}" value="${esc(v)}" placeholder="${ph}">`;
  const blocos = ks.map((k) => {
    const t = f.treinos[k];
    return `<div class="bloco"><div class="barra-acoes"><h3>${tituloDe(k)}</h3><input data-t="${k}" data-f="nome" value="${esc(t.nome)}" placeholder="Nome do treino, ex.: Peito e tríceps"></div>` +
      t.exercicios.map((x, i) => `<div class="ex">${campo(k, i, "nome", "Exercício", x.nome, 'list="listaEx"')}${campo(k, i, "series", "Séries", x.series)}${campo(k, i, "reps", "Repetições", x.reps)}${campo(k, i, "carga", "Carga", x.carga)}<button type="button" class="mini" data-rmex="${k}:${i}">Remover</button></div>`).join("") +
      `<button type="button" class="mini" data-addex="${k}">Adicionar exercício</button></div>`;
  }).join("");
  $("#fichaConteudo").innerHTML = `<div class="bloco"><h3>Dados do aluno</h3>${resumo}</div>
    <div class="bloco"><h3>Divisão do treino</h3><label class="rot">Tipo de divisão <select id="tipoFicha">${Object.entries(PREF).filter(([k]) => k).map(([k, v]) => `<option value="${k}" ${f.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>${agenda}</div>
    ${blocos}
    <div class="barra-acoes fim"><button type="button" id="cancelarFicha">Cancelar</button><button type="button" class="primario" id="salvarFicha">Salvar ficha</button></div>`;
}

function salvarFicha() {
  const ks = chaves(fichaEdit.tipo);
  ks.forEach((k) => { fichaEdit.treinos[k].exercicios = fichaEdit.treinos[k].exercicios.filter((x) => x.nome.trim()); });
  if (ks.every((k) => !fichaEdit.treinos[k].exercicios.length)) { renderFicha(); return aviso("Adicione ao menos um exercício antes de salvar."); }
  acao(async () => { await API.salvarFicha(fichaEdit.alunoId, fichaEdit); ir("fichas"); }, "Ficha salva. O aluno já vê o treino na agenda.");
}

function renderEquipe() {
  $("#tabEquipe").innerHTML = `<tr><th>Nome</th><th>E-mail</th><th>Perfil</th></tr>` +
    (estado.equipe || []).map((u) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td><td><span class="tag ${u.perfil === "admin" ? "medio" : "baixo"}">${ROTULOS[u.perfil]}</span></td></tr>`).join("");
}

const renders = { painel: renderPainel, alunos: renderAlunos, pagamentos: renderPagamentos, checkin: renderCheckin, risco: renderRisco, minhaarea: renderMinhaArea, equipe: renderEquipe, agenda: renderAgenda, fichas: renderFichas, ficha: renderFicha };
let atual = "painel";
function ir(v) {
  if (!sessao || !PERMISSOES[sessao.perfil].includes(v)) return aviso("Você não tem acesso a esta tela.");
  atual = v;
  document.querySelectorAll(".view").forEach((s) => s.classList.toggle("active", s.id === v));
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  $("#titulo").textContent = TITULOS[v];
  renders[v]();
}

/* ---------- Ações ---------- */
function aviso(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(aviso.t); aviso.t = setTimeout(() => t.classList.remove("on"), 3200);
}

async function recarregar() { estado = await API.dados(); renders[atual](); }

async function acao(fn, ok) {
  try { const r = await fn(); await recarregar(); aviso(typeof ok === "function" ? ok(r) : ok); }
  catch (e) { aviso(e.message); }
}

async function enviarCheckin(a, msg) {
  try {
    await API.checkin(a.id);
    msg.textContent = `Bom treino, ${a.nome.split(" ")[0]}! Entrada registrada.`; msg.className = "aviso ok";
    await recarregar();
  } catch (e) { msg.textContent = e.message; msg.className = "aviso erro"; }
}

function fazerCheckin() {
  const q = $("#idCheckin").value.trim().toLowerCase();
  const msg = $("#msgCheckin");
  const a = q && estado.alunos.find((x) => String(x.id) === q || (q.replace(/\D/g, "").length === 11 && x.cpf.replace(/\D/g, "") === q.replace(/\D/g, "")) || x.nome.toLowerCase().includes(q));
  if (!a) { msg.textContent = "Aluno não encontrado. Confira a matrícula, o CPF ou o nome."; msg.className = "aviso erro"; return; }
  $("#idCheckin").value = "";
  enviarCheckin(a, msg);
}

function dadosCadastro(f) {
  const n = (k) => f.get(k);
  return {
    nome: n("nome").trim(), cpf: n("cpf").trim(), tel: n("tel"), plano: +n("plano"), email: n("email").trim(), senha: n("senha"),
    anamnese: {
      idade: +n("idade"), sexo: n("sexo"), peso: +n("peso"), altura: +n("altura"),
      objetivo: n("objetivo"), nivel: n("nivel"), dias: +n("dias"), tempo: +n("tempo"), preferencia: n("preferencia"),
      lesao: n("lesao") === "sim", lesaoDetalhe: n("lesaoDetalhe").trim(), condicoes: f.getAll("condicoes"),
      medicamentos: n("medicamentos").trim(), cirurgia: n("cirurgia") === "sim", obs: n("obs").trim(),
    },
  };
}

/* Mensagem pronta de acordo com o motivo do risco de evasão */
function mensagemWhatsApp(a, r) {
  const nome = a.nome.split(" ")[0];
  const quem = sessao.nome.split(" ")[0];
  const p = [`Oi, ${nome}! Aqui é ${quem}, da Ferro & Giz.`];
  if (r.sem >= 99) p.push("Vi que você ainda não começou a treinar e quero te ajudar a dar o primeiro passo.");
  else if (r.sem >= 15) p.push(`Faz ${r.sem} dias que você não aparece por aqui e sentimos sua falta.`);
  else if (r.sem > 7) p.push(`Percebi que já faz ${r.sem} dias desde o seu último treino.`);
  if (r.queda) p.push((p.length > 1 ? "Também notei" : "Notei") + " que a sua frequência diminuiu nas últimas semanas.");
  if (r.at) p.push("Sobre a mensalidade em aberto, se precisar de ajuda para regularizar, é só me falar que a gente resolve.");
  p.push(r.nivel === "alto"
    ? "Que tal combinarmos um horário nesta semana para eu ajustar o seu treino e te ajudar a voltar com tudo?"
    : "Se algo estiver atrapalhando a sua rotina, me conta que eu ajusto o treino para ficar mais fácil de encaixar.");
  p.push("Te espero por aqui!");
  return p.join(" ");
}

function enviarWhatsApp(id) {
  const a = estado.alunos.find((x) => x.id === id);
  if (!a || !a.tel || !validarTel(a.tel)) return aviso("Este aluno não tem um telefone válido cadastrado.");
  const url = `https://wa.me/55${a.tel.replace(/\D/g, "")}?text=${encodeURIComponent(mensagemWhatsApp(a, risco(a)))}`;
  window.open(url, "_blank", "noopener");
  aviso("Abrindo o WhatsApp com a mensagem pronta");
}

function sair() { sessionStorage.removeItem("sessao"); location.reload(); }

async function iniciar() {
  estado = await API.dados();
  document.body.classList.remove("deslogado");
  const liberadas = PERMISSOES[sessao.perfil];
  $("#quem").textContent = `${sessao.nome} (${ROTULOS[sessao.perfil]})`;
  document.querySelectorAll("#nav button").forEach((b) => { b.hidden = !liberadas.includes(b.dataset.view); });
  $("#novoAluno").hidden = sessao.perfil !== "admin";
  $("#reset").hidden = USAR_API;
  ir(liberadas[0]);
}

function eventos() {
  $("#formLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), erro = $("#loginErro");
    erro.textContent = "";
    try {
      sessao = await API.login(f.get("email").trim(), f.get("senha"));
      sessionStorage.setItem("sessao", JSON.stringify(sessao));
      await iniciar();
    } catch (err) { sessao = null; erro.textContent = err.message; }
  });
  $("#sair").addEventListener("click", sair);

  document.addEventListener("input", (e) => {
    const m = e.target.dataset.mask;
    if (!m) return;
    e.target.value = m === "cpf" ? mascaraCPF(e.target.value) : mascaraTel(e.target.value);
    const v = e.target.value;
    const ok = !v || (m === "cpf" ? validarCPF(v) : validarTel(v));
    e.target.setCustomValidity(ok ? "" : m === "cpf" ? "CPF inválido. Confira os números." : "Telefone inválido. Use DDD e número, como (11) 9 1234-5678.");
  });

  $("#listaEx").innerHTML = EXERCICIOS.map((x) => `<option value="${x}">`).join("");
  const fc = $("#fichaConteudo");
  fc.addEventListener("input", (e) => {
    const d = e.target.dataset;
    if (d.t == null || !d.f) return;
    const t = fichaEdit.treinos[d.t];
    if (d.i == null) t[d.f] = e.target.value; else t.exercicios[+d.i][d.f] = e.target.value;
  });
  fc.addEventListener("change", (e) => {
    if (e.target.id === "tipoFicha") trocarTipo(e.target.value);
    else if (e.target.dataset.ag) fichaEdit.agenda[e.target.dataset.ag] = e.target.value;
  });
  fc.addEventListener("click", (e) => {
    const d = e.target.dataset;
    if (d.addex) { fichaEdit.treinos[d.addex].exercicios.push({ nome: "", series: "3", reps: "12", carga: "", obs: "" }); renderFicha(); }
    if (d.rmex) { const [k, i] = d.rmex.split(":"); fichaEdit.treinos[k].exercicios.splice(+i, 1); renderFicha(); }
    if (e.target.id === "salvarFicha") salvarFicha();
    if (e.target.id === "cancelarFicha") ir("fichas");
  });

  const dlgEq = $("#dlgEquipe");
  $("#novaConta").addEventListener("click", () => { $("#formEquipe").reset(); dlgEq.showModal(); });
  $("#cancelarEq").addEventListener("click", () => dlgEq.close());
  $("#formEquipe").addEventListener("submit", (e) => {
    const f = new FormData(e.target);
    acao(() => API.novoUsuario({ nome: f.get("nome").trim(), email: f.get("email").trim(), senha: f.get("senha"), perfil: f.get("perfil") }), "Conta criada");
  });

  const trocar = (cadastro) => { $("#formLogin").hidden = cadastro; $("#formCadastro").hidden = !cadastro; };
  $("#irCadastro").addEventListener("click", () => trocar(true));
  $("#irLogin").addEventListener("click", () => trocar(false));
  $("#cadPlano").innerHTML = PLANOS.map((p) => `<option value="${p.id}">${p.nome} (${brl(p.valor)}/mês)</option>`).join("");
  $("#formCadastro").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), erro = $("#cadErro");
    erro.textContent = "";
    if (f.get("senha") !== f.get("senha2")) { erro.textContent = "As senhas não são iguais."; return; }
    try {
      if (f.get("lesao") === "sim" && !f.get("lesaoDetalhe").trim()) { erro.textContent = "Descreva a lesão ou o impedimento."; return; }
      sessao = await API.cadastrar(dadosCadastro(f));
      sessionStorage.setItem("sessao", JSON.stringify(sessao));
      await iniciar();
    } catch (err) { sessao = null; erro.textContent = err.message; }
  });
  $("#nav").addEventListener("click", (e) => e.target.dataset.view && ir(e.target.dataset.view));
  $("#busca").addEventListener("input", renderAlunos);
  $("#filtroPag").addEventListener("change", renderPagamentos);
  $("#btnCheckin").addEventListener("click", fazerCheckin);
  $("#idCheckin").addEventListener("keydown", (e) => e.key === "Enter" && fazerCheckin());
  $("#btnMeuCheckin").addEventListener("click", () => estado.alunos[0] && enviarCheckin(estado.alunos[0], $("#msgMeu")));
  $("#reset").addEventListener("click", () => { if (confirm("Apagar os dados atuais e restaurar o exemplo?")) { banco = gerarExemplo(); salvar(); sair(); } });

  document.addEventListener("click", (e) => {
    const d = e.target.dataset;
    if (d.alt) acao(() => API.alternar(+d.alt), "Situação do aluno atualizada");
    if (d.pagar) acao(() => API.pagar(+d.pagar), "Pagamento registrado");
    if (d.ficha) abrirFicha(+d.ficha);
    if (d.msg) enviarWhatsApp(+d.msg);
  });

  const dlg = $("#dlgAluno");
  $("#selPlano").innerHTML = PLANOS.map((p) => `<option value="${p.id}">${p.nome} (${brl(p.valor)}/mês)</option>`).join("");
  $("#novoAluno").addEventListener("click", () => { $("#formAluno").reset(); $("#formAluno").querySelectorAll("[data-mask]").forEach((i) => i.setCustomValidity("")); dlg.showModal(); });
  $("#cancelar").addEventListener("click", () => dlg.close());
  $("#formAluno").addEventListener("submit", (e) => {
    const f = new FormData(e.target);
    const dados = { nome: f.get("nome").trim(), cpf: f.get("cpf").trim(), tel: f.get("tel"), plano: +f.get("plano") };
    acao(() => API.novoAluno(dados), (r) => (r && r.login ? `Aluno cadastrado. Login: ${r.login} / aluno123` : "Aluno cadastrado"));
  });
}

carregar();
eventos();
$("#data").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
$("#dicas").hidden = USAR_API;
try { sessao = JSON.parse(sessionStorage.getItem("sessao")); } catch { sessao = null; }
if (sessao) iniciar().catch(sair);
