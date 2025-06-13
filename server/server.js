const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 게임 설정
const GAME_CONFIG = {
    WORLD_WIDTH: 2000,
    WORLD_HEIGHT: 2000,
    UPDATE_RATE: 60,
    PLAYER_SPEED: 160,
    BULLET_SPEED: 400,
    BULLET_LIFETIME: 3000
};

// 맵 요소 클래스들
class MapElement {
    constructor(x, y, type, data = {}) {
        this.x = x;
        this.y = y;
        this.type = type; // 'obstacle', 'tree', 'corner', 'grid'
        this.data = data;
    }
}

class LevelUpItem {
    constructor(x, y) {
        this.id = Date.now() + Math.random();
        this.x = x;
        this.y = y;
        this.type = 'exp';
        this.value = 1;
        this.active = true;
    }
}

// 게임 상태
const gameState = {
    players: {},
    bullets: [],
    mapElements: [],
    levelUpItems: [],
    gameMap: null
};

// 맵 생성 함수
function generateMap() {
    const mapElements = [];
    
    // 격자 패턴 정보만 생성
    const gridSize = 100;
    for (let x = gridSize; x < GAME_CONFIG.WORLD_WIDTH; x += gridSize) {
        mapElements.push(new MapElement(x, 0, 'grid_vertical', { 
            endY: GAME_CONFIG.WORLD_HEIGHT,
            color: 0x333333 // 더 어두운 회색으로 변경
        }));
    }
    
    for (let y = gridSize; y < GAME_CONFIG.WORLD_HEIGHT; y += gridSize) {
        mapElements.push(new MapElement(0, y, 'grid_horizontal', { 
            endX: GAME_CONFIG.WORLD_WIDTH,
            color: 0x333333 // 더 어두운 회색으로 변경
        }));
    }
    
    return mapElements;
}

// 레벨업 아이템 생성
function generateLevelUpItems() {
    const items = [];
    
    // 맵 크기에 비례하여 아이템 수 조정 (2000x2000 맵에 50개)
    const mapArea = GAME_CONFIG.WORLD_WIDTH * GAME_CONFIG.WORLD_HEIGHT;
    const baseArea = 4000 * 4000; // 기준 맵 크기
    const baseItemCount = 100; // 기준 아이템 수
    const itemCount = Math.floor((mapArea / baseArea) * baseItemCount);
    
    console.log(`맵 크기: ${GAME_CONFIG.WORLD_WIDTH}x${GAME_CONFIG.WORLD_HEIGHT}`);
    console.log(`아이템 수: ${itemCount}개`);
    
    for (let i = 0; i < itemCount; i++) {
        const x = Math.random() * (GAME_CONFIG.WORLD_WIDTH - 200) + 100;
        const y = Math.random() * (GAME_CONFIG.WORLD_HEIGHT - 200) + 100;
        
        items.push(new LevelUpItem(x, y));
    }
    
    return items;
}

// 플레이어 클래스
class Player {
    constructor(id) {
        this.id = id;
        this.x = GAME_CONFIG.WORLD_WIDTH / 2;
        this.y = GAME_CONFIG.WORLD_HEIGHT / 2;
        this.direction = { x: 0, y: -1 };
        this.movement = { left: false, right: false, up: false, down: false };
        this.stats = {
            level: 1,
            exp: 0,
            expToNext: 10,
            health: 10,
            maxHealth: 10,
            attackPower: 1,
            fireRate: 1000,
            moveSpeed: GAME_CONFIG.PLAYER_SPEED
        };
        this.lastFired = 0;
        
        // 스킬 시스템
        this.skills = {
            rapidFire: {
                isActive: false,
                endTime: 0,
                cooldownEndTime: 0,
                duration: 10000, // 10초
                cooldownTime: 10000 // 10초
            }
        };
    }

