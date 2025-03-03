let scene, camera, renderer, player, trench;
let lasers = [];
let enemies = [];
let score = 0;
let moveLeft = false;
let moveRight = false;
let moveUp = false;
let moveDown = false;
let time = 0;
let enemyLasers = [];
let explosions = [];
let cameraShake = {
    intensity: 0,
    decay: 0.9,
    maxOffset: 0.8,
    originalPos: { x: 0, y: 4, z: 12 },
    originalRot: { x: -0.15, y: 0, z: 0 },
    currentPos: { x: 0, y: 4, z: 12 },
    currentRot: { x: -0.15, y: 0, z: 0 },
    smoothness: 0.35
};
let playerExploding = false;
let playerRespawnTimer = 0;
let playerHealth = 100;
let invulnerableTime = 0;
let jetStreams = [];
let gameActive = true;
let shotsFired = 0;
let shotsHit = 0;
let tiesFightersDestroyed = 0;
let gameStartTime = Date.now();
let joystick = null;
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let gameStarted = false;
let shieldActive = false;
let shieldTime = 0;
let shieldPowerups = [];
let shieldMesh = null;
let shieldBarContainer = null;
let shieldBarFill = null;
let shieldEffect = null;  // To store reference to the shield effect mesh
const SHIELD_DURATION = 1200; // 20 seconds at 60fps
let weaponUpgradeActive = false;
let weaponUpgradeTime = 0;
let weaponPowerups = [];
let weaponBarContainer = null;
let weaponBarFill = null;
const WEAPON_UPGRADE_DURATION = 1500; // 25 seconds at 60fps
let weaponLevel = 1; // Base level is 1 beam, each upgrade adds 1
let healthPowerups = [];
let difficultyLevel = 1;
let timeSinceStart = 0;
const DIFFICULTY_INCREASE_INTERVAL = 3600; // Increase difficulty every minute (60fps * 60s)
const MAX_DIFFICULTY = 5;
const BASE_SPAWN_RATE = 0.01;
const TILT_ANGLE = Math.PI / 6; // 30 degrees max tilt
const TILT_SPEED = 0.1; // How fast the ship tilts
let targetTiltX = 0; // Target roll (left/right tilt)
let targetTiltZ = 0; // Target pitch (up/down tilt)
let currentTiltX = 0;
let currentTiltZ = 0;

function init() {
    // Create start screen handler
    document.getElementById('startButton').addEventListener('click', startGame);
}

function startGame() {
    if (gameStarted) return;
    gameStarted = true;

    // Remove start screen
    const startScreen = document.getElementById('startScreen');
    startScreen.style.display = 'none';

    // Request full screen on mobile
    if (isMobile) {
        requestFullScreen(document.documentElement);
    }

    // Initialize game
    setupGame();
}

function setupGame() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 4;
    camera.position.z = 12;
    camera.rotation.x = -0.15;
    
    // Create renderer (original version)
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    // Create player
    player = createPlayer();
    player.position.y = 2;
    scene.add(player);
    
    // Add shield mesh to player
    shieldMesh = createPlayerShield();
    player.add(shieldMesh);
    
    // Create trench
    createTrench();
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 1, 0);
    scene.add(directionalLight);
    
    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', onWindowResize, false);

    // Setup mobile controls
    setupMobileControls();

    // Reset game variables
    score = 0;
    playerHealth = 100;
    gameActive = true;
    shotsFired = 0;
    shotsHit = 0;
    tiesFightersDestroyed = 0;
    gameStartTime = Date.now();

    // Start game loop
    animate();
}

function createTrench() {
    trench = new THREE.Group();

    // Grid shader material with time uniform
    const gridMaterial = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(0xaaaaaa) },
            time: { value: 0 },
            isWall: { value: 0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform float time;
            uniform float isWall;
            varying vec2 vUv;
            void main() {
                float gridSize = 0.2;
                float lineWidth = 0.008;
                float baseSpeed = 0.2;
                
                vec2 uv = vUv;
                if (isWall > 0.5) {
                    uv.x *= 2.0;
                    uv = vec2(uv.y, uv.x);
                    // Offset to align with floor grid
                    uv += 0.5;
                    uv.y -= time * (baseSpeed * 2.0);
                } else {
                    uv.x *= 1.0;
                    // Offset to align with wall grid
                    uv += 0.5;
                    uv.y += time * baseSpeed;
                }
                
                vec2 coord = uv / gridSize;
                vec2 grid = abs(fract(coord - 0.5) - 0.5);
                float line = step(0.5 - lineWidth, max(grid.x, grid.y));
                
                gl_FragColor = vec4(color, line * 0.6);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide
    });

    // Create longer floor
    const floorGeometry = new THREE.PlaneGeometry(20, 300);
    const floorMaterial = gridMaterial.clone();
    floorMaterial.uniforms.isWall = { value: 0 };
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -150;
    trench.add(floor);

    // Create longer walls
    const wallGeometry = new THREE.PlaneGeometry(300, 10);
    const leftWallMaterial = gridMaterial.clone();
    leftWallMaterial.uniforms.isWall = { value: 1 };
    const leftWall = new THREE.Mesh(wallGeometry, leftWallMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.rotation.z = Math.PI;
    leftWall.position.x = -10;
    leftWall.position.y = 5;
    leftWall.position.z = -150;
    trench.add(leftWall);

    // Right wall
    const rightWallMaterial = gridMaterial.clone();
    rightWallMaterial.uniforms.isWall = { value: 1 };
    const rightWall = new THREE.Mesh(wallGeometry, rightWallMaterial);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.x = 10;
    rightWall.position.y = 5;
    rightWall.position.z = -150;
    trench.add(rightWall);

    scene.add(trench);
}

function handleKeyDown(event) {
    switch(event.key) {
        case 'ArrowLeft':
            moveLeft = true;
            break;
        case 'ArrowRight':
            moveRight = true;
            break;
        case 'ArrowUp':
            moveUp = true;
            break;
        case 'ArrowDown':
            moveDown = true;
            break;
        case ' ':
            shootLaser();
            break;
    }
}

function handleKeyUp(event) {
    switch(event.key) {
        case 'ArrowLeft':
            moveLeft = false;
            break;
        case 'ArrowRight':
            moveRight = false;
            break;
        case 'ArrowUp':
            moveUp = false;
            break;
        case 'ArrowDown':
            moveDown = false;
            break;
    }
}

