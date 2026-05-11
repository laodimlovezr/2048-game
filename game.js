const boardElement = document.getElementById('game-board');
const scoreElement = document.getElementById('score');
const bestScoreElement = document.getElementById('best-score');
const restartButton = document.getElementById('restart-button');
const autoplayButton = document.getElementById('autoplay-button');
const autoplaySpeedSelect = document.getElementById('autoplay-speed');
const autoplayStatusElement = document.getElementById('autoplay-status');
const overlayElement = document.getElementById('game-overlay');
const overlayTitleElement = document.getElementById('overlay-title');
const overlayMessageElement = document.getElementById('overlay-message');
const overlayButton = document.getElementById('overlay-button');

const GRID_SIZE = 4;
const BEST_SCORE_KEY = '2048-best-score';
const DIRECTIONS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
const DIRECTION_LABELS = {
  ArrowUp: 'Up',
  ArrowRight: 'Right',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
};

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
};

function createEmptyBoard() {
  return Array.from({ length: state.size }, () => Array(state.size).fill(0));
}

function loadBestScore() {
  const storedScore = window.localStorage.getItem(BEST_SCORE_KEY);
  const parsedScore = Number.parseInt(storedScore ?? '0', 10);
  return Number.isNaN(parsedScore) ? 0 : parsedScore;
}

function saveBestScore() {
  window.localStorage.setItem(BEST_SCORE_KEY, String(state.bestScore));
}

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function getEmptyCells(board) {
  const cells = [];

  for (let row = 0; row < state.size; row += 1) {
    for (let column = 0; column < state.size; column += 1) {
      if (board[row][column] === 0) {
        cells.push({ row, column });
      }
    }
  }

  return cells;
}

function addRandomTile(board) {
  const emptyCells = getEmptyCells(board);

  if (emptyCells.length === 0) {
    return false;
  }

  const targetCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  board[targetCell.row][targetCell.column] = Math.random() < 0.9 ? 2 : 4;
  return true;
}

function slideAndMerge(line) {
  const tiles = line.filter((value) => value !== 0);
  const mergedTiles = [];
  let gainedScore = 0;

  for (let index = 0; index < tiles.length; index += 1) {
    const currentValue = tiles[index];
    const nextValue = tiles[index + 1];

    if (currentValue === nextValue) {
      const mergedValue = currentValue * 2;
      mergedTiles.push(mergedValue);
      gainedScore += mergedValue;
      index += 1;
      continue;
    }

    mergedTiles.push(currentValue);
  }

  while (mergedTiles.length < state.size) {
    mergedTiles.push(0);
  }

  const changed = mergedTiles.some((value, index) => value !== line[index]);
  return { line: mergedTiles, score: gainedScore, changed };
}

function transpose(board) {
  return board[0].map((_, column) => board.map((row) => row[column]));
}

function reverseRows(board) {
  return board.map((row) => [...row].reverse());
}

function boardsEqual(firstBoard, secondBoard) {
  return firstBoard.every((row, rowIndex) => row.every((value, columnIndex) => value === secondBoard[rowIndex][columnIndex]));
}

function moveLeft(board) {
  let gainedScore = 0;
  let changed = false;
  const nextBoard = board.map((row) => {
    const result = slideAndMerge(row);
    gainedScore += result.score;
    changed = changed || result.changed;
    return result.line;
  });

  return { board: nextBoard, score: gainedScore, changed };
}

function moveRight(board) {
  const reversedBoard = reverseRows(board);
  const result = moveLeft(reversedBoard);
  return {
    board: reverseRows(result.board),
    score: result.score,
    changed: result.changed,
  };
}

function moveUp(board) {
  const transposedBoard = transpose(board);
  const result = moveLeft(transposedBoard);
  return {
    board: transpose(result.board),
    score: result.score,
    changed: result.changed,
  };
}

function moveDown(board) {
  const transposedBoard = transpose(board);
  const result = moveRight(transposedBoard);
  return {
    board: transpose(result.board),
    score: result.score,
    changed: result.changed,
  };
}

function simulateMove(board, direction) {
  const workingBoard = cloneBoard(board);

  if (direction === 'ArrowLeft') {
    return moveLeft(workingBoard);
  }

  if (direction === 'ArrowRight') {
    return moveRight(workingBoard);
  }

  if (direction === 'ArrowUp') {
    return moveUp(workingBoard);
  }

  if (direction === 'ArrowDown') {
    return moveDown(workingBoard);
  }

  return { board: workingBoard, score: 0, changed: false };
}

function has2048(board) {
  return board.some((row) => row.some((value) => value === 2048));
}

function hasEmptyCell(board) {
  return board.some((row) => row.some((value) => value === 0));
}

function canMerge(board) {
  for (let row = 0; row < state.size; row += 1) {
    for (let column = 0; column < state.size; column += 1) {
      const currentValue = board[row][column];
      const rightValue = board[row][column + 1];
      const bottomValue = board[row + 1]?.[column];

      if (currentValue !== 0 && (currentValue === rightValue || currentValue === bottomValue)) {
        return true;
      }
    }
  }

  return false;
}

