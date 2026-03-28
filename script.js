/* ═══════════════════════════════════════════════════
   COSMO JUMP — GAME LOGIC
   ═══════════════════════════════════════════════════ */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

/* ── State ── */
let state = {
    active: false,
    paused: false,
    score: 0,
    difficulty: 4.5,
    total: 0,
    username: ""
};

let player = {
    x: 0, y: 0, vy: 0,
    w: 32, h: 32,
    jumpForce: -13,
    gravity: 0.6,
    canJump: false
};

let objects = { platforms: [], items: [], particles: [], stars: [] };
let activeTheme = "default";
let activeTrail = "none";

/* Debounce to prevent double-fire on mobile (touchstart + mousedown) */
let lastJumpTime = 0;
const JUMP_DEBOUNCE_MS = 80;

const SHOP = {
    themes: { default: 0, neon: 20, phantom: 50 },
    trails: { none: 0, pulse: 15, glitch: 40, nitro: 80 }
};

/* ── Canvas Resize ── */
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    player.x = canvas.width * 0.15;

    objects.stars = Array.from({ length: 120 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        z: Math.random() * 3 + 1,
        size: Math.random() * 2
    }));
}
window.addEventListener("resize", resize);
resize();

/* ── Input Handling ── */
const triggerJump = (e) => {
    /* Allow HTML elements (buttons, inputs, overlays) to receive taps normally */
    if (e.target && e.target !== canvas && e.target.tagName !== "CANVAS") return;

    if (e.type === "touchstart") e.preventDefault();

    /* Debounce to prevent double-fire */
    const now = performance.now();
    if (now - lastJumpTime < JUMP_DEBOUNCE_MS) return;
    lastJumpTime = now;

    if (state.active && !state.paused && player.canJump) {
        player.vy = player.jumpForce;
        player.canJump = false;
    }
};
window.addEventListener("touchstart", triggerJump, { passive: false });
window.addEventListener("mousedown", triggerJump);
window.addEventListener("keydown", e => {
    if (e.code === "Space") triggerJump(e);
    if (e.code === "Escape" && state.active) togglePause();
});

/* ═══════════════════════════════════════════════════
   USERNAME / BACKEND
   ═══════════════════════════════════════════════════ */

const usernameInput = document.getElementById("usernameInput");
const loginStatus = document.getElementById("loginStatus");
const startBtn = document.getElementById("startBtn");

let fetchTimeout = null;

usernameInput.addEventListener("input", () => {
    const raw = usernameInput.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    usernameInput.value = raw;

    startBtn.disabled = true;

    if (raw.length < 2) {
        setLoginStatus("", "");
        return;
    }

    /* Debounce the fetch by 500ms */
    clearTimeout(fetchTimeout);
    setLoginStatus("loading…", "loading");
    fetchTimeout = setTimeout(() => fetchUserData(raw), 500);
});

function setLoginStatus(text, className) {
    loginStatus.textContent = text;
    loginStatus.className = "login-status " + (className || "");
}

async function fetchUserData(username) {
    try {
        const res = await fetch(`/api/get-user?username=${encodeURIComponent(username)}`);
        if (!res.ok) throw new Error("Server error");
        const data = await res.json();

        state.username = username;
        state.total = data.balance || 0;
        activeTheme = data.theme || "default";
        activeTrail = data.trail || "none";

        setLoginStatus(data.isNew ? `welcome, ${username}!` : `welcome back! balance: ${state.total}`, "success");
        startBtn.disabled = false;
    } catch (err) {
        console.error("fetch user error:", err);
        setLoginStatus("server offline — playing locally", "error");

        /* Fallback to localStorage so the game is still playable */
        state.username = username;
        state.total = Number(localStorage.getItem("g_total_2026")) || 0;
        activeTheme = localStorage.getItem("g_theme") || "default";
        activeTrail = localStorage.getItem("g_trail") || "none";
        startBtn.disabled = false;
    }
}

async function saveUserData() {
    /* Always save to localStorage as fallback */
    localStorage.setItem("g_total_2026", state.total);
    localStorage.setItem("g_theme", activeTheme);
    localStorage.setItem("g_trail", activeTrail);

    if (!state.username) return;

    try {
        await fetch("/api/update-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: state.username,
                balance: state.total,
                theme: activeTheme,
                trail: activeTrail
            })
        });
    } catch (err) {
        console.error("save user error:", err);
    }
}

/* ═══════════════════════════════════════════════════
   GAME FLOW
   ═══════════════════════════════════════════════════ */

function startGame() {
    if (startBtn.disabled) return;
    const welcome = document.getElementById("welcome");
    welcome.style.opacity = "0";
    setTimeout(() => {
        welcome.style.display = "none";
        state.active = true;
        resetGame();
    }, 300);
}

function resetGame() {
    state.score = 0;
    state.difficulty = 5;
    state.active = true;
    state.paused = false;
    player.y = canvas.height / 2;
    player.vy = 0;

    objects.platforms = [{ x: 0, y: canvas.height - 150, w: canvas.width, h: 20 }];
    objects.items = [];
    objects.particles = [];

    document.getElementById("gameOver").style.display = "none";
    document.getElementById("pauseOverlay").style.display = "none";
}

/* ── Pause ── */
function togglePause() {
    if (!state.active) return;
    state.paused = !state.paused;
    document.getElementById("pauseOverlay").style.display = state.paused ? "flex" : "none";
}

/* ═══════════════════════════════════════════════════
   UPDATE LOOP
   ═══════════════════════════════════════════════════ */

