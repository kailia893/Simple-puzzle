const canvas = document.getElementById('grid');
const ctx = canvas.getContext('2d');
const messageEl = document.getElementById('message');
const timeEl = document.getElementById('time');
const difficultyInput = document.getElementById('difficulty');
const allowLoopsInput = document.getElementById('allowLoops');
const seedCheckbox = document.getElementById('seed');
const seedInput = document.getElementById('seedInput');
const connectedInput = document.getElementById('connected');
const densityCheckbox = document.getElementById('Density');
const densityInput = document.getElementById('density');
const startButton = document.getElementById('startButton');
const checkButton = document.getElementById('checkButton');
const showSolutionButton = document.getElementById('showSolutionButton');

let gridSize = 5;
let cellClues = [];
let playerEdges = new Set();
let solutionEdges = new Set();
let solutionVertices = new Set();
let rng = Math.random;
let startTime = null;
let timerInterval = null;
let selectedVertex = null;
let badCells = [];
let solutionConnected = true;
let showingSolution = false;
let gameFinished = false;

startButton.addEventListener('click', startGame);
checkButton.addEventListener('click', checkSolution);
showSolutionButton.addEventListener('click', revealSolution);
canvas.addEventListener('click', handleCanvasClick);

function startGame() {
    gridSize = Math.max(3, Math.min(10, parseInt(difficultyInput.value) || 5));
    const seedValue = seedCheckbox.checked ? parseInt(seedInput.value, 10) : NaN;
    if (seedCheckbox.checked && (Number.isNaN(seedValue) || seedValue <= 0)) {
        showMessage('Invalid seed. Using random seed.', 'warning');
    }
    const seed = Number.isFinite(seedValue) ? seedValue : Math.floor(Math.random() * 100000) + 1;
    rng = makeRng(seed);
    const allowLoops = allowLoopsInput.checked;
    solutionConnected = connectedInput.checked;
    const chooseDensity = densityCheckbox.checked;
    const densityValue = chooseDensity ? Math.max(1, Math.min(15, parseInt(densityInput.value) || 5)) : Math.floor(rng() * 15) + 1;

    const totalEdges = gridSize * (gridSize + 1) * 2;
    const densityFraction = 0.35 + ((densityValue - 1) / 14) * 0.5; // 1 => ~35%, 15 => ~85%
    const targetEdges = Math.max(3, Math.round(totalEdges * densityFraction));

    let edges;
    if (solutionConnected) {
        edges = allowLoops ? generateConnectedSubgraph(gridSize, targetEdges, allowLoops) : generateSimplePath(gridSize, targetEdges);
    } else {
        edges = generateRandomEdgeSet(gridSize, targetEdges, allowLoops);
    }
    if (!edges || edges.size === 0) {
        edges = generateConnectedSubgraph(gridSize, targetEdges, allowLoops);
        solutionConnected = true;
    }

    solutionEdges = edges;
    solutionVertices = collectVertices(edges);
    cellClues = computeCellClues(gridSize, solutionEdges);
    playerEdges = new Set();
    selectedVertex = null;
    badCells = [];
    showingSolution = false;
    gameFinished = false;
    startTime = Date.now();
    updateTimer();
    startTimer();
    showMessage(`Game started (seed ${seed}, density ${densityValue}, ${allowLoops ? 'loops allowed' : 'no loops'}, ${solutionConnected ? 'connected' : 'not connected'}).`, 'info');
    enableInteraction(true);
    drawGrid();
}

function makeRng(seed) {
    let x = seed % 2147483647;
    if (x <= 0) x += 2147483646;
    return function () {
        x = (x * 16807) % 2147483647;
        return (x - 1) / 2147483646;
    };
}

function collectVertices(edges) {
    const vertices = new Set();
    for (const edge of edges) {
        const [a, b] = edge.split('|');
        vertices.add(a);
        vertices.add(b);
    }
    return vertices;
}

