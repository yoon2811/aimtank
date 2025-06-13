// 게임 설정
const gameConfig = {
    type: Phaser.AUTO,
    width: Math.floor(window.innerWidth * 0.9),
    height: Math.floor(window.innerHeight * 0.9),
    parent: 'gameContainer',
    backgroundColor: '#808080',
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
let mapElements = [];
let cursors;
let isPaused = false;

// 플레이어 색상 관리
const availableColors = [
    0x0000ff, // 파랑
    0x00ffff, // 청록
    0xffff00, // 노랑
    0xff00ff, // 마젠타
    0x00ff80, // 연두
    0x8000ff, // 보라
    0xff8000, // 주황
    0x0080ff, // 하늘색
    0x80ff00, // 라임
    0xff0080  // 핑크
];
const usedColors = new Map(); // playerId -> colorIndex

// 색상 관리 함수들
function assignPlayerColor(playerId) {
    if (usedColors.has(playerId)) {
        return availableColors[usedColors.get(playerId)];
    }
    
    // 사용 가능한 색상 찾기
    const usedIndices = new Set(usedColors.values());
    for (let i = 0; i < availableColors.length; i++) {
        if (!usedIndices.has(i)) {
            usedColors.set(playerId, i);
            return availableColors[i];
        }
    }
    
    // 모든 색상이 사용 중인 경우 랜덤 선택
    const randomIndex = Math.floor(Math.random() * availableColors.length);
    usedColors.set(playerId, randomIndex);
    return availableColors[randomIndex];
}

function releasePlayerColor(playerId) {
    usedColors.delete(playerId);
}

// 이동 상태 추적
let movementState = {
    left: false,
    right: false,
    up: false,
    down: false
};

// UI 요소들
let healthBar;

// 미니맵 관련
let minimap = null;
let minimapTank = null;
let minimapOtherPlayers = {}; // 다른 플레이어들의 미니맵 표시

// 오디오 관련
let audioContext;
let isSoundEnabled = true;

// 스킬 관련 (클라이언트는 UI 표시용 상태만 저장, 모든 로직은 서버에서 처리)
let rapidFireSkill = {
    isActive: false,
    cooldownRemaining: 0,
    duration: 0
};
let speedBoostSkill = {
    isActive: false,
    cooldownRemaining: 0,
    duration: 0
};
let healSkill = {
    isActive: false,
    cooldownRemaining: 0,
    duration: 0
};
let powerShotSkill = {
    isActive: false,
    cooldownRemaining: 0,
    duration: 0
};
let shieldSkill = {
    isActive: false,
    cooldownRemaining: 0,
    duration: 0
};
let skillKey1;
let skillKey2;
let skillKey3;
let skillKey4;
let skillKey5;
let skillKey6;
let skillKey7;
let skillKey8;
let skillKey9;
let skillKey0;



function preload() {
    // 이미지 없이 도형으로만 구현
}

function create() {
    gameScene = this;
    
    // 소켓 연결 - 로컬 환경 감지
    const isLocal = window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' || 
                   window.location.hostname === '';
    
    const serverUrl = isLocal ? 'http://localhost:3000' : 'http://211.45.167.147:3000';
    socket = io(serverUrl);
    
    // 소켓 이벤트 리스너
    socket.on('connect', () => {
        console.log('서버에 연결됨:', serverUrl);
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
    
    // 스킬 결과 처리
    socket.on('skill_result', (data) => {
        if (data.skillType === 'rapid_fire') {
            if (data.success) {
                console.log('연사 스킬 활성화! 10초 동안 5배 빠른 발사!');
                playSkillActivationSound();
            } else {
                console.log('연사 스킬 쿨다운 중입니다.');
            }
        } else if (data.skillType === 'speed_boost') {
            if (data.success) {
                console.log('가속 스킬 활성화! 10초 동안 3배 빠른 이동!');
                playSpeedBoostActivationSound();
            } else {
                console.log('가속 스킬 쿨다운 중입니다.');
            }
        } else if (data.skillType === 'heal') {
            if (data.success) {
                console.log('회복 스킬 사용! 체력 30 회복!');
                playHealActivationSound();
            } else {
                console.log('회복 스킬 쿨다운 중입니다.');
            }
        } else if (data.skillType === 'power_shot') {
            if (data.success) {
                console.log('강력한 공격 스킬 활성화! 다음 발사가 100 데미지!');
                playPowerShotActivationSound();
            } else {
                console.log('강력한 공격 스킬 쿨다운 중입니다.');
            }
        } else if (data.skillType === 'shield') {
            if (data.success) {
                console.log('방어막 스킬 활성화! 3초간 무적!');
                playShieldActivationSound();
            } else {
                console.log('방어막 스킬 쿨다운 중입니다.');
            }
        }
    });
    
    // 스킬 비활성화 알림
    socket.on('skill_deactivated', (data) => {
        if (data.skillType === 'rapid_fire') {
            console.log('연사 스킬 종료');
            playSkillDeactivationSound();
        } else if (data.skillType === 'speed_boost') {
            console.log('가속 스킬 종료');
            playSkillDeactivationSound();
        } else if (data.skillType === 'heal') {
            console.log('회복 스킬 종료');
            playSkillDeactivationSound();
        } else if (data.skillType === 'power_shot') {
            console.log('강력한 공격 스킬 종료');
            playSkillDeactivationSound();
        } else if (data.skillType === 'shield') {
            console.log('방어막 스킬 종료');
            playShieldDeactivationSound();
        }
    });
    
    // 발사 사운드 이벤트 (서버에서 발사가 실제로 일어났을 때만 재생)
    socket.on('fire_sound', () => {
        playFireSound();
    });
    
    // 회복 효과 이벤트
    socket.on('heal_effect', (data) => {
        showHealEffect(data);
    });
    
    // 방어막 피격 이벤트 브로드캐스트 처리
    socket.on('shield_hit_broadcast', (data) => {
        showShieldHitEffect(data);
    });
    
    // 오디오 초기화
    initAudio();
    
    // UI 생성
    createUI();
    
    // 키보드 입력 설정
    cursors = this.input.keyboard.createCursorKeys();
    
    // WASD 키 추가
    gameScene.wasdKeys = this.input.keyboard.addKeys('W,S,A,D');
    
    // 스페이스바 키 추가
    gameScene.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    
    // 스킬 키 추가 (1~5번만 스킬로 사용, 나머지는 채팅용)
    skillKey1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    skillKey2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    skillKey3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    skillKey4 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);
    skillKey5 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE);
    
    // 나머지 숫자키들 (채팅에서만 사용)
    skillKey6 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SIX);
    skillKey7 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SEVEN);
    skillKey8 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.EIGHT);
    skillKey9 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NINE);
    skillKey0 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ZERO);
    

}

function createMapFromServer(data) {
    const { mapElements: serverMapElements, worldSize } = data;
    
    // 월드 크기 설정
    gameScene.physics.world.setBounds(0, 0, worldSize.width, worldSize.height);
    
    // 맵 배경 생성 (회색)
    const mapBackground = gameScene.add.rectangle(0, 0, worldSize.width, worldSize.height, 0x808080);
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
    
    // 스킬 업데이트
    updateSkills(delta);
    
    // 스킬 입력 처리
    handleSkillInput();
    

    
    // 이동 입력 처리
    handleMovement();
    
    // 발사 입력 처리 (스페이스바)
    handleFiring();
    
    // 플레이어와 총알 렌더링 업데이트
    updateRenderables();
}

function handleSkillInput() {
    
    // 숫자 1키 - 연사 스킬
    if (Phaser.Input.Keyboard.JustDown(skillKey1)) {
        activateRapidFireSkill();
    }
    
    // 숫자 2키 - 가속 스킬
    if (Phaser.Input.Keyboard.JustDown(skillKey2)) {
        activateSpeedBoostSkill();
    }
    
    // 숫자 3키 - 회복 스킬
    if (Phaser.Input.Keyboard.JustDown(skillKey3)) {
        activateHealSkill();
    }
    
    // 숫자 4키 - 강력한 공격 스킬
    if (Phaser.Input.Keyboard.JustDown(skillKey4)) {
        activatePowerShotSkill();
    }
    
    // 숫자 5키 - 방어막 스킬
    if (Phaser.Input.Keyboard.JustDown(skillKey5)) {
        activateShieldSkill();
    }
    
    // 숫자 6~0키는 현재 스킬로 사용하지 않음 (채팅에서만 사용)
    // 향후 추가 스킬이 필요하면 여기에 추가 가능
}

function updateSkills(delta) {
    // 스킬 UI만 업데이트 (모든 로직은 서버에서 처리됨)
    updateSkillUI();
}