function isGameOver(board) {
  return !hasEmptyCell(board) && !canMerge(board);
}

function countPossibleMerges(board) {
  let merges = 0;

  for (let row = 0; row < state.size; row += 1) {
    for (let column = 0; column < state.size; column += 1) {
      const currentValue = board[row][column];
      if (currentValue === 0) {
        continue;
      }

      if (board[row][column + 1] === currentValue) {
        merges += 1;
      }

      if (board[row + 1]?.[column] === currentValue) {
        merges += 1;
      }
    }
  }

  return merges;
}

function calculateMonotonicity(board) {
  let total = 0;

  for (const row of board) {
    for (let index = 0; index < row.length - 1; index += 1) {
      total += row[index] >= row[index + 1] ? 1 : -1;
    }
  }

  const transposed = transpose(board);
  for (const column of transposed) {
    for (let index = 0; index < column.length - 1; index += 1) {
      total += column[index] >= column[index + 1] ? 1 : -1;
    }
  }

  return total;
}

function calculateSmoothness(board) {
  let penalty = 0;

  for (let row = 0; row < state.size; row += 1) {
    for (let column = 0; column < state.size; column += 1) {
      const currentValue = board[row][column];
      if (currentValue === 0) {
        continue;
      }

      const currentLog = Math.log2(currentValue);
      const rightValue = board[row][column + 1];
      const bottomValue = board[row + 1]?.[column];

      if (rightValue) {
        penalty += Math.abs(currentLog - Math.log2(rightValue));
      }

      if (bottomValue) {
        penalty += Math.abs(currentLog - Math.log2(bottomValue));
      }
    }
  }

  return -penalty;
}

function calculateCornerScore(board) {
  const maxTile = Math.max(...board.flat());
  const corners = [board[0][0], board[0][state.size - 1], board[state.size - 1][0], board[state.size - 1][state.size - 1]];
  return corners.includes(maxTile) ? maxTile : -maxTile * 0.5;
}

function evaluateBoard(board) {
  const emptyCells = getEmptyCells(board).length;
  const possibleMerges = countPossibleMerges(board);
  const monotonicity = calculateMonotonicity(board);
  const smoothness = calculateSmoothness(board);
  const maxTile = Math.max(...board.flat());
  const cornerScore = calculateCornerScore(board);

  return (
    emptyCells * 280 +
    possibleMerges * 110 +
    monotonicity * 16 +
    smoothness * 22 +
    cornerScore * 2.4 +
    Math.log2(maxTile || 1) * 90
  );
}

function getSearchDepth(board) {
  const emptyCells = getEmptyCells(board).length;

  if (emptyCells >= 8) {
    return 3;
  }

  if (emptyCells >= 5) {
    return 4;
  }

  return 5;
}

function expectimax(board, depth, isChanceTurn) {
  if (depth === 0 || isGameOver(board)) {
    return evaluateBoard(board);
  }

  if (!isChanceTurn) {
    let bestScore = Number.NEGATIVE_INFINITY;
    let foundMove = false;

    for (const direction of DIRECTIONS) {
      const result = simulateMove(board, direction);
      if (!result.changed) {
        continue;
      }

      foundMove = true;
      const moveScore = result.score * 8 + expectimax(result.board, depth - 1, true);
      if (moveScore > bestScore) {
        bestScore = moveScore;
      }
    }

    return foundMove ? bestScore : evaluateBoard(board);
  }

  const emptyCells = getEmptyCells(board);
  if (emptyCells.length === 0) {
    return expectimax(board, depth - 1, false);
  }

  let expectedScore = 0;
  const probabilityPerCell = 1 / emptyCells.length;

  for (const cell of emptyCells) {
    const boardWithTwo = cloneBoard(board);
    boardWithTwo[cell.row][cell.column] = 2;
    expectedScore += probabilityPerCell * 0.9 * expectimax(boardWithTwo, depth - 1, false);

    const boardWithFour = cloneBoard(board);
    boardWithFour[cell.row][cell.column] = 4;
    expectedScore += probabilityPerCell * 0.1 * expectimax(boardWithFour, depth - 1, false);
  }

  return expectedScore;
}

function getBestMove(board) {
  const depth = getSearchDepth(board);
  let bestDirection = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const direction of DIRECTIONS) {
    const result = simulateMove(board, direction);
    if (!result.changed) {
      continue;
    }

    const moveValue = result.score * 10 + expectimax(result.board, depth, true);
    if (moveValue > bestScore) {
      bestScore = moveValue;
      bestDirection = direction;
    }
  }

  return bestDirection;
}

function updateBestScore() {
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    saveBestScore();
  }
}

