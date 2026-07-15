import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ========== Ses Yöneticisi ==========
class SoundManager {
    constructor() {
        this.ctx = null;
        this.initialized = false;
        this.engineOsc = null;
        this.engineGain = null;
    }

    init() {
        if (this.initialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.initialized = true;
    }

    startEngine() {
        if (!this.ctx || this.engineOsc) return;
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 60;
        this.engineGain.gain.value = 0.04;
        this.engineOsc.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        this.engineOsc.start();
    }

    updateEngine(speed, maxSpeed) {
        if (!this.engineOsc) return;
        const freq = 50 + (Math.abs(speed) / maxSpeed) * 180;
        this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
        const gain = 0.02 + (Math.abs(speed) / maxSpeed) * 0.06;
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
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playCrash() {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 0.25;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.15;
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

// ========== Pist Noktaları (Sunucu ile aynı) ==========
const WAYPOINTS = [
    { x: 0, z: 20 }, { x: 30, z: 15 }, { x: 60, z: 5 },
    { x: 80, z: -15 }, { x: 70, z: -45 }, { x: 40, z: -60 },
    { x: 0, z: -55 }, { x: -35, z: -40 }, { x: -60, z: -15 },
    { x: -65, z: 15 }, { x: -45, z: 40 }, { x: -15, z: 45 },
    { x: 0, z: 20 }
];
const TRACK_WIDTH = 14;

// ========== Three.js Sahnesi ==========
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 100, 300);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 300);
camera.position.set(0, 10, 30);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById('gameUI').appendChild(renderer.domElement);

// Işık
scene.add(new THREE.AmbientLight(0x404