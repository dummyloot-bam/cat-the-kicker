// Cat Kicker Arcade - Game Logic

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const quitBtn = document.getElementById('quit-btn');
const scoreEl = document.getElementById('score');
const finalScoreEl = document.getElementById('final-score');
const comboEl = document.getElementById('combo');
const comboDisplayEl = document.getElementById('combo-display');
const livesEl = document.getElementById('lives-display');

// Mobile buttons
const btnUp = document.getElementById('btn-up');
const btnDown = document.getElementById('btn-down');
const btnKick = document.getElementById('btn-kick');

// Game State
let GAME_W = 1000;
let GAME_H = 600;
let gameState = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let combo = 0;
let lives = 3;
let difficultyMultiplier = 1;
let lastTime = 0;

// Resize canvas
function resize() {
    const container = document.getElementById('game-container');
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    GAME_W = rect.width;
    GAME_H = rect.height;
}
window.addEventListener('resize', resize);
resize();

// --- Audio Synthesizer ---
const AudioSys = {
    ctx: null,
    bgmNode: null,
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        this.startBGM();
    },
    playTone(freq, type, duration, vol = 0.1) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    startBGM() {
        if (this.bgmNode) return;
        // Super simple retro arpeggio loop
        const notes = [300, 400, 500, 600, 500, 400];
        let noteIndex = 0;

        const playNext = () => {
            if (gameState !== 'PLAYING') {
                setTimeout(playNext, 200);
                return;
            }
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = notes[noteIndex];

            gain.gain.setValueAtTime(0.03, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.2);

            noteIndex = (noteIndex + 1) % notes.length;
            setTimeout(playNext, 200);
        };
        playNext();
        this.bgmNode = true;
    },
    swipe() { this.playTone(300, 'sine', 0.15, 0.1); this.playTone(400, 'triangle', 0.1, 0.05); },
    hit() {
        this.playTone(600, 'square', 0.1, 0.1);
        setTimeout(() => this.playTone(800, 'square', 0.1, 0.1), 50);
        setTimeout(() => this.playTone(1200, 'square', 0.2, 0.1), 100);
    },
    miss() {
        this.playTone(200, 'sawtooth', 0.3, 0.1);
        setTimeout(() => this.playTone(150, 'sawtooth', 0.4, 0.1), 150);
    },
    gameOver() {
        [400, 350, 300, 250, 200].forEach((f, i) => {
            setTimeout(() => this.playTone(f, 'sine', 0.3, 0.2), i * 300);
        });
    }
};

// --- Input Handling ---
const Keys = { up: false, down: false, space: false };

window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowUp') Keys.up = true;
    if (e.code === 'ArrowDown') Keys.down = true;
    if (e.code === 'Space') {
        if (!Keys.space && gameState === 'PLAYING') cat.swipe();
        Keys.space = true;
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowUp') Keys.up = false;
    if (e.code === 'ArrowDown') Keys.down = false;
    if (e.code === 'Space') Keys.space = false;
});

// Mobile Input
const bindBtn = (el, key) => {
    const press = (e) => {
        e.preventDefault();
        if (key === 'space' && !Keys.space && gameState === 'PLAYING') cat.swipe();
        Keys[key] = true;
    };
    const release = (e) => {
        e.preventDefault();
        Keys[key] = false;
    };
    el.addEventListener('touchstart', press, { passive: false });
    el.addEventListener('touchend', release, { passive: false });
    el.addEventListener('mousedown', press, { passive: false });
    el.addEventListener('mouseup', release, { passive: false });
};
bindBtn(btnUp, 'up');
bindBtn(btnDown, 'down');
bindBtn(btnKick, 'space');

// --- Game Objects ---
class Cat {
    constructor() {
        this.x = 100;
        this.y = GAME_H / 2;
        this.radius = 45;
        this.speed = 450; // px per sec
        this.state = 'idle'; // idle, swipe, happy, sad
        this.stateTimer = 0;
        this.pawExt = 0;
    }
    update(dt) {
        if (gameState !== 'PLAYING') return;

        if (Keys.up) this.y -= this.speed * dt;
        if (Keys.down) this.y += this.speed * dt;

        // Bounds
        this.y = Math.max(this.radius + 20, Math.min(GAME_H - this.radius - 20, this.y));

        if (this.stateTimer > 0) {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                this.state = 'idle';
                this.pawExt = 0;
            }
        }