function shootLaser() {
    if (!gameActive) return;
    
    shotsFired++;
    
    const createSingleLaser = (xOffset) => {
        // Always use green color, just vary the size based on upgrade
        const laserGeometry = weaponUpgradeActive ? 
            new THREE.BoxGeometry(0.3, 0.3, 5.0) :  // Slightly larger when upgraded
            new THREE.BoxGeometry(0.2, 0.2, 4.0);
        
        const laserMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00,  // Always green
            transparent: weaponUpgradeActive,
            opacity: weaponUpgradeActive ? 0.9 : 1
        });
        
        const laser = new THREE.Mesh(laserGeometry, laserMaterial);
        laser.position.copy(player.position);
        laser.position.x += xOffset;
        laser.position.z -= weaponUpgradeActive ? 2.5 : 2;
        laser.userData.upgraded = weaponUpgradeActive;
        lasers.push(laser);
        scene.add(laser);
    };

    // Calculate offsets based on weapon level with wider spacing
    switch(weaponLevel) {
        case 1:
            createSingleLaser(0); // Single center beam
            break;
        case 2:
            createSingleLaser(-0.75); // Left beam (wider gap)
            createSingleLaser(0.75);  // Right beam
            break;
        case 3:
            createSingleLaser(-1.5);   // Left beam
            createSingleLaser(0);      // Center beam
            createSingleLaser(1.5);    // Right beam
            break;
        case 4:
            createSingleLaser(-2.25);  // Far left beam
            createSingleLaser(-0.75);  // Inner left beam
            createSingleLaser(0.75);   // Inner right beam
            createSingleLaser(2.25);   // Far right beam
            break;
    }
}

function createPlayer() {
    const group = new THREE.Group();
    const mainColor = 0xDDDDDD;  // Light gray like in reference
    const accentColor = 0xCC0000; // Red accent color for wingtips

    // Main fuselage (thinner and longer)
    const fuselageGeometry = new THREE.BoxGeometry(0.25, 0.15, 2.0);
    const fuselageMaterial = new THREE.MeshBasicMaterial({ color: mainColor });
    const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
    group.add(fuselage);

    // Create wings
    function createWings() {
        // Wing dimensions based on reference
        const wingLength = 1.4;
        const wingWidth = 0.2;
        const wingThickness = 0.03;
        const engineSize = 0.12;
        const engineLength = 0.5;

        const wingGeometry = new THREE.BoxGeometry(wingLength, wingThickness, wingWidth);
        const wingMaterial = new THREE.MeshBasicMaterial({ color: mainColor });
        
        // Create the four wings in X configuration
        const wingConfigs = [
            { x: 0.5, y: 0.1, z: 0.4, angle: Math.PI / 12 },   // Right top
            { x: 0.5, y: -0.1, z: 0.4, angle: -Math.PI / 12 }, // Right bottom
            { x: -0.5, y: 0.1, z: 0.4, angle: -Math.PI / 12 }, // Left top
            { x: -0.5, y: -0.1, z: 0.4, angle: Math.PI / 12 }  // Left bottom
        ];

        // Update engine glow with stronger effect
        const engineGlowGeometry = new THREE.CircleGeometry(engineSize * 1.2, 8);
        const engineGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0x33ffff,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide  // Make glow visible from both sides
        });

        wingConfigs.forEach(config => {
            const wing = new THREE.Mesh(wingGeometry, wingMaterial);
            wing.position.set(config.x, config.y, config.z);
            wing.rotation.z = config.angle;

            // Add engine
            const engineGeometry = new THREE.CylinderGeometry(engineSize, engineSize, engineLength, 8);
            const engineMaterial = new THREE.MeshBasicMaterial({ color: 0x444444 });
            const engine = new THREE.Mesh(engineGeometry, engineMaterial);
            
            engine.position.x = 0;
            engine.position.z = 0.3;
            engine.rotation.x = Math.PI/2;
            wing.add(engine);

            // Create engine glow container to handle rotation independently
            const glowContainer = new THREE.Object3D();
            glowContainer.position.copy(engine.position);
            glowContainer.position.z += engineLength/2 + 0.01; // Position just behind engine
            wing.add(glowContainer);

            // Add main engine glow
            const glow = new THREE.Mesh(engineGlowGeometry, engineGlowMaterial);
            glow.rotation.y = Math.PI; // Face backward
            glowContainer.add(glow);

            // Add inner glow for more intensity
            const innerGlowGeometry = new THREE.CircleGeometry(engineSize * 0.7, 8);
            const innerGlowMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide
            });
            const innerGlow = new THREE.Mesh(innerGlowGeometry, innerGlowMaterial);
            innerGlow.position.z = -0.01; // Slightly in front of main glow
            innerGlow.rotation.y = Math.PI;
            glowContainer.add(innerGlow);

            // Add laser cannon
            const cannonGeometry = new THREE.BoxGeometry(0.3, 0.04, 0.04);
            const cannon = new THREE.Mesh(cannonGeometry, engineMaterial);
            cannon.position.x = wingLength/2 - 0.3;
            cannon.position.z = -0.1;
            wing.add(cannon);

            group.add(wing);

            // After creating the engine
            const jetStream = createJetStream(
                new THREE.Vector3(
                    engine.position.x,
                    engine.position.y,
                    engine.position.z + engineLength
                ),
                wing  // Pass the wing instead of engine to get proper world position
            );
            jetStreams.push(jetStream);
        });
    }

    // Nose section (more pointed like reference)
    const noseGeometry = new THREE.ConeGeometry(0.12, 0.5, 8);
    const nose = new THREE.Mesh(noseGeometry, fuselageMaterial);
    nose.rotation.x = -Math.PI/2;
    nose.position.z = -1.2;
    group.add(nose);

    // Cockpit (more angular)
    const cockpitGeometry = new THREE.BoxGeometry(0.2, 0.1, 0.4);
    const cockpitMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.y = 0.12;
    cockpit.position.z = 0.2;  // Changed from -0.5 to 0.2 to move cockpit back
    group.add(cockpit);

    // Add wing assembly
    createWings();

    return group;
}

