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
        background: '#FFFFFF'
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
    // Made it a thin line (5px height for physics stability)
    floor = Bodies.rectangle(window.innerWidth / 2, window.innerHeight * 0.8, 200, 5, {
        isStatic: true,
        render: { 
            fillStyle: '#DDDDDD', // subtle visible line
            strokeStyle: 'transparent',
            lineWidth: 0,
            visible: true
        }
    });
    Composite.add(engine.world, floor);

    // Start auto dropping at a slower pace
    if (dropInterval) clearInterval(dropInterval);
    dropInterval = setInterval(spawnGreyBlock, 3000);
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
}

// User Spawning limits
const USER_SPAWN_COOLDOWN = 150; // ms limit

window.addEventListener('pointerdown', (e) => {
    const now = Date.now();
    if (now - lastUserSpawnTime < USER_SPAWN_COOLDOWN) return; // Enforce limit
    lastUserSpawnTime = now;
    
    // Varied rectangles for community blocks (smaller)
    const width = 15 + Math.random() * 20;
    const height = 15 + Math.random() * 20;
    
    // Random neon/pastel color
    const hue = Math.floor(Math.random() * 360);
    const color = `hsl(${hue}, 100%, 60%)`;
    
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
});



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
    
    if (floor) {
        Matter.Body.setPosition(floor, {
            x: window.innerWidth / 2,
            y: window.innerHeight * 0.8
        });
    }
});

// Start
initSimulation();
