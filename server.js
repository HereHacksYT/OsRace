const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- Sabitler ---
const MAX_PLAYERS = 2;
const MAX_BOTS = 2;
const MAX_LAPS = 3;
const TICK_RATE = 1000 / 60;
const BROADCAST_RATE = 1000 / 20;
const CAR_RADIUS = 1.8;
const CAR_ACCELERATION = 14;
const CAR_BRAKE = 20;
const CAR_FRICTION = 0.96;
const CAR_MAX_SPEED = 25;
const CAR_STEER_SPEED = 2.8;
const BOT_STEER_SPEED = 2.4;
const TRACK_WIDTH = 14;
const TRACK_HALF = TRACK_WIDTH / 2;
const WAYPOINT_RADIUS = 5;

// Büyük, gerçekçi pist noktaları (düzlük + viraj)
const WAYPOINTS = [
    { x: 0, z: 20 },      // Başlangıç düzlüğü
    { x: 30, z: 15 },
    { x: 60, z: 5 },      // Uzun düzlük
    { x: 80, z: -15 },
    { x: 70, z: -45 },    // Viraj
    { x: 40, z: -60 },
    { x: 0, z: -55 },     // Arka düzlük
    { x: -35, z: -40 },
    { x: -60, z: -15 },   // Sol viraj
    { x: -65, z: 15 },
    { x: -45, z: 40 },    // Tepe düzlüğü
    { x: -15, z: 45 },
    { x: 0, z: 20 }       // Bitiş çizgisi
];

const START_POSITIONS = [
    { x: -3, z: 22 },
    { x: 3, z: 22 }
];

const FINISH_LINE = {
    p1: { x: -5, z: 20 },
    p2: { x: 5, z: 20 }
};

// --- Yardımcı Fonksiyonlar ---
function distance(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

function angleDifference(a, b) {
    return normalizeAngle(b - a);
}

function segmentsIntersect(p1, p2, p3, p4) {
    function ccw(a, b, c) {
        return (c.z - a.z) * (b.x - a.x) > (b.z - a.z) * (c.x - a.x);
    }
    return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}

// Pist dışı kontrolü (yol genişliğine göre)
function isOffTrack(carX, carZ) {
    let minDist = Infinity;
    for (const wp of WAYPOINTS) {
        const d = distance({ x: carX, z: carZ }, wp);
        if (d < minDist) minDist = d;
    }
    return minDist > TRACK_HALF + 2;
}

function findClosestWaypoint(x, z) {
    let minDist = Infinity;
    let closest = WAYPOINTS[0];
    for (const wp of WAYPOINTS) {
        const d = Math.hypot(wp.x - x, wp.z - z);
        if (d < minDist) { minDist = d; closest = wp; }
    }
    return closest;
}

function checkCarCollision(car1, car2) {
    const dx = car1.x - car2.x;
    const dz = car1.z - car2.z;
    const dist = Math.hypot(dx, dz);
    const minDist = CAR_RADIUS * 2;
    if (dist < minDist && dist > 0) {
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = minDist - dist;
        car1.x += nx * overlap * 0.5;
        car1.z += nz * overlap * 0.5;
        car2.x -= nx * overlap * 0.5;
        car2.z -= nz * overlap * 0.5;
        const relVel = (car1.speed * Math.cos(car1.angle) - car2.speed * Math.cos(car2.angle)) * nx +
                      (car1.speed * Math.sin(car1.angle) - car2.speed * Math.sin(car2.angle)) * nz;
        if (relVel > 0) {
            car1.speed *= 0.7;
            car2.speed *= 0.7;
        }
    }
}

const rooms = new Map();

function createRoom(roomId) {
    const room = {
        id: roomId,
        players: new Map(),
        bots: [],
        status: 'waiting',
        countdown: 0,
        raceInterval: null,
        broadcastInterval: null,
        maxLaps: MAX_LAPS,
        startTime: 0,
        prevPositions: new Map()
    };
    rooms.set(roomId, room);
    return room;
}

function getRoom(roomId) { return rooms.get(roomId); }
function removeRoom(roomId) {
    const room = rooms.get(roomId);
    if (room) {
        if (room.raceInterval) clearInterval(room.raceInterval);
        if (room.broadcastInterval) clearInterval(room.broadcastInterval);
        rooms.delete(roomId);
    }
}

function addPlayer(room, socket, playerName) {
    const idx = room.players.size;
    const pos = START_POSITIONS[idx % START_POSITIONS.length];
    const player = {
        id: socket.id,
        name: playerName || `Oyuncu ${idx+1}`,
        x: pos.x, z: pos.z,
        angle: Math.atan2(WAYPOINTS[1].x - WAYPOINTS[0].x, WAYPOINTS[1].z - WAYPOINTS[0].z),
        speed: 0, lap: 0,
        input: { up: false, down: false, left: false, right: false },
        finished: false, finishTime: 0
    };
    room.players.set(socket.id, player);
    socket.join(room.id);
    socket.roomId = room.id;
    return player;
}

function removePlayer(room, socketId) { room.players.delete(socketId); }

function createBot(index) {
    const pos = START_POSITIONS[index % 2];
    return {
        id: `bot_${index}`,
        x: pos.x + (index * 2), z: pos.z + (index * 2),
        angle: Math.atan2(WAYPOINTS[1].x - WAYPOINTS[0].x, WAYPOINTS[1].z - WAYPOINTS[0].z),
        speed: 0, lap: 0, waypointIndex: 0,
        finished: false, finishTime: 0
    };
}

function fillBots(room) {
    room.bots = [];
    for (let i = 0; i < MAX_BOTS; i++) room.bots.push(createBot(i));
}

function updateCarPhysics(car, input, dt) {
    if (car.finished) return;
    if (input.left) car.angle -= CAR_STEER_SPEED * dt;
    if (input.right) car.angle += CAR_STEER_SPEED * dt;
    if (input.up) car.speed += CAR_ACCELERATION * dt;
    else if (input.down) car.speed -= CAR_BRAKE * dt;
    else car.speed *= CAR_FRICTION;
    if (car.speed > CAR_MAX_SPEED) car.speed = CAR_MAX_SPEED;
    if (car.speed < -CAR_MAX_SPEED/2) car.speed = -CAR_MAX_SPEED/2;
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    if (isOffTrack(car.x, car.z)) {
        car.speed *= -0.4;
        const c = findClosestWaypoint(car.x, car.z);
        const dx = car.x - c.x, dz = car.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d > 0) { car.x -= (dx/d)*0.6; car.z -= (dz/d)*0.6; }
    }
}

