// ========== Ses Yöneticisi (Web Audio API) ==========
class SoundManager {
    constructor() {
        this.ctx = null;
        this.engineOsc = null;
        this.engineGain = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.initialized = true;
    }

    startEngine() {
        if (!this.ctx) return;
        if (this.engineOsc) return;
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 80;
        this.engineGain.gain.value = 0.06;
        this.engineOsc.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        this.engineOsc.start();
    }

    updateEngine(speed, maxSpeed) {
        if (!this.engineOsc) return;
        const freq = 60 + (Math.abs(speed) / maxSpeed) * 200;
        this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
        const gain = 0.03 + (Math.abs(speed) / maxSpeed) * 0.07;
        this.engineGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.1);
    }

    stopEngine() {
        if (this.engineOsc) {
            this.engineOsc.stop();
            this.engineOsc.disconnect();
            this.engineOsc = null;
            this.engineGain = null;
        }
    }

    playBeep(freq = 440, duration = 0.15) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playCrash() {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 0.3;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.2;
        source.connect(gain);
        gain.connect(this.ctx.destination);
        source.start();
    }

    playFinish() {
        this.playBeep(660, 0.1);
        setTimeout(() => this.playBeep(880, 0.15), 100);
        setTimeout(() => this.playBeep(1100, 0.2), 200);
    }
}

const sound = new SoundManager();

// ========== Pist Verisi (sunucu ile aynı olmalı) ==========
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

const TRACK_WIDTH = 140;
const CAR_RADIUS = 14;

// ========== Canvas & Arayüz ==========
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1000;
canvas.height = 800;

const menuDiv = document.getElementById('menu');
const gameUIDiv = document.getElementById('gameUI');
const singlePlayerBtn = document.getElementById('singlePlayerBtn');
const multiplayerBtn = document.getElementById('multiplayerBtn');
const multiplayerPanel = document.getElementById('multiplayerPanel');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const startRaceBtn = document.getElementById('startRaceBtn');
const roomInfo = document.getElementById('roomInfo');
const displayRoomId = document.getElementById('displayRoomId');
const playerNameInput = document.getElementById('playerNameInput');
const roomIdInput = document.getElementById('roomIdInput');
const lapCounter = document.getElementById('lapCounter');
const speedometer = document.getElementById('speedometer');
const countdownDisplay = document.getElementById('countdownDisplay');
const messageBox = document.getElementById('messageBox');

let gameMode = null; // 'single' veya 'multiplayer'
let localGame = null;
let networkGame = null;

// ========== Klavye Yönetimi ==========
const keys = { up: false, down: false, left: false, right: false };

window.addEventListener('keydown', (e) => {
    switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': keys.up = true; e.preventDefault(); break;
        case 'ArrowDown': case 's': case 'S': keys.down = true; e.preventDefault(); break;
        case 'ArrowLeft': case 'a': case 'A': keys.left = true; e.preventDefault(); break;
        case 'ArrowRight': case 'd': case 'D': keys.right = true; e.preventDefault(); break;
    }
    if (networkGame) networkGame.sendInput();
});

window.addEventListener('keyup', (e) => {
    switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': keys.up = false; e.preventDefault(); break;
        case 'ArrowDown': case 's': case 'S': keys.down = false; e.preventDefault(); break;
        case 'ArrowLeft': case 'a': case 'A': keys.left = false; e.preventDefault(); break;
        case 'ArrowRight': case 'd': case 'D': keys.right = false; e.preventDefault(); break;
    }
    if (networkGame) networkGame.sendInput();
});

// ========== Menü Olayları ==========
singlePlayerBtn.addEventListener('click', () => {
    sound.init();
    startSinglePlayer();
});

multiplayerBtn.addEventListener('click', () => {
    multiplayerPanel.classList.remove('hidden');
});

createRoomBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Oyuncu';
    connectAndCreateRoom(name);
});

joinRoomBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Oyuncu';
    const roomId = roomIdInput.value.trim();
    if (roomId.length > 0) {
        connectAndJoinRoom(roomId, name);
    }
});

startRaceBtn.addEventListener('click', () => {
    if (networkGame && networkGame.socket) {
        networkGame.socket.emit('start-race');
    }
});

// ========== Tek Oyuncu (Botlarla) ==========
class Car {
    constructor(x, y, angle, color, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 0;
        this.color = color;
        this.isPlayer = isPlayer;
        this.lap = 0;
        this.checkpoint = 0;
        this.finished = false;
        this.finishTime = 0;
        this.prevX = x;
        this.prevY = y;
    }

