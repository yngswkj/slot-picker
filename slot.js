(() => {
  // ===== 定数 =====
  const ITEM_HEIGHT = 80;
  const CENTER_OFFSET = 1;
  const REPEATS = 20;
  const SPIN_SPEED = 2500;
  const EXTRA_ROTATIONS = 3;
  const STOP_DURATION = 1800;
  const STOP_DELAYS = [1500, 2500, 3500];
  const REEL_WIDTH = 180;
  const REEL_GAP = 6;
  const LS_KEY = 'slot-picker-items';

  const WIN_LINES = [
    [1, 1, 1],
    [0, 1, 2],
    [2, 1, 0],
  ];

  const ALL_LINES = [
    [0, 0, 0],
    [1, 1, 1],
    [2, 2, 2],
    [0, 1, 2],
    [2, 1, 0],
  ];

  const State = { IDLE: 0, SPINNING: 1, STOPPING: 2, STOPPED: 3 };

  // ===== 変数 =====
  let items = []; // {name, won}[]
  let choices = [];
  let winnerIndex = -1;
  let winningLine = null;
  let reelOrders = [];
  let reelWinnerIdx = [];
  let reels = [];
  let lastTime = 0;
  let animFrameId = null;

  // ===== DOM参照 =====
  const itemInputEl = document.getElementById('item-input');
  const addBtnEl = document.getElementById('add-btn');
  const itemListEl = document.getElementById('item-list');
  const startBtn = document.getElementById('start-btn');
  const resetBtnEl = document.getElementById('reset-btn');
  const slotMachineEl = document.getElementById('slot-machine');
  const modalResultEl = document.getElementById('modal-result');
  const modalCloseEl = document.getElementById('modal-close');

  // ===== イベント =====
  addBtnEl.addEventListener('click', () => addItem(itemInputEl.value));
  itemInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem(itemInputEl.value);
  });
  startBtn.addEventListener('click', start);
  resetBtnEl.addEventListener('click', resetWonStatus);
  modalCloseEl.addEventListener('click', closeModal);

  // ===== LocalStorage =====
  function loadItems() {
    try {
      const data = localStorage.getItem(LS_KEY);
      items = data ? JSON.parse(data) : [];
    } catch {
      items = [];
    }
    renderItemList();
  }

  function saveItems() {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  }

  // ===== アイテム管理 =====
  function addItem(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    items.push({ name: trimmed, won: false });
    saveItems();
    renderItemList();
    itemInputEl.value = '';
    itemInputEl.focus();
  }

  function removeItem(index) {
    items.splice(index, 1);
    saveItems();
    renderItemList();
  }

  function resetWonStatus() {
    items.forEach(item => item.won = false);
    saveItems();
    renderItemList();
  }

  function renderItemList() {
    itemListEl.innerHTML = '';
    items.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = `item-row${item.won ? ' won' : ''}`;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'item-name';
      nameSpan.textContent = item.name;

      const badge = document.createElement('span');
      badge.className = `item-badge ${item.won ? 'won' : 'pending'}`;
      badge.textContent = item.won ? '当選済' : '未抽選';

      const delBtn = document.createElement('button');
      delBtn.className = 'item-delete';
      delBtn.textContent = '\u00d7';
      delBtn.addEventListener('click', () => removeItem(i));

      li.appendChild(nameSpan);
      li.appendChild(badge);
      li.appendChild(delBtn);
      itemListEl.appendChild(li);
    });

    updateStartButton();
  }

  function updateStartButton() {
    const remaining = items.filter(i => !i.won);
    startBtn.disabled = remaining.length < 2;
  }

  // ===== Fisher-Yatesシャッフル =====
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function getItemAtRow(reelIdx, row) {
    const winRow = winningLine[reelIdx];
    const offset = row - winRow;
    const order = reelOrders[reelIdx];
    const len = order.length;
    return order[(reelWinnerIdx[reelIdx] + offset + len) % len];
  }

  function hasAccidentalAlignment() {
    for (const line of ALL_LINES) {
      if (line[0] === winningLine[0] && line[1] === winningLine[1] && line[2] === winningLine[2]) {
        continue;
      }
      const lineItems = [
        getItemAtRow(0, line[0]),
        getItemAtRow(1, line[1]),
        getItemAtRow(2, line[2]),
      ];
      if (lineItems[0] === lineItems[1] && lineItems[1] === lineItems[2]) {
        return true;
      }
    }
    return false;
  }

  function generateReelOrders() {
    const winner = choices[winnerIndex];
    for (let attempt = 0; attempt < 20; attempt++) {
      reelOrders = [];
      reelWinnerIdx = [];
      for (let r = 0; r < 3; r++) {
        const shuffled = shuffle(choices);
        reelOrders.push(shuffled);
        reelWinnerIdx.push(shuffled.indexOf(winner));
      }
      if (!hasAccidentalAlignment()) return;
    }
  }

  // ===== 開始 =====
  function start() {
    // 未当選アイテムのみを抽選対象にする
    const remaining = items.filter(i => !i.won);
    if (remaining.length < 2) {
      alert('未抽選のアイテムが2つ以上必要です');
      return;
    }

    choices = remaining.map(i => i.name);
    winnerIndex = Math.floor(Math.random() * choices.length);
    winningLine = WIN_LINES[Math.floor(Math.random() * WIN_LINES.length)];
    generateReelOrders();

    startBtn.disabled = true;
    modalResultEl.textContent = '';
    modalResultEl.classList.remove('flash');
    modalCloseEl.classList.remove('visible');
    slotMachineEl.classList.add('visible');

    const oldSvg = document.querySelector('.win-line-svg');
    if (oldSvg) oldSvg.remove();

    initReels();

    lastTime = performance.now();
    animFrameId = requestAnimationFrame(loop);

    STOP_DELAYS.forEach((delay, i) => {
      setTimeout(() => triggerStop(i), delay);
    });
  }

  // ===== リール初期化 =====
  function initReels() {
    reels = [];
    for (let r = 0; r < 3; r++) {
      const windowEl = document.getElementById(`reel-${r}`);
      const stripEl = windowEl.querySelector('.reel-strip');
      const order = reelOrders[r];

      stripEl.innerHTML = '';
      for (let rep = 0; rep < REPEATS; rep++) {
        for (let c = 0; c < order.length; c++) {
          const itemEl = document.createElement('div');
          itemEl.className = 'reel-item';
          itemEl.textContent = order[c];
          stripEl.appendChild(itemEl);
        }
      }

      const randomOffset = Math.floor(Math.random() * choices.length);
      const initialPos = -(randomOffset + choices.length * 2 - CENTER_OFFSET) * ITEM_HEIGHT;

      const reel = {
        el: windowEl,
        stripEl: stripEl,
        position: initialPos,
        state: State.SPINNING,
        stopAnim: null,
      };

      applyTransform(reel);
      reels.push(reel);
    }
  }

  // ===== アニメーション =====
  function loop(timestamp) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    for (const reel of reels) {
      if (reel.state === State.SPINNING) updateSpinning(reel, deltaTime);
      else if (reel.state === State.STOPPING) updateStopping(reel, timestamp);
    }

    if (reels.some(r => r.state === State.SPINNING || r.state === State.STOPPING)) {
      animFrameId = requestAnimationFrame(loop);
    } else {
      showResult();
    }
  }

  function updateSpinning(reel, deltaTime) {
    reel.position -= SPIN_SPEED * (deltaTime / 1000);
    const oneSetLength = choices.length * ITEM_HEIGHT;
    const halfStrip = oneSetLength * (REPEATS / 2);
    if (reel.position < -halfStrip) {
      reel.position += oneSetLength * Math.floor(REPEATS / 4);
    }
    applyTransform(reel);
  }

  function triggerStop(reelIndex) {
    const reel = reels[reelIndex];
    if (reel.state !== State.SPINNING) return;

    const currentPos = reel.position;
    const basePos = calculateStopPosition(currentPos, reelWinnerIdx[reelIndex], choices.length);
    const targetRow = winningLine[reelIndex];
    const rowOffset = (targetRow - CENTER_OFFSET) * ITEM_HEIGHT;
    const endPos = basePos + rowOffset;

    reel.stopAnim = {
      startPos: currentPos,
      endPos: endPos,
      startTime: performance.now(),
      duration: STOP_DURATION,
    };
    reel.state = State.STOPPING;
  }

  function calculateStopPosition(currentPos, winner, choicesLen) {
    const currentCenterFloat = CENTER_OFFSET - (currentPos / ITEM_HEIGHT);
    let nextK = Math.ceil((currentCenterFloat - winner) / choicesLen);
    if (nextK < 0) nextK = 0;
    const finalK = nextK + EXTRA_ROTATIONS;
    const targetStripIndex = winner + finalK * choicesLen;
    return -(targetStripIndex - CENTER_OFFSET) * ITEM_HEIGHT;
  }

  function updateStopping(reel, now) {
    const a = reel.stopAnim;
    const elapsed = now - a.startTime;
    const t = Math.min(elapsed / a.duration, 1.0);
    const easedT = easeOutCubic(t);
    reel.position = a.startPos + (a.endPos - a.startPos) * easedT;
    applyTransform(reel);

    if (t >= 1.0) {
      reel.position = a.endPos;
      applyTransform(reel);
      reel.state = State.STOPPED;
    }
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function applyTransform(reel) {
    reel.stripEl.style.transform = `translateY(${reel.position}px)`;
  }

  // ===== 結果表示 =====
  function showResult() {
    const winnerName = choices[winnerIndex];
    modalResultEl.textContent = winnerName;

    requestAnimationFrame(() => {
      modalResultEl.classList.add('flash');
    });

    drawWinLine();

    // 当選アイテムを当選状態に更新
    const item = items.find(i => i.name === winnerName && !i.won);
    if (item) {
      item.won = true;
      saveItems();
      renderItemList();
    }

    // 全て当選済みかチェック
    const remaining = items.filter(i => !i.won);
    if (remaining.length === 0) {
      setTimeout(() => {
        modalResultEl.textContent = `${winnerName} - 全て抽選完了！`;
      }, 2000);
    }

    // 閉じるボタンを表示
    setTimeout(() => {
      modalCloseEl.classList.add('visible');
    }, 1000);
  }

  function closeModal() {
    slotMachineEl.classList.remove('visible');
    modalCloseEl.classList.remove('visible');
    startBtn.disabled = false;
    updateStartButton();
  }

  // ===== 当選ラインSVG =====
  function drawWinLine() {
    const container = document.querySelector('.reel-container');
    const containerRect = container.getBoundingClientRect();

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('win-line-svg');
    svg.setAttribute('viewBox', `0 0 ${containerRect.width} ${containerRect.height}`);

    const points = winningLine.map((row, i) => {
      const x = i * (REEL_WIDTH + REEL_GAP) + REEL_WIDTH / 2;
      const y = row * ITEM_HEIGHT + ITEM_HEIGHT / 2;
      return `${x},${y}`;
    });

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points.join(' '));
    polyline.classList.add('win-line');
    svg.appendChild(polyline);

    container.appendChild(svg);

    requestAnimationFrame(() => {
      polyline.classList.add('show');
    });
  }

  // ===== 初期化 =====
  loadItems();
})();
