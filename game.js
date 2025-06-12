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

// 월드 크기 (화면의 4배)
const WORLD_WIDTH = Math.floor(window.innerWidth * 0.9) * 4;
const WORLD_HEIGHT = Math.floor(window.innerHeight * 0.9) * 4;

// 게임 변수들
let tank;
let tankBarrel;
let cursors;
let bullets;
let lastFired = 0;
let currentDirection = { x: 0, y: -1 }; // 기본 방향 (위쪽)
let autoFireTimer;
let gameScene; // scene 참조 저장

// 레벨업 시스템 변수들
let levelUpItems; // 레벨업 아이템 그룹
let playerStats = {
    level: 1,
    exp: 0,
    expToNext: 1, // 개발용으로 10분의 1로 감소
    health: 100,
    maxHealth: 100,
    attackPower: 1,
    fireRate: 1000, // 밀리초
    moveSpeed: 160
};
let expBar;
let levelText;
let healthBar;
let upgradeUI = null;
let isPaused = false;
let statsPanel; // 스탯 패널
let isStatsVisible = false;

// 오디오 컨텍스트 (사운드 효과용)
let audioContext;
let isSoundEnabled = true;

function preload() {
    // 이미지 없이 도형으로만 구현
}

function create() {
    // scene 참조 저장
    gameScene = this;
    
    // 오디오 컨텍스트 초기화
    initAudio();
    
    // 월드 크기 설정 (4배 크기)
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    
    // 맵 배경 생성 (어두운 녹색)
    const mapBackground = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT);
    mapBackground.setStrokeStyle(6, 0x666666);
    mapBackground.setFillStyle(0x1a3d1a); // 어두운 녹색
    
    // 격자 패턴 생성 (이동감을 위해)
    const gridSize = 100;
    const gridColor = 0x2d5a2d;
    
    // 세로선 그리기
    for (let x = gridSize; x < WORLD_WIDTH; x += gridSize) {
        const line = this.add.line(0, 0, x, 0, x, WORLD_HEIGHT, gridColor);
        line.setLineWidth(1);
        line.setOrigin(0, 0);
    }
    
    // 가로선 그리기
    for (let y = gridSize; y < WORLD_HEIGHT; y += gridSize) {
        const line = this.add.line(0, 0, 0, y, WORLD_WIDTH, y, gridColor);
        line.setLineWidth(1);
        line.setOrigin(0, 0);
    }
    
    // 랜덤 장애물/바위 생성
    for (let i = 0; i < 30; i++) {
        const x = Math.random() * (WORLD_WIDTH - 200) + 100;
        const y = Math.random() * (WORLD_HEIGHT - 200) + 100;
        const size = Math.random() * 30 + 20;
        
        const obstacle = this.add.circle(x, y, size, 0x4a4a4a);
        obstacle.setStrokeStyle(2, 0x666666);
    }
    
    // 랜덤 나무/덤불 생성
    for (let i = 0; i < 50; i++) {
        const x = Math.random() * (WORLD_WIDTH - 200) + 100;
        const y = Math.random() * (WORLD_HEIGHT - 200) + 100;
        const size = Math.random() * 15 + 10;
        
        const tree = this.add.circle(x, y, size, 0x2d5a2d);
        tree.setStrokeStyle(1, 0x1a3d1a);
    }
    
    // 모서리 표시 (4개 코너에 큰 마커)
    const cornerSize = 50;
    const cornerColor = 0xff6b6b;
    
    // 좌상단
    this.add.rectangle(cornerSize, cornerSize, cornerSize * 2, cornerSize * 2, cornerColor);
    // 우상단  
    this.add.rectangle(WORLD_WIDTH - cornerSize, cornerSize, cornerSize * 2, cornerSize * 2, cornerColor);
    // 좌하단
    this.add.rectangle(cornerSize, WORLD_HEIGHT - cornerSize, cornerSize * 2, cornerSize * 2, cornerColor);
    // 우하단
    this.add.rectangle(WORLD_WIDTH - cornerSize, WORLD_HEIGHT - cornerSize, cornerSize * 2, cornerSize * 2, cornerColor);
    
    // 레벨업 아이템 생성
    createLevelUpItems();
    
    // 탱크 몸체 생성 (화면 중앙에 고정)
    tank = this.add.rectangle(
        gameConfig.width / 2, 
        gameConfig.height / 2, 
        40, 40, 
        0x00ff00
    );
    tank.setStrokeStyle(2, 0x00aa00);
    tank.setScrollFactor(0); // 카메라 움직임에 영향받지 않음

    // 탱크 포신 생성 (화면 중앙에 고정)
    tankBarrel = this.add.rectangle(
        gameConfig.width / 2 + 15, 
        gameConfig.height / 2, 
        30, 6, 
        0x00aa00
    );
    tankBarrel.setScrollFactor(0); // 카메라 움직임에 영향받지 않음

    // 탱크의 실제 월드 위치 (보이지 않는 위치)
    tank.worldX = WORLD_WIDTH / 2;
    tank.worldY = WORLD_HEIGHT / 2;

    // 카메라 초기 위치 설정 (탱크 월드 위치 중심)
    this.cameras.main.setScroll(
        tank.worldX - gameConfig.width / 2,
        tank.worldY - gameConfig.height / 2
    );

    // 총알 그룹 생성
    bullets = this.physics.add.group({
        maxSize: 50 // 큰 맵이므로 총알 수 증가
    });

    // 키보드 입력 설정 (화살표 키 + 스페이스바)
    cursors = this.input.keyboard.createCursorKeys();
    
    // 스페이스바 키 추가
    gameScene.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    
    // 마우스 클릭으로도 발사 가능하게 추가 (쿨다운 적용)
    this.input.on('pointerdown', () => {
        if (!isPaused && gameScene.time.now - lastFired >= Math.min(playerStats.fireRate / 2, 200)) {
            fireBullet();
            lastFired = gameScene.time.now;
        }
    });
    
    // 자동 발사 타이머 (갤러그 스타일 유지)
    autoFireTimer = this.time.addEvent({
        delay: playerStats.fireRate,
        callback: fireBullet,
        callbackScope: this,
        loop: true
    });
    
    // 미니맵 생성
    createMinimap();
    
    // UI 생성
    createUI();
}

