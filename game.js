// ====== DATOS (se cargan desde /data) ======
let NEGOCIOS = [], RESIDENTES = {}, EVENTOS = [], FRASE_TAG = {};

// ====== CONFIG ======
const DURACION_DIA = 12;                 // segundos reales que dura un día
const EVENTOS_POR_DIA = [2, 4];          // mínimo y máximo
const PESOS = { verde: 5, amarillo: 3, rojo: 1 };
const pendientes = () => Object.values(eventos).filter((e) => e.estado === "nuevo").length;
const NOMBRE_NIVEL = { verde: "Casual", amarillo: "Importante", rojo: "Urgente", gris: "Visto" };

// ====== GRILLA ======
// 0 1 2
// 3 4 5
// 6 7 8
const TIPOS = ["negocio", "casa", "negocio", "casa", "plaza", "casa", "negocio", "casa", "negocio"];
const VECINOS = { 0: [1, 3], 1: [0, 2], 2: [1, 5], 3: [0, 6], 4: [1, 3, 5, 7], 5: [2, 8], 6: [3, 7], 7: [6, 8], 8: [5, 7] };

// ====== ESTADO ======
let ciudad = [];
let relaciones = {};  // "r1|r3" -> -100 a 100 (0 = recién conocidos)
let eventos = {};      // lugar -> evento activo { ev, nivel, estado: "nuevo" | "visto" | "resuelto", ... }
let elegido = null;
let historial = [];
let filtro = null;   // { tipo: "r" | "l", id, nombre } mientras se mira el historial de alguien o algún lugar
let ultimoId = null;
let dia = 1, reloj = 0, agenda = [];
let pausado = false, bloqueado = false;

// ====== HELPERS ======
const azar = (lista) => lista[Math.floor(Math.random() * lista.length)];
const mezclar = (lista) => [...lista].sort(() => Math.random() - 0.5);
const tieneTodo = (tags, requeridos = []) => requeridos.every((t) => tags.includes(t));
const todosLosResidentes = () => ciudad.filter((l) => l.tipo === "casa").flatMap((l) => l.residentes);
const esInteres = (t) => (RESIDENTES.intereses || []).includes(t);
const esPersonalidad = (t) => (RESIDENTES.personalidad || []).includes(t);
const esNivelado = esInteres;   // solo los intereses/habilidades tienen nivel 1-5; la personalidad son casillas
const nombreTag = (t) => t.replace(/_/g, " ");
const NIVEL_MAX = 5;
const nivelesIniciales = (tags) => Object.fromEntries(tags.filter(esNivelado).map((t) => [t, 1 + Math.floor(Math.random() * 3)]));
const ocupado = (i) => eventos[i] && eventos[i].estado === "nuevo";

// ====== RELACIONES ======
const claveRel = (a, b) => [a.id, b.id].sort().join("|");
const getRel = (a, b) => relaciones[claveRel(a, b)] ?? 0;
function etiquetaRel(v) {
  if (v <= -60) return { nombre: "enemigos", emoji: "🤬" };
  if (v <= -30) return { nombre: "peleados", emoji: "😠" };
  if (v < -10) return { nombre: "tensos", emoji: "😒" };
  if (v <= 10) return { nombre: "recién conocidos", emoji: "👋" };
  if (v < 40) return { nombre: "conocidos", emoji: "🙂" };
  if (v < 70) return { nombre: "amigos", emoji: "💚" };
  return { nombre: "inseparables", emoji: "💞" };
}
const FRASE_REL = { enemigos: "ahora son enemigos", peleados: "ahora están peleados", tensos: "ahora están tensos",
  "recién conocidos": "vuelven a ser casi desconocidos", conocidos: "ahora se llevan normal",
  amigos: "ahora son amigos", inseparables: "ahora son inseparables" };