    update(dt, input) {
        this.prevX = this.x;
        this.prevY = this.y;

        if (input.left) this.angle -= 3.5 * dt;
        if (input.right) this.angle += 3.5 * dt;

        if (input.up) this.speed += 260 * dt;
        else if (input.down) this.speed -= 350 * dt;
        else this.speed *= 0.96;

        if (this.speed > 320) this.speed = 320;
        if (this.speed < -160) this.speed = -160;

        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;

        // Pist dışına çıkma
        const minX = 150, maxX = 850, minY = 70, maxY = 780;
        if (this.x - CAR_RADIUS < minX) { this.x = minX + CAR_RADIUS; this.speed *= -0.3; sound.playCrash(); }
        if (this.x + CAR_RADIUS > maxX) { this.x = maxX - CAR_RADIUS; this.speed *= -0.3; sound.playCrash(); }
        if (this.y - CAR_RADIUS < minY) { this.y = minY + CAR_RADIUS; this.speed *= -0.3; sound.playCrash(); }
        if (this.y + CAR_RADIUS > maxY) { this.y = maxY - CAR_RADIUS; this.speed *= -0.3; sound.playCrash(); }
    }
}

class BotAI {
    constructor(car, waypointIndex = 0) {
        this.car = car;
        this.waypointIndex = waypointIndex;
    }

    update(dt) {
        if (this.car.finished) return;
        const target = WAYPOINTS[this.waypointIndex];
        const dx = target.x - this.car.x;
        const dy = target.y - this.car.y;
        const dist = Math.hypot(dx, dy);
        const desiredAngle = Math.atan2(dy, dx);
        let angleDiff = desiredAngle - this.car.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (dist < 45) {
            this.waypointIndex = (this.waypointIndex + 1) % WAYPOINTS.length;
            if (this.waypointIndex === 0) {
                this.car.lap++;
                if (this.car.lap >= 3) {
                    this.car.finished = true;
                    this.car.finishTime = performance.now();
                }
            }
        }

        const input = { up: true, down: false, left: false, right: false };
        if (Math.abs(angleDiff) > 0.8 && this.car.speed > 180) {
            input.up = false;
            input.down = true;
        }
        if (angleDiff > 0.1) input.right = true;
        else if (angleDiff < -0.1) input.left = true;

        this.car.update(dt, input);
    }
}

class LocalRace {
    constructor() {
        this.playerCar = new Car(300, 180, Math.atan2(100, 250), '#ff4500', true);
        this.bots = [];
        const botColors = ['#1e90ff', '#32cd32', '#ffd700'];
        for (let i = 0; i < 3; i++) {
            const botCar = new Car(320 + i * 20, 210 + i * 20, this.playerCar.angle, botColors[i], false);
            const botAI = new BotAI(botCar, i % WAYPOINTS.length);
            this.bots.push({ car: botCar, ai: botAI });
        }
        this.state = 'countdown'; // countdown, racing, finished
        this.countdown = 3;
        this.countdownStart = 0;
        this.lastTime = performance.now();
        this.finishMessageShown = false;
    }

    startCountdown() {
        this.state = 'countdown';
        this.countdown = 3;
        this.countdownStart = performance.now();
        countdownDisplay.classList.remove('hidden');
        sound.playBeep(440, 0.2);
    }

    update() {
        const now = performance.now();
        const dt = Math.min(0.05, (now - this.lastTime) / 1000);
        this.lastTime = now;

        if (this.state === 'countdown') {
            const elapsed = (now - this.countdownStart) / 1000;
            const newCountdown = 3 - Math.floor(elapsed);
            if (newCountdown !== this.countdown && newCountdown >= 0) {
                sound.playBeep(440, 0.2);
                countdownDisplay.textContent = newCountdown > 0 ? newCountdown : 'BAŞLA!';
            }
            if (elapsed >= 3) {
                this.state = 'racing';
                countdownDisplay.classList.add('hidden');
                sound.startEngine();
            }
            return;
        }

        if (this.state === 'racing') {
            this.playerCar.update(dt, keys);
            sound.updateEngine(this.playerCar.speed, 320);

            // Bitiş çizgisi kontrolü
            this.checkFinish(this.playerCar);

            for (const bot of this.bots) {
                bot.ai.update(dt);
                this.checkFinish(bot.car);
            }

            // Bitiş kontrolü
            if (this.playerCar.finished && !this.finishMessageShown) {
                this.finishMessageShown = true;
                this.state = 'finished';
                sound.playFinish();
                messageBox.textContent = 'Yarış Bitti!';
                messageBox.classList.remove('hidden');
            }
        }

        // HUD güncelle
        lapCounter.textContent = `Tur: ${this.playerCar.lap}/3`;
        speedometer.textContent = `Hız: ${Math.abs(this.playerCar.speed * 3.6).toFixed(0)} km/h`;
    }

