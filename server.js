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
const PALABRAS = [
  "messi","maradona","riquelme","tevez","batistuta",
  "haaland","mbappe","benzema","modric","ronaldo",
  "cavani","di maria","mac allister","de paul","otamendi"
];

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
    const sala = salas[id];
    if (!sala) return cb({ ok: false, error: "Sala no existe" });
    if (!sala.publica && sala.password !== password) return cb({ ok: false, error: "Contraseña incorrecta" });
    if (sala.jugadores.length >= sala.maxJugadores) return cb({ ok: false, error: "Sala llena" });

    sala.jugadores.push({ id: socket.id, nombre: usuario });
    socket.join(id);
    cb({ ok: true });

    io.to(id).emit('jugadoresSala', sala.jugadores);
    io.to(id).emit('infoSala', sala);
    io.emit('salasDisponibles', mapSalasPublicas());
  });

  // Snapshot puntual de info de sala
  socket.on('pedirInfoSala', (id) => {
    const sala = salas[id];
    if (sala) socket.emit('infoSala', sala);
  });

  // Snapshot del estado del juego (evita carreras)
  socket.on('pedirEstadoJuego', ({ sala }) => {
    emitirEstadoJuego(sala);
  });

  // ==========================
  // INICIAR JUEGO (solo admin)
  // ==========================
  socket.on('iniciarJuego', ({ sala }) => {
    const s = salas[sala];
    if (!s) return;
    if (s.admin !== socket.id) return; // Solo admin

    if (s.jugadores.length < 3) {
      io.to(socket.id).emit('toast', { tipo: 'error', msg: 'Se necesitan al menos 3 jugadores.' });
      return;
    }

    // Palabra secreta para los no-impostores
    const palabraSecreta = PALABRAS[Math.floor(Math.random() * PALABRAS.length)];
    // Impostor aleatorio
    const impostorIdx = Math.floor(Math.random() * s.jugadores.length);
    const impostorId = s.jugadores[impostorIdx].id;

    // Señuelo distinto de la palabraSecreta (para el impostor)
    let señuelo = palabraSecreta;
    while (señuelo === palabraSecreta) {
      señuelo = PALABRAS[Math.floor(Math.random() * PALABRAS.length)];
    }

    s.estado = 'turnos';
    s.ronda = {
      palabraSecreta,
      impostorId,
      turnoIndex: 0,
      palabras: [], // { id, nombre, palabra }
      votos: {}     // voterId -> votedId (para futura fase votación)
    };

    // Enviar rol PRIVADO a cada uno:
    s.jugadores.forEach(j => {
      const esImpostor = j.id === impostorId;
      const jugadorAsignado = esImpostor ? señuelo : palabraSecreta;
      io.to(j.id).emit('tuRol', {
        esImpostor,
        jugador: jugadorAsignado
      });
    });

    // Aviso general + estado inicial
    io.to(sala).emit('juegoIniciado', { mensaje: '¡El juego ha comenzado!' });
    emitirEstadoJuego(sala);
  });

  // ====================================
  // RECIBIR PALABRA (turnos, validación)
  // ====================================
  socket.on('enviarPalabra', ({ sala, palabra }) => {
    const s = salas[sala];
    if (!s || s.estado !== 'turnos' || !s.ronda) return;

    const { turnoIndex } = s.ronda;
    const jugadorDelTurno = s.jugadores[turnoIndex];
    if (!jugadorDelTurno) return;

    // Solo el que está de turno puede enviar
    if (jugadorDelTurno.id !== socket.id) {
      io.to(socket.id).emit('toast', { tipo: 'error', msg: 'No es tu turno.' });
      return;
    }

    const texto = String(palabra || '').trim();
    if (!texto) {
      io.to(socket.id).emit('toast', { tipo: 'error', msg: 'Escribe una palabra.' });
      return;
    }

    // Guardar palabra y avanzar turno
    s.ronda.palabras.push({ id: socket.id, nombre: jugadorDelTurno.nombre, palabra: texto });
    s.ronda.turnoIndex++;

    // ¿Terminaron todos?
    if (s.ronda.turnoIndex >= s.jugadores.length) {
      s.estado = 'votacion';
      emitirEstadoJuego(sala);
      io.to(sala).emit('faseVotacion', { palabras: s.ronda.palabras });
      return;
    }

    emitirEstadoJuego(sala);
  });

  // Expulsar jugador (solo admin)
  socket.on('expulsarJugador', ({ sala, idJugador }) => {
    const s = salas[sala];
    if (!s) return;
    if (s.admin !== socket.id) return;

    s.jugadores = s.jugadores.filter(j => j.id !== idJugador);
    io.to(sala).emit('infoSala', s);
    io.to(idJugador).emit('expulsado');
    emitirEstadoJuego(sala);
  });

  // Salir voluntariamente
  socket.on('salirSala', ({ sala }) => {
    const s = salas[sala];
    if (!s) return;
    s.jugadores = s.jugadores.filter((j) => j.id !== socket.id);
    socket.leave(sala);

    if (s.jugadores.length === 0) {
      delete salas[sala];
    } else {
      if (s.admin === socket.id) s.admin = s.jugadores[0]?.id;
      io.to(sala).emit('infoSala', s);
      emitirEstadoJuego(sala);
    }
    io.emit('salasDisponibles', mapSalasPublicas());
  });

  // Desconexión
  socket.on('disconnect', () => {
    for (const id in salas) {
      const s = salas[id];
      const antes = s.jugadores.length;
      s.jugadores = s.jugadores.filter((j) => j.id !== socket.id);
      if (s.jugadores.length === 0) {
        delete salas[id];
      } else if (antes !== s.jugadores.length) {
        if (s.admin === socket.id) s.admin = s.jugadores[0]?.id;
        io.to(id).emit('infoSala', s);
        emitirEstadoJuego(id);
      }
    }
    io.emit('salasDisponibles', mapSalasPublicas());
  });
});

// ----------------------
// Helpers de broadcast
// ----------------------
function emitirEstadoJuego(idSala) {
  const s = salas[idSala];
  if (!s) return;
  const turnoId = (s.estado === 'turnos' && s.ronda)
    ? s.jugadores[s.ronda.turnoIndex]?.id
    : null;

  const nombreTurno = s.jugadores.find(j => j.id === turnoId)?.nombre;
  console.log(`[estadoJuego] sala=${idSala} estado=${s.estado} turnoIndex=${s.ronda?.turnoIndex} turnoId=${turnoId} nombre=${nombreTurno}`);

  io.to(idSala).emit('estadoJuego', {
    estado: s.estado,                       // 'turnos' | 'votacion' | 'esperando'
    jugadores: s.jugadores.map(j => ({ id: j.id, nombre: j.nombre })),
    turnoId,                                // socket.id del que debe jugar ahora (si corresponde)
    palabras: s.ronda?.palabras || []       // lista de {id, nombre, palabra}
  });
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