function updateBot(bot, dt) {
    if (bot.finished) return;
    const target = WAYPOINTS[bot.waypointIndex];
    const dx = target.x - bot.x, dz = target.z - bot.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    let diff = angleDifference(bot.angle, desired);
    if (dist < WAYPOINT_RADIUS) {
        bot.waypointIndex = (bot.waypointIndex + 1) % WAYPOINTS.length;
        if (bot.waypointIndex === 0) {
            bot.lap++;
            if (bot.lap >= MAX_LAPS) { bot.finished = true; bot.finishTime = Date.now(); }
        }
    }
    const steer = diff > 0.2 ? { left: false, right: true } : (diff < -0.2 ? { left: true, right: false } : { left: false, right: false });
    const gas = { up: true, down: false };
    if (Math.abs(diff) > 0.9 && bot.speed > 15) { gas.up = false; gas.down = true; }
    updateCarPhysics(bot, { ...gas, ...steer }, dt);
}

function checkFinishLineCross(car, prevX, prevZ) {
    if (car.finished) return false;
    const p1 = { x: prevX, y: prevZ }, p2 = { x: car.x, y: car.z };
    const p3 = { x: FINISH_LINE.p1.x, y: FINISH_LINE.p1.z };
    const p4 = { x: FINISH_LINE.p2.x, y: FINISH_LINE.p2.z };
    if (segmentsIntersect(p1, p2, p3, p4)) {
        const mv = { x: p2.x-p1.x, y: p2.y-p1.y };
        const lv = { x: p4.x-p3.x, y: p4.y-p3.y };
        if (mv.x*lv.x + mv.y*lv.y > 0) {
            car.lap++;
            if (car.lap >= MAX_LAPS) { car.finished = true; car.finishTime = Date.now(); }
            return true;
        }
    }
    return false;
}

function startCountdown(room) {
    room.status = 'countdown';
    room.countdown = 3;
    io.to(room.id).emit('countdown', room.countdown);
    const timer = setInterval(() => {
        room.countdown--;
        if (room.countdown >= 0) io.to(room.id).emit('countdown', room.countdown);
        else { clearInterval(timer); startRace(room); }
    }, 1000);
}

