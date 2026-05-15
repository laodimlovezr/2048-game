/* ── DOM refs ── */
const boardElement = document.getElementById('game-board');
const scoreElement = document.getElementById('score');
const bestScoreElement = document.getElementById('best-score');
const instructionsElement = document.getElementById('instructions-text');
const restartButton = document.getElementById('restart-button');
const settingsButton = document.getElementById('settings-button');
const autoplayPanel = document.getElementById('autoplay-panel');
const autoplayButton = document.getElementById('autoplay-button');
const autoplaySpeedSelect = document.getElementById('autoplay-speed');
const autoplayStatusElement = document.getElementById('autoplay-status');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsButton = document.getElementById('close-settings-button');
const redeemCodeInput = document.getElementById('redeem-code-input');
const redeemCodeButton = document.getElementById('redeem-code-button');
const redeemStatusElement = document.getElementById('redeem-status');
const overlayElement = document.getElementById('game-overlay');
const overlayTitleElement = document.getElementById('overlay-title');
const overlayMessageElement = document.getElementById('overlay-message');
const overlayButton = document.getElementById('overlay-button');
const swipeHintElement = document.getElementById('swipe-hint');

/* ── constants ─ */
const GRID_SIZE = 4;
const BEST_SCORE_KEY = '2048-best-score';
const AUTOPLAY_UNLOCK_KEY = '2048-autoplay-unlocked';
const AUTOPLAY_UNLOCK_CODE = 'xiaomingzuishuai';
const DIRECTIONS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
const DIRECTION_LABELS = { ArrowUp: 'Up', ArrowRight: 'Right', ArrowDown: 'Down', ArrowLeft: 'Left' };
const SWIPE_HINT_ARROWS = { ArrowUp: '↑', ArrowRight: '→', ArrowDown: '↓', ArrowLeft: '←' };
const SWIPE_THRESHOLD = 28;
const SWIPE_COOLDOWN = 180;
const IS_TOUCH_DEVICE = 'ontouchstart' in window || window.matchMedia('(pointer: coarse)').matches;

/* ── global state ── */
const state = {
  size: GRID_SIZE,
  board: [],
  score: 0,
  bestScore: 0,
  gameOver: false,
  won: false,
  autoPlaying: false,
  autoPlayTimer: null,
  autoPlayDelay: Number(autoplaySpeedSelect?.value ?? 120),
  lastAutoMove: null,
  autoplayUnlocked: window.localStorage.getItem(AUTOPLAY_UNLOCK_KEY) === 'true',
  settingsOpen: false,
  touchStartX: null,
  touchStartY: null,
  lastSwipeTime: 0,
};

/* ── board utilities ── */
function createEmptyBoard() {
  return Array.from({ length: state.size }, () => Array(state.size).fill(0));
}

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function getEmptyCells(board) {
  const cells = [];
  for (let row = 0; row < state.size; row += 1) {
    for (let column = 0; column < state.size; column += 1) {
      if (board[row][column] === 0) cells.push({ row, column });
    }
  }
  return cells;
}

function addRandomTile(board) {
  const cells = getEmptyCells(board);
  if (cells.length === 0) return null;
  const target = cells[Math.floor(Math.random() * cells.length)];
  board[target.row][target.column] = Math.random() < 0.9 ? 2 : 4;
  return target;
}

function posKey(row, col) { return `${row},${col}`; }

/* ── core move logic ── */
function slideAndMerge(line) {
  const tiles = line.filter((v) => v !== 0);
  const merged = [];
  let score = 0;

  for (let i = 0; i < tiles.length; i += 1) {
    if (tiles[i] === tiles[i + 1]) {
      merged.push(tiles[i] * 2);
      score += tiles[i] * 2;
      i += 1;
      continue;
    }
    merged.push(tiles[i]);
  }

  while (merged.length < state.size) merged.push(0);

  const changed = merged.some((v, i) => v !== line[i]);
  return { line: merged, score, changed };
}

