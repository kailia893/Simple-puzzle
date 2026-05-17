const canvas = document.getElementById('grid');
const ctx = canvas.getContext('2d');
const messageEl = document.getElementById('message');
const timeEl = document.getElementById('time');
const difficultyInput = document.getElementById('difficulty');
const allowLoopsInput = document.getElementById('allowLoops');
const seedCheckbox = document.getElementById('seed');
const seedInput = document.getElementById('seedInput');
const connectInput = document.getElementById('connect');
const densityCheckbox = document.getElementById('Density');
const densityInput = document.getElementById('density');
const solutionInput = document.getElementById('solution');
const submitButton = document.getElementById('submitButton');
const startButton = document.getElementById('startButton');
const checkButton = document.getElementById('checkButton');

let gridSize = 5;
let cellClues = [];
let playerEdges = new Set();
let solutionEdges = new Set();
let solutionVertices = new Set();
let rng = Math.random;
let startTime = null;

startButton.addEventListener('click', startGame);
submitButton.addEventListener('click', submitGuess);
checkButton.addEventListener('click', checkSolution);

function startGame() {
    gridSize = Math.max(3, Math.min(10, parseInt(difficultyInput.value) || 5));
    const seedValue = seedCheckbox.checked ? parseInt(seedInput.value, 10) : NaN;
    if (seedCheckbox.checked && (Number.isNaN(seedValue) || seedValue <= 0)) {
        showMessage('Invalid seed. Using random seed.', 'warning');
    }
    const seed = Number.isFinite(seedValue) ? seedValue : Math.floor(Math.random() * 100000) + 1;
    rng = makeRng(seed);
    const allowLoops = allowLoopsInput.checked;
    const forceConnect = connectInput.checked;
    const chooseDensity = densityCheckbox.checked;
    const densityValue = chooseDensity ? Math.max(1, Math.min(10, parseInt(densityInput.value) || 5)) : Math.floor(rng() * 10) + 1;

    const totalEdges = gridSize * (gridSize + 1) * 2;
    const targetEdges = Math.max(3, Math.round(totalEdges * (densityValue / 10) * 0.5));

    const generator = allowLoops ? generateConnectedSubgraph : generateSimplePath;
    let edges = generator(gridSize, targetEdges, forceConnect);
    if (!edges || edges.size === 0) {
        edges = generateConnectedSubgraph(gridSize, targetEdges, forceConnect);
    }

    solutionEdges = edges;
    solutionVertices = collectVertices(edges);
    playerEdges = new Set();
    cellClues = computeCellClues(gridSize, solutionEdges);
    startTime = Date.now();
    showMessage(`Game started (seed ${seed}, density ${densityValue}, ${allowLoops ? 'loops allowed' : 'no loops'}).`, 'info');
    timeEl.textContent = '';
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

function generateConnectedSubgraph(size, targetEdges, forceConnect) {
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
        if (edges.size < targetEdges && allowLoopsInput.checked) {
            const extra = getPossibleLoopEdges(size, edges);
            if (extra.length > 0 && rng() < 0.4) {
                const candidate = extra[Math.floor(rng() * extra.length)];
                edges.add(candidate);
            }
        }
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
    const width = canvas.width;
    const height = canvas.height;
    const stepX = width / size;
    const stepY = height / size;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ccc';
    for (let i = 0; i <= size; i++) {
        ctx.beginPath();
        ctx.moveTo(i * stepX, 0);
        ctx.lineTo(i * stepX, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * stepY);
        ctx.lineTo(width, i * stepY);
        ctx.stroke();
    }

    drawClues(stepX, stepY);
    drawPlayerEdges(stepX, stepY);
    drawVertices(stepX, stepY);
    updateTimer();
}

function drawClues(stepX, stepY) {
    if (!cellClues.length) return;
    ctx.fillStyle = '#333';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const clue = cellClues[y][x];
            const cx = x * stepX + stepX / 2;
            const cy = y * stepY + stepY / 2;
            ctx.fillText(`${clue.vertices}/${clue.edges}`, cx, cy);
        }
    }
}

function drawPlayerEdges(stepX, stepY) {
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#2c7';
    for (const edge of playerEdges) {
        const [a, b] = edge.split('|').map(coord => coord.split(',').map(Number));
        ctx.beginPath();
        ctx.moveTo(a[0] * stepX, a[1] * stepY);
        ctx.lineTo(b[0] * stepX, b[1] * stepY);
        ctx.stroke();
    }
}

function drawVertices(stepX, stepY) {
    const usedVertices = new Set();
    for (const edge of playerEdges) {
        const [a, b] = edge.split('|').map(coord => coord.split(',').map(Number));
        usedVertices.add(`${a[0]},${a[1]}`);
        usedVertices.add(`${b[0]},${b[1]}`);
    }

    for (let y = 0; y <= gridSize; y++) {
        for (let x = 0; x <= gridSize; x++) {
            const px = x * stepX;
            const py = y * stepY;
            ctx.beginPath();
            ctx.fillStyle = usedVertices.has(`${x},${y}`) ? '#2c7' : '#333';
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function submitGuess() {
    const input = solutionInput.value.trim();
    const edge = parseEdgeInput(input);
    if (!edge) {
        showMessage('Enter a valid adjacent edge format: (x1,y1),(x2,y2).', 'error');
        return;
    }
    if (!isValidEdge(edge)) {
        showMessage('Vertices must be adjacent and inside the grid.', 'error');
        return;
    }
    const key = edgeKey(edge[0], edge[1]);
    if (playerEdges.has(key)) {
        playerEdges.delete(key);
        showMessage('Edge removed.', 'info');
    } else {
        playerEdges.add(key);
        showMessage('Edge added.', 'info');
    }
    drawGrid();
}

function parseEdgeInput(text) {
    const matches = text.match(/\(?\s*(\d+)\s*,\s*(\d+)\s*\)?\s*,\s*\(?\s*(\d+)\s*,\s*(\d+)\s*\)?/);
    if (!matches) return null;
    const x1 = parseInt(matches[1], 10);
    const y1 = parseInt(matches[2], 10);
    const x2 = parseInt(matches[3], 10);
    const y2 = parseInt(matches[4], 10);
    return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
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
        showMessage(errors.slice(0, 4).join(' • '), 'error');
        return;
    }

    if (!isConnected(playerEdges)) {
        showMessage('The shaded edges must form one connected path.', 'error');
        return;
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    showMessage(`Correct! Puzzle solved in ${elapsed} seconds.`, 'success');
    timeEl.textContent = `Solved in ${elapsed}s`;
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

function updateTimer() {
    if (!startTime) return;
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    timeEl.textContent = `Time: ${seconds}s`;
}

window.addEventListener('resize', () => {
    drawGrid();
});

drawGrid();
