"use strict";

/* CONFIGURAÇÃO SUPABASE */
const SUPABASE_URL = "https://kupffquyjyhacochoqic.supabase.co";
const SUPABASE_KEY = "sb_publishable_sOR4e5chT-y5--Tt14VkGA_li_wz0zB";
const INTERNAL_EMAIL_DOMAIN = "@cofi.local";

const $ = id => document.getElementById(id);
const money = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const escapeHTML = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const currentMonth = () => today().slice(0,7);
const number = v => Number(v || 0);
const sum = (rows, f) => rows.reduce((t,r) => t + number(r[f]), 0);

const categories = ["Alimentação","Moradia","Transporte","Saúde","Lazer","Educação","Música","Streaming","Telefonia","Software","Nuvem","Academia","Outros"];

const banks = [
  ["inter","Inter","inter.co"],
  ["santander","Santander","santander.com.br"],
  ["nubank","Nubank","nubank.com.br"],
  ["itau","Itaú","itau.com.br"],
  ["bradesco","Bradesco","banco.bradesco"],
  ["bb","Banco do Brasil","bb.com.br"],
  ["caixa","Caixa","caixa.gov.br"],
  ["c6","C6 Bank","c6bank.com.br"],
  ["tauste","Tauste Pay","tauste.com.br"],
  ["outro","Outro",""]
];

function bankHTML(id) {
  const bank = banks.find(b => b[0] === id) || banks.at(-1);
  const img = bank[2] ? `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(bank[2])}&sz=64" referrerpolicy="no-referrer" alt="" onerror="this.hidden=true">` : "";
  return `<span class="bank">${img}${escapeHTML(bank[1])}</span>`;
}

let client = null, user = null, ready = false, busy = false;
let activePage = "dashboard", dashboardMode = "mensal";
let noticeTimer, charts = {}, state = {};
let editingId = null, editingKey = null;

const chartConfig = { series: ["receitas","compromissos","saldo"], grouping: "mensal", type: "bar" };

const definitions = {
  // CADASTRO
  cartoes: {
    title:"Cartões",
    description:"Cadastre e edite cartões, limite, banco, fechamento e vencimento.",
    fields:[
      ["nome","Nome do cartão","text"],
      ["banco","Banco / emissor","banks"],
      ["limite","Limite","money"],
      ["dia_fechamento","Dia do fechamento","day"],
      ["dia_vencimento","Dia do vencimento","day"]
    ],
    columns:["nome","banco","limite","dia_fechamento","dia_vencimento"]
  },
  pessoas: {
    title:"Pessoas",
    description:"Cadastre nome e vínculo.",
    fields:[["nome","Nome","text"],["status","Vínculo / status","text"]],
    columns:["nome","status"]
  },

  // LANÇAMENTOS — DÍVIDA
  emprestimos: {
    title:"Empréstimos",
    description:"Empréstimo pago (você deve) ou recebido (entrada).",
    fields:[
      ["tipo","Tipo","choice",[["pago","Pago (eu devo)"],["recebido","Recebido (entrada)"]]],
      ["tipo_origem","Origem","choice",[["banco","Banco"],["pessoa","Pessoa"]]],
      ["banco","Banco","banks"],
      ["pessoa_id","Pessoa","people"],
      ["descricao","Descrição","text"],
      ["valor_total","Total contratado a pagar","money"],
      ["quantidade","Quantidade de parcelas","integer"],
      ["parcelas_pagas","Parcelas já pagas","integer"],
      ["mes_inicio","Primeira parcela","month"]
    ],
    columns:["tipo","tipo_origem","banco","pessoa_id","descricao","valor_total","quantidade","parcelas_pagas","mes_inicio","status"]
  },
  parcelas: {
    title:"Compras parceladas",
    description:"Total final dividido em parcelas mensais.",
    fields:[
      ["descricao","Descrição","text"],
      ["valor_total","Total final","money"],
      ["quantidade","Quantidade de parcelas","integer"],
      ["parcelas_pagas","Parcelas já pagas","integer"],
      ["mes_inicio","Primeira parcela","month"],
      ["categoria","Categoria","categories"],
      ["cartao_id","Cartão opcional","cards"]
    ],
    columns:["descricao","valor_total","quantidade","parcelas_pagas","mes_inicio","cartao_id","status"]
  },
  faturas: {
    title:"Faturas",
    description:"Valor da fatura de cada cartão, mês a mês.",
    fields:[
      ["cartao_id","Cartão","cards"],
      ["mes","Mês da fatura","month"],
      ["valor","Valor da fatura","money"],
      ["data_vencimento","Vencimento","date"],
      ["pago","Pago?","choice",[["false","Não"],["true","Sim"]]]
    ],
    columns:["cartao_id","mes","valor","data_vencimento","pago"]
  },
  dividas: {
    title:"Dívidas com pessoas",
    description:"A receber ou a pagar, com vencimento.",
    fields:[
      ["pessoa_id","Pessoa","people"],
      ["tipo","Direção","choice",[["receber","A receber"],["pagar","A pagar"]]],
      ["descricao","Descrição","text"],
      ["valor","Valor","money"],
      ["data","Data de referência","date"],
      ["data_vencimento","Data de vencimento","date"]
    ],
    columns:["pessoa_id","tipo","descricao","valor","data","data_vencimento","pago"]
  },

  // LANÇAMENTOS — GANHO
  ganhos: {
    title:"Ganhos",
    description:"Salário e outras entradas recorrentes.",
    fields:[
      ["tipo","Tipo","choice",[["fixo","Fixo / salário"],["variavel","Variável"]]],
      ["descricao","Descrição","text"],
      ["valor","Valor por mês","money"],
      ["data_inicio","Início","date"],
      ["data_fim","Fim (opcional)","dateOptional"]
    ],
    columns:["descricao","tipo","valor","data_inicio","data_fim"]
  },

  // DESPESAS AVULSAS
  despesas: {
    title:"Despesas",
    description:"Despesas avulsas, com data única.",
    fields:[
      ["descricao","Descrição","text"],
      ["valor","Valor","money"],
      ["data","Data","date"],
      ["categoria","Categoria","categories"],
      ["cartao_id","Cartão opcional","cards"]
    ],
    columns:["descricao","valor","data","categoria","cartao_id"]
  },
  assinaturas: {
    title:"Assinaturas",
    description:"Cobrança mensal recorrente.",
    fields:[
      ["nome","Nome","text"],
      ["categoria","Categoria","categories"],
      ["valor_mensal","Valor mensal","money"],
      ["dia_cobranca","Dia da cobrança","day"],
      ["data_inicio","Início","date"],
      ["data_fim","Fim (opcional)","dateOptional"],
      ["cartao_id","Forma de pagamento","cards"]
    ],
    columns:["nome","categoria","valor_mensal","dia_cobranca","data_inicio","data_fim","cartao_id"]
  },

  // INVESTIMENTO
  reservas: {
    title:"Reservas e investimentos",
    description:"Saldo inicial e aportes.",
    fields:[
      ["nome","Nome","text"],
      ["tipo","Tipo","choice",[["emergencia","Reserva de emergência"],["poupanca","Poupança"],["investimento","Investimento"]]],
      ["banco","Instituição","banks"],
      ["saldo_inicial","Saldo inicial","money"]
    ],
    columns:["nome","tipo","banco","saldo_inicial"]
  },
  aportes: {
    title:"Aportes",
    description:"Aporte pontual em uma reserva.",
    fields:[
      ["reserva_id","Reserva de destino","reserves"],
      ["valor","Valor","money"],
      ["data","Data","date"]
    ],
    columns:["reserva_id","valor","data"]
  },
  limites: {
    title:"Limites por categoria",
    description:"Um teto mensal por categoria.",
    fields:[["categoria","Categoria","categories"],["limite_mensal","Limite mensal","money"]],
    columns:["categoria","limite_mensal"]
  }
};