// ====== CONSECUENCIAS ======
const frase = (tag) => FRASE_TAG[tag] || `tiene «${tag}»`;
const conA = (nombre, f) => (f.startsWith("le ") ? `a ${nombre} ${f}` : `${nombre} ${f}`);

function aplicarConsecuencias(inst, c = {}) {
  const msgs = [];
  const sub = (tags = []) => tags.map((t) => (t === "$interes" ? inst.interes : t));
  const agregar = (quien, tags) => sub(tags).forEach((t) => {
    if (esPersonalidad(t)) { if (!quien.tags.includes(t)) cambiarRasgo(quien, azar(quien.secundarios), t); return; }
    if (quien.tags.includes(t)) { if (esNivelado(t)) cambiarNivel(quien, [t], 1); return; }   // ya lo tenía: sube de nivel
    quien.tags.push(t);
    if (esNivelado(t)) quien.niveles[t] = 1;
    msgs.push(`✨ Ahora ${conA(quien.nombre, frase(t))}`);
  });
  const quitar = (quien, tags) => sub(tags).forEach((t) => {
    if (esPersonalidad(t)) {   // la casilla nunca queda vacía: se sortea otro rasgo; el principal no se toca
      if (!quien.secundarios.includes(t)) return;
      cambiarRasgo(quien, t, azar(RESIDENTES.personalidad.filter((x) => !quien.tags.includes(x))));
      return;
    }
    if (!quien.tags.includes(t)) return;
    quien.tags = quien.tags.filter((x) => x !== t);
    delete quien.niveles[t];
    const f = conA(quien.nombre, frase(t)).replace(" le ", " ya no le ");
    const txt = f.includes("ya no") ? f : f.replace(quien.nombre, quien.nombre + " ya no");
    msgs.push(`💨 ${txt[0].toUpperCase() + txt.slice(1)}`);
  });
  const cambiarRasgo = (quien, viejo, nuevo) => {
    quien.tags = quien.tags.map((x) => (x === viejo ? nuevo : x));
    quien.secundarios = quien.secundarios.map((x) => (x === viejo ? nuevo : x));
    msgs.push(`🔄 ${quien.nombre} cambió: ${nombreTag(viejo)} → ${nombreTag(nuevo)}`);
  };
  const cambiarNivel = (quien, tags, delta) => sub(tags).forEach((t) => {
    if (!quien.tags.includes(t)) return;
    const antes = quien.niveles[t] || 1, despues = Math.max(1, Math.min(NIVEL_MAX, antes + delta));   // bajar nunca la borra: queda "oxidada" en 1
    if (despues === antes) return;
    quien.niveles[t] = despues;
    msgs.push(`${delta > 0 ? "📈" : "📉"} ${quien.nombre}: ${nombreTag(t)} nivel ${despues}`);
  });
  agregar(inst.residente, c.residente_agrega);
  quitar(inst.residente, c.residente_quita);
  cambiarNivel(inst.residente, c.residente_sube, 1);
  cambiarNivel(inst.residente, c.residente_baja, -1);
  if (inst.otro) {
    agregar(inst.otro, c.otro_agrega); quitar(inst.otro, c.otro_quita);
    cambiarNivel(inst.otro, c.otro_sube, 1); cambiarNivel(inst.otro, c.otro_baja, -1);
  }
  if (inst.negocio) {
    (c.negocio_agrega || []).forEach((t) => {
      if (inst.negocio.tags.includes(t)) return;
      inst.negocio.tags.push(t);
      msgs.push(`🏗️ El lugar ${inst.negocio.nombre} ahora ${frase(t)}`);
    });
    (c.negocio_quita || []).forEach((t) => { inst.negocio.tags = inst.negocio.tags.filter((x) => x !== t); });
    if (c.negocio_transforma) {
      const antes = inst.negocio.nombre;
      inst.negocio.nombre = c.negocio_transforma.nombre;
      inst.negocio.tags = [...c.negocio_transforma.tags];
      msgs.push(`🏗️ ${antes} se transformó en ${inst.negocio.nombre}`);
    }
  }
  if (c.relacion && inst.otro) {
    const antes = getRel(inst.residente, inst.otro);
    const despues = Math.max(-100, Math.min(100, antes + c.relacion));
    relaciones[claveRel(inst.residente, inst.otro)] = despues;
    const e1 = etiquetaRel(antes), e2 = etiquetaRel(despues);
    const quienes = `${inst.residente.nombre} y ${inst.otro.nombre}`;
    const fuerte = Math.abs(despues - antes) >= 30;
    const signo = c.relacion > 0 ? (fuerte ? "++" : "+") : (fuerte ? "−−" : "−");
    const clase = c.relacion > 0 ? "sube" : "baja";
    if (e1.nombre !== e2.nombre) msgs.push(`${e2.emoji} ${quienes} ${FRASE_REL[e2.nombre]} <span class="${clase}">${signo}</span>`);
    else msgs.push(`${quienes}: <span class="${clase}">relación ${signo}</span>`);
  }
  return msgs;
}

