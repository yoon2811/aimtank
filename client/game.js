// 게임 설정
const gameConfig = {
    type: Phaser.AUTO,
    width: Math.floor(window.innerWidth * 0.9),
    height: Math.floor(window.innerHeight * 0.9),
    parent: 'gameContainer',
    backgroundColor: '#000000',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

// 게임 변수들
let gameScene;
let socket;
let players = {};
let bullets = new Map();
let levelUpItems = new Map();
let mapElements = [];
let cursors;
let lastFired = 0;
let isPaused = false;

// 이동 상태 추적
let movementState = {
    left: false,
    right: false,
    up: false,
    down: false
};

// UI 요소들
let expBar;
let levelText;
let healthBar;
let statsPanel;
let isStatsVisible = false;

// 미니맵 관련
let minimap = null;
let minimapTank = null;

// 오디오 관련
let audioContext;
let isSoundEnabled = true;

function preload() {
    // 이미지 없이 도형으로만 구현
}

function create() {
    gameScene = this;
    
    // 소켓 연결
    socket = io('http://localhost:3000');
    
    // 소켓 이벤트 리스너
    socket.on('connect', () => {
        console.log('서버에 연결됨');
    });
    
    socket.on('map_data', (data) => {
        console.log('맵 데이터 수신:', data);
        createMapFromServer(data);
    });
    
    socket.on('game_state', (state) => {
        updateGameState(state);
    });
    
    // 피격 이벤트 브로드캐스트 처리
    socket.on('player_hit_broadcast', (data) => {
        // 모든 플레이어에게 동일한 피격 표시
        showHitDamageEffect(data);
        
        if (data.targetId === socket.id) {
            // 자신이 피격당한 경우에만 추가 효과
            showSelfHitEffect(data);
        }
    });
    
    // 킬 이벤트 브로드캐스트 처리
    socket.on('player_killed_broadcast', (data) => {
        if (data.attackerId === socket.id) {
            // 자신이 킬한 경우
            showKillEffect(data);
        } else {
            // 다른 플레이어의 킬을 관전하는 경우
            showOtherPlayerKillEffect(data);
        }
    });
    
    // 리스폰 이벤트 브로드캐스트 처리
    socket.on('player_respawn_broadcast', (data) => {
        if (data.playerId === socket.id) {
            // 자신이 리스폰한 경우
            showRespawnEffect(data);
        } else {
            // 다른 플레이어가 리스폰한 경우
            showOtherPlayerRespawnEffect(data);
        }
    });
    
    // 오디오 초기화
    initAudio();
    
    // UI 생성
    createUI();
    
    // 키보드 입력 설정
    cursors = this.input.keyboard.createCursorKeys();
    
    // 스페이스바 키 추가
    gameScene.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
}

function createMapFromServer(data) {
    const { mapElements: serverMapElements, worldSize } = data;
    
    // 월드 크기 설정
    gameScene.physics.world.setBounds(0, 0, worldSize.width, worldSize.height);
    
    // 맵 배경 생성 (검정색)
    const mapBackground = gameScene.add.rectangle(0, 0, worldSize.width, worldSize.height, 0x000000);
    mapBackground.setOrigin(0, 0);
    
    // 서버에서 받은 맵 요소들 렌더링 (격자만)
    serverMapElements.forEach(element => {
        switch (element.type) {
            case 'grid_vertical':
                const vLine = gameScene.add.line(0, 0, element.x, 0, element.x, element.data.endY, element.data.color);
                vLine.setLineWidth(1);
                vLine.setOrigin(0, 0);
                break;
                
            case 'grid_horizontal':
                const hLine = gameScene.add.line(0, 0, 0, element.y, element.data.endX, element.y, element.data.color);
                hLine.setLineWidth(1);
                hLine.setOrigin(0, 0);
                break;
        }
    });
    
    mapElements = serverMapElements;
    
    // 미니맵 생성 (맵 데이터를 받은 후에 생성)
    createMinimap(worldSize);
    
    console.log('맵 렌더링 완료');
}

function update(time, delta) {
    if (isPaused) return;
    
    // 이동 입력 처리
    handleMovement();
    
    // 발사 입력 처리 (스페이스바)
    handleFiring();
    
    // 플레이어와 총알 렌더링 업데이트
    updateRenderables();
}

function handleFiring() {
    if (gameScene.spaceKey.isDown) {
        const now = Date.now();
        if (now - lastFired >= 1000) {
            // 현재 이동 방향 계산
            let direction = { x: 0, y: -1 }; // 기본 방향 (위쪽)
            
            if (movementState.left && movementState.up) {
                direction = { x: -1, y: -1 };
            } else if (movementState.right && movementState.up) {
                direction = { x: 1, y: -1 };
            } else if (movementState.left && movementState.down) {
                direction = { x: -1, y: 1 };
            } else if (movementState.right && movementState.down) {
                direction = { x: 1, y: 1 };
            } else if (movementState.left) {
                direction = { x: -1, y: 0 };
            } else if (movementState.right) {
                direction = { x: 1, y: 0 };
            } else if (movementState.up) {
                direction = { x: 0, y: -1 };
            } else if (movementState.down) {
                direction = { x: 0, y: 1 };
            }
            
            // 방향 벡터 정규화
            const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
            if (length > 0) {
                direction.x /= length;
                direction.y /= length;
                
                // 발사 이벤트 전송
                socket.emit('fire', direction);
                lastFired = now;
                
                // 발사 효과음 재생
                playFireSound();
            }
        }
    }
}

function handleMovement() {
    // 이전 상태와 비교하여 변경된 경우만 전송
    const newState = {
        left: cursors.left.isDown,
        right: cursors.right.isDown,
        up: cursors.up.isDown,
        down: cursors.down.isDown
    };
    
    // 각 방향별로 상태 변경 체크
    Object.keys(newState).forEach(direction => {
        if (newState[direction] !== movementState[direction]) {
            if (newState[direction]) {
                socket.emit('move_start', direction);
            } else {
                socket.emit('move_stop', direction);
            }
            movementState[direction] = newState[direction];
        }
    });
}

function updateGameState(state) {
    // 플레이어 업데이트
    Object.entries(state.players).forEach(([id, playerData]) => {
        if (!players[id]) {
            players[id] = createPlayer(id, playerData);
        } else {
            updatePlayer(players[id], playerData);
        }
    });
    
    // 연결이 끊어진 플레이어 제거
    Object.keys(players).forEach(id => {
        if (!state.players[id]) {
            if (players[id].graphic) players[id].graphic.destroy();
            if (players[id].barrel) players[id].barrel.destroy();
            delete players[id];
        }
    });
    
    // 총알 업데이트
    const currentBulletIds = new Set(bullets.keys());
    
    state.bullets.forEach(bulletData => {
        currentBulletIds.delete(bulletData.id);
        
        if (!bullets.has(bulletData.id)) {
            createBullet(bulletData);
        } else {
            const bullet = bullets.get(bulletData.id);
            updateBullet(bullet, bulletData);
        }
    });
    
    // 서버에서 사라진 총알들 제거
    currentBulletIds.forEach(id => {
        const bullet = bullets.get(id);
        if (bullet && bullet.graphic) {
            bullet.graphic.destroy();
        }
        bullets.delete(id);
    });
    
    // 레벨업 아이템 업데이트
    const currentItemIds = new Set(levelUpItems.keys());
    
    state.levelUpItems.forEach(itemData => {
        currentItemIds.delete(itemData.id);
        
        if (!levelUpItems.has(itemData.id)) {
            createLevelUpItem(itemData);
        }
    });
    
    // 서버에서 사라진 아이템들 제거
    currentItemIds.forEach(id => {
        const item = levelUpItems.get(id);
        if (item && item.graphic) {
            item.graphic.destroy();
        }
        levelUpItems.delete(id);
    });
    
    // 로컬 플레이어 UI 업데이트
    const localPlayer = state.players[socket.id];
    if (localPlayer) {
        updateUI(localPlayer.stats);
        updateMinimap(localPlayer);
    }
}

function createPlayer(id, data) {
    const isLocalPlayer = id === socket.id;
    const color = isLocalPlayer ? 0x00ff00 : 0xff0000;
    
    const player = {
        id,
        graphic: gameScene.add.rectangle(data.x, data.y, 40, 40, color),
        barrel: gameScene.add.rectangle(data.x + 15, data.y, 30, 6, color),
        data
    };
    
    player.graphic.setStrokeStyle(2, 0xffffff);
    player.barrel.setStrokeStyle(1, 0xffffff);
    player.graphic.setDepth(2);
    player.barrel.setDepth(2);
    
    if (isLocalPlayer) {
        // 로컬 플레이어는 카메라가 따라다님
        gameScene.cameras.main.startFollow(player.graphic);
        // 카메라 바운드를 서버에서 받은 월드 크기로 설정
        if (minimap && minimap.worldSize) {
            gameScene.cameras.main.setBounds(0, 0, minimap.worldSize.width, minimap.worldSize.height);
        }
    }
    
    return player;
}

function updatePlayer(player, data) {
    // 보간을 통한 부드러운 이동
    const lerpFactor = 0.3;
    player.graphic.x += (data.x - player.graphic.x) * lerpFactor;
    player.graphic.y += (data.y - player.graphic.y) * lerpFactor;
    
    // 포신 위치 및 방향 업데이트
    const angle = Math.atan2(data.direction.y, data.direction.x);
    player.barrel.x = player.graphic.x + Math.cos(angle) * 25;
    player.barrel.y = player.graphic.y + Math.sin(angle) * 25;
    player.barrel.rotation = angle;
    player.graphic.rotation = angle;
    
    // 데이터 업데이트
    player.data = data;
}

function createBullet(data) {
    const bullet = {
        ...data,
        graphic: gameScene.add.circle(data.x, data.y, 4, 0xffff00)
    };
    bullet.graphic.setStrokeStyle(1, 0xffffff);
    bullet.graphic.setDepth(1);
    bullets.set(data.id, bullet);
    return bullet;
}

function updateBullet(bullet, data) {
    if (bullet && bullet.graphic) {
        // 총알은 빠르게 움직이므로 보간 없이 직접 업데이트
        bullet.graphic.x = data.x;
        bullet.graphic.y = data.y;
    }
}

function createLevelUpItem(data) {
    const item = {
        ...data,
        graphic: gameScene.add.polygon(data.x, data.y, [
            0, -8,   // 위
            8, 0,    // 오른쪽
            0, 8,    // 아래
            -8, 0    // 왼쪽
        ], 0x00aaff)
    };
    
    item.graphic.setStrokeStyle(2, 0x0088cc);
    item.graphic.setDepth(0);
    
    // 반짝이는 효과
    gameScene.tweens.add({
        targets: item.graphic,
        scaleX: 1.2,
        scaleY: 1.2,
        duration: 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
    
    levelUpItems.set(data.id, item);
    return item;
}

function updateRenderables() {
    // 활성화되지 않은 객체들 정리
    Object.values(players).forEach(player => {
        if (!player.graphic.active) {
            if (player.barrel) player.barrel.destroy();
            delete players[player.id];
        }
    });
}

// UI 관련 함수들
function createUI() {
    // UI 패널
    const uiPanel = gameScene.add.rectangle(15, 15, 250, 100, 0x000000, 0.7);
    uiPanel.setOrigin(0, 0);
    uiPanel.setScrollFactor(0);
    uiPanel.setStrokeStyle(1, 0x444444);
    uiPanel.setDepth(10);
    
    // 레벨 텍스트
    levelText = gameScene.add.text(25, 25, 'Lv.1', {
        fontSize: '16px',
        fill: '#ffff00',
        fontFamily: 'Arial',
        fontStyle: 'bold'
    });
    levelText.setScrollFactor(0);
    levelText.setDepth(10);
    
    // 체력바 배경
    const healthBarBg = gameScene.add.rectangle(80, 25, 170, 14, 0x333333);
    healthBarBg.setOrigin(0, 0);
    healthBarBg.setScrollFactor(0);
    healthBarBg.setStrokeStyle(1, 0x666666);
    healthBarBg.setDepth(10);
    
    // 체력바
    healthBar = gameScene.add.rectangle(81, 26, 168, 12, 0x00ff00);
    healthBar.setOrigin(0, 0);
    healthBar.setScrollFactor(0);
    healthBar.setDepth(10);
    
    // 경험치바 배경
    const expBarBg = gameScene.add.rectangle(80, 50, 170, 10, 0x333333);
    expBarBg.setOrigin(0, 0);
    expBarBg.setScrollFactor(0);
    expBarBg.setStrokeStyle(1, 0x666666);
    expBarBg.setDepth(10);
    
    // 경험치바
    expBar = gameScene.add.rectangle(81, 51, 168, 8, 0x00aaff);
    expBar.setOrigin(0, 0);
    expBar.setScrollFactor(0);
    expBar.setDepth(10);
    
    // 경험치 텍스트
    gameScene.expText = gameScene.add.text(25, 70, 'EXP: 0/10', {
        fontSize: '12px',
        fill: '#cccccc',
        fontFamily: 'Arial'
    });
    gameScene.expText.setScrollFactor(0);
    gameScene.expText.setDepth(10);
    
    // 스탯 텍스트
    gameScene.statsText = gameScene.add.text(25, 90, 'HP: 10/10 | ATK: 1 | SPD: 160', {
        fontSize: '12px',
        fill: '#cccccc',
        fontFamily: 'Arial'
    });
    gameScene.statsText.setScrollFactor(0);
    gameScene.statsText.setDepth(10);
    
    // 조작법 안내 (우하단)
    const controlsText = gameScene.add.text(
        gameConfig.width - 20,
        gameConfig.height - 60,
        '조작법:\n화살표키: 이동\n스페이스: 발사',
        {
            fontSize: '12px',
            fill: '#cccccc',
            fontFamily: 'Arial',
            align: 'right'
        }
    );
    controlsText.setOrigin(1, 0);
    controlsText.setScrollFactor(0);
    controlsText.setDepth(10);
}

function updateUI(stats) {
    if (!stats) return;
    
    // 레벨 텍스트 업데이트
    levelText.setText(`Lv.${stats.level}`);
    
    // 체력바 업데이트
    const healthPercent = stats.health / stats.maxHealth;
    healthBar.displayWidth = 168 * healthPercent;
    
    // 체력에 따른 색상 변경
    if (healthPercent > 0.6) {
        healthBar.setFillStyle(0x00ff00); // 녹색
    } else if (healthPercent > 0.3) {
        healthBar.setFillStyle(0xffaa00); // 주황색
    } else {
        healthBar.setFillStyle(0xff0000); // 빨간색
    }
    
    // 경험치바 업데이트
    const expPercent = stats.exp / stats.expToNext;
    expBar.displayWidth = 168 * expPercent;
    
    // 경험치 텍스트 업데이트
    gameScene.expText.setText(`EXP: ${stats.exp}/${stats.expToNext}`);
    
    // 스탯 텍스트 업데이트 (체력 정보 추가)
    gameScene.statsText.setText(`HP: ${stats.health}/${stats.maxHealth} | ATK: ${stats.attackPower} | SPD: ${stats.moveSpeed}`);
}

// 오디오 관련 함수들
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        document.addEventListener('click', resumeAudioContext, { once: true });
    } catch (error) {
        console.log('오디오 초기화 실패:', error);
        isSoundEnabled = false;
    }
}

function resumeAudioContext() {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

// 발사 효과음 함수
function playFireSound() {
    if (!audioContext || !isSoundEnabled) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
        console.log('사운드 재생 오류:', error);
    }
}

// 미니맵 생성 함수
function createMinimap(worldSize) {
    const minimapSize = 150;
    const minimapX = gameConfig.width - minimapSize - 20;
    const minimapY = 20;
    
    // 미니맵 배경
    const minimapBg = gameScene.add.rectangle(
        minimapX + minimapSize / 2, 
        minimapY + minimapSize / 2, 
        minimapSize, 
        minimapSize, 
        0x222222, 
        0.9
    );
    minimapBg.setStrokeStyle(2, 0xffffff);
    minimapBg.setScrollFactor(0);
    minimapBg.setDepth(10);
    
    // 미니맵 월드 표시 (검정색)
    const minimapWorld = gameScene.add.rectangle(
        minimapX + minimapSize / 2, 
        minimapY + minimapSize / 2, 
        minimapSize - 10, 
        minimapSize - 10, 
        0x000000
    );
    minimapWorld.setStrokeStyle(1, 0x333333);
    minimapWorld.setScrollFactor(0);
    minimapWorld.setDepth(10);
    
    // 미니맵 탱크 표시 (빨간 점)
    minimapTank = gameScene.add.circle(
        minimapX + minimapSize / 2, 
        minimapY + minimapSize / 2, 
        4, 
        0xff0000
    );
    minimapTank.setScrollFactor(0);
    minimapTank.setDepth(11);
    
    // 미니맵 정보 저장
    minimap = {
        x: minimapX,
        y: minimapY,
        size: minimapSize,
        worldSize: worldSize,
        scale: (minimapSize - 10) / Math.max(worldSize.width, worldSize.height)
    };
    
    // 미니맵 제목
    const minimapTitle = gameScene.add.text(
        minimapX + minimapSize / 2,
        minimapY - 15,
        'MAP',
        {
            fontSize: '12px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    minimapTitle.setOrigin(0.5);
    minimapTitle.setScrollFactor(0);
    minimapTitle.setDepth(10);
}

// 미니맵 업데이트 함수
function updateMinimap(playerData) {
    if (!minimap || !minimapTank || !playerData) return;
    
    // 플레이어 위치를 미니맵 좌표로 변환
    const minimapPlayerX = minimap.x + 5 + (playerData.x / minimap.worldSize.width) * (minimap.size - 10);
    const minimapPlayerY = minimap.y + 5 + (playerData.y / minimap.worldSize.height) * (minimap.size - 10);
    
    // 미니맵 탱크 위치 업데이트
    minimapTank.x = minimapPlayerX;
    minimapTank.y = minimapPlayerY;
    
    // 탱크 방향 표시 (작은 화살표)
    const angle = Math.atan2(playerData.direction.y, playerData.direction.x);
    minimapTank.rotation = angle;
}

// 피격 효과 표시 - 모든 플레이어에게 동일하게 표시
function showHitDamageEffect(data) {
    // 자신이 피격당한 경우가 아닐 때만 피해량 텍스트 표시 (중복 방지)
    if (data.targetId !== socket.id) {
        // 피격 위치에 피해량 표시
        const damageText = gameScene.add.text(data.targetX, data.targetY - 30, `-${data.damage}`, {
            fontSize: '20px',
            fill: '#ff4444',
            fontWeight: 'bold'
        }).setDepth(600);
        
        // 피해량 텍스트 애니메이션
        gameScene.tweens.add({
            targets: damageText,
            y: data.targetY - 60,
            alpha: 0,
            duration: 1000,
            ease: 'Power2',
            onComplete: () => {
                damageText.destroy();
            }
        });
    }
    
    // 피격 위치에 빨간 원형 마커 (모든 플레이어에게 표시)
    const hitMarker = gameScene.add.circle(data.targetX, data.targetY, 15, 0xff0000, 0.7);
    hitMarker.setDepth(500);
    
    // 피격 마커 애니메이션
    gameScene.tweens.add({
        targets: hitMarker,
        scaleX: 2,
        scaleY: 2,
        alpha: 0,
        duration: 500,
        ease: 'Power2',
        onComplete: () => {
            hitMarker.destroy();
        }
    });
    
    console.log(`피격 발생! 공격자: ${data.attackerId}, 피격자: ${data.targetId}, 피해량: ${data.damage}`);
}

// 리스폰 효과 표시
function showRespawnEffect(data) {
    // 리스폰 텍스트 표시
    const respawnText = gameScene.add.text(400, 300, 'RESPAWN!', {
        fontSize: '48px',
        fill: '#00ff00',
        fontWeight: 'bold'
    }).setScrollFactor(0).setDepth(1000);
    
    // 리스폰 텍스트 애니메이션
    gameScene.tweens.add({
        targets: respawnText,
        scaleX: 1.5,
        scaleY: 1.5,
        alpha: 0,
        duration: 2000,
        ease: 'Power2',
        onComplete: () => {
            respawnText.destroy();
        }
    });
    
    // 리스폰 사운드
    playSound(800, 0.1, 'square');
}

// 적중 효과 표시 (상대방을 맞췄을 때)
function showSelfHitEffect(data) {
    // 화면 빨간색 플래시 효과
    const flashOverlay = gameScene.add.rectangle(
        gameConfig.width / 2,
        gameConfig.height / 2,
        gameConfig.width,
        gameConfig.height,
        0xff0000,
        0.3
    );
    flashOverlay.setScrollFactor(0);
    flashOverlay.setDepth(20);
    
    // 플래시 효과 애니메이션
    gameScene.tweens.add({
        targets: flashOverlay,
        alpha: 0,
        duration: 200,
        ease: 'Power2',
        onComplete: () => {
            flashOverlay.destroy();
        }
    });
    
    // 피격 텍스트 표시
    const hitText = gameScene.add.text(
        gameConfig.width / 2,
        gameConfig.height / 2 - 50,
        `-${data.damage}`,
        {
            fontSize: '24px',
            fill: '#ff0000',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    hitText.setOrigin(0.5);
    hitText.setScrollFactor(0);
    hitText.setDepth(21);
    
    // 피격 텍스트 애니메이션
    gameScene.tweens.add({
        targets: hitText,
        y: hitText.y - 30,
        alpha: 0,
        duration: 800,
        ease: 'Power2',
        onComplete: () => {
            hitText.destroy();
        }
    });
    
    // 화면 흔들림 효과
    gameScene.cameras.main.shake(200, 0.01);
    
    console.log(`피격! 데미지: ${data.damage}, 남은 체력: ${data.remainingHealth}`);
}

// 킬 효과 표시 (상대방을 죽였을 때)
function showKillEffect(data) {
    // 킬 텍스트 (화면 중앙 상단)
    const killText = gameScene.add.text(
        gameConfig.width / 2,
        gameConfig.height / 2 - 100,
        'KILL!',
        {
            fontSize: '36px',
            fill: '#ffff00',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    killText.setOrigin(0.5);
    killText.setScrollFactor(0);
    killText.setDepth(21);
    
    // 킬 텍스트 애니메이션
    gameScene.tweens.add({
        targets: killText,
        scaleX: 1.3,
        scaleY: 1.3,
        y: killText.y - 30,
        alpha: 0,
        duration: 1200,
        ease: 'Power2',
        onComplete: () => {
            killText.destroy();
        }
    });
    
    // 화면 황금색 플래시
    const flashOverlay = gameScene.add.rectangle(
        gameConfig.width / 2,
        gameConfig.height / 2,
        gameConfig.width,
        gameConfig.height,
        0xffff00,
        0.2
    );
    flashOverlay.setScrollFactor(0);
    flashOverlay.setDepth(20);
    
    gameScene.tweens.add({
        targets: flashOverlay,
        alpha: 0,
        duration: 400,
        ease: 'Power2',
        onComplete: () => {
            flashOverlay.destroy();
        }
    });
    
    // 킬 사운드 재생
    playKillSound();
    
    console.log(`킬! 상대방을 처치했습니다.`);
}

// 적중 확인 사운드
function playHitConfirmSound() {
    if (!audioContext || !isSoundEnabled) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);
    } catch (error) {
        console.log('적중 확인 사운드 재생 오류:', error);
    }
}

// 킬 사운드
function playKillSound() {
    if (!audioContext || !isSoundEnabled) return;
    
    try {
        // 첫 번째 음 (높은 음)
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(1000, audioContext.currentTime);
        gain1.gain.setValueAtTime(0.2, audioContext.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        osc1.start(audioContext.currentTime);
        osc1.stop(audioContext.currentTime + 0.3);
        
        // 두 번째 음 (낮은 음, 약간 지연)
        setTimeout(() => {
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(600, audioContext.currentTime);
            gain2.gain.setValueAtTime(0.2, audioContext.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
            
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);
            osc2.start(audioContext.currentTime);
            osc2.stop(audioContext.currentTime + 0.4);
        }, 100);
        
    } catch (error) {
        console.log('킬 사운드 재생 오류:', error);
    }
}

// 다른 플레이어의 킬을 관전할 때의 효과
function showOtherPlayerKillEffect(data) {
    // 킬 위치에 효과 표시
    const killMarker = gameScene.add.circle(data.targetX, data.targetY, 25, 0xffff00, 0.8);
    killMarker.setDepth(500);
    
    // 킬 마커 애니메이션
    gameScene.tweens.add({
        targets: killMarker,
        scaleX: 3,
        scaleY: 3,
        alpha: 0,
        duration: 1000,
        ease: 'Power2',
        onComplete: () => {
            killMarker.destroy();
        }
    });
    
    // 킬 텍스트 표시
    const killText = gameScene.add.text(data.targetX, data.targetY - 40, 'ELIMINATED!', {
        fontSize: '24px',
        fill: '#ffff00',
        fontWeight: 'bold'
    }).setDepth(600);
    
    gameScene.tweens.add({
        targets: killText,
        y: data.targetY - 80,
        alpha: 0,
        duration: 1500,
        ease: 'Power2',
        onComplete: () => {
            killText.destroy();
        }
    });
}

// 다른 플레이어의 리스폰을 관전할 때의 효과
function showOtherPlayerRespawnEffect(data) {
    // 리스폰 위치에 효과 표시
    const respawnMarker = gameScene.add.circle(data.x, data.y, 20, 0x00ff00, 0.6);
    respawnMarker.setDepth(500);
    
    // 리스폰 마커 애니메이션
    gameScene.tweens.add({
        targets: respawnMarker,
        scaleX: 2.5,
        scaleY: 2.5,
        alpha: 0,
        duration: 1000,
        ease: 'Power2',
        onComplete: () => {
            respawnMarker.destroy();
        }
    });
    
    // 리스폰 텍스트 표시
    const respawnText = gameScene.add.text(data.x, data.y - 30, 'RESPAWN', {
        fontSize: '18px',
        fill: '#00ff00',
        fontWeight: 'bold'
    }).setDepth(600);
    
    gameScene.tweens.add({
        targets: respawnText,
        y: data.y - 60,
        alpha: 0,
        duration: 1200,
        ease: 'Power2',
        onComplete: () => {
            respawnText.destroy();
        }
    });
}

// 게임 시작
const game = new Phaser.Game(gameConfig);

// 창 크기 변경 처리
window.addEventListener('resize', () => {
    const newWidth = Math.floor(window.innerWidth * 0.9);
    const newHeight = Math.floor(window.innerHeight * 0.9);
    game.scale.resize(newWidth, newHeight);
}); 