function createTieFighter() {
    const group = new THREE.Group();

    // Create the center sphere (cockpit)
    const cockpitGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const cockpitMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xDDDDDD,
        transparent: false
    });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    group.add(cockpit);

    // Create the hexagonal wings
    const wingGeometry = new THREE.CircleGeometry(1, 6);
    const wingMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xDDDDDD,
        side: THREE.DoubleSide,
        transparent: false
    });
    
    // Left Wing
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
    leftWing.position.x = -0.7;
    leftWing.rotation.y = Math.PI / 2;
    group.add(leftWing);
    
    // Right Wing
    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
    rightWing.position.x = 0.7;
    rightWing.rotation.y = Math.PI / 2;
    group.add(rightWing);

    // Add simple struts
    const strutGeometry = new THREE.BoxGeometry(0.4, 0.1, 0.1);
    const strutMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xDDDDDD,
        transparent: false
    });
    
    const leftStrut = new THREE.Mesh(strutGeometry, strutMaterial);
    leftStrut.position.x = -0.35;
    group.add(leftStrut);
    
    const rightStrut = new THREE.Mesh(strutGeometry, strutMaterial);
    rightStrut.position.x = 0.35;
    group.add(rightStrut);

    return group;
}

function enemyShoot(enemy) {
    const laserGeometry = new THREE.BoxGeometry(0.2, 0.2, 4.0);  // Increased from 2.5 to 4.0
    const laserMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const laser = new THREE.Mesh(laserGeometry, laserMaterial);
    laser.position.copy(enemy.position);
    laser.position.z += 2;  // Adjusted to account for longer laser
    enemyLasers.push(laser);
    scene.add(laser);
}

function spawnEnemy() {
    const enemy = createTieFighter();
    enemy.rotation.y = Math.PI;
    enemy.position.x = Math.random() * 16 - 8;
    enemy.position.y = Math.random() * 6 + 1;
    enemy.position.z = -180;  // Spawn much further back
    enemies.push(enemy);
    scene.add(enemy);
}

function createExplosion(position) {
    // Create spark particles
    const particleCount = 30;  // More particles
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];
    
    // Create particles in a sphere
    for (let i = 0; i < particleCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const r = 0.2;  // Larger initial radius
        
        positions.push(
            position.x + r * Math.sin(phi) * Math.cos(theta),
            position.y + r * Math.sin(phi) * Math.sin(theta),
            position.z + r * Math.cos(phi)
        );
        
        velocities.push(
            (Math.random() - 0.5) * 0.5,  // Faster particle spread
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5
        );
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    const sparkMaterial = new THREE.PointsMaterial({
        color: 0xffaa44,  // More orange color for sparks
        size: 0.3,        // Larger particles
        transparent: true
    });
    
    const sparks = new THREE.Points(geometry, sparkMaterial);
    sparks.velocities = velocities;
    sparks.life = 1.0;
    
    // Create expanding fire sphere
    const fireGeometry = new THREE.SphereGeometry(0.3, 16, 16);  // Larger initial size
    const fireMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,  // White core
        transparent: true,
        opacity: 0.9
    });
    const fire = new THREE.Mesh(fireGeometry, fireMaterial);
    fire.position.copy(position);
    fire.scale.set(1, 1, 1);
    fire.life = 1.0;
    
    // Add outer fire glow
    const outerFireGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    const outerFireMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6600,  // Orange outer glow
        transparent: true,
        opacity: 0.7
    });
    const outerFire = new THREE.Mesh(outerFireGeometry, outerFireMaterial);
    outerFire.position.copy(position);
    outerFire.scale.set(1, 1, 1);
    outerFire.life = 1.0;
    
    scene.add(sparks);
    scene.add(fire);
    scene.add(outerFire);
    explosions.push({ sparks, fire, outerFire });
}

function updateExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i];
        const { sparks, fire, outerFire } = explosion;
        
        // Update spark particles
        const positions = sparks.geometry.attributes.position.array;
        for (let j = 0; j < positions.length; j += 3) {
            positions[j] += sparks.velocities[j];
            positions[j + 1] += sparks.velocities[j + 1];
            positions[j + 2] += sparks.velocities[j + 2];
        }
        sparks.geometry.attributes.position.needsUpdate = true;
        
        // Update fire spheres
        const scale = 1 + (1 - fire.life) * 4;  // Larger expansion
        fire.scale.set(scale, scale, scale);
        outerFire.scale.set(scale * 1.5, scale * 1.5, scale * 1.5);  // Outer fire expands more
        
        // Fade out effects
        sparks.life -= 0.02;
        fire.life -= 0.04;
        outerFire.life -= 0.04;
        
        sparks.material.opacity = sparks.life;
        fire.material.opacity = fire.life * 0.9;
        outerFire.material.opacity = outerFire.life * 0.7;
        
        // Remove when effects are fully faded
        if (sparks.life <= 0 || fire.life <= 0) {
            scene.remove(sparks);
            scene.remove(fire);
            scene.remove(outerFire);
            explosions.splice(i, 1);
        }
    }
}