function computeCellClues(size, edges) {
    const clues = [];
    const vertexUsed = {};
    for (const edge of edges) {
        const [a, b] = edge.split('|').map(coord => coord.split(',').map(Number));
        vertexUsed[`${a[0]},${a[1]}`] = true;
        vertexUsed[`${b[0]},${b[1]}`] = true;
    }

    for (let y = 0; y < size; y++) {
        clues[y] = [];
        for (let x = 0; x < size; x++) {
            const corners = [
                `${x},${y}`,
                `${x + 1},${y}`,
                `${x},${y + 1}`,
                `${x + 1},${y + 1}`,
            ];
            const cellVertices = corners.filter(key => vertexUsed[key]).length;
            const cellEdges = [
                edgeKey({ x: x, y: y }, { x: x + 1, y: y }),
                edgeKey({ x: x, y: y }, { x: x, y: y + 1 }),
                edgeKey({ x: x + 1, y: y }, { x: x + 1, y: y + 1 }),
                edgeKey({ x: x, y: y + 1 }, { x: x + 1, y: y + 1 }),
            ].filter(key => edges.has(key)).length;
            clues[y][x] = { vertices: cellVertices, edges: cellEdges };
        }
    }
    return clues;
}

function generateSimplePath(size, targetEdges, forceConnect) {
    const maxEdges = (size + 1) * (size + 1) - 1;
    const allowedEdges = Math.min(targetEdges, maxEdges);
    if (allowedEdges < 1) return new Set();

    for (let attempt = 0; attempt < 200; attempt++) {
        const start = { x: Math.floor(rng() * (size + 1)), y: Math.floor(rng() * (size + 1)) };
        const visited = new Set([`${start.x},${start.y}`]);
        const edges = new Set();
        if (growPath(start, visited, edges, allowedEdges)) {
            return edges;
        }
    }
    return new Set();
}

function growPath(current, visited, edges, targetEdges) {
    if (edges.size === targetEdges) return true;
    const neighbors = shuffle(getNeighbors(current, gridSize)).filter(v => !visited.has(`${v.x},${v.y}`));
    for (const next of neighbors) {
        const key = edgeKey(current, next);
        edges.add(key);
        visited.add(`${next.x},${next.y}`);
        if (growPath(next, visited, edges, targetEdges)) return true;
        edges.delete(key);
        visited.delete(`${next.x},${next.y}`);
    }
    return false;
}

function generateConnectedSubgraph(size, targetEdges, allowLoops) {
    const allVertices = [];
    for (let y = 0; y <= size; y++) {
        for (let x = 0; x <= size; x++) {
            allVertices.push({ x, y });
        }
    }
    const start = { x: Math.floor(rng() * (size + 1)), y: Math.floor(rng() * (size + 1)) };
    const edges = new Set();
    const connected = new Set([`${start.x},${start.y}`]);
    const frontier = new Set();

    addFrontier(start, connected, frontier, size);
    while (edges.size < targetEdges && frontier.size > 0) {
        const options = Array.from(frontier);
        const chosen = options[Math.floor(rng() * options.length)];
        const [sx, sy, tx, ty] = chosen.split(',').map(Number);
        const key = edgeKey({ x: sx, y: sy }, { x: tx, y: ty });
        if (!edges.has(key)) {
            edges.add(key);
            const newVertex = connected.has(`${sx},${sy}`) ? { x: tx, y: ty } : { x: sx, y: sy };
            connected.add(`${newVertex.x},${newVertex.y}`);
            addFrontier(newVertex, connected, frontier, size);
        }
        frontier.delete(chosen);
        if (edges.size >= targetEdges) break;
        if (edges.size < targetEdges && allowLoops) {
            const extra = getPossibleLoopEdges(size, edges);
            if (extra.length > 0 && rng() < 0.4) {
                const candidate = extra[Math.floor(rng() * extra.length)];
                edges.add(candidate);
            }
        }
    }
    return edges;
}

function generateRandomEdgeSet(size, targetEdges, allowLoops) {
    const allEdges = [];
    for (let y = 0; y <= size; y++) {
        for (let x = 0; x <= size; x++) {
            if (x < size) allEdges.push(edgeKey({ x, y }, { x: x + 1, y }));
            if (y < size) allEdges.push(edgeKey({ x, y }, { x, y: y + 1 }));
        }
    }
    const allowedEdges = Math.max(1, Math.min(targetEdges, allEdges.length));
    shuffle(allEdges);
    const edges = new Set();

    if (!allowLoops) {
        const uf = new UnionFind((size + 1) * (size + 1));
        for (const key of allEdges) {
            if (edges.size >= allowedEdges) break;
            const [a, b] = key.split('|').map(coord => coord.split(',').map(Number));
            const aIndex = a[1] * (size + 1) + a[0];
            const bIndex = b[1] * (size + 1) + b[0];
            if (uf.find(aIndex) !== uf.find(bIndex)) {
                edges.add(key);
                uf.union(aIndex, bIndex);
            }
        }
        return edges;
    }

    for (const key of allEdges) {
        if (edges.size >= allowedEdges) break;
        edges.add(key);
    }
    return edges;
}

