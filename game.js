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

function preload() {
    // 이미지 없이 도형으로만 구현
}

function create() {
    // scene 참조 저장
    gameScene = this;
    
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

    // 키보드 입력 설정 (화살표 키만)
    cursors = this.input.keyboard.createCursorKeys();

    // 자동 발사 타이머 (1초마다)
    autoFireTimer = this.time.addEvent({
        delay: 1000,
        callback: fireBullet,
        callbackScope: this,
        loop: true
    });
    
    // 미니맵 생성
    createMinimap();
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
    // 탱크 이동 (화살표 키) - 실제로는 카메라가 움직임
    const speed = 160;
    let moveX = 0;
    let moveY = 0;
    
    if (cursors.left.isDown) {
        moveX = -speed;
        currentDirection = { x: -1, y: 0 };
    } else if (cursors.right.isDown) {
        moveX = speed;
        currentDirection = { x: 1, y: 0 };
    }

    if (cursors.up.isDown) {
        moveY = -speed;
        currentDirection = { x: 0, y: -1 };
    } else if (cursors.down.isDown) {
        moveY = speed;
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
    
    // 포신 위치 업데이트 (화면 중앙 기준)
    const barrelDistance = 25;
    tankBarrel.x = gameConfig.width / 2 + Math.cos(angle) * barrelDistance;
    tankBarrel.y = gameConfig.height / 2 + Math.sin(angle) * barrelDistance;
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

function fireBullet() {
    // scene이 없으면 발사하지 않음
    if (!gameScene) return;
    
    // 총알 속도 설정 (현재 이동 방향으로)
    const bulletSpeed = 300;
    
    // 방향 벡터 정규화
    const length = Math.sqrt(currentDirection.x * currentDirection.x + currentDirection.y * currentDirection.y);
    const normalizedX = currentDirection.x / length;
    const normalizedY = currentDirection.y / length;
    
    // 포신의 실제 월드 위치 계산
    const angle = Math.atan2(currentDirection.y, currentDirection.x);
    const barrelDistance = 25;
    const barrelWorldX = tank.worldX + Math.cos(angle) * barrelDistance;
    const barrelWorldY = tank.worldY + Math.sin(angle) * barrelDistance;
    
    // 총알 객체 생성 (월드 좌표로)
    const bullet = {
        x: barrelWorldX,
        y: barrelWorldY,
        vx: normalizedX * bulletSpeed,
        vy: normalizedY * bulletSpeed,
        graphic: null,
        active: true
    };
    
    // 총알 그래픽 생성 (월드 좌표에)
    bullet.graphic = gameScene.add.circle(bullet.x, bullet.y, 4, 0xffff00);
    
    // 총알을 배열에 추가
    if (!gameScene.bulletArray) {
        gameScene.bulletArray = [];
    }
    gameScene.bulletArray.push(bullet);
    
    // 3초 후 총알 자동 제거
    gameScene.time.delayedCall(3000, () => {
        if (bullet.active) {
            bullet.active = false;
            if (bullet.graphic) {
                bullet.graphic.destroy();
            }
        }
    });
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