function checkCollision(obj1, obj2) {
    const distance = obj1.position.distanceTo(obj2.position);
    return distance < 2.0; // Increased from 1.5 to 2.0 for more forgiving hit detection
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function shakeCamera() {
    cameraShake.intensity = 3.0;
}

function updateCameraShake() {
    if (cameraShake.intensity > 0) {
        const shake = cameraShake.intensity * cameraShake.intensity;
        
        // Calculate target position with shake
        const targetPos = {
            x: cameraShake.originalPos.x + (Math.random() - 0.5) * shake * cameraShake.maxOffset,
            y: cameraShake.originalPos.y + (Math.random() - 0.5) * shake * cameraShake.maxOffset,
            z: cameraShake.originalPos.z + (Math.random() - 0.5) * shake * cameraShake.maxOffset
        };
        
        // Increased rotation shake values from 0.08 to 0.12
        const targetRot = {
            x: cameraShake.originalRot.x + (Math.random() - 0.5) * shake * 0.12,
            y: (Math.random() - 0.5) * shake * 0.12,
            z: (Math.random() - 0.5) * shake * 0.12
        };
        
        // Smoothly interpolate current position and rotation to target
        cameraShake.currentPos.x += (targetPos.x - cameraShake.currentPos.x) * cameraShake.smoothness;
        cameraShake.currentPos.y += (targetPos.y - cameraShake.currentPos.y) * cameraShake.smoothness;
        cameraShake.currentPos.z += (targetPos.z - cameraShake.currentPos.z) * cameraShake.smoothness;
        
        cameraShake.currentRot.x += (targetRot.x - cameraShake.currentRot.x) * cameraShake.smoothness;
        cameraShake.currentRot.y += (targetRot.y - cameraShake.currentRot.y) * cameraShake.smoothness;
        cameraShake.currentRot.z += (targetRot.z - cameraShake.currentRot.z) * cameraShake.smoothness;
        
        // Apply smoothed values to camera
        camera.position.set(
            cameraShake.currentPos.x,
            cameraShake.currentPos.y,
            cameraShake.currentPos.z
        );
        
        camera.rotation.set(
            cameraShake.currentRot.x,
            cameraShake.currentRot.y,
            cameraShake.currentRot.z
        );
        
        // Decay the shake intensity
        cameraShake.intensity *= cameraShake.decay;
        
        // Reset when shake is very small
        if (cameraShake.intensity < 0.01) {
            cameraShake.intensity = 0;
            // Smoothly return to original position
            cameraShake.currentPos = { ...cameraShake.originalPos };
            cameraShake.currentRot = { ...cameraShake.originalRot };
        }
    } else {
        // Continue smooth transition to original position even after shake ends
        cameraShake.currentPos.x += (cameraShake.originalPos.x - cameraShake.currentPos.x) * cameraShake.smoothness;
        cameraShake.currentPos.y += (cameraShake.originalPos.y - cameraShake.currentPos.y) * cameraShake.smoothness;
        cameraShake.currentPos.z += (cameraShake.originalPos.z - cameraShake.currentPos.z) * cameraShake.smoothness;
        
        cameraShake.currentRot.x += (cameraShake.originalRot.x - cameraShake.currentRot.x) * cameraShake.smoothness;
        cameraShake.currentRot.y += (cameraShake.originalRot.y - cameraShake.currentRot.y) * cameraShake.smoothness;
        cameraShake.currentRot.z += (cameraShake.originalRot.z - cameraShake.currentRot.z) * cameraShake.smoothness;
        
        camera.position.set(
            cameraShake.currentPos.x,
            cameraShake.currentPos.y,
            cameraShake.currentPos.z
        );
        
        camera.rotation.set(
            cameraShake.currentRot.x,
            cameraShake.currentRot.y,
            cameraShake.currentRot.z
        );
    }
}

function playerHit(damage = 20) {
    if (shieldActive) {
        // Shield absorbs the hit
        createExplosion(player.position.clone());
        shakeCamera();
        return;
    }
    
    if (invulnerableTime <= 0) {
        playerHealth = Math.max(0, playerHealth - damage);
        updateHealthBar();
        createExplosion(player.position.clone());
        shakeCamera();
        
        // Add brief invulnerability
        invulnerableTime = 60;
        
        // Flash player to indicate damage
        flashPlayer();
        
        // Immediately check for game over
        if (playerHealth <= 0) {
            playerHealth = 0; // Ensure health is exactly 0
            updateHealthBar(); // Update the health bar one last time
            gameOver();
            return;
        }
    }
}

function updateHealthBar() {
    const healthFill = document.getElementById('health-fill');
    healthFill.style.width = `${playerHealth}%`;
    
    // Change color based on health
    if (playerHealth > 60) {
        healthFill.style.background = '#00ff00';  // Green
    } else if (playerHealth > 30) {
        healthFill.style.background = '#ffff00';  // Yellow
    } else {
        healthFill.style.background = '#ff0000';  // Red
    }
}

function flashPlayer() {
    player.material.color.setHex(0xff0000);  // Flash red
    setTimeout(() => {
        player.material.color.setHex(0x888888);  // Return to normal color
    }, 100);
}

function gameOver() {
    gameActive = false;
    createGameOverScreen();
}

function updatePlayer() {
    // Check for game over condition first
    if (playerHealth <= 0 && gameActive) {
        gameOver();
        return;
    }

    // Update invulnerability timer
    if (invulnerableTime > 0) {
        invulnerableTime--;
        // Make player flash while invulnerable
        player.visible = (invulnerableTime % 4 < 2);
    } else {
        player.visible = true;
    }

    // Update movement and tilting
    if (gameActive) {
        const speed = 0.15;
        
        // Reset target tilts
        targetTiltZ = 0;
        targetTiltX = 0;

        // Update position and set target tilts
        if (moveLeft && player.position.x > -8) {
            player.position.x -= speed;
            targetTiltZ = TILT_ANGLE; // Tilt left
        }
        if (moveRight && player.position.x < 8) {
            player.position.x += speed;
            targetTiltZ = -TILT_ANGLE; // Tilt right
        }
        if (moveUp && player.position.y < 7) {
            player.position.y += speed;
            targetTiltX = -TILT_ANGLE / 2; // Tilt up (less extreme)
        }
        if (moveDown && player.position.y > 0) {
            player.position.y -= speed;
            targetTiltX = TILT_ANGLE / 2; // Tilt down (less extreme)
        }

        // Smoothly interpolate current tilt to target tilt
        currentTiltZ += (targetTiltZ - currentTiltZ) * TILT_SPEED;
        currentTiltX += (targetTiltX - currentTiltX) * TILT_SPEED;

        // Apply rotation to the entire player group
        player.rotation.set(currentTiltX, 0, currentTiltZ);

        // Add slight auto-centering when not moving
        if (!moveLeft && !moveRight) {
            currentTiltZ *= 0.95;
        }
        if (!moveUp && !moveDown) {
            currentTiltX *= 0.95;
        }
    }

    // Update shield
    if (shieldActive) {
        shieldTime--;
        shieldEffect.material.uniforms.time.value += 0.016;
        updateShieldBar();
        
        if (shieldTime <= 0) {
            shieldActive = false;
            shieldEffect.visible = false;
            shieldBarContainer.visible = false;
        }
    }

    // Update weapon upgrade
    if (weaponUpgradeActive) {
        weaponUpgradeTime--;
        if (weaponUpgradeTime <= 0) {
            weaponUpgradeActive = false;
            weaponLevel = 1; // Reset to base level when upgrade expires
        }
    }
}

function updateGameObjects() {
    if (!gameActive) return;  // Don't update if game is over
    
    // Update game time and difficulty
    timeSinceStart++;
    if (timeSinceStart % DIFFICULTY_INCREASE_INTERVAL === 0) {
        difficultyLevel = Math.min(difficultyLevel + 1, MAX_DIFFICULTY);
    }
    
    // Calculate current spawn rate based on difficulty
    const currentSpawnRate = BASE_SPAWN_RATE * (1 + (difficultyLevel - 1) * 0.3);
    
    // Update player lasers
    for(let i = lasers.length - 1; i >= 0; i--) {
        lasers[i].position.z -= 2;
        if(lasers[i].position.z < -200) {
            scene.remove(lasers[i]);
            lasers.splice(i, 1);
        }
    }

    // Update enemy lasers
    for(let i = enemyLasers.length - 1; i >= 0; i--) {
        enemyLasers[i].position.z += 2;
        if(enemyLasers[i].position.z > 10) {
            scene.remove(enemyLasers[i]);
            enemyLasers.splice(i, 1);
        }
        
        // Check collision with player
        if(checkCollision(enemyLasers[i], player)) {
            playerHit(15);  // Laser does 15 damage
            scene.remove(enemyLasers[i]);
            enemyLasers.splice(i, 1);
            continue;
        }
    }
    
    // Update enemies with scaled spawn rate
    if(Math.random() < currentSpawnRate) {
        spawnEnemy();
    }
    
    for(let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].position.z += 0.56;  // Reduced from 0.7 to 0.56 (20% slower)
        
        // Random chance to shoot when in range (increased from 0.01 to 0.015)
        if(enemies[i].position.z > -100 && Math.random() < 0.015) {
            enemyShoot(enemies[i]);
        }

        if(enemies[i].position.z > 10) {
            scene.remove(enemies[i]);
            enemies.splice(i, 1);
            continue;
        }
        
        // Check collision with player
        if(checkCollision(enemies[i], player)) {
            if (shieldActive) {
                // If shielded, destroy the TIE fighter and count it as a kill
                createExplosion(enemies[i].position.clone());
                scene.remove(enemies[i]);
                enemies.splice(i, 1);
                score += 100;
                tiesFightersDestroyed++;
                document.getElementById('scoreValue').textContent = score;
                shakeCamera();
                continue;
            } else {
                // Normal collision damage when not shielded
                playerHit(35);  // Collision does 35 damage
                createExplosion(enemies[i].position.clone());
                scene.remove(enemies[i]);
                enemies.splice(i, 1);
                continue;
            }
        }

        // Add back laser hit detection
        for(let j = lasers.length - 1; j >= 0; j--) {
            if(checkCollision(enemies[i], lasers[j])) {
                createExplosion(enemies[i].position.clone());
                scene.remove(enemies[i]);
                scene.remove(lasers[j]);
                enemies.splice(i, 1);
                lasers.splice(j, 1);
                score += 100;
                shotsHit++;  // Track successful hits
                tiesFightersDestroyed++;  // Track destroyed fighters
                document.getElementById('scoreValue').textContent = score;
                break;
            }
        }
    }

    // Spawn shield powerups occasionally (reduced frequency)
    if (Math.random() < 0.0006) { // Reduced from 0.0012 to 0.0006 (50% less frequent)
        const shieldPowerup = createShieldPowerup();
        shieldPowerups.push(shieldPowerup);
        scene.add(shieldPowerup);
    }
    
    // Update shield powerups
    for (let i = shieldPowerups.length - 1; i >= 0; i--) {
        shieldPowerups[i].position.z += 0.56;
        shieldPowerups[i].rotation.y += shieldPowerups[i].userData.rotationSpeed;
        
        // Update glow effect
        shieldPowerups[i].userData.time += 0.016;
        shieldPowerups[i].userData.glowMaterial.uniforms.time.value = shieldPowerups[i].userData.time;
        
        // Remove if too far
        if (shieldPowerups[i].position.z > 10) {
            scene.remove(shieldPowerups[i]);
            shieldPowerups.splice(i, 1);
            continue;
        }
        
        // Check collision with player using more forgiving check
        if (checkPowerupCollision(shieldPowerups[i], player)) {
            createPickupAnimation(shieldPowerups[i].position.clone(), 0x00ffff); // Cyan color for shield
            activateShield();
            scene.remove(shieldPowerups[i]);
            shieldPowerups.splice(i, 1);
        }
    }

    // Spawn weapon powerups occasionally (reduced frequency)
    if (Math.random() < 0.0006) { // Reduced from 0.0012 to 0.0006 (50% less frequent)
        const weaponPowerup = createWeaponPowerup();
        weaponPowerups.push(weaponPowerup);
        scene.add(weaponPowerup);
    }
    
    // Update weapon powerups
    for (let i = weaponPowerups.length - 1; i >= 0; i--) {
        weaponPowerups[i].position.z += 0.56;
        weaponPowerups[i].rotation.y += weaponPowerups[i].userData.rotationSpeed;
        
        // Update glow effect
        weaponPowerups[i].userData.time += 0.016;
        weaponPowerups[i].userData.glowMaterial.uniforms.time.value = weaponPowerups[i].userData.time;
        
        // Remove if too far
        if (weaponPowerups[i].position.z > 10) {
            scene.remove(weaponPowerups[i]);
            weaponPowerups.splice(i, 1);
            continue;
        }
        
        // Check collision with player using more forgiving check
        if (checkPowerupCollision(weaponPowerups[i], player)) {
            createPickupAnimation(weaponPowerups[i].position.clone(), 0xff0000); // Red color for weapon
            activateWeaponUpgrade();
            scene.remove(weaponPowerups[i]);
            weaponPowerups.splice(i, 1);
        }
    }

    // Spawn health powerups occasionally (same rate as other powerups)
    if (Math.random() < 0.0006) {
        const healthPowerup = createHealthPowerup();
        healthPowerups.push(healthPowerup);
        scene.add(healthPowerup);
    }
    
    // Update health powerups
    for (let i = healthPowerups.length - 1; i >= 0; i--) {
        healthPowerups[i].position.z += 0.56;
        healthPowerups[i].rotation.y += healthPowerups[i].userData.rotationSpeed;
        
        // Update glow effect
        healthPowerups[i].userData.time += 0.016;
        healthPowerups[i].userData.glowMaterial.uniforms.time.value = healthPowerups[i].userData.time;
        
        // Remove if too far
        if (healthPowerups[i].position.z > 10) {
            scene.remove(healthPowerups[i]);
            healthPowerups.splice(i, 1);
            continue;
        }
        
        // Check collision with player
        if (checkPowerupCollision(healthPowerups[i], player)) {
            createPickupAnimation(healthPowerups[i].position.clone(), 0xff3366); // Pink color for health
            activateHealthPowerup();
            scene.remove(healthPowerups[i]);
            healthPowerups.splice(i, 1);
        }
    }
}