function addFrontier(vertex, connected, frontier, size) {
    for (const next of getNeighbors(vertex, size)) {
        const key = `${vertex.x},${vertex.y},${next.x},${next.y}`;
        const reverse = `${next.x},${next.y},${vertex.x},${vertex.y}`;
        if (!connected.has(`${next.x},${next.y}`)) {
            frontier.add(key);
            frontier.delete(reverse);
        }
    }
}

function getPossibleLoopEdges(size, edges) {
    const list = [];
    for (let y = 0; y <= size; y++) {
        for (let x = 0; x <= size; x++) {
            const current = { x, y };
            for (const next of getNeighbors(current, size)) {
                const key = edgeKey(current, next);
                if (!edges.has(key)) {
                    list.push(key);
                }
            }
        }
    }
    return list;
}

function edgeKey(a, b) {
    if (a.x < b.x || (a.x === b.x && a.y < b.y)) {
        return `${a.x},${a.y}|${b.x},${b.y}`;
    }
    return `${b.x},${b.y}|${a.x},${a.y}`;
}

function getNeighbors(vertex, size) {
    const neighbors = [];
    if (vertex.x > 0) neighbors.push({ x: vertex.x - 1, y: vertex.y });
    if (vertex.x < size) neighbors.push({ x: vertex.x + 1, y: vertex.y });
    if (vertex.y > 0) neighbors.push({ x: vertex.x, y: vertex.y - 1 });
    if (vertex.y < size) neighbors.push({ x: vertex.x, y: vertex.y + 1 });
    return neighbors;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function drawGrid() {
    const size = gridSize;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;
    const padding = Math.max(16, Math.min(width, height) * 0.06);
    const stepX = (width - padding * 2) / size;
    const stepY = (height - padding * 2) / size;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f7fbff';
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#d7dee8';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = true;

    for (let i = 0; i <= size; i++) {
        ctx.beginPath();
        ctx.moveTo(padding + i * stepX, padding);
        ctx.lineTo(padding + i * stepX, height - padding);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(padding, padding + i * stepY);
        ctx.lineTo(width - padding, padding + i * stepY);
        ctx.stroke();
    }

    drawBadCells(stepX, stepY, padding);
    drawClues(stepX, stepY, padding);
    if (showingSolution) {
        drawSolutionEdges(stepX, stepY, padding);
    }
    drawPlayerEdges(stepX, stepY, padding);
    drawVertices(stepX, stepY, padding);
    drawSelectedVertex(stepX, stepY, padding);
    updateTimer();
}

function drawClues(stepX, stepY, padding) {
    if (!cellClues.length) return;
    ctx.fillStyle = '#1b2c45';
    ctx.font = '15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const clue = cellClues[y][x];
            const cx = padding + x * stepX + stepX / 2;
            const cy = padding + y * stepY + stepY / 2;
            ctx.fillText(`${clue.edges}/${clue.vertices}`, cx, cy);
        }
    }
}

function drawPlayerEdges(stepX, stepY, padding) {
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#2c7';
    ctx.lineCap = 'round';
    for (const edge of playerEdges) {
        const [a, b] = edge.split('|').map(coord => coord.split(',').map(Number));
        ctx.beginPath();
        ctx.moveTo(padding + a[0] * stepX, padding + a[1] * stepY);
        ctx.lineTo(padding + b[0] * stepX, padding + b[1] * stepY);
        ctx.stroke();
    }
}

