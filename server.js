/*
 * SniArena - 1v1 Sniper Game
 * Copyright (C) 2025 Saif Kayyali
 * Licensed under GNU GPLv3
 */

const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

let players = {};
let bots = {};

const walls = [
    { x: -500, y: -200, w: 300, h: 40 },
    { x: 200, y: 300, w: 40, h: 300 },
    { x: -1000, y: 600, w: 600, h: 40 }
];

function collidesWithWall(x, y, radius = 20) {
    return walls.some(w =>
        x + radius > w.x &&
        x - radius < w.x + w.w &&
        y + radius > w.y &&
        y - radius < w.y + w.h
    );
}

io.on('connection', (socket) => {
    console.log('A sniper has entered the arena!');

    socket.on('joinGame', (data) => {
        players[socket.id] = { 
            x: Math.random() * 600 - 300, 
            y: Math.random() * 600 - 300, 
            angle: 0, 
            color: Object.keys(players).length === 0 ? 'blue' : 'red',
            health: 100,
            score: 0,
            name: data.name || "Player"
        };
        socket.emit('currentPlayers', players);
        socket.broadcast.emit('newPlayer', { id: socket.id, playerInfo: players[socket.id] });
    });

    socket.on('move', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].angle = movementData.angle;
            socket.broadcast.emit('enemyMoved', { 
                id: socket.id, x: movementData.x, y: movementData.y, angle: movementData.angle 
            });
        }
    });

    socket.on('shoot', (bulletData) => {
        socket.broadcast.emit('enemyShoot', bulletData);
    });

    socket.on('playerHit', (targetId) => {
        let shooter = players[socket.id];
        let target = players[targetId];

        if (shooter && target) {
            target.health -= 10;
            
            if (target.health <= 0) {
                target.health = 0; 
                shooter.score += 1;
                
                // --- KILL FEED TRIGGER ---
                io.emit('killEvent', { killer: shooter.name, victim: target.name });

                // --- WIN CHECK (15 KILLS) ---
                if (shooter.score >= 15) {
                    io.emit('gameOver', { 
                        message: `${shooter.name} HAS WON!`, 
                        winnerColor: shooter.color 
                    });
                    
                    setTimeout(() => {
                        Object.keys(players).forEach(id => {
                            players[id].score = 0;
                            players[id].health = 100;
                            players[id].x = 0; 
                            players[id].y = 0;
                        });
                        io.emit('currentPlayers', players);
                    }, 5000);
                }
            }

            io.emit('updateStats', {
                id: targetId,
                health: target.health,
                shooterId: socket.id,
                score: shooter.score
            });
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// --- BOT LOGIC ---
function spawnBot(id) {
    bots[id] = { x: 500, y: 500, angle: 0, health: 50, color: 'green', name: "Bot" };
}
spawnBot('bot_1');

setInterval(() => {
    Object.keys(bots).forEach(botId => {
        let bot = bots[botId];
        let target = null;
        let minDist = Infinity;
        
        Object.keys(players).forEach(pId => {
            let p = players[pId];
            let d = Math.sqrt((p.x - bot.x)**2 + (p.y - bot.y)**2);
            if (d < minDist) { minDist = d; target = p; }
        });

        if (target) {
            bot.angle = Math.atan2(target.y - bot.y, target.x - bot.x);
            
            if (minDist > 200) {
                let nextX = bot.x + Math.cos(bot.angle) * 2;
                let nextY = bot.y + Math.sin(bot.angle) * 2;
                
                if (!collidesWithWall(nextX, nextY)) {
                    bot.x = nextX;
                    bot.y = nextY;
                } else {
                    // Smart Slide: try 45-degree angles to get around the wall
                    for (let angleOffset of [Math.PI/4, -Math.PI/4]) {
                        let slideAngle = bot.angle + angleOffset;
                        let slideX = bot.x + Math.cos(slideAngle) * 2;
                        let slideY = bot.y + Math.sin(slideAngle) * 2;
                        if (!collidesWithWall(slideX, slideY)) {
                            bot.x = slideX;
                            bot.y = slideY;
                            break;
                        }
                    }
                }
            }

            if (Math.random() < 0.03) {
                io.emit('enemyShoot', { x: bot.x, y: bot.y, angle: bot.angle, speed: 700, timer: 2 });
            }
        }
    });
    io.emit('botUpdate', bots);
}, 50);

http.listen(PORT, () => { console.log(`SniArena live at PORT ${PORT}`); });