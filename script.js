/* ═══════════════════════════════════════════════════
   COSMO JUMP — GAME LOGIC
   ═══════════════════════════════════════════════════ */

/* ── Game Constants (tweak these to tune the game) ── */
const CONFIG = {
    /* Player */
    PLAYER_SIZE:        32,
    JUMP_FORCE:         -13,
    GRAVITY:            0.6,
    PLAYER_X_RATIO:     0.15,       // player x = canvas.width * this

    /* Difficulty */
    INITIAL_DIFFICULTY:  5,
    DIFFICULTY_RAMP:     0.0008,     // increment per frame

    /* Platform generation */
    PLAT_WIDTH_START:    350,        // px width at difficulty 5
    PLAT_WIDTH_MIN:      80,         // minimum platform width
    PLAT_WIDTH_SHRINK:   8,          // width lost per difficulty unit
    PLAT_HEIGHT:         20,

    GAP_BASE_START:      80,         // starting gap (easy)
    GAP_BASE_MAX:        200,        // max gap (hard)
    GAP_DIFFICULTY_SCALE: 8,         // how fast gap grows per difficulty unit
    GAP_RANDOM_EXTRA:    40,         // random extra gap (0 to this)

    VERT_DIFF_START:     50,         // starting Y variance (easy)
    VERT_DIFF_MAX:       120,        // max Y variance (hard)
    VERT_DIFF_SCALE:     6,          // how fast Y variance grows
    PLAT_Y_MIN:          200,        // highest platform Y
    PLAT_Y_MARGIN:       100,        // lowest platform = canvas.height - this

    /* Coins */
    COIN_SPAWN_CHANCE:   0.35,       // 35% chance per platform
    COIN_COLLECT_RADIUS: 35,
    COIN_Y_OFFSET:       -40,        // above platform

    /* Points */
    POINTS_PER_PLATFORM: 2,         // multiplied by current difficulty

    /* Particles */
    TRAIL_SPAWN_CHANCE:  0.7,        // chance per frame when trail active
    PARTICLE_DECAY:      0.03,
    EXPLOSION_COUNT:     10,
    EXPLOSION_SPREAD:    12,

    /* Stars */
    STAR_COUNT:          120,
    STAR_PARALLAX:       0.1,

    /* Input */
    JUMP_DEBOUNCE_MS:    80,

    /* Username */
    MIN_USERNAME_LENGTH: 2,
    USERNAME_DEBOUNCE_MS: 500,

    /* Death */
    DEATH_MARGIN:        100,       // fall this far below canvas to die
};

/* ── Shop Items ── */
const SHOP = {
    themes: { default: 0, neon: 20, phantom: 50 },
    trails: { none: 0, pulse: 15, glitch: 40, nitro: 80 }
};

/* ── Canvas & Context ── */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

/* ── Game State ── */
let state = {
    active: false,
    paused: false,
    score: 0,
    points: 0,
    difficulty: CONFIG.INITIAL_DIFFICULTY,
    total: 0,
    highScore: 0,
    username: "",
    usernameValid: false       // ← drives Start Mission button
};

let player = {
    x: 0, y: 0, vy: 0,
    w: CONFIG.PLAYER_SIZE, h: CONFIG.PLAYER_SIZE,
    canJump: false
};

let objects = { platforms: [], items: [], particles: [], stars: [] };
let activeTheme = "default";
let activeTrail = "none";
let lastJumpTime = 0;

