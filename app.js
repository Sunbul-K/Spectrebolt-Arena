/*
 * SniArena - 1v1 Sniper Game
 * Copyright (C) 2025 Saif Kayyali
 * Licensed under GNU GPLv3
 */

const canvas = document.getElementById('gameCanvas');
const contx = canvas.getContext('2d');
const socket = io(); // Connect to server


let myName = "Player";
let gameStarted = false;

document.getElementById('startButton').addEventListener('click', () => {
    const input = document.getElementById('nameInput').value;
    if (input.trim() !== "") {
        myName = input;
        document.getElementById('nameScreen').style.display = 'none';
        gameStarted = true;
        socket.emit('joinGame', { name: myName }); // Tell server who we are
        gameLoop(); // Start the loop ONLY now
    }
});

let lastTime = performance.now();
let player = { x: 400, y: 300, color: 'blue', angle: 0 };
let bullets = [];
let enemies={}

const MAP = {
    minX: -2000,
    maxX:  2000,
    minY: -2000,
    maxY:  2000
};

const walls = [
    { x: -500, y: -200, w: 300, h: 40 },
    { x: 200, y: 300, w: 40, h: 300 },
    { x: -1000, y: 600, w: 600, h: 40 }
];

let muzzleFlashTimer = 0;


const keys = { w: false, a: false, s: false, d: false };

// Handle server messages
socket.on('currentPlayers', (serverPlayers) => {
    Object.keys(serverPlayers).forEach((id) => {
        if (id !== socket.id) {
            enemies[id] = serverPlayers[id];
        }
    });
});

socket.on('newPlayer', (data) => {
    enemies[data.id] = data.playerInfo;
});

socket.on('enemyMoved', (data) => {
    if (enemies[data.id]) {
        enemies[data.id].x = data.x;
        enemies[data.id].y = data.y;
        enemies[data.id].angle = data.angle;
    }
});

socket.on('playerDisconnected', (id) => {
    delete enemies[id];
});

socket.on('killEvent', (data) => {
    const feed = document.getElementById('killFeed');
    const entry = document.createElement('div');
    
    entry.style.background = "rgba(0, 0, 0, 0.6)";
    entry.style.color = "#ff4444";
    entry.style.padding = "5px 10px";
    entry.style.marginBottom = "5px";
    entry.style.borderRadius = "3px";
    entry.style.borderRight = "4px solid white";
    
    entry.innerHTML = `<span style="color:#00ff44">${data.killer}</span> sniped <span style="color:white">${data.victim}</span>`;
    
    feed.appendChild(entry);

    // Remove the message after 4 seconds
    setTimeout(() => {
        entry.style.opacity = '0';
        entry.style.transition = 'opacity 0.5s ease';
        setTimeout(() => entry.remove(), 500);
    }, 4000);
});

function drawEnemies() {
    Object.keys(enemies).forEach((id) => {
        let e = enemies[id];
        contx.save();
        contx.translate(e.x, e.y);
        contx.fillStyle = "white";
        contx.textAlign = "center";
        contx.font = "14px Arial";
        contx.fillText(e.name || "Enemy", 0, -30);
        contx.rotate(e.angle);
        contx.fillStyle = 'red'; // Enemy color
        contx.beginPath();
        contx.arc(0, 0, 20, 0, Math.PI * 2);
        contx.fill();
        contx.fillRect(0, -2, 30, 4); 
        contx.restore();
    });
}


// Key Listeners
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight", " "].indexOf(e.key) > -1) {
        e.preventDefault();
    }
    // WASD
    if (keys.hasOwnProperty(key)) keys[key] = true;
    
    // Arrow Keys Mapping
    if (e.key === 'ArrowUp')    keys.w = true;
    if (e.key === 'ArrowDown')  keys.s = true;
    if (e.key === 'ArrowLeft')  keys.a = true;
    if (e.key === 'ArrowRight') keys.d = true;
    
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    
    // WASD
    if (keys.hasOwnProperty(key)) keys[key] = false;
    
    // Arrow Keys Mapping
    if (e.key === 'ArrowUp')    keys.w = false;
    if (e.key === 'ArrowDown')  keys.s = false;
    if (e.key === 'ArrowLeft')  keys.a = false;
    if (e.key === 'ArrowRight') keys.d = false;
});

