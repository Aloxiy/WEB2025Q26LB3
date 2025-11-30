
(() => {
  const SIZE = 4;
  const MOVE_MS = 150;
  const START_MIN = 1;
  const START_MAX = 3;
  const STATE_KEY = 's2048_state';
  const LEADERS_KEY = 's2048_leaders';
  const LEADERS_MAX = 10;

  const boardEl = document.getElementById('board');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');

  const newBtn = document.getElementById('newBtn');
  const undoBtn = document.getElementById('undoBtn');
  const leadersBtn = document.getElementById('leadersBtn');

  const mobileControls = document.getElementById('mobile-controls');

  const gameoverModal = document.getElementById('gameover');
  const playerNameInput = document.getElementById('player-name');
  const saveScoreBtn = document.getElementById('saveScoreBtn');
  const newAfterGameBtn = document.getElementById('newAfterGameBtn');

  const leadersModal = document.getElementById('leaders');
  const leadersList = document.getElementById('leadersList');
  const closeLeadersBtn = document.getElementById('closeLeadersBtn');
  const clearLeadersBtn = document.getElementById('clearLeadersBtn');

  let board = []; 
  let score = 0;
  let best = 0;
  let nextId = 1;
  let animating = false;
  let gameOver = false;
  let undoState = null; 

  const tiles = new Map();

  function emptyBoard() {
    const b = [];
    for (let r = 0; r < SIZE; r++) {
      const row = [];
      for (let c = 0; c < SIZE; c++) row.push(null);
      b.push(row);
    }
    return b;
  }

  function buildGridBackground() {
    while (boardEl.firstChild) boardEl.removeChild(boardEl.firstChild);
    for (let i = 0; i < SIZE * SIZE; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      boardEl.appendChild(cell);
    }
  }

  function posFor(r, c) {
    const root = getComputedStyle(document.documentElement);
    const boardSize = parseFloat(root.getPropertyValue('--size')) || 360;
    const rect = boardEl.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(boardEl).getPropertyValue('gap')) || 12;
    const firstCell = boardEl.querySelector('.cell');
    let tileSize;
    if (firstCell) {
      const crect = firstCell.getBoundingClientRect();
      tileSize = crect.width;
    } else {
      tileSize = (rect.width - (SIZE - 1) * gap) / SIZE;
    }
    const left = c * (tileSize + gap) + parseFloat(getComputedStyle(boardEl).paddingTop || 0);
    const top = r * (tileSize + gap) + parseFloat(getComputedStyle(boardEl).paddingLeft || 0);
    return { left, top, size: tileSize };
  }

function createTileDOM(tile, r, c) {
  const el = document.createElement('div');
  el.className = 'tile v' + tile.val;
  el.textContent = String(tile.val);
  el.dataset.id = tile.id;
  boardEl.appendChild(el);
  tiles.set(tile.id, el);

  const p = posFor(r, c);
  el.style.width = p.size + 'px';
  el.style.height = p.size + 'px';

  el.style.opacity = '0';
  el.style.transform = `translate(${p.left}px, ${p.top}px) scale(0.9)`;

  requestAnimationFrame(() => {
    el.style.transition = `opacity 150ms ease, transform 150ms ease`;
    el.style.opacity = '1';
    el.style.transform = `translate(${p.left}px, ${p.top}px) scale(1)`;
  });
}


  function moveTileDOM(tile, r, c) {
    const el = tiles.get(tile.id);
    if (!el) {
      createTileDOM(tile, r, c);
      return;
    }
    const p = posFor(r, c);
    el.style.width = p.size + 'px';
    el.style.height = p.size + 'px';
    el.className = 'tile v' + tile.val;
    el.textContent = String(tile.val);
    requestAnimationFrame(() => {
      el.style.transition = `transform ${MOVE_MS}ms ease`;
      el.style.transform = `translate(${p.left}px, ${p.top}px) scale(1)`;
    });
  }

  function removeTileDOM(id) {
    const el = tiles.get(id);
    if (!el) return;
    el.style.transition = `opacity ${MOVE_MS}ms ease, transform ${MOVE_MS}ms ease`;
    el.style.opacity = '0';
    el.style.transform += ' scale(0.5)';
    setTimeout(() => {
      if (el.parentElement) el.parentElement.removeChild(el);
      tiles.delete(id);
    }, MOVE_MS + 20);
  }

  function spawnRandom(count = 1) {
    const empties = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (!board[r][c]) empties.push([r, c]);
    if (empties.length === 0) return;
    for (let i = 0; i < count && empties.length > 0; i++) {
      const idx = Math.floor(Math.random() * empties.length);
      const [r, c] = empties.splice(idx, 1)[0];
      const val = Math.random() < 0.9 ? 2 : 4;
      const tile = { id: nextId++, val };
      board[r][c] = tile;
      createTileDOM(tile, r, c);
    }
  }

  function compressMergeLine(line) {
    const tilesOnly = line.filter(x => x !== null);
    let gained = 0;
    for (let i = 0; i < tilesOnly.length - 1; i++) {
      if (tilesOnly[i].val === tilesOnly[i + 1].val) {
        tilesOnly[i] = { id: nextId++, val: tilesOnly[i].val * 2 };
        gained += tilesOnly[i].val;
        tilesOnly.splice(i + 1, 1);
      }
    }
    while (tilesOnly.length < SIZE) tilesOnly.push(null);
    return { newLine: tilesOnly, gained };
  }

  function cloneBoardState(b) {
    return b.map(row => row.map(cell => cell ? { ...cell } : null));
  }

  function moveLeft(boardState) {
    let changed = false;
    let gained = 0;
    for (let r = 0; r < SIZE; r++) {
      const old = boardState[r].map(x => x ? { ...x } : null);
      const { newLine, gained: g } = compressMergeLine(old);
      boardState[r] = newLine.map(x => x ? { ...x } : null);
      if (!rowsEqual(old, boardState[r])) changed = true;
      gained += g;
    }
    return { boardState, changed, gained };
  }

  function rowsEqual(a, b) {
    for (let i = 0; i < SIZE; i++) {
      const A = a[i], B = b[i];
      if (!A && !B) continue;
      if (!A || !B) return false;
      if (A.val !== B.val) return false;
    }
    return true;
  }

  function rotateCW(b) {
    const res = emptyBoard();
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        res[c][SIZE - 1 - r] = b[r][c] ? { ...b[r][c] } : null;
    return res;
  }
  function rotateCCW(b) {
    return rotateCW(rotateCW(rotateCW(b)));
  }
  function rotate180(b) {
    return rotateCW(rotateCW(b));
  }

  function attemptMove(direction) {
    if (animating || gameOver) return false;
    undoState = {
      board: cloneBoardState(board),
      score,
      nextId
    };

    let working = cloneBoardState(board);
    let result;
    if (direction === 'left') {
      result = moveLeft(working);
      working = result.boardState;
    } else if (direction === 'right') {
      working = rotate180(working);
      result = moveLeft(working);
      working = rotate180(result.boardState);
    } else if (direction === 'up') {
      working = rotateCCW(working);
      result = moveLeft(working);
      working = rotateCW(result.boardState);
    } else if (direction === 'down') {
      working = rotateCW(working);
      result = moveLeft(working);
      working = rotateCCW(result.boardState);
    } else return false;

    if (!result.changed) {
      undoState = null;
      return false;
    }

    animating = true;
    board = working;
    score += result.gained;
    if (score > best) best = score;
    updateScoreDisplay();

    const existingIds = new Set();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = board[r][c];
        if (cell) existingIds.add(cell.id);
        if (cell && tiles.has(cell.id)) {
          moveTileDOM(cell, r, c);
        } else if (cell && !tiles.has(cell.id)) {
  createTileDOM(cell, r, c);
  continue;
}
      }
    }

    for (const id of Array.from(tiles.keys())) {
      if (![...existingIds].includes(Number(id))) {
        removeTileDOM(Number(id));
      }
    }

    setTimeout(() => {
      const count = Math.random() < 0.5 ? 2 : 1;
      spawnRandom(count);
      saveState();
      animating = false;
      if (!movesAvailable()) {
        endGame();
      }
    }, MOVE_MS + 10);

    return true;
  }

  function movesAvailable() {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (!board[r][c]) return true;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const v = board[r][c].val;
        if (r + 1 < SIZE && board[r + 1][c].val === v) return true;
        if (c + 1 < SIZE && board[r][c + 1].val === v) return true;
      }
    return false;
  }

  function endGame() {
    gameOver = true;
    showGameOverModal();
  }

  function undo() {
    if (!undoState || gameOver || animating) return;
    board = cloneBoardState(undoState.board);
    score = undoState.score;
    nextId = undoState.nextId;
    undoState = null;
    renderAll();
    updateScoreDisplay();
    saveState();
  }

  function saveState() {
    try {
      const payload = {
        board,
        score,
        best,
        nextId,
        gameOver
      };
      localStorage.setItem(STATE_KEY, JSON.stringify(payload));
    } catch (e) { /* ignore */ }
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return false;
      const p = JSON.parse(raw);
      board = p.board;
      score = p.score || 0;
      best = p.best || 0;
      nextId = p.nextId || nextId;
      gameOver = p.gameOver || false;
      return true;
    } catch (e) { return false; }
  }

  function loadLeaders() {
    try {
      return JSON.parse(localStorage.getItem(LEADERS_KEY)) || [];
    } catch { return []; }
  }
  function saveLeader(name, pts) {
    try {
      const list = loadLeaders();
      list.push({ name: name.slice(0, 30), score: pts, date: new Date().toISOString() });
      list.sort((a, b) => b.score - a.score);
      const truncated = list.slice(0, LEADERS_MAX);
      localStorage.setItem(LEADERS_KEY, JSON.stringify(truncated));
    } catch (e) { /* ignore */ }
  }

  function updateScoreDisplay() {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
  }

  function renderAll() {
    for (const el of tiles.values()) {
      if (el.parentElement) el.parentElement.removeChild(el);
    }
    tiles.clear();
    buildGridBackground();
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (board[r][c]) createTileDOM(board[r][c], r, c);
    updateScoreDisplay();
  }

  function startNew() {
    board = emptyBoard();
    score = 0;
    nextId = 1;
    undoState = null;
    gameOver = false;
    buildGridBackground();
    const n = START_MIN + Math.floor(Math.random() * (START_MAX - START_MIN + 1));
    spawnRandom(n);
    updateScoreDisplay();
    saveState();
  }

  function spawnRandom(n = 1) {
    const empties = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (!board[r][c]) empties.push([r, c]);
    if (empties.length === 0) return;
    for (let i = 0; i < n && empties.length > 0; i++) {
      const idx = Math.floor(Math.random() * empties.length);
      const [r, c] = empties.splice(idx, 1)[0];
      const val = Math.random() < 0.9 ? 2 : 4;
      const tile = { id: nextId++, val };
      board[r][c] = tile;
      createTileDOM(tile, r, c);
    }
  }

  function showGameOverModal() {
    gameoverModal.classList.remove('hidden');
  }
  function hideGameOverModal() {
    gameoverModal.classList.add('hidden');
  }

  function showLeadersModal() {
    renderLeadersList();
    leadersModal.classList.remove('hidden');
    mobileControls.setAttribute('aria-hidden', 'true');
  }
  function hideLeadersModal() {
    leadersModal.classList.add('hidden');
    mobileControls.setAttribute('aria-hidden', 'false');
  }

  function renderLeadersList() {
  while (leadersList.firstChild) {
    leadersList.removeChild(leadersList.firstChild);
  }
  
  const list = loadLeaders();
  if (list.length === 0) {
    const p = document.createElement('div');
    p.textContent = 'Пока нет рекордов';
    p.className = 'leader-row';
    leadersList.appendChild(p);
    return;
  }
  
  list.forEach((it, idx) => {
    const row = document.createElement('div');
    row.className = 'leader-row';
    
    const left = document.createElement('div');
    left.textContent = `${idx + 1}. ${it.name} score: ${it.score}`;
    
    const right = document.createElement('div');
    const d = new Date(it.date);
    right.textContent = d.toLocaleString();
    
    row.appendChild(left);

    row.appendChild(right);
    leadersList.appendChild(row);
  });
}

  saveScoreBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) {
      alert('Введите имя');
      return;
    }
    saveLeader(name, score);
    hideGameOverModal();
    renderLeadersList();
    showLeadersModal();
  });
  newAfterGameBtn.addEventListener('click', () => {
    hideGameOverModal();
    startNew();
  });

  leadersBtn.addEventListener('click', () => { showLeadersModal(); });
  closeLeadersBtn.addEventListener('click', () => { hideLeadersModal(); });
  clearLeadersBtn.addEventListener('click', () => {
    if (confirm('Очистить таблицу лидеров?')) {
      localStorage.removeItem(LEADERS_KEY);
      renderLeadersList();
    }
  });

  newBtn.addEventListener('click', () => { startNew(); });
  undoBtn.addEventListener('click', () => { undo(); });

  window.addEventListener('keydown', (e) => {
    if (gameOver || animating) return;
    if (e.key === 'ArrowLeft') attemptMove('left');
    else if (e.key === 'ArrowRight') attemptMove('right');
    else if (e.key === 'ArrowUp') attemptMove('up');
    else if (e.key === 'ArrowDown') attemptMove('down');
  });

  mobileControls.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const dir = btn.dataset.dir;
    if (!dir) return;
    if (!animating && !gameOver) attemptMove(dir);
  });

  let touchStart = null;
  boardEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY, t: Date.now() };
  });
  boardEl.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (Math.max(adx, ady) < 20) { touchStart = null; return; }
    if (adx > ady) {
      if (dx > 0) attemptMove('right'); else attemptMove('left');
    } else {
      if (dy > 0) attemptMove('down'); else attemptMove('up');
    }
    touchStart = null;
  });

  function init() {
    buildGridBackground();
    const ok = loadState();
    if (!ok) {
      startNew();
    } else {
      tiles.clear();
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
          if (board[r][c]) createTileDOM(board[r][c], r, c);
      updateScoreDisplay();
      if (gameOver) showGameOverModal();
    }
    if (window.innerWidth <= 600) mobileControls.setAttribute('aria-hidden', 'false');
  }

  init();

})();
