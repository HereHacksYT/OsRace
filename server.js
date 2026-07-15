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
const TICK_RATE = 1000 / 60; // 60 FPS sunucu tick
const BROADCAST_RATE = 50;    // 50ms'de bir durum gönder
const TRACK_WIDTH = 140;
const CAR_RADIUS = 14;
const CAR_ACCELERATION = 260;
const CAR_BRAKE = 350;
const CAR_FRICTION = 0.96;
const CAR_MAX_SPEED = 320;
const CAR_STEER_SPEED = 3.5;
const BOT_ACCELERATION = 240;
const BOT_STEER_SPEED = 3.0;
const WAYPOINT_RADIUS = 45;

// Pist noktaları (oval şeklinde)
const WAYPOINTS = [
    { x: 300, y: 150 },
    { x: 550, y: 100 },
    { x: 750, y: 150 },
    { x: 800, y: 350 },
    { x: 800, y: 550 },
    { x: 700, y: 700 },
    { x: 450, y: 750 },
    { x: 250, y: 700 },
    { x: 200, y: 550 },
    { x: 200, y: 350 },
];

// Başlangıç pozisyonları (ilk waypoint etrafında sıralı)
const START_POSITIONS = [
    { x: 300, y: 160 },
    { x: 320, y: 185 },
    { x: 340, y: 210 },
    { x: 360, y: 235 }
];

// Bitiş çizgisi segmenti
const FINISH_LINE = {
    p1: { x: WAYPOINTS[0].x - 30, y: WAYPOINTS[0].y - 40 },
    p2: { x: WAYPOINTS[0].x + 30, y: WAYPOINTS[0].y + 40 }
};

// --- Yardımcı Fonksiyonlar ---
function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

function angleDifference(a, b) {
    return normalizeAngle(b - a);
}

// İki segmentin kesişip kesişmediğini kontrol et (bitiş çizgisi geçişi için)
function segmentsIntersect(p1, p2, p3, p4) {
    function ccw(a, b, c) {
        return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    }
    return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}

// Odaları tutacak Map
const rooms = new Map();