function createLevelUpItems() {
    levelUpItems = [];
    
    // 맵 전체에 레벨업 아이템 랜덤 배치 (100개)
    for (let i = 0; i < 100; i++) {
        const x = Math.random() * (WORLD_WIDTH - 200) + 100;
        const y = Math.random() * (WORLD_HEIGHT - 200) + 100;
        
        // 경험치 아이템 생성 (파란색 다이아몬드)
        const item = gameScene.add.polygon(x, y, [
            0, -8,   // 위
            8, 0,    // 오른쪽
            0, 8,    // 아래
            -8, 0    // 왼쪽
        ], 0x00aaff);
        item.setStrokeStyle(2, 0x0088cc);
        
        // 반짝이는 효과
        gameScene.tweens.add({
            targets: item,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
        
        levelUpItems.push(item);
    }
}

function createUI() {
    // 컴팩트한 UI 패널 배경 (반투명)
    const uiPanel = gameScene.add.rectangle(15, 15, 220, 80, 0x000000, 0.6);
    uiPanel.setOrigin(0, 0);
    uiPanel.setScrollFactor(0);
    uiPanel.setStrokeStyle(1, 0x444444);
    
    // 레벨 텍스트 (작게)
    levelText = gameScene.add.text(25, 25, `Lv.${playerStats.level}`, {
        fontSize: '16px',
        fill: '#ffff00',
        fontFamily: 'Arial',
        fontStyle: 'bold'
    });
    levelText.setScrollFactor(0);
    
    // 체력바 배경 (작게)
    const healthBarBg = gameScene.add.rectangle(70, 25, 150, 12, 0x333333);
    healthBarBg.setOrigin(0, 0);
    healthBarBg.setScrollFactor(0);
    healthBarBg.setStrokeStyle(1, 0x666666);
    
    // 체력바
    healthBar = gameScene.add.rectangle(71, 26, 148, 10, 0x00ff00);
    healthBar.setOrigin(0, 0);
    healthBar.setScrollFactor(0);
    
    // 경험치바 배경 (작게)
    const expBarBg = gameScene.add.rectangle(70, 45, 150, 8, 0x333333);
    expBarBg.setOrigin(0, 0);
    expBarBg.setScrollFactor(0);
    expBarBg.setStrokeStyle(1, 0x666666);
    
    // 경험치바
    expBar = gameScene.add.rectangle(71, 46, 148, 6, 0x00aaff);
    expBar.setOrigin(0, 0);
    expBar.setScrollFactor(0);
    
    // 간단한 경험치 텍스트
    gameScene.expText = gameScene.add.text(25, 60, `EXP: ${playerStats.exp}/${playerStats.expToNext}`, {
        fontSize: '12px',
        fill: '#cccccc',
        fontFamily: 'Arial'
    });
    gameScene.expText.setScrollFactor(0);
    
    // 스탯 토글 버튼 (우하단)
    const statsButton = gameScene.add.rectangle(gameConfig.width - 60, gameConfig.height - 30, 100, 40, 0x333333, 0.8);
    statsButton.setScrollFactor(0);
    statsButton.setStrokeStyle(2, 0x666666);
    statsButton.setInteractive();
    
    const statsButtonText = gameScene.add.text(gameConfig.width - 60, gameConfig.height - 30, 'STATS', {
        fontSize: '14px',
        fill: '#ffffff',
        fontFamily: 'Arial',
        fontStyle: 'bold'
    });
    statsButtonText.setOrigin(0.5);
    statsButtonText.setScrollFactor(0);
    
    // 사운드 토글 버튼 (우하단, 스탯 버튼 옆)
    const soundButton = gameScene.add.rectangle(gameConfig.width - 170, gameConfig.height - 30, 80, 40, 0x444444, 0.8);
    soundButton.setScrollFactor(0);
    soundButton.setStrokeStyle(2, 0x666666);
    soundButton.setInteractive();
    
    gameScene.soundButtonText = gameScene.add.text(gameConfig.width - 170, gameConfig.height - 30, isSoundEnabled ? '🔊' : '🔇', {
        fontSize: '16px',
        fill: '#ffffff',
        fontFamily: 'Arial'
    });
    gameScene.soundButtonText.setOrigin(0.5);
    gameScene.soundButtonText.setScrollFactor(0);
    
    // 스탯 버튼 클릭 이벤트
    statsButton.on('pointerdown', toggleStatsPanel);
    
    // 호버 효과
    statsButton.on('pointerover', () => {
        statsButton.setFillStyle(0x555555, 0.9);
    });
    
    statsButton.on('pointerout', () => {
        statsButton.setFillStyle(0x333333, 0.8);
    });
    
    // 사운드 버튼 클릭 이벤트
    soundButton.on('pointerdown', () => {
        toggleSound();
        gameScene.soundButtonText.setText(isSoundEnabled ? '🔊' : '🔇');
    });
    
    // 사운드 버튼 호버 효과
    soundButton.on('pointerover', () => {
        soundButton.setFillStyle(0x666666, 0.9);
    });
    
    soundButton.on('pointerout', () => {
        soundButton.setFillStyle(0x444444, 0.8);
    });
    
    // 스탯 패널 생성 (초기에는 숨김)
    createStatsPanel();
}

function createStatsPanel() {
    const panelWidth = 200;
    const panelHeight = 180;
    const panelX = gameConfig.width - panelWidth - 20;
    const panelY = gameConfig.height - panelHeight - 80;
    
    // 스탯 패널 배경
    const statsPanelBg = gameScene.add.rectangle(
        panelX + panelWidth/2, 
        panelY + panelHeight/2, 
        panelWidth, 
        panelHeight, 
        0x000000, 
        0.85
    );
    statsPanelBg.setScrollFactor(0);
    statsPanelBg.setStrokeStyle(2, 0x666666);
    statsPanelBg.setVisible(false);
    
    // 스탯 제목
    const statsTitle = gameScene.add.text(panelX + 10, panelY + 10, '탱크 스탯', {
        fontSize: '16px',
        fill: '#ffff00',
        fontFamily: 'Arial',
        fontStyle: 'bold'
    });
    statsTitle.setScrollFactor(0);
    statsTitle.setVisible(false);
    
    // 스탯 텍스트들
    gameScene.statsTexts = {
        level: gameScene.add.text(panelX + 10, panelY + 35, '', {
            fontSize: '14px',
            fill: '#ffffff',
            fontFamily: 'Arial'
        }),
        health: gameScene.add.text(panelX + 10, panelY + 55, '', {
            fontSize: '14px',
            fill: '#00ff00',
            fontFamily: 'Arial'
        }),
        attack: gameScene.add.text(panelX + 10, panelY + 75, '', {
            fontSize: '14px',
            fill: '#ff6666',
            fontFamily: 'Arial'
        }),
        fireRate: gameScene.add.text(panelX + 10, panelY + 95, '', {
            fontSize: '14px',
            fill: '#ffaa00',
            fontFamily: 'Arial'
        }),
        moveSpeed: gameScene.add.text(panelX + 10, panelY + 115, '', {
            fontSize: '14px',
            fill: '#00aaff',
            fontFamily: 'Arial'
        }),
        exp: gameScene.add.text(panelX + 10, panelY + 140, '', {
            fontSize: '14px',
            fill: '#cccccc',
            fontFamily: 'Arial'
        })
    };
    
    // 모든 스탯 텍스트 초기 설정
    Object.values(gameScene.statsTexts).forEach(text => {
        text.setScrollFactor(0);
        text.setVisible(false);
    });
    
    // 스탯 패널 요소들 저장
    statsPanel = {
        background: statsPanelBg,
        title: statsTitle,
        texts: gameScene.statsTexts
    };
    
    // 초기 스탯 업데이트
    updateStatsPanel();
}

function toggleStatsPanel() {
    isStatsVisible = !isStatsVisible;
    
    // 패널 표시/숨김
    statsPanel.background.setVisible(isStatsVisible);
    statsPanel.title.setVisible(isStatsVisible);
    Object.values(statsPanel.texts).forEach(text => {
        text.setVisible(isStatsVisible);
    });
    
    if (isStatsVisible) {
        updateStatsPanel();
    }
}

function updateStatsPanel() {
    if (!statsPanel || !statsPanel.texts) return;
    
    const fireRatePerSec = (1000 / playerStats.fireRate).toFixed(1);
    
    statsPanel.texts.level.setText(`레벨: ${playerStats.level}`);
    statsPanel.texts.health.setText(`체력: ${playerStats.health}/${playerStats.maxHealth}`);
    statsPanel.texts.attack.setText(`공격력: ${playerStats.attackPower}`);
    statsPanel.texts.fireRate.setText(`발사속도: ${fireRatePerSec}/초`);
    statsPanel.texts.moveSpeed.setText(`이동속도: ${playerStats.moveSpeed}`);
    statsPanel.texts.exp.setText(`경험치: ${playerStats.exp}/${playerStats.expToNext}`);
}

function createMinimap() {
    const minimapSize = 150;
    const minimapX = gameConfig.width - minimapSize - 20;
    const minimapY = 20;
    
    // 미니맵 배경
    const minimapBg = gameScene.add.rectangle(
        minimapX + minimapSize / 2, 
        minimapY + minimapSize / 2, 
        minimapSize, 
        minimapSize, 
        0x000000, 
        0.7
    );
    minimapBg.setStrokeStyle(2, 0xffffff);
    minimapBg.setScrollFactor(0);
    
    // 미니맵 월드 표시
    const minimapWorld = gameScene.add.rectangle(
        minimapX + minimapSize / 2, 
        minimapY + minimapSize / 2, 
        minimapSize - 10, 
        minimapSize - 10, 
        0x1a3d1a
    );
    minimapWorld.setStrokeStyle(1, 0x2d5a2d);
    minimapWorld.setScrollFactor(0);
    
    // 미니맵 탱크 표시 (빨간 점)
    gameScene.minimapTank = gameScene.add.circle(
        minimapX + minimapSize / 2, 
        minimapY + minimapSize / 2, 
        3, 
        0xff0000
    );
    gameScene.minimapTank.setScrollFactor(0);
    
    // 미니맵 정보 저장
    gameScene.minimap = {
        x: minimapX,
        y: minimapY,
        size: minimapSize,
        scale: (minimapSize - 10) / Math.max(WORLD_WIDTH, WORLD_HEIGHT)
    };
}

function update(time, delta) {
    if (isPaused) return; // 업그레이드 UI가 열려있으면 게임 일시정지
    
    // 탱크 이동 (화살표 키) - 실제로는 카메라가 움직임
    let moveX = 0;
    let moveY = 0;
    
    if (cursors.left.isDown) {
        moveX = -playerStats.moveSpeed;
        currentDirection = { x: -1, y: 0 };
    } else if (cursors.right.isDown) {
        moveX = playerStats.moveSpeed;
        currentDirection = { x: 1, y: 0 };
    }

    if (cursors.up.isDown) {
        moveY = -playerStats.moveSpeed;
        currentDirection = { x: 0, y: -1 };
    } else if (cursors.down.isDown) {
        moveY = playerStats.moveSpeed;
        currentDirection = { x: 0, y: 1 };
    }

    // 대각선 이동 처리
    if (cursors.left.isDown && cursors.up.isDown) {
        currentDirection = { x: -1, y: -1 };
    } else if (cursors.right.isDown && cursors.up.isDown) {
        currentDirection = { x: 1, y: -1 };
    } else if (cursors.left.isDown && cursors.down.isDown) {
        currentDirection = { x: -1, y: 1 };
    } else if (cursors.right.isDown && cursors.down.isDown) {
        currentDirection = { x: 1, y: 1 };
    }
    
    // 수동 발사도 가능 (스페이스바나 마우스 클릭)
    if (gameScene.spaceKey.isDown) {
        if (time - lastFired >= Math.min(playerStats.fireRate / 2, 200)) { // 수동 발사는 더 빠르게
            fireBullet();
            lastFired = time;
        }
    }

    // 대각선 이동 시 속도 정규화 (피타고라스 정리 보정)
    if (moveX !== 0 && moveY !== 0) {
        // 대각선 이동 시 √2로 나누어 속도 정규화
        const diagonalFactor = 1 / Math.sqrt(2);
        moveX *= diagonalFactor;
        moveY *= diagonalFactor;
    }
    
    // 탱크의 월드 위치 업데이트
    const deltaTime = delta / 1000;
    tank.worldX += moveX * deltaTime;
    tank.worldY += moveY * deltaTime;
    
    // 월드 경계 체크
    tank.worldX = Math.max(50, Math.min(WORLD_WIDTH - 50, tank.worldX));
    tank.worldY = Math.max(50, Math.min(WORLD_HEIGHT - 50, tank.worldY));
    
    // 카메라 위치 업데이트 (맵이 움직이는 효과)
    gameScene.cameras.main.setScroll(
        tank.worldX - gameConfig.width / 2,
        tank.worldY - gameConfig.height / 2
    );
    
    // 레벨업 아이템 충돌 체크
    checkLevelUpItemCollision();
    
    // 미니맵 탱크 위치 업데이트
    if (gameScene.minimap && gameScene.minimapTank) {
        const minimapTankX = gameScene.minimap.x + 5 + (tank.worldX / WORLD_WIDTH) * (gameScene.minimap.size - 10);
        const minimapTankY = gameScene.minimap.y + 5 + (tank.worldY / WORLD_HEIGHT) * (gameScene.minimap.size - 10);
        
        gameScene.minimapTank.x = minimapTankX;
        gameScene.minimapTank.y = minimapTankY;
    }

    // 이동 방향으로 탱크 회전
    const angle = Math.atan2(currentDirection.y, currentDirection.x);
    tank.rotation = angle;
    
    // 포신 위치 업데이트 (화면 중앙 기준, 이동속도에 따라 조정)
    const speedMultiplier = playerStats.moveSpeed / 160;
    const visualBarrelDistance = 25 + (speedMultiplier - 1) * 5; // 시각적 포신도 조정
    tankBarrel.x = gameConfig.width / 2 + Math.cos(angle) * visualBarrelDistance;
    tankBarrel.y = gameConfig.height / 2 + Math.sin(angle) * visualBarrelDistance;
    tankBarrel.rotation = angle;

    // 총알 업데이트 (수동으로 움직임 처리)
    if (gameScene.bulletArray) {
        gameScene.bulletArray.forEach((bullet, index) => {
            if (bullet.active) {
                // 총알 위치 업데이트
                bullet.x += bullet.vx * delta / 1000; // delta는 밀리초 단위
                bullet.y += bullet.vy * delta / 1000;
                
                // 그래픽 위치 업데이트
                bullet.graphic.x = bullet.x;
                bullet.graphic.y = bullet.y;
                
                // 월드 밖으로 나가면 제거
                if (bullet.x < -50 || bullet.x > WORLD_WIDTH + 50 || 
                    bullet.y < -50 || bullet.y > WORLD_HEIGHT + 50) {
                    bullet.active = false;
                    bullet.graphic.destroy();
                    gameScene.bulletArray.splice(index, 1);
                }
            }
        });
        
        // 비활성화된 총알들 제거
        gameScene.bulletArray = gameScene.bulletArray.filter(bullet => bullet.active);
    }
}

function checkLevelUpItemCollision() {
    const tankRadius = 30; // 탱크 충돌 반경
    
    levelUpItems.forEach((item, index) => {
        if (!item.active) return;
        
        const distance = Math.sqrt(
            Math.pow(tank.worldX - item.x, 2) + 
            Math.pow(tank.worldY - item.y, 2)
        );
        
        if (distance < tankRadius) {
            // 아이템 획득
            item.destroy();
            levelUpItems.splice(index, 1);
            
            // 경험치 획득 (개발용으로 바로 레벨업)
            gainExp(playerStats.expToNext);
        }
    });
}

function gainExp(amount) {
    playerStats.exp += amount;
    
    // 레벨업 체크
    if (playerStats.exp >= playerStats.expToNext) {
        levelUp();
    }
    
    // UI 업데이트
    updateUI();
}

function levelUp() {
    playerStats.level++;
    playerStats.exp -= playerStats.expToNext;
    playerStats.expToNext = Math.ceil(playerStats.expToNext * 1.5); // 다음 레벨 필요 경험치 증가 (개발용으로 작은 수치)
    
    // 업그레이드 선택 UI 표시
    showUpgradeUI();
}

function showUpgradeUI() {
    isPaused = true;
    
    // 반투명 배경
    const overlay = gameScene.add.rectangle(
        gameConfig.width / 2, 
        gameConfig.height / 2, 
        gameConfig.width, 
        gameConfig.height, 
        0x000000, 
        0.7
    );
    overlay.setScrollFactor(0);
    
    // 업그레이드 패널
    const panel = gameScene.add.rectangle(
        gameConfig.width / 2, 
        gameConfig.height / 2, 
        400, 
        300, 
        0x333333
    );
    panel.setScrollFactor(0);
    panel.setStrokeStyle(3, 0x666666);
    
    // 제목
    const title = gameScene.add.text(
        gameConfig.width / 2, 
        gameConfig.height / 2 - 120, 
        `레벨 ${playerStats.level} 달성!`, 
        {
            fontSize: '24px',
            fill: '#ffff00',
            fontFamily: 'Arial'
        }
    );
    title.setOrigin(0.5);
    title.setScrollFactor(0);
    
    const subtitle = gameScene.add.text(
        gameConfig.width / 2, 
        gameConfig.height / 2 - 90, 
        '업그레이드할 스탯을 선택하세요:', 
        {
            fontSize: '16px',
            fill: '#ffffff',
            fontFamily: 'Arial'
        }
    );
    subtitle.setOrigin(0.5);
    subtitle.setScrollFactor(0);
    
    // 업그레이드 옵션들
    const options = [
        { name: '체력 +20', key: 'health', color: 0x00ff00 },
        { name: '공격력 +1', key: 'attack', color: 0xff0000 },
        { name: '발사속도 +20%', key: 'fireRate', color: 0xffaa00 },
        { name: '이동속도 +20', key: 'moveSpeed', color: 0x00aaff }
    ];
    
    const buttons = [];
    
    options.forEach((option, index) => {
        const y = gameConfig.height / 2 - 30 + (index * 40);
        
        // 버튼 배경
        const button = gameScene.add.rectangle(
            gameConfig.width / 2, 
            y, 
            300, 
            30, 
            option.color
        );
        button.setScrollFactor(0);
        button.setStrokeStyle(2, 0xffffff);
        button.setInteractive();
        
        // 버튼 텍스트
        const buttonText = gameScene.add.text(
            gameConfig.width / 2, 
            y, 
            option.name, 
            {
                fontSize: '16px',
                fill: '#ffffff',
                fontFamily: 'Arial'
            }
        );
        buttonText.setOrigin(0.5);
        buttonText.setScrollFactor(0);
        
        // 클릭 이벤트
        button.on('pointerdown', () => {
            applyUpgrade(option.key);
            closeUpgradeUI([overlay, panel, title, subtitle, ...buttons]);
        });
        
        // 호버 효과
        button.on('pointerover', () => {
            button.setScale(1.05);
        });
        
        button.on('pointerout', () => {
            button.setScale(1);
        });
        
        buttons.push(button, buttonText);
    });
    
    upgradeUI = [overlay, panel, title, subtitle, ...buttons];
}

function applyUpgrade(upgradeType) {
    switch (upgradeType) {
        case 'health':
            playerStats.maxHealth += 20;
            playerStats.health = Math.min(playerStats.health + 20, playerStats.maxHealth);
            break;
        case 'attack':
            playerStats.attackPower += 1;
            break;
        case 'fireRate':
            playerStats.fireRate = Math.max(100, playerStats.fireRate * 0.8); // 20% 빨라짐 (최소 0.1초)
            // 자동 발사 타이머 업데이트
            if (autoFireTimer) {
                autoFireTimer.destroy();
            }
            autoFireTimer = gameScene.time.addEvent({
                delay: playerStats.fireRate,
                callback: fireBullet,
                callbackScope: gameScene,
                loop: true
            });
            break;
        case 'moveSpeed':
            playerStats.moveSpeed += 20;
            break;
    }
    
    updateUI();
}

function closeUpgradeUI(uiElements) {
    uiElements.forEach(element => {
        if (element && element.destroy) {
            element.destroy();
        }
    });
    upgradeUI = null;
    isPaused = false;
}

function updateUI() {
    // 레벨 텍스트 업데이트
    levelText.setText(`Lv.${playerStats.level}`);
    
    // 체력바 업데이트
    const healthPercent = playerStats.health / playerStats.maxHealth;
    healthBar.displayWidth = 148 * healthPercent;
    
    // 경험치바 업데이트
    const expPercent = playerStats.exp / playerStats.expToNext;
    expBar.displayWidth = 148 * expPercent;
    
    // 경험치 텍스트 업데이트
    gameScene.expText.setText(`EXP: ${playerStats.exp}/${playerStats.expToNext}`);
    
    // 스탯 패널이 열려있으면 업데이트
    if (isStatsVisible) {
        updateStatsPanel();
    }
}

function fireBullet() {
    // scene이 없거나 게임이 일시정지되면 발사하지 않음
    if (!gameScene || isPaused) return;
    
    // 총알 속도 설정 (이동속도에 비례해서 증가)
    const baseBulletSpeed = 400;
    const speedMultiplier = playerStats.moveSpeed / 160; // 기본 이동속도 대비 배율
    const bulletSpeed = baseBulletSpeed * Math.max(1, speedMultiplier); // 최소 기본 속도 보장
    
    // 방향 벡터 정규화
    const length = Math.sqrt(currentDirection.x * currentDirection.x + currentDirection.y * currentDirection.y);
    const normalizedX = currentDirection.x / length;
    const normalizedY = currentDirection.y / length;
    
    // 포신의 실제 월드 위치 계산 (이동속도에 따라 더 앞쪽에서 발사)
    const angle = Math.atan2(currentDirection.y, currentDirection.x);
    const baseBarrelDistance = 25;
    const barrelDistance = baseBarrelDistance + (speedMultiplier - 1) * 10; // 빠를수록 더 앞에서 발사
    const barrelWorldX = tank.worldX + Math.cos(angle) * barrelDistance;
    const barrelWorldY = tank.worldY + Math.sin(angle) * barrelDistance;
    
    // 공격력에 따른 총알 패턴
    const bulletSize = 3 + (playerStats.attackPower - 1) * 1.5;
    const bullets = [];
    
    if (playerStats.attackPower >= 3) {
        // 레벨 3 이상: 3발 동시 발사 (갤러그 스타일)
        const spreadAngle = 0.3; // 퍼짐 각도
        
        for (let i = -1; i <= 1; i++) {
            const bulletAngle = angle + (i * spreadAngle);
            const bullet = createBullet(
                barrelWorldX + Math.cos(bulletAngle) * 10,
                barrelWorldY + Math.sin(bulletAngle) * 10,
                Math.cos(bulletAngle) * bulletSpeed,
                Math.sin(bulletAngle) * bulletSpeed,
                bulletSize,
                0xffff00
            );
            bullets.push(bullet);
        }
    } else if (playerStats.attackPower >= 2) {
        // 레벨 2: 2발 동시 발사
        const offset = 8;
        const perpX = -normalizedY * offset;
        const perpY = normalizedX * offset;
        
        const bullet1 = createBullet(
            barrelWorldX + perpX,
            barrelWorldY + perpY,
            normalizedX * bulletSpeed,
            normalizedY * bulletSpeed,
            bulletSize,
            0xffff00
        );
        
        const bullet2 = createBullet(
            barrelWorldX - perpX,
            barrelWorldY - perpY,
            normalizedX * bulletSpeed,
            normalizedY * bulletSpeed,
            bulletSize,
            0xffff00
        );
        
        bullets.push(bullet1, bullet2);
    } else {
        // 레벨 1: 단발
        const bullet = createBullet(
            barrelWorldX,
            barrelWorldY,
            normalizedX * bulletSpeed,
            normalizedY * bulletSpeed,
            bulletSize,
            0xffff00
        );
        bullets.push(bullet);
    }
    
    // 총알 배열에 추가
    if (!gameScene.bulletArray) {
        gameScene.bulletArray = [];
    }
    gameScene.bulletArray.push(...bullets);
    
    // 발사 효과음과 시각적 효과
    playFireSound();
    createMuzzleFlash(barrelWorldX, barrelWorldY);
}

function createBullet(x, y, vx, vy, size, color) {
    const bullet = {
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        graphic: null,
        active: true,
        damage: playerStats.attackPower,
        trail: [] // 총알 궤적
    };
    
    // 총알 그래픽 생성 (더 밝고 눈에 띄게)
    bullet.graphic = gameScene.add.circle(x, y, size, color);
    bullet.graphic.setStrokeStyle(1, 0xffffff);
    
    // 총알 궤적 효과
    gameScene.tweens.add({
        targets: bullet.graphic,
        scaleX: 1.2,
        scaleY: 1.2,
        duration: 100,
        yoyo: true,
        ease: 'Power2'
    });
    
    // 3초 후 총알 자동 제거
    gameScene.time.delayedCall(3000, () => {
        if (bullet.active) {
            bullet.active = false;
            if (bullet.graphic) {
                bullet.graphic.destroy();
            }
        }
    });
    
    return bullet;
}

function createMuzzleFlash(x, y) {
    // 포구 화염 효과
    const flash = gameScene.add.circle(x, y, 15, 0xffffff, 0.8);
    
    gameScene.tweens.add({
        targets: flash,
        scaleX: 2,
        scaleY: 2,
        alpha: 0,
        duration: 150,
        ease: 'Power2',
        onComplete: () => {
            flash.destroy();
        }
    });
    
    // 작은 파티클 효과들
    for (let i = 0; i < 5; i++) {
        const particle = gameScene.add.circle(
            x + (Math.random() - 0.5) * 20,
            y + (Math.random() - 0.5) * 20,
            2,
            0xffaa00,
            0.7
        );
        
        gameScene.tweens.add({
            targets: particle,
            x: particle.x + (Math.random() - 0.5) * 40,
            y: particle.y + (Math.random() - 0.5) * 40,
            alpha: 0,
            duration: 300 + Math.random() * 200,
            ease: 'Power2',
            onComplete: () => {
                particle.destroy();
            }
        });
    }
}

// 오디오 시스템 함수들
function initAudio() {
    try {
        // 오디오 컨텍스트 생성 (브라우저 호환성 고려)
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 사용자 상호작용 후 오디오 컨텍스트 활성화
        document.addEventListener('click', resumeAudioContext, { once: true });
        document.addEventListener('keydown', resumeAudioContext, { once: true });
        
    } catch (error) {
        console.log('오디오 컨텍스트 생성 실패:', error);
        isSoundEnabled = false;
    }
}

function resumeAudioContext() {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function playFireSound() {
    if (!audioContext || !isSoundEnabled) return;
    
    try {
        // 발사음 생성 (짧고 강렬한 소리)
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const filterNode = audioContext.createBiquadFilter();
        
        // 오실레이터 설정 (낮은 주파수로 시작해서 빠르게 감소)
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.1);
        
        // 필터 설정 (고주파 제거로 부드럽게)
        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(800, audioContext.currentTime);
        
        // 볼륨 설정 (빠르게 페이드아웃)
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        
        // 노드 연결
        oscillator.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // 재생 및 정리
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);
        
        // 추가 효과음 (높은 주파수 클릭음)
        setTimeout(() => {
            if (!audioContext || !isSoundEnabled) return;
            
            const clickOsc = audioContext.createOscillator();
            const clickGain = audioContext.createGain();
            
            clickOsc.type = 'sine';
            clickOsc.frequency.setValueAtTime(1200, audioContext.currentTime);
            clickOsc.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.05);
            
            clickGain.gain.setValueAtTime(0.1, audioContext.currentTime);
            clickGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);
            
            clickOsc.connect(clickGain);
            clickGain.connect(audioContext.destination);
            
            clickOsc.start(audioContext.currentTime);
            clickOsc.stop(audioContext.currentTime + 0.05);
        }, 10);
        
    } catch (error) {
        console.log('사운드 재생 오류:', error);
    }
}

// 사운드 토글 함수 (필요시 사용)
function toggleSound() {
    isSoundEnabled = !isSoundEnabled;
    console.log('사운드:', isSoundEnabled ? '켜짐' : '꺼짐');
}

// 게임 시작
const game = new Phaser.Game(gameConfig);

// 창 크기 변경 시 게임 크기 조정
window.addEventListener('resize', () => {
    const newWidth = Math.floor(window.innerWidth * 0.9);
    const newHeight = Math.floor(window.innerHeight * 0.9);
    game.scale.resize(newWidth, newHeight);
    
    // 월드 크기도 업데이트
    const newWorldWidth = newWidth * 4;
    const newWorldHeight = newHeight * 4;
    
    if (gameScene && gameScene.physics) {
        gameScene.physics.world.setBounds(0, 0, newWorldWidth, newWorldHeight);
        gameScene.cameras.main.setBounds(0, 0, newWorldWidth, newWorldHeight);
    }
}); 