    checkFinish(car) {
        if (car.finished) return;
        // Basit bitiş çizgisi kontrolü: ilk waypoint'e yakınlık ve tur artışı bot tarafından yapılıyor.
        // İnsan oyuncu için de bitiş çizgisi geçişini kontrol edelim (sunucudaki gibi)
        // Burada basitlik için bot'un waypoint mantığını kullanmıyoruz, oyuncu manuel.
        // Oyuncunun bitiş çizgisini geçmesini sağlamak için:
        const finishLine = {
            p1: { x: WAYPOINTS[0].x - 30, y: WAYPOINTS[0].y - 40 },
            p2: { x: WAYPOINTS[0].x + 30, y: WAYPOINTS[0].y + 40 }
        };
        const prev = { x: car.prevX, y: car.prevY };
        const curr = { x: car.x, y: car.y };
        if (segmentsIntersect(prev, curr, finishLine.p1, finishLine.p2)) {
            const moveVec = { x: curr.x - prev.x, y: curr.y - prev.y };
            const lineVec = { x: finishLine.p2.x - finishLine.p1.x, y: finishLine.p2.y - finishLine.p1.y };
            const dot = moveVec.x * lineVec.x + moveVec.y * lineVec.y;
            if (dot > 0) {
                car.lap++;
                if (car.lap >= 3) {
                    car.finished = true;
                    car.finishTime = now;
                }
            }
        }
    }

    draw(ctx) {
        drawTrack(ctx);
        // Tüm arabaları çiz
        for (const bot of this.bots) {
            drawCar(ctx, bot.car);
        }
        drawCar(ctx, this.playerCar);
    }
}

// ========== Çok Oyunculu Ağ ==========
class NetworkGame {
    constructor(socket) {
        this.socket = socket;
        this.state = 'waiting'; // waiting, countdown, racing, finished
        this.gameState = null; // sunucudan gelen son durum
        this.myId = socket.id;
        this.raceResults = null;

        this.socket.on('room-created', (data) => {
            roomInfo.classList.remove('hidden');
            displayRoomId.textContent = data.roomId;
            roomIdInput.value = data.roomId;
        });

        this.socket.on('joined-room', (data) => {
            roomInfo.classList.remove('hidden');
            displayRoomId.textContent = data.roomId;
            roomIdInput.value = data.roomId;
        });

        this.socket.on('player-joined', (data) => {
            console.log('Oyuncu katıldı:', data.name);
        });

        this.socket.on('player-left', (id) => {
            console.log('Oyuncu ayrıldı:', id);
        });

        this.socket.on('countdown', (seconds) => {
            this.state = 'countdown';
            countdownDisplay.classList.remove('hidden');
            countdownDisplay.textContent = seconds > 0 ? seconds : 'BAŞLA!';
            sound.playBeep(440, 0.2);
        });

        this.socket.on('race-start', () => {
            this.state = 'racing';
            countdownDisplay.classList.add('hidden');
            messageBox.classList.add('hidden');
            sound.startEngine();
        });

        this.socket.on('game-state', (state) => {
            this.gameState = state;
            if (state.status === 'finished') {
                this.state = 'finished';
                sound.stopEngine();
                sound.playFinish();
                messageBox.textContent = 'Yarış Bitti!';
                messageBox.classList.remove('hidden');
            }
        });

        this.socket.on('race-end', (results) => {
            this.raceResults = results;
            console.log('Sonuçlar:', results);
        });

        this.socket.on('error', (msg) => {
            alert('Hata: ' + msg);
        });
    }

    sendInput() {
        if (this.socket.connected) {
            this.socket.emit('input', { up: keys.up, down: keys.down, left: keys.left, right: keys.right });
        }
    }