function transpose(board) {
  return board[0].map((_, c) => board.map((row) => row[c]));
}

function reverseRows(board) {
  return board.map((row) => [...row].reverse());
}

function boardsEqual(a, b) {
  return a.every((row, ri) => row.every((v, ci) => v === b[ri][ci]));
}

function moveLeft(board) {
  let score = 0;
  let changed = false;
  const next = board.map((row) => {
    const r = slideAndMerge(row);
    score += r.score;
    changed = changed || r.changed;
    return r.line;
  });
  return { board: next, score, changed };
}

function moveRight(board) {
  const rev = reverseRows(board);
  const r = moveLeft(rev);
  return { board: reverseRows(r.board), score: r.score, changed: r.changed };
}

function moveUp(board) {
  const t = transpose(board);
  const r = moveLeft(t);
  return { board: transpose(r.board), score: r.score, changed: r.changed };
}

function moveDown(board) {
  const t = transpose(board);
  const r = moveRight(t);
  return { board: transpose(r.board), score: r.score, changed: r.changed };
}

function simulateMove(board, direction) {
  const wb = cloneBoard(board);
  if (direction === 'ArrowLeft') return moveLeft(wb);
  if (direction === 'ArrowRight') return moveRight(wb);
  if (direction === 'ArrowUp') return moveUp(wb);
  if (direction === 'ArrowDown') return moveDown(wb);
  return { board: wb, score: 0, changed: false };
}

/* ── game-over utilities ── */
function has2048(board) {
  return board.some((row) => row.some((v) => v === 2048));
}

function hasEmptyCell(board) {
  return board.some((row) => row.some((v) => v === 0));
}

function canMerge(board) {
  for (let row = 0; row < state.size; row += 1) {
    for (let col = 0; col < state.size; col += 1) {
      const v = board[row][col];
      if (v !== 0 && (v === board[row][col + 1] || v === (board[row + 1] || [])[col])) return true;
    }
  }
  return false;
}

function isGameOver(board) {
  return !hasEmptyCell(board) && !canMerge(board);
}

/* ── Evaluation ── */
function evaluateBoard(board) {
  const flat = board.flat();
  const maxTile = Math.max(...flat);
  const emptyCount = flat.filter((v) => v === 0).length;
  const logMax = Math.log2(maxTile || 1);

  /* 1. Multi-directional monotonicity: pick the best direction/axis. */
  const monoScores = [];
  for (const row of board) {
    let left = 0;
    for (let i = 0; i < row.length - 1; i += 1) {
      left += row[i] >= row[i + 1] ? row[i] - row[i + 1] : -(row[i + 1] - row[i]);
    }
    monoScores.push(left);
  }
  for (let c = 0; c < state.size; c += 1) {
    let down = 0;
    for (let r = 0; r < state.size - 1; r += 1) {
      down += board[r][c] >= board[r + 1][c] ? board[r][c] - board[r + 1][c] : -(board[r + 1][c] - board[r][c]);
    }
    monoScores.push(down);
  }
  const bestMono = Math.max(...monoScores);

  /* 2. Empty cells (quadratic bonus). */
  const emptyBonus = emptyCount * emptyCount;

  /* 3. Smoothness penalty. */
  let smoothPenalty = 0;
  for (let r = 0; r < state.size; r += 1) {
    for (let c = 0; c < state.size; c += 1) {
      const v = board[r][c];
      if (v === 0) continue;
      const lv = Math.log2(v);
      if (c + 1 < state.size && board[r][c + 1] > 0) {
        smoothPenalty += Math.abs(lv - Math.log2(board[r][c + 1]));
      }
      if (r + 1 < state.size && board[r + 1][c] > 0) {
        smoothPenalty += Math.abs(lv - Math.log2(board[r + 1][c]));
      }
    }
  }

  /* 4. Merge potential. */
  let merges = 0;
  for (let r = 0; r < state.size; r += 1) {
    for (let c = 0; c < state.size; c += 1) {
      if (board[r][c] === 0) continue;
      if (c + 1 < state.size && board[r][c + 1] === board[r][c]) merges += 1;
      if (r + 1 < state.size && board[r + 1][c] === board[r][c]) merges += 1;
    }
  }

  /* 5. Corner bonus. */
  const corners = [board[0][0], board[0][state.size - 1], board[state.size - 1][0], board[state.size - 1][state.size - 1]];
  const cornerBonus = corners.includes(maxTile) ? maxTile : 0;

  return (
    bestMono * 0.4 +
    emptyBonus * 55 +
    smoothPenalty * -3.0 +
    merges * 28 +
    cornerBonus * 0.6 +
    logMax * 22
  );
}

