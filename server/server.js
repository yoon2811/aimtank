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
    BULLET_LIFETIME: 3000,
    
    // 스킬 설정 (서버에서 중앙 관리)
    SKILLS: {
        RAPID_FIRE: {
            DURATION: 10000,        // 10초
            COOLDOWN: 10000,        // 10초
            FIRE_RATE_MULTIPLIER: 7 // 7배 빠르게
        },
        SPEED_BOOST: {
            DURATION: 10000,        // 10초
            COOLDOWN: 10000,        // 10초
            SPEED_MULTIPLIER: 3     // 3배 빠르게
        },
        HEAL: {
            HEAL_AMOUNT: 30,        // 30 체력 회복
            COOLDOWN: 60000         // 1분 쿨다운
        }
    }
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

// PVP 게임이므로 레벨업 아이템 클래스 제거

// 게임 상태
const gameState = {
    players: {},
    bullets: [],
    mapElements: []
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

// PVP 게임이므로 레벨업 아이템 제거

// 플레이어 클래스
class Player {
    constructor(id) {
        this.id = id;
        
        // 랜덤 위치에서 시작 (경계에서 100픽셀 떨어진 곳)
        const margin = 100;
        this.x = margin + Math.random() * (GAME_CONFIG.WORLD_WIDTH - 2 * margin);
        this.y = margin + Math.random() * (GAME_CONFIG.WORLD_HEIGHT - 2 * margin);
        
        this.direction = { x: 0, y: -1 };
        this.movement = { left: false, right: false, up: false, down: false };
        this.isFiring = false; // 발사 입력 상태
        this.stats = {
            health: 100,
            maxHealth: 100,
            attackPower: 10,
            fireRate: 1000, // 1초에 1발 (1000ms)
            moveSpeed: GAME_CONFIG.PLAYER_SPEED
        };
        
        // PVP 통계
        this.pvpStats = {
            kills: 0,
            deaths: 0
        };
        this.lastFired = 0;
        
        // 리스폰 무적 시간 (3초)
        this.invulnerableUntil = 0;
        
        // 스킬 시스템 (서버 설정 사용)
        this.skills = {
            rapidFire: {
                isActive: false,
                endTime: 0,
                cooldownEndTime: 0
            },
            speedBoost: {
                isActive: false,
                endTime: 0,
                cooldownEndTime: 0
            },
            heal: {
                isActive: false,
                endTime: 0,
                cooldownEndTime: 0
            }
        };
    }

    update(deltaTime) {
        // 스킬 업데이트
        this.updateSkills();
        
        // 이동 처리
        let moveX = 0;
        let moveY = 0;
        
        const currentMoveSpeed = this.getCurrentMoveSpeed();

        if (this.movement.left) moveX -= currentMoveSpeed;
        if (this.movement.right) moveX += currentMoveSpeed;
        if (this.movement.up) moveY -= currentMoveSpeed;
        if (this.movement.down) moveY += currentMoveSpeed;

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
        
        // 발사 처리 (서버에서 발사 간격 체크)
        if (this.isFiring) {
            this.handleFiring();
        }
    }
    
    handleFiring() {
        const now = Date.now();
        const currentFireRate = this.getCurrentFireRate();
        
        if (now - this.lastFired >= currentFireRate) {
            // 현재 방향으로 총알 생성
            let direction = { ...this.direction };
            
            // 방향이 없는 경우 기본 방향 사용
            if (direction.x === 0 && direction.y === 0) {
                direction = { x: 0, y: -1 }; // 기본 방향 (위쪽)
            }
            
            // 방향 벡터 정규화
            const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
            if (length > 0) {
                direction.x /= length;
                direction.y /= length;
                
                // 총알 생성 (플레이어 이동 벡터 추가)
                const angle = Math.atan2(direction.y, direction.x);
                const offsetX = Math.cos(angle) * 30;
                const offsetY = Math.sin(angle) * 30;
                
                // 플레이어의 현재 이동 벡터 계산
                let playerVelocityX = 0;
                let playerVelocityY = 0;
                
                if (this.movement.left || this.movement.right || this.movement.up || this.movement.down) {
                    const currentMoveSpeed = this.getCurrentMoveSpeed();
                    
                    if (this.movement.left) playerVelocityX -= currentMoveSpeed;
                    if (this.movement.right) playerVelocityX += currentMoveSpeed;
                    if (this.movement.up) playerVelocityY -= currentMoveSpeed;
                    if (this.movement.down) playerVelocityY += currentMoveSpeed;
                    
                    // 대각선 이동 정규화
                    if (playerVelocityX !== 0 && playerVelocityY !== 0) {
                        const diagonalFactor = 1 / Math.sqrt(2);
                        playerVelocityX *= diagonalFactor;
                        playerVelocityY *= diagonalFactor;
                    }
                }
                
                // 총알 속도 = 기본 속도 + 플레이어 이동 속도의 일부
                const velocityBonus = 0.5; // 플레이어 속도의 50%만 추가
                const bulletSpeed = GAME_CONFIG.BULLET_SPEED + 
                    Math.sqrt(playerVelocityX * playerVelocityX + playerVelocityY * playerVelocityY) * velocityBonus;
                
                const bullet = new Bullet(
                    this.id,
                    this.x + offsetX,
                    this.y + offsetY,
                    direction,
                    bulletSpeed,
                    this.stats.attackPower
                );
                
                gameState.bullets.push(bullet);
                this.lastFired = now;
                this.direction = direction;
                
                // 발사 이벤트를 해당 플레이어에게 전송 (사운드 재생용)
                const socket = [...io.sockets.sockets.values()].find(s => s.id === this.id);
                if (socket) {
                    socket.emit('fire_sound');
                }
            }
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
        
        // 가속 스킬 지속시간 체크
        if (this.skills.speedBoost.isActive && now >= this.skills.speedBoost.endTime) {
            this.skills.speedBoost.isActive = false;
            console.log(`플레이어 ${this.id}의 가속 스킬 종료`);
            
            // 해당 플레이어에게 스킬 종료 알림
            const socket = [...io.sockets.sockets.values()].find(s => s.id === this.id);
            if (socket) {
                socket.emit('skill_deactivated', { skillType: 'speed_boost' });
            }
        }
    }

    activateRapidFireSkill() {
        const now = Date.now();
        const skillConfig = GAME_CONFIG.SKILLS.RAPID_FIRE;
        
        // 쿨다운 체크
        if (now < this.skills.rapidFire.cooldownEndTime) {
            return false; // 쿨다운 중
        }
        
        // 스킬 활성화 (서버 설정 사용)
        this.skills.rapidFire.isActive = true;
        this.skills.rapidFire.endTime = now + skillConfig.DURATION;
        this.skills.rapidFire.cooldownEndTime = now + skillConfig.DURATION + skillConfig.COOLDOWN;
        
        console.log(`플레이어 ${this.id}의 연사 스킬 활성화`);
        return true;
    }

    activateSpeedBoostSkill() {
        const now = Date.now();
        const skillConfig = GAME_CONFIG.SKILLS.SPEED_BOOST;
        
        // 쿨다운 체크
        if (now < this.skills.speedBoost.cooldownEndTime) {
            return false; // 쿨다운 중
        }
        
        // 스킬 활성화 (서버 설정 사용)
        this.skills.speedBoost.isActive = true;
        this.skills.speedBoost.endTime = now + skillConfig.DURATION;
        this.skills.speedBoost.cooldownEndTime = now + skillConfig.DURATION + skillConfig.COOLDOWN;
        
        console.log(`플레이어 ${this.id}의 가속 스킬 활성화`);
        return true;
    }

    activateHealSkill() {
        const now = Date.now();
        const skillConfig = GAME_CONFIG.SKILLS.HEAL;
        
        // 쿨다운 체크
        if (now < this.skills.heal.cooldownEndTime) {
            return false; // 쿨다운 중
        }
        
        // 체력이 이미 최대인 경우 사용 불가
        if (this.stats.health >= this.stats.maxHealth) {
            return false; // 체력이 이미 최대
        }
        
        // 체력 회복
        const healAmount = skillConfig.HEAL_AMOUNT;
        const oldHealth = this.stats.health;
        this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + healAmount);
        const actualHealAmount = this.stats.health - oldHealth;
        
        // 스킬 쿨다운 설정 (즉시 효과이므로 지속시간은 없음)
        this.skills.heal.isActive = false;
        this.skills.heal.endTime = now;
        this.skills.heal.cooldownEndTime = now + skillConfig.COOLDOWN;
        
        console.log(`플레이어 ${this.id}의 회복 스킬 사용: ${actualHealAmount} 체력 회복 (${oldHealth} -> ${this.stats.health})`);
        
        // 회복 효과 브로드캐스트
        const socket = [...io.sockets.sockets.values()].find(s => s.id === this.id);
        if (socket) {
            io.emit('heal_effect', {
                playerId: this.id,
                x: this.x,
                y: this.y,
                healAmount: actualHealAmount,
                newHealth: this.stats.health
            });
        }
        
        return true;
    }

    getCurrentFireRate() {
        // 연사 스킬이 활성화되면 발사 속도 증가 (서버 설정 사용)
        if (this.skills.rapidFire.isActive) {
            const multiplier = GAME_CONFIG.SKILLS.RAPID_FIRE.FIRE_RATE_MULTIPLIER;
            return this.stats.fireRate / multiplier; // 1000ms / 5 = 200ms (1초에 5발)
        }
        return this.stats.fireRate; // 기본 1000ms (1초에 1발)
    }

    getCurrentMoveSpeed() {
        // 가속 스킬이 활성화되면 이동 속도 증가 (서버 설정 사용)
        if (this.skills.speedBoost.isActive) {
            const multiplier = GAME_CONFIG.SKILLS.SPEED_BOOST.SPEED_MULTIPLIER;
            return this.stats.moveSpeed * multiplier;
        }
        return this.stats.moveSpeed;
    }

    // PVP 킬 처리
    addKill() {
        this.pvpStats.kills++;
        console.log(`플레이어 ${this.id} 킬 수: ${this.pvpStats.kills}`);
    }

    addDeath() {
        this.pvpStats.deaths++;
        console.log(`플레이어 ${this.id} 데스 수: ${this.pvpStats.deaths}`);
    }

    takeDamage(damage, attackerId) {
        // 무적 상태 체크
        const now = Date.now();
        if (now < this.invulnerableUntil) {
            console.log(`플레이어 ${this.id}는 무적 상태입니다. 피해 무시.`);
            return; // 피해 무시
        }
        
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
            
            // PVP 통계 업데이트
            this.addDeath(); // 사망자 데스 카운트 증가
            
            // 공격자 킬 카운트 증가
            const attacker = gameState.players[attackerId];
            if (attacker) {
                attacker.addKill();
            }
            
            // 모든 플레이어에게 킬 이벤트 브로드캐스트
            io.emit('player_killed_broadcast', {
                attackerId: attackerId,
                targetId: this.id,
                targetX: this.x,
                targetY: this.y,
                attackerKills: attacker ? attacker.pvpStats.kills : 0,
                targetDeaths: this.pvpStats.deaths
            });
            
            this.respawn();
        }
    }

    respawn() {
        // 리스폰 시 체력 회복 및 위치 초기화
        this.stats.health = this.stats.maxHealth;
        
        // 맵 전체에서 랜덤 위치에 리스폰 (경계에서 50픽셀 떨어진 곳)
        const margin = 100; // 경계에서 떨어질 거리
        this.x = margin + Math.random() * (GAME_CONFIG.WORLD_WIDTH - 2 * margin);
        this.y = margin + Math.random() * (GAME_CONFIG.WORLD_HEIGHT - 2 * margin);
        
        // 기본 방향으로 초기화
        this.direction = { x: 0, y: -1 };
        
        // 모든 이동 상태 초기화
        this.movement = { left: false, right: false, up: false, down: false };
        this.isFiring = false;
        
        // 리스폰 후 3초간 무적 상태
        this.invulnerableUntil = Date.now() + 3000;
        
        console.log(`플레이어 ${this.id}가 위치 (${Math.round(this.x)}, ${Math.round(this.y)})에서 리스폰했습니다. (3초간 무적)`);
        
        // 모든 플레이어에게 리스폰 이벤트 브로드캐스트
        io.emit('player_respawn_broadcast', {
            playerId: this.id,
            x: this.x,
            y: this.y,
            health: this.stats.health,
            invulnerableUntil: this.invulnerableUntil
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
    
    console.log('PVP 게임 맵 초기화 완료');
    console.log(`맵 요소: ${gameState.mapElements.length}개`);
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

    // 발사 입력 처리 (클라이언트는 입력 상태만 전달)
    socket.on('fire_input', (isFiring) => {
        const player = gameState.players[socket.id];
        if (player) {
            player.isFiring = isFiring;
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
        } else if (skillType === 'speed_boost') {
            const success = player.activateSpeedBoostSkill();
            // 클라이언트에 스킬 상태 전송
            socket.emit('skill_result', {
                skillType: 'speed_boost',
                success: success,
                skillData: player.skills.speedBoost
            });
        } else if (skillType === 'heal') {
            const success = player.activateHealSkill();
            // 클라이언트에 스킬 상태 전송
            socket.emit('skill_result', {
                skillType: 'heal',
                success: success,
                skillData: player.skills.heal
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

    // 게임 상태 브로드캐스트 (스킬 정보, PVP 통계, 무적 상태 포함)
    const playersWithData = {};
    Object.entries(gameState.players).forEach(([id, player]) => {
        playersWithData[id] = {
            ...player,
            skills: player.skills,           // 스킬 정보 포함
            pvpStats: player.pvpStats,       // PVP 통계 포함
            invulnerableUntil: player.invulnerableUntil  // 무적 상태 포함
        };
    });

    io.emit('game_state', {
        players: playersWithData,
        bullets: gameState.bullets
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