const Engine = Matter.Engine,
      Render = Matter.Render,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      Events = Matter.Events;

const engine = Engine.create(); // Removed locking mechanism (enableSleeping)
// Maximized solver iterations for mathematical stability of tall stacks
engine.positionIterations = 128;
engine.velocityIterations = 128;

// Slow down gravity for a philosophical, floaty vibe
engine.world.gravity.y = 0.4;

const render = Render.create({
    element: document.body,
    engine: engine,
    options: {
        width: window.innerWidth,
        height: window.innerHeight,
        wireframes: false,
        background: 'transparent' // Make matter.js canvas transparent to show our bg
    }
});

Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);

let totalGreyBlocks = 0;
let fallenGreyBlocks = 0;
let dropInterval = null;
let lastUserSpawnTime = 0;
let floor;

// Symmetrical placement variables
let spawnRight = true;
let lastDropWidth = 0;
let lastDropHeight = 0;
let lastDropOffset = 0;
let isRestarting = false;

function initSimulation() {
    // Clear the world
    Composite.clear(engine.world);
    Engine.clear(engine);
    
    totalGreyBlocks = 0;
    fallenGreyBlocks = 0;
    spawnRight = true;
    lastDropWidth = 200; // Floor width
    lastDropOffset = 0; // Floor offset
    
    // Create static floor lowered more (80% down) and shortened (200px width ~ 2 inches)
    // Reverted to thin line (5px), kept darker grey color
    floor = Bodies.rectangle(window.innerWidth / 2, window.innerHeight * 0.8, 200, 5, {
        isStatic: true,
        render: { 
            fillStyle: '#555555', // noticeably darker grey
            strokeStyle: 'transparent',
            lineWidth: 0,
            visible: true
        }
    });
    Composite.add(engine.world, floor);

    // Start auto dropping at a slower pace
    if (dropInterval) clearInterval(dropInterval);
    dropInterval = setInterval(spawnGreyBlock, 8000);
}

// We will use 3 distinct columns to spread out the placement and avoid sticking in the middle.
// This wider base naturally prevents Jenga-buckling without needing artificial locks.
const columnOffsets = [-65, 0, 65];
let currentColumn = 0;

function spawnGreyBlock() {
    if (isRestarting) return;
    
    const center = window.innerWidth / 2;
    
    // Spread out placement across 3 columns
    const dropX = center + columnOffsets[currentColumn];
    currentColumn = (currentColumn + 1) % columnOffsets.length;
    
    let width, height;
    
    // Vary from squares to rectangles with strict limits
    // Max width (length) = 60px, Max height = 30px
    if (Math.random() > 0.5) {
        // Square (Max 30x30 to respect the 30px height limit)
        const squareSize = 15 + Math.random() * 15; // 15 to 30
        width = squareSize;
        height = squareSize;
    } else {
        // Rectangle (Width up to 60, Height up to 30)
        width = 20 + Math.random() * 40; // 20 to 60
        height = 10 + Math.random() * 20; // 10 to 30
    }
    
    // Random dark grey/black shade
    const shade = Math.floor(Math.random() * 40); // 0 to 39
    const color = `rgb(${shade}, ${shade}, ${shade})`;
    
    // Spawn slightly above the screen (-100)
    const block = Bodies.rectangle(dropX, -100, width, height, {
        label: 'self',
        restitution: 0, // No bounciness for perfect stacking
        friction: 1, // High friction
        frictionStatic: 10, // Prevent any horizontal sliding under pressure
        frictionAir: 0.1, // High air friction for extremely gentle, floaty landings to prevent impact bounce
        slop: 0, // Force absolute rigidity, zero penetration allowed to eliminate tall stack elasticity
        
        // Normalize density so every block has the exact same mass (1000)
        // This prevents physics solver jitter when a massive 60x30 rectangle lands on a tiny 15x15 square
        density: 1000 / (width * height),
        
        render: {
            fillStyle: 'transparent', // Hollow
            strokeStyle: color,
            lineWidth: 2
        }
    });
    
    Composite.add(engine.world, block);
    totalGreyBlocks++;
    playSpawnSound(false);
}

// --- Audio System ---
let audioCtx = null;
let audioInitialized = false;

function initAudio() {
    if (audioInitialized) return;
    
    // Create AudioContext only after user interaction to bypass browser policies
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioInitialized = true;
    
    // Play a continuous background drone
    const droneOsc = audioCtx.createOscillator();
    const droneGain = audioCtx.createGain();
    droneOsc.type = 'sine';
    droneOsc.frequency.setValueAtTime(55, audioCtx.currentTime); // Low A
    
    droneGain.gain.setValueAtTime(0, audioCtx.currentTime);
    droneGain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 2); // Increased volume to 0.5
    
    droneOsc.connect(droneGain);
    droneGain.connect(audioCtx.destination);
    droneOsc.start();
}

function playSpawnSound(isCommunity) {
    if (!audioCtx || audioCtx.state !== 'running') return;
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    if (isCommunity) {
        // High pitched chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440 + Math.random() * 440, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime); // Increased volume
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);
    } else {
        // Lower pitched thud for system block
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(110 + Math.random() * 50, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime); // Lowered volume
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);
    }
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 2);
}

// User Spawning limits
const USER_SPAWN_COOLDOWN = 150; // ms limit