    update(deltaTime) {
        // 스킬 업데이트
        this.updateSkills();
        
        // 이동 처리
        let moveX = 0;
        let moveY = 0;

        if (this.movement.left) moveX -= this.stats.moveSpeed;
        if (this.movement.right) moveX += this.stats.moveSpeed;
        if (this.movement.up) moveY -= this.stats.moveSpeed;
        if (this.movement.down) moveY += this.stats.moveSpeed;

        // 대각선 이동 정규화
        if (moveX !== 0 && moveY !== 0) {
            const diagonalFactor = 1 / Math.sqrt(2);
            moveX *= diagonalFactor;
            moveY *= diagonalFactor;
        }

        // 위치 업데이트
        this.x += moveX * deltaTime;
        this.y += moveY * deltaTime;

        // 월드 경계 체크
        this.x = Math.max(50, Math.min(GAME_CONFIG.WORLD_WIDTH - 50, this.x));
        this.y = Math.max(50, Math.min(GAME_CONFIG.WORLD_HEIGHT - 50, this.y));

        // 방향 업데이트
        if (moveX !== 0 || moveY !== 0) {
            this.direction = { x: moveX, y: moveY };
        }
    }

    updateSkills() {
        const now = Date.now();
        
        // 연사 스킬 지속시간 체크
        if (this.skills.rapidFire.isActive && now >= this.skills.rapidFire.endTime) {
            this.skills.rapidFire.isActive = false;
            console.log(`플레이어 ${this.id}의 연사 스킬 종료`);
            
            // 해당 플레이어에게 스킬 종료 알림
            const socket = [...io.sockets.sockets.values()].find(s => s.id === this.id);
            if (socket) {
                socket.emit('skill_deactivated', { skillType: 'rapid_fire' });
            }
        }
    }

    activateRapidFireSkill() {
        const now = Date.now();
        
        // 쿨다운 체크
        if (now < this.skills.rapidFire.cooldownEndTime) {
            return false; // 쿨다운 중
        }
        
        // 스킬 활성화
        this.skills.rapidFire.isActive = true;
        this.skills.rapidFire.endTime = now + this.skills.rapidFire.duration;
        this.skills.rapidFire.cooldownEndTime = now + this.skills.rapidFire.duration + this.skills.rapidFire.cooldownTime;
        
        console.log(`플레이어 ${this.id}의 연사 스킬 활성화`);
        return true;
    }

    getCurrentFireRate() {
        // 연사 스킬이 활성화되면 발사 속도 10배 증가
        return this.skills.rapidFire.isActive ? this.stats.fireRate / 10 : this.stats.fireRate;
    }

    // 레벨업 아이템 충돌 체크
    checkItemCollision() {
        const playerRadius = 30;
        
        gameState.levelUpItems.forEach((item, index) => {
            if (!item.active) return;
            
            const distance = Math.sqrt(
                Math.pow(this.x - item.x, 2) + 
                Math.pow(this.y - item.y, 2)
            );
            
            if (distance < playerRadius) {
                // 아이템 획득
                item.active = false;
                this.gainExp(item.value);
                
                // 아이템 제거
                gameState.levelUpItems.splice(index, 1);
                
                // 새 아이템 생성 (맵에 항상 일정 수량 유지)
                if (gameState.levelUpItems.length < 50) {
                    const x = Math.random() * (GAME_CONFIG.WORLD_WIDTH - 200) + 100;
                    const y = Math.random() * (GAME_CONFIG.WORLD_HEIGHT - 200) + 100;
                    gameState.levelUpItems.push(new LevelUpItem(x, y));
                }
            }
        });
    }

    gainExp(amount) {
        this.stats.exp += amount;
        
        // 레벨업 체크
        if (this.stats.exp >= this.stats.expToNext) {
            this.levelUp();
        }
    }