function getSearchDepth(board) {
  const n = getEmptyCells(board).length;
  if (n >= 9) return 3;
  if (n >= 6) return 4;
  if (n >= 4) return 5;
  return 6;
}

function expectimax(board, depth, isChance) {
  if (depth === 0 || isGameOver(board)) return evaluateBoard(board);

  if (!isChance) {
    /* Player node: pick best direction. */
    let best = Number.NEGATIVE_INFINITY;
    let found = false;
    for (const dir of DIRECTIONS) {
      const r = simulateMove(board, dir);
      if (!r.changed) continue;
      found = true;
      const score = r.score * 4 + expectimax(r.board, depth - 1, true);
      if (score > best) best = score;
    }
    return found ? best : evaluateBoard(board);
  }

  /* Chance node: average over all possible spawns. */
  const cells = getEmptyCells(board);
  if (cells.length === 0) return expectimax(board, depth - 1, false);

  let expected = 0;
  const p = 1 / cells.length;
  for (const cell of cells) {
    const b2 = cloneBoard(board);
    b2[cell.row][cell.column] = 2;
    expected += p * 0.9 * expectimax(b2, depth - 1, false);
    const b4 = cloneBoard(board);
    b4[cell.row][cell.column] = 4;
    expected += p * 0.1 * expectimax(b4, depth - 1, false);
  }
  return expected;
}

function getBestMove(board) {
  const depth = getSearchDepth(board);
  let bestDir = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const dir of DIRECTIONS) {
    const r = simulateMove(board, dir);
    if (!r.changed) continue;
    const score = r.score * 4 + expectimax(r.board, depth, true);
    if (score > bestScore) { bestScore = score; bestDir = dir; }
  }
  return bestDir;
}

/* ── persistence ── */
function loadBestScore() {
  const s = window.localStorage.getItem(BEST_SCORE_KEY);
  const n = Number.parseInt(s ?? '0', 10);
  return Number.isNaN(n) ? 0 : n;
}

function saveBestScore() { window.localStorage.setItem(BEST_SCORE_KEY, String(state.bestScore)); }
function saveAutoplayUnlocked() { window.localStorage.setItem(AUTOPLAY_UNLOCK_KEY, String(state.autoplayUnlocked)); }

function updateBestScore() {
  if (state.score > state.bestScore) { state.bestScore = state.score; saveBestScore(); }
}

/* ── rendering: DOM-position-based tile tracking ── */
let renderGen = 0;
const tileMap = {};   /* "row,col" → HTMLElement */
let prevBoard = null;

function getCellUnit() {
  const style = getComputedStyle(boardElement);
  const gap = parseFloat(style.gap) || 8;
  const padding = parseFloat(style.paddingLeft) || 0;
  const boardSize = boardElement.getBoundingClientRect().width;
  const inner = boardSize - padding * 2;
  return (inner - gap * (state.size - 1)) / state.size + gap;
}

function animateSlide(element, fromRow, fromCol, toRow, toCol) {
  const unit = getCellUnit();
  element.style.setProperty('--slide-x', `${(fromCol - toCol) * unit}px`);
  element.style.setProperty('--slide-y', `${(fromRow - toRow) * unit}px`);
  element.classList.add('tile-slide');
  element.addEventListener('animationend', () => element.classList.remove('tile-slide'), { once: true });
}