// Primero se sortea el EVENTO (según nivel y su "peso" opcional), después una combinación válida de ese evento.
// Así un evento sin requisitos no le gana a los demás solo por tener más combinaciones.
function azarPesado(lista) {
  const porEvento = {};
  lista.forEach((p) => (porEvento[p.ev.id] ||= []).push(p));
  const grupos = Object.values(porEvento);
  const peso = (g) => PESOS[g[0].ev.nivel] * (g[0].ev.peso ?? 1);
  let n = Math.random() * grupos.reduce((t, g) => t + peso(g), 0);
  for (const g of grupos) { n -= peso(g); if (n <= 0) return azar(g); }
  return azar(grupos[grupos.length - 1]);
}

function generarCiudad() {
  const negocios = mezclar(NEGOCIOS);
  const nombres = mezclar(RESIDENTES.nombres);
  let contador = 1;
  ciudad = TIPOS.map((tipo, i) => {
    if (tipo === "plaza") return { i, tipo, nombre: "Plaza central" };
    if (tipo === "negocio") { const n = negocios.pop(); return { i, tipo, nombre: n.nombre, tags: [...n.tags] }; }
    const cantidad = 1 + Math.floor(Math.random() * 3);
    const residentes = [];
    for (let k = 0; k < cantidad; k++) {
      const intereses = mezclar(RESIDENTES.intereses).slice(0, 2);
      const [principal, ...secundarios] = mezclar(RESIDENTES.personalidad).slice(0, 3);   // 1 fijo + 2 que pueden cambiar
      residentes.push({ id: "r" + contador++, nombre: nombres.pop(), edad: azar(RESIDENTES.edades),
        casa: i, tags: [...intereses, principal, ...secundarios], niveles: nivelesIniciales(intereses),
        principal, secundarios, relaciones: {}, cara: sortearCara() });
    }
    return { i, tipo, nombre: "Casa de " + residentes[0].nombre, residentes };
  });
  // relaciones de arranque: los que viven juntos se llevan mejor
  relaciones = {};
  const todos = todosLosResidentes();
  todos.forEach((a, x) => todos.slice(x + 1).forEach((b) => {
    const base = a.casa === b.casa ? 40 + Math.floor(Math.random() * 31) : -25 + Math.floor(Math.random() * 51);
    relaciones[claveRel(a, b)] = base;
  }));
  eventos = {}; elegido = null; historial = []; filtro = null; ultimoId = null;
  dia = 1; reloj = 0; bloqueado = false;
  planificarDia();
}

// ====== MOTOR DE EVENTOS ======
const nivelesOk = (r, minimos = {}) => Object.entries(minimos).every(([t, n]) => (r.niveles[t] || 0) >= n);
const interesesValidos = (r, cfg) => r.tags.filter((t) => esInteres(t) && (!cfg.tags || cfg.tags.includes(t))
  && (r.niveles[t] || 1) >= (cfg.nivel_min || 1) && (r.niveles[t] || 1) <= (cfg.nivel_max || NIVEL_MAX));