function stopAutoPlay() {
  state.autoPlaying = false;
  state.lastAutoMove = null;

  if (state.autoPlayTimer) {
    window.clearTimeout(state.autoPlayTimer);
    state.autoPlayTimer = null;
  }

  renderControls();
}

function renderScores() {
  scoreElement.textContent = String(state.score);
  bestScoreElement.textContent = String(state.bestScore);
}

function renderBoard() {
  boardElement.innerHTML = '';

  state.board.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const cellElement = document.createElement('div');
      cellElement.className = 'cell';
      boardElement.appendChild(cellElement);

      if (value === 0) {
        return;
      }

      const tileElement = document.createElement('div');
      tileElement.className = `tile tile-${value}`;
      tileElement.style.gridRowStart = String(rowIndex + 1);
      tileElement.style.gridColumnStart = String(columnIndex + 1);
      tileElement.textContent = String(value);
      boardElement.appendChild(tileElement);
    });
  });
}

function renderOverlay() {
  if (state.gameOver) {
    overlayElement.classList.remove('hidden');
    overlayTitleElement.textContent = 'Game Over';
    overlayMessageElement.textContent = state.autoPlaying ? 'Autoplay stopped because there are no moves left.' : 'No more moves left. Give it another shot.';
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
  autoplayButton.textContent = state.autoPlaying ? 'Stop Auto' : 'Auto Play';
  autoplayButton.setAttribute('aria-pressed', String(state.autoPlaying));
  autoplaySpeedSelect.disabled = state.autoPlaying;

  if (state.gameOver) {
    autoplayStatusElement.textContent = 'Game over';
    return;
  }

  if (state.autoPlaying) {
    const label = state.lastAutoMove ? `Auto playing · ${DIRECTION_LABELS[state.lastAutoMove]}` : 'Auto playing · Thinking';
    autoplayStatusElement.textContent = label;
    return;
  }

  autoplayStatusElement.textContent = 'Manual play';
}

function render() {
  renderScores();
  renderBoard();
  renderOverlay();
  renderControls();
}

function scheduleAutoPlayTick() {
  if (!state.autoPlaying) {
    return;
  }

  if (state.gameOver) {
    stopAutoPlay();
    render();
    return;
  }

  const bestDirection = getBestMove(state.board);

  if (!bestDirection) {
    stopAutoPlay();
    render();
    return;
  }

  state.lastAutoMove = bestDirection;
  applyMove(bestDirection);

  if (!state.autoPlaying || state.gameOver) {
    if (state.gameOver) {
      stopAutoPlay();
      render();
    }
    return;
  }

  state.autoPlayTimer = window.setTimeout(scheduleAutoPlayTick, state.autoPlayDelay);
}

function startAutoPlay() {
  if (state.autoPlaying || state.gameOver) {
    renderControls();
    return;
  }

  state.autoPlaying = true;
  state.lastAutoMove = null;
  renderControls();
  scheduleAutoPlayTick();
}

function startGame() {
  state.board = createEmptyBoard();
  state.score = 0;
  state.gameOver = false;
  state.won = false;
  state.lastAutoMove = null;
  addRandomTile(state.board);
  addRandomTile(state.board);
  render();

  if (state.autoPlaying) {
    if (state.autoPlayTimer) {
      window.clearTimeout(state.autoPlayTimer);
      state.autoPlayTimer = null;
    }

    scheduleAutoPlayTick();
  }
}

function applyMove(direction) {
  if (state.gameOver) {
    return false;
  }

  const result = simulateMove(state.board, direction);

  if (!result.changed || boardsEqual(result.board, state.board)) {
    return false;
  }

  state.board = result.board;
  state.score += result.score;
  updateBestScore();
  addRandomTile(state.board);

  if (!state.won && has2048(state.board)) {
    state.won = true;
  }

  if (isGameOver(state.board)) {
    state.gameOver = true;
  }

  render();
  return true;
}

function handleKeydown(event) {
  if (!DIRECTIONS.includes(event.key)) {
    return;
  }

  event.preventDefault();

  if (state.autoPlaying) {
    stopAutoPlay();
  }

  applyMove(event.key);
}

restartButton.addEventListener('click', startGame);
autoplayButton.addEventListener('click', () => {
  if (state.autoPlaying) {
    stopAutoPlay();
    return;
  }

  startAutoPlay();
});

autoplaySpeedSelect.addEventListener('change', (event) => {
  state.autoPlayDelay = Number(event.target.value);
});

overlayButton.addEventListener('click', () => {
  if (state.gameOver) {
    startGame();
    return;
  }

  if (state.won) {
    state.won = false;
    renderOverlay();
    renderControls();
  }
});

window.addEventListener('keydown', handleKeydown);

state.bestScore = loadBestScore();
startGame();
window.__2048Debug = {
  state,
  getBestMove: () => getBestMove(state.board),
  evaluateBoard,
  expectimax,
  simulateMove,
  startAutoPlay,
  stopAutoPlay,
  startGame,
};