    levelUp() {
        this.stats.level++;
        this.stats.exp -= this.stats.expToNext;
        this.stats.expToNext = Math.ceil(this.stats.expToNext * 1.5);
        
        // 자동 스탯 증가 (체력 증가량도 조정)
        this.stats.maxHealth += 5;
        this.stats.health = Math.min(this.stats.health + 5, this.stats.maxHealth);
        this.stats.attackPower += 1;
        this.stats.fireRate = Math.max(200, this.stats.fireRate * 0.9);
        this.stats.moveSpeed += 10;
        
        console.log(`플레이어 ${this.id} 레벨업! 레벨: ${this.stats.level}`);
    }

    takeDamage(damage, attackerId) {
        this.stats.health -= damage;
        console.log(`플레이어 ${this.id}가 ${attackerId}에게 ${damage}의 피해를 입었습니다. 남은 체력: ${this.stats.health}`);
        
        // 모든 플레이어에게 피격 이벤트 브로드캐스트
        io.emit('player_hit_broadcast', {
            damage: damage,
            attackerId: attackerId,
            targetId: this.id,
            targetX: this.x,
            targetY: this.y,
            remainingHealth: this.stats.health
        });
        
        if (this.stats.health <= 0) {
            this.stats.health = 0;
            console.log(`플레이어 ${this.id}가 ${attackerId}에게 사망했습니다.`);
            
            // 모든 플레이어에게 킬 이벤트 브로드캐스트
            io.emit('player_killed_broadcast', {
                attackerId: attackerId,
                targetId: this.id,
                targetX: this.x,
                targetY: this.y
            });
            
            this.respawn();
        }
    }

    respawn() {
        // 리스폰 시 체력 회복 및 위치 초기화
        this.stats.health = this.stats.maxHealth;
        this.x = GAME_CONFIG.WORLD_WIDTH / 2 + (Math.random() - 0.5) * 200;
        this.y = GAME_CONFIG.WORLD_HEIGHT / 2 + (Math.random() - 0.5) * 200;
        console.log(`플레이어 ${this.id}가 리스폰했습니다.`);
        
        // 모든 플레이어에게 리스폰 이벤트 브로드캐스트
        io.emit('player_respawn_broadcast', {
            playerId: this.id,
            x: this.x,
            y: this.y,
            health: this.stats.health
        });
    }
}

// 총알 클래스
class Bullet {
    constructor(playerId, x, y, direction, speed, damage) {
        this.id = Date.now() + Math.random();
        this.playerId = playerId;
        this.x = x;
        this.y = y;
        this.direction = direction;
        this.speed = speed;
        this.damage = damage;
        this.createdAt = Date.now();
    }

    update(deltaTime) {
        this.x += this.direction.x * this.speed * deltaTime;
        this.y += this.direction.y * this.speed * deltaTime;
        
        return !(this.x < -50 || this.x > GAME_CONFIG.WORLD_WIDTH + 50 ||
                this.y < -50 || this.y > GAME_CONFIG.WORLD_HEIGHT + 50 ||
                Date.now() - this.createdAt > GAME_CONFIG.BULLET_LIFETIME);
    }

    // 총알과 플레이어 충돌 체크
    checkPlayerCollision(players) {
        for (let playerId in players) {
            // 자신이 쏜 총알은 자신과 충돌하지 않음
            if (playerId === this.playerId) continue;
            
            const player = players[playerId];
            const distance = Math.sqrt(
                Math.pow(this.x - player.x, 2) + 
                Math.pow(this.y - player.y, 2)
            );
            
            // 플레이어 히트박스 (반지름 20)
            if (distance < 20) {
                // 충돌 발생
                player.takeDamage(this.damage, this.playerId);
                return true; // 총알 제거
            }
        }
        return false; // 충돌 없음
    }
}

// 게임 초기화
function initializeGame() {
    gameState.mapElements = generateMap();
    gameState.levelUpItems = generateLevelUpItems();
    
    console.log('게임 맵 초기화 완료');
    console.log(`맵 요소: ${gameState.mapElements.length}개`);
    console.log(`레벨업 아이템: ${gameState.levelUpItems.length}개`);
}