function drawVertices(stepX, stepY, padding) {
    const usedVertices = new Set();
    for (const edge of playerEdges) {
        const [a, b] = edge.split('|').map(coord => coord.split(',').map(Number));
        usedVertices.add(`${a[0]},${a[1]}`);
        usedVertices.add(`${b[0]},${b[1]}`);
    }

    const radius = Math.max(4, Math.min(stepX, stepY) * 0.1);
    for (let y = 0; y <= gridSize; y++) {
        for (let x = 0; x <= gridSize; x++) {
            const px = padding + x * stepX;
            const py = padding + y * stepY;
            ctx.beginPath();
            ctx.fillStyle = usedVertices.has(`${x},${y}`) ? '#2c7' : '#144';
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawSelectedVertex(stepX, stepY, padding) {
    if (!selectedVertex) return;
    const px = padding + selectedVertex.x * stepX;
    const py = padding + selectedVertex.y * stepY;
    ctx.beginPath();
    ctx.strokeStyle = '#f08';
    ctx.lineWidth = 4;
    ctx.arc(px, py, 10, 0, Math.PI * 2);
    ctx.stroke();
}

function drawSolutionEdges(stepX, stepY, padding) {
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(35, 110, 200, 0.45)';
    ctx.lineCap = 'round';
    for (const edge of solutionEdges) {
        const [a, b] = edge.split('|').map(coord => coord.split(',').map(Number));
        ctx.beginPath();
        ctx.moveTo(padding + a[0] * stepX, padding + a[1] * stepY);
        ctx.lineTo(padding + b[0] * stepX, padding + b[1] * stepY);
        ctx.stroke();
    }
}

function drawBadCells(stepX, stepY, padding) {
    if (!badCells || !badCells.length) return;
    ctx.fillStyle = 'rgba(225, 85, 85, 0.18)';
    for (const cell of badCells) {
        ctx.fillRect(padding + cell.x * stepX + 1, padding + cell.y * stepY + 1, stepX - 2, stepY - 2);
    }
}

function handleCanvasClick(event) {
    if (!gridSize || gameFinished || showingSolution) return;
    const rect = canvas.getBoundingClientRect();
    const padding = Math.max(16, Math.min(rect.width, rect.height) * 0.06);
    const stepX = (rect.width - padding * 2) / gridSize;
    const stepY = (rect.height - padding * 2) / gridSize;
    const pointX = event.clientX - rect.left;
    const pointY = event.clientY - rect.top;
    const x = Math.round((pointX - padding) / stepX);
    const y = Math.round((pointY - padding) / stepY);
    if (x < 0 || x > gridSize || y < 0 || y > gridSize) return;
    const dist = Math.hypot(pointX - (padding + x * stepX), pointY - (padding + y * stepY));
    if (dist > 18) return;

    const clickedVertex = { x, y };
    if (!selectedVertex) {
        selectedVertex = clickedVertex;
        showMessage(`Selected vertex (${x},${y}). Click an adjacent vertex to toggle an edge.`, 'info');
        drawGrid();
        return;
    }

    const sameVertex = selectedVertex.x === clickedVertex.x && selectedVertex.y === clickedVertex.y;
    if (sameVertex) {
        selectedVertex = null;
        showMessage('Selection cleared.', 'info');
        drawGrid();
        return;
    }

    const edge = [selectedVertex, clickedVertex];
    if (!isValidEdge(edge)) {
        selectedVertex = null;
        showMessage('Vertices must be adjacent. Click a new vertex to start again.', 'error');
        drawGrid();
        return;
    }

    const key = edgeKey(edge[0], edge[1]);
    if (playerEdges.has(key)) {
        playerEdges.delete(key);
        showMessage(`Edge removed between (${edge[0].x},${edge[0].y}) and (${edge[1].x},${edge[1].y}).`, 'info');
    } else {
        playerEdges.add(key);
        showMessage(`Edge added between (${edge[0].x},${edge[0].y}) and (${edge[1].x},${edge[1].y}).`, 'info');
    }
    selectedVertex = null;
    drawGrid();
}

function isValidEdge([a, b]) {
    const validRange = v => v.x >= 0 && v.x <= gridSize && v.y >= 0 && v.y <= gridSize;
    if (!validRange(a) || !validRange(b)) return false;
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

function checkSolution() {
    if (playerEdges.size === 0) {
        showMessage('Shade at least one edge before checking.', 'error');
        return;
    }
    const errors = [];
    const vertexUsage = {};
    for (const edge of playerEdges) {
        const [a, b] = edge.split('|').map(coord => coord.split(',').map(Number));
        vertexUsage[`${a[0]},${a[1]}`] = true;
        vertexUsage[`${b[0]},${b[1]}`] = true;
    }

    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const corners = [
                `${x},${y}`,
                `${x + 1},${y}`,
                `${x},${y + 1}`,
                `${x + 1},${y + 1}`,
            ];
            const vertices = corners.filter(key => vertexUsage[key]).length;
            const edges = [
                edgeKey({ x: x, y: y }, { x: x + 1, y: y }),
                edgeKey({ x: x, y: y }, { x: x, y: y + 1 }),
                edgeKey({ x: x + 1, y: y }, { x: x + 1, y: y + 1 }),
                edgeKey({ x: x, y: y + 1 }, { x: x + 1, y: y + 1 }),
            ].filter(key => playerEdges.has(key)).length;
            const clue = cellClues[y][x];
            if (clue.vertices !== vertices || clue.edges !== edges) {
                errors.push(`Cell (${x},${y}) expected ${clue.vertices}/${clue.edges}, got ${vertices}/${edges}`);
            }
        }
    }

    if (errors.length > 0) {
        badCells = errors.map(item => {
            const match = item.match(/Cell \((\d+),(\d+)\)/);
            if (!match) return null;
            return { x: Number(match[1]), y: Number(match[2]) };
        }).filter(Boolean);
        drawGrid();
        showMessage(errors.slice(0, 4).join(' • '), 'error');
        setTimeout(() => {
            badCells = [];
            drawGrid();
        }, 1200);
        return;
    }

    if (solutionConnected && !isConnected(playerEdges)) {
        badCells = [];
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                badCells.push({ x, y });
            }
        }
        drawGrid();
        showMessage('The shaded edges must form one connected path.', 'error');
        setTimeout(() => {
            badCells = [];
            drawGrid();
        }, 1200);
        return;
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    showMessage(`Correct! Puzzle solved in ${elapsed} seconds.`, 'success');
    timeEl.textContent = `Solved in ${elapsed}s`;
    gameFinished = true;
    clearInterval(timerInterval);
    timerInterval = null;
}

function isConnected(edges) {
    const adjacency = {};
    for (const edge of edges) {
        const [a, b] = edge.split('|');
        adjacency[a] = adjacency[a] || new Set();
        adjacency[b] = adjacency[b] || new Set();
        adjacency[a].add(b);
        adjacency[b].add(a);
    }
    const vertices = Object.keys(adjacency);
    if (vertices.length === 0) return false;
    const visited = new Set();
    const queue = [vertices[0]];
    while (queue.length) {
        const curr = queue.shift();
        if (visited.has(curr)) continue;
        visited.add(curr);
        for (const neighbor of adjacency[curr]) {
            if (!visited.has(neighbor)) {
                queue.push(neighbor);
            }
        }
    }
    return visited.size === vertices.length;
}

function showMessage(text, type = 'info') {
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
}

function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!startTime) return;
        if (gameFinished) {
            clearInterval(timerInterval);
            timerInterval = null;
            return;
        }
        updateTimer();
    }, 1000);
}