function startRace(room) {
    room.status = 'racing';
    room.startTime = Date.now();
    io.to(room.id).emit('race-start');
    room.prevPositions.clear();
    for (const [id, p] of room.players) room.prevPositions.set(id, { x: p.x, z: p.z });
    for (const b of room.bots) room.prevPositions.set(b.id, { x: b.x, z: b.z });
    room.raceInterval = setInterval(() => {
        const dt = TICK_RATE / 1000;
        const all = [...room.players.values(), ...room.bots];
        for (const p of room.players.values()) {
            if (p.finished) continue;
            updateCarPhysics(p, p.input, dt);
            const prev = room.prevPositions.get(p.id);
            if (prev) { checkFinishLineCross(p, prev.x, prev.z); room.prevPositions.set(p.id, { x: p.x, z: p.z }); }
        }
        for (const b of room.bots) {
            if (b.finished) continue;
            updateBot(b, dt);
            const prev = room.prevPositions.get(b.id);
            if (prev) { checkFinishLineCross(b, prev.x, prev.z); room.prevPositions.set(b.id, { x: b.x, z: b.z }); }
        }
        for (let i = 0; i < all.length; i++)
            for (let j = i+1; j < all.length; j++)
                if (!all[i].finished && !all[j].finished) checkCarCollision(all[i], all[j]);
        if (all.every(c => c.finished) || Date.now() - room.startTime > 300000) {
            room.status = 'finished';
            clearInterval(room.raceInterval);
            room.raceInterval = null;
            io.to(room.id).emit('race-end', getRaceResults(room));
        }
    }, TICK_RATE);
    room.broadcastInterval = setInterval(() => {
        if (room.status === 'racing' || room.status === 'finished')
            io.to(room.id).emit('game-state', getGameState(room));
    }, BROADCAST_RATE);
}

function getGameState(room) {
    const players = [...room.players.values()].map(p => ({
        id: p.id, name: p.name, x: p.x, z: p.z, angle: p.angle, speed: p.speed, lap: p.lap, finished: p.finished
    }));
    const bots = room.bots.map(b => ({
        id: b.id, x: b.x, z: b.z, angle: b.angle, speed: b.speed, lap: b.lap, finished: b.finished
    }));
    return { players, bots, status: room.status, serverTime: Date.now() };
}

function getRaceResults(room) {
    const all = [...room.players.values(), ...room.bots];
    all.sort((a,b) => (a.finished && b.finished) ? a.finishTime - b.finishTime : (a.finished ? -1 : b.finished ? 1 : b.lap - a.lap));
    return all.map(c => ({ id: c.id, name: c.name || c.id, lap: c.lap, finished: c.finished }));
}

io.on('connection', socket => {
    console.log('Bağlandı:', socket.id);
    socket.on('create-room', name => {
        const roomId = Math.floor(1000+Math.random()*9000).toString();
        const room = createRoom(roomId);
        addPlayer(room, socket, name);
        fillBots(room);
        socket.emit('room-created', { roomId });
        setTimeout(() => startCountdown(room), 1500);
    });
    socket.on('join-room', ({ roomId, playerName }) => {
        const room = getRoom(roomId);
        if (!room) return socket.emit('error', 'Oda yok');
        if (room.status !== 'waiting') return socket.emit('error', 'Yarış başladı');
        if (room.players.size >= MAX_PLAYERS) return socket.emit('error', 'Dolu');
        addPlayer(room, socket, playerName);
        fillBots(room);
        socket.emit('joined-room', { roomId });
        io.to(roomId).emit('player-joined', { id: socket.id, name: playerName });
        if (room.players.size === MAX_PLAYERS) setTimeout(() => startCountdown(room), 1000);
    });
    socket.on('start-race', () => {
        const room = getRoom(socket.roomId);
        if (room && room.players.has(socket.id) && room.status === 'waiting') startCountdown(room);
    });
    socket.on('input', input => {
        const room = getRoom(socket.roomId);
        if (room && room.players.has(socket.id)) room.players.get(socket.id).input = input;
    });
    socket.on('disconnect', () => {
        const room = getRoom(socket.roomId);
        if (room) {
            removePlayer(room, socket.id);
            fillBots(room);
            if (room.players.size === 0) removeRoom(room.id);
            else io.to(room.id).emit('player-left', socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`OsRace ${PORT} portunda`));