function posiblesEventos() {
  const posibles = [];
  const residentes = todosLosResidentes();
  EVENTOS.forEach((ev) => {
    if (ev.id === ultimoId) return;
    const req = ev.requisitos;
    residentes.forEach((r) => {
      if (!tieneTodo(r.tags, req.residente)) return;
      if ((req.residente_sin || []).some((t) => r.tags.includes(t))) return;
      if (!nivelesOk(r, req.nivel_min)) return;
      // si el evento habla de un interés, hay una variante por cada interés válido del residente
      const variantes = req.interes ? interesesValidos(r, req.interes).map((t) => ({ interes: t })) : [{}];
      variantes.forEach((v) => {
        const sub = (tags = []) => tags.map((t) => (t === "$interes" ? v.interes : t));
        if (ev.lugar === "casa") {
          if (!ocupado(r.casa)) posibles.push({ ev, residente: r, ...v, lugar: r.casa, involucrados: [r.casa] });
        } else if (ev.lugar === "vecino") {
          VECINOS[r.casa].forEach((n) => {
            const neg = ciudad[n];
            if (ocupado(n) || !tieneTodo(neg.tags, req.negocio)) return;
            if ((req.negocio_sin || []).some((t) => neg.tags.includes(t))) return;
            posibles.push({ ev, residente: r, ...v, negocio: neg, lugar: n, involucrados: [r.casa, n] });
          });
        } else if (ev.lugar === "plaza") {
          if (ocupado(4)) return;
          residentes.forEach((o) => {
            const rel = getRel(r, o);
            if (o.casa === r.casa) return;
            if (req.relacion_min != null && rel < req.relacion_min) return;
            if (req.relacion_max != null && rel > req.relacion_max) return;
            if (!tieneTodo(o.tags, sub(req.otro))) return;
            if (sub(req.otro_sin).some((t) => o.tags.includes(t))) return;
            if (req.otro_nivel_min != null && v.interes && (o.niveles[v.interes] || 0) < req.otro_nivel_min) return;
            posibles.push({ ev, residente: r, ...v, otro: o, lugar: 4, involucrados: [4, r.casa, o.casa] });
          });
        }
      });
    });
  });
  return posibles;
}

function generarEvento() {
  const posibles = posiblesEventos();
  if (!posibles.length) return;
  const p = azarPesado(posibles);
  ultimoId = p.ev.id;
  eventos[p.lugar] = { ...p, nivel: p.ev.nivel, estado: "nuevo", eleccion: null, dia };
  dibujarTodo();
}

function planificarDia() {
  const [min, max] = EVENTOS_POR_DIA;
  const n = min + Math.floor(Math.random() * (max - min + 1));
  agenda = Array.from({ length: n }, () => 0.1 + Math.random() * 0.8).sort((a, b) => a - b);
}

function nuevoDia() {
  dia++; reloj = 0; bloqueado = false;
  eventos = {};   // todo ya fue visto o resuelto (queda guardado en el historial)
  planificarDia();
  dibujarTodo();
}

// si el día ya se terminó y no queda nada por ver, arranca el siguiente
function chequearFinDeDia() {
  if (bloqueado && pendientes() === 0) nuevoDia();
}

function textoDe(inst) {
  return inst.ev.texto
    .replace("{residente}", `<strong>${inst.residente.nombre}</strong>`)
    .replace("{otro}", inst.otro ? `<strong>${inst.otro.nombre}</strong>` : "")
    .replace("{negocio}", inst.negocio ? inst.negocio.nombre : "")
    .replace("{interes}", inst.interes ? nombreTag(inst.interes) : "");
}

