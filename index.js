// index.js
document.addEventListener("DOMContentLoaded", () => {
  const categorias = {
    "futbol general": [], // se completa en runtime
    "futbol argentino": [
      "adrián 'maravilla' martínez","braian romero","claudio aquino","edinson cavani",
      "ever banega","facundo colidio","franco jara","gabriel ávalos",
      "ignacio malcorra","marcelino moreno","mateo pellegrino","miguel borja","miguel merentiel",
      "milton giménez","sebastián villa","walter bou","alejo véliz",
      "ángel di maría","giuliano galoppo"
    ],
    "futbol retro": [
      "pele","maradona","platini","cruyff","baggio","garrincha","di stefano","puskas","eusebio",
      "beckenbauer","muller","kempes","passarella","socrates","matthaus","van basten","romario",
      "bobby charlton","lev yashin","rivelino","gerson","falcao","hugo sanchez"
    ],
    "seleccion argentina": [
      "messi","maradona","batistuta","riquelme","tevez","crespo","veron","simeone","redondo",
      "goycochea","fillol","pumpido","passarella","ruggeri","ayala","sorin","zanetti","burdisso",
      "milito","palermo","ortega","gallardo","enzo perez","di maria","lautaro martinez",
      "julian alvarez","emiliano martinez","otamendi","tagliafico","paredes","de paul","mac allister"
    ],
    "champions league": [
      "ronaldo","messi","benzema","modric","casillas","ramos","xavi","iniesta","puyol","neuer",
      "robben","ribery","lewandowski","kroos","bale","suarez","griezmann","mbappe","haaland",
      "salah","mane","de bruyne","aguero","ter stegen","courtois","alisson","van dijk",
      "robertson","alexander-arnold","kante","jorginho"
    ],
    "libertadores": [
      // Argentina
      "juan roman riquelme","martin palermo","ariel ortega","enrique bochini","oscar ruggeri",
      "roberto perfumo","ramon diaz","francescoli","carlos tevez","gabriel batistuta",
      "julio cesar falcioni","angel cappa","ricardo bochini","norberto alonso","daniel passarella",
      "amadeo carrizo","roberto abbondanzieri","gaston sessa",
      // Brasil
      "pele","zico","romario","socrates","cafu","roberto carlos","juninho pernambucano","dida",
      "rogerio ceni","gabigol","everton ribeiro","arrascaeta","ricardo oliveira","alex",
      "ricardinho","juninho paulista","edmundo","tita","jairzinho","tostao","rivelino",
      // Uruguay
      "enzo francescoli","fernando morena","alvaro recoba","rodrigo lopez","sergio martinez",
      "pablo bengoechea","walter pandiani",
      // Chile
      "elias figueroa","carlos caszely","jorge valdivia","esteban paredes","jaime riveros",
      // Colombia
      "carlos valderrama","faustino asprilla","oscar cordoba","freddy rincón","james rodriguez",
      "juan fernando quintero","miguel calero",
      // Paraguay
      "roque santa cruz","jose luis chilavert","celso ayala","julio dos santos",
      "nelson haedo valdez","francisco arce",
      // Otros
      "alberto spencer","julio cesar romero","aristizabal","ricardo pavoni","julio cesar uribe",
      "jorge fosatti","jorge bermudez","andres d'alessandro","jorge campos","oswaldo sánchez"
    ]
  };

  // Completar "futbol general" con la unión de todas (excepto sí misma)
  categorias["futbol general"] = Object.entries(categorias)
  .filter(([k]) => k !== "futbol general")
  .flatMap(([, arr]) => arr);

  // Render de categorías en crear sala
  const contCatCrear = document.getElementById('catCrear');
  if (contCatCrear) {
    const keys = Object.keys(categorias);
    contCatCrear.innerHTML = keys.map(k => `
      <label style="display:block; margin:6px 0;">
        <input type="checkbox" class="chk-cat-crear" value="${k}"> ${k}
      </label>
    `).join('');
  }
  // helper rápido para no repetir document.getElementById
  function $(id) {
    return document.getElementById(id);
  }

  const socket = io();

  let salaActual = null;
  let usuarioActual = "";
  let soyAdmin = false;

  // Estado global del cliente
  let MI_SOCKET_ID = null;
  let MI_ROL = { esImpostor: false, jugador: "" }; // jugador: palabra real o señuelo
  let ULTIMO_ESTADO = { estado: "esperando", jugadores: [], turnoId: null, palabras: [] };
  let pedirEstadoTimer = null; // reintentos hasta que llegue turnoId

  // ---------- helpers de UI ----------
  function mostrarCrearSala() {
    document.getElementById("lobby").style.display = "none";
    document.getElementById("crearSala").style.display = "block";
  }
  function volverLobby() {
    document.getElementById("crearSala").style.display = "none";
    document.getElementById("lobby").style.display = "block";
  }
  function togglePassword() {
    const tipo = document.getElementById("tipoSala").value;
    document.getElementById("passwordSalaDiv").style.display = tipo === "privada" ? "block" : "none";
  }
  function mostrarSala() {
    document.getElementById("lobby").style.display = "none";
    document.getElementById("crearSala").style.display = "none";
    document.getElementById("juego").style.display = "none";
    const setup = document.getElementById("setup");
    if (setup) setup.style.display = "none";
    document.getElementById("sala").style.display = "block";
  }

  // ---------- crear / listar / unirse ----------
function crearSala(e) {
  e.preventDefault();

  const nombre = $("nombreSala").value;
  const usuario = $("usuarioSala").value;     // 👈 definimos la variable
  const publica = $("tipoSala").value === "publica";
  const password = publica ? null : $("passwordSala").value;
  const maxJugadores = parseInt($("maxJugadoresSala").value || "6", 10);
  const impostores = parseInt($("impostoresSala").value || "1", 10);

  // categorías seleccionadas
  const categoriasSeleccionadas = [...document.querySelectorAll('.chk-cat-crear:checked')].map(i => i.value);

  socket.emit("crearSala", {
    nombre,
    usuario,                 // 👈 ahora sí existe
    publica,
    password,
    maxJugadores,
    impostores,
    categoriasSeleccionadas
  }, (res) => {
    if (res.ok) {
      salaActual = res.id;
      mostrarSala();
      socket.emit('pedirInfoSala', salaActual);
    } else {
      alert(res.error || "No se pudo crear la sala");
    }
  });
}


  function listarSalas() {
    socket.emit('listarSalas');
  }

  function unirseSala(id, publica) {
    usuarioActual = prompt("Tu nombre:");
    if (!usuarioActual) return;
    let password = null;
    if (!publica) {
      password = prompt("Contraseña de la sala:");
      if (!password) return;
    }
    socket.emit('unirseSala', { id, password, usuario: usuarioActual }, (res) => {
      if (res.ok) {
        salaActual = id;
        mostrarSala();
        socket.emit('pedirInfoSala', salaActual);
      } else {
        alert(res.error || "No se pudo unir a la sala");
      }
    });
  }

  // ---------- render de lobby ----------
  socket.on('salasDisponibles', (salas) => {
    const lista = document.getElementById("salas-lista");
    if (!lista) return;
    lista.innerHTML = "";
    if (salas.length === 0) {
      lista.innerHTML = "<p>No hay salas disponibles.</p>";
      return;
    }
    salas.forEach(sala => {
      let btn = `<button onclick="unirseSala('${sala.id}', ${sala.publica})">Unirse</button>`;
      lista.innerHTML += `<div>
        <b>${sala.nombre}</b> (${sala.jugadores}/${sala.maxJugadores})
        ${sala.publica ? "🟢 Pública" : "🔒 Privada"} ${btn}
      </div>`;
    });
  });

  // ---------- info de sala ----------
  function mostrarSalaInfo(sala) {
    document.getElementById("nombreSalaActual").innerText = sala.nombre;
    document.getElementById("infoSala").innerHTML = `
      <b>Jugadores:</b> ${sala.jugadores.length}/${sala.maxJugadores} <br>
      <b>Impostores:</b> ${sala.impostores} <br>
      <b>Tipo:</b> ${sala.publica ? "Pública" : "Privada"} <br>
      <b>Admin:</b> ${sala.jugadores.find(j => j.id === sala.admin)?.nombre || "?"}
    `;
    document.getElementById("jugadoresSala").innerHTML = "<b>Jugadores en la sala:</b><ul>" +
      sala.jugadores.map(j =>
        `<li>${j.nombre}${j.id === sala.admin ? " (admin)" : ""}${j.id === socket.id ? " (vos)" : ""}</li>`
      ).join("") + "</ul>";

    if (sala.admin === socket.id) {
      document.getElementById("accionesAdmin").innerHTML = `<button onclick="iniciarJuegoOnline()">Iniciar juego</button>`;
      soyAdmin = true;
    } else {
      document.getElementById("accionesAdmin").innerHTML = "";
      soyAdmin = false;
    }
  }

socket.on('infoSala', (sala) => {
  if (!sala) return;
  salaActual = sala.id;

  // 🚦 Si la partida ya está en curso, forzamos la vista de juego aunque aún no tengamos ULTIMO_ESTADO
  const partEnCurso = sala.estado === 'turnos' || sala.estado === 'votacion_turnos';
  if (partEnCurso) {
    document.getElementById("sala").style.display = "none";
    document.getElementById("juego").style.display = "block";
    const root = document.getElementById("juego");
    root.innerHTML = `<p><i>Cargando estado de la ronda...</i></p>`;

    // Pedimos el estado y dejamos que renderJuego lo pinte (espectador no participa)
    socket.emit('pedirEstadoJuego', { sala: salaActual });
    return; // ⬅️ no renderizamos lobby
  }

  // ⤵️ de acá para abajo tu render del lobby como ya lo tenías
  mostrarSala();
  // ... (resto de tu código de infoSala)
});

socket.on('infoSala', (sala) => {
  if (!sala) return;
  salaActual = sala.id;

  const salaEl = document.getElementById("sala");
  const juegoEl = document.getElementById("juego");
  const root = document.getElementById("juego");

  // ⛳ Si la partida ya está en curso, mostramos la vista de juego y pedimos el estado
  const enCurso = sala.estado === 'turnos' || sala.estado === 'votacion_turnos';
  if (enCurso) {
    if (salaEl) salaEl.style.display = "none";
    if (juegoEl) juegoEl.style.display = "block";
    if (root) root.innerHTML = `<p><i>Cargando estado de la ronda...</i></p>`;
    socket.emit('pedirEstadoJuego', { sala: salaActual });
    return; // no renderizamos lobby
  }

  // 🧩 Render del LOBBY (esperando inicio)
  if (salaEl) salaEl.style.display = "block";
  if (juegoEl) juegoEl.style.display = "none";

  // Título
  const adminObj = sala.jugadores.find(j => j.id === sala.admin);
  document.getElementById("nombreSalaActual").textContent = sala.nombre;

  // Info básica + categorías elegidas (si hay)
  document.getElementById("infoSala").innerHTML = `
    <b>Jugadores:</b> ${sala.jugadores.length}/${sala.maxJugadores}<br>
    <b>Impostores:</b> ${sala.impostores}<br>
    <b>Tipo:</b> ${sala.publica ? 'Pública' : 'Privada'}<br>
    <b>Admin:</b> ${adminObj?.nombre || "?"}
    ${
      sala.categoriasSeleccionadas?.length
        ? `<br><b>Categorías elegidas:</b> ${sala.categoriasSeleccionadas.join(", ")}`
        : ""
    }
  `;

  // Lista de jugadores
  const miId = socket.id;
  document.getElementById("jugadoresSala").innerHTML =
    "<ul>" + sala.jugadores
      .map(j => `<li>${j.nombre}${j.id===sala.admin?" (admin)":""}${j.id===miId?" (vos)":""}</li>`)
      .join("") + "</ul>";

  // Acciones del admin (checkboxes + iniciar)
  const acciones = document.getElementById("accionesAdmin");
  if (sala.admin === miId) {
    const keys = Object.keys(categorias); // <- debe existir el objeto `categorias` en el cliente
    acciones.innerHTML = `
      <h3>Configuración</h3>
      <div id="bloqueCategorias"></div>
      <button id="btnIniciar" class="btn">Iniciar juego</button>
    `;

    // Checkboxes (marcar las ya elegidas si vuelven al lobby)
    const cont = document.getElementById("bloqueCategorias");
    cont.innerHTML = `
      <p>Seleccioná las categorías permitidas:</p>
      ${keys.map(k => {
        const checked = (sala.categoriasSeleccionadas || []).includes(k) ? "checked" : "";
        return `
          <label style="display:block; margin:6px 0;">
            <input type="checkbox" class="chk-cat" value="${k}" ${checked}> ${k}
          </label>
        `;
      }).join("")}
    `;

    // Botón iniciar → envía categorías seleccionadas
    document.getElementById("btnIniciar").onclick = () => {
      const seleccionadas = Array.from(document.querySelectorAll(".chk-cat:checked"))
        .map(i => i.value);
      if (seleccionadas.length === 0) {
        alert("Seleccioná al menos una categoría");
        return;
      }
      socket.emit('iniciarJuego', { sala: salaActual, categoriasSeleccionadas: seleccionadas });
    };
  } else {
    acciones.innerHTML = `<i>Esperando al admin…</i>`;
  }
});


  // ---------- acciones admin / cliente ----------
  function expulsarJugador(idJugador) {
    socket.emit('expulsarJugador', { sala: salaActual, idJugador });
  }
  function iniciarJuegoOnline() {
    socket.emit('iniciarJuego', { sala: salaActual });
  }
  function salirSala() {
    socket.emit('salirSala', { sala: salaActual });
    location.reload();
  }

  // ==============
  // JUEGO ONLINE
  // ==============
  socket.on('connect', () => {
    MI_SOCKET_ID = socket.id;
  });

  // Rol privado a cada jugador
  socket.on('tuRol', ({ esImpostor, jugador }) => {
    MI_ROL = { esImpostor, jugador }; // jugador = palabra real (no impostor) o señuelo (impostor)
    if (document.getElementById("juego").style.display === "block") {
      renderJuego();
    }
  });

  // Arranque general (pedimos snapshot del estado)
  socket.on('juegoIniciado', () => {
    document.getElementById("sala").style.display = "none";
    document.getElementById("juego").style.display = "block";
    const root = document.getElementById("juego");
    root.innerHTML = `<p><i>Cargando estado de la ronda...</i></p>`;

    // Pedimos estado y reintentamos hasta que llegue turnoId
    socket.emit('pedirEstadoJuego', { sala: salaActual });
    if (pedirEstadoTimer) clearInterval(pedirEstadoTimer);
    pedirEstadoTimer = setInterval(() => {
      if (ULTIMO_ESTADO && ULTIMO_ESTADO.turnoId) {
        clearInterval(pedirEstadoTimer);
        pedirEstadoTimer = null;
        return;
      }
      socket.emit('pedirEstadoJuego', { sala: salaActual });
    }, 400);
  });

  // Estado compartido (turno, palabras, jugadores)
  socket.on('estadoJuego', (estado) => {
    ULTIMO_ESTADO = estado;
    if (pedirEstadoTimer) { clearInterval(pedirEstadoTimer); pedirEstadoTimer = null; }
    renderJuego(); // SIEMPRE render acá
  });

  // Fase de votación (placeholder)
  socket.on('faseVotacion', ({ palabras }) => {
    // Muestra la pantalla de votación
    const div = document.getElementById("juego");
    div.innerHTML = `<h2>Votación</h2>
      <ul>${palabras.map(p => `<li><b>${p.nombre}:</b> ${p.palabra}</li>`).join("")}</ul>
      <div id="votacionOpciones"></div>`;

    // Opciones de voto
    socket.emit('pedirEstadoJuego', { sala: salaActual });
  });

  socket.on('estadoJuego', (estado) => {
    if (estado === 'votacion_turnos') {
      const jugadores = ULTIMO_ESTADO.jugadores;
      const espectadores = ULTIMO_ESTADO.espectadores||[];
      const setEsp = new Set(espectadores);
      const activos = jugadores.filter(j=>!setEsp.has(j.id));
      const esMiTurno = turnoId===MI_SOCKET_ID;
      const jugadorTurno = jugadores.find(j=>j.id===turnoId);

      const votosConteo = ULTIMO_ESTADO.votosConteo||{};
      const marcador = activos.map(j=>{
        const c=votosConteo[j.id]||0;
        return `<div>${j.nombre}: <b>${c}</b> voto${c===1?'':'s'}</div>`;
      }).join('');

      let votoHtml = `<div><h3>Votación</h3>${marcador||'<i>Aún sin votos</i>'}</div>`;

      if (esMiTurno && !setEsp.has(MI_SOCKET_ID)) {
        const opciones = activos.filter(j=>j.id!==MI_SOCKET_ID)
          .map(j=>`<button class="op-voto" data-id="${j.id}">${j.nombre}</button>`).join(" ");
        votoHtml+=`<h2>Es tu turno de votar</h2>${opciones}`;
      } else {
        votoHtml+=`<h2>Es turno de ${jugadorTurno?jugadorTurno.nombre:'...'} para votar</h2>`;
      }

      root.innerHTML = rolHtml + chatHtml + votoHtml;

      if (esMiTurno && !setEsp.has(MI_SOCKET_ID)) {
        root.querySelectorAll('.op-voto').forEach(btn=>{
          btn.addEventListener('click',()=>{
            const votedId=btn.getAttribute('data-id');
            socket.emit('enviarVotoTurno',{sala:salaActual,votedId});
          });
        });
      }
      return;
    }
  });

  // Feedback corto
  socket.on('toast', ({ tipo, msg }) => {
    alert(msg);
  });

  socket.on('juegoTerminado', ({ motivo, palabras }) => {
    // mensaje corto
    alert(motivo);
    // volver directo a la sala
    document.getElementById('juego').style.display = 'none';
    document.getElementById('sala').style.display = 'block';
    ULTIMO_ESTADO = { estado: 'esperando', jugadores: [], turnoId: null, palabras: [] };
    socket.emit('pedirInfoSala', salaActual); // refresca lobby de esa sala
  });


  // expulsado por admin
  socket.on('expulsado', () => {
    alert("Fuiste expulsado de la sala.");
    location.reload();
  });

  // ---------- UI de juego mínima ----------
  function renderJuego() {
    const root = document.getElementById('juego');
    const { estado, jugadores, turnoId, palabras } = ULTIMO_ESTADO;

    // Si todavía no llegó el turno, mostramos placeholder y salimos
    if (!turnoId && estado !== 'votacion') {
      root.innerHTML = `<p><i>Cargando estado de la ronda...</i></p>`;
      return;
    }

    const jugadorTurno = jugadores.find(j => j.id === turnoId);
    const esMiTurno = (turnoId === MI_SOCKET_ID);
    const nombreTurno = jugadorTurno ? jugadorTurno.nombre : "...";

    // Log de depuración
    console.log(">> TURNO ACTUAL:", turnoId, jugadorTurno ? jugadorTurno.nombre : "???", "| soy:", MI_SOCKET_ID);

    // Cabecera: tu “jugador” (palabra real o señuelo)
    
    
    const rolHtml = `
      <div id="miRol" style="margin-bottom:12px; padding:10px 14px; background:#1e7c1e; border-radius:8px;">
        ${MI_ROL.esImpostor == false ?`<b>Tu jugador es:</b> <span>${MI_ROL.jugador || '...'}</span>` : `<b style="color:red;">sos el impostor</b>`}
      </div>
    `;

    // Chat de palabras (todos lo ven)
    const chatHtml = `
      <div id="chatPalabras" style="margin-bottom:12px;">
        <h3>Palabras</h3>
        ${palabras.length === 0
          ? '<i>Aún no hay palabras</i>'
          : palabras.map(p => `<div><b>${p.nombre}:</b> ${p.palabra}</div>`).join('')}
      </div>
    `;

    // Turno actual EXACTO como pediste
    let turnoHtml = '';
    if (estado === 'turnos') {
      turnoHtml = esMiTurno
        ? `
          <div id="turno">
            <h2>Es tu turno</h2>
            <div style="margin-top:8px;">
              <input id="inputPalabra" type="text" placeholder="Escribe tu palabra" />
              <button id="btnEnviarPalabra">Enviar</button>
            </div>
          </div>
        `
        : `
          <div id="turno">
            <h2>Es turno de ${nombreTurno}</h2>
            <p style="margin:6px 0;">Esperá tu turno…</p>
          </div>
        `;
    } else if (estado === 'votacion') {
      turnoHtml = `<h2>Pasando a votación...</h2>`;
    } else {
      turnoHtml = `<h2>Esperando para comenzar...</h2>`;
    }

    root.innerHTML = rolHtml + chatHtml + turnoHtml;

    // Si es mi turno, bind del botón
    const btn = document.getElementById('btnEnviarPalabra');
    if (btn) {
      const inp = document.getElementById('inputPalabra');
      inp?.focus();
      btn.addEventListener('click', () => {
        const val = (inp?.value || '').trim();
        if (!val) return alert('Escribe una palabra.');
        socket.emit('enviarPalabra', { sala: salaActual, palabra: val });
        inp.value = '';
        btn.disabled = true; // evita doble envío; el server avanza y re-renderiza en todos
      });
    }
    if (estado === 'votacion_turnos') {
      const setEspec = new Set(ULTIMO_ESTADO.espectadores || []);
      const activos = jugadores.filter(j => !setEspec.has(j.id));
      const esMiTurno = (turnoId === MI_SOCKET_ID);
      const jugadorTurno = jugadores.find(j => j.id === turnoId);
      const nombreTurno = jugadorTurno ? jugadorTurno.nombre : '...';

      const tablaVotos = Object.keys(ULTIMO_ESTADO.votosConteo || {}).length
        ? activos.map(j => {
            const c = ULTIMO_ESTADO.votosConteo[j.id] || 0;
            return `<div>${j.nombre}: <b>${c}</b> voto${c===1?'':'s'}</div>`;
          }).join('')
        : '<i>Aún sin votos</i>';

      let html = `
        <div id="miRol" class="panel">
          <b>${MI_ROL.esImpostor ? 'Sos el impostor' : 'Tu jugador es'}:</b> ${MI_ROL.esImpostor ? '' : (MI_ROL.jugador || '...')}
        </div>
        <div class="panel">
          <h3>Votación (por turnos)</h3>
          <div style="margin-bottom:8px">${tablaVotos}</div>
      `;

      if (esMiTurno) {
        const opciones = activos
          .filter(j => j.id !== MI_SOCKET_ID)
          .map(j => `<button class="op-voto" data-id="${j.id}">${j.nombre}</button>`)
          .join(' ');
        html += `
          <h2>Es tu turno de votar</h2>
          <p>¿Quién creés que es el impostor?</p>
          <div>${opciones}</div>
        `;
      } else {
        html += `<h2>Es turno de ${nombreTurno} para votar</h2><p>Esperá tu turno…</p>`;
      }

      html += `</div>`;
      root.innerHTML = html;

      if (esMiTurno) {
        root.querySelectorAll('.op-voto').forEach(btn => {
          btn.addEventListener('click', () => {
            const votedId = btn.getAttribute('data-id');
            socket.emit('enviarVotoTurno', { sala: salaActual, votedId });
          });
        });
      }
      return;
    }

  }

  // ---------- bootstrap ----------
  listarSalas();

  // ---------- exponer a window (para HTML) ----------
  window.mostrarCrearSala = mostrarCrearSala;
  window.volverLobby = volverLobby;
  window.togglePassword = togglePassword;
  window.crearSala = crearSala;
  window.unirseSala = unirseSala;
  window.mostrarSala = mostrarSala;
  window.mostrarSalaInfo = mostrarSalaInfo;
  window.expulsarJugador = expulsarJugador;
  window.iniciarJuegoOnline = iniciarJuegoOnline;
  window.salirSala = salirSala;
});