function updateSkillUI() {
    if (!gameScene.skillIconPos) return;
    
    const pos = gameScene.skillIconPos;
    
    // 모든 그래픽 초기화
    gameScene.skillCooldownCircle.clear();
    gameScene.skillActiveRing.clear();
    gameScene.skillReadyGlow.clear();
    
    // 2번 스킬 그래픽 초기화
    if (gameScene.skill2CooldownCircle) {
        gameScene.skill2CooldownCircle.clear();
    }
    
    if (rapidFireSkill.isActive) {
        // 스킬 활성화 중 - 노란색 배경과 남은 시간 표시
        
        // 아이콘 배경을 밝은 노란색으로
        gameScene.skillIconBg.setFillStyle(0x555500);
        gameScene.skillIconBg.setStrokeStyle(3, 0xffff00);
        
        // 스킬명 색상 변경
        gameScene.skillNameInBox.setFill('#ffff00');
        
        // 남은 시간 표시
        const remainingTime = Math.ceil(rapidFireSkill.duration / 1000);
        gameScene.skillTimeText.setText(remainingTime.toString());
        gameScene.skillTimeText.setFill('#ffff00');
        gameScene.skillTimeText.setVisible(true);
        
        // 스킬명을 빠르게 깜빡이게 (연사 효과)
        gameScene.tweens.killTweensOf(gameScene.skillNameInBox);
        gameScene.tweens.add({
            targets: gameScene.skillNameInBox,
            alpha: 0.3,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 100,
            yoyo: true,
            repeat: -1,
            ease: 'Power2'
        });
        
    } else if (rapidFireSkill.cooldownRemaining > 0) {
        // 쿨다운 중 - 회색 배경과 쿨다운 시간 표시
        
        // 아이콘 배경을 어둡게
        gameScene.skillIconBg.setFillStyle(0x222222);
        gameScene.skillIconBg.setStrokeStyle(2, 0x555555);
        
        // 스킬명 색상 변경
        gameScene.skillNameInBox.setFill('#888888');
        
        // 쿨다운 시간 표시
        const cooldownTime = Math.ceil(rapidFireSkill.cooldownRemaining / 1000);
        gameScene.skillTimeText.setText(cooldownTime.toString());
        gameScene.skillTimeText.setFill('#ff0000');
        gameScene.skillTimeText.setVisible(true);
        
        // 스킬명을 어둡고 작게
        gameScene.tweens.killTweensOf(gameScene.skillNameInBox);
        gameScene.skillNameInBox.setAlpha(0.3);
        gameScene.skillNameInBox.setScale(0.8);
        
        // 쿨다운 진행률 계산 (0~1) - 총 쿨다운 시간은 지속시간 + 쿨다운
        const totalCooldown = 20000; // 10초 지속 + 10초 쿨다운
        const progress = 1 - (rapidFireSkill.cooldownRemaining / totalCooldown);
        
        // 배경 원 (어두운 회색)
        gameScene.skillCooldownCircle.fillStyle(0x000000, 0.6);
        gameScene.skillCooldownCircle.fillCircle(pos.x, pos.y, pos.size/2 - 2);
        
        // 진행률 원호 (빨간색에서 노란색으로 변화)
        const startAngle = -Math.PI / 2; // 12시 방향부터 시작
        const endAngle = startAngle + (progress * Math.PI * 2);
        
        // 진행률에 따른 색상 변화 (빨간색 -> 주황색 -> 노란색)
        let color = 0xff0000; // 빨간색
        if (progress > 0.5) {
            color = 0xff8800; // 주황색
        }
        if (progress > 0.8) {
            color = 0xffff00; // 노란색
        }
        
        gameScene.skillCooldownCircle.lineStyle(3, color, 0.7);
        gameScene.skillCooldownCircle.beginPath();
        gameScene.skillCooldownCircle.arc(pos.x, pos.y, pos.size/2 - 4, startAngle, endAngle);
        gameScene.skillCooldownCircle.strokePath();
        
    } else {
        // 사용 가능 - 초록색 배경과 준비 상태
        
        // 아이콘 배경을 정상으로
        gameScene.skillIconBg.setFillStyle(0x003300);
        gameScene.skillIconBg.setStrokeStyle(3, 0x00ff00);
        
        // 스킬명 색상 변경
        gameScene.skillNameInBox.setFill('#00ff00');
        
        // 시간 텍스트 숨김
        gameScene.skillTimeText.setVisible(false);
        
        // 스킬명을 정상 상태로
        gameScene.tweens.killTweensOf(gameScene.skillNameInBox);
        gameScene.skillNameInBox.setAlpha(1);
        gameScene.skillNameInBox.setScale(1);
        
        // 스킬명에 미묘한 반짝임
        gameScene.tweens.add({
            targets: gameScene.skillNameInBox,
            alpha: 0.7,
            duration: 1500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }
    
    // === 2번 스킬 UI 업데이트 ===
    updateSkill2UI();
    
    // === 3번 스킬 UI 업데이트 ===
    updateSkill3UI();
    
    // === 4번 스킬 UI 업데이트 ===
    updateSkill4UI();
    
    // === 5번 스킬 UI 업데이트 ===
    updateSkill5UI();
}

function updateSkill2UI() {
    if (!gameScene.skill2IconPos) return;
    
    const pos = gameScene.skill2IconPos;
    
    if (speedBoostSkill.isActive) {
        // 스킬 활성화 중 - 파란색 배경과 남은 시간 표시
        
        // 아이콘 배경을 밝은 파란색으로
        gameScene.skill2IconBg.setFillStyle(0x003366);
        gameScene.skill2IconBg.setStrokeStyle(3, 0x00aaff);
        
        // 스킬명 색상 변경
        gameScene.skill2NameInBox.setFill('#00aaff');
        
        // 남은 시간 표시
        const remainingTime = Math.ceil(speedBoostSkill.duration / 1000);
        gameScene.skill2TimeText.setText(remainingTime.toString());
        gameScene.skill2TimeText.setFill('#00aaff');
        gameScene.skill2TimeText.setVisible(true);
        
        // 스킬명을 빠르게 깜빡이게 (가속 효과)
        gameScene.tweens.killTweensOf(gameScene.skill2NameInBox);
        gameScene.tweens.add({
            targets: gameScene.skill2NameInBox,
            alpha: 0.3,
            scaleX: 1.3,
            scaleY: 1.3,
            duration: 100,
            yoyo: true,
            repeat: -1,
            ease: 'Power2'
        });
        
    } else if (speedBoostSkill.cooldownRemaining > 0) {
        // 쿨다운 중 - 회색 배경과 쿨다운 시간 표시
        
        // 아이콘 배경을 어둡게
        gameScene.skill2IconBg.setFillStyle(0x222222);
        gameScene.skill2IconBg.setStrokeStyle(2, 0x555555);
        
        // 스킬명 색상 변경
        gameScene.skill2NameInBox.setFill('#888888');
        
        // 쿨다운 시간 표시
        const cooldownTime = Math.ceil(speedBoostSkill.cooldownRemaining / 1000);
        gameScene.skill2TimeText.setText(cooldownTime.toString());
        gameScene.skill2TimeText.setFill('#ff0000');
        gameScene.skill2TimeText.setVisible(true);
        
        // 스킬명을 어둡고 작게
        gameScene.tweens.killTweensOf(gameScene.skill2NameInBox);
        gameScene.skill2NameInBox.setAlpha(0.3);
        gameScene.skill2NameInBox.setScale(0.8);
        
        // 쿨다운 진행률 계산 (0~1) - 총 쿨다운 시간은 지속시간 + 쿨다운
        const totalCooldown = 30000; // 10초 지속 + 20초 쿨다운
        const progress = 1 - (speedBoostSkill.cooldownRemaining / totalCooldown);
        
        // 배경 원 (어두운 회색)
        gameScene.skill2CooldownCircle.fillStyle(0x000000, 0.6);
        gameScene.skill2CooldownCircle.fillCircle(pos.x, pos.y, pos.size/2 - 2);
        
        // 진행률 원호 (빨간색에서 파란색으로 변화)
        const startAngle = -Math.PI / 2; // 12시 방향부터 시작
        const endAngle = startAngle + (progress * Math.PI * 2);
        
        // 진행률에 따른 색상 변화 (빨간색 -> 보라색 -> 파란색)
        let color = 0xff0000; // 빨간색
        if (progress > 0.5) {
            color = 0x8800ff; // 보라색
        }
        if (progress > 0.8) {
            color = 0x00aaff; // 파란색
        }
        
        gameScene.skill2CooldownCircle.lineStyle(3, color, 0.7);
        gameScene.skill2CooldownCircle.beginPath();
        gameScene.skill2CooldownCircle.arc(pos.x, pos.y, pos.size/2 - 4, startAngle, endAngle);
        gameScene.skill2CooldownCircle.strokePath();
        
    } else {
        // 사용 가능 - 파란색 배경과 준비 상태
        
        // 아이콘 배경을 정상으로
        gameScene.skill2IconBg.setFillStyle(0x001133);
        gameScene.skill2IconBg.setStrokeStyle(3, 0x00aaff);
        
        // 스킬명 색상 변경
        gameScene.skill2NameInBox.setFill('#00aaff');
        
        // 시간 텍스트 숨김
        gameScene.skill2TimeText.setVisible(false);
        
        // 스킬명을 정상 상태로
        gameScene.tweens.killTweensOf(gameScene.skill2NameInBox);
        gameScene.skill2NameInBox.setAlpha(1);
        gameScene.skill2NameInBox.setScale(1);
        
        // 스킬명에 미묘한 반짝임
        gameScene.tweens.add({
            targets: gameScene.skill2NameInBox,
            alpha: 0.7,
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }
}

function updateSkill3UI() {
    if (!gameScene.skill3IconPos) return;
    
    const pos = gameScene.skill3IconPos;
    
    // 3번 스킬 그래픽 초기화
    if (gameScene.skill3CooldownCircle) {
        gameScene.skill3CooldownCircle.clear();
    }
    
    if (healSkill.isActive) {
        // 스킬 활성화 중 - 초록색 배경과 남은 시간 표시
        
        // 아이콘 배경을 밝은 초록색으로
        gameScene.skill3IconBg.setFillStyle(0x003300);
        gameScene.skill3IconBg.setStrokeStyle(3, 0x00ff00);
        
        // 스킬명 색상 변경
        gameScene.skill3NameInBox.setFill('#00ff00');
        
        // 남은 시간 표시
        const remainingTime = Math.ceil(healSkill.duration / 1000);
        gameScene.skill3TimeText.setText(remainingTime.toString());
        gameScene.skill3TimeText.setFill('#00ff00');
        gameScene.skill3TimeText.setVisible(true);
        
        // 스킬명을 빠르게 깜빡이게 (회복 효과)
        gameScene.tweens.killTweensOf(gameScene.skill3NameInBox);
        gameScene.tweens.add({
            targets: gameScene.skill3NameInBox,
            alpha: 0.3,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 200,
            yoyo: true,
            repeat: -1,
            ease: 'Power2'
        });
        
    } else if (healSkill.cooldownRemaining > 0) {
        // 쿨다운 중 - 회색 배경과 쿨다운 시간 표시
        
        // 아이콘 배경을 어둡게
        gameScene.skill3IconBg.setFillStyle(0x222222);
        gameScene.skill3IconBg.setStrokeStyle(2, 0x555555);
        
        // 스킬명 색상 변경
        gameScene.skill3NameInBox.setFill('#888888');
        
        // 쿨다운 시간 표시
        const cooldownTime = Math.ceil(healSkill.cooldownRemaining / 1000);
        gameScene.skill3TimeText.setText(cooldownTime.toString());
        gameScene.skill3TimeText.setFill('#ff0000');
        gameScene.skill3TimeText.setVisible(true);
        
        // 스킬명을 어둡고 작게
        gameScene.tweens.killTweensOf(gameScene.skill3NameInBox);
        gameScene.skill3NameInBox.setAlpha(0.3);
        gameScene.skill3NameInBox.setScale(0.8);
        
        // 쿨다운 진행률 계산 (0~1) - 총 쿨다운 시간은 15초
        const totalCooldown = 15000; // 15초 쿨다운
        const progress = 1 - (healSkill.cooldownRemaining / totalCooldown);
        
        // 배경 원 (어두운 회색)
        gameScene.skill3CooldownCircle.fillStyle(0x000000, 0.6);
        gameScene.skill3CooldownCircle.fillCircle(pos.x, pos.y, pos.size/2 - 2);
        
        // 진행률 원호 (빨간색에서 초록색으로 변화)
        const startAngle = -Math.PI / 2; // 12시 방향부터 시작
        const endAngle = startAngle + (progress * Math.PI * 2);
        
        // 진행률에 따른 색상 변화 (빨간색 -> 노란색 -> 초록색)
        let color = 0xff0000; // 빨간색
        if (progress > 0.5) {
            color = 0xffaa00; // 노란색
        }
        if (progress > 0.8) {
            color = 0x00ff00; // 초록색
        }
        
        gameScene.skill3CooldownCircle.lineStyle(3, color, 0.7);
        gameScene.skill3CooldownCircle.beginPath();
        gameScene.skill3CooldownCircle.arc(pos.x, pos.y, pos.size/2 - 4, startAngle, endAngle);
        gameScene.skill3CooldownCircle.strokePath();
        
    } else {
        // 사용 가능 - 초록색 배경과 준비 상태
        
        // 아이콘 배경을 정상으로
        gameScene.skill3IconBg.setFillStyle(0x113300);
        gameScene.skill3IconBg.setStrokeStyle(3, 0x00ff00);
        
        // 스킬명 색상 변경
        gameScene.skill3NameInBox.setFill('#00ff00');
        
        // 시간 텍스트 숨김
        gameScene.skill3TimeText.setVisible(false);
        
        // 스킬명을 정상 상태로
        gameScene.tweens.killTweensOf(gameScene.skill3NameInBox);
        gameScene.skill3NameInBox.setAlpha(1);
        gameScene.skill3NameInBox.setScale(1);
        
        // 스킬명에 미묘한 반짝임
        gameScene.tweens.add({
            targets: gameScene.skill3NameInBox,
            alpha: 0.7,
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }
}

function updateSkill4UI() {
    if (!gameScene.skill4IconPos) return;
    
    const pos = gameScene.skill4IconPos;
    
    // 4번 스킬 그래픽 초기화
    if (gameScene.skill4CooldownCircle) {
        gameScene.skill4CooldownCircle.clear();
    }
    
    if (powerShotSkill.isActive) {
        // 스킬 활성화 중 - 빨간색 배경과 남은 시간 표시
        
        // 아이콘 배경을 밝은 빨간색으로
        gameScene.skill4IconBg.setFillStyle(0x330000);
        gameScene.skill4IconBg.setStrokeStyle(3, 0xff0000);
        
        // 스킬명 색상 변경
        gameScene.skill4NameInBox.setFill('#ff0000');
        
        // 남은 시간 표시
        const remainingTime = Math.ceil(powerShotSkill.duration / 1000);
        gameScene.skill4TimeText.setText(remainingTime.toString());
        gameScene.skill4TimeText.setFill('#ff0000');
        gameScene.skill4TimeText.setVisible(true);
        
        // 스킬명을 빠르게 깜빡이게 (강력한 공격 효과)
        gameScene.tweens.killTweensOf(gameScene.skill4NameInBox);
        gameScene.tweens.add({
            targets: gameScene.skill4NameInBox,
            alpha: 0.3,
            scaleX: 1.3,
            scaleY: 1.3,
            duration: 150,
            yoyo: true,
            repeat: -1,
            ease: 'Power2'
        });
        
    } else if (powerShotSkill.cooldownRemaining > 0) {
        // 쿨다운 중 - 회색 배경과 쿨다운 시간 표시
        
        // 아이콘 배경을 어둡게
        gameScene.skill4IconBg.setFillStyle(0x222222);
        gameScene.skill4IconBg.setStrokeStyle(2, 0x555555);
        
        // 스킬명 색상 변경
        gameScene.skill4NameInBox.setFill('#888888');
        
        // 쿨다운 시간 표시
        const cooldownTime = Math.ceil(powerShotSkill.cooldownRemaining / 1000);
        gameScene.skill4TimeText.setText(cooldownTime.toString());
        gameScene.skill4TimeText.setFill('#ff0000');
        gameScene.skill4TimeText.setVisible(true);
        
        // 스킬명을 어둡고 작게
        gameScene.tweens.killTweensOf(gameScene.skill4NameInBox);
        gameScene.skill4NameInBox.setAlpha(0.3);
        gameScene.skill4NameInBox.setScale(0.8);
        
        // 쿨다운 진행률 계산 (0~1) - 총 쿨다운 시간은 25초
        const totalCooldown = 25000; // 25초 쿨다운
        const progress = 1 - (powerShotSkill.cooldownRemaining / totalCooldown);
        
        // 배경 원 (어두운 회색)
        gameScene.skill4CooldownCircle.fillStyle(0x000000, 0.6);
        gameScene.skill4CooldownCircle.fillCircle(pos.x, pos.y, pos.size/2 - 2);
        
        // 진행률 원호 (빨간색에서 주황색으로 변화)
        const startAngle = -Math.PI / 2; // 12시 방향부터 시작
        const endAngle = startAngle + (progress * Math.PI * 2);
        
        // 진행률에 따른 색상 변화 (빨간색 -> 주황색 -> 노란색)
        let color = 0xff0000; // 빨간색
        if (progress > 0.5) {
            color = 0xff8800; // 주황색
        }
        if (progress > 0.8) {
            color = 0xffaa00; // 노란색
        }
        
        gameScene.skill4CooldownCircle.lineStyle(3, color, 0.7);
        gameScene.skill4CooldownCircle.beginPath();
        gameScene.skill4CooldownCircle.arc(pos.x, pos.y, pos.size/2 - 4, startAngle, endAngle);
        gameScene.skill4CooldownCircle.strokePath();
        
    } else {
        // 사용 가능 - 빨간색 배경과 준비 상태
        
        // 아이콘 배경을 정상으로
        gameScene.skill4IconBg.setFillStyle(0x331100);
        gameScene.skill4IconBg.setStrokeStyle(3, 0xff4400);
        
        // 스킬명 색상 변경
        gameScene.skill4NameInBox.setFill('#ff4400');
        
        // 시간 텍스트 숨김
        gameScene.skill4TimeText.setVisible(false);
        
        // 스킬명을 정상 상태로
        gameScene.tweens.killTweensOf(gameScene.skill4NameInBox);
        gameScene.skill4NameInBox.setAlpha(1);
        gameScene.skill4NameInBox.setScale(1);
        
        // 스킬명에 미묘한 반짝임
        gameScene.tweens.add({
            targets: gameScene.skill4NameInBox,
            alpha: 0.7,
            duration: 2200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }
}

function updateSkill5UI() {
    if (!gameScene.skill5IconPos) return;
    
    const pos = gameScene.skill5IconPos;
    
    // 5번 스킬 그래픽 초기화
    if (gameScene.skill5CooldownCircle) {
        gameScene.skill5CooldownCircle.clear();
    }
    
    if (shieldSkill.isActive) {
        // 스킬 활성화 중 - 파란색 배경과 남은 시간 표시
        
        // 아이콘 배경을 밝은 파란색으로
        gameScene.skill5IconBg.setFillStyle(0x003366);
        gameScene.skill5IconBg.setStrokeStyle(3, 0x00aaff);
        
        // 스킬명 색상 변경
        gameScene.skill5NameInBox.setFill('#00aaff');
        
        // 남은 시간 표시
        const remainingTime = Math.ceil(shieldSkill.duration / 1000);
        gameScene.skill5TimeText.setText(remainingTime.toString());
        gameScene.skill5TimeText.setFill('#00aaff');
        gameScene.skill5TimeText.setVisible(true);
        
        // 스킬명을 빠르게 깜빡이게 (방어막 효과)
        gameScene.tweens.killTweensOf(gameScene.skill5NameInBox);
        gameScene.tweens.add({
            targets: gameScene.skill5NameInBox,
            alpha: 0.3,
            scaleX: 1.3,
            scaleY: 1.3,
            duration: 100,
            yoyo: true,
            repeat: -1,
            ease: 'Power2'
        });
        
    } else if (shieldSkill.cooldownRemaining > 0) {
        // 쿨다운 중 - 회색 배경과 쿨다운 시간 표시
        
        // 아이콘 배경을 어둡게
        gameScene.skill5IconBg.setFillStyle(0x222222);
        gameScene.skill5IconBg.setStrokeStyle(2, 0x555555);
        
        // 스킬명 색상 변경
        gameScene.skill5NameInBox.setFill('#888888');
        
        // 쿨다운 시간 표시
        const cooldownTime = Math.ceil(shieldSkill.cooldownRemaining / 1000);
        gameScene.skill5TimeText.setText(cooldownTime.toString());
        gameScene.skill5TimeText.setFill('#ff0000');
        gameScene.skill5TimeText.setVisible(true);
        
        // 스킬명을 어둡고 작게
        gameScene.tweens.killTweensOf(gameScene.skill5NameInBox);
        gameScene.skill5NameInBox.setAlpha(0.3);
        gameScene.skill5NameInBox.setScale(0.8);
        
                 // 쿨다운 진행률 계산 (0~1) - 총 쿨다운 시간은 1분
         const totalCooldown = 60000; // 1분 쿨다운
         const progress = 1 - (shieldSkill.cooldownRemaining / totalCooldown);
        
        // 배경 원 (어두운 회색)
        gameScene.skill5CooldownCircle.fillStyle(0x000000, 0.6);
        gameScene.skill5CooldownCircle.fillCircle(pos.x, pos.y, pos.size/2 - 2);
        
        // 진행률 원호 (빨간색에서 파란색으로 변화)
        const startAngle = -Math.PI / 2; // 12시 방향부터 시작
        const endAngle = startAngle + (progress * Math.PI * 2);
        
        // 진행률에 따른 색상 변화 (빨간색 -> 보라색 -> 파란색)
        let color = 0xff0000; // 빨간색
        if (progress > 0.5) {
            color = 0x8800ff; // 보라색
        }
        if (progress > 0.8) {
            color = 0x00aaff; // 파란색
        }
        
        gameScene.skill5CooldownCircle.lineStyle(3, color, 0.7);
        gameScene.skill5CooldownCircle.beginPath();
        gameScene.skill5CooldownCircle.arc(pos.x, pos.y, pos.size/2 - 4, startAngle, endAngle);
        gameScene.skill5CooldownCircle.strokePath();
        
    } else {
        // 사용 가능 - 파란색 배경과 준비 상태
        
        // 아이콘 배경을 정상으로
        gameScene.skill5IconBg.setFillStyle(0x001133);
        gameScene.skill5IconBg.setStrokeStyle(3, 0x00aaff);
        
        // 스킬명 색상 변경
        gameScene.skill5NameInBox.setFill('#00aaff');
        
        // 시간 텍스트 숨김
        gameScene.skill5TimeText.setVisible(false);
        
        // 스킬명을 정상 상태로
        gameScene.tweens.killTweensOf(gameScene.skill5NameInBox);
        gameScene.skill5NameInBox.setAlpha(1);
        gameScene.skill5NameInBox.setScale(1);
        
        // 스킬명에 미묘한 반짝임
        gameScene.tweens.add({
            targets: gameScene.skill5NameInBox,
            alpha: 0.7,
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }
}

function activateRapidFireSkill() {
    // 클라이언트는 스킬 사용 요청만 전송 (모든 로직은 서버에서 처리)
    socket.emit('use_skill', 'rapid_fire');
}

function activateSpeedBoostSkill() {
    // 클라이언트는 스킬 사용 요청만 전송 (모든 로직은 서버에서 처리)
    socket.emit('use_skill', 'speed_boost');
}

function activateHealSkill() {
    // 클라이언트는 스킬 사용 요청만 전송 (모든 로직은 서버에서 처리)
    socket.emit('use_skill', 'heal');
}

function activatePowerShotSkill() {
    // 클라이언트는 스킬 사용 요청만 전송 (모든 로직은 서버에서 처리)
    socket.emit('use_skill', 'power_shot');
}

function activateShieldSkill() {
    // 클라이언트는 스킬 사용 요청만 전송 (모든 로직은 서버에서 처리)
    socket.emit('use_skill', 'shield');
}



function handleFiring() {
    
    // 클라이언트는 단순히 발사 입력을 서버로 전달만 함
    if (gameScene.spaceKey.isDown) {
        // 발사 요청만 전송 (모든 로직은 서버에서 처리)
        socket.emit('fire_input', true);
    } else {
        // 발사 중지 요청 전송
        socket.emit('fire_input', false);
    }
}

function handleMovement() {
    
    // 이전 상태와 비교하여 변경된 경우만 전송
    const newState = {
        left: cursors.left.isDown || gameScene.wasdKeys.A.isDown,
        right: cursors.right.isDown || gameScene.wasdKeys.D.isDown,
        up: cursors.up.isDown || gameScene.wasdKeys.W.isDown,
        down: cursors.down.isDown || gameScene.wasdKeys.S.isDown
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
            if (players[id].nameText) players[id].nameText.destroy();
            
            // 방어막 효과 제거 (간단한 메인 방어막만)
            if (players[id].shieldEffect) {
                if (players[id].shieldEffect.mainShield) players[id].shieldEffect.mainShield.destroy();
            }
            
            // 강타 발사 대기 표시 제거
            if (players[id].powerShotIndicator) {
                players[id].powerShotIndicator.mainCircle.destroy();
            }
            
            // 미니맵에서도 제거
            if (minimapOtherPlayers[id]) {
                minimapOtherPlayers[id].destroy();
                delete minimapOtherPlayers[id];
            }
            
            releasePlayerColor(id); // 색상 해제
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
        removeBullet(id);
    });
    
        // 로컬 플레이어 UI 업데이트
    const localPlayer = state.players[socket.id];
    if (localPlayer) {
        updateUI(localPlayer.stats, localPlayer.pvpStats);
        updateMinimap(localPlayer, state.players);
        
        // 서버의 스킬 상태를 클라이언트 UI용으로 동기화 (로직은 서버에서만 처리)
        if (localPlayer.skills && localPlayer.skills.rapidFire) {
            const serverSkill = localPlayer.skills.rapidFire;
            const now = Date.now();
            
            // 서버 스킬 상태를 클라이언트 UI에 반영
            rapidFireSkill.isActive = serverSkill.isActive;
            
            if (serverSkill.isActive) {
                rapidFireSkill.duration = Math.max(0, serverSkill.endTime - now);
            } else {
                rapidFireSkill.duration = 0;
            }
            
            rapidFireSkill.cooldownRemaining = Math.max(0, serverSkill.cooldownEndTime - now);
        }
        
        // 2번 스킬 상태 UI 동기화
        if (localPlayer.skills && localPlayer.skills.speedBoost) {
            const serverSkill = localPlayer.skills.speedBoost;
            const now = Date.now();
            
            speedBoostSkill.isActive = serverSkill.isActive;
            
            if (serverSkill.isActive) {
                speedBoostSkill.duration = Math.max(0, serverSkill.endTime - now);
            } else {
                speedBoostSkill.duration = 0;
            }
            
            speedBoostSkill.cooldownRemaining = Math.max(0, serverSkill.cooldownEndTime - now);
        }
        
        // 3번 스킬 상태 UI 동기화
        if (localPlayer.skills && localPlayer.skills.heal) {
            const serverSkill = localPlayer.skills.heal;
            const now = Date.now();
            
            healSkill.isActive = serverSkill.isActive;
            
            if (serverSkill.isActive) {
                healSkill.duration = Math.max(0, serverSkill.endTime - now);
            } else {
                healSkill.duration = 0;
            }
            
            healSkill.cooldownRemaining = Math.max(0, serverSkill.cooldownEndTime - now);
        }
        
        // 4번 스킬 상태 UI 동기화
        if (localPlayer.skills && localPlayer.skills.powerShot) {
            const serverSkill = localPlayer.skills.powerShot;
            const now = Date.now();
            
            powerShotSkill.isActive = serverSkill.isActive;
            
            if (serverSkill.isActive) {
                powerShotSkill.duration = Math.max(0, serverSkill.endTime - now);
            } else {
                powerShotSkill.duration = 0;
            }
            
            powerShotSkill.cooldownRemaining = Math.max(0, serverSkill.cooldownEndTime - now);
        }
        
        // 5번 스킬 상태 UI 동기화
        if (localPlayer.skills && localPlayer.skills.shield) {
            const serverSkill = localPlayer.skills.shield;
            const now = Date.now();
            
            shieldSkill.isActive = serverSkill.isActive;
            
            if (serverSkill.isActive) {
                shieldSkill.duration = Math.max(0, serverSkill.endTime - now);
            } else {
                shieldSkill.duration = 0;
            }
            
            shieldSkill.cooldownRemaining = Math.max(0, serverSkill.cooldownEndTime - now);
        }
    }
    
    // 스코어보드 업데이트 (모든 플레이어 정보)
    updateScoreboard(state.players);
}

function createPlayer(id, data) {
    const isLocalPlayer = id === socket.id;
    const color = isLocalPlayer ? 0x00ff00 : assignPlayerColor(id);
    
    // 플레이어 아이디 텍스트 생성 (처음 8자만 표시)
    const displayId = id.length > 8 ? id.substring(0, 8) + '...' : id;
    const nameText = gameScene.add.text(data.x, data.y - 35, displayId, {
        fontSize: '12px',
        fill: '#ffffff',
        fontFamily: 'Arial',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2
    });
    nameText.setOrigin(0.5);
    nameText.setDepth(3);
    
    const player = {
        id,
        graphic: gameScene.add.rectangle(data.x, data.y, 40, 40, color),
        barrel: gameScene.add.rectangle(data.x + 15, data.y, 30, 6, color),
        nameText: nameText,
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
    
    // 플레이어 이름 텍스트 위치 업데이트
    if (player.nameText) {
        player.nameText.x = player.graphic.x;
        player.nameText.y = player.graphic.y - 35;
    }
    
    // 포신 위치 및 방향 업데이트
    const angle = Math.atan2(data.direction.y, data.direction.x);
    player.barrel.x = player.graphic.x + Math.cos(angle) * 25;
    player.barrel.y = player.graphic.y + Math.sin(angle) * 25;
    player.barrel.rotation = angle;
    player.graphic.rotation = angle;
    
    // 무적 상태 시각적 표시
    const now = Date.now();
    const isInvulnerable = data.invulnerableUntil && now < data.invulnerableUntil;
    const hasShield = data.skills && data.skills.shield && data.skills.shield.isActive;
    
    if (isInvulnerable) {
        // 리스폰 무적 상태일 때 깜빡임 효과
        const blinkSpeed = 200; // 200ms마다 깜빡임
        const shouldShow = Math.floor(now / blinkSpeed) % 2 === 0;
        player.graphic.setAlpha(shouldShow ? 0.5 : 1);
        player.barrel.setAlpha(shouldShow ? 0.5 : 1);
        if (player.nameText) {
            player.nameText.setAlpha(shouldShow ? 0.5 : 1);
        }
    } else if (hasShield) {
        // 방어막 스킬 활성화 시 간단한 방어막 효과
        if (!player.shieldEffect) {
            // 방어막 효과 생성 (간단한 메인 원만)
            player.shieldEffect = {
                mainShield: gameScene.add.circle(player.graphic.x, player.graphic.y, 30, 0x00aaff, 0.4)
            };
            
            // 메인 방어막 설정
            player.shieldEffect.mainShield.setStrokeStyle(4, 0x00ffff, 1);
            player.shieldEffect.mainShield.setDepth(1);
            
            // 간단한 펄스 효과만
            gameScene.tweens.add({
                targets: player.shieldEffect.mainShield,
                scaleX: 1.1,
                scaleY: 1.1,
                alpha: 0.2,
                duration: 800,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            
        } else {
            // 방어막 효과 위치 업데이트
            player.shieldEffect.mainShield.x = player.graphic.x;
            player.shieldEffect.mainShield.y = player.graphic.y;
        }
        
        // 플레이어 정상 투명도
        player.graphic.setAlpha(1);
        player.barrel.setAlpha(1);
        if (player.nameText) {
            player.nameText.setAlpha(1);
        }
    } else {
        // 방어막 효과 제거
        if (player.shieldEffect) {
            // 메인 방어막만 제거
            if (player.shieldEffect.mainShield) player.shieldEffect.mainShield.destroy();
            player.shieldEffect = null;
        }
        
        // 정상 상태일 때 완전 불투명
        player.graphic.setAlpha(1);
        player.barrel.setAlpha(1);
        if (player.nameText) {
            player.nameText.setAlpha(1);
        }
    }
    
    // 데이터 업데이트
    player.data = data;
    
    // 강타 스킬 활성화 시 포탄 앞에 강타 발사 대기 표시
    const hasPowerShot = data.skills && data.skills.powerShot && data.skills.powerShot.isActive;
    
    if (hasPowerShot) {
        if (!player.powerShotIndicator) {
            // 강타 발사 대기 표시 생성 (간단한 메인 원만)
            player.powerShotIndicator = {
                mainCircle: gameScene.add.circle(0, 0, 12, 0xff0000, 0.8)
            };
            
            // 메인 원 설정
            player.powerShotIndicator.mainCircle.setStrokeStyle(3, 0xffff00, 1);
            player.powerShotIndicator.mainCircle.setDepth(4);
            
            // 간단한 펄스 효과만
            gameScene.tweens.add({
                targets: player.powerShotIndicator.mainCircle,
                scaleX: 1.3,
                scaleY: 1.3,
                alpha: 0.5,
                duration: 800,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
        
        // 강타 발사 대기 표시 위치 업데이트 (포탄 끝에서 약간 앞쪽)
        const indicatorDistance = 45;
        const indicatorX = player.graphic.x + Math.cos(angle) * indicatorDistance;
        const indicatorY = player.graphic.y + Math.sin(angle) * indicatorDistance;
        
        // 메인 원 위치 업데이트
        player.powerShotIndicator.mainCircle.x = indicatorX;
        player.powerShotIndicator.mainCircle.y = indicatorY;
        
    } else {
        // 강타 스킬이 비활성화된 경우 인디케이터 제거
        if (player.powerShotIndicator) {
            player.powerShotIndicator.mainCircle.destroy();
            player.powerShotIndicator = null;
        }
    }
}

function createBullet(data) {
    // 총알을 발사한 플레이어의 색상 가져오기
    let bulletColor = 0xffff00; // 기본 노란색
    
    if (data.playerId === socket.id) {
        // 로컬 플레이어의 총알은 초록색
        bulletColor = 0x00ff00;
    } else if (players[data.playerId]) {
        // 다른 플레이어의 총알은 해당 플레이어의 탱크 색상과 동일
        const playerColor = usedColors.has(data.playerId) ? 
            availableColors[usedColors.get(data.playerId)] : 0xffff00;
        bulletColor = playerColor;
    }
    
    // 강타 총알인지 확인 (데미지가 100인 경우)
    const isPowerShot = data.damage >= 100;
    
    let bulletGraphic;
    
    if (isPowerShot) {
        // 강타 총알 - 더 크고 화려한 효과
        bulletGraphic = gameScene.add.circle(data.x, data.y, 8, 0xff0000); // 빨간색, 더 큰 크기
        bulletGraphic.setStrokeStyle(3, 0xffff00); // 노란색 테두리
        
        // 강타 총알 특별 효과들
        
        // 1. 내부 코어 (밝은 빨간색)
        const core = gameScene.add.circle(data.x, data.y, 4, 0xff4444);
        core.setDepth(2);
        
        // 2. 외부 오라 (반투명 주황색)
        const aura = gameScene.add.circle(data.x, data.y, 12, 0xff8800, 0.3);
        aura.setDepth(0);
        
        // 3. 회전하는 링 효과
        const ring1 = gameScene.add.circle(data.x, data.y, 10, 0x000000, 0);
        ring1.setStrokeStyle(2, 0xffaa00, 0.8);
        ring1.setDepth(1);
        
        const ring2 = gameScene.add.circle(data.x, data.y, 14, 0x000000, 0);
        ring2.setStrokeStyle(1, 0xff6600, 0.6);
        ring2.setDepth(1);
        
        // 4. 파티클 효과 (작은 불꽃들)
        const particles = [];
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const distance = 6;
            const particleX = data.x + Math.cos(angle) * distance;
            const particleY = data.y + Math.sin(angle) * distance;
            
            const particle = gameScene.add.circle(particleX, particleY, 1, 0xffff00);
            particle.setDepth(3);
            particles.push(particle);
        }
        
        // 애니메이션 효과들
        
        // 메인 총알 펄스 효과
        gameScene.tweens.add({
            targets: bulletGraphic,
            scaleX: 1.3,
            scaleY: 1.3,
            duration: 200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
        
        // 코어 깜빡임
        gameScene.tweens.add({
            targets: core,
            alpha: 0.3,
            duration: 150,
            yoyo: true,
            repeat: -1,
            ease: 'Power2'
        });
        
        // 오라 펄스
        gameScene.tweens.add({
            targets: aura,
            scaleX: 1.5,
            scaleY: 1.5,
            alpha: 0.1,
            duration: 300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
        
        // 링 회전
        gameScene.tweens.add({
            targets: ring1,
            rotation: Math.PI * 2,
            duration: 1000,
            repeat: -1,
            ease: 'Linear'
        });
        
        gameScene.tweens.add({
            targets: ring2,
            rotation: -Math.PI * 2,
            duration: 1500,
            repeat: -1,
            ease: 'Linear'
        });
        
        // 파티클 회전
        particles.forEach((particle, index) => {
            gameScene.tweens.add({
                targets: particle,
                rotation: Math.PI * 2,
                duration: 800 + (index * 100),
                repeat: -1,
                ease: 'Linear'
            });
            
            // 파티클 깜빡임
            gameScene.tweens.add({
                targets: particle,
                alpha: 0.2,
                scaleX: 0.5,
                scaleY: 0.5,
                duration: 200 + (index * 50),
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        });
        
        // 강타 총알 발사 사운드 재생
        playPowerShotFireSound();
        
        // 총알 객체에 모든 그래픽 요소들 저장
        const bullet = {
            ...data,
            graphic: bulletGraphic,
            isPowerShot: true,
            effects: {
                core: core,
                aura: aura,
                ring1: ring1,
                ring2: ring2,
                particles: particles
            }
        };
        
        bulletGraphic.setDepth(2);
        bullets.set(data.id, bullet);
        return bullet;
        
    } else {
        // 일반 총알
        bulletGraphic = gameScene.add.circle(data.x, data.y, 4, bulletColor);
        bulletGraphic.setStrokeStyle(1, 0xffffff);
        bulletGraphic.setDepth(1);
        
        const bullet = {
            ...data,
            graphic: bulletGraphic,
            isPowerShot: false
        };
        
        bullets.set(data.id, bullet);
        return bullet;
    }
}

function updateBullet(bullet, data) {
    if (bullet && bullet.graphic) {
        // 총알은 빠르게 움직이므로 보간 없이 직접 업데이트
        bullet.graphic.x = data.x;
        bullet.graphic.y = data.y;
        
        // 강타 총알의 경우 모든 효과들도 함께 이동
        if (bullet.isPowerShot && bullet.effects) {
            bullet.effects.core.x = data.x;
            bullet.effects.core.y = data.y;
            bullet.effects.aura.x = data.x;
            bullet.effects.aura.y = data.y;
            bullet.effects.ring1.x = data.x;
            bullet.effects.ring1.y = data.y;
            bullet.effects.ring2.x = data.x;
            bullet.effects.ring2.y = data.y;
            
            // 파티클들도 총알 주위로 이동
            bullet.effects.particles.forEach((particle, index) => {
                const angle = (index / bullet.effects.particles.length) * Math.PI * 2 + (Date.now() * 0.01);
                const distance = 6;
                particle.x = data.x + Math.cos(angle) * distance;
                particle.y = data.y + Math.sin(angle) * distance;
            });
        }
    }
}

// PVP 게임이므로 레벨업 아이템 제거

function updateRenderables() {
    // 활성화되지 않은 객체들 정리
    Object.values(players).forEach(player => {
        if (!player.graphic.active) {
            if (player.barrel) player.barrel.destroy();
            if (player.nameText) player.nameText.destroy();
            delete players[player.id];
        }
    });
}

// UI 관련 함수들
function createUI() {
    // UI 패널 (PVP용으로 크기 조정)
    const uiPanel = gameScene.add.rectangle(15, 15, 280, 60, 0x000000, 0.7);
    uiPanel.setOrigin(0, 0);
    uiPanel.setScrollFactor(0);
    uiPanel.setStrokeStyle(1, 0x444444);
    uiPanel.setDepth(10);
    
    // PVP 통계 텍스트 (킬/데스)
    gameScene.pvpStatsText = gameScene.add.text(25, 25, 'KILL: 0 | DEATH: 0', {
        fontSize: '16px',
        fill: '#ffff00',
        fontFamily: 'Arial',
        fontStyle: 'bold'
    });
    gameScene.pvpStatsText.setScrollFactor(0);
    gameScene.pvpStatsText.setDepth(10);
    
    // 체력바 배경
    const healthBarBg = gameScene.add.rectangle(25, 50, 200, 14, 0x333333);
    healthBarBg.setOrigin(0, 0);
    healthBarBg.setScrollFactor(0);
    healthBarBg.setStrokeStyle(1, 0x666666);
    healthBarBg.setDepth(10);
    
    // 체력바
    healthBar = gameScene.add.rectangle(26, 51, 198, 12, 0x00ff00);
    healthBar.setOrigin(0, 0);
    healthBar.setScrollFactor(0);
    healthBar.setDepth(10);
    
    // 체력 텍스트
    gameScene.healthText = gameScene.add.text(230, 50, '100/100', {
        fontSize: '12px',
        fill: '#ffffff',
        fontFamily: 'Arial',
        fontStyle: 'bold'
    });
    gameScene.healthText.setScrollFactor(0);
    gameScene.healthText.setDepth(10);
    
    // 스킬 UI 아이콘 (좌하단)
    const skillIconSize = 50;
    const skillIconX = 25;
    const skillIconY = gameConfig.height - 80;
    
    // 스킬 아이콘 배경 (사각형)
    gameScene.skillIconBg = gameScene.add.rectangle(
        skillIconX + skillIconSize/2, 
        skillIconY - skillIconSize/2, 
        skillIconSize, 
        skillIconSize, 
        0x333333
    );
    gameScene.skillIconBg.setStrokeStyle(2, 0x666666);
    gameScene.skillIconBg.setScrollFactor(0);
    gameScene.skillIconBg.setDepth(10);
    
    // 스킬명을 사각형 가운데에 표시
    gameScene.skillNameInBox = gameScene.add.text(
        skillIconX + skillIconSize/2,
        skillIconY - skillIconSize/2,
        '연사',
        {
            fontSize: '16px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    gameScene.skillNameInBox.setOrigin(0.5);
    gameScene.skillNameInBox.setScrollFactor(0);
    gameScene.skillNameInBox.setDepth(11);
    
    // 스킬 키 표시 (1)
    gameScene.skillKeyText = gameScene.add.text(
        skillIconX + skillIconSize/2,
        skillIconY - skillIconSize + 8,
        '1',
        {
            fontSize: '12px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    gameScene.skillKeyText.setOrigin(0.5);
    gameScene.skillKeyText.setScrollFactor(0);
    gameScene.skillKeyText.setDepth(11);
    

    
    // 시간 표시 텍스트 (아이콘 중앙)
    gameScene.skillTimeText = gameScene.add.text(
        skillIconX + skillIconSize/2,
        skillIconY - skillIconSize/2 + 15,
        '',
        {
            fontSize: '16px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 2
        }
    );
    gameScene.skillTimeText.setOrigin(0.5);
    gameScene.skillTimeText.setScrollFactor(0);
    gameScene.skillTimeText.setDepth(14);
    
    // 쿨다운 진행률 표시용 원형 오버레이
    gameScene.skillCooldownCircle = gameScene.add.graphics();
    gameScene.skillCooldownCircle.setScrollFactor(0);
    gameScene.skillCooldownCircle.setDepth(12);
    
    // 스킬 활성화 상태 표시용 외곽 링
    gameScene.skillActiveRing = gameScene.add.graphics();
    gameScene.skillActiveRing.setScrollFactor(0);
    gameScene.skillActiveRing.setDepth(13);
    
    // 준비 상태 표시용 반짝임 효과
    gameScene.skillReadyGlow = gameScene.add.graphics();
    gameScene.skillReadyGlow.setScrollFactor(0);
    gameScene.skillReadyGlow.setDepth(9);
    
    // 스킬 아이콘 위치 저장 (다른 함수에서 사용)
    gameScene.skillIconPos = {
        x: skillIconX + skillIconSize/2,
        y: skillIconY - skillIconSize/2,
        size: skillIconSize
    };
    
    // === 2번 스킬 UI (1번 스킬 오른쪽) ===
    const skill2IconX = skillIconX + skillIconSize + 20;
    const skill2IconY = skillIconY;
    
    // 2번 스킬 아이콘 배경
    gameScene.skill2IconBg = gameScene.add.rectangle(
        skill2IconX + skillIconSize/2, 
        skill2IconY - skillIconSize/2, 
        skillIconSize, 
        skillIconSize, 
        0x333333
    );
    gameScene.skill2IconBg.setStrokeStyle(2, 0x666666);
    gameScene.skill2IconBg.setScrollFactor(0);
    gameScene.skill2IconBg.setDepth(10);
    
    // 2번 스킬명을 사각형 가운데에 표시
    gameScene.skill2NameInBox = gameScene.add.text(
        skill2IconX + skillIconSize/2,
        skill2IconY - skillIconSize/2,
        '가속',
        {
            fontSize: '16px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    gameScene.skill2NameInBox.setOrigin(0.5);
    gameScene.skill2NameInBox.setScrollFactor(0);
    gameScene.skill2NameInBox.setDepth(11);
    
    // 2번 스킬 키 표시 (2)
    gameScene.skill2KeyText = gameScene.add.text(
        skill2IconX + skillIconSize/2,
        skill2IconY - skillIconSize + 8,
        '2',
        {
            fontSize: '12px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    gameScene.skill2KeyText.setOrigin(0.5);
    gameScene.skill2KeyText.setScrollFactor(0);
    gameScene.skill2KeyText.setDepth(11);
    

    
    // 2번 스킬 시간 표시 텍스트 (아이콘 중앙)
    gameScene.skill2TimeText = gameScene.add.text(
        skill2IconX + skillIconSize/2,
        skill2IconY - skillIconSize/2 + 15,
        '',
        {
            fontSize: '16px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 2
        }
    );
    gameScene.skill2TimeText.setOrigin(0.5);
    gameScene.skill2TimeText.setScrollFactor(0);
    gameScene.skill2TimeText.setDepth(14);
    
    // 2번 스킬 쿨다운 진행률 표시용 원형 오버레이
    gameScene.skill2CooldownCircle = gameScene.add.graphics();
    gameScene.skill2CooldownCircle.setScrollFactor(0);
    gameScene.skill2CooldownCircle.setDepth(12);
    
    // 2번 스킬 아이콘 위치 저장
    gameScene.skill2IconPos = {
        x: skill2IconX + skillIconSize/2,
        y: skill2IconY - skillIconSize/2,
        size: skillIconSize
    };
    
    // === 3번 스킬 UI (2번 스킬 오른쪽) ===
    const skill3IconX = skill2IconX + skillIconSize + 20;
    const skill3IconY = skillIconY;
    
    // 3번 스킬 아이콘 배경
    gameScene.skill3IconBg = gameScene.add.rectangle(
        skill3IconX + skillIconSize/2, 
        skill3IconY - skillIconSize/2, 
        skillIconSize, 
        skillIconSize, 
        0x333333
    );
    gameScene.skill3IconBg.setStrokeStyle(2, 0x666666);
    gameScene.skill3IconBg.setScrollFactor(0);
    gameScene.skill3IconBg.setDepth(10);
    
    // 3번 스킬명을 사각형 가운데에 표시
    gameScene.skill3NameInBox = gameScene.add.text(
        skill3IconX + skillIconSize/2,
        skill3IconY - skillIconSize/2,
        '회복',
        {
            fontSize: '16px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    gameScene.skill3NameInBox.setOrigin(0.5);
    gameScene.skill3NameInBox.setScrollFactor(0);
    gameScene.skill3NameInBox.setDepth(11);
    
    // 3번 스킬 키 표시 (3)
    gameScene.skill3KeyText = gameScene.add.text(
        skill3IconX + skillIconSize/2,
        skill3IconY - skillIconSize + 8,
        '3',
        {
            fontSize: '12px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    gameScene.skill3KeyText.setOrigin(0.5);
    gameScene.skill3KeyText.setScrollFactor(0);
    gameScene.skill3KeyText.setDepth(11);
    
    // 3번 스킬 시간 표시 텍스트 (아이콘 중앙)
    gameScene.skill3TimeText = gameScene.add.text(
        skill3IconX + skillIconSize/2,
        skill3IconY - skillIconSize/2 + 15,
        '',
        {
            fontSize: '16px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 2
        }
    );
    gameScene.skill3TimeText.setOrigin(0.5);
    gameScene.skill3TimeText.setScrollFactor(0);
    gameScene.skill3TimeText.setDepth(14);
    
    // 3번 스킬 쿨다운 진행률 표시용 원형 오버레이
    gameScene.skill3CooldownCircle = gameScene.add.graphics();
    gameScene.skill3CooldownCircle.setScrollFactor(0);
    gameScene.skill3CooldownCircle.setDepth(12);
    
    // 3번 스킬 아이콘 위치 저장
    gameScene.skill3IconPos = {
        x: skill3IconX + skillIconSize/2,
        y: skill3IconY - skillIconSize/2,
        size: skillIconSize
    };
    
    // === 4번 스킬 UI (3번 스킬 오른쪽) ===
    const skill4IconX = skill3IconX + skillIconSize + 20;
    const skill4IconY = skillIconY;
    
    // 4번 스킬 아이콘 배경
    gameScene.skill4IconBg = gameScene.add.rectangle(
        skill4IconX + skillIconSize/2, 
        skill4IconY - skillIconSize/2, 
        skillIconSize, 
        skillIconSize, 
        0x333333
    );
    gameScene.skill4IconBg.setStrokeStyle(2, 0x666666);
    gameScene.skill4IconBg.setScrollFactor(0);
    gameScene.skill4IconBg.setDepth(10);
    
    // 4번 스킬명을 사각형 가운데에 표시
    gameScene.skill4NameInBox = gameScene.add.text(
        skill4IconX + skillIconSize/2,
        skill4IconY - skillIconSize/2,
        '강타',
        {
            fontSize: '16px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    gameScene.skill4NameInBox.setOrigin(0.5);
    gameScene.skill4NameInBox.setScrollFactor(0);
    gameScene.skill4NameInBox.setDepth(11);
    
    // 4번 스킬 키 표시 (4)
    gameScene.skill4KeyText = gameScene.add.text(
        skill4IconX + skillIconSize/2,
        skill4IconY - skillIconSize + 8,
        '4',
        {
            fontSize: '12px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    gameScene.skill4KeyText.setOrigin(0.5);
    gameScene.skill4KeyText.setScrollFactor(0);
    gameScene.skill4KeyText.setDepth(11);
    
    // 4번 스킬 시간 표시 텍스트 (아이콘 중앙)
    gameScene.skill4TimeText = gameScene.add.text(
        skill4IconX + skillIconSize/2,
        skill4IconY - skillIconSize/2 + 15,
        '',
        {
            fontSize: '16px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 2
        }
    );
    gameScene.skill4TimeText.setOrigin(0.5);
    gameScene.skill4TimeText.setScrollFactor(0);
    gameScene.skill4TimeText.setDepth(14);
    
    // 4번 스킬 쿨다운 진행률 표시용 원형 오버레이
    gameScene.skill4CooldownCircle = gameScene.add.graphics();
    gameScene.skill4CooldownCircle.setScrollFactor(0);
    gameScene.skill4CooldownCircle.setDepth(12);
    
    // 4번 스킬 아이콘 위치 저장
    gameScene.skill4IconPos = {
        x: skill4IconX + skillIconSize/2,
        y: skill4IconY - skillIconSize/2,
        size: skillIconSize
    };
    
    // === 5번 스킬 UI (4번 스킬 오른쪽) ===
    const skill5IconX = skill4IconX + skillIconSize + 20;
    const skill5IconY = skillIconY;
    
    // 5번 스킬 아이콘 배경
    gameScene.skill5IconBg = gameScene.add.rectangle(
        skill5IconX + skillIconSize/2, 
        skill5IconY - skillIconSize/2, 
        skillIconSize, 
        skillIconSize, 
        0x333333
    );
    gameScene.skill5IconBg.setStrokeStyle(2, 0x666666);
    gameScene.skill5IconBg.setScrollFactor(0);
    gameScene.skill5IconBg.setDepth(10);
    
    // 5번 스킬명을 사각형 가운데에 표시
    gameScene.skill5NameInBox = gameScene.add.text(
        skill5IconX + skillIconSize/2,
        skill5IconY - skillIconSize/2,
        '방어막',
        {
            fontSize: '16px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    gameScene.skill5NameInBox.setOrigin(0.5);
    gameScene.skill5NameInBox.setScrollFactor(0);
    gameScene.skill5NameInBox.setDepth(11);
    
    // 5번 스킬 키 표시 (5)
    gameScene.skill5KeyText = gameScene.add.text(
        skill5IconX + skillIconSize/2,
        skill5IconY - skillIconSize + 8,
        '5',
        {
            fontSize: '12px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    gameScene.skill5KeyText.setOrigin(0.5);
    gameScene.skill5KeyText.setScrollFactor(0);
    gameScene.skill5KeyText.setDepth(11);
    
    // 5번 스킬 시간 표시 텍스트 (아이콘 중앙)
    gameScene.skill5TimeText = gameScene.add.text(
        skill5IconX + skillIconSize/2,
        skill5IconY - skillIconSize/2 + 15,
        '',
        {
            fontSize: '16px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 2
        }
    );
    gameScene.skill5TimeText.setOrigin(0.5);
    gameScene.skill5TimeText.setScrollFactor(0);
    gameScene.skill5TimeText.setDepth(14);
    
    // 5번 스킬 쿨다운 진행률 표시용 원형 오버레이
    gameScene.skill5CooldownCircle = gameScene.add.graphics();
    gameScene.skill5CooldownCircle.setScrollFactor(0);
    gameScene.skill5CooldownCircle.setDepth(12);
    
    // 5번 스킬 아이콘 위치 저장
    gameScene.skill5IconPos = {
        x: skill5IconX + skillIconSize/2,
        y: skill5IconY - skillIconSize/2,
        size: skillIconSize
    };
    
    // === 스코어보드 UI (우상단) ===
    createScoreboard();
    
    // 조작법 안내 (우하단) - PVP 게임용
    const controlsText = gameScene.add.text(
        gameConfig.width - 20,
        gameConfig.height - 120,
        '조작법:\n화살표키 또는 WASD: 이동\n스페이스: 발사\n숫자1: 연사 스킬\n숫자2: 가속 스킬\n숫자3: 회복 스킬\n숫자4: 강타 스킬\n숫자5: 방어막 스킬',
        {
            fontSize: '11px',
            fill: '#cccccc',
            fontFamily: 'Arial',
            align: 'right'
        }
    );
    controlsText.setOrigin(1, 0);
    controlsText.setScrollFactor(0);
    controlsText.setDepth(10);
    

}

function updateUI(stats, pvpStats) {
    if (!stats || !pvpStats) return;
    
    // PVP 통계 업데이트 (킬/데스)
    gameScene.pvpStatsText.setText(`KILL: ${pvpStats.kills} | DEATH: ${pvpStats.deaths}`);
    
    // 체력바 업데이트
    const healthPercent = stats.health / stats.maxHealth;
    healthBar.displayWidth = 198 * healthPercent;
    
    // 체력에 따른 색상 변경
    if (healthPercent > 0.6) {
        healthBar.setFillStyle(0x00ff00); // 녹색
    } else if (healthPercent > 0.3) {
        healthBar.setFillStyle(0xffaa00); // 주황색
    } else {
        healthBar.setFillStyle(0xff0000); // 빨간색
    }
    
    // 체력 텍스트 업데이트
    gameScene.healthText.setText(`${stats.health}/${stats.maxHealth}`);
}

// 스코어보드 생성 함수
function createScoreboard() {
    const scoreboardWidth = 280;
    const scoreboardX = 15; // 상단 UI와 같은 X 위치
    const scoreboardY = 85; // 상단 UI 아래
    
    // 스코어보드 상태 (접힘/펼침)
    gameScene.scoreboardExpanded = false;
    
    // 스코어보드 헤더 (항상 보이는 부분)
    const headerHeight = 35;
    gameScene.scoreboardHeader = gameScene.add.rectangle(
        scoreboardX + scoreboardWidth/2,
        scoreboardY + headerHeight/2,
        scoreboardWidth,
        headerHeight,
        0x000000,
        0.8
    );
    gameScene.scoreboardHeader.setStrokeStyle(2, 0x444444);
    gameScene.scoreboardHeader.setScrollFactor(0);
    gameScene.scoreboardHeader.setDepth(10);
    
    // 스코어보드 제목 (클릭 가능)
    gameScene.scoreboardTitle = gameScene.add.text(
        scoreboardX + 15,
        scoreboardY + 10,
        '▶ SCOREBOARD (클릭하여 펼치기)',
        {
            fontSize: '14px',
            fill: '#ffff00',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    gameScene.scoreboardTitle.setScrollFactor(0);
    gameScene.scoreboardTitle.setDepth(11);
    gameScene.scoreboardTitle.setInteractive({ useHandCursor: true });
    
    // 스코어보드 본문 (접회복 수 있는 부분)
    const bodyHeight = 180;
    gameScene.scoreboardBody = gameScene.add.rectangle(
        scoreboardX + scoreboardWidth/2,
        scoreboardY + headerHeight + bodyHeight/2,
        scoreboardWidth,
        bodyHeight,
        0x000000,
        0.8
    );
    gameScene.scoreboardBody.setStrokeStyle(2, 0x444444);
    gameScene.scoreboardBody.setScrollFactor(0);
    gameScene.scoreboardBody.setDepth(10);
    gameScene.scoreboardBody.setVisible(false); // 처음에는 숨김
    
    // 테이블 헤더 배경
    gameScene.scoreboardHeaderBg = gameScene.add.rectangle(
        scoreboardX + scoreboardWidth/2,
        scoreboardY + headerHeight + 20,
        scoreboardWidth - 10,
        25,
        0x333333,
        0.8
    );
    gameScene.scoreboardHeaderBg.setStrokeStyle(1, 0x666666);
    gameScene.scoreboardHeaderBg.setScrollFactor(0);
    gameScene.scoreboardHeaderBg.setDepth(10);
    gameScene.scoreboardHeaderBg.setVisible(false);
    
    // 컬럼 헤더들 (개별적으로 배치)
    gameScene.scoreboardPlayerHeader = gameScene.add.text(
        scoreboardX + 20,
        scoreboardY + headerHeight + 15,
        'PLAYER',
        {
            fontSize: '12px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    gameScene.scoreboardPlayerHeader.setScrollFactor(0);
    gameScene.scoreboardPlayerHeader.setDepth(11);
    gameScene.scoreboardPlayerHeader.setVisible(false);
    
    gameScene.scoreboardKillHeader = gameScene.add.text(
        scoreboardX + 180,
        scoreboardY + headerHeight + 15,
        'KILL',
        {
            fontSize: '12px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    gameScene.scoreboardKillHeader.setScrollFactor(0);
    gameScene.scoreboardKillHeader.setDepth(11);
    gameScene.scoreboardKillHeader.setVisible(false);
    
    gameScene.scoreboardDeathHeader = gameScene.add.text(
        scoreboardX + 230,
        scoreboardY + headerHeight + 15,
        'DEATH',
        {
            fontSize: '12px',
            fill: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }
    );
    gameScene.scoreboardDeathHeader.setScrollFactor(0);
    gameScene.scoreboardDeathHeader.setDepth(11);
    gameScene.scoreboardDeathHeader.setVisible(false);
    
    // 플레이어 목록을 위한 그룹
    gameScene.scoreboardPlayers = gameScene.add.group();
    
    // 스코어보드 위치 정보 저장
    gameScene.scoreboardInfo = {
        x: scoreboardX,
        y: scoreboardY,
        width: scoreboardWidth,
        headerHeight: headerHeight,
        bodyHeight: bodyHeight,
        startY: scoreboardY + headerHeight + 45
    };
    
    // 클릭 이벤트 처리
    gameScene.scoreboardTitle.on('pointerdown', toggleScoreboard);
}

// 스코어보드 토글 함수
function toggleScoreboard() {
    if (!gameScene.scoreboardExpanded) {
        // 펼치기
        gameScene.scoreboardExpanded = true;
        gameScene.scoreboardTitle.setText('▼ SCOREBOARD (클릭하여 접기)');
        gameScene.scoreboardBody.setVisible(true);
        gameScene.scoreboardHeaderBg.setVisible(true);
        gameScene.scoreboardPlayerHeader.setVisible(true);
        gameScene.scoreboardKillHeader.setVisible(true);
        gameScene.scoreboardDeathHeader.setVisible(true);
        
        // 플레이어 목록도 보이게 설정
        gameScene.scoreboardPlayers.children.entries.forEach(player => {
            player.setVisible(true);
        });
    } else {
        // 접기
        gameScene.scoreboardExpanded = false;
        gameScene.scoreboardTitle.setText('▶ SCOREBOARD (클릭하여 펼치기)');
        gameScene.scoreboardBody.setVisible(false);
        gameScene.scoreboardHeaderBg.setVisible(false);
        gameScene.scoreboardPlayerHeader.setVisible(false);
        gameScene.scoreboardKillHeader.setVisible(false);
        gameScene.scoreboardDeathHeader.setVisible(false);
        
        // 플레이어 목록도 숨기기
        gameScene.scoreboardPlayers.children.entries.forEach(player => {
            player.setVisible(false);
        });
    }
}

// 스코어보드 업데이트 함수
function updateScoreboard(players) {
    if (!gameScene.scoreboardPlayers || !gameScene.scoreboardInfo) return;
    
    // 기존 플레이어 텍스트들 제거
    gameScene.scoreboardPlayers.clear(true, true);
    
    // 플레이어들을 킬 수 기준으로 정렬 (서버에서 받은 데이터 사용)
    const sortedPlayers = Object.entries(players).sort((a, b) => {
        const aKills = a[1].pvpStats ? a[1].pvpStats.kills : 0;
        const bKills = b[1].pvpStats ? b[1].pvpStats.kills : 0;
        return bKills - aKills; // 킬 수 내림차순
    });
    
    // 최대 8명까지만 표시
    const maxPlayers = Math.min(8, sortedPlayers.length);
    
    for (let i = 0; i < maxPlayers; i++) {
        const [playerId, playerData] = sortedPlayers[i];
        const pvpStats = playerData.pvpStats || { kills: 0, deaths: 0 };
        
        // 플레이어 이름 (10자 제한)
        const displayName = playerId.length > 10 ? playerId.substring(0, 10) + '...' : playerId;
        
        // 자신인지 확인
        const isLocalPlayer = playerId === socket.id;
        const textColor = isLocalPlayer ? '#00ff00' : '#ffffff';
        const rowY = gameScene.scoreboardInfo.startY + (i * 18);
        
        // 행 배경 (짝수/홀수 구분)
        const rowBg = gameScene.add.rectangle(
            gameScene.scoreboardInfo.x + gameScene.scoreboardInfo.width/2,
            rowY + 7,
            gameScene.scoreboardInfo.width - 10,
            16,
            i % 2 === 0 ? 0x222222 : 0x1a1a1a,
            0.6
        );
        rowBg.setScrollFactor(0);
        rowBg.setDepth(10);
        rowBg.setVisible(gameScene.scoreboardExpanded);
        gameScene.scoreboardPlayers.add(rowBg);
        
        // 플레이어 이름
        const nameText = gameScene.add.text(
            gameScene.scoreboardInfo.x + 20,
            rowY,
            displayName,
            {
                fontSize: '11px',
                fill: textColor,
                fontFamily: 'Arial',
                fontStyle: isLocalPlayer ? 'bold' : 'normal'
            }
        );
        nameText.setScrollFactor(0);
        nameText.setDepth(11);
        nameText.setVisible(gameScene.scoreboardExpanded);
        gameScene.scoreboardPlayers.add(nameText);
        
        // 킬 수
        const killText = gameScene.add.text(
            gameScene.scoreboardInfo.x + 190,
            rowY,
            pvpStats.kills.toString(),
            {
                fontSize: '11px',
                fill: textColor,
                fontFamily: 'Arial',
                fontStyle: isLocalPlayer ? 'bold' : 'normal'
            }
        );
        killText.setScrollFactor(0);
        killText.setDepth(11);
        killText.setVisible(gameScene.scoreboardExpanded);
        gameScene.scoreboardPlayers.add(killText);
        
        // 데스 수
        const deathText = gameScene.add.text(
            gameScene.scoreboardInfo.x + 245,
            rowY,
            pvpStats.deaths.toString(),
            {
                fontSize: '11px',
                fill: textColor,
                fontFamily: 'Arial',
                fontStyle: isLocalPlayer ? 'bold' : 'normal'
            }
        );
        deathText.setScrollFactor(0);
        deathText.setDepth(11);
        deathText.setVisible(gameScene.scoreboardExpanded);
        gameScene.scoreboardPlayers.add(deathText);
    }
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
    
    // 미니맵 배경 (반투명)
    const minimapBg = gameScene.add.rectangle(
        minimapX + minimapSize / 2, 
        minimapY + minimapSize / 2, 
        minimapSize, 
        minimapSize, 
        0x000000, 
        0.4  // 반투명도 설정 (0.4 = 40% 불투명)
    );
    minimapBg.setStrokeStyle(2, 0xffffff, 0.8);  // 테두리도 약간 투명하게
    minimapBg.setScrollFactor(0);
    minimapBg.setDepth(10);
    
    // 미니맵 월드 표시 (반투명 회색)
    const minimapWorld = gameScene.add.rectangle(
        minimapX + minimapSize / 2, 
        minimapY + minimapSize / 2, 
        minimapSize - 10, 
        minimapSize - 10, 
        0x808080,
        0.3  // 더 투명하게 설정
    );
    minimapWorld.setStrokeStyle(1, 0x666666, 0.6);  // 테두리도 투명하게
    minimapWorld.setScrollFactor(0);
    minimapWorld.setDepth(10);
    
    // 미니맵 로컬 플레이어 탱크 표시 (초록색 점, 조금 더 크게)
    minimapTank = gameScene.add.circle(
        minimapX + minimapSize / 2, 
        minimapY + minimapSize / 2, 
        5, 
        0x00ff00
    );
    minimapTank.setStrokeStyle(1, 0xffffff, 0.8);  // 흰색 테두리로 더 선명하게
    minimapTank.setScrollFactor(0);
    minimapTank.setDepth(12); // 다른 플레이어보다 위에 표시
    
    // 미니맵 정보 저장
    minimap = {
        x: minimapX,
        y: minimapY,
        size: minimapSize,
        worldSize: worldSize,
        scale: (minimapSize - 10) / Math.max(worldSize.width, worldSize.height)
    };
    
    // // 미니맵 제목
    // const minimapTitle = gameScene.add.text(
    //     minimapX + minimapSize / 2,
    //     minimapY - 15,
    //     'MINIMAP',
    //     {
    //         fontSize: '12px',
    //         fill: '#ffffff',
    //         fontFamily: 'Arial',
    //         fontStyle: 'bold'
    //     }
    // );
    // minimapTitle.setOrigin(0.5);
    // minimapTitle.setScrollFactor(0);
    // minimapTitle.setDepth(10);
}

// 미니맵 업데이트 함수
function updateMinimap(localPlayerData, allPlayers) {
    if (!minimap || !minimapTank || !localPlayerData) return;
    
    // 로컬 플레이어 위치를 미니맵 좌표로 변환
    const minimapPlayerX = minimap.x + 5 + (localPlayerData.x / minimap.worldSize.width) * (minimap.size - 10);
    const minimapPlayerY = minimap.y + 5 + (localPlayerData.y / minimap.worldSize.height) * (minimap.size - 10);
    
    // 미니맵 로컬 플레이어 탱크 위치 업데이트
    minimapTank.x = minimapPlayerX;
    minimapTank.y = minimapPlayerY;
    
    // 로컬 플레이어 탱크 방향 표시
    const angle = Math.atan2(localPlayerData.direction.y, localPlayerData.direction.x);
    minimapTank.rotation = angle;
    
    // 다른 플레이어들 미니맵 업데이트
    updateMinimapOtherPlayers(allPlayers);
}

// 다른 플레이어들의 미니맵 표시 업데이트
function updateMinimapOtherPlayers(allPlayers) {
    if (!minimap || !allPlayers) return;
    
    // 현재 존재하는 미니맵 플레이어들의 ID 목록
    const currentMinimapPlayerIds = new Set(Object.keys(minimapOtherPlayers));
    
    // 모든 플레이어 순회
    Object.entries(allPlayers).forEach(([playerId, playerData]) => {
        // 로컬 플레이어는 제외
        if (playerId === socket.id) return;
        
        currentMinimapPlayerIds.delete(playerId);
        
        // 플레이어 위치를 미니맵 좌표로 변환
        const minimapX = minimap.x + 5 + (playerData.x / minimap.worldSize.width) * (minimap.size - 10);
        const minimapY = minimap.y + 5 + (playerData.y / minimap.worldSize.height) * (minimap.size - 10);
        
        // 플레이어 색상 가져오기
        const playerColor = usedColors.has(playerId) ? 
            availableColors[usedColors.get(playerId)] : 0xffffff;
        
        if (!minimapOtherPlayers[playerId]) {
            // 새로운 플레이어 미니맵 표시 생성
            minimapOtherPlayers[playerId] = gameScene.add.circle(
                minimapX, 
                minimapY, 
                3, 
                playerColor
            );
            minimapOtherPlayers[playerId].setStrokeStyle(1, 0xffffff, 0.6);  // 흰색 테두리 추가
            minimapOtherPlayers[playerId].setScrollFactor(0);
            minimapOtherPlayers[playerId].setDepth(11);
        } else {
            // 기존 플레이어 위치 및 색상 업데이트
            minimapOtherPlayers[playerId].x = minimapX;
            minimapOtherPlayers[playerId].y = minimapY;
            minimapOtherPlayers[playerId].setFillStyle(playerColor);
        }
    });
    
    // 연결이 끊어진 플레이어들의 미니맵 표시 제거
    currentMinimapPlayerIds.forEach(playerId => {
        if (minimapOtherPlayers[playerId]) {
            minimapOtherPlayers[playerId].destroy();
            delete minimapOtherPlayers[playerId];
        }
    });
}

// 피격 효과 표시 - 모든 플레이어에게 동일하게 표시
function showHitDamageEffect(data) {
    // 강타 총알인지 확인
    const isPowerShotHit = data.damage >= 100;
    
    // 자신이 피격당한 경우가 아닐 때만 피해량 텍스트 표시 (중복 방지)
    if (data.targetId !== socket.id) {
        // 피격 위치에 피해량 표시
        const damageColor = isPowerShotHit ? '#ff0000' : '#ff4444';
        const fontSize = isPowerShotHit ? '28px' : '20px';
        
        const damageText = gameScene.add.text(data.targetX, data.targetY - 30, `-${data.damage}`, {
            fontSize: fontSize,
            fill: damageColor,
            fontWeight: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setDepth(600);
        
        // 강타 총알 피해량 텍스트에 특별 효과
        if (isPowerShotHit) {
            // 크리티컬 텍스트 추가
            const criticalText = gameScene.add.text(data.targetX, data.targetY - 60, 'CRITICAL!', {
                fontSize: '20px',
                fill: '#ffff00',
                fontWeight: 'bold',
                stroke: '#ff0000',
                strokeThickness: 2
            }).setDepth(601);
            
            // 크리티컬 텍스트 애니메이션
            gameScene.tweens.add({
                targets: criticalText,
                y: data.targetY - 90,
                scaleX: 1.5,
                scaleY: 1.5,
                alpha: 0,
                duration: 1200,
                ease: 'Power2',
                onComplete: () => {
                    criticalText.destroy();
                }
            });
            
            // 피해량 텍스트 강화 애니메이션
            gameScene.tweens.add({
                targets: damageText,
                y: data.targetY - 80,
                scaleX: 1.3,
                scaleY: 1.3,
                alpha: 0,
                duration: 1500,
                ease: 'Power2',
                onComplete: () => {
                    damageText.destroy();
                }
            });
            
            // 강타 피격 사운드 재생
            playPowerShotHitSound();
            
        } else {
            // 일반 피해량 텍스트 애니메이션
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
    }
    
    // 피격 위치에 마커 (강타 총알은 더 큰 폭발 효과)
    if (isPowerShotHit) {
        // 강타 총알 폭발 효과
        
        // 메인 폭발 (큰 빨간 원)
        const mainExplosion = gameScene.add.circle(data.targetX, data.targetY, 25, 0xff0000, 0.8);
        mainExplosion.setDepth(500);
        
        // 충격파 (확산되는 링)
        const shockwave = gameScene.add.circle(data.targetX, data.targetY, 15, 0x000000, 0);
        shockwave.setStrokeStyle(4, 0xff4400, 0.9);
        shockwave.setDepth(501);
        
        // 파편 효과 (작은 파티클들)
        const fragments = [];
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const distance = 20 + Math.random() * 15;
            const fragmentX = data.targetX + Math.cos(angle) * distance;
            const fragmentY = data.targetY + Math.sin(angle) * distance;
            
            const fragment = gameScene.add.circle(fragmentX, fragmentY, 2 + Math.random() * 2, 0xffaa00);
            fragment.setDepth(502);
            fragments.push(fragment);
        }
        
        // 메인 폭발 애니메이션
        gameScene.tweens.add({
            targets: mainExplosion,
            scaleX: 3,
            scaleY: 3,
            alpha: 0,
            duration: 600,
            ease: 'Power2',
            onComplete: () => {
                mainExplosion.destroy();
            }
        });
        
        // 충격파 애니메이션
        gameScene.tweens.add({
            targets: shockwave,
            scaleX: 4,
            scaleY: 4,
            alpha: 0,
            duration: 800,
            ease: 'Power2',
            onComplete: () => {
                shockwave.destroy();
            }
        });
        
        // 파편 애니메이션
        fragments.forEach((fragment, index) => {
            const angle = (index / fragments.length) * Math.PI * 2;
            const finalDistance = 40 + Math.random() * 20;
            const finalX = data.targetX + Math.cos(angle) * finalDistance;
            const finalY = data.targetY + Math.sin(angle) * finalDistance;
            
            gameScene.tweens.add({
                targets: fragment,
                x: finalX,
                y: finalY,
                scaleX: 0.2,
                scaleY: 0.2,
                alpha: 0,
                duration: 700 + Math.random() * 300,
                ease: 'Power2',
                onComplete: () => {
                    fragment.destroy();
                }
            });
        });
        
    } else {
        // 일반 총알 피격 마커
        const hitMarker = gameScene.add.circle(data.targetX, data.targetY, 15, 0xff0000, 0.7);
        hitMarker.setDepth(500);
        
        // 일반 피격 마커 애니메이션
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
    }
    
    console.log(`피격 발생! 공격자: ${data.attackerId}, 피격자: ${data.targetId}, 피해량: ${data.damage}${isPowerShotHit ? ' (강타!)' : ''}`);
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
    // 킬 텍스트 (화면 중앙 상단) - PVP 정보 포함
    const killText = gameScene.add.text(
        gameConfig.width / 2,
        gameConfig.height / 2 - 100,
        `KILL!\n킬 수: ${data.attackerKills}`,
        {
            fontSize: '36px',
            fill: '#ffff00',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            align: 'center'
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
    
    console.log(`킬! 상대방을 처치했습니다. 총 킬 수: ${data.attackerKills}`);
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

// 스킬 활성화 사운드
function playSkillActivationSound() {
    if (!audioContext || !isSoundEnabled) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.3);
        
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        console.log('스킬 활성화 사운드 재생 오류:', error);
    }
}

// 가속 스킬 활성화 사운드
function playSpeedBoostActivationSound() {
    if (!audioContext || !isSoundEnabled) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.2);
        oscillator.frequency.exponentialRampToValueAtTime(900, audioContext.currentTime + 0.4);
        
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.4);
    } catch (error) {
        console.log('가속 스킬 활성화 사운드 재생 오류:', error);
    }
}

// 회복 스킬 활성화 사운드
function playHealActivationSound() {
    if (!audioContext || !isSoundEnabled) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(500, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(1000, audioContext.currentTime + 0.3);
        
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        console.log('회복 스킬 활성화 사운드 재생 오류:', error);
    }
}

// 스킬 비활성화 사운드
function playSkillDeactivationSound() {
    if (!audioContext || !isSoundEnabled) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
        console.log('스킬 비활성화 사운드 재생 오류:', error);
    }
}

// 강력한 공격 스킬 활성화 사운드
function playPowerShotActivationSound() {
    if (!audioContext || !isSoundEnabled) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(300, audioContext.currentTime + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.3);
        oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.5);
        
        gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        console.log('강력한 공격 스킬 활성화 사운드 재생 오류:', error);
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

// 회복 효과 표시
function showHealEffect(data) {
    // 회복 위치에 초록색 원형 마커
    const healMarker = gameScene.add.circle(data.x, data.y, 20, 0x00ff00, 0.8);
    healMarker.setDepth(500);
    
    // 회복 마커 애니메이션
    gameScene.tweens.add({
        targets: healMarker,
        scaleX: 2.5,
        scaleY: 2.5,
        alpha: 0,
        duration: 800,
        ease: 'Power2',
        onComplete: () => {
            healMarker.destroy();
        }
    });
    
    // 회복량 텍스트 표시
    const healText = gameScene.add.text(data.x, data.y - 30, `+${data.healAmount}`, {
        fontSize: '20px',
        fill: '#00ff00',
        fontWeight: 'bold',
        stroke: '#000000',
        strokeThickness: 2
    }).setDepth(600);
    
    // 회복 텍스트 애니메이션
    gameScene.tweens.add({
        targets: healText,
        y: data.y - 60,
        alpha: 0,
        duration: 1000,
        ease: 'Power2',
        onComplete: () => {
            healText.destroy();
        }
    });
    
    // 자신이 회복한 경우 추가 효과
    if (data.playerId === socket.id) {
        // 화면 초록색 플래시 효과
        const flashOverlay = gameScene.add.rectangle(
            gameConfig.width / 2,
            gameConfig.height / 2,
            gameConfig.width,
            gameConfig.height,
            0x00ff00,
            0.2
        );
        flashOverlay.setScrollFactor(0);
        flashOverlay.setDepth(20);
        
        // 플래시 효과 애니메이션
        gameScene.tweens.add({
            targets: flashOverlay,
            alpha: 0,
            duration: 300,
            ease: 'Power2',
            onComplete: () => {
                flashOverlay.destroy();
            }
        });
        
        console.log(`회복 사용! 체력 ${data.healAmount} 회복, 현재 체력: ${data.newHealth}`);
    }
}

// 서버에서 총알이 제거될 때 호출되는 함수 수정
function removeBullet(bulletId) {
    const bullet = bullets.get(bulletId);
    if (bullet) {
        // 일반 총알 그래픽 제거
        if (bullet.graphic) {
            bullet.graphic.destroy();
        }
        
        // 강타 총알의 경우 모든 효과들도 제거
        if (bullet.isPowerShot && bullet.effects) {
            bullet.effects.core.destroy();
            bullet.effects.aura.destroy();
            bullet.effects.ring1.destroy();
            bullet.effects.ring2.destroy();
            bullet.effects.particles.forEach(particle => particle.destroy());
        }
        
        bullets.delete(bulletId);
    }
}

// 강타 총알 발사 사운드 (포탄 발사음)
function playPowerShotFireSound() {
    if (!audioContext || !isSoundEnabled) return;
    
    try {
        // 첫 번째 사운드 - 포탄 발사 폭발음 (매우 깊고 강력한)
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(50, audioContext.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(25, audioContext.currentTime + 0.4);
        
        gain1.gain.setValueAtTime(0.4, audioContext.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        osc1.start(audioContext.currentTime);
        osc1.stop(audioContext.currentTime + 0.4);
        
        // 두 번째 사운드 - 포탄 휘파람 소리 (고속 비행음)
        setTimeout(() => {
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(2000, audioContext.currentTime);
            osc2.frequency.exponentialRampToValueAtTime(2500, audioContext.currentTime + 0.1);
            osc2.frequency.exponentialRampToValueAtTime(1800, audioContext.currentTime + 0.3);
            
            gain2.gain.setValueAtTime(0.15, audioContext.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);
            osc2.start(audioContext.currentTime);
            osc2.stop(audioContext.currentTime + 0.3);
        }, 100);
        
        // 세 번째 사운드 - 포탄 충격파
        setTimeout(() => {
            const osc3 = audioContext.createOscillator();
            const gain3 = audioContext.createGain();
            
            osc3.type = 'square';
            osc3.frequency.setValueAtTime(150, audioContext.currentTime);
            osc3.frequency.exponentialRampToValueAtTime(300, audioContext.currentTime + 0.1);
            osc3.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.2);
            
            gain3.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            
            osc3.connect(gain3);
            gain3.connect(audioContext.destination);
            osc3.start(audioContext.currentTime);
            osc3.stop(audioContext.currentTime + 0.2);
        }, 50);
        
    } catch (error) {
        console.log('강타 총알 발사 사운드 재생 오류:', error);
    }
}

// 강타 총알 피격 사운드 (포탄 폭발음)
function playPowerShotHitSound() {
    if (!audioContext || !isSoundEnabled) return;
    
    try {
        // 첫 번째 사운드 - 포탄 폭발 메인 사운드 (매우 강력한 폭발음)
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(40, audioContext.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(20, audioContext.currentTime + 0.5);
        
        gain1.gain.setValueAtTime(0.5, audioContext.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        osc1.start(audioContext.currentTime);
        osc1.stop(audioContext.currentTime + 0.5);
        
        // 두 번째 사운드 - 포탄 파편 날아가는 소리
        setTimeout(() => {
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(1200, audioContext.currentTime);
            osc2.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.1);
            osc2.frequency.exponentialRampToValueAtTime(300, audioContext.currentTime + 0.3);
            
            gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);
            osc2.start(audioContext.currentTime);
            osc2.stop(audioContext.currentTime + 0.3);
        }, 50);
        
        // 세 번째 사운드 - 포탄 충격파와 잔향
        setTimeout(() => {
            const osc3 = audioContext.createOscillator();
            const gain3 = audioContext.createGain();
            
            osc3.type = 'triangle';
            osc3.frequency.setValueAtTime(200, audioContext.currentTime);
            osc3.frequency.exponentialRampToValueAtTime(80, audioContext.currentTime + 0.4);
            
            gain3.gain.setValueAtTime(0.25, audioContext.currentTime);
            gain3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
            
            osc3.connect(gain3);
            gain3.connect(audioContext.destination);
            osc3.start(audioContext.currentTime);
            osc3.stop(audioContext.currentTime + 0.4);
        }, 150);
        
        // 네 번째 사운드 - 포탄 폭발 에코
        setTimeout(() => {
            const osc4 = audioContext.createOscillator();
            const gain4 = audioContext.createGain();
            
            osc4.type = 'sine';
            osc4.frequency.setValueAtTime(100, audioContext.currentTime);
            osc4.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.6);
            
            gain4.gain.setValueAtTime(0.15, audioContext.currentTime);
            gain4.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);
            
            osc4.connect(gain4);
            gain4.connect(audioContext.destination);
            osc4.start(audioContext.currentTime);
            osc4.stop(audioContext.currentTime + 0.6);
        }, 300);
        
    } catch (error) {
        console.log('강타 총알 피격 사운드 재생 오류:', error);
    }
}

// 방어막 피격 이벤트 처리
function showShieldHitEffect(data) {
    // 1. 메인 방어막 원형 (더 크고 화려하게)
    const mainShieldCircle = gameScene.add.circle(data.x, data.y, 35, 0x00aaff, 0.8);
    mainShieldCircle.setStrokeStyle(5, 0x00ffff, 1);
    mainShieldCircle.setDepth(500);
    
    // 2. 내부 방어막 (작은 원형)
    const innerShieldCircle = gameScene.add.circle(data.x, data.y, 18, 0x00ffff, 0.6);
    innerShieldCircle.setStrokeStyle(3, 0xffffff, 1);
    innerShieldCircle.setDepth(501);
    
    // 3. 다중 충격파 링들
    const shockRings = [];
    for (let i = 0; i < 3; i++) {
        const ring = gameScene.add.circle(data.x, data.y, 15 + (i * 5), 0x000000, 0);
        ring.setStrokeStyle(4 - i, 0x00aaff + (i * 0x001100), 0.8 - (i * 0.2));
        ring.setDepth(502 + i);
        shockRings.push(ring);
    }
    
    // 4. 에너지 파편들 (더 많고 다양하게)
    const fragments = [];
    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const distance = 20 + Math.random() * 10;
        const fragmentX = data.x + Math.cos(angle) * distance;
        const fragmentY = data.y + Math.sin(angle) * distance;
        
        const fragment = gameScene.add.circle(fragmentX, fragmentY, 2 + Math.random() * 2, 0x00ffff);
        fragment.setStrokeStyle(1, 0xffffff, 1);
        fragment.setDepth(505);
        fragments.push(fragment);
    }
    
    // 5. 에너지 스파크들 (작은 번개 효과)
    const sparks = [];
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const distance = 25;
        const sparkX = data.x + Math.cos(angle) * distance;
        const sparkY = data.y + Math.sin(angle) * distance;
        
        const spark = gameScene.add.circle(sparkX, sparkY, 1, 0xffffff);
        spark.setDepth(506);
        sparks.push(spark);
    }
    
    // 6. "BLOCKED!" 텍스트 (더 화려하게)
    const blockedText = gameScene.add.text(data.x, data.y - 50, 'BLOCKED!', {
        fontSize: '22px',
        fill: '#00ffff',
        fontWeight: 'bold',
        stroke: '#000000',
        strokeThickness: 3
    }).setDepth(507);
    blockedText.setOrigin(0.5);
    
    // 7. 방어막 성공 표시 (SHIELD ACTIVE)
    const shieldActiveText = gameScene.add.text(data.x, data.y - 25, 'SHIELD ACTIVE', {
        fontSize: '14px',
        fill: '#ffffff',
        fontWeight: 'bold',
        stroke: '#0088ff',
        strokeThickness: 2
    }).setDepth(508);
    shieldActiveText.setOrigin(0.5);
    
    // 애니메이션 효과들
    
    // 1. 메인 방어막 원형 애니메이션
    gameScene.tweens.add({
        targets: mainShieldCircle,
        scaleX: 1.8,
        scaleY: 1.8,
        alpha: 0,
        duration: 800,
        ease: 'Power2',
        onComplete: () => {
            mainShieldCircle.destroy();
        }
    });
    
    // 2. 내부 방어막 애니메이션
    gameScene.tweens.add({
        targets: innerShieldCircle,
        scaleX: 2.2,
        scaleY: 2.2,
        alpha: 0,
        duration: 600,
        ease: 'Power2',
        onComplete: () => {
            innerShieldCircle.destroy();
        }
    });
    
    // 3. 다중 충격파 애니메이션
    shockRings.forEach((ring, index) => {
        gameScene.tweens.add({
            targets: ring,
            scaleX: 4 + index,
            scaleY: 4 + index,
            alpha: 0,
            duration: 1000 + (index * 200),
            ease: 'Power2',
            onComplete: () => {
                ring.destroy();
            }
        });
    });
    
    // 4. 파편 애니메이션 (더 화려하게)
    fragments.forEach((fragment, index) => {
        const angle = (index / fragments.length) * Math.PI * 2;
        const finalDistance = 40 + Math.random() * 20;
        const finalX = data.x + Math.cos(angle) * finalDistance;
        const finalY = data.y + Math.sin(angle) * finalDistance;
        
        gameScene.tweens.add({
            targets: fragment,
            x: finalX,
            y: finalY,
            scaleX: 0.2,
            scaleY: 0.2,
            alpha: 0,
            rotation: Math.PI * 2,
            duration: 600 + Math.random() * 300,
            ease: 'Power2',
            onComplete: () => {
                fragment.destroy();
            }
        });
    });
    
    // 5. 스파크 애니메이션
    sparks.forEach((spark, index) => {
        const angle = (index / sparks.length) * Math.PI * 2;
        const finalDistance = 50 + Math.random() * 15;
        const finalX = data.x + Math.cos(angle) * finalDistance;
        const finalY = data.y + Math.sin(angle) * finalDistance;
        
        gameScene.tweens.add({
            targets: spark,
            x: finalX,
            y: finalY,
            scaleX: 3,
            scaleY: 3,
            alpha: 0,
            duration: 400 + Math.random() * 200,
            ease: 'Power3',
            onComplete: () => {
                spark.destroy();
            }
        });
    });
    
    // 6. "BLOCKED!" 텍스트 애니메이션
    gameScene.tweens.add({
        targets: blockedText,
        y: data.y - 80,
        scaleX: 1.5,
        scaleY: 1.5,
        alpha: 0,
        duration: 1200,
        ease: 'Power2',
        onComplete: () => {
            blockedText.destroy();
        }
    });
    
    // 7. "SHIELD ACTIVE" 텍스트 애니메이션
    gameScene.tweens.add({
        targets: shieldActiveText,
        y: data.y - 55,
        scaleX: 1.2,
        scaleY: 1.2,
        alpha: 0,
        duration: 1000,
        ease: 'Power2',
        onComplete: () => {
            shieldActiveText.destroy();
        }
    });
    
    // 방어막 피격 사운드 재생
    playShieldHitSound();
    
    console.log(`방어막 피격! 공격자: ${data.attackerId}, 피격자: ${data.playerId} - 피해 차단됨!`);
}

// 방어막 스킬 활성화 사운드
function playShieldActivationSound() {
    if (!audioContext || !isSoundEnabled) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.2);
        oscillator.frequency.exponentialRampToValueAtTime(900, audioContext.currentTime + 0.4);
        
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.4);
    } catch (error) {
        console.log('방어막 스킬 활성화 사운드 재생 오류:', error);
    }
}

// 방어막 스킬 비활성화 사운드
function playShieldDeactivationSound() {
    if (!audioContext || !isSoundEnabled) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
        console.log('방어막 스킬 비활성화 사운드 재생 오류:', error);
    }
}

// 방어막 피격 사운드
function playShieldHitSound() {
    if (!audioContext || !isSoundEnabled) return;
    
    try {
        // 첫 번째 사운드 - 에너지 차단음
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(600, audioContext.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
        osc1.frequency.exponentialRampToValueAtTime(300, audioContext.currentTime + 0.2);
        
        gain1.gain.setValueAtTime(0.2, audioContext.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        osc1.start(audioContext.currentTime);
        osc1.stop(audioContext.currentTime + 0.2);
        
        // 두 번째 사운드 - 전자음 효과
        setTimeout(() => {
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(800, audioContext.currentTime);
            osc2.frequency.exponentialRampToValueAtTime(1600, audioContext.currentTime + 0.05);
            osc2.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.15);
            
            gain2.gain.setValueAtTime(0.15, audioContext.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
            
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);
            osc2.start(audioContext.currentTime);
            osc2.stop(audioContext.currentTime + 0.15);
        }, 50);
        
    } catch (error) {
        console.log('방어막 피격 사운드 재생 오류:', error);
    }
}



// 게임 시작
const game = new Phaser.Game(gameConfig);



// 창 크기 변경 처리
window.addEventListener('resize', () => {
    const newWidth = Math.floor(window.innerWidth * 0.9);
    const newHeight = Math.floor(window.innerHeight * 0.9);
    game.scale.resize(newWidth, newHeight);
}); 