// Aiming Logic
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    
    // Account for the camera offset
    const camX = canvas.width / 2 - player.x;
    const camY = canvas.height / 2 - player.y;

    // Mouse position relative to the player
    let mouseX = e.clientX - rect.left - camX;
    let mouseY = e.clientY - rect.top - camY;

    let dx = mouseX - player.x;
    let dy = mouseY - player.y;
    player.angle = Math.atan2(dy, dx);
});


window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    shoot();
});

// Movement Function

function handle_movement(deltaTime) {
    let oldX=player.x
    let oldY=player.y
    const speed = 300; //pixels per sec
    if (keys.w) player.y -= speed*deltaTime;
    if (keys.s) player.y += speed*deltaTime;
    if (keys.a) player.x -= speed*deltaTime;
    if (keys.d) player.x += speed*deltaTime; 

    if(collidesWithWall(player.x,player.y)){
        player.x=oldX
        player.y=oldY
    }

    if (keys.w || keys.a || keys.s || keys.d) {
        socket.emit('move', { x: player.x, y: player.y, angle: player.angle });
    }
    player.x = Math.max(MAP.minX, Math.min(MAP.maxX, player.x));
    player.y = Math.max(MAP.minY, Math.min(MAP.maxY, player.y));
}

let lastshot=0;
let fireRate=0.3 //seconds

function shoot() {
    let now=performance.now()/1000
    if (now-lastshot<fireRate) return;
    lastshot=now
    muzzleFlashTimer = 5;
    const bulletData = {
        x: player.x,
        y: player.y,
        angle: player.angle,
        speed: 700, //pixels per sec
        timer: 1.5 //seconds
    };
    
    bullets.push(bulletData);
    socket.emit('shoot', bulletData);
}

// Updated Leaderboard UI in app.js to show scores
function updateLeaderboardUI() {
    document.getElementById('healthVal').innerText = player.health || 100;
    
    let scoreText = `Scores: ${myName} (${player.score || 0})`;
    Object.keys(enemies).forEach(id => {
        let name = enemies[id].name || "Enemy";
        scoreText += ` | ${name} (${enemies[id].score || 0})`;
    });
    document.getElementById('leaderboard').innerText = scoreText;
}

function updateBullets(deltaTime) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];

        if (collidesWithWall(b.x, b.y, 3)) 
        {
            bullets.splice(i, 1);
            continue;
        }

        b.x += Math.cos(b.angle) * b.speed * deltaTime;
        b.y += Math.sin(b.angle) * b.speed * deltaTime;

        b.timer -= deltaTime;

        if (b.timer <= 0) {
            bullets.splice(i, 1);
            continue;
        }

        let hit = false;

        // Check for hits on Players
        Object.keys(enemies).forEach(id => {
            if (hit) return;
            let e = enemies[id];
            let dx = b.x - e.x;
            let dy = b.y - e.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 20) {
                socket.emit('playerHit', id);
                bullets.splice(i, 1);
                hit = true;
            }
        });

        // Check for hits on Bots 
        if (!hit) { 
            Object.keys(bots).forEach(botId => {
                if (hit) return;
                let b_target = bots[botId];
                let dx = b.x - b_target.x;
                let dy = b.y - b_target.y;
                let dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 20) {
                    socket.emit('playerHit', botId); // Server handles bot health
                    bullets.splice(i, 1);
                    hit = true;
                }
            });
        }

        if (hit) continue;

        contx.fillStyle = "black";
        contx.beginPath();
        contx.arc(b.x, b.y, 3, 0, Math.PI * 2);
        contx.fill();
    }
}

socket.on('updateStats', (data) => {
    if (data.id === socket.id) {
        player.health = data.health;
    } else if (enemies[data.id]) {
        enemies[data.id].health = data.health;
    }
    // Update Leaderboard UI
    updateLeaderboardUI();
});

