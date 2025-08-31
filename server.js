// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Estructura: { [idSala]: { id, nombre, publica, password, admin, jugadores:[{id,nombre}], maxJugadores, impostores, estado, ronda? } }
let salas = {};

// Palabras/temas posibles

  const CATEGORIAS = {
    "futbol general": [], // se completa en runtime
    "futbol argentino": [
      "adrián 'maravilla' martínez","braian romero","claudio aquino","edinson cavani",
      "ever banega","facundo colidio","franco jara","franco mastantuono","gabriel ávalos",
      "ignacio malcorra","marcelino moreno","mateo pellegrino","miguel borja","miguel merentiel",
      "milton giménez","sebastián villa","walter bou","alejo véliz",
      "ángel di maría","giuliano galoppo","valentin gomez"
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
  CATEGORIAS["futbol general"] = Object.entries(CATEGORIAS)
  .filter(([k]) => k !== "futbol general")
  .flatMap(([, arr]) => arr);

app.use(express.static(__dirname)); // sirve index.html, index.js, styles.css, etc.

io.on('connection', (socket) => {
  // Lobby inicial
  socket.emit('salasDisponibles', mapSalasPublicas());

  // Crear sala
  socket.on('crearSala', (data, cb) => {
    try {
      const yaAdmin = Object.values(salas).some((s) => s.admin === socket.id);
      if (yaAdmin) return cb?.({ ok: false, error: 'Ya eres admin de una sala.' });

      const id = Math.random().toString(36).slice(2, 10);
      salas[id] = {
        id,
        nombre: data.nombre?.trim() || 'Sala',
        publica: !!data.publica,
        password: data.publica ? null : (data.password || ''),
        admin: socket.id,
        jugadores: [{ id: socket.id, nombre: data.usuario?.trim() || 'Jugador' }],
        maxJugadores: Number(data.maxJugadores) || 6,
        impostores: Number(data.impostores) || 1,
        estado: 'esperando',
        categoriasSeleccionadas: Array.isArray(data.categoriasSeleccionadas) ? data.categoriasSeleccionadas : []
      };

      socket.join(id);
      cb?.({ ok: true, id });

      io.to(id).emit('infoSala', salas[id]);
      io.emit('salasDisponibles', mapSalasPublicas());
    } catch {
      cb?.({ ok: false, error: 'No se pudo crear la sala.' });
    }
  });

  // Listar salas
  socket.on('listarSalas', () => {
    socket.emit('salasDisponibles', mapSalasPublicas());
  });

  // Unirse a sala
socket.on('unirseSala', ({ id, password, usuario }, cb) => {
  const s = salas[id];
  if (!s) return cb({ ok: false, error: "Sala no existe" });

  // Validar password si es privada
  if (!s.publica && s.password !== password) {
    return cb({ ok: false, error: "Contraseña incorrecta" });
  }

  // LOBBY: respeta el límite de jugadores
  if (s.estado === 'esperando') {
    if (s.jugadores.length >= s.maxJugadores) {
      return cb({ ok: false, error: "Sala llena" });
    }
    s.jugadores.push({ id: socket.id, nombre: usuario });
    socket.join(id);
    cb({ ok: true });
    io.to(id).emit('infoSala', s);
    io.emit('salasDisponibles', mapSalasPublicas());
    return;
  }

  // PARTIDA EN CURSO → entra como ESPECTADOR (no participa, solo observa)
s.jugadores.push({ id: socket.id, nombre: usuario });
socket.join(id);

if (!s.ronda) s.ronda = { espectadores: [] };
s.ronda.espectadores = s.ronda.espectadores || [];
if (!s.ronda.espectadores.includes(socket.id)) {
  s.ronda.espectadores.push(socket.id);
}

// avisos + pantalla juego para el que entra
io.to(socket.id).emit('toast', {
  tipo: 'info',
  msg: 'Te uniste como espectador. Vas a ver la partida pero no participás hasta el próximo lobby.'
});
io.to(socket.id).emit('juegoIniciado', { mensaje: 'Te uniste como espectador' }); // fuerza vista juego
io.to(socket.id).emit('tuRol', { esImpostor: false, jugador: '' }); // no revelar palabra

cb({ ok: true });

// actualizar sala y empujar estado actual para que lo renderice
io.to(id).emit('infoSala', s);
emitirEstadoJuego(id);
});


  // ==========================
  // INICIAR JUEGO (solo admin)
  // ==========================
socket.on('iniciarJuego', (data) => {
  const { sala, categoriasSeleccionadas } = data;
  const s = salas[sala];
  if (!s) return;
  if (s.admin !== socket.id) return;
  if (s.jugadores.length < 3) {
    io.to(socket.id).emit('toast', { tipo: 'error', msg: 'Se necesitan al menos 3 jugadores.' });
    return;
  }

  // Guardar selección de categorías en la sala
  const seleccion = Array.isArray(data?.categoriasSeleccionadas)
    ? data.categoriasSeleccionadas
    : (s.categoriasSeleccionadas || []);
  s.categoriasSeleccionadas = seleccion;

  // Construir pool de palabras según selección
  let pool = [];
  if (seleccion.includes("futbol general")) {
    pool = CATEGORIAS["futbol general"];
  } else {
    pool = seleccion.flatMap(k => CATEGORIAS[k] || []);
  }
  pool = [...new Set(pool.map(x => x.trim().toLowerCase()))];

  if (pool.length < 2) {
    pool = CATEGORIAS["futbol general"];
  }

  // Elegir palabra secreta (no-impostor) y señuelo (impostor)
  const palabraSecreta = pool[Math.floor(Math.random() * pool.length)];
  let señuelo = palabraSecreta;
  while (señuelo === palabraSecreta) {
    señuelo = pool[Math.floor(Math.random() * pool.length)];
  }

  // Elegir impostor
  const impostorIdx = Math.floor(Math.random() * s.jugadores.length);
  const impostorId = s.jugadores[impostorIdx].id;

  s.estado = 'turnos';
  s.ronda = {
    palabraSecreta,
    impostorId,
    turnoIndex: 0,
    palabras: [],
    votos: {},
    votosConteo: {},
    votoIndex: 0,
    espectadores: [],
    orden: s.jugadores.map(j => j.id)
  };

  // Enviar rol a cada jugador
  s.jugadores.forEach(j => {
    const esImpostor = j.id === impostorId;
    io.to(j.id).emit('tuRol', { esImpostor, jugador: esImpostor ? señuelo : palabraSecreta });
  });

  io.to(sala).emit('juegoIniciado', { mensaje: '¡El juego ha comenzado!' });
  emitirEstadoJuego(sala);
});

  // ====================================
  // RECIBIR PALABRA (turnos, validación)
  // ====================================
socket.on('enviarPalabra', ({ sala, palabra }) => {
  const s = salas[sala];                   // 👈 faltaba esto
  if (!s || s.estado !== 'turnos' || !s.ronda) return;

  // quién juega ahora según orden fijo
  const idTurno = s.ronda.orden?.[s.ronda.turnoIndex];
  if (!idTurno) return;

  if (idTurno !== socket.id) {
    io.to(socket.id).emit('toast', { tipo: 'error', msg: 'No es tu turno.' });
    return;
  }

  const texto = String(palabra || '').trim();
  if (!texto) {
    io.to(socket.id).emit('toast', { tipo: 'error', msg: 'Escribe una palabra.' });
    return;
  }

  const jugadorDelTurno = s.jugadores.find(j => j.id === idTurno);
  s.ronda.palabras.push({ id: socket.id, nombre: jugadorDelTurno?.nombre || 'Jugador', palabra: texto });
  s.ronda.turnoIndex++;

  // ¿terminaron todos los de la lista "orden"?
  if (s.ronda.turnoIndex >= (s.ronda.orden?.length || 0)) {
    // Pasamos a VOTACIÓN POR TURNOS con un ORDEN FIJO de votación
    s.estado = 'votacion_turnos';
    s.ronda.votoIndex = 0;
    s.ronda.votos = {};
    s.ronda.votosConteo = {};
    s.ronda.ordenVoto = s.jugadores
      .filter(j => !(s.ronda.espectadores || []).includes(j.id))
      .map(j => j.id); // ← orden fijo de votación
    emitirEstadoJuego(sala);
    return;
  }

  emitirEstadoJuego(sala);
});

  // --- RECIBIR VOTO ---
socket.on('enviarVotoTurno', ({ sala, votedId }) => {
  const s = salas[sala];
  if (!s || s.estado !== 'votacion_turnos' || !s.ronda) return;

  // Activos = jugadores que NO están en espectadores
  const activos = s.jugadores.filter(j => !(s.ronda.espectadores || []).includes(j.id));

  // ¿Quién vota ahora? (orden de votación fijo)
  const idTurnoVoto = s.ronda.ordenVoto?.[s.ronda.votoIndex ?? 0];
  const votaAhora = idTurnoVoto ? s.jugadores.find(j => j.id === idTurnoVoto) : null;
  if (!votaAhora) return;

  // Validaciones
  if (votaAhora.id !== socket.id) {
    io.to(socket.id).emit('toast', { tipo: 'error', msg: 'No es tu turno de votar.' });
    return;
  }
  if (socket.id === votedId) {
    io.to(socket.id).emit('toast', { tipo: 'error', msg: 'No podés votarte a vos mismo.' });
    return;
  }
  if (!activos.some(j => j.id === votedId)) {
    io.to(socket.id).emit('toast', { tipo: 'error', msg: 'Ese jugador no puede ser votado.' });
    return;
  }

  // Registrar voto y actualizar conteo en vivo
  s.ronda.votos[socket.id] = votedId;
  s.ronda.votosConteo[votedId] = (s.ronda.votosConteo[votedId] || 0) + 1;

  // Avanzar al siguiente votante
  s.ronda.votoIndex++;

  // ¿Terminaron de votar todos los activos?
  if (s.ronda.votoIndex >= (s.ronda.ordenVoto?.length || 0)) {
    // Conteo final (empates se resuelven al azar entre los más votados)
    const conteo = { ...s.ronda.votosConteo };
    let max = 0, empatados = [];
    for (const [id, cant] of Object.entries(conteo)) {
      if (cant > max) { max = cant; empatados = [id]; }
      else if (cant === max) { empatados.push(id); }
    }
    const eliminadoId = empatados[Math.floor(Math.random() * empatados.length)];
    const eliminado = s.jugadores.find(j => j.id === eliminadoId);
    const eraImpostor = (eliminadoId === s.ronda.impostorId);

    if (eraImpostor) {
      // Si el más votado es el impostor → fin del juego
      finalizarYVolverALobby(sala, 'Perdió el impostor, ganan los jugadores');
      return;
    }

    // No era impostor → pasa a espectador y la partida continúa
    if (!s.ronda.espectadores.includes(eliminadoId)) {
      s.ronda.espectadores.push(eliminadoId);
    }

    // Chequeo especial: si quedan exactamente 2 activos y uno es el impostor → gana el impostor
    const activosPost = s.jugadores.filter(j => !s.ronda.espectadores.includes(j.id));
    if (activosPost.length === 2 && activosPost.some(j => j.id === s.ronda.impostorId)) {
      finalizarYVolverALobby(sala, 'Ganó el impostor');
      return;
    }

    // Aviso y preparar nueva ronda de palabras (mismo impostor)
    io.to(sala).emit('toast', {
      tipo: 'info',
      msg: `${eliminado?.nombre || 'Alguien'} fue eliminado y pasa a espectador. Nueva ronda.`
    });

    s.estado = 'turnos';
    s.ronda.palabras = [];
    s.ronda.votos = {};
    s.ronda.votosConteo = {};
    s.ronda.turnoIndex = 0;
    s.ronda.votoIndex = 0;
    s.ronda.orden = s.jugadores
      .filter(j => !s.ronda.espectadores.includes(j.id))
      .map(j => j.id);          // nuevo orden fijo para la próxima ronda
    s.ronda.ordenVoto = [];     // se recalcula cuando pasemos otra vez a votación

    emitirEstadoJuego(sala);
  } else {
    // Aún faltan votos → actualizar para que todos vean el conteo
    emitirEstadoJuego(sala);
  }
});

  // Expulsar jugador (solo admin)
socket.on('expulsarJugador', ({ sala, idJugador }) => {
  const s = salas[sala];
  if (!s) return;
  if (s.admin !== socket.id) return;

  const expulsado = s.jugadores.find(j => j.id === idJugador);
  s.jugadores = s.jugadores.filter(j => j.id !== idJugador);
  if (s.ronda) {
    s.ronda.espectadores = (s.ronda.espectadores || []).filter(id => id !== idJugador);
  }

  if (s.jugadores.length === 0) {
    delete salas[sala];
    io.emit('salasDisponibles', mapSalasPublicas());
    return;
  }

  if (s.admin === idJugador) s.admin = s.jugadores[0]?.id;

  // Ajustar órdenes/índices tras la salida
  ajustarIndicesTrasSalida(s, idJugador);

  if (s.estado === 'turnos' || s.estado === 'votacion_turnos') {
    const eraImpostor = s.ronda?.impostorId === idJugador;

    if (eraImpostor) {
      finalizarYVolverALobby(sala, 'Perdió el impostor, ganan los jugadores');
      return;
    }

    // Si estábamos en turnos y ya no queda nadie en la orden, pasar a votación
    if (s.estado === 'turnos') {
      if (s.ronda.turnoIndex >= (s.ronda.orden?.length || 0)) {
        s.estado = 'votacion_turnos';
        s.ronda.votoIndex = 0;
        s.ronda.votos = {};
        s.ronda.votosConteo = {};
        s.ronda.ordenVoto = jugadoresActivos(s).map(j => j.id);
      }
    }

    // ⚠️ Calculamos activos AHORA (no usar variable inexistente)
    const activosAhora = jugadoresActivos(s);
    if (activosAhora.length === 2 && activosAhora.some(j => j.id === s.ronda.impostorId)) {
      finalizarYVolverALobby(sala, 'Ganó el impostor');
      return;
    }

    io.to(sala).emit('toast', { tipo: 'info', msg: `${expulsado?.nombre || 'Un jugador'} fue expulsado. La partida sigue.` });
    io.to(sala).emit('infoSala', s);
    emitirEstadoJuego(sala);
  } else {
    io.to(sala).emit('infoSala', s);
    emitirEstadoJuego(sala);
  }

  io.emit('salasDisponibles', mapSalasPublicas());
});


  // Salir voluntariamente
socket.on('salirSala', ({ sala }) => {
  const s = salas[sala];
  if (!s) return;

  const jugador = s.jugadores.find(j => j.id === socket.id);

  s.jugadores = s.jugadores.filter(j => j.id !== socket.id);
  if (s.ronda) {
    s.ronda.espectadores = (s.ronda.espectadores || []).filter(id => id !== socket.id);
  }
  socket.leave(sala);

  if (s.jugadores.length === 0) {
    delete salas[sala];
    io.emit('salasDisponibles', mapSalasPublicas());
    return;
  }

  if (s.admin === socket.id) s.admin = s.jugadores[0]?.id;

  // Ajustar órdenes/índices tras la salida
  ajustarIndicesTrasSalida(s, socket.id);

  if (s.estado === 'turnos' || s.estado === 'votacion_turnos') {
    const eraImpostor = s.ronda?.impostorId === socket.id;

    if (eraImpostor) {
      finalizarYVolverALobby(sala, 'Perdió el impostor, ganan los jugadores');
      return;
    }

    // Si estábamos en turnos y ya no queda nadie en la orden, pasar a votación
    if (s.estado === 'turnos') {
      if (s.ronda.turnoIndex >= (s.ronda.orden?.length || 0)) {
        s.estado = 'votacion_turnos';
        s.ronda.votoIndex = 0;
        s.ronda.votos = {};
        s.ronda.votosConteo = {};
        s.ronda.ordenVoto = jugadoresActivos(s).map(j => j.id);
      }
    }

    // ⚠️ Calculamos activos AHORA
    const activosAhora = jugadoresActivos(s);
    if (activosAhora.length === 2 && activosAhora.some(j => j.id === s.ronda.impostorId)) {
      finalizarYVolverALobby(sala, 'Ganó el impostor');
      return;
    }

    io.to(sala).emit('toast', { tipo: 'info', msg: `${jugador?.nombre || 'Un jugador'} salió. La partida sigue.` });
    io.to(sala).emit('infoSala', s);
    emitirEstadoJuego(sala);
  } else {
    io.to(sala).emit('infoSala', s);
    emitirEstadoJuego(sala);
  }

  io.emit('salasDisponibles', mapSalasPublicas());
});



// Desconexión
socket.on('disconnect', () => {
  for (const id in salas) {
    const s = salas[id];
    const jugador = s.jugadores.find(j => j.id === socket.id);
    if (!jugador) continue;

    s.jugadores = s.jugadores.filter(j => j.id !== socket.id);
    if (s.ronda) {
      s.ronda.espectadores = (s.ronda.espectadores || []).filter(uid => uid !== socket.id);
    }

    if (s.jugadores.length === 0) {
      delete salas[id];
      continue;
    }

    if (s.admin === socket.id) s.admin = s.jugadores[0]?.id;

    // Ajustar órdenes/índices tras la salida
    ajustarIndicesTrasSalida(s, socket.id);

    if (s.estado === 'turnos' || s.estado === 'votacion_turnos') {
      const eraImpostor = s.ronda?.impostorId === socket.id;
      if (eraImpostor) {
        finalizarYVolverALobby(id, 'Perdió el impostor, ganan los jugadores');
        continue;
      }

      // Si estábamos en turnos y ya no queda nadie en la orden, pasar a votación
      if (s.estado === 'turnos') {
        if (s.ronda.turnoIndex >= (s.ronda.orden?.length || 0)) {
          s.estado = 'votacion_turnos';
          s.ronda.votoIndex = 0;
          s.ronda.votos = {};
          s.ronda.votosConteo = {};
          s.ronda.ordenVoto = jugadoresActivos(s).map(j => j.id);
        }
      }

      // ⚠️ Calculamos activos AHORA
      const activosAhora = jugadoresActivos(s);
      if (activosAhora.length === 2 && activosAhora.some(j => j.id === s.ronda.impostorId)) {
        finalizarYVolverALobby(id, 'Ganó el impostor');
      } else {
        io.to(id).emit('toast', { tipo: 'info', msg: `${jugador.nombre} se desconectó. La partida sigue.` });
        io.to(id).emit('infoSala', s);
        emitirEstadoJuego(id);
      }
    } else {
      io.to(id).emit('infoSala', s);
      emitirEstadoJuego(id);
    }
  }

  io.emit('salasDisponibles', mapSalasPublicas());
});




//
});
// ----------------------
// Helpers de broadcast
// ----------------------
function emitirEstadoJuego(idSala) {
  const s = salas[idSala];
  if (!s) return;

  let turnoId = null;
  if (s.estado === 'turnos' && s.ronda) {
    const activos = jugadoresActivos(s);
    turnoId = activos[s.ronda.turnoIndex]?.id || null;
  } else if (s.estado === 'votacion_turnos' && s.ronda) {
    const activos = jugadoresActivos(s);
    turnoId = activos[s.ronda.votoIndex]?.id || null;
  }

  io.to(idSala).emit('estadoJuego', {
    estado: s.estado, // 'turnos' | 'votacion_turnos' | 'esperando'
    jugadores: s.jugadores.map(j => ({ id: j.id, nombre: j.nombre })),
    espectadores: s.ronda?.espectadores || [],
    turnoId,
    palabras: s.ronda?.palabras || [],
    votosConteo: s.ronda?.votosConteo || {}
    
  });
}

function finalizarPartida(idSala, motivo) {
  const s = salas[idSala];
  if (!s) return;
  s.estado = 'terminado'; // NO volver a 'esperando' aquí
  io.to(idSala).emit('juegoTerminado', {
    motivo,
    impostorId: s.ronda?.impostorId || null,
    palabras: s.ronda?.palabras || []
  });
  emitirEstadoJuego(idSala); // emite con turnoId=null al no estar en 'turnos'
}

function ajustarIndicesTrasSalida(s, removedId) {
  if (!s || !s.ronda) return;

  // --- ORDEN de PALABRAS (turnos)
  if (Array.isArray(s.ronda.orden)) {
    const pos = s.ronda.orden.indexOf(removedId);
    if (pos !== -1) {
      s.ronda.orden.splice(pos, 1);
      // si el que se fue estaba antes del puntero, retrocedemos el índice
      if (pos < s.ronda.turnoIndex) {
        s.ronda.turnoIndex = Math.max(0, s.ronda.turnoIndex - 1);
      }
    }

    // si el índice quedó más allá del final, lo llevamos al último
    if (s.ronda.turnoIndex > s.ronda.orden.length) {
      s.ronda.turnoIndex = s.ronda.orden.length;
    }

    // si estamos en "turnos" y ya no queda nadie para decir palabra → pasar a votación
    if (s.estado === 'turnos' && s.ronda.turnoIndex >= (s.ronda.orden?.length || 0)) {
      s.estado = 'votacion_turnos';
      s.ronda.votoIndex = 0;
      s.ronda.votos = {};
      s.ronda.votosConteo = {};
      s.ronda.ordenVoto = jugadoresActivos(s).map(j => j.id);
    }
  }

  // --- ORDEN de VOTACIÓN
  if (Array.isArray(s.ronda.ordenVoto)) {
    const posV = s.ronda.ordenVoto.indexOf(removedId);
    if (posV !== -1) {
      s.ronda.ordenVoto.splice(posV, 1);
      if (posV < s.ronda.votoIndex) {
        s.ronda.votoIndex = Math.max(0, s.ronda.votoIndex - 1);
      }
    }
    if (s.ronda.votoIndex > (s.ronda.ordenVoto?.length || 0)) {
      s.ronda.votoIndex = Math.max(0, (s.ronda.ordenVoto?.length || 0));
    }
  }
}

// Si quedan exactamente 2 jugadores activos y uno es el impostor, termina la partida.
// Devuelve true si finalizó, false si sigue.
function chequearFinSiDosJugadores(s, salaId) {
  if (!s || !s.ronda) return false;
  const activos = jugadoresActivos(s);
  if (activos.length === 2 && activos.some(j => j.id === s.ronda.impostorId)) {
    finalizarYVolverALobby(salaId, 'Ganó el impostor');
    return true;
  }
  return false;
}
function jugadoresActivos(s) {
  if (!s.ronda?.espectadores) return s.jugadores;
  const set = new Set(s.ronda.espectadores);
  return s.jugadores.filter(j => !set.has(j.id));
}

function finalizarYVolverALobby(idSala, mensaje) {
  const s = salas[idSala];
  if (!s) return;
  // avisar fin y motivo
  io.to(idSala).emit('juegoTerminado', { motivo: mensaje, palabras: s.ronda?.palabras || [] });
  // volver a lobby (permitir unirse nuevamente)
  s.estado = 'esperando';
  s.ronda = undefined;
  emitirEstadoJuego(idSala);
  io.to(idSala).emit('infoSala', s);
}
function mapSalasPublicas() {
  return Object.values(salas).map((s) => ({
    id: s.id,
    nombre: s.nombre,
    publica: s.publica,
    jugadores: s.jugadores.length,
    maxJugadores: s.maxJugadores,
  }));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Servidor listo en puerto ' + PORT));