function createJetStream(position, parentObject) {
    const particleCount = 30;  // Increased particle count for longer trails
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const opacities = new Float32Array(particleCount);
    
    // Initialize all particles
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = position.x;
        positions[i * 3 + 1] = position.y;
        positions[i * 3 + 2] = position.z;
        opacities[i] = 0;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));
    
    const material = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(0x33ffff) }
        },
        vertexShader: `
            attribute float opacity;
            varying float vOpacity;
            void main() {
                vOpacity = opacity;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = 2.0;  // Smaller points for more stream-like effect
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            varying float vOpacity;
            void main() {
                gl_FragColor = vec4(color, vOpacity);
            }
        `,
        transparent: true,
        depthWrite: false
    });
    
    const points = new THREE.Points(geometry, material);
    scene.add(points);
    
    return {
        points,
        parentObject,
        update: function() {
            const positions = this.points.geometry.attributes.position.array;
            const opacities = this.points.geometry.attributes.opacity.array;
            
            // Get world position of the engine
            const worldPos = new THREE.Vector3();
            parentObject.getWorldPosition(worldPos);
            
            // Move all particles back (along Z axis only)
            for (let i = particleCount - 1; i >= 1; i--) {
                // Keep X and Y positions the same as the previous particle
                positions[i * 3] = positions[(i - 1) * 3];
                positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
                // Move back along Z axis
                positions[i * 3 + 2] = positions[(i - 1) * 3 + 2] + 0.2; // Increased spacing
                opacities[i] = opacities[i - 1] * 0.95;
            }
            
            // Add new particle at engine position
            positions[0] = worldPos.x;
            positions[1] = worldPos.y;
            positions[2] = worldPos.z + 0.5; // Start slightly behind engine
            opacities[0] = 0.6; // Reduced initial opacity for subtler effect
            
            this.points.geometry.attributes.position.needsUpdate = true;
            this.points.geometry.attributes.opacity.needsUpdate = true;
        }
    };
}