function updateTimer() {
    if (!startTime) return;
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    timeEl.textContent = gameFinished ? `Solved in ${seconds}s` : `Time: ${seconds}s`;
}

function enableInteraction(enabled) {
    startButton.disabled = !enabled;
    checkButton.disabled = !enabled;
    showSolutionButton.disabled = !enabled;
    canvas.style.pointerEvents = enabled ? 'auto' : 'none';
    allowLoopsInput.disabled = !enabled;
    seedCheckbox.disabled = !enabled;
    seedInput.disabled = !enabled;
    connectedInput.disabled = !enabled;
    densityCheckbox.disabled = !enabled;
    densityInput.disabled = !enabled;
    difficultyInput.disabled = !enabled;
}

function revealSolution() {
    if (!solutionEdges || !solutionEdges.size) {
        showMessage('Start a game first to reveal the solution.', 'warning');
        return;
    }
    showingSolution = true;
    gameFinished = true;
    playerEdges = new Set(solutionEdges);
    badCells = [];
    updateTimer();
    enableInteraction(false);
    showMessage('Solution revealed. The board is now locked.', 'info');
    drawGrid();
}

class UnionFind {
    constructor(size) {
        this.parent = new Array(size).fill(0).map((_, index) => index);
    }
    find(x) {
        if (this.parent[x] !== x) {
            this.parent[x] = this.find(this.parent[x]);
        }
        return this.parent[x];
    }
    union(a, b) {
        const rootA = this.find(a);
        const rootB = this.find(b);
        if (rootA !== rootB) {
            this.parent[rootB] = rootA;
        }
    }
}

window.addEventListener('resize', () => {
    drawGrid();
});

drawGrid();
