const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const menuOverlay = document.getElementById('menuOverlay');
const menuTitle = document.getElementById('menuTitle');
const menuSubtitle = document.getElementById('menuSubtitle');
const startBtn = document.getElementById('startBtn');
const GAME_WIDTH = 960;
const GAME_HEIGHT = 450;
canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;
const GROUND_Y = GAME_HEIGHT - 65;
const INITIAL_SPEED = 5.5;
const MAX_SPEED = 13.8;
const ACCELERATION = 0.0022;
// Audio System (Web Audio API Synthesizer)
const AudioSys = {
    ctx: null,
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    playJump() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(580, this.ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.12);
    },
    playScore() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, this.ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    },
    playCrash() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(35, this.ctx.currentTime + 0.35);
        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.35);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.35);
    }
};
// State variables
let gameState = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let highScore = parseInt(localStorage.getItem('mtb_high_score')) || 0;
let gameSpeed = INITIAL_SPEED;
let lastTime = 0;
let timeAcc = 0;
let lastScoreBeep = 0;
let dayTimeProgress = 0; // 0 to 1 for day/night cycle
// Player MTB Character with Fluid Physics & Animation
const player = {
    x: 90,
    y: GROUND_Y,
    vy: 0,
    gravity: 0.58,
    jumpForce: -13.2,
    isGrounded: true,
    isDucking: false,
    pedalAngle: 0,
    squashScaleY: 1,
    squashScaleX: 1,
    suspensionY: 0,
    reset() {
        this.y = GROUND_Y;
        this.vy = 0;
        this.isGrounded = true;
        this.isDucking = false;
        this.pedalAngle = 0;
        this.squashScaleY = 1;
        this.squashScaleX = 1;
        this.suspensionY = 0;
    },
    jump() {
        if (this.isGrounded) {
            this.vy = this.jumpForce;
            this.isGrounded = false;
            this.squashScaleY = 1.35; // Stretch up on jump launch
            this.squashScaleX = 0.75;
            AudioSys.playJump();
        }
    },
    update(dt) {
        // Physics update with delta-time adjustment
        const dtFactor = dt / 16.67;
        const effectiveGravity = (!this.isGrounded && this.isDucking) ? this.gravity * 1.85 : this.gravity;
        this.vy += effectiveGravity * dtFactor;
        this.y += this.vy * dtFactor;
        // Smoothly return squash/stretch back to 1
        this.squashScaleX += (1 - this.squashScaleX) * 0.15 * dtFactor;
        this.squashScaleY += (1 - this.squashScaleY) * 0.15 * dtFactor;
        // Ground Collision & Landing Elasticity
        if (this.y >= GROUND_Y) {
            if (!this.isGrounded) {
                // Impact Squash Effect
                this.squashScaleY = 0.7;
                this.squashScaleX = 1.25;
                this.suspensionY = 6; // Compression on landing
            }
            this.y = GROUND_Y;
            this.vy = 0;
            this.isGrounded = true;
        }
        // Smooth Suspension rebound
        this.suspensionY *= Math.pow(0.82, dtFactor);
        if (this.isGrounded) {
            this.pedalAngle += (gameSpeed * 0.06) * dtFactor;
        }
    },
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.squashScaleX, this.squashScaleY);
        const suspensionOffset = Math.sin(this.pedalAngle * 2) * 1.2 + this.suspensionY;
        const wheelRadius = 14;
        const frontWheelX = 38;
        const rearWheelX = -10;
        const wheelY = -wheelRadius;
        // --- Wheels ---
        ctx.fillStyle = '#111';
        [rearWheelX, frontWheelX].forEach(wx => {
            ctx.beginPath();
            ctx.arc(wx, wheelY, wheelRadius + 2, 0, Math.PI * 2);
            ctx.fill();
        });
        // Tires & Rims
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 4;
        [rearWheelX, frontWheelX].forEach(wx => {
            ctx.beginPath();
            ctx.arc(wx, wheelY, wheelRadius, 0, Math.PI * 2);
            ctx.stroke();
        });
        // Spokes animation
        ctx.strokeStyle = '#D1D5DB';
        ctx.lineWidth = 1;
        [rearWheelX, frontWheelX].forEach(wx => {
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
                ctx.beginPath();
                ctx.moveTo(wx, wheelY);
                ctx.lineTo(wx + Math.cos(this.pedalAngle + a) * wheelRadius, wheelY + Math.sin(this.pedalAngle + a) * wheelRadius);
                ctx.stroke();
            }
        });
        // --- Frame (Detailed MTB Geometry) ---
        const bbX = 11, bbY = wheelY;
        const seatX = 3, seatY = wheelY - 22 + suspensionOffset;
        const headX = 28, headY = wheelY - 26 + suspensionOffset;
        // Rear Shock Linkage
        ctx.strokeStyle = '#718096';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bbX + 2, bbY - 6);
        ctx.lineTo(seatX + 4, seatY + 8);
        ctx.stroke();
        // Frame Color
        ctx.strokeStyle = '#FF3D00';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(rearWheelX, wheelY);
        ctx.lineTo(bbX, bbY);
        ctx.lineTo(seatX, seatY);
        ctx.closePath();
        ctx.lineTo(headX, headY);
        ctx.lineTo(bbX, bbY);
        ctx.stroke();
        // Suspension Fork (Kashima Gold & Black)
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(headX, headY);
        ctx.lineTo(headX + (frontWheelX - headX) * 0.5, headY + (wheelY - headY) * 0.5);
        ctx.stroke();
        ctx.strokeStyle = '#1A202C';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(headX + (frontWheelX - headX) * 0.5, headY + (wheelY - headY) * 0.5);
        ctx.lineTo(frontWheelX, wheelY);
        ctx.stroke();
        // Handlebar
        ctx.strokeStyle = '#1A202C';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(headX, headY);
        ctx.lineTo(headX + 2, headY - 7);
        ctx.lineTo(headX + 9, headY - 7);
        ctx.stroke();
        // --- Rider ---
        const hipX = seatX + 2;
        const hipY = seatY - 4;
        if (!this.isDucking) {
            // Regular Stance
            const shoulderX = hipX + 11;
            const shoulderY = hipY - 18;
            // Torso Jersey
            ctx.strokeStyle = '#38BDF8';
            ctx.lineWidth = 7.5;
            ctx.beginPath();
            ctx.moveTo(hipX, hipY);
            ctx.lineTo(shoulderX, shoulderY);
            ctx.stroke();
            // Helmet with visor
            ctx.fillStyle = '#F43F5E';
            ctx.beginPath();
            ctx.arc(shoulderX + 4, shoulderY - 8, 7.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0F172A';
            ctx.beginPath();
            ctx.moveTo(shoulderX + 6, shoulderY - 11);
            ctx.lineTo(shoulderX + 14, shoulderY - 8);
            ctx.lineTo(shoulderX + 6, shoulderY - 5);
            ctx.fill();
            // Arm & Glove
            ctx.strokeStyle = '#38BDF8';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(shoulderX, shoulderY);
            ctx.lineTo(headX + 7, headY - 6);
            ctx.stroke();
            // Legs & Pedaling Motion
            const kneeX = hipX + 7 + Math.cos(this.pedalAngle) * 5;
            const kneeY = hipY + 8 + Math.sin(this.pedalAngle) * 5;
            const footX = bbX + Math.cos(this.pedalAngle) * 7;
            const footY = bbY + Math.sin(this.pedalAngle) * 7;
            ctx.strokeStyle = '#1E293B';
            ctx.lineWidth = 4.5;
            ctx.beginPath();
            ctx.moveTo(hipX, hipY);
            ctx.lineTo(kneeX, kneeY);
            ctx.lineTo(footX, footY);
            ctx.stroke();
        } else {
            // Aerodynamic Downhill Tuck Position
            const shoulderX = hipX + 17;
            const shoulderY = hipY - 4;
            // Lowered Torso
            ctx.strokeStyle = '#38BDF8';
            ctx.lineWidth = 7.5;
            ctx.beginPath();
            ctx.moveTo(hipX, hipY);
            ctx.lineTo(shoulderX, shoulderY);
            ctx.stroke();
            // Tucked Helmet
            ctx.fillStyle = '#F43F5E';
            ctx.beginPath();
            ctx.arc(shoulderX + 6, shoulderY - 3, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0F172A';
            ctx.beginPath();
            ctx.moveTo(shoulderX + 8, shoulderY - 6);
            ctx.lineTo(shoulderX + 16, shoulderY - 3);
            ctx.lineTo(shoulderX + 8, shoulderY - 1);
            ctx.fill();
            // Arms bent low
            ctx.strokeStyle = '#38BDF8';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(shoulderX, shoulderY);
            ctx.lineTo(headX + 7, headY - 4);
            ctx.stroke();
            // Deep Leg Tuck
            ctx.strokeStyle = '#1E293B';
            ctx.lineWidth = 4.5;
            ctx.beginPath();
            ctx.moveTo(hipX, hipY);
            ctx.lineTo(hipX + 8, hipY + 5);
            ctx.lineTo(bbX, bbY);
            ctx.stroke();
        }
        ctx.restore();
    },
    getBounds() {
        if (this.isDucking) {
            return { x: this.x - 5, y: this.y - 30, width: 50, height: 30 };
        }
        return { x: this.x - 5, y: this.y - 52, width: 45, height: 52 };
    }
};
// Environment Background with Parallax and Dust Trail
const background = {
    clouds: [],
    mountainsBack: [],
    mountainsFront: [],
    particles: [],
    init() {
        this.clouds = [
            { x: 100, y: 50, scale: 0.9 },
            { x: 450, y: 75, scale: 1.3 },
            { x: 800, y: 40, scale: 0.7 }
        ];
        this.mountainsBack = [
            { x: 0, h: 140 }, { x: 220, h: 190 }, { x: 500, h: 120 },
            { x: 750, h: 170 }, { x: 1020, h: 140 }
        ];
        this.mountainsFront = [
            { x: 0, h: 80 }, { x: 160, h: 115 }, { x: 380, h: 65 },
            { x: 640, h: 100 }, { x: 900, h: 80 }, { x: 1120, h: 90 }
        ];
    },
    update(dt) {
        const dtFactor = dt / 16.67;
        this.clouds.forEach(c => {
            c.x -= gameSpeed * 0.08 * c.scale * dtFactor;
            if (c.x < -120) c.x = GAME_WIDTH + 60;
        });
        this.mountainsBack.forEach(m => { m.x -= gameSpeed * 0.04 * dtFactor; });
        if (this.mountainsBack[0].x < -260) {
            const first = this.mountainsBack.shift();
            first.x = this.mountainsBack[this.mountainsBack.length - 1].x + 240;
            this.mountainsBack.push(first);
        }
        this.mountainsFront.forEach(m => { m.x -= gameSpeed * 0.12 * dtFactor; });
        if (this.mountainsFront[0].x < -220) {
            const first = this.mountainsFront.shift();
            first.x = this.mountainsFront[this.mountainsFront.length - 1].x + 210;
            this.mountainsFront.push(first);
        }
        // Dust Trail Particles
        if (player.isGrounded && gameState === 'PLAYING' && Math.random() < 0.7) {
            this.particles.push({
                x: player.x - 8,
                y: GROUND_Y - 3 + (Math.random() * 6 - 3),
                vx: -gameSpeed * 0.35 - Math.random() * 2,
                vy: -Math.random() * 1.2,
                size: Math.random() * 3.5 + 2,
                alpha: 0.55
            });
        }
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.x += p.vx * dtFactor;
            p.y += p.vy * dtFactor;
            p.alpha -= 0.025 * dtFactor;
            if (p.alpha <= 0) this.particles.splice(i, 1);
        }
    },
    draw() {
        // Smooth Day/Night Sky Cycle
        dayTimeProgress = (Math.sin(score * 0.001) + 1) / 2; // oscillates 0 to 1
        const skyGradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        if (dayTimeProgress > 0.3) {
            // Day / Sunset Sky
            skyGradient.addColorStop(0, '#1E3A8A');
            skyGradient.addColorStop(0.7, '#3B82F6');
            skyGradient.addColorStop(1, '#93C5FD');
        } else {
            // Night Sky
            skyGradient.addColorStop(0, '#0F172A');
            skyGradient.addColorStop(0.7, '#1E1B4B');
            skyGradient.addColorStop(1, '#312E81');
        }
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        // Clouds
        ctx.fillStyle = dayTimeProgress > 0.3 ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.25)';
        this.clouds.forEach(c => {
            ctx.beginPath();
            ctx.arc(c.x, c.y, 20 * c.scale, 0, Math.PI * 2);
            ctx.arc(c.x + 15 * c.scale, c.y - 10 * c.scale, 24 * c.scale, 0, Math.PI * 2);
            ctx.arc(c.x + 35 * c.scale, c.y, 18 * c.scale, 0, Math.PI * 2);
            ctx.fill();
        });
        // Mountains Back
        ctx.fillStyle = dayTimeProgress > 0.3 ? '#334155' : '#1E293B';
        ctx.beginPath();
        ctx.moveTo(0, GROUND_Y);
        this.mountainsBack.forEach(m => { ctx.lineTo(m.x, GROUND_Y - m.h); });
        ctx.lineTo(GAME_WIDTH + 250, GROUND_Y);
        ctx.fill();
        // Mountains Front
        ctx.fillStyle = dayTimeProgress > 0.3 ? '#1E293B' : '#0F172A';
        ctx.beginPath();
        ctx.moveTo(0, GROUND_Y);
        this.mountainsFront.forEach(m => { ctx.lineTo(m.x, GROUND_Y - m.h); });
        ctx.lineTo(GAME_WIDTH + 250, GROUND_Y);
        ctx.fill();
        // Ground Trail
        ctx.fillStyle = '#451A03';
        ctx.fillRect(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y);
        // Grass Top Border
        ctx.fillStyle = '#15803D';
        ctx.fillRect(0, GROUND_Y, GAME_WIDTH, 6);
        // Dirt Particles
        this.particles.forEach(p => {
            ctx.fillStyle = `rgba(180, 140, 100, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
    }
};
// Obstacle System with Polished Sprites
let obstacles = [];
class Obstacle {
    constructor(type) {
        this.type = type;
        this.markedForDeletion = false;
        if (type === 'ROCK') {
            this.width = 38 + Math.random() * 12;
            this.height = 32 + Math.random() * 8;
            this.x = GAME_WIDTH + 20;
            this.y = GROUND_Y - this.height;
        } else if (type === 'LOG') {
            this.width = 54;
            this.height = 24;
            this.x = GAME_WIDTH + 20;
            this.y = GROUND_Y - this.height;
        } else if (type === 'BIRD') {
            this.width = 44;
            this.height = 28;
            this.x = GAME_WIDTH + 20;
            const heights = [GROUND_Y - 78, GROUND_Y - 56, GROUND_Y - 26];
            this.y = heights[Math.floor(Math.random() * heights.length)];
            this.wingAngle = 0;
        }
    }
    update(dt) {
        const dtFactor = dt / 16.67;
        this.x -= gameSpeed * dtFactor;
        if (this.x < -60) this.markedForDeletion = true;
        if (this.type === 'BIRD') {
            this.wingAngle += 0.2 * dtFactor;
        }
    }
    draw() {
        if (this.type === 'ROCK') {
            // Polished Multi-faceted Boulder
            ctx.fillStyle = '#64748B';
            ctx.beginPath();
            ctx.moveTo(this.x, this.y + this.height);
            ctx.lineTo(this.x + 4, this.y + 10);
            ctx.lineTo(this.x + this.width * 0.45, this.y);
            ctx.lineTo(this.x + this.width, this.y + 12);
            ctx.lineTo(this.x + this.width - 2, this.y + this.height);
            ctx.closePath();
            ctx.fill();
            // Facet Shading
            ctx.fillStyle = '#94A3B8';
            ctx.beginPath();
            ctx.moveTo(this.x + 4, this.y + 10);
            ctx.lineTo(this.x + this.width * 0.45, this.y);
            ctx.lineTo(this.x + this.width * 0.55, this.y + this.height);
            ctx.lineTo(this.x, this.y + this.height);
            ctx.fill();
        } else if (this.type === 'LOG') {
            // Detailed Log with Rings
            ctx.fillStyle = '#78350F';
            ctx.beginPath();
            ctx.roundRect(this.x, this.y, this.width, this.height, 4);
            ctx.fill();
            // Cut face ring
            ctx.fillStyle = '#B45309';
            ctx.beginPath();
            ctx.ellipse(this.x + 5, this.y + this.height / 2, 4.5, this.height / 2 - 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#451A03';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(this.x + 5, this.y + this.height / 2, 2.5, this.height / 4, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (this.type === 'BIRD') {
            // Fluid Animated Flying Vulture
            const wingY = Math.sin(this.wingAngle) * 12;
            ctx.fillStyle = '#0F172A';
            ctx.beginPath();
            ctx.ellipse(this.x + 22, this.y + 14, 13, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(this.x + 8, this.y + 11, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#F59E0B';
            ctx.beginPath();
            ctx.moveTo(this.x + 5, this.y + 11);
            ctx.lineTo(this.x - 2, this.y + 13);
            ctx.lineTo(this.x + 5, this.y + 15);
            ctx.fill();
            // Wings
            ctx.strokeStyle = '#0F172A';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(this.x + 22, this.y + 14);
            ctx.lineTo(this.x + 16, this.y + 14 - wingY);
            ctx.lineTo(this.x + 6, this.y + 8 - wingY);
            ctx.stroke();
        }
    }
    getBounds() {
        const p = 5;
        return {
            x: this.x + p,
            y: this.y + p,
            width: this.width - (p * 2),
            height: this.height - (p * 2)
        };
    }
}
let spawnTimer = 0;
let nextSpawnTime = 90;
function handleObstacles(dt) {
    const dtFactor = dt / 16.67;
    spawnTimer += dtFactor;
    if (spawnTimer >= nextSpawnTime) {
        spawnTimer = 0;
        const minSafeFrames = 68;
        const speedBuffer = Math.max(0, (MAX_SPEED - gameSpeed) * 3.2);
        nextSpawnTime = Math.floor(minSafeFrames + speedBuffer + Math.random() * 50);
        const types = ['ROCK', 'LOG'];
        if (score > 100) types.push('BIRD');
        const selectedType = types[Math.floor(Math.random() * types.length)];
        obstacles.push(new Obstacle(selectedType));
    }
    for (let i = obstacles.length - 1; i >= 0; i--) {
        obstacles[i].update(dt);
        obstacles[i].draw();
        if (checkCollision(player.getBounds(), obstacles[i].getBounds())) {
            gameOver();
        }
        if (obstacles[i].markedForDeletion) {
            obstacles.splice(i, 1);
        }
    }
}
function checkCollision(r1, r2) {
    return !(r1.x > r2.x + r2.width ||
        r1.x + r1.width < r2.x ||
        r1.y > r2.y + r2.height ||
        r1.y + r1.height < r2.y);
}
function drawHUD() {
    const scoreStr = 'SCORE: ' + Math.floor(score).toString().padStart(5, '0');
    const highStr = 'HI: ' + highScore.toString().padStart(5, '0');
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.font = 'bold 17px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${highStr}  ${scoreStr}`, GAME_WIDTH - 25, 32);
    ctx.shadowBlur = 0;
}
function gameOver() {
    gameState = 'GAMEOVER';
    AudioSys.playCrash();
    if (Math.floor(score) > highScore) {
        highScore = Math.floor(score);
        localStorage.setItem('mtb_high_score', highScore);
    }
    menuTitle.textContent = '¡GAME OVER!';
    menuSubtitle.textContent = `Puntuación obtenida: ${Math.floor(score)} | Récord: ${highScore}`;
    startBtn.textContent = 'REINTENTAR';
    menuOverlay.classList.remove('hidden');
}
function startGame() {
    score = 0;
    gameSpeed = INITIAL_SPEED;
    obstacles = [];
    spawnTimer = 0;
    lastScoreBeep = 0;
    player.reset();
    gameState = 'PLAYING';
    menuOverlay.classList.add('hidden');
}
// Input Handlers
function handleActionStart(type) {
    AudioSys.init();
    if (gameState === 'START' || gameState === 'GAMEOVER') {
        startGame();
        return;
    }
    if (gameState === 'PLAYING') {
        if (type === 'JUMP') player.jump();
        if (type === 'DUCK') player.isDucking = true;
    }
}
function handleActionEnd(type) {
    if (type === 'DUCK') player.isDucking = false;
}
// Keyboard Event Handling
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        handleActionStart('JUMP');
    }
    if (e.code === 'ArrowDown') {
        e.preventDefault();
        handleActionStart('DUCK');
    }
});
window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowDown') {
        handleActionEnd('DUCK');
    }
});
// Touch Screen / Buttons
const jumpBtn = document.getElementById('jumpBtn');
const duckBtn = document.getElementById('duckBtn');
jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); handleActionStart('JUMP'); });
duckBtn.addEventListener('touchstart', (e) => { e.preventDefault(); handleActionStart('DUCK'); });
duckBtn.addEventListener('touchend', (e) => { e.preventDefault(); handleActionEnd('DUCK'); });
startBtn.addEventListener('click', () => { handleActionStart('JUMP'); });
// Tap top half to jump, bottom half to duck
canvas.addEventListener('touchstart', (e) => {
    if (gameState !== 'PLAYING') return;
    e.preventDefault();
    const touchY = e.touches[0].clientY;
    const rect = canvas.getBoundingClientRect();
    const relativeY = touchY - rect.top;
    if (relativeY < rect.height / 2) {
        handleActionStart('JUMP');
    } else {
        handleActionStart('DUCK');
    }
});
canvas.addEventListener('touchend', () => { handleActionEnd('DUCK'); });
background.init();
// High precision Delta-Time Game Loop
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min(timestamp - lastTime, 50); // Cap max delta time to prevent clipping
    lastTime = timestamp;
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    if (gameState === 'PLAYING') {
        gameSpeed = Math.min(MAX_SPEED, gameSpeed + ACCELERATION * (dt / 16.67));
        score += (gameSpeed * 0.035) * (dt / 16.67);
        const currentMilestone = Math.floor(score / 100);
        if (currentMilestone > lastScoreBeep && currentMilestone > 0) {
            AudioSys.playScore();
            lastScoreBeep = currentMilestone;
        }
        player.update(dt);
        background.update(dt);
    }
    background.draw();
    if (gameState === 'PLAYING') {
        handleObstacles(dt);
    }
    player.draw();
    drawHUD();
    requestAnimationFrame(gameLoop);
}
window.onload = () => {
    requestAnimationFrame(gameLoop);
};