function animate() {
    requestAnimationFrame(animate);
    
    // Update time for grid animation
    time += 0.01;
    if (trench) {
        trench.children.forEach(child => {
            if (child.material && child.material.uniforms) {
                child.material.uniforms.time.value = time;
            }
        });
    }
    
    // Update jet streams
    jetStreams.forEach(stream => stream.update());
    
    updatePlayer();
    updateCameraShake();
    updateExplosions();
    updateGameObjects();
    
    renderer.render(scene, camera);
}

function createGameOverScreen() {
    const overlay = document.createElement('div');
    overlay.id = 'gameOverOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-family: 'Arial', sans-serif;
        z-index: 1000;
    `;

    const gameTimeMs = Date.now() - gameStartTime;
    const seconds = Math.floor(gameTimeMs / 1000);
    const milliseconds = gameTimeMs % 1000;
    const timeString = `${seconds}.${milliseconds.toString().padStart(3, '0')}`;
    const accuracy = shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 100) : 0;

    overlay.innerHTML = `
        <h1 style="font-size: 48px; margin-bottom: 20px;">GAME OVER</h1>
        <div style="font-size: 24px; margin-bottom: 40px; text-align: center;">
            <p>Score: ${score}</p>
            <p>Time Survived: ${timeString} seconds</p>
            <p>TIE Fighters Destroyed: ${tiesFightersDestroyed}</p>
            <p>Accuracy: ${accuracy}%</p>
        </div>
        <button id="restartButton" style="
            padding: 15px 30px;
            font-size: 20px;
            background: #ff0000;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            transition: background 0.3s;
        ">Restart Game</button>
    `;

    document.body.appendChild(overlay);

    // Add hover effect to button
    const button = document.getElementById('restartButton');
    button.addEventListener('mouseover', () => button.style.background = '#cc0000');
    button.addEventListener('mouseout', () => button.style.background = '#ff0000');
    button.addEventListener('click', restartGame);
}

function restartGame() {
    // Remove game over screen
    const overlay = document.getElementById('gameOverOverlay');
    if (overlay) {
        document.body.removeChild(overlay);
    }
    
    // Reset game variables
    score = 0;
    playerHealth = 100;
    gameActive = true;
    shotsFired = 0;
    shotsHit = 0;
    tiesFightersDestroyed = 0;
    gameStartTime = Date.now();
    
    // Reset player position
    player.position.set(0, 2, 0);
    
    // Clear all existing enemies and lasers
    enemies.forEach(enemy => scene.remove(enemy));
    enemies = [];
    lasers.forEach(laser => scene.remove(laser));
    lasers = [];
    enemyLasers.forEach(laser => scene.remove(laser));
    enemyLasers = [];
    
    // Reset UI
    document.getElementById('scoreValue').textContent = '0';
    updateHealthBar();

    shieldActive = false;
    shieldTime = 0;
    if (shieldEffect) shieldEffect.visible = false;
    if (shieldBarContainer) shieldBarContainer.visible = false;
    
    // Remove the HTML shield bar references
    const shieldBar = document.getElementById('shield-bar');
    if (shieldBar) {
        shieldBar.remove();
    }
    
    // Clear shield powerups
    shieldPowerups.forEach(powerup => scene.remove(powerup));
    shieldPowerups = [];

    weaponUpgradeActive = false;
    weaponUpgradeTime = 0;
    weaponLevel = 1; // Reset weapon level
    
    // Clear weapon powerups
    weaponPowerups.forEach(powerup => scene.remove(powerup));
    weaponPowerups = [];

    // Clear health powerups
    healthPowerups.forEach(powerup => scene.remove(powerup));
    healthPowerups = [];

    // Reset difficulty
    difficultyLevel = 1;
    timeSinceStart = 0;

    // Reset tilts and player rotation
    currentTiltX = 0;
    currentTiltZ = 0;
    targetTiltX = 0;
    targetTiltZ = 0;
    player.rotation.set(0, 0, 0);
}

// Start the game
init(); 

function setupMobileControls() {
    if (!isMobile) return;

    // Make controls visible
    const joystickZone = document.getElementById('joystickZone');
    const fireButton = document.getElementById('fireButton');
    
    // Force display block for mobile controls
    joystickZone.style.display = 'block';
    fireButton.style.display = 'block';

    // Setup joystick with fixed position
    joystick = nipplejs.create({
        zone: joystickZone,
        mode: 'static',
        position: { 
            left: '100px', 
            bottom: '100px' 
        },
        color: 'white',
        size: 120,
        multitouch: true,
        dynamicPage: true
    });

    // Joystick move handler with improved sensitivity
    joystick.on('move', (evt, data) => {
        const forward = data.vector.y;
        const side = data.vector.x;

        // Reset all movement flags
        moveUp = moveDown = moveLeft = moveRight = false;

        // More sensitive movement thresholds
        if (forward > 0.3) moveUp = true;
        if (forward < -0.3) moveDown = true;
        if (side < -0.3) moveLeft = true;
        if (side > 0.3) moveRight = true;
    });

    // Joystick end handler
    joystick.on('end', () => {
        moveUp = moveDown = moveLeft = moveRight = false;
    });

    // Setup fire button
    let fireInterval;
    
    fireButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        shootLaser();
        fireInterval = setInterval(shootLaser, 250);
    }, { passive: false });

    fireButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (fireInterval) {
            clearInterval(fireInterval);
            fireInterval = null;
        }
    }, { passive: false });

    // Prevent default touch behaviors
    document.addEventListener('touchmove', (e) => {
        e.preventDefault();
    }, { passive: false });
}

// Add fullscreen support
function requestFullScreen(element) {
    if (element.requestFullscreen) {
        element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
    }
}

// Add orientation change handler
window.addEventListener('orientationchange', () => {
    setTimeout(onWindowResize, 100);
});

function getRandomPlayablePosition() {
    return {
        x: Math.random() * 14 - 7,    // Between -7 and 7 (slightly inside edges)
        y: Math.random() * 5 + 1,     // Between 1 and 6 (playable height)
        z: -180
    };
}

function createShieldPowerup() {
    const group = new THREE.Group();

    // Create hexagonal frame
    const hexGeometry = new THREE.CircleGeometry(0.5, 6);
    const hexMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
    });
    const hexFrame = new THREE.Mesh(hexGeometry, hexMaterial);
    group.add(hexFrame);

    // Create inner hexagon
    const innerHexGeometry = new THREE.CircleGeometry(0.35, 6);
    const innerHexMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
    });
    const innerHex = new THREE.Mesh(innerHexGeometry, innerHexMaterial);
    innerHex.position.z = 0.01; // Slightly offset to avoid z-fighting
    group.add(innerHex);

    // Add pulsing glow effect
    const glowGeometry = new THREE.CircleGeometry(0.6, 6);
    const glowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color: { value: new THREE.Color(0x00ffff) }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform float time;
            varying vec2 vUv;
            void main() {
                float dist = distance(vUv, vec2(0.5));
                float pulse = sin(time * 3.0) * 0.15 + 0.85;
                float alpha = (1.0 - dist) * 0.5 * pulse;
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.z = -0.01;
    group.add(glow);

    // Add rotation animation
    group.userData.rotationSpeed = 0.02;
    group.userData.glowMaterial = glowMaterial;
    group.userData.time = 0;

    // Use new random position function
    const pos = getRandomPlayablePosition();
    group.position.set(pos.x, pos.y, pos.z);

    return group;
}

function createPlayerShield() {
    const group = new THREE.Group();

    // Create the shield sphere
    const geometry = new THREE.SphereGeometry(1.5, 32, 32);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color: { value: new THREE.Color(0x00ffff) }
        },
        vertexShader: `
            varying vec3 vNormal;
            void main() {
                vNormal = normal;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform float time;
            varying vec3 vNormal;
            void main() {
                float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
                float shield = sin(time * 3.0) * 0.15 + 0.85;
                gl_FragColor = vec4(color, intensity * shield * 0.7);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide
    });
    shieldEffect = new THREE.Mesh(geometry, material);  // Store reference
    shieldEffect.visible = false;
    group.add(shieldEffect);

    // Create shield bar container
    const barGeometry = new THREE.BoxGeometry(2, 0.1, 0.1);
    const barMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
    shieldBarContainer = new THREE.Mesh(barGeometry, barMaterial);
    shieldBarContainer.position.y = -1.5;
    shieldBarContainer.visible = false;
    group.add(shieldBarContainer);

    // Create shield bar fill
    const fillGeometry = new THREE.BoxGeometry(2, 0.1, 0.1);
    const fillMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    shieldBarFill = new THREE.Mesh(fillGeometry, fillMaterial);
    shieldBarFill.position.z = 0.01;
    shieldBarContainer.add(shieldBarFill);

    return group;
}