/* ── Canvas Resize ── */
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    player.x = canvas.width * CONFIG.PLAYER_X_RATIO;
    objects.stars = Array.from({ length: CONFIG.STAR_COUNT }, () => ({
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
    if (e.target && e.target !== canvas && e.target.tagName !== "CANVAS") return;
    if (e.type === "touchstart") e.preventDefault();
    const now = performance.now();
    if (now - lastJumpTime < CONFIG.JUMP_DEBOUNCE_MS) return;
    lastJumpTime = now;
    if (state.active && !state.paused && player.canJump) {
        player.vy = CONFIG.JUMP_FORCE;
        player.canJump = false;
    }
};
window.addEventListener("touchstart", triggerJump, { passive: false });
window.addEventListener("mousedown", triggerJump);
window.addEventListener("keydown", e => {
    if (e.code === "Space") triggerJump(e);
    if (e.code === "Escape" && state.active) togglePause();
});

/* ═══════════ USERNAME / BACKEND ═══════════ */

const usernameInput = document.getElementById("usernameInput");
const loginStatus = document.getElementById("loginStatus");
const startBtn = document.getElementById("startBtn");
let fetchTimeout = null;

/** Sync the Start Mission button to `state.usernameValid` */
function refreshStartBtn() {
    if (state.usernameValid) {
        startBtn.classList.add("btn-ready");
        startBtn.removeAttribute("disabled");
    } else {
        startBtn.classList.remove("btn-ready");
        startBtn.setAttribute("disabled", "");
    }
}
/* Ensure correct initial state */
refreshStartBtn();

usernameInput.addEventListener("input", () => {
    const raw = usernameInput.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    usernameInput.value = raw;

    /* Username changed → invalid until verified */
    state.usernameValid = false;
    refreshStartBtn();

    if (raw.length < CONFIG.MIN_USERNAME_LENGTH) {
        setLoginStatus("", "");
        return;
    }

    clearTimeout(fetchTimeout);
    setLoginStatus("loading…", "loading");
    fetchTimeout = setTimeout(() => fetchUserData(raw), CONFIG.USERNAME_DEBOUNCE_MS);
});

function setLoginStatus(text, cls) {
    loginStatus.textContent = text;
    loginStatus.className = "login-status " + (cls || "");
}

async function fetchUserData(username) {
    try {
        const res = await fetch(`/api/get-user?username=${encodeURIComponent(username)}`);
        if (!res.ok) throw new Error("Server error");
        const data = await res.json();
        state.username = username;
        state.total = data.balance || 0;
        state.highScore = data.highScore || 0;
        activeTheme = data.theme || "default";
        activeTrail = data.trail || "none";
        setLoginStatus(data.isNew ? `welcome, ${username}!` : `welcome back! balance: ${state.total}`, "success");
        state.usernameValid = true;
        refreshStartBtn();
        fetchLeaderboard("welcomeLbList", 3);
    } catch (err) {
        console.error("fetch user error:", err);
        setLoginStatus("server offline — playing locally", "error");
        state.username = username;
        state.total = Number(localStorage.getItem("g_total_2026")) || 0;
        state.highScore = Number(localStorage.getItem("g_highscore")) || 0;
        activeTheme = localStorage.getItem("g_theme") || "default";
        activeTrail = localStorage.getItem("g_trail") || "none";
        state.usernameValid = true;
        refreshStartBtn();
    }
}

async function saveUserData() {
    localStorage.setItem("g_total_2026", state.total);
    localStorage.setItem("g_theme", activeTheme);
    localStorage.setItem("g_trail", activeTrail);
    localStorage.setItem("g_highscore", state.highScore);
    if (!state.username) return;
    try {
        await fetch("/api/update-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: state.username,
                balance: state.total,
                highScore: state.highScore,
                theme: activeTheme,
                trail: activeTrail
            })
        });
    } catch (err) { console.error("save user error:", err); }
}

/* ═══════════ LEADERBOARD ═══════════ */

async function fetchLeaderboard(containerId, limit) {
    const container = document.getElementById(containerId);
    const section = container.closest(".leaderboard-section");
    try {
        const res = await fetch(`/api/leaderboard?limit=${limit || 10}`);
        if (!res.ok) throw new Error("err");
        const data = await res.json();
        if (data.leaderboard && data.leaderboard.length > 0) {
            section.style.display = "";
            renderLeaderboard(container, data.leaderboard);
        } else {
            section.style.display = "none";
        }
    } catch (err) {
        section.style.display = "none";
    }
}

function renderLeaderboard(container, entries) {
    const rankEmoji = ["🥇", "🥈", "🥉"];
    container.innerHTML = entries.map((e, i) => {
        const isSelf = e.username === state.username;
        const rank = i < 3 ? rankEmoji[i] : `${i + 1}`;
        return `<div class="lb-entry${isSelf ? " self" : ""}">
            <span class="lb-rank">${rank}</span>
            <span class="lb-name">${e.username}</span>
            <span class="lb-score">${Number(e.score).toLocaleString()}</span>
        </div>`;
    }).join("");
}

/* ═══════════ GAME FLOW ═══════════ */

function startGame() {
    if (!state.usernameValid) return;
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
    state.points = 0;
    state.difficulty = CONFIG.INITIAL_DIFFICULTY;
    state.active = true;
    state.paused = false;
    player.y = canvas.height / 2;
    player.vy = 0;
    objects.platforms = [{ x: 0, y: canvas.height - 150, w: canvas.width, h: CONFIG.PLAT_HEIGHT, scored: true }];
    objects.items = [];
    objects.particles = [];
    document.getElementById("gameOver").style.display = "none";
    document.getElementById("pauseOverlay").style.display = "none";
}

function togglePause() {
    if (!state.active) return;
    state.paused = !state.paused;
    document.getElementById("pauseOverlay").style.display = state.paused ? "flex" : "none";
}

/* ═══════════ UPDATE LOOP ═══════════ */