    update() {
        if (this.state === 'racing' && this.gameState) {
            // Kendi arabamızı bul ve hız göstergesini güncelle
            const me = this.gameState.players.find(p => p.id === this.myId);
            if (me) {
                speedometer.textContent = `Hız: ${Math.abs(me.speed * 3.6).toFixed(0)} km/h`;
                lapCounter.textContent = `Tur: ${me.lap}/3`;
                sound.updateEngine(me.speed, 320);
            }
        }
    }

    draw(ctx) {
        drawTrack(ctx);
        if (!this.gameState) return;
        // Oyuncuları çiz
        for (const p of this.gameState.players) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.fillStyle = p.id === this.myId ? '#ff4500' : '#1e90ff';
            ctx.fillRect(-12, -8, 24, 16);
            ctx.fillStyle = 'white';
            ctx.fillRect(8, -3, 8, 6);
            ctx.restore();
            // İsim etiketi
            ctx.fillStyle = 'white';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.name || p.id, p.x, p.y - 18);
        }
        // Botları çiz
        const botColors = ['#32cd32', '#ffd700', '#dda0dd'];
        this.gameState.bots.forEach((b, i) => {
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(b.angle);
            ctx.fillStyle = botColors[i % botColors.length];
            ctx.fillRect(-12, -8, 24, 16);
            ctx.fillStyle = 'white';
            ctx.fillRect(8, -3, 8, 6);
            ctx.restore();
            ctx.fillStyle = 'white';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(b.id, b.x, b.y - 18);
        });
    }
}

// ========== Çizim Fonksiyonları ==========
function drawTrack(ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Çim
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Yol
    ctx.beginPath();
    ctx.moveTo(WAYPOINTS[0].x, WAYPOINTS[0].y);
    for (let i = 1; i < WAYPOINTS.length; i++) {
        ctx.lineTo(WAYPOINTS[i].x, WAYPOINTS[i].y);
    }
    ctx.closePath();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = TRACK_WIDTH;
    ctx.stroke();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = TRACK_WIDTH - 10;
    ctx.stroke();
    // Kenar çizgileri
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.setLineDash([20, 15]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Bitiş çizgisi
    const fp1 = { x: WAYPOINTS[0].x - 30, y: WAYPOINTS[0].y - 40 };
    const fp2 = { x: WAYPOINTS[0].x + 30, y: WAYPOINTS[0].y + 40 };
    ctx.beginPath();
    ctx.moveTo(fp1.x, fp1.y);
    ctx.lineTo(fp2.x, fp2.y);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawCar(ctx, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = car.color;
    ctx.fillRect(-12, -8, 24, 16);
    ctx.fillStyle = 'white';
    ctx.fillRect(8, -3, 8, 6);
    ctx.restore();
}

function segmentsIntersect(p1, p2, p3, p4) {
    function ccw(a, b, c) {
        return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    }
    return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}

// ========== Oyun Döngüleri ==========
function startSinglePlayer() {
    menuDiv.classList.add('hidden');
    gameUIDiv.classList.remove('hidden');
    gameMode = 'single';
    localGame = new LocalRace();
    localGame.startCountdown();
    requestAnimationFrame(singlePlayerLoop);
}

function singlePlayerLoop() {
    if (gameMode !== 'single') return;
    localGame.update();
    localGame.draw(ctx);
    if (localGame.state === 'finished') {
        sound.stopEngine();
    }
    requestAnimationFrame(singlePlayerLoop);
}

// Çok oyunculu bağlantı
let socket = null;

function connectAndCreateRoom(name) {
    sound.init();
    socket = io();
    networkGame = new NetworkGame(socket);
    menuDiv.classList.add('hidden');
    gameUIDiv.classList.remove('hidden');
    gameMode = 'multiplayer';
    socket.emit('create-room', name);
    requestAnimationFrame(multiplayerLoop);
}

function connectAndJoinRoom(roomId, name) {
    sound.init();
    socket = io();
    networkGame = new NetworkGame(socket);
    menuDiv.classList.add('hidden');
    gameUIDiv.classList.remove('hidden');
    gameMode = 'multiplayer';
    socket.emit('join-room', { roomId, playerName: name });
    requestAnimationFrame(multiplayerLoop);
}

function multiplayerLoop() {
    if (gameMode !== 'multiplayer') return;
    if (networkGame) {
        networkGame.update();
        networkGame.draw(ctx);
    }
    requestAnimationFrame(multiplayerLoop);
}