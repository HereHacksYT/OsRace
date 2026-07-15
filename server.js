const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- Sabitler ---
const MAX_PLAYERS = 4;
const MAX_LAPS = 3;
const TICK_RATE = 1000 / 60; // 60 Hz sunucu simülasyonu
const BROADCAST_RATE = 1000 / 20; // 20 Hz durum gönderimi (istemci interpolasyon yapacak)
const CAR_RADIUS = 0.8;
const CAR_ACCELERATION = 12;
const CAR_BRAKE = 18;
const CAR_FRICTION = 0.96;
const CAR_MAX_SPEED = 22;
const CAR_STEER_SPEED = 2.8;
const BOT_STEER_SPEED = 2.4;
const WAYPOINT_RADIUS = 3.5;
const TRACK_WIDTH = 8;
const TRACK_HALF = TRACK_WIDTH / 2;

// 3D pist noktaları (oval, ZX düzleminde)
const WAYPOINTS = [
    { x: 0, z: 10 },
    { x: 15, z: 8 },
    { x: 25, z: 0 },
    { x: 20, z: -15 },
    { x: 5, z: -22 },
    { x: -10, z: -18 },
    { x: -20, z: -5 },
    { x: -15, z: 10 },
    { x: -5, z: 18 }
];

// Başlangıç pozisyonları (ilk waypoint yakınında)
const START_POSITIONS = [
    { x: 0, z: 11 },
    { x: 1.5, z: 12 },
    { x: 3, z: 13 },
    { x: -1.5, z: 12 }
];