function notify(msg) {
  $("notice").textContent = msg;
  $("notice").hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $("notice").hidden = true, 6500);
}

function setBusy(v) {
  busy = v;
  document.querySelectorAll("#recordForm button, #recordTable button, #modalForm button").forEach(b => b.disabled = v);
}

function monthIndex(m) {
  const [y,mm] = m.slice(0,7).split("-").map(Number);
  return y*12 + mm - 1;
}
function shiftMonth(m,o) {
  const i = monthIndex(m)+o;
  return `${Math.floor(i/12)}-${String(i%12+1).padStart(2,"0")}`;
}
function monthsBetween(a,b) {
  const c = monthIndex(b)-monthIndex(a);
  if (!Number.isFinite(c)||c<0||c>119) throw new Error("Período inválido (máx 120 meses).");
  return Array.from({length:c+1},(_,i)=>shiftMonth(a,i));
}
function monthlyPart(row,m) {
  const off = monthIndex(m)-monthIndex(row.mes_inicio);
  if (off<0||off>=row.quantidade) return 0;
  const cents = Math.round(number(row.valor_total)*100);
  const base = Math.floor(cents/row.quantidade);
  const rem = cents%row.quantidade;
  return (base+(off<rem?1:0))/100;
}
function reserveBalance(row,m) {
  return number(row.saldo_inicial)+state.aportes
    .filter(a=>a.reserva_id===row.id && a.data.slice(0,7)<=m)
    .reduce((t,a)=>t+number(a.valor),0);
}

/* Recorrência: respeita data_inicio e data_fim */
function recorrenteAtivo(row,month) {
  const inicio = row.data_inicio ? row.data_inicio.slice(0,7) : null;
  const fim = row.data_fim ? row.data_fim.slice(0,7) : null;
  if (inicio && month < inicio) return false;
  if (fim && month > fim) return false;
  return true;
}