// --- Oda Yönetimi ---
function createRoom(roomId) {
    const room = {
        id: roomId,
        players: new Map(),       // socket.id -> player objesi
        bots: [],
        status: 'waiting',        // waiting, countdown, racing, finished
        countdown: 0,
        raceInterval: null,
        broadcastInterval: null,
        maxLaps: MAX_LAPS,
        startTime: 0,
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
        y: pos.y,
        angle: Math.atan2(WAYPOINTS[1].y - WAYPOINTS[0].y, WAYPOINTS[1].x - WAYPOINTS[0].x),
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
    // Oyuncu slotuna bot eklenebilir ama basitlik için boş bırakalım
}

// --- Bot AI ---
function createBot(index, room) {
    const pos = START_POSITIONS[(room.players.size + index) % START_POSITIONS.length];
    const bot = {
        id: `bot_${index}`,
        x: pos.x + (index * 15),
        y: pos.y,
        angle: Math.atan2(WAYPOINTS[1].y - WAYPOINTS[0].y, WAYPOINTS[1].x - WAYPOINTS[0].x),
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

// --- Fizik Güncelleme (hem oyuncu hem bot için kullanılır) ---
function updateCarPhysics(car, input, dt) {
    // direksiyon
    if (input.left) car.angle -= CAR_STEER_SPEED * dt;
    if (input.right) car.angle += CAR_STEER_SPEED * dt;

    // ivmelenme / fren
    if (input.up) {
        car.speed += CAR_ACCELERATION * dt;
    } else if (input.down) {
        car.speed -= CAR_BRAKE * dt;
    } else {
        car.speed *= CAR_FRICTION;
    }

    // maksimum hız sınırı
    if (car.speed > CAR_MAX_SPEED) car.speed = CAR_MAX_SPEED;
    if (car.speed < -CAR_MAX_SPEED / 2) car.speed = -CAR_MAX_SPEED / 2;

    // pozisyon güncelle
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;

    // Pist sınırları dışına çıkma kontrolü (basit çarpışma)
    let nearestDist = Infinity;
    for (const wp of WAYPOINTS) {
        const d = distance(car, wp);
        if (d < nearestDist) nearestDist = d;
    }
    // Merkez çizgisine uzaklık yerine pist genişliği kontrolü (basitleştirilmiş)
    // Dış sınırları bir dikdörtgen gibi kontrol edelim
    const minX = 150, maxX = 850, minY = 70, maxY = 780;
    if (car.x - CAR_RADIUS < minX) { car.x = minX + CAR_RADIUS; car.speed *= -0.3; }
    if (car.x + CAR_RADIUS > maxX) { car.x = maxX - CAR_RADIUS; car.speed *= -0.3; }
    if (car.y - CAR_RADIUS < minY) { car.y = minY + CAR_RADIUS; car.speed *= -0.3; }
    if (car.y + CAR_RADIUS > maxY) { car.y = maxY - CAR_RADIUS; car.speed *= -0.3; }
}

// Bot güncelleme (AI)
function updateBot(bot, dt) {
    if (bot.finished) return;
    // Bir sonraki waypoint'e git
    const target = WAYPOINTS[bot.waypointIndex];
    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    const dist = Math.hypot(dx, dy);
    const desiredAngle = Math.atan2(dy, dx);
    let angleDiff = angleDifference(bot.angle, desiredAngle);

    // Waypoint'e yeterince yakınsa bir sonrakine geç
    if (dist < WAYPOINT_RADIUS) {
        bot.waypointIndex = (bot.waypointIndex + 1) % WAYPOINTS.length;
        if (bot.waypointIndex === 0) {
            // Tur tamamlandı kontrolü (bitiş çizgisi geçişi)
            bot.lap++;
            if (bot.lap >= MAX_LAPS) {
                bot.finished = true;
                bot.finishTime = Date.now();
            }
        }
    }

    // Direksiyon
    const steerInput = angleDiff > 0.1 ? { left: false, right: true } : (angleDiff < -0.1 ? { left: true, right: false } : { left: false, right: false });
    // Gaz / fren
    const gasInput = { up: true, down: false };
    if (Math.abs(angleDiff) > 0.8 && bot.speed > 180) {
        gasInput.up = false;
        gasInput.down = true; // virajda yavaşla
    }

    // Botun input'u ile fizik güncelle
    const input = { ...gasInput, ...steerInput };
    updateCarPhysics(bot, input, dt);
}

// Bitiş çizgisi geçişini kontrol et
function checkFinishLineCross(car, prevX, prevY) {
    if (car.finished) return false;
    const prevPos = { x: prevX, y: prevY };
    const currPos = { x: car.x, y: car.y };
    if (segmentsIntersect(prevPos, currPos, FINISH_LINE.p1, FINISH_LINE.p2)) {
        // Hareket yönünü kontrol et (ileri doğru mu?)
        const moveVec = { x: currPos.x - prevPos.x, y: currPos.y - prevPos.y };
        const lineVec = { x: FINISH_LINE.p2.x - FINISH_LINE.p1.x, y: FINISH_LINE.p2.y - FINISH_LINE.p1.y };
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

    // Önceki pozisyonları tut (bitiş çizgisi için)
    const prevPositions = new Map(); // id -> {x, y}
    for (const [id, player] of room.players) {
        prevPositions.set(id, { x: player.x, y: player.y });
    }
    room.bots.forEach(bot => prevPositions.set(bot.id, { x: bot.x, y: bot.y }));

    // Fizik tick döngüsü
    room.raceInterval = setInterval(() => {
        const dt = TICK_RATE / 1000; // saniye cinsinden

        // Oyuncuları güncelle
        for (const [id, player] of room.players) {
            if (player.finished) continue;
            updateCarPhysics(player, player.input, dt);
            // Bitiş çizgisi kontrolü
            const prev = prevPositions.get(id);
            if (prev) {
                checkFinishLineCross(player, prev.x, prev.y);
            }
            prevPositions.set(id, { x: player.x, y: player.y });
        }

        // Botları güncelle
        for (const bot of room.bots) {
            if (bot.finished) continue;
            updateBot(bot, dt);
            const prev = prevPositions.get(bot.id);
            if (prev) {
                checkFinishLineCross(bot, prev.x, prev.y);
            }
            prevPositions.set(bot.id, { x: bot.x, y: bot.y });
        }

        // Yarış bitiş kontrolü (tüm insan oyuncular bitince veya zaman aşımı)
        const humanFinished = [...room.players.values()].every(p => p.finished);
        const botFinished = room.bots.every(b => b.finished);
        if (humanFinished || (Date.now() - room.startTime > 120000)) {
            room.status = 'finished';
            clearInterval(room.raceInterval);
            room.raceInterval = null;
            io.to(room.id).emit('race-end', getRaceResults(room));
        }
    }, TICK_RATE);

    // Durum yayın aralığı (her BROADCAST_RATE ms'de bir)
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
            x: p.x, y: p.y, angle: p.angle, speed: p.speed,
            lap: p.lap, finished: p.finished
        });
    }
    const bots = room.bots.map(b => ({
        id: b.id,
        x: b.x, y: b.y, angle: b.angle, speed: b.speed,
        lap: b.lap, finished: b.finished
    }));
    return { players, bots, status: room.status };
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
        // Oda oluştur (4 haneli rastgele ID)
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        const room = createRoom(roomId);
        addPlayer(room, socket, playerName);
        fillBots(room);
        socket.emit('room-created', { roomId, players: [...room.players.keys()] });
        console.log(`Oda oluşturuldu: ${roomId}`);
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
                console.log(`Oda silindi: ${room.id}`);
            } else {
                io.to(room.id).emit('player-left', socket.id);
            }
        }
        console.log(`Oyuncu ayrıldı: ${socket.id}`);
    });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`OsRace sunucusu ${PORT} portunda çalışıyor.`);
});