function registrar(inst) {
  historial.unshift({ texto: inst.textoFijo || textoDe(inst), eleccion: inst.eleccion, nivel: inst.nivel, dia: inst.dia, mensajes: inst.mensajes || [],
    ids: [inst.residente.id, inst.otro && inst.otro.id].filter(Boolean), lugares: inst.involucrados });
  historial = historial.slice(0, 200);
}

function seleccionar(i) {
  elegido = i;
  const inst = eventos[i];
  if (inst && inst.estado === "nuevo" && inst.nivel === "verde") {
    inst.mensajes = aplicarConsecuencias(inst, inst.ev.consecuencias);
    inst.estado = "visto";
    registrar(inst);
  }
  mostrarFicha(ciudad[i]);
  dibujarTodo();
  chequearFinDeDia();
}

function elegirOpcion(inst, op) {
  inst.textoFijo = textoDe(inst);
  inst.estado = "resuelto";
  inst.eleccion = op.texto;
  inst.mensajes = aplicarConsecuencias(inst, op.consecuencias);
  registrar(inst);
  if (elegido !== null) mostrarFicha(ciudad[elegido]);
  dibujarTodo();
  chequearFinDeDia();
}

// ====== DIBUJO ======
function marcaDe(i) {
  const e = eventos[i];
  if (!e) return null;
  return e.estado === "nuevo" ? e.nivel : "gris";
}

function dibujarCiudad() {
  const cont = document.getElementById("ciudad");
  cont.innerHTML = "";
  ciudad.forEach((lugar) => {
    const b = document.createElement("button");
    b.className = "lugar " + lugar.tipo + (elegido === lugar.i ? " elegido" : "");
    b.dataset.i = lugar.i;
    const marca = marcaDe(lugar.i);
    if (marca) b.dataset.marca = marca;
    const gente = lugar.residentes ? lugar.residentes.map(() => "●").join("") : "";
    b.innerHTML = `<span class="nombre">${lugar.nombre}</span><span class="gente">${gente}</span>`;
    b.setAttribute("aria-label", lugar.nombre + (marca ? `, evento ${NOMBRE_NIVEL[marca]}` : ""));
    b.addEventListener("mouseenter", () => marcarVecinos(lugar.i, true));
    b.addEventListener("mouseleave", () => marcarVecinos(lugar.i, false));
    b.addEventListener("click", () => seleccionar(lugar.i));
    cont.appendChild(b);
  });
}

function marcarVecinos(i, activo) {
  VECINOS[i].forEach((v) => document.querySelector(`.lugar[data-i="${v}"]`).classList.toggle("vecino", activo));
}

function dibujarEvento() {
  const cont = document.getElementById("evento");
  const sinVer = pendientes();
  document.getElementById("contador").textContent = bloqueado
    ? `🌙 Fin del día: faltan ${sinVer}` : (sinVer ? `📬 ${sinVer} sin ver` : "");

  if (elegido === null) { cont.innerHTML = `<p class="vacio">Tocá un lugar con ❗ para ver qué pasa.</p>`; return; }
  const inst = eventos[elegido];
  if (!inst) { cont.innerHTML = `<p class="vacio">Nada nuevo en ${ciudad[elegido].nombre} 🍃</p>`; return; }

  const marca = marcaDe(elegido);
  cont.className = marca === "gris" ? "gastado" : "";
  cont.innerHTML = `<span class="chip ${marca}">${NOMBRE_NIVEL[marca]}</span><p class="evento-texto">${inst.textoFijo || textoDe(inst)}</p>`;

  if (inst.estado === "nuevo" && inst.nivel !== "verde") {
    const ops = document.createElement("div");
    ops.className = "opciones";
    inst.ev.opciones.forEach((op) => {
      const b = document.createElement("button");
      b.className = "accion"; b.textContent = op.texto;
      b.addEventListener("click", () => elegirOpcion(inst, op));
      ops.appendChild(b);
    });
    cont.appendChild(ops);
  } else {
    if (inst.eleccion) cont.insertAdjacentHTML("beforeend", `<p class="resultado">→ ${inst.eleccion}</p>`);
    if (inst.mensajes && inst.mensajes.length)
      cont.insertAdjacentHTML("beforeend", `<ul class="cambios">${inst.mensajes.map((m) => `<li>${m}</li>`).join("")}</ul>`);
  }
}