function update() {
    if (!state.active || state.paused) return;

    state.difficulty += 0.0008;
    player.vy += player.gravity;
    player.y += player.vy;

    if (player.y > canvas.height + 100) endGame();

    /* Parallax Stars */
    objects.stars.forEach(s => {
        s.x -= (state.difficulty * 0.1) * s.z;
        if (s.x < 0) {
            s.x = canvas.width;
            s.y = Math.random() * canvas.height;
        }
    });

    /* Platform Collision & Movement */
    objects.platforms.forEach(p => {
        p.x -= state.difficulty;

        if (player.vy >= 0 &&
            player.x + player.w / 2 > p.x &&
            player.x - player.w / 2 < p.x + p.w &&
            player.y + player.h / 2 >= p.y &&
            player.y - player.vy + player.h / 2 <= p.y + 10) {

            player.y = p.y - player.h / 2;
            player.vy = 0;
            player.canJump = true;
        }
    });

    /* Platform Generation */
    if (objects.platforms[objects.platforms.length - 1].x < canvas.width - (150 + state.difficulty * 5)) {
        let last = objects.platforms[objects.platforms.length - 1];
        let maxDiff = 120;
        let newY = last.y + (Math.random() - 0.5) * (maxDiff * 2);
        newY = Math.max(200, Math.min(canvas.height - 100, newY));
        let newW = Math.max(100, 250 - state.difficulty * 8);
        let newX = canvas.width;

        objects.platforms.push({ x: newX, y: newY, w: newW, h: 20 });

        if (Math.random() > 0.4) {
            objects.items.push({ x: newX + newW / 2, y: newY - 40, collected: false });
        }
    }
    objects.platforms = objects.platforms.filter(p => p.x + p.w > -100);

    /* ── Collectibles (FIXED: no more .splice inside .forEach) ── */
    objects.items.forEach(it => {
        it.x -= state.difficulty;
        if (!it.collected && Math.hypot(player.x - it.x, player.y - it.y) < 35) {
            it.collected = true;
            state.score++;
            createExplosion(it.x, it.y, varColor());
        }
    });
    objects.items = objects.items.filter(it => !it.collected && it.x > -50);

    /* ── Particles / Trails (FIXED: same filter approach) ── */
    if (activeTrail !== "none" && Math.random() > 0.3) {
        objects.particles.push({
            x: player.x - 10, y: player.y,
            vx: -1, vy: (Math.random() - 0.5),
            life: 1, color: varColor()
        });
    }
    objects.particles.forEach(p => {
        p.life -= 0.03;
        p.x += p.vx;
        p.y += p.vy;
    });
    objects.particles = objects.particles.filter(p => p.life > 0);

    document.getElementById("scoreVal").innerText = state.score;
}

function createExplosion(x, y, color) {
    for (let i = 0; i < 10; i++) {
        objects.particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() - 0.5) * 12,
            life: 1, color
        });
    }
}

function varColor() {
    if (activeTrail === "pulse") return "#00f2ff";
    if (activeTrail === "glitch") return Math.random() > 0.5 ? "#ff007f" : "#00f2ff";
    if (activeTrail === "nitro") return "#00ff88";
    return "#ffffff";
}

/* ═══════════════════════════════════════════════════
   DRAW LOOP
   ═══════════════════════════════════════════════════ */

function draw() {
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* Stars */
    objects.stars.forEach(s => {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.z / 4})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
    });

    /* Platforms */
    objects.platforms.forEach(p => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#00f2ff";
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = "#00f2ff";
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x, p.y, p.w, p.h);
    });

    ctx.shadowBlur = 0;

    /* Items (coins) */
    objects.items.forEach(it => {
        ctx.fillStyle = "#ff007f";
        ctx.beginPath();
        ctx.arc(it.x, it.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 0, 127, 0.4)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(it.x, it.y, 14, 0, Math.PI * 2);
        ctx.stroke();
    });

    /* Particles */
    objects.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 3, 3);
    });
    ctx.globalAlpha = 1;

    /* Player */
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.vy * 0.04);
    ctx.shadowBlur = 15;
    ctx.shadowColor = varColor();
    ctx.fillStyle = activeTheme === "neon" ? "#00f2ff" : activeTheme === "phantom" ? "#333" : "#fff";
    ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);

    /* Eyes */
    ctx.fillStyle = "#000";
    ctx.fillRect(4, -8, 6, 6);
    ctx.fillRect(14, -8, 6, 6);
    ctx.restore();

    /* Dim overlay when paused */
    if (state.paused) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

/* ═══════════════════════════════════════════════════
   GAME OVER / SHOP
   ═══════════════════════════════════════════════════ */

function endGame() {
    state.active = false;
    state.total += state.score;

    /* Populate currency cards */
    document.getElementById("earnedVal").textContent = state.score;
    document.getElementById("balanceVal").textContent = state.total;

    saveUserData();
    buildShop();
    document.getElementById("gameOver").style.display = "flex";
}

function buildShop() {
    const createGrid = (type, containerId) => {
        const container = document.getElementById(containerId);
        container.innerHTML = "";
        Object.entries(SHOP[type]).forEach(([name, cost]) => {
            const isLocked = state.total < cost;
            const isActive = (type === "themes" ? activeTheme : activeTrail) === name;
            const div = document.createElement("div");
            div.className = `item ${isLocked ? "locked" : ""} ${isActive ? "active" : ""}`;
            div.innerHTML = `${name}<span class="item-cost">${isLocked ? "🔒 " + cost : "✓ USE"}</span>`;
            if (!isLocked) {
                div.onclick = () => {
                    if (type === "themes") activeTheme = name;
                    else activeTrail = name;
                    saveUserData();
                    buildShop();
                };
            }
            container.appendChild(div);
        });
    };
    createGrid("trails", "trailShop");
    createGrid("themes", "themeShop");
}

/* ── Main Loop ── */
function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}
loop();