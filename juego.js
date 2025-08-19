// ===========================
// juego.js
// ===========================

/**
 * Mini motor del juego "El Impostor".
 * Este archivo se puede cargar dinámicamente desde index.js cuando llega
 * el evento `juegoIniciado`. Expone `startJuegoOnline()` para bootstrap online.
 */

// ---------------------------
// Estado y datos base
// ---------------------------
let jugadores = [];
let futbolistas = [];

const categorias = {
  "futbol general": [
    // (se completa automáticamente combinando todas las categorías)
  ],
  "futbol argentino": [
    "adrián 'maravilla' martínez", "braian romero", "claudio aquino", "edinson cavani",
    "ever banega", "facundo colidio", "franco jara", "franco mastantuono", "gabriel ávalos",
    "ignacio malcorra", "marcelino moreno", "mateo pellegrino", "miguel borja", "miguel merentiel",
    "milton giménez", "sebastián villa", "thiago fernández", "walter bou", "alejo véliz",
    "ángel di maría", "giuliano galoppo", "valentin gomez"
  ],
  "futbol retro": [
    "pele", "maradona", "platini", "cruyff", "baggio", "garrincha", "di stefano", "puskas", "eusebio",
    "beckenbauer", "muller", "kempes", "passarella", "socrates", "matthaus", "van basten", "romario",
    "bobby charlton", "lev yashin", "rivelino", "gerson", "falcao", "hugo sanchez"
  ],
  "seleccion argentina": [
    "messi", "maradona", "batistuta", "riquelme", "tevez", "crespo", "veron", "simeone", "redondo",
    "goycochea", "fillol", "pumpido", "passarella", "ruggeri", "ayala", "sorin", "zanetti", "burdisso",
    "milito", "palermo", "ortega", "gallardo", "enzo perez", "di maria", "lautaro martinez",
    "julian alvarez", "emiliano martinez", "otamendi", "tagliafico", "paredes", "de paul", "mac allister"
  ],
  "champions league": [
    "ronaldo", "messi", "benzema", "modric", "casillas", "ramos", "xavi", "iniesta", "puyol", "neuer",
    "robben", "ribery", "lewandowski", "kroos", "bale", "suarez", "griezmann", "mbappe", "haaland",
    "salah", "mane", "de bruyne", "aguero", "ter stegen", "courtois", "alisson", "van dijk",
    "robertson", "alexander-arnold", "kante", "jorginho"
  ],
  "libertadores": [
    // Argentina
    "juan roman riquelme", "martin palermo", "ariel ortega", "enrique bochini", "oscar ruggeri",
    "roberto perfumo", "ramon diaz", "francescoli", "carlos tevez", "gabriel batistuta",
    "julio cesar falcioni", "angel cappa", "ricardo bochini", "norberto alonso", "daniel passarella",
    "amadeo carrizo", "roberto abbondanzieri", "gaston sessa",
    // Brasil
    "pele", "zico", "romario", "socrates", "cafu", "roberto carlos", "juninho pernambucano", "dida",
    "rogerio ceni", "gabigol", "everton ribeiro", "arrascaeta", "ricardo oliveira", "alex",
    "ricardinho", "juninho paulista", "edmundo", "tita", "jairzinho", "tostao", "rivelino",
    // Uruguay
    "enzo francescoli", "fernando morena", "alvaro recoba", "rodrigo lopez", "sergio martinez",
    "pablo bengoechea", "walter pandiani",
    // Chile
    "elias figueroa", "carlos caszely", "jorge valdivia", "esteban paredes", "jaime riveros",
    // Colombia
    "carlos valderrama", "faustino asprilla", "oscar cordoba", "freddy rincón", "james rodriguez",
    "juan fernando quintero", "miguel calero",
    // Paraguay
    "roque santa cruz", "jose luis chilavert", "celso ayala", "julio dos santos",
    "nelson haedo valdez", "francisco arce",
    // Otros
    "alberto spencer", "julio cesar romero", "aristizabal", "ricardo pavoni", "julio cesar uribe",
    "jorge fosatti", "jorge bermudez", "andres d'alessandro", "jorge campos", "oswaldo sánchez"
  ]
};

// Construir “futbol general” combinando todas las categorías (sin duplicados)
categorias["futbol general"] = Array.from(
  new Set(
    Object.keys(categorias)
      .filter(cat => cat !== "futbol general")
      .flatMap(cat => categorias[cat])
  )
);