const coincideFiltro = (h) => !filtro || (filtro.tipo === "r" ? h.ids.includes(filtro.id) : h.lugares.includes(filtro.id));

function dibujarHistorial() {
  const ul = document.getElementById("historial");
  document.getElementById("filtro-activo").textContent = filtro ? `🔻 ${filtro.nombre}` : "";
  const lista = historial.filter(coincideFiltro).slice(0, filtro ? 30 : 10);
  if (!lista.length) { ul.innerHTML = `<li class="vacio">${filtro ? `Todavía no pasó nada con ${filtro.nombre}.` : "Todavía no pasó nada."}</li>`; return; }
  ul.innerHTML = lista.map((h) =>
    `<li class="${h.nivel}"><span class="cuando">Día ${h.dia}</span> ${h.texto}${h.eleccion ? `<br><span class="eleccion">→ ${h.eleccion}</span>` : ""}${h.mensajes.map((m) => `<br><span class="cambio">${m}</span>`).join("")}</li>`
  ).join("");
}

// ====== CARAS PIXELADAS ======
const PIELES = ["#f7d6b0", "#e8b98a", "#c68c5a", "#8d5a3b"];
const PELOS = ["#2b1b12", "#6b4423", "#d9a441", "#b5442e", "#3a3a3a"];
const ROPAS = ["#ffc812", "#009fe3", "#22ad4a", "#ff4f4f", "#8a5cd6"];
const sortearCara = () => ({ piel: azar(PIELES), pelo: azar(PELOS), ropa: azar(ROPAS),
  estilo: Math.floor(Math.random() * 4), boca: Math.floor(Math.random() * 3) });