// Bitiş çizgisi (iki nokta arası segment)
const FINISH_LINE = {
    p1: { x: -3, z: 10.5 },
    p2: { x: 3, z: 10.5 }
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

// İki segmentin kesişip kesişmediğini kontrol (bitiş çizgisi geçişi)
function segmentsIntersect(p1, p2, p3, p4) {
    function ccw(a, b, c) {
        return (c.z - a.z) * (b.x - a.x) > (b.z - a.z) * (c.x - a.x);
    }
    return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}

// Pist dışına çıkma kontrolü (pist merkezine uzaklığa göre basit)
function isOffTrack(carX, carZ) {
    let minDist = Infinity;
    for (const wp of WAYPOINTS) {
        const d = distance({ x: carX, z: carZ }, wp);
        if (d < minDist) minDist = d;
    }
    return minDist > TRACK_HALF + 1.5;
}

// Odaları tutacak Map
const rooms = new Map();

// --- Oda Yönetimi ---
function createRoom(roomId) {
    const room = {
        id: roomId,
        players: new Map(),
        bots: [],
        status: 'waiting', // waiting, countdown, racing, finished
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

function getRoom(roomId) {
    return rooms.get(roomId);
}

function removeRoom(roomId) {
    const room = rooms.get(roomId);
    if (room) {
        if (room.raceInterval) clearInterval(room.raceInterval);
        if (room.broadcastInterval) clearInterval(room.broadcastInterval);
        rooms.delete(roomId);
    }
}

// --- Oyuncu Ekleme / Çıkarma ---
function addPlayer(room, socket, playerName) {
    const startIndex = room.players.size;
    const pos = START_POSITIONS[startIndex % START_POSITIONS.length];
    const player = {
        id: socket.id,
        name: playerName || 'Oyuncu',
        x: pos.x,
        z: pos.z,
        angle: Math.atan2(WAYPOINTS[1].x - WAYPOINTS[0].x, WAYPOINTS[1].z - WAYPOINTS[0].z), // yön ZX düzleminde
        speed: 0,
        lap: 0,
        checkpoint: 0,
        input: { up: false, down: false, left: false, right: false },
        finished: false,
        finishTime: 0,
    };
    room.players.set(socket.id, player);
    socket.join(room.id);
    socket.roomId = room.id;
    return player;
}

function removePlayer(room, socketId) {
    room.players.delete(socketId);
}

// --- Bot AI ---
function createBot(index, room) {
    const pos = START_POSITIONS[(room.players.size + index) % START_POSITIONS.length];
    const bot = {
        id: `bot_${index}`,
        x: pos.x + (index * 0.8),
        z: pos.z,
        angle: Math.atan2(WAYPOINTS[1].x - WAYPOINTS[0].x, WAYPOINTS[1].z - WAYPOINTS[0].z),
        speed: 0,
        lap: 0,
        checkpoint: 0,
        waypointIndex: 0,
        finished: false,
        finishTime: 0,
    };
    return bot;
}

function fillBots(room) {
    const totalHumans = room.players.size;
    const totalCars = totalHumans + room.bots.length;
    const needed = MAX_PLAYERS - totalCars;
    for (let i = 0; i < needed; i++) {
        room.bots.push(createBot(room.bots.length, room));
    }
}

// --- Yetkili Fizik Güncelleme (Sunucu) ---
function updateCarPhysics(car, input, dt) {
    // Direksiyon
    if (input.left) car.angle -= CAR_STEER_SPEED * dt;
    if (input.right) car.angle += CAR_STEER_SPEED * dt;

    // Gaz / Fren
    if (input.up) {
        car.speed += CAR_ACCELERATION * dt;
    } else if (input.down) {
        car.speed -= CAR_BRAKE * dt;
    } else {
        car.speed *= CAR_FRICTION;
    }

    // Hız sınırı
    if (car.speed > CAR_MAX_SPEED) car.speed = CAR_MAX_SPEED;
    if (car.speed < -CAR_MAX_SPEED / 2) car.speed = -CAR_MAX_SPEED / 2;

    // Pozisyon güncelle (Z ekseni ileri yön)
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;

    // Pist dışına çıkma cezası
    if (isOffTrack(car.x, car.z)) {
        car.speed *= -0.4; // yavaşla ve geri sek
        // Basit sınır itme
        const center = findClosestWaypoint(car.x, car.z);
        const dx = car.x - center.x;
        const dz = car.z - center.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0) {
            car.x -= (dx / dist) * 0.5;
            car.z -= (dz / dist) * 0.5;
        }
    }
}

function findClosestWaypoint(x, z) {
    let minDist = Infinity;
    let closest = WAYPOINTS[0];
    for (const wp of WAYPOINTS) {
        const d = Math.hypot(wp.x - x, wp.z - z);
        if (d < minDist) {
            minDist = d;
            closest = wp;
        }
    }
    return closest;
}

// Bot güncelleme (AI)
function updateBot(bot, dt) {
    if (bot.finished) return;
    const target = WAYPOINTS[bot.waypointIndex];
    const dx = target.x - bot.x;
    const dz = target.z - bot.z;
    const dist = Math.hypot(dx, dz);
    const desiredAngle = Math.atan2(dx, dz);
    let angleDiff = angleDifference(bot.angle, desiredAngle);

    if (dist < WAYPOINT_RADIUS) {
        bot.waypointIndex = (bot.waypointIndex + 1) % WAYPOINTS.length;
        if (bot.waypointIndex === 0) {
            bot.lap++;
            if (bot.lap >= MAX_LAPS) {
                bot.finished = true;
                bot.finishTime = Date.now();
            }
        }
    }

    const steerInput = angleDiff > 0.2 ? { left: false, right: true } : (angleDiff < -0.2 ? { left: true, right: false } : { left: false, right: false });
    const gasInput = { up: true, down: false };
    if (Math.abs(angleDiff) > 0.9 && bot.speed > 14) {
        gasInput.up = false;
        gasInput.down = true;
    }

    updateCarPhysics(bot, { ...gasInput, ...steerInput }, dt);
}

// Bitiş çizgisi geçişi kontrolü
function checkFinishLineCross(car, prevX, prevZ) {
    if (car.finished) return false;
    const prevPos = { x: prevX, z: prevZ };
    const currPos = { x: car.x, z: car.z };
    // Z eksenini Y gibi kullan, segment kontrolü için uyarla
    const p1 = { x: prevPos.x, y: prevPos.z };
    const p2 = { x: currPos.x, y: currPos.z };
    const p3 = { x: FINISH_LINE.p1.x, y: FINISH_LINE.p1.z };
    const p4 = { x: FINISH_LINE.p2.x, y: FINISH_LINE.p2.z };
    if (segmentsIntersect(p1, p2, p3, p4)) {
        const moveVec = { x: p2.x - p1.x, y: p2.y - p1.y };
        const lineVec = { x: p4.x - p3.x, y: p4.y - p3.y };
        const dot = moveVec.x * lineVec.x + moveVec.y * lineVec.y;
        if (dot > 0) {
            car.lap++;
            if (car.lap >= MAX_LAPS) {
                car.finished = true;
                car.finishTime = Date.now();
            }
            return true;
        }
    }
    return false;
}

// --- Yarış Başlatma ---
function startCountdown(room) {
    room.status = 'countdown';
    room.countdown = 3;
    const countdownInterval = setInterval(() => {
        io.to(room.id).emit('countdown', room.countdown);
        room.countdown--;
        if (room.countdown < 0) {
            clearInterval(countdownInterval);
            startRace(room);
        }
    }, 1000);
}

function startRace(room) {
    room.status = 'racing';
    room.startTime = Date.now();
    io.to(room.id).emit('race-start');

    // Önceki pozisyonları sıfırla
    room.prevPositions.clear();
    for (const [id, player] of room.players) {
        room.prevPositions.set(id, { x: player.x, z: player.z });
    }
    for (const bot of room.bots) {
        room.prevPositions.set(bot.id, { x: bot.x, z: bot.z });
    }

    // Yetkili fizik döngüsü (60Hz)
    room.raceInterval = setInterval(() => {
        const dt = TICK_RATE / 1000;

        // Oyuncuları güncelle
        for (const [id, player] of room.players) {
            if (player.finished) continue;
            updateCarPhysics(player, player.input, dt);
            const prev = room.prevPositions.get(id);
            if (prev) {
                checkFinishLineCross(player, prev.x, prev.z);
                room.prevPositions.set(id, { x: player.x, z: player.z });
            }
        }

        // Botları güncelle
        for (const bot of room.bots) {
            if (bot.finished) continue;
            updateBot(bot, dt);
            const prev = room.prevPositions.get(bot.id);
            if (prev) {
                checkFinishLineCross(bot, prev.x, prev.z);
                room.prevPositions.set(bot.id, { x: bot.x, z: bot.z });
            }
        }

        // Yarış bitiş kontrolü (tüm insan oyuncular bitince)
        const humanFinished = [...room.players.values()].every(p => p.finished);
        if (humanFinished || (Date.now() - room.startTime > 180000)) {
            room.status = 'finished';
            clearInterval(room.raceInterval);
            room.raceInterval = null;
            io.to(room.id).emit('race-end', getRaceResults(room));
        }
    }, TICK_RATE);

    // Durum yayını (20Hz, istemci interpolasyon yapacak)
    room.broadcastInterval = setInterval(() => {
        if (room.status === 'racing' || room.status === 'finished') {
            io.to(room.id).emit('game-state', getGameState(room));
        }
    }, BROADCAST_RATE);
}

function getGameState(room) {
    const players = [];
    for (const p of room.players.values()) {
        players.push({
            id: p.id,
            name: p.name,
            x: p.x, z: p.z, angle: p.angle, speed: p.speed,
            lap: p.lap, finished: p.finished
        });
    }
    const bots = room.bots.map(b => ({
        id: b.id,
        x: b.x, z: b.z, angle: b.angle, speed: b.speed,
        lap: b.lap, finished: b.finished
    }));
    return { players, bots, status: room.status, serverTime: Date.now() };
}

function getRaceResults(room) {
    const allCars = [...room.players.values(), ...room.bots];
    allCars.sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.lap - a.lap;
    });
    return allCars.map(c => ({ id: c.id, name: c.name || c.id, lap: c.lap, finished: c.finished }));
}