// Variables de ronda
let roles = {};
let palabras = {};
let turno = 0;
let impostor = "";
let votacionTurno = 0; // Para controlar el turno de votación

// ---------------------------
// Utilidades de UI
// ---------------------------
function ensureSetupUI() {
  // Si no existen inputs, armamos un setup mínimo dentro de #juego
  const root = document.getElementById('juego');
  if (!root) return;

  if (!document.getElementById('jugadores')) {
    root.innerHTML = `
      <div id="setup">
        <label>Jugadores (separados por coma):</label>
        <input id="jugadores" type="text" placeholder="Ana, Luis, Marta">
        <label>Categoría:</label>
        <select id="categoria"></select>
        <button id="btnIniciarLocal">Arrancar</button>
      </div>
      <div id="turno"></div>
      <div id="palabras"></div>
      <div id="votacion" style="display:none;">
        <h3>Votación</h3>
        <div id="opcionesVoto"></div>
        <div id="palabrasJugadores"></div>
      </div>
    `;
    cargarCategorias();
    document.getElementById('btnIniciarLocal').onclick = () => iniciarJuego();
  }
}

function cargarCategorias() {
  const select = document.getElementById("categoria");
  if (!select) return;
  select.innerHTML = "";
  Object.keys(categorias).forEach(cat => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    select.appendChild(option);
  });
}