function monthly(m) {
  const receitasGanhos = state.ganhos
    .filter(r => recorrenteAtivo(r,m))
    .reduce((s,r)=>s+number(r.valor),0);

  const emprestimosRecebidos = state.emprestimos
    .filter(r => r.tipo==="recebido")
    .reduce((s,r)=>s+monthlyPart(r,m),0);

  const receitas = receitasGanhos + emprestimosRecebidos;

  const despesas = sum(state.despesas.filter(r=>r.data.startsWith(m)),"valor");

  const parcelas = state.parcelas.reduce((s,r)=>s+monthlyPart(r,m),0);
  const emprestimosPagos = state.emprestimos
    .filter(r => r.tipo==="pago")
    .reduce((s,r)=>s+monthlyPart(r,m),0);

  const assinaturas = state.assinaturas
    .filter(r => recorrenteAtivo(r,m))
    .reduce((s,r)=>s+number(r.valor_mensal),0);

  const faturas = sum(state.faturas.filter(r=>r.mes.startsWith(m)),"valor");

  const compromissos = despesas+parcelas+emprestimosPagos+assinaturas+faturas;
  const aportes = sum(state.aportes.filter(r=>r.data.startsWith(m)),"valor");
  const reservas = state.reservas.reduce((s,r)=>s+reserveBalance(r,m),0);

  return {receitas,despesas,parcelas,emprestimos:emprestimosPagos,emprestimosRecebidos,assinaturas,faturas,compromissos,saldo:receitas-compromissos,aportes,reservas};
}

function categoryTotals(months) {
  const t = {};
  const add = (c,v)=>{const k=c||"Outros";t[k]=(t[k]||0)+v;};
  months.forEach(m=>{
    state.despesas.filter(r=>r.data.startsWith(m)).forEach(r=>add(r.categoria,number(r.valor)));
    state.parcelas.forEach(r=>add(r.categoria,monthlyPart(r,m)));
    state.emprestimos.filter(r=>r.tipo==="pago").forEach(r=>add("Empréstimos",monthlyPart(r,m)));
    state.assinaturas.filter(r=>recorrenteAtivo(r,m)).forEach(r=>add(r.categoria,number(r.valor_mensal)));
    state.faturas.filter(r=>r.mes.startsWith(m)).forEach(r=>add("Fatura",number(r.valor)));
  });
  return t;
}
function debtTotal(type,person) {
  return state.dividas.filter(r=>!r.pago&&r.tipo===type&&(!person||r.pessoa_id===person))
    .reduce((t,r)=>t+number(r.valor),0);
}