socket.on('gameOver', (data) => {
    const screen = document.getElementById('victoryScreen');
    const text = document.getElementById('victoryText');
    
    text.innerText = data.message;
    text.style.color = data.winnerColor;
    screen.style.display = 'flex';

    // Hide it after 5 seconds
    setTimeout(() => {
        screen.style.display = 'none';
    }, 5000);
});
let bots = {};

socket.on('botUpdate', (serverBots) => {
    bots = serverBots;
});

// Makes bots figure

function drawBots() {
    Object.keys(bots).forEach(id => {
        let b = bots[id];
        contx.save();
        contx.translate(b.x, b.y);
        contx.rotate(b.angle);
        contx.fillStyle = 'green'; 
        contx.beginPath();
        contx.arc(0, 0, 20, 0, Math.PI * 2);
        contx.fill();
        contx.fillRect(0, -2, 30, 4); 
        contx.restore();
    });
}
function drawPlayer() {
    contx.save();
    contx.translate(player.x, player.y);
    contx.fillStyle = "white";
    contx.textAlign = "center";
    contx.font = "14px Arial";
    contx.fillText(myName, 0, -30); // Draw name above head
    contx.rotate(player.angle);
    if (muzzleFlashTimer > 0) {
        contx.fillStyle = "yellow";
        contx.beginPath();
        contx.arc(35, 0, 10, 0, Math.PI * 2); // Flash at end of barrel
        contx.fill();
        muzzleFlashTimer--;
    }

    contx.fillStyle = player.color;
    contx.beginPath();
    contx.arc(0, 0, 20, 0, Math.PI * 2);
    contx.fill();
    contx.fillRect(0, -2, 30, 4); 
    contx.restore();
}

function drawGrid() {
    contx.strokeStyle = "#00ff44";
    contx.lineWidth = 1;
    const gridSize = 100;

    // Draw lines every 100 pixels for 2000px in each direction
    for (let x = -2000; x <= 2000; x += gridSize) {
        contx.beginPath();
        contx.moveTo(x, -2000);
        contx.lineTo(x, 2000);
        contx.stroke();
    }
    for (let y = -2000; y <= 2000; y += gridSize) {
        contx.beginPath();
        contx.moveTo(-2000, y);
        contx.lineTo(2000, y);
        contx.stroke();
    }
}
function drawMapBorder() {
    contx.strokeStyle = "#fe0505ff";
    contx.lineWidth = 4;
    contx.strokeRect(
        MAP.minX,
        MAP.minY,
        MAP.maxX - MAP.minX,
        MAP.maxY - MAP.minY
    );
}

function drawWalls() {
    contx.fillStyle = "#888";
    walls.forEach(w => {
        contx.fillRect(w.x, w.y, w.w, w.h);
    });
}

function collidesWithWall(x, y, radius = 20) {
    return walls.some(w =>
        x + radius > w.x &&
        x - radius < w.x + w.w &&
        y + radius > w.y &&
        y - radius < w.y + w.h
    );
}




function gameLoop(currentTime) {
    // Clear screen
    contx.clearRect(0, 0, canvas.width, canvas.height);

    let deltaTime = (currentTime - lastTime) / 1000; // seconds
    lastTime = currentTime;
    deltaTime=Math.min(deltaTime, 0.05) // max 50 ms


    // Calculate Camera Offset (Center the player)
    const camX = canvas.width / 2 - player.x;
    const camY = canvas.height / 2 - player.y;

    // Slide the world and save normal state
    contx.save();
    contx.translate(camX, camY);

    // DRAW A BACKGROUND GRID 
    drawGrid();
    drawMapBorder();
    drawWalls()

    handle_movement(deltaTime);
    updateBullets(deltaTime);
    drawEnemies();
    drawPlayer();
    drawBots()

    // Restore the state so the UI doesn't slide away
    contx.restore();

    requestAnimationFrame(gameLoop);
}