// --- Socket.IO Olayları ---
io.on('connection', (socket) => {
    console.log(`Oyuncu bağlandı: ${socket.id}`);

    socket.on('create-room', (playerName) => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        const room = createRoom(roomId);
        addPlayer(room, socket, playerName);
        fillBots(room);
        socket.emit('room-created', { roomId, players: [...room.players.keys()] });
    });

    socket.on('join-room', ({ roomId, playerName }) => {
        let room = getRoom(roomId);
        if (!room) {
            socket.emit('error', 'Oda bulunamadı.');
            return;
        }
        if (room.status !== 'waiting') {
            socket.emit('error', 'Yarış zaten başlamış.');
            return;
        }
        if (room.players.size >= MAX_PLAYERS) {
            socket.emit('error', 'Oda dolu.');
            return;
        }
        addPlayer(room, socket, playerName);
        fillBots(room);
        socket.emit('joined-room', { roomId, players: [...room.players.keys()] });
        io.to(roomId).emit('player-joined', { id: socket.id, name: playerName });
    });

    socket.on('start-race', () => {
        const room = getRoom(socket.roomId);
        if (room && room.players.has(socket.id) && room.status === 'waiting') {
            startCountdown(room);
        }
    });

    socket.on('input', (input) => {
        const room = getRoom(socket.roomId);
        if (room && room.players.has(socket.id)) {
            room.players.get(socket.id).input = input;
        }
    });

    socket.on('disconnect', () => {
        const room = getRoom(socket.roomId);
        if (room) {
            removePlayer(room, socket.id);
            fillBots(room);
            if (room.players.size === 0) {
                removeRoom(room.id);
            } else {
                io.to(room.id).emit('player-left', socket.id);
            }
        }
        console.log(`Oyuncu ayrıldı: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`OsRace 3D sunucusu ${PORT} portunda çalışıyor.`);
});