/* Dias de atraso — parcelas e empréstimos */
function diasAtraso(mesVencimento, parcelasPagas) {
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}`;
  const proximaVencida = monthIndex(mesVencimento) + number(parcelasPagas);
  const mesVenc = monthIndex(mesAtual);
  if (proximaVencida >= mesVenc) return 0;
  return (mesVenc - proximaVencida) * 30;
}

function statusParcela(row) {
  const pagas = number(row.parcelas_pagas);
  const total = number(row.quantidade);
  if (pagas >= total) return "Quitado";
  const atraso = diasAtraso(row.mes_inicio, pagas);
  return atraso > 0 ? `Em atraso (${atraso} dias)` : "Em dia";
}

/* Dias de atraso — dívidas */
function diasAtrasoDivida(row) {
  if(row.pago||!row.data_vencimento)return 0;
  const hoje=new Date();
  const venc=new Date(row.data_vencimento);
  const diff=Math.floor((hoje-venc)/(1000*60*60*24));
  return diff>0?diff:0;
}

function tableHTML(headers,rows) {
  if (!rows.length) return '<div class="empty">Nenhum registro.</div>';
  return `<table><thead><tr>${headers.map(h=>`<th>${escapeHTML(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function cardsHTML(items) {
  return items.map(([l,v,t])=>`<div class="glass card"><span>${escapeHTML(l)}</span><strong class="${t||""}">${escapeHTML(v)}</strong></div>`).join("");
}
function drawChart(id,type,labels,datasets) {
  if (!window.Chart) return;
  if (charts[id]) charts[id].destroy();
  const isD = type==="doughnut";
  charts[id] = new Chart($(id),{
    type, data:{labels,datasets},
    options:{
      responsive:true, maintainAspectRatio:false, animation:false,
      interaction:{mode:"index",intersect:false},
      plugins:{
        legend:{labels:{color:"#dbeafe",usePointStyle:true}},
        tooltip:{callbacks:{label:c=>{const v=typeof c.raw==="number"?c.raw:c.parsed.y;return `${c.dataset.label||c.label}: ${money(v)}`;}}}
      },
      scales:isD?{}:{x:{ticks:{color:"#a3b5ce"},grid:{color:"#ffffff08"}},y:{ticks:{color:"#a3b5ce",callback:v=>money(v)},grid:{color:"#ffffff12"}}}
    }
  });
}
const colors = ["#7fc8ff","#5ee6b0","#ff91a0","#c4a7ff","#ffd18c","#66d7e5"];

function renderDashboard() {
  const ref = $("referenceMonth").value || currentMonth();
  const months = dashboardMode==="anual" ? monthsBetween(`${ref.slice(0,4)}-01`,`${ref.slice(0,4)}-12`) : [ref];
  const totals = months.reduce((a,m)=>{const v=monthly(m);["receitas","despesas","parcelas","emprestimos","emprestimosRecebidos","assinaturas","faturas","compromissos","saldo","aportes"].forEach(k=>a[k]=(a[k]||0)+v[k]);return a;},{});
  $("dashboardCards").innerHTML = cardsHTML([
    ["Ganhos recebidos",money(totals.receitas),"positive"],
    ["Compromissos previstos",money(totals.compromissos),"negative"],
    ["Resultado previsto",money(totals.saldo),totals.saldo>=0?"positive":"negative"],
    ["Despesas avulsas",money(totals.despesas)],
    ["Compras parceladas",money(totals.parcelas)],
    ["Empréstimos pagos",money(totals.emprestimos)],
    ["Empréstimos recebidos",money(totals.emprestimosRecebidos),"positive"],
    ["Assinaturas previstas",money(totals.assinaturas)],
    ["Faturas",money(totals.faturas)],
    ["Aportes no período",money(totals.aportes)],
    ["Reservas até o mês",money(monthly(ref).reservas),"positive"],
    ["A receber em aberto",money(debtTotal("receber")),"positive"],
    ["A pagar em aberto",money(debtTotal("pagar")),"negative"],
    ["Pessoas cadastradas",String(state.pessoas.length)]
  ]);
  const cm = dashboardMode==="anual"?months:monthsBetween(shiftMonth(ref,-3),shiftMonth(ref,6));
  drawChart("cashChart","bar",cm,[
    {label:"Recebido",data:cm.map(m=>monthly(m).receitas),backgroundColor:colors[1]},
    {label:"Compromissos",data:cm.map(m=>monthly(m).compromissos),backgroundColor:colors[2]}
  ]);
  const cd = categoryTotals(months);
  drawChart("categoryChart","doughnut",Object.keys(cd),[{label:"Compromissos",data:Object.values(cd),backgroundColor:colors}]);
  drawChart("reserveChart","bar",state.reservas.map(r=>r.nome),[{label:"Saldo + aportes",data:state.reservas.map(r=>reserveBalance(r,ref)),backgroundColor:colors[0]}]);
  drawChart("peopleChart","bar",state.pessoas.map(p=>p.nome),[
    {label:"A receber",data:state.pessoas.map(p=>debtTotal("receber",p.id)),backgroundColor:colors[1]},
    {label:"A pagar",data:state.pessoas.map(p=>debtTotal("pagar",p.id)),backgroundColor:colors[2]}
  ]);
  $("monthDetails").innerHTML = tableHTML(["Mês","Recebido","Compromissos","Resultado"],cm.map(m=>{const v=monthly(m);return [m,money(v.receitas),money(v.compromissos),money(v.saldo)];}));
}

function renderAdvanced() {
  try {
    const months = monthsBetween($("chartStart").value,$("chartEnd").value);
    const buckets = new Map();
    months.forEach(m=>{
      const k = chartConfig.grouping==="anual"?m.slice(0,4):m;
      if (!buckets.has(k)) buckets.set(k,{});
      const b = buckets.get(k), v = monthly(m);
      chartConfig.series.forEach(s=>{b[s]=s==="reservas"?v[s]:(b[s]||0)+v[s];});
    });
    const entries = [...buckets];
    const datasets = chartConfig.series.map((k,i)=>({label:k,data:entries.map(([,v])=>v[k]),borderColor:colors[i%colors.length],backgroundColor:colors[i%colors.length],tension:.25}));
    drawChart("advancedChart",chartConfig.type,entries.map(([k])=>k),datasets);
    $("advancedCards").innerHTML = cardsHTML(chartConfig.series.map(k=>{
      const vals=entries.map(([,r])=>r[k]);
      const res=k==="reservas"?vals.at(-1):vals.reduce((a,b)=>a+b,0);
      return [k==="reservas"?"Reservas no fim":"Total: "+k,money(res)];
    }));
    $("advancedTable").innerHTML=tableHTML(["Período",...chartConfig.series],entries.map(([p,v])=>[p,...chartConfig.series.map(k=>money(v[k]))]));
  } catch(e){ notify(e.message); }
}

function optionGroup(container,items,current,onChange,multiple=false) {
  container.replaceChildren();
  items.forEach(([v,l])=>{
    const b=document.createElement("button");
    b.type="button"; b.textContent=l;
    const active=multiple?current.includes(v):current===v;
    b.classList.toggle("active",active);
    b.setAttribute("aria-pressed",String(active));
    b.onclick=()=>onChange(v);
    container.append(b);
  });
}

function renderChartControls() {
  optionGroup($("seriesOptions"),["receitas","despesas","parcelas","emprestimos","emprestimosRecebidos","assinaturas","faturas","compromissos","saldo","aportes","reservas"].map(v=>[v,v]),chartConfig.series,v=>{
    if(chartConfig.series.includes(v)){if(chartConfig.series.length>1)chartConfig.series=chartConfig.series.filter(x=>x!==v);}
    else chartConfig.series.push(v);
    renderChartControls();
  },true);
  optionGroup($("groupOptions"),[["mensal","Mensal"],["anual","Anual"]],chartConfig.grouping,v=>{chartConfig.grouping=v;renderChartControls();});
  optionGroup($("typeOptions"),[["bar","Barras"],["line","Linhas"]],chartConfig.type,v=>{chartConfig.type=v;renderChartControls();});
  optionGroup($("dashboardMode"),[["mensal","Mês"],["anual","Ano calendário"]],dashboardMode,v=>{dashboardMode=v;renderChartControls();renderDashboard();});
}

/* Navegação hierárquica */
const navStructure = [
  { label:"Lançamentos", children:[
    { label:"Dívida", pages:[
      ["emprestimos","Empréstimos"],
      ["parcelas","Compras"],
      ["faturas","Faturas"],
      ["dividas","Dívidas"]
    ]},
    { label:"Ganho", pages:[
      ["ganhos","Salário / Ganhos"],
      ["despesas","Despesas"]
    ]}
  ]},
  { label:"Cadastro", children:[
    { label:"Pessoa", pages:[["pessoas","Pessoas"]]},
    { label:"Cartão", pages:[["cartoes","Cartões"]]}
  ]},
  { label:"Investimento", children:[
    { label:"Reservas", pages:[["reservas","Reservas"],["aportes","Aportes"]]},
    { label:"Limites", pages:[["limites","Limites"]]}
  ]},
  { label:"Visualização", children:[
    { label:"Dashboard", pages:[["dashboard","Dashboard"]]},
    { label:"Gráficos", pages:[["advanced","Gráficos"]]}
  ]}
];

function buildNavigation() {
  const nav=$("navigation");
  nav.replaceChildren();

  navStructure.forEach(group=>{
    const groupBtn=document.createElement("button");
    groupBtn.textContent=group.label;
    groupBtn.className="nav-group";
    groupBtn.onclick=()=>{
      // toggle submenu
      const existing=nav.querySelector(".submenu");
      if(existing) existing.remove();
      const sub=document.createElement("div");
      sub.className="submenu";
      group.children.forEach(child=>{
        const childBtn=document.createElement("button");
        childBtn.textContent=child.label;
        childBtn.className="nav-subgroup";
        childBtn.onclick=()=>{
          // show pages
          const pagesDiv=document.createElement("div");
          pagesDiv.className="submenu";
          child.pages.forEach(([page,label])=>{
            const p=document.createElement("button");
            p.textContent=label;
            p.dataset.page=page;
            p.onclick=()=>navigate(page);
            pagesDiv.append(p);
          });
          sub.replaceChildren(pagesDiv);
        };
        sub.append(childBtn);
      });
      nav.append(sub);
    };
    nav.append(groupBtn);
  });
}

function navigate(page) {
  activePage=page;
  // highlight active page button if visible
  document.querySelectorAll("#navigation button[data-page]").forEach(b=>{
    b.classList.toggle("active",b.dataset.page===page);
  });
  $("dashboard").hidden=page!=="dashboard";
  $("advanced").hidden=page!=="advanced";
  $("records").hidden=page==="dashboard"||page==="advanced";
  if(page==="dashboard")renderDashboard();
  else if(page==="advanced")renderAdvanced();
  else renderRecords(page);
}

function fieldOptions(type,extra) {
  if(type==="choice")return extra;
  if(type==="categories")return categories.map(c=>[c,c]);
  if(type==="banks")return banks.map(b=>[b[0],b[1]]);
  if(type==="cards")return [["","Sem cartão"],...state.cartoes.map(r=>[r.id,r.nome])];
  if(type==="reserves")return state.reservas.map(r=>[r.id,r.nome]);
  if(type==="people")return state.pessoas.map(r=>[r.id,`${r.nome} — ${r.status||"Contato"}`]);
  return null;
}

/* Dropdown customizado — lista renderizada no body (portal) */
function createDropdown(name,label,options,currentValue) {
  const wrap=document.createElement("div");
  wrap.className="dropdown";
  wrap.innerHTML=`
    <label>${escapeHTML(label)}</label>
    <button type="button" class="dropdown-toggle">
      <span class="label"></span>
      <span class="arrow">▾</span>
    </button>
    <input type="hidden" name="${name}" value="${escapeHTML(currentValue ?? options[0]?.[0] ?? "")}">`;

  const toggle=wrap.querySelector(".dropdown-toggle");
  const labelSpan=wrap.querySelector(".label");
  const hidden=wrap.querySelector("input[type=hidden]");

  const list=document.createElement("div");
  list.className="dropdown-list";
  document.body.append(list);

  function positionList() {
    const rect=toggle.getBoundingClientRect();
    list.style.left=`${rect.left}px`;
    list.style.top=`${rect.bottom+4}px`;
    list.style.width=`${rect.width}px`;
  }

  function paint() {
    const current=options.find(o=>o[0]===hidden.value);
    labelSpan.textContent=current?current[1]:"Selecione";
    list.querySelectorAll(".dropdown-item").forEach(item=>{
      item.classList.toggle("selected",item.dataset.value===hidden.value);
    });
  }

  options.forEach(([v,l])=>{
    const item=document.createElement("button");
    item.type="button";
    item.className="dropdown-item";
    item.dataset.value=v;
    item.textContent=l;
    item.onclick=()=>{
      hidden.value=v;
      closeAllDropdowns();
      paint();
    };
    list.append(item);
  });

  function open() {
    closeAllDropdowns();
    positionList();
    list.classList.add("open");
    wrap.classList.add("open");
  }

  function close() {
    list.classList.remove("open");
    wrap.classList.remove("open");
  }

  toggle.onclick=e=>{
    e.stopPropagation();
    list.classList.contains("open")?close():open();
  };

  document.addEventListener("click",e=>{
    if(!wrap.contains(e.target)&&!list.contains(e.target))close();
  });
  document.addEventListener("scroll",()=>{if(list.classList.contains("open"))positionList();},true);
  window.addEventListener("resize",()=>{if(list.classList.contains("open"))positionList();});

  function closeAllDropdowns() {
    document.querySelectorAll(".dropdown-list.open").forEach(l=>l.classList.remove("open"));
    document.querySelectorAll(".dropdown.open").forEach(d=>d.classList.remove("open"));
  }

  paint();
  return wrap;
}

function renderRecords(key) {
  editingKey=key; editingId=null;
  const def=definitions[key];
  $("recordTitle").textContent=def.title;
  $("recordDescription").textContent=def.description;
  const form=$("recordForm");
  form.replaceChildren();
  const fields=document.createElement("div");
  fields.className="fields";
  form.append(fields);

  def.fields.forEach(([name,label,type,extra])=>{
    const options=fieldOptions(type,extra);
    if(options) {
      fields.append(createDropdown(name,label,options,""));
    } else {
      const wrap=document.createElement("label");
      wrap.textContent=label;
      const input=document.createElement("input");
      input.name=name;
      input.required = type!=="dateOptional";
      if(["money","nonnegative","integer","day"].includes(type)) {
        input.type="number";
        input.step=["integer","day"].includes(type)?"1":"0.01";
        if(type==="day") input.max="31";
        if(type==="integer") input.min="1";
      } else input.type=type;
      if(type==="date") input.value=today();
      if(type==="month") input.value=currentMonth();
      wrap.append(input);
      fields.append(wrap);
    }
  });

  const submit=document.createElement("button");
  submit.type="submit"; submit.className="primary";
  submit.textContent="Salvar no banco";
  form.append(submit);
  form.onsubmit=e=>{e.preventDefault();saveRecord(key,form);};

  renderRecordTable(key);
}

function formatCell(column,row) {
  const v=row[column];
  if(column==="banco")return bankHTML(v);
  if(column==="pago")return row.pago?"Paga":"Em aberto";
  if(column==="status")return statusParcela(row);
  if(column==="tipo")return v==="recebido"?"Recebido":"Pago";
  if(column==="tipo_origem")return v==="pessoa"?"Pessoa":"Banco";
  if(column==="cartao_id")return escapeHTML(state.cartoes.find(r=>r.id===v)?.nome||"Sem cartão");
  if(column==="reserva_id")return escapeHTML(state.reservas.find(r=>r.id===v)?.nome||"Reserva");
  if(column==="pessoa_id")return escapeHTML(state.pessoas.find(r=>r.id===v)?.nome||"—");
  if(column==="data_vencimento"){
    const atraso=diasAtrasoDivida(row);
    return `${escapeHTML(row.data_vencimento||"-")}${atraso>0?` <span class="negative">(${atraso} dias)</span>`:""}`;
  }
  if(column==="data_fim")return v?escapeHTML(v):"Sem fim";
  if(["valor","valor_total","valor_mensal","limite","limite_mensal","saldo_inicial"].includes(column))return money(v);
  return escapeHTML(v);
}

function renderRecordTable(key) {
  const def=definitions[key];
  $("recordTable").innerHTML=tableHTML(
    [...def.columns,"Ações"],
    state[key].map(row=>{
      let actions=`<button data-edit="${row.id}">Editar</button> <button class="danger" data-delete="${row.id}">Excluir</button>`;
      if(key==="dividas")
        actions=`<button data-paid="${row.id}">${row.pago?"Reabrir":"Marcar quitada"}</button> ${actions}`;
      if(key==="faturas")
        actions=`<button data-paid="${row.id}">${row.pago?"Reabrir":"Marcar paga"}</button> ${actions}`;
      if(key==="parcelas"||key==="emprestimos")
        actions=`<button data-pay="${row.id}">+1 paga</button> ${actions}`;
      return [...def.columns.map(c=>formatCell(c,row)),actions];
    })
  );
  $("recordTable").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openEditModal(key,b.dataset.edit));
  $("recordTable").querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteRecord(key,b.dataset.delete));
  $("recordTable").querySelectorAll("[data-paid]").forEach(b=>b.onclick=()=>{
    if(activePage==="faturas")toggleFaturaPaga(b.dataset.paid);
    else togglePaid(b.dataset.paid);
  });
  $("recordTable").querySelectorAll("[data-pay]").forEach(b=>b.onclick=()=>marcarParcelaPaga(key,b.dataset.pay));
}

/* Modal de edição */
function openEditModal(key,id) {
  const row=state[key].find(r=>r.id===id);
  if(!row)return;
  editingId=id; editingKey=key;

  const def=definitions[key];
  $("modalTitle").textContent=`Editar: ${def.title}`;

  const form=$("modalForm");
  form.replaceChildren();
  const fields=document.createElement("div");
  fields.className="fields";
  form.append(fields);

  def.fields.forEach(([name,label,type,extra])=>{
    const options=fieldOptions(type,extra);
    if(options) {
      fields.append(createDropdown(name,label,options,row[name]??""));
    } else {
      const wrap=document.createElement("label");
      wrap.textContent=label;
      const input=document.createElement("input");
      input.name=name;
      input.required = type!=="dateOptional";
      if(["money","nonnegative","integer","day"].includes(type)) {
        input.type="number";
        input.step=["integer","day"].includes(type)?"1":"0.01";
        if(type==="day") input.max="31";
        if(type==="integer") input.min="1";
      } else input.type=type;
      input.value=row[name]??"";
      wrap.append(input);
      fields.append(wrap);
    }
  });

  const submit=document.createElement("button");
  submit.type="submit"; submit.className="primary";
  submit.textContent="Salvar alterações";
  form.append(submit);
  form.onsubmit=e=>{e.preventDefault();saveModalRecord(key,form);};

  $("editModal").hidden=false;
}

function closeEditModal() {
  $("editModal").hidden=true;
  editingId=null; editingKey=null;
}

async function saveModalRecord(key,form) {
  if(!ready||busy||!user)return;
  const payload=Object.fromEntries(new FormData(form));
  payload.user_id=user.id;

  definitions[key].fields.forEach(([name,,type])=>{
    if(["money","nonnegative","integer","day"].includes(type))
      payload[name]=Number(payload[name]);
    if(type==="cards"&&!payload[name])payload[name]=null;
    if(type==="month")payload[name]+="-01";
    if(type==="dateOptional"&&!payload[name])payload[name]=null;
    if(type==="choice"&&name==="pago")payload[name]=payload[name]==="true";
  });

  if(key==="ganhos")payload.meses=[];
  if(key==="dividas")payload.pago=payload.pago||false;
  if(key==="emprestimos"){
    if(payload.tipo_origem==="pessoa")payload.banco=null;
    if(payload.tipo_origem==="banco")payload.pessoa_id=null;
  }

  setBusy(true);
  try {
    const {error}=await client.from("COFI_"+key)
      .update(payload).eq("id",editingId).eq("user_id",user.id);
    if(error)throw error;
    closeEditModal();
    await loadData();
    renderRecordTable(key);
    notify("Alterações salvas.");
  } catch(e){notify(e.message);}
  finally{setBusy(false);}
}

async function saveRecord(key,form) {
  if(!ready||busy||!user)return;
  const payload=Object.fromEntries(new FormData(form));
  payload.user_id=user.id;

  definitions[key].fields.forEach(([name,,type])=>{
    if(["money","nonnegative","integer","day"].includes(type))
      payload[name]=Number(payload[name]);
    if(type==="cards"&&!payload[name])payload[name]=null;
    if(type==="month")payload[name]+="-01";
    if(type==="dateOptional"&&!payload[name])payload[name]=null;
    if(type==="choice"&&name==="pago")payload[name]=payload[name]==="true";
  });

  if(key==="ganhos")payload.meses=[];
  if(key==="dividas")payload.pago=payload.pago||false;
  if(key==="emprestimos"){
    if(payload.tipo_origem==="pessoa")payload.banco=null;
    if(payload.tipo_origem==="banco")payload.pessoa_id=null;
  }

  if((key==="aportes"&&!payload.reserva_id)||(key==="dividas"&&!payload.pessoa_id))
    return notify("Selecione o vínculo antes de salvar.");
  if(key==="emprestimos"&&payload.tipo_origem==="pessoa"&&!payload.pessoa_id)
    return notify("Selecione a pessoa do empréstimo.");
  if(key==="faturas"&&!payload.cartao_id)
    return notify("Selecione o cartão da fatura.");

  setBusy(true);
  try {
    let query;
    if(editingId&&editingKey===key)query=client.from("COFI_"+key).update(payload).eq("id",editingId).eq("user_id",user.id);
    else if(key==="limites")query=client.from("COFI_limites").upsert(payload,{onConflict:"user_id,categoria"});
    else query=client.from("COFI_"+key).insert(payload);
    const {error}=await query;
    if(error)throw error;
    editingId=null;
    await loadData();
    renderRecords(key);
    notify("Registro salvo.");
  } catch(e){notify(e.message);}
  finally{setBusy(false);}
}

async function deleteRecord(key,id) {
  if(busy||!ready)return;
  if(!confirm("Excluir este registro?"))return;
  setBusy(true);
  try{
    const {error}=await client.from("COFI_"+key).delete().eq("id",id).eq("user_id",user.id);
    if(error)throw error;
    await loadData();
    renderRecordTable(key);
    notify("Registro excluído.");
  }catch(e){notify(e.message);}
  finally{setBusy(false);}
}

async function togglePaid(id) {
  if(busy||!ready)return;
  const row=state.dividas.find(r=>r.id===id);
  setBusy(true);
  try{
    const {error}=await client.from("COFI_dividas").update({pago:!row.pago}).eq("id",id).eq("user_id",user.id);
    if(error)throw error;
    await loadData();
    renderRecordTable("dividas");
    notify(row.pago?"Dívida reaberta.":"Dívida quitada.");
  }catch(e){notify(e.message);}
  finally{setBusy(false);}
}

async function toggleFaturaPaga(id) {
  if(busy||!ready)return;
  const row=state.faturas.find(r=>r.id===id);
  setBusy(true);
  try{
    const {error}=await client.from("COFI_faturas").update({pago:!row.pago}).eq("id",id).eq("user_id",user.id);
    if(error)throw error;
    await loadData();
    renderRecordTable("faturas");
    notify(row.pago?"Fatura reaberta.":"Fatura marcada como paga.");
  }catch(e){notify(e.message);}
  finally{setBusy(false);}
}

async function marcarParcelaPaga(key,id) {
  if(busy||!ready)return;
  const row=state[key].find(r=>r.id===id);
  const pagas=number(row.parcelas_pagas);
  if(pagas>=number(row.quantidade))return notify("Todas as parcelas já estão quitadas.");
  setBusy(true);
  try{
    const {error}=await client.from("COFI_"+key)
      .update({parcelas_pagas:pagas+1})
      .eq("id",id).eq("user_id",user.id);
    if(error)throw error;
    await loadData();
    renderRecordTable(key);
    notify("Parcela marcada como paga.");
  }catch(e){notify(e.message);}
  finally{setBusy(false);}
}

async function fetchAll(key) {
  const result=[];
  for(let o=0;;o+=1000){
    const {data:rows,error}=await client.from("COFI_"+key).select("*").eq("user_id",user.id).order("id").range(o,o+999);
    if(error)throw new Error(`${key}: ${error.message}`);
    result.push(...rows);
    if(rows.length<1000)return result;
  }
}

async function loadData() {
  ready=false;
  const next={};
  await Promise.all(Object.keys(definitions).map(async k=>{next[k]=await fetchAll(k);}));
  state=next; ready=true;
}

async function openSession(session) {
  ready=false; user=session.user;
  $("login").hidden=true; $("app").hidden=false;
  const meta=user.user_metadata||{};
  $("account").textContent=`Olá, ${meta.nome||meta.username||"usuário"}`;
  await loadData();
  buildNavigation();
  renderChartControls();
  navigate("dashboard");
}

function closeSession() {
  ready=false; user=null; state={};
  Object.values(charts).forEach(c=>c.destroy());
  charts={};
  $("app").hidden=true; $("login").hidden=false;
  $("password").value=""; $("account").textContent="Olá";
}

$("loginForm").onsubmit=async e=>{
  e.preventDefault();
  if(!client)return;
  const username=$("username").value.trim().toLowerCase().replace(/[^a-z0-9._-]/g,"");
  if(!username){$("loginMessage").textContent="Informe o nome de usuário.";return;}
  $("loginButton").disabled=true;
  $("loginMessage").textContent="Entrando…";
  try{
    const {data,error}=await client.auth.signInWithPassword({email:`${username}${INTERNAL_EMAIL_DOMAIN}`,password:$("password").value});
    if(error)throw error;
    $("password").value="";
    await openSession(data.session);
    $("loginMessage").textContent="";
  }catch(err){$("loginMessage").textContent="Usuário ou senha inválidos.";}
  finally{$("loginButton").disabled=false;}
};

$("logoutButton").onclick=async()=>{
  if(busy)return notify("Aguarde o salvamento terminar.");
  const {error}=await client.auth.signOut();
  if(error)return notify(error.message);
  closeSession();
};

$("referenceMonth").value=currentMonth();
$("referenceMonth").onchange=()=>{if(ready)renderDashboard();};
$("chartStart").value=shiftMonth(currentMonth(),-11);
$("chartEnd").value=currentMonth();
$("applyCharts").onclick=()=>{if(ready)renderAdvanced();};
$("downloadChart").onclick=()=>{
  if(!charts.advancedChart)return;
  const a=document.createElement("a");
  a.href=charts.advancedChart.toBase64Image();
  a.download="grafico.png";
  a.click();
};

$("modalClose").onclick=closeEditModal;
$("editModal").querySelector(".modal-backdrop").onclick=closeEditModal;
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&!$("editModal").hidden)closeEditModal();
});

async function initialize() {
  if(!window.supabase){$("loginMessage").textContent="Não foi possível carregar o Supabase.";$("loginButton").disabled=true;return;}
  client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  client.auth.onAuthStateChange(e=>{if(e==="SIGNED_OUT")closeSession();});
  try{
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    if(data.session)await openSession(data.session);
  }catch(e){$("loginMessage").textContent=e.message;}
}

initialize();