function update() {
    if (!state.active || state.paused) return;

    state.difficulty += CONFIG.DIFFICULTY_RAMP;

    player.vy += CONFIG.GRAVITY;
    player.y += player.vy;
    if (player.y > canvas.height + CONFIG.DEATH_MARGIN) endGame();

    /* Parallax Stars */
    objects.stars.forEach(s => {
        s.x -= (state.difficulty * CONFIG.STAR_PARALLAX) * s.z;
        if (s.x < 0) { s.x = canvas.width; s.y = Math.random() * canvas.height; }
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
            if (!p.scored) {
                p.scored = true;
                state.points += Math.floor(state.difficulty * CONFIG.POINTS_PER_PLATFORM);
            }
        }
    });

    /* ── Platform Generation ── */
    const lastP = objects.platforms[objects.platforms.length - 1];
    const lastRightEdge = lastP.x + lastP.w;
    const elapsed = state.difficulty - CONFIG.INITIAL_DIFFICULTY;
    const baseGap = Math.min(CONFIG.GAP_BASE_MAX, CONFIG.GAP_BASE_START + elapsed * CONFIG.GAP_DIFFICULTY_SCALE);
    const gap = baseGap + Math.random() * CONFIG.GAP_RANDOM_EXTRA;

    if (lastRightEdge < canvas.width - gap) {
        const maxDiff = Math.min(CONFIG.VERT_DIFF_MAX, CONFIG.VERT_DIFF_START + elapsed * CONFIG.VERT_DIFF_SCALE);
        let newY = lastP.y + (Math.random() - 0.5) * (maxDiff * 2);
        newY = Math.max(CONFIG.PLAT_Y_MIN, Math.min(canvas.height - CONFIG.PLAT_Y_MARGIN, newY));

        const newW = Math.max(CONFIG.PLAT_WIDTH_MIN, CONFIG.PLAT_WIDTH_START - state.difficulty * CONFIG.PLAT_WIDTH_SHRINK);
        const newX = canvas.width;

        objects.platforms.push({ x: newX, y: newY, w: newW, h: CONFIG.PLAT_HEIGHT, scored: false });

        if (Math.random() < CONFIG.COIN_SPAWN_CHANCE) {
            objects.items.push({ x: newX + newW / 2, y: newY + CONFIG.COIN_Y_OFFSET, collected: false });
        }
    }
    objects.platforms = objects.platforms.filter(p => p.x + p.w > -100);

    /* Collectibles */
    objects.items.forEach(it => {
        it.x -= state.difficulty;
        if (!it.collected && Math.hypot(player.x - it.x, player.y - it.y) < CONFIG.COIN_COLLECT_RADIUS) {
            it.collected = true;
            state.score++;
            createExplosion(it.x, it.y, varColor());
        }
    });
    objects.items = objects.items.filter(it => !it.collected && it.x > -50);

    /* Particles */
    if (activeTrail !== "none" && Math.random() < CONFIG.TRAIL_SPAWN_CHANCE) {
        objects.particles.push({
            x: player.x - 10, y: player.y,
            vx: -1, vy: (Math.random() - 0.5),
            life: 1, color: varColor()
        });
    }
    objects.particles.forEach(p => { p.life -= CONFIG.PARTICLE_DECAY; p.x += p.vx; p.y += p.vy; });
    objects.particles = objects.particles.filter(p => p.life > 0);

    document.getElementById("scoreVal").innerText = state.score;
    document.getElementById("pointsVal").innerText = state.points.toLocaleString();
}

function createExplosion(x, y, color) {
    for (let i = 0; i < CONFIG.EXPLOSION_COUNT; i++) {
        objects.particles.push({
            x, y,
            vx: (Math.random() - 0.5) * CONFIG.EXPLOSION_SPREAD,
            vy: (Math.random() - 0.5) * CONFIG.EXPLOSION_SPREAD,
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

/* ═══════════ DRAW ═══════════ */

function draw() {
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    objects.stars.forEach(s => {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.z / 4})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
    });

    objects.platforms.forEach(p => {
        ctx.shadowBlur = 10; ctx.shadowColor = "#00f2ff";
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = "#00f2ff"; ctx.lineWidth = 2;
        ctx.strokeRect(p.x, p.y, p.w, p.h);
    });
    ctx.shadowBlur = 0;

    objects.items.forEach(it => {
        ctx.fillStyle = "#ff007f";
        ctx.beginPath(); ctx.arc(it.x, it.y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255, 0, 127, 0.4)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(it.x, it.y, 14, 0, Math.PI * 2); ctx.stroke();
    });

    objects.particles.forEach(p => {
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 3, 3);
    });
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.vy * 0.04);
    ctx.shadowBlur = 15; ctx.shadowColor = varColor();
    ctx.fillStyle = activeTheme === "neon" ? "#00f2ff" : activeTheme === "phantom" ? "#333" : "#fff";
    ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);
    ctx.fillStyle = "#000"; ctx.fillRect(4, -8, 6, 6); ctx.fillRect(14, -8, 6, 6);
    ctx.restore();

    if (state.paused) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

/* ═══════════ GAME OVER / SHOP ═══════════ */

function endGame() {
    state.active = false;
    state.total += state.score;

    const isNewHigh = state.points > state.highScore;
    if (isNewHigh) state.highScore = state.points;

    document.getElementById("highScoreBanner").style.display = isNewHigh ? "block" : "none";
    document.getElementById("pointsEarned").textContent = state.points.toLocaleString();
    document.getElementById("earnedVal").textContent = state.score;
    document.getElementById("balanceVal").textContent = state.total;

    saveUserData();
    buildShop();
    fetchLeaderboard("gameOverLbList", 10);
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

function loop() { update(); draw(); requestAnimationFrame(loop); }
loop();