        if (this.state === 'swipe') {
            // Animate paw out and back
            const p = 1 - (this.stateTimer / 0.15); // 0 to 1
            this.pawExt = Math.sin(p * Math.PI) * 45; // max extension
        }
    }
    swipe() {
        if (this.state === 'swipe') return;
        this.state = 'swipe';
        this.stateTimer = 0.15;
        AudioSys.swipe();

        // Check hit
        if (!ball.kicked) {
            const dist = Math.abs(this.y - ball.y);
            // Sweet spot hit detection
            if (dist < this.radius + ball.radius + 30) {
                ball.kick();
            }
        }
    }
    react(emotion) {
        this.state = emotion;
        this.stateTimer = 1.0;
    }
    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Body (Orange Cat)
        ctx.fillStyle = '#ff9800';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e65100';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Ears
        ctx.beginPath();
        ctx.moveTo(-25, -35); ctx.lineTo(-35, -70); ctx.lineTo(0, -45);
        ctx.moveTo(20, -35); ctx.lineTo(30, -70); ctx.lineTo(0, -45);
        ctx.fillStyle = '#ff9800';
        ctx.fill();
        ctx.stroke();

        // Inner ears
        ctx.fillStyle = '#fce4ec';
        ctx.beginPath();
        ctx.moveTo(-22, -38); ctx.lineTo(-30, -58); ctx.lineTo(-6, -42);
        ctx.moveTo(18, -38); ctx.lineTo(25, -58); ctx.lineTo(4, -42);
        ctx.fill();

        // White belly/face highlight
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(15, 10, 25, 0, Math.PI * 2);
        ctx.fill();

        // Eyes setup (facing right)
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(15, -10, 12, 0, Math.PI * 2);
        ctx.arc(32, -10, 9, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = '#000';
        let pupilY = -10;
        let pSize1 = 6, pSize2 = 4;

        let expressionOffset = 0;

        if (this.state === 'sad') {
            pupilY = -5; // look down
            ctx.fillStyle = '#01579b'; // tear
            ctx.beginPath(); ctx.arc(15, 5, 4, 0, Math.PI * 2); ctx.fill();
            expressionOffset = 5;
            ctx.fillStyle = '#000';
        } else if (this.state === 'happy') {
            // squint eyes
            pSize1 = pSize2 = 2;
        } else if (this.state === 'swipe') {
            pSize1 = 8; pSize2 = 6; // wide eyed
        }

        ctx.beginPath();
        ctx.arc(18, pupilY, pSize1, 0, Math.PI * 2);
        ctx.arc(34, pupilY, pSize2, 0, Math.PI * 2);
        ctx.fill();

        // Nose/Mouth
        ctx.fillStyle = '#ff4081';
        ctx.beginPath();
        ctx.arc(38, 5 + expressionOffset, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        if (this.state === 'sad') {
            ctx.beginPath(); ctx.arc(38, 15 + expressionOffset, 6, Math.PI, Math.PI * 2); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.arc(38, 10 + expressionOffset, 6, 0, Math.PI); ctx.stroke();
        }

        // Paw (Swiping hand)
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#e65100';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(20 + this.pawExt, 20, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Paw details (beans)
        ctx.fillStyle = '#ff4081';
        ctx.beginPath(); ctx.arc(26 + this.pawExt, 20, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(20 + this.pawExt, 14, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(14 + this.pawExt, 20, 3, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    }
}

class Ball {
    constructor() {
        this.reset();
    }
    reset() {
        this.x = cat.x + 80;
        this.y = cat.y;
        this.radius = 18;
        this.kicked = false;
        this.vx = 0;
        this.vy = 0;
        this.color = ['#ff5252', '#448aff', '#69f0ae', '#ffd740'][Math.floor(Math.random() * 4)];
        this.rotation = 0;
    }
    kick() {
        this.kicked = true;
        this.vx = 1000 * (1 + (difficultyMultiplier - 1) * 0.3); // High speed
        this.vy = (Math.random() - 0.5) * 150; // Curve
    }
    update(dt) {
        if (!this.kicked) {
            // Hover safely near cat
            this.y = cat.y + Math.sin(Date.now() / 150) * 8;
            this.x = cat.x + 85 + Math.cos(Date.now() / 200) * 3;
            this.rotation += dt;
        } else {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.rotation += dt * 15;

            if (this.x > GAME_W + 50) {
                handleMiss();
            } else {
                // Check collision with target
                const dx = this.x - target.x;
                const dy = this.y - target.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < this.radius + target.radius) {
                    handleHit();
                }
            }
        }
    }
    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(-5, -5, 5, 0, Math.PI * 2);
        ctx.fill();

        // Arcade Pattern on ball
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-this.radius, 0); ctx.lineTo(this.radius, 0);
        ctx.moveTo(0, -this.radius); ctx.lineTo(0, this.radius);
        ctx.stroke();

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }
}