function caraPixelada(r) {
  const c = r.cara, N = 12, TINTA = "#1b1b24";
  const g = Array.from({ length: N }, () => Array(N).fill(null));
  const poner = (x, y, col) => { g[y][x] = col; };
  const fila = (y, x1, x2, col) => { for (let x = x1; x <= x2; x++) poner(x, y, col); };
  const nino = r.edad === "niño", viejo = r.edad === "anciano";
  const top = nino ? 3 : 2;
  const pelo = viejo ? "#e6e6e6" : c.pelo;
  for (let y = top; y <= 10; y++) fila(y, 2, 9, c.piel);       // cabeza
  fila(11, 3, 8, c.ropa);                                       // remera
  const estilo = c.estilo === 2 && nino ? 0 : c.estilo;        // los pelados solo de grandes
  if (estilo !== 2) { fila(top, 2, 9, pelo); fila(top + 1, 2, 9, pelo); }
  else { fila(top + 2, 2, 2, pelo); fila(top + 2, 9, 9, pelo); }
  if (estilo === 1) for (let y = top + 2; y <= 9; y++) { poner(2, y, pelo); poner(9, y, pelo); }
  if (estilo === 3) fila(top - 1, 3, 8, pelo);
  const ojoY = top + 3;                                         // ojos
  poner(4, ojoY, TINTA); poner(7, ojoY, TINTA);
  if (nino) { poner(4, ojoY + 1, TINTA); poner(7, ojoY + 1, TINTA); poner(3, 8, "#ff9bb0"); poner(8, 8, "#ff9bb0"); }
  if (viejo) { poner(3, 8, "#00000033"); poner(8, 8, "#00000033"); poner(4, ojoY - 1, "#c9c9c9"); poner(7, ojoY - 1, "#c9c9c9"); }
  if (c.boca === 0) { poner(4, 8, TINTA); poner(7, 8, TINTA); fila(9, 5, 6, TINTA); }          // sonrisa
  else if (c.boca === 1) fila(9, 4, 7, TINTA);                                                  // seria
  else { fila(8, 5, 6, "#c0392b"); fila(9, 5, 6, "#c0392b"); }                                  // boca abierta
  const rects = g.map((f, y) => f.map((col, x) => col ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${col}"/>` : "").join("")).join("");
  return `<svg class="cara" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" role="img" aria-label="Cara de ${r.nombre}">${rects}</svg>`;
}

const tagsHTML = (tags) => `<div class="tags">${tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>`;

const EMBUDO = `<svg class="embudo" viewBox="0 0 7 6" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h7v1H0zM1 1h5v1H1zM2 2h3v1H2zM3 3h1v3H3z" fill="currentColor"/></svg>`;
const btnFiltro = (tipo, id, nombre) => `<button class="accion btn-filtro" data-tipo="${tipo}" data-id="${id}" data-nombre="${nombre}" title="Ver solo su historial" aria-label="Ver solo el historial de ${nombre}">${EMBUDO}</button>`;
const chipRel = (o, v) => `<span class="tag">${o.nombre} ${v} ${etiquetaRel(v).emoji}</span>`;

function relacionesHTML(r) {
  const ord = todosLosResidentes().filter((o) => o.id !== r.id).map((o) => ({ o, v: getRel(r, o) })).sort((a, b) => b.v - a.v);
  if (ord.length <= 3) return `<div class="tags">${ord.map((x) => chipRel(x.o, x.v)).join("")}</div>`;
  const top = ord.slice(0, 2), peor = ord[ord.length - 1], resto = ord.slice(2, -1);
  return `<p class="vacio rel-titulo">Más queridos</p><div class="tags">${top.map((x) => chipRel(x.o, x.v)).join("")}</div>
    <p class="vacio rel-titulo">Menos querido</p><div class="tags">${chipRel(peor.o, peor.v)}</div>
    <details class="mas"><summary>Ver los demás (${resto.length})</summary><div class="tags">${resto.map((x) => chipRel(x.o, x.v)).join("")}</div></details>`;
}

const pips = (n) => "■".repeat(n) + "□".repeat(NIVEL_MAX - n);
const chipInteres = (r, t) => `<span class="tag">${nombreTag(t)} <span class="pips">${pips(r.niveles[t] || 1)}</span></span>`;

function interesesHTML(r) {
  const ints = r.tags.filter(esInteres).sort((x, y) => (r.niveles[y] || 1) - (r.niveles[x] || 1));
  let html = `<p class="vacio rel-titulo">Personalidad</p><div class="tags"><span class="tag principal">⭐ ${nombreTag(r.principal)}</span>${r.secundarios.map((t) => `<span class="tag">${nombreTag(t)}</span>`).join("")}</div>`;
  if (ints.length <= 3) html += `<p class="vacio rel-titulo">Intereses</p><div class="tags">${ints.map((t) => chipInteres(r, t)).join("")}</div>`;
  else {
    const top = ints.slice(0, 2), flojo = ints[ints.length - 1], resto = ints.slice(2, -1);
    html += `<p class="vacio rel-titulo">Mejores</p><div class="tags">${top.map((t) => chipInteres(r, t)).join("")}</div>
      <p class="vacio rel-titulo">Más flojo</p><div class="tags">${chipInteres(r, flojo)}</div>`;
    if (resto.length) html += `<details class="mas"><summary>Ver los demás (${resto.length})</summary><div class="tags">${resto.map((t) => chipInteres(r, t)).join("")}</div></details>`;
  }
  const otros = r.tags.filter((t) => !esInteres(t) && !esPersonalidad(t));
  return html + (otros.length ? `<p class="vacio rel-titulo">Además</p>${tagsHTML(otros)}` : "");
}

function mostrarFicha(lugar) {
  const ficha = document.getElementById("ficha");
  const vecinos = VECINOS[lugar.i].map((v) => ciudad[v].nombre).join(", ");
  let html = `<div class="cabecera"><h2>${lugar.nombre}</h2>${btnFiltro("l", lugar.i, lugar.nombre)}</div><p class="vacio">Vecinos: ${vecinos}</p>`;
  if (lugar.tipo === "negocio") html += `<p style="margin-top:8px">Características:</p>${tagsHTML(lugar.tags)}`;
  else if (lugar.tipo === "casa") lugar.residentes.forEach((r) => {
    html += `<details class="residente" open><summary><strong>${r.nombre}</strong> (${r.edad})</summary><div class="cuerpo">
      <div class="retrato">${caraPixelada(r)}</div><div class="datos">
      <p>${btnFiltro("r", r.id, r.nombre)} <span class="vacio">ver su historial</span></p>${interesesHTML(r)}
      <p class="vacio" style="margin-top:8px">Relaciones:</p>${relacionesHTML(r)}</div></div></details>`; });
  else html += `<p style="margin-top:8px">Acá se cruzan los vecinos de las 4 casas 🗣️</p>`;
  ficha.innerHTML = html;
}

function dibujarTodo() {
  document.getElementById("dia").textContent = `Día ${dia} ${bloqueado ? "🌙" : "☀️"}`;
  document.getElementById("barra-cont").classList.toggle("frenada", bloqueado);
  dibujarCiudad(); dibujarEvento(); dibujarHistorial();
}

// ====== RELOJ ======
setInterval(() => {
  if (!ciudad.length || pausado || bloqueado) return;
  reloj += 0.1;
  const avance = reloj / DURACION_DIA;
  document.getElementById("barra").style.width = Math.min(100, avance * 100) + "%";
  while (agenda.length && agenda[0] <= avance && !bloqueado) { agenda.shift(); generarEvento(); }
  if (avance >= 1) {
    if (pendientes() > 0) { bloqueado = true; dibujarTodo(); }   // espera a que veamos todo
    else nuevoDia();
  }
}, 100);

// ====== FILTRO DEL HISTORIAL ======
// Cualquier toque limpia el filtro; el embudo lo activa (corre primero la limpieza, después el embudo)
document.addEventListener("click", (e) => {
  const b = e.target.closest(".btn-filtro");
  if (!b) { if (filtro) { filtro = null; dibujarHistorial(); } return; }
  filtro = { tipo: b.dataset.tipo, id: b.dataset.tipo === "l" ? Number(b.dataset.id) : b.dataset.id, nombre: b.dataset.nombre };
  dibujarHistorial();
}, true);

// ====== BOTONES ======
document.getElementById("nueva").addEventListener("click", () => {
  generarCiudad(); dibujarTodo();
  document.getElementById("ficha").innerHTML = `<p class="vacio">Ciudad nueva 🏘️ Tocá un lugar para conocerlo.</p>`;
});
document.getElementById("pausa").addEventListener("click", (e) => {
  pausado = !pausado;
  e.target.textContent = pausado ? "Seguir ▶️" : "Pausar ⏸️";
});

// ====== ARRANQUE ======
async function cargar(archivo) {
  const r = await fetch("data/" + archivo);
  if (!r.ok) throw new Error("No se pudo cargar " + archivo);
  return r.json();
}

async function iniciar() {
  try {
    [NEGOCIOS, RESIDENTES, EVENTOS, FRASE_TAG] = await Promise.all(
      ["negocios.json", "residentes.json", "eventos.json", "frases.json"].map(cargar));
    generarCiudad();
    dibujarTodo();
  } catch (e) {
    document.getElementById("evento").innerHTML =
      `<p class="vacio">No se pudieron cargar los datos (${e.message}). Abrí el juego desde un servidor, no con doble clic.</p>`;
  }
}

iniciar();