// 소켓 연결 처리
io.on('connection', (socket) => {
    console.log('플레이어 연결됨:', socket.id);

    // 새 플레이어 생성
    gameState.players[socket.id] = new Player(socket.id);

    // 클라이언트에 초기 맵 정보 전송
    socket.emit('map_data', {
        mapElements: gameState.mapElements,
        worldSize: {
            width: GAME_CONFIG.WORLD_WIDTH,
            height: GAME_CONFIG.WORLD_HEIGHT
        }
    });

    // 이동 시작
    socket.on('move_start', (direction) => {
        const player = gameState.players[socket.id];
        if (player) {
            player.movement[direction] = true;
        }
    });

    // 이동 중지
    socket.on('move_stop', (direction) => {
        const player = gameState.players[socket.id];
        if (player) {
            player.movement[direction] = false;
        }
    });

    // 발사
    socket.on('fire', (direction) => {
        const player = gameState.players[socket.id];
        if (player && direction && direction.x !== undefined && direction.y !== undefined) {
            const now = Date.now();
            const currentFireRate = player.getCurrentFireRate();
            if (now - player.lastFired >= currentFireRate) {
                const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
                const normalizedDirection = {
                    x: direction.x / length,
                    y: direction.y / length
                };
                
                const angle = Math.atan2(normalizedDirection.y, normalizedDirection.x);
                const offsetX = Math.cos(angle) * 30;
                const offsetY = Math.sin(angle) * 30;
                
                const bullet = new Bullet(
                    socket.id,
                    player.x + offsetX,
                    player.y + offsetY,
                    normalizedDirection,
                    GAME_CONFIG.BULLET_SPEED,
                    player.stats.attackPower
                );
                
                gameState.bullets.push(bullet);
                player.lastFired = now;
                player.direction = normalizedDirection;
            }
        }
    });

    // 스킬 사용
    socket.on('use_skill', (skillType) => {
        const player = gameState.players[socket.id];
        if (!player) return;
        
        if (skillType === 'rapid_fire') {
            const success = player.activateRapidFireSkill();
            // 클라이언트에 스킬 상태 전송
            socket.emit('skill_result', {
                skillType: 'rapid_fire',
                success: success,
                skillData: player.skills.rapidFire
            });
        }
    });

    // 연결 해제
    socket.on('disconnect', () => {
        console.log('플레이어 연결 해제:', socket.id);
        delete gameState.players[socket.id];
    });
});

// 게임 루프
const gameLoop = () => {
    const deltaTime = 1 / GAME_CONFIG.UPDATE_RATE;

    // 플레이어 업데이트
    Object.values(gameState.players).forEach(player => {
        player.update(deltaTime);
        player.checkItemCollision();
    });

    // 총알 업데이트 및 충돌 검사
    gameState.bullets = gameState.bullets.filter(bullet => {
        // 총알 위치 업데이트
        const isAlive = bullet.update(deltaTime);
        if (!isAlive) return false;
        
        // 플레이어와 충돌 검사
        const hitPlayer = bullet.checkPlayerCollision(gameState.players);
        if (hitPlayer) {
            console.log(`총알 충돌! 총알 ID: ${bullet.id}`);
            return false; // 총알 제거
        }
        
        return true; // 총알 유지
    });

    // 게임 상태 브로드캐스트 (스킬 정보 포함)
    const playersWithSkills = {};
    Object.entries(gameState.players).forEach(([id, player]) => {
        playersWithSkills[id] = {
            ...player,
            skills: player.skills // 스킬 정보 포함
        };
    });

    io.emit('game_state', {
        players: playersWithSkills,
        bullets: gameState.bullets,
        levelUpItems: gameState.levelUpItems
    });
};

// 게임 초기화 및 시작
initializeGame();
setInterval(gameLoop, 1000 / GAME_CONFIG.UPDATE_RATE);

// 서버 시작
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
}); 