function animateMerge(element) {
  element.classList.add('tile-merge');
  element.addEventListener('animationend', () => element.classList.remove('tile-merge'), { once: true });
}

function animatePop(element) {
  element.classList.add('tile-pop');
  element.addEventListener('animationend', () => element.classList.remove('tile-pop'), { once: true });
}

function getMovedScore(newBoard, oldBoard) {
  let newSum = 0;
  let oldSum = 0;
  for (let row = 0; row < state.size; row += 1) {
    for (let col = 0; col < state.size; col += 1) {
      newSum += newBoard[row][col];
      oldSum += oldBoard[row][col];
    }
  }
  return Math.max(0, newSum - oldSum);
}

function detectMerges(newBoard, oldBoard, movedScore) {
  /* Only mark as merged if we know a merge happened (score gained) and
     the position's value is double of some adjacent old value.
     If movedScore is 0, there were no merges at all. */
  if (movedScore <= 0) return new Set();

  const merged = new Set();
  for (let row = 0; row < state.size; row += 1) {
    for (let col = 0; col < state.size; col += 1) {
      const nv = newBoard[row][col];
      if (nv === 0 || oldBoard[row][col] === nv) continue;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const or = row + dr;
        const oc = col + dc;
        if (or >= 0 && or < state.size && oc >= 0 && oc < state.size) {
          if (oldBoard[or][oc] === nv) {
            merged.add(posKey(row, col));
            break;
          }
        }
      }
    }
  }
  return merged;
}

function detectNewPositions(newBoard, oldBoard, merged) {
  const newSet = new Set();
  for (let row = 0; row < state.size; row += 1) {
    for (let col = 0; col < state.size; col += 1) {
      const nv = newBoard[row][col];
      const ov = oldBoard[row][col];
      if (nv > 0 && ov === 0 && !merged.has(posKey(row, col))) {
        newSet.add(posKey(row, col));
      }
    }
  }
  window._debugNewPos = { newSet: [...newSet], merged: [...merged] };
  return newSet;
}

function findSource(row, col, value, prevTiles, merged, claimedOld) {
  const key = posKey(row, col);
  if (merged.has(key)) return null;

  /* Same position: reuse if tile is available and matches value. */
  if (prevTiles[key] && prevTiles[key].textContent === String(value) && !claimedOld.has(key)) return key;

  /* Adjacent positions: prefer tiles that are close (likely moved here). */
  const adjacent = [];
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const pk = posKey(row + dr, col + dc);
    if (prevTiles[pk] && prevTiles[pk].textContent === String(value) && !claimedOld.has(pk)) {
      adjacent.push(pk);
    }
  }
  if (adjacent.length === 1) return adjacent[0];

  /* Any position with matching value: pick the closest one. */
  let bestPk = null;
  let bestDist = Infinity;
  for (const pk of Object.keys(prevTiles)) {
    if (claimedOld.has(pk)) continue;
    if (prevTiles[pk].textContent !== String(value)) continue;
    const [pr, pc] = pk.split(',').map(Number);
    const dist = Math.abs(pr - row) + Math.abs(pc - col);
    if (dist < bestDist) { bestDist = dist; bestPk = pk; }
  }
  return bestPk;
}

window._debugFindSource = function(row, col, value, prevTiles, merged) {
  const key = posKey(row, col);
  if (merged.has(key)) return 'merged';
  if (prevTiles[key] && prevTiles[key].textContent === String(value)) return 'same';
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const pk = posKey(row + dr, col + dc);
    if (prevTiles[pk] && prevTiles[pk].textContent === String(value)) return 'adjacent:'+pk;
  }
  for (const pk of Object.keys(prevTiles)) {
    if (prevTiles[pk].textContent === String(value)) return 'any:'+pk;
  }
  return 'none';
};

function renderScores() {
  scoreElement.textContent = String(state.score);
  bestScoreElement.textContent = String(state.bestScore);
}

function renderBoard() {
  renderGen += 1;
  const gen = renderGen;

  if (!prevBoard) {
    /* First render — build everything from scratch. */
    boardElement.innerHTML = '';
    /* Create all 16 background cells. */
    for (let row = 0; row < state.size; row += 1) {
      for (let col = 0; col < state.size; col += 1) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        boardElement.appendChild(cell);
      }
    }
    /* Create tile elements for non-zero values. */
    for (let row = 0; row < state.size; row += 1) {
      for (let col = 0; col < state.size; col += 1) {
        const value = state.board[row][col];
        if (value === 0) continue;
        const key = posKey(row, col);
        const tile = document.createElement('div');
        tile.className = 'tile tile-' + value;
        tile.style.gridRowStart = String(row + 1);
        tile.style.gridColumnStart = String(col + 1);
        tile.textContent = String(value);
        boardElement.appendChild(tile);
        tileMap[key] = tile;
      }
    }
    prevBoard = cloneBoard(state.board);
    return;
  }

  /* Subsequent renders — track tiles by position. */
  const oldTiles = { ...tileMap };
  Object.keys(tileMap).forEach((k) => delete tileMap[k]);

  const movedScore = prevBoard ? getMovedScore(state.board, prevBoard) : 0;
  const merged = detectMerges(state.board, prevBoard || [], movedScore);
  const newPositions = detectNewPositions(state.board, prevBoard || [], merged);
  const claimedOld = new Set();

  for (let row = 0; row < state.size; row += 1) {
    for (let col = 0; col < state.size; col += 1) {
      const value = state.board[row][col];
      if (value === 0) continue;
      const key = posKey(row, col);

      /* New tiles: create fresh element with pop animation, never reuse. */
      if (newPositions.has(key)) {
        const tile = document.createElement('div');
        tileMap[key] = tile;
        tile.className = 'tile tile-' + value;
        tile.style.gridRowStart = String(row + 1);
        tile.style.gridColumnStart = String(col + 1);
        tile.textContent = String(value);
        boardElement.appendChild(tile);
        animatePop(tile);
        continue;
      }

      const src = findSource(row, col, value, oldTiles, merged, claimedOld);
      let tile = src ? oldTiles[src] : null;

      if (tile && src) {
        claimedOld.add(src);
      } else {
        tile = document.createElement('div');
        boardElement.appendChild(tile);
      }

      tileMap[key] = tile;

      const oldRow = Number(tile.style.gridRowStart) - 1;
      const oldCol = Number(tile.style.gridColumnStart) - 1;
      const isNew = isNaN(oldRow) || isNaN(oldCol);
      const didMove = !isNew && (oldRow !== row || oldCol !== col);

      tile.className = 'tile tile-' + value;
      tile.style.gridRowStart = String(row + 1);
      tile.style.gridColumnStart = String(col + 1);
      tile.textContent = String(value);

      tile.classList.remove('tile-slide', 'tile-merge', 'tile-pop');
      if (isNew) {
        animatePop(tile);
      } else if (merged.has(key)) {
        animateMerge(tile);
      } else if (didMove) {
        animateSlide(tile, oldRow, oldCol, row, col);
      }
    }
  }

  /* Remove tiles that no longer exist on the board. */
  for (const key of Object.keys(oldTiles)) {
    if (claimedOld.has(key)) continue;
    const tile = oldTiles[key];
    if (!tile) continue;
    /* Immediately remove orphan tiles. */
    if (tile.parentNode) tile.parentNode.removeChild(tile);
  }

  prevBoard = cloneBoard(state.board);
}

function showSwipeHint(direction) {
  if (!swipeHintElement) return;
  swipeHintElement.textContent = SWIPE_HINT_ARROWS[direction] || '';
  swipeHintElement.classList.add('show');
  window.clearTimeout(swipeHintElement._timeout);
  swipeHintElement._timeout = window.setTimeout(() => swipeHintElement.classList.remove('show'), 260);
}

function renderOverlay() {
  if (state.gameOver) {
    overlayElement.classList.remove('hidden');
    overlayTitleElement.textContent = 'Game Over';
    overlayMessageElement.textContent = state.autoPlaying
      ? 'Autoplay stopped because there are no moves left.'
      : 'No more moves left. Give it another shot.';
    overlayButton.textContent = 'Play again';
    return;
  }
  if (state.won) {
    overlayElement.classList.remove('hidden');
    overlayTitleElement.textContent = 'You Win!';
    overlayMessageElement.textContent = 'You made 2048. Keep going or start fresh.';
    overlayButton.textContent = 'Keep going';
    return;
  }
  overlayElement.classList.add('hidden');
}

function renderControls() {
  autoplayPanel.classList.toggle('hidden', !state.autoplayUnlocked);
  autoplayButton.textContent = state.autoPlaying ? 'Stop Auto' : 'Auto Play';
  autoplayButton.setAttribute('aria-pressed', String(state.autoPlaying));
  autoplaySpeedSelect.disabled = state.autoPlaying;

  if (state.gameOver) { autoplayStatusElement.textContent = 'Game over'; return; }

  if (state.autoPlaying) {
    autoplayStatusElement.textContent = state.lastAutoMove
      ? `Auto playing · ${DIRECTION_LABELS[state.lastAutoMove]}`
      : 'Auto playing · Thinking';
    return;
  }

  autoplayStatusElement.textContent = state.autoplayUnlocked
    ? 'Extra tools unlocked'
    : 'Manual play';
}

function render() {
  renderScores();
  renderBoard();
  renderOverlay();
  renderControls();
}

/* ── settings modal ── */
function openSettings() {
  state.settingsOpen = true;
  settingsModal.classList.add('is-open');
  settingsModal.setAttribute('aria-hidden', 'false');
  redeemCodeInput.focus();
}

function closeSettings() {
  state.settingsOpen = false;
  settingsModal.classList.remove('is-open');
  settingsModal.setAttribute('aria-hidden', 'true');
}

function unlockAutoplay() {
  const value = redeemCodeInput.value.trim();
  if (value !== AUTOPLAY_UNLOCK_CODE) {
    redeemStatusElement.textContent = 'Invalid code. Please try again.';
    return;
  }
  state.autoplayUnlocked = true;
  saveAutoplayUnlocked();
  redeemStatusElement.textContent = 'Unlocked successfully. Extra tools are now available.';
  redeemCodeInput.value = '';
  renderControls();
}

/* ── autoplay ── */
function stopAutoPlay() {
  state.autoPlaying = false;
  state.lastAutoMove = null;
  if (state.autoPlayTimer) { window.clearTimeout(state.autoPlayTimer); state.autoPlayTimer = null; }
  renderControls();
}

function scheduleAutoPlayTick() {
  if (!state.autoPlaying) return;
  if (state.gameOver) { stopAutoPlay(); render(); return; }

  const best = getBestMove(state.board);
  if (!best) { stopAutoPlay(); render(); return; }

  state.lastAutoMove = best;
  applyMove(best);

  if (!state.autoPlaying || state.gameOver) {
    if (state.gameOver) { stopAutoPlay(); render(); }
    return;
  }

  state.autoPlayTimer = window.setTimeout(scheduleAutoPlayTick, state.autoPlayDelay);
}

function startAutoPlay() {
  if (!state.autoplayUnlocked || state.autoPlaying || state.gameOver) { renderControls(); return; }
  state.autoPlaying = true;
  state.lastAutoMove = null;
  renderControls();
  scheduleAutoPlayTick();
}

/* ── game flow ── */
function startGame() {
  state.board = createEmptyBoard();
  state.score = 0;
  state.gameOver = false;
  state.won = false;
  state.lastAutoMove = null;

  /* Clear tile tracking. */
  Object.values(tileMap).forEach((el) => { if (el.parentNode) el.parentNode.removeChild(el); });
  Object.keys(tileMap).forEach((k) => delete tileMap[k]);
  prevBoard = null;
  renderGen = 0;

  addRandomTile(state.board);
  addRandomTile(state.board);

  render();

  if (state.autoPlaying) {
    if (state.autoPlayTimer) { window.clearTimeout(state.autoPlayTimer); state.autoPlayTimer = null; }
    scheduleAutoPlayTick();
  }
}

function applyMove(direction) {
  if (state.gameOver) return false;

  const oldBoard = cloneBoard(state.board);
  const result = simulateMove(state.board, direction);
  if (!result.changed || boardsEqual(result.board, state.board)) return false;

  state.board = result.board;
  state.score += result.score;
  updateBestScore();
  addRandomTile(state.board);

  if (!state.won && has2048(state.board)) state.won = true;
  if (isGameOver(state.board)) state.gameOver = true;

  render();
  return true;
}

/* ── input ── */
function handleManualMove(direction) {
  if (!DIRECTIONS.includes(direction) || state.settingsOpen) return;
  if (state.autoPlaying) stopAutoPlay();
  const ok = applyMove(direction);
  if (ok) {
    showSwipeHint(direction);
    if (window.navigator.vibrate) window.navigator.vibrate(12);
  }
}

function handleTouchStart(event) {
  if (state.settingsOpen) return;
  const touch = event.changedTouches[0];
  state.touchStartX = touch.clientX;
  state.touchStartY = touch.clientY;
}

function handleTouchEnd(event) {
  if (state.settingsOpen || state.touchStartX === null || state.touchStartY === null) return;

  const now = Date.now();
  if (now - state.lastSwipeTime < SWIPE_COOLDOWN) {
    state.touchStartX = null;
    state.touchStartY = null;
    return;
  }

  const touch = event.changedTouches[0];
  const dx = touch.clientX - state.touchStartX;
  const dy = touch.clientY - state.touchStartY;
  state.touchStartX = null;
  state.touchStartY = null;

  if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

  state.lastSwipeTime = now;

  if (Math.abs(dx) > Math.abs(dy)) {
    handleManualMove(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
  } else {
    handleManualMove(dy > 0 ? 'ArrowDown' : 'ArrowUp');
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape' && state.settingsOpen) { closeSettings(); return; }
  if (!DIRECTIONS.includes(event.key)) return;
  event.preventDefault();
  handleManualMove(event.key);
}

/* ── event bindings ── */
restartButton.addEventListener('click', startGame);
settingsButton.addEventListener('click', openSettings);
closeSettingsButton.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (event) => {
  if (event.target.dataset.closeSettings === 'true') closeSettings();
});
redeemCodeButton.addEventListener('click', unlockAutoplay);
redeemCodeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') unlockAutoplay();
});
autoplayButton.addEventListener('click', () => {
  if (state.autoPlaying) { stopAutoPlay(); return; }
  startAutoPlay();
});
autoplaySpeedSelect.addEventListener('change', (event) => {
  state.autoPlayDelay = Number(event.target.value);
});
overlayButton.addEventListener('click', () => {
  if (state.gameOver) { startGame(); return; }
  if (state.won) { state.won = false; renderOverlay(); renderControls(); }
});
boardElement.addEventListener('touchstart', handleTouchStart, { passive: true });
boardElement.addEventListener('touchend', handleTouchEnd, { passive: true });
window.addEventListener('keydown', handleKeydown);

/* ── init ── */
if (IS_TOUCH_DEVICE && instructionsElement) {
  instructionsElement.textContent = 'Swipe to move the tiles.';
}

state.bestScore = loadBestScore();
startGame();

/* ── debug ── */
window.__2048Debug = {
  state,
  getBestMove: () => getBestMove(state.board),
  evaluateBoard,
  expectimax,
  simulateMove,
  startAutoPlay,
  stopAutoPlay,
  startGame,
  handleManualMove,
  handleTouchStart,
  handleTouchEnd,
  unlockAutoplay: () => {
    state.autoplayUnlocked = true;
    saveAutoplayUnlocked();
    renderControls();
  },
};
