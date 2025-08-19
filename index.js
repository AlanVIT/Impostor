// index.js
document.addEventListener("DOMContentLoaded", () => {
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
    const nombre = document.getElementById("nombreSala").value;
    usuarioActual = document.getElementById("usuarioSala").value;
    const publica = document.getElementById("tipoSala").value === "publica";
    const password = publica ? null : document.getElementById("passwordSala").value;
    const maxJugadores = parseInt(document.getElementById("maxJugadoresSala").value, 10);
    const impostores = parseInt(document.getElementById("impostoresSala").value, 10);

    socket.emit('crearSala',
      { nombre, publica, password, maxJugadores, impostores, usuario: usuarioActual },
      (res) => {
        if (res.ok) {
          salaActual = res.id;
          mostrarSala();
          socket.emit('pedirInfoSala', salaActual);
        } else {
          alert(res.error || "Error al crear sala");
        }
      }
    );
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
    salaActual = sala.id;
    mostrarSala();
    mostrarSalaInfo(sala);
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
    const cont = document.getElementById('juego');
    cont.innerHTML = `
      <h2>Fase de votación</h2>
      <div id="chatPalabras">
        ${palabras.map(p => `<div><b>${p.nombre}:</b> ${p.palabra}</div>`).join('')}
      </div>
      <p>(Pendiente implementar: UI de voto)</p>
    `;
  });

  // Feedback corto
  socket.on('toast', ({ tipo, msg }) => {
    alert(msg);
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