// ---------------------------
// Lógica del juego
// ---------------------------
function iniciarJuego() {
  const inputJug = document.getElementById("jugadores");
  const selectCat = document.getElementById("categoria");

  jugadores = (inputJug?.value || "")
    .split(",")
    .map(j => j.trim().replace(/['"\n\r]/g, "")) // Limpia comillas y saltos de línea
    .filter(j => j)
    .map(nombre => ({ nombre, votos: 0 }));

  const categoriaSeleccionada = selectCat ? selectCat.value : "futbol general";
  futbolistas = categorias[categoriaSeleccionada] || [];

  if (jugadores.length < 3 || futbolistas.length === 0) {
    alert("Agrega al menos 3 jugadores y selecciona una categoría.");
    return;
  }

  asignarRoles();

  const setup = document.getElementById("setup");
  if (setup) setup.style.display = "none";
  const contJuego = document.getElementById("juego");
  if (contJuego) contJuego.style.display = "block";

  palabras = {};
  turno = 0;
  votacionTurno = 0;
  mostrarTurno();
}

function asignarRoles() {
  const futbolista = futbolistas[Math.floor(Math.random() * futbolistas.length)];
  const impostorObj = jugadores[Math.floor(Math.random() * jugadores.length)];
  impostor = impostorObj.nombre;
  roles = {};
  jugadores.forEach(j => {
    roles[j.nombre] = (j.nombre === impostor) ? "IMPOSTOR" : futbolista;
  });
  // En online, cada uno debería ver su rol en su cliente; para local, usamos alert:
  alert("Roles asignados. Cada jugador debe ver su rol en secreto.");
}

function mostrarTurno() {
  if (turno >= jugadores.length) {
    mostrarPalabras();
    return;
  }
  const jugador = jugadores[turno].nombre;
  const div = document.getElementById("turno");
  if (!div) return;

  // Mostrar palabras previas
  let palabrasPrevias = "";
  if (turno > 0) {
    palabrasPrevias = "<div style='margin-bottom:14px;'><b>Palabras anteriores:</b><ul style='margin:6px 0 0 0;'>";
    for (let i = 0; i < turno; i++) {
      const nombrePrevio = jugadores[i].nombre;
      palabrasPrevias += `<li><b>${nombrePrevio}:</b> ${palabras[nombrePrevio]}</li>`;
    }
    palabrasPrevias += "</ul></div>";
  }

  div.innerHTML = `
    <h2>Turno de ${jugador}</h2>
    <p id="rol-revelar" class="rol-borroso" onclick="revelarRol(this)">
      Tu rol es: <span class="rol-texto">${roles[jugador]}</span>
      <span style="font-size:0.9em;">(¡No lo muestres!)</span>
      <br><span class="toque-revelar">(Toca para ver tu rol)</span>
    </p>
    ${palabrasPrevias}
    <input type="text" id="palabra" placeholder="Di una palabra relacionada">
    <button onclick="guardarPalabra()">Enviar</button>
  `;
}

// Revela el rol al hacer click
function revelarRol(element) {
  element.classList.remove("rol-borroso");
  const aviso = element.querySelector('.toque-revelar');
  if (aviso) aviso.style.display = "none";
}

function guardarPalabra() {
  const jugador = jugadores[turno].nombre;
  const input = document.getElementById("palabra");
  const palabra = (input?.value || "").trim();
  if (!palabra) {
    alert("Escribe una palabra.");
    return;
  }
  palabras[jugador] = palabra;
  turno++;
  mostrarTurno();
}

function mostrarPalabras() {
  const contTurno = document.getElementById("turno");
  if (contTurno) contTurno.innerHTML = "";
  const div = document.getElementById("palabras");
  if (!div) return;

  div.innerHTML = "<h3>Palabras dichas:</h3><ul>" +
    jugadores.map(j => `<li><b>${j.nombre}:</b> ${palabras[j.nombre]}</li>`).join("") +
    "</ul><button onclick='iniciarVotacion()'>Votar</button>";
}

function iniciarVotacion() {
  const contPalabras = document.getElementById("palabras");
  if (contPalabras) contPalabras.innerHTML = "";
  const panelVot = document.getElementById("votacion");
  if (panelVot) panelVot.style.display = "block";
  const ops = document.getElementById("opcionesVoto");
  if (ops) ops.innerHTML = "";
  votacionTurno = 0;
  mostrarVotacionTurno();
}

function mostrarVotacionTurno() {
  if (votacionTurno >= jugadores.length) {
    // Fin de la votación: eliminar al más votado
    const maxVotos = Math.max(...jugadores.map(j => j.votos));
    const candidatos = jugadores.filter(j => j.votos === maxVotos);
    const eliminado = candidatos[Math.floor(Math.random() * candidatos.length)].nombre; // desempate aleatorio
    eliminarJugador(eliminado);
    return;
  }
  const jugadorObj = jugadores[votacionTurno];
  const cont = document.getElementById("opcionesVoto");
  if (!cont) return;

  const opciones = jugadores
    .filter(j => j.nombre !== jugadorObj.nombre)
    .map(j => `<button onclick="votarJugador(decodeURIComponent('${encodeURIComponent(j.nombre)}'))">${j.nombre}</button>`)
    .join(" ");
  cont.innerHTML = `<h4>${jugadorObj.nombre}, ¿quién crees que es el impostor?</h4>${opciones}<br>`;
}

function votarJugador(nombreVotado) {
  const jug = jugadores.find(j => j.nombre === nombreVotado);
  if (jug) jug.votos += 1;
  votacionTurno++;
  mostrarVotacionTurno();
}

function eliminarJugador(nombre) {
  const panelVot = document.getElementById("votacion");
  if (panelVot) panelVot.style.display = "none";
  const juegoDiv = document.getElementById("juego");
  if (!juegoDiv) return;

  let mensaje = "";
  if (roles[nombre] === "IMPOSTOR") {
    mensaje = `<div class="resultado-final"><h2>🎉 ¡${nombre} era el impostor! ¡Ganaron los demás! 🎉</h2></div>`;
  } else {
    mensaje = `<div class="resultado-final"><h2>❌ ${nombre} no era el impostor.<br>El impostor era <span style="color:#ff5252">${impostor}</span>.</h2></div>`;
  }
  juegoDiv.innerHTML = mensaje + `<button onclick="location.reload()">Jugar de nuevo</button>`;
}

// ---------------------------
// Bootstrap online
// ---------------------------
/**
 * Llamar a esta función cuando el server emite `juegoIniciado`.
 * Puede recibir payloads con más datos si en el futuro querés roles/temas desde el server.
 */
window.startJuegoOnline = function startJuegoOnline(payload) {
  // Mostrar contenedor de juego por si no está visible
  const salaDiv = document.getElementById("sala");
  if (salaDiv) salaDiv.style.display = "none";
  const juegoDiv = document.getElementById("juego");
  if (juegoDiv) juegoDiv.style.display = "block";

  // Asegurar setup mínimo y arrancar
  ensureSetupUI();
  cargarCategorias();

  // Si querés saltar el setup y arrancar directo con valores por defecto,
  // podés completar jugadores/categoría aquí y llamar iniciarJuego().
  // Por defecto, dejamos que el admin complete y presione "Arrancar".
};

// ---------------------------
// Exponer funciones usadas por onclick del HTML generado
// ---------------------------
Object.assign(window, {
  iniciarJuego,
  revelarRol,
  guardarPalabra,
  iniciarVotacion,
  votarJugador
});