window.addEventListener('pointerdown', (e) => {
    // Hide intro overlay
    const intro = document.getElementById('intro-overlay');
    if (intro && intro.style.opacity !== '0') {
        intro.style.opacity = '0';
        setTimeout(() => { if (intro) intro.remove(); }, 1000);
        
        initAudio();
        initSimulation(); // Start the art simulation now
        return; // Do not spawn a block on the first click
    }
    
    // Ensure audio is running
    if (!audioInitialized) initAudio();
    
    const now = Date.now();
    if (now - lastUserSpawnTime < USER_SPAWN_COOLDOWN) return; // Enforce limit
    lastUserSpawnTime = now;
    
    // Varied rectangles for community blocks (smaller)
    const width = 15 + Math.random() * 20;
    const height = 15 + Math.random() * 20;
    
    // Curated vivid palette for a nostalgic childhood memory feel
    const vividColors = [
        '#ff477e', // vibrant pink
        '#ff99c3', // soft pink
        '#f9dc5c', // sun yellow
        '#3185fc', // vivid blue
        '#00d2ff', // bright cyan
        '#ff7b54'  // sunset orange
    ];
    const color = vividColors[Math.floor(Math.random() * vividColors.length)];
    
    const block = Bodies.rectangle(e.clientX, e.clientY, width, height, {
        label: 'community',
        restitution: 0.15, // Less bounce (less jumpy)
        friction: 0.1, // Less friction so they slide and tumble
        density: 1,
        render: {
            fillStyle: 'transparent', // Hollow
            strokeStyle: color,
            lineWidth: 2
        }
    });
    
    Composite.add(engine.world, block);
    playSpawnSound(true);
});

// Draw soft glows around community blocks
Events.on(render, 'afterRender', function() {
    const context = render.context;
    const bodies = Composite.allBodies(engine.world);

    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        if (body.label === 'community') {
            context.beginPath();
            const vertices = body.vertices;
            context.moveTo(vertices[0].x, vertices[0].y);
            for (let j = 1; j < vertices.length; j++) {
                context.lineTo(vertices[j].x, vertices[j].y);
            }
            context.lineTo(vertices[0].x, vertices[0].y);
            
            context.lineWidth = 3;
            context.strokeStyle = body.render.strokeStyle;
            context.shadowBlur = 15;
            context.shadowColor = body.render.strokeStyle;
            context.stroke();
            
            // Reset shadow so it doesn't affect other rendering
            context.shadowBlur = 0;
        }
    }
});

// Dust motes background animation
const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
let motes = [];

function initMotes() {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    motes = [];
    for (let i = 0; i < 70; i++) {
        motes.push({
            x: Math.random() * bgCanvas.width,
            y: Math.random() * bgCanvas.height,
            size: Math.random() * 2 + 1,
            speedY: Math.random() * 0.3 + 0.1,
            speedX: (Math.random() - 0.5) * 0.2,
            opacity: Math.random() * 0.4 + 0.1
        });
    }
}

function drawMotes() {
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    motes.forEach(mote => {
        bgCtx.beginPath();
        bgCtx.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2);
        bgCtx.fillStyle = `rgba(220, 220, 220, ${mote.opacity})`;
        bgCtx.fill();
        
        mote.y -= mote.speedY;
        mote.x += mote.speedX;
        
        if (mote.y < -10) {
            mote.y = bgCanvas.height + 10;
            mote.x = Math.random() * bgCanvas.width;
        }
        if (mote.x < -10) mote.x = bgCanvas.width + 10;
        if (mote.x > bgCanvas.width + 10) mote.x = -10;
    });
    requestAnimationFrame(drawMotes);
}
initMotes();
drawMotes();

// Rebirth Logic
Events.on(engine, 'afterUpdate', function() {
    if (isRestarting) return;
    
    const bodies = Composite.allBodies(engine.world);
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        // Check if block has fallen off the platform level (restarts immediately)
        const platformY = window.innerHeight * 0.8;
        if (body !== floor && body.position.y > platformY + 15) {
            Composite.remove(engine.world, body);
            
            // Only care about 'self' blocks falling
            if (body.label === 'self') {
                fallenGreyBlocks++;
            }
        }
    }
    
    // If 50% or more of grey blocks have fallen off, trigger seamless restart
    if (totalGreyBlocks > 0 && (fallenGreyBlocks / totalGreyBlocks) >= 0.5) {
        triggerRestart();
    }
});

function triggerRestart() {
    isRestarting = true;
    if (dropInterval) clearInterval(dropInterval);
    
    const flash = document.getElementById('flash');
    
    // Slowly brightening light (3 seconds)
    flash.style.transition = 'opacity 3s ease-in';
    flash.style.opacity = '1';
    
    setTimeout(() => {
        // Clear world while blinded
        initSimulation();
        
        // Fast fade out to reveal rebirth
        flash.style.transition = 'opacity 0.5s ease-out';
        flash.style.opacity = '0';
        
        isRestarting = false;
    }, 3000);
}

// Handle window resizing
window.addEventListener('resize', () => {
    render.canvas.width = window.innerWidth;
    render.canvas.height = window.innerHeight;
    render.options.width = window.innerWidth;
    render.options.height = window.innerHeight;
    
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    
    if (floor) {
        Matter.Body.setPosition(floor, {
            x: window.innerWidth / 2,
            y: window.innerHeight * 0.8
        });
    }
});

// Start
// initSimulation(); // This is now called on the first user click