function activateShield() {
    shieldActive = true;
    shieldTime = SHIELD_DURATION;
    shieldEffect.visible = true;
    shieldBarContainer.visible = true;
    updateShieldBar();
}

function updateShieldBar() {
    if (shieldBarFill) {
        const percentage = shieldTime / SHIELD_DURATION;
        shieldBarFill.scale.x = percentage;
        // Center the fill bar as it scales
        shieldBarFill.position.x = -1 * (1 - percentage);
    }
}

function createWeaponPowerup() {
    const group = new THREE.Group();

    // Create crosshair lines with thicker center
    const lineConfigs = [
        // Horizontal line
        { width: 1.0, height: 0.06, x: 0, y: 0, rot: 0 },
        // Vertical line
        { width: 0.06, height: 1.0, x: 0, y: 0, rot: 0 },
        // Small gap in center
        { width: 0.2, height: 0.2, x: 0, y: 0, rot: 0, isGap: true }
    ];

    lineConfigs.forEach(config => {
        if (config.isGap) {
            // Create dark center gap
            const gapGeometry = new THREE.PlaneGeometry(config.width, config.height);
            const gapMaterial = new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 1,
                side: THREE.DoubleSide
            });
            const gap = new THREE.Mesh(gapGeometry, gapMaterial);
            gap.position.set(config.x, config.y, 0.01);
            group.add(gap);
        } else {
            // Create line
            const lineGeometry = new THREE.PlaneGeometry(config.width, config.height);
            const lineMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide
            });
            const line = new THREE.Mesh(lineGeometry, lineMaterial);
            line.position.set(config.x, config.y, 0);
            line.rotation.z = config.rot;
            group.add(line);
        }
    });

    // Add small dots at the ends
    const dotPositions = [
        { x: 0.5, y: 0 },    // Right
        { x: -0.5, y: 0 },   // Left
        { x: 0, y: 0.5 },    // Top
        { x: 0, y: -0.5 }    // Bottom
    ];

    dotPositions.forEach(pos => {
        const dotGeometry = new THREE.CircleGeometry(0.04, 16);
        const dotMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            side: THREE.DoubleSide
        });
        const dot = new THREE.Mesh(dotGeometry, dotMaterial);
        dot.position.set(pos.x, pos.y, 0.01);
        group.add(dot);
    });

    // Add pulsing glow effect
    const glowGeometry = new THREE.CircleGeometry(0.6, 32);
    const glowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color: { value: new THREE.Color(0xff0000) }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform float time;
            varying vec2 vUv;
            void main() {
                float dist = distance(vUv, vec2(0.5));
                float pulse = sin(time * 3.0) * 0.15 + 0.85;
                float alpha = (1.0 - dist) * 0.5 * pulse;
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.z = -0.01;
    group.add(glow);

    // Add rotation animation
    group.userData.rotationSpeed = 0.02;
    group.userData.glowMaterial = glowMaterial;
    group.userData.time = 0;

    // Use new random position function
    const pos = getRandomPlayablePosition();
    group.position.set(pos.x, pos.y, pos.z);

    return group;
}