class Target {
    constructor() {
        this.x = GAME_W - 120;
        this.y = GAME_H / 2;
        this.radius = 50;
        this.time = 0;
        this.baseSpeed = 2.5;
    }
    update(dt) {
        this.x = GAME_W - 100; // keep relative pos
        this.time += dt * this.baseSpeed * difficultyMultiplier;

        const amplitude = (GAME_H / 2) - this.radius - 30;
        // Complex movement: sine + smaller fast sine
        this.y = (GAME_H / 2) + Math.sin(this.time) * amplitude + Math.sin(this.time * 2.5) * 20;
    }
    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Pulsing scale
        const scale = 1 + Math.sin(Date.now() / 100) * 0.05;
        ctx.scale(scale, scale);

        // Glow
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 30;

        // Rings
        const colors = ['#f44336', '#fff', '#f44336', '#fff', '#ffeb3b'];
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = colors[i];
            ctx.beginPath();
            ctx.arc(0, 0, this.radius - (i * 10), 0, Math.PI * 2);
            ctx.fill();

            // stroke per ring
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.restore();
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
        this.floatingTexts = [];
    }
    spawnExplosion(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 800,
                vy: (Math.random() - 0.5) * 800,
                life: 1.0,
                decay: Math.random() * 1.5 + 1.0,
                color: color || ['#ffeb3b', '#69f0ae', '#ff5252', '#fff'][Math.floor(Math.random() * 4)],
                size: Math.random() * 10 + 5
            });
        }
    }
    spawnDust(x, y) {
        for (let i = 0; i < 15; i++) {
            this.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 200,
                vy: (Math.random() - 0.5) * 200,
                life: 1.0,
                decay: 2.0,
                color: '#9e9e9e',
                size: Math.random() * 15 + 5
            });
        }
    }
    spawnText(x, y, text, color) {
        this.floatingTexts.push({ x, y, text, color, life: 1.0 });
    }
    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 400 * dt; // gravity
            p.life -= dt * p.decay;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            let ft = this.floatingTexts[i];
            ft.y -= 100 * dt; // float up
            ft.life -= dt * 1.5;
            if (ft.life <= 0) this.floatingTexts.splice(i, 1);
        }
    }
    render(ctx) {
        for (let p of this.particles) {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            // simple circle particle
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        for (let ft of this.floatingTexts) {
            ctx.globalAlpha = Math.max(0, ft.life);
            ctx.fillStyle = ft.color;
            ctx.font = '900 30px Outfit';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 4;
            ctx.strokeText(ft.text, ft.x, ft.y);
            ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.globalAlpha = 1.0;
    }
}

// Scenery
const clouds = [];
for (let i = 0; i < 8; i++) {
    clouds.push({ x: Math.random() * 2000, y: Math.random() * 250, s: Math.random() * 0.6 + 0.4 });
}

function renderBackground(ctx, dt) {
    // Clouds parallax
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    clouds.forEach(c => {
        c.x -= 40 * c.s * dt;
        if (c.x < -200) c.x = GAME_W + 200;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 40 * c.s, 0, Math.PI * 2);
        ctx.arc(c.x + 30 * c.s, c.y - 20 * c.s, 50 * c.s, 0, Math.PI * 2);
        ctx.arc(c.x + 70 * c.s, c.y, 40 * c.s, 0, Math.PI * 2);
        ctx.fill();
    });

    // Sub-background trees silhouette
    ctx.fillStyle = 'rgba(56, 142, 60, 0.5)';
    ctx.beginPath();
    for (let x = 0; x < GAME_W; x += 100) {
        ctx.arc(x, GAME_H - 100, 80, Math.PI, 0);
    }
    ctx.fill();

    // Grass floor
    ctx.fillStyle = '#689f38';
    ctx.beginPath();
    ctx.ellipse(GAME_W / 2, GAME_H + 100, GAME_W, 200, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8bc34a';
    ctx.beginPath();
    ctx.ellipse(GAME_W / 2, GAME_H + 130, GAME_W, 200, 0, 0, Math.PI * 2);
    ctx.fill();
}

// Gameplay logic
let cat, ball, target, particles;

function initGame() {
    cat = new Cat();
    ball = new Ball();
    target = new Target();
    particles = new ParticleSystem();
    score = 0;
    combo = 0;
    lives = 3;
    difficultyMultiplier = 1;
    updateHUD();
    gameState = 'PLAYING';
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    AudioSys.init();

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function handleHit() {
    AudioSys.hit();
    particles.spawnExplosion(target.x, target.y, null, 40);
    combo++;
    let points = 10 + (combo > 1 ? combo * 5 : 0);
    score += points;

    particles.spawnText(target.x - 20, target.y - 30, `+${points}`, '#ffeb3b');

    // Difficulty scale
    if (score % 100 === 0) {
        difficultyMultiplier += 0.15;
    }

    cat.react('happy');
    updateHUD();
    ball.reset();
}

function handleMiss() {
    AudioSys.miss();
    lives--;
    combo = 0;
    particles.spawnDust(ball.x, ball.y);
    cat.react('sad');
    updateHUD();

    if (lives <= 0) {
        triggerGameOver();
    } else {
        ball.reset();
    }
}

function updateHUD() {
    scoreEl.innerText = score;
    comboEl.innerText = combo;

    if (combo > 1) {
        // Pop animation reset trick
        comboDisplayEl.classList.remove('hidden');
        comboDisplayEl.style.animation = 'none';
        void comboDisplayEl.offsetWidth; // trigger reflow
        comboDisplayEl.style.animation = 'popInOut 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    } else {
        comboDisplayEl.classList.add('hidden');
    }

    let hearts = '';
    for (let i = 0; i < lives; i++) hearts += '❤️';
    livesEl.innerText = hearts;
}

function triggerGameOver() {
    gameState = 'GAMEOVER';
    AudioSys.gameOver();
    gameOverScreen.classList.remove('hidden');
    finalScoreEl.innerText = score;
}

// --- Main Loop ---
function gameLoop(time) {
    if (gameState !== 'PLAYING') return;

    let dt = (time - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1; // clamp dt
    lastTime = time;

    // Clear
    ctx.clearRect(0, 0, GAME_W, GAME_H);

    // Render Scenery
    renderBackground(ctx, dt);

    // Update & Render Game Entities
    target.update(dt);
    target.render(ctx);

    particles.update(dt);
    particles.render(ctx);

    cat.update(dt);
    cat.render(ctx);

    ball.update(dt);
    ball.render(ctx);

    requestAnimationFrame(gameLoop);
}

// Draw initial static screen
function renderIdleScreen() {
    resize();
    cat = new Cat();
    target = new Target();
    ctx.clearRect(0, 0, GAME_W, GAME_H);
    renderBackground(ctx, 0.016);
    target.render(ctx);
    cat.render(ctx);
}
// Render the first frame so it's not a blank canvas
requestAnimationFrame(renderIdleScreen);

// Button Events
startBtn.addEventListener('click', () => {
    AudioSys.init();

    // Request full screen and lock orientation on mobile/tablets
    if (window.innerWidth <= 900) {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) docEl.requestFullscreen().catch((err) => console.log(err));
        else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen().catch((err) => console.log(err));

        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch((err) => console.log(err));
        }
    }

    initGame();
});
restartBtn.addEventListener('click', () => { initGame(); });
quitBtn.addEventListener('click', () => {
    gameState = 'START';
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    renderIdleScreen();
});