function activateWeaponUpgrade() {
    weaponUpgradeActive = true;
    weaponUpgradeTime = WEAPON_UPGRADE_DURATION;
    weaponLevel = Math.min(weaponLevel + 1, 4); // Cap at 4 beams instead of 3
}

// Add this new function to check powerup collisions with a larger radius
function checkPowerupCollision(powerup, player) {
    const dx = powerup.position.x - player.position.x;
    const dy = powerup.position.y - player.position.y;
    const dz = powerup.position.z - player.position.z;
    
    // Use a larger distance (3.0 instead of 2.0) for more forgiving pickup
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return distance < 3.0;  // More forgiving collision radius for powerups
}

// Add this new function to create the pickup animation
function createPickupAnimation(position, color) {
    const group = new THREE.Group();
    
    // Create expanding ring
    const ringGeometry = new THREE.RingGeometry(0.1, 0.2, 32);
    const ringMaterial = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(color) },
            time: { value: 0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform float time;
            varying vec2 vUv;
            void main() {
                float alpha = 1.0 - time;
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    group.add(ring);
    
    // Set position
    group.position.copy(position);
    
    // Add to scene
    scene.add(group);
    
    // Animation properties
    const duration = 30; // frames
    let time = 0;
    
    // Animation function
    function animate() {
        time++;
        
        // Scale up the ring
        const scale = 1 + (time * 0.15);
        ring.scale.set(scale, scale, 1);
        
        // Update shader time
        ringMaterial.uniforms.time.value = time / duration;
        
        // Remove when animation is complete
        if (time >= duration) {
            scene.remove(group);
            return;
        }
        
        requestAnimationFrame(animate);
    }
    
    // Start animation
    animate();
}

function createHealthPowerup() {
    const group = new THREE.Group();

    // Create heart shape
    const heartShape = new THREE.Shape();
    heartShape.moveTo(0, 0);
    heartShape.bezierCurveTo(-0.25, 0.25, -0.5, 0.2, -0.5, 0);
    heartShape.bezierCurveTo(-0.5, -0.3, 0, -0.5, 0, -0.5);
    heartShape.bezierCurveTo(0, -0.5, 0.5, -0.3, 0.5, 0);
    heartShape.bezierCurveTo(0.5, 0.2, 0.25, 0.25, 0, 0);

    const heartGeometry = new THREE.ShapeGeometry(heartShape);
    const heartMaterial = new THREE.MeshBasicMaterial({
        color: 0xff3366,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
    });
    const heart = new THREE.Mesh(heartGeometry, heartMaterial);
    heart.scale.set(0.5, 0.5, 0.5);
    group.add(heart);

    // Add pulsing glow effect
    const glowGeometry = new THREE.CircleGeometry(0.6, 32);
    const glowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color: { value: new THREE.Color(0xff3366) }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform float time;
            varying vec2 vUv;
            void main() {
                float dist = distance(vUv, vec2(0.5));
                float pulse = sin(time * 3.0) * 0.15 + 0.85;
                float alpha = (1.0 - dist) * 0.5 * pulse;
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.z = -0.01;
    group.add(glow);

    // Add rotation animation
    group.userData.rotationSpeed = 0.02;
    group.userData.glowMaterial = glowMaterial;
    group.userData.time = 0;

    // Use new random position function
    const pos = getRandomPlayablePosition();
    group.position.set(pos.x, pos.y, pos.z);

    return group;
}

function activateHealthPowerup() {
    // Only heal if health is below 100
    if (playerHealth < 100) {
        // Add 50% health, but don't exceed 100
        playerHealth = Math.min(100, playerHealth + 50);
        updateHealthBar();
    }
}

// Optional: Add visual indicator of current difficulty
function updateUI() {
    document.getElementById('scoreValue').textContent = score;
    updateHealthBar();
    
    // Add difficulty indicator to score display
    const difficultyStars = '★'.repeat(difficultyLevel) + '☆'.repeat(MAX_DIFFICULTY - difficultyLevel);
    document.getElementById('scoreValue').textContent = `${score} (${difficultyStars})`;
} 