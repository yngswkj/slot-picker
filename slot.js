import gsap from 'https://cdn.jsdelivr.net/npm/gsap@3.12.7/index.js';

// ===== 定数 =====
  const DEFAULT_ITEM_HEIGHT = 64;
  const CENTER_OFFSET = 2;
  const BASE_REPEATS = 20;
  const SPIN_SPEED = 2500;
  const STOP_DURATION = 2200;
  const EASE_DERIV_AT_0 = 4.0;
  const MIN_STOP_DURATION = 800;
  const MAX_STOP_DURATION = 6000;
  const REACH_MIN_DURATION = 3000;
  const AUTO_STOP_DELAYS = [12000, 14000, 16000];
  const DEFAULT_REEL_WIDTH = 186;
  const DEFAULT_REEL_GAP = 10;
  const LS_KEY = 'slot-picker-items';
  const ACCEL_DURATION = 800;
  const GSAP_BOUNCE_DURATION = 0.22;
  const GSAP_BOUNCE_AMOUNT = 10;
  const REACH_EXTRA_DELAY = 1500;

  const WIN_LINES = [
    [0, 0, 0],
    [1, 1, 1],
    [2, 2, 2],
    [3, 3, 3],
    [4, 4, 4],
    [0, 1, 2],
    [4, 3, 2],
    [0, 2, 4],
    [4, 2, 0],
  ];

  const ALL_LINES = [
    [0, 0, 0],
    [1, 1, 1],
    [2, 2, 2],
    [3, 3, 3],
    [4, 4, 4],
    [0, 1, 2],
    [4, 3, 2],
    [0, 2, 4],
    [4, 2, 0],
    [1, 2, 3],
    [3, 2, 1],
    [2, 1, 0],
    [2, 3, 4],
  ];

  const State = { IDLE: 0, ACCELERATING: 1, SPINNING: 2, STOPPING: 3, STOPPED: 5 };

  // ===== 変数 =====
  let items = [];
  let choices = [];
  let winnerIndex = -1;
  let winningLine = null;
  let reelOrders = [];
  let reelWinnerIdx = [];
  let reels = [];
  let lastTime = 0;
  let animFrameId = null;
  let isReach = false;
  let isReachGenuine = false;
  let reelStopTimers = [];
  let reelRepeats = BASE_REPEATS;
  let layout = {
    itemHeight: DEFAULT_ITEM_HEIGHT,
    reelWidth: DEFAULT_REEL_WIDTH,
    reelGap: DEFAULT_REEL_GAP,
  };
  const reducedMotionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  let prefersReducedMotion = reducedMotionQuery ? reducedMotionQuery.matches : false;

  // ===== DOM参照 =====
  const itemInputEl = document.getElementById('item-input');
  const addBtnEl = document.getElementById('add-btn');
  const itemFormEl = document.getElementById('item-form');
  const itemListEl = document.getElementById('item-list');
  const startBtn = document.getElementById('start-btn');
  const resetBtnEl = document.getElementById('reset-btn');
  const slotOverlayEl = document.getElementById('slot-overlay');
  const slotMachineEl = document.getElementById('slot-machine');
  const modalResultEl = document.getElementById('modal-result');
  const modalCloseEl = document.getElementById('modal-close');
  const stopBtnsContainer = document.getElementById('reel-stop-buttons');
  const stopBtns = stopBtnsContainer ? Array.from(stopBtnsContainer.querySelectorAll('.reel-stop-btn')) : [];

  // ===== SoundEngine =====
  const soundEngine = {
    ctx: null,
    spinOsc: null,
    spinGain: null,

    init() {
      if (this.ctx) return;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    },

    startSpinSound() {
      this.init();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 80;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(this.ctx.destination);
      osc.start();
      this.spinOsc = osc;
      this.spinGain = gain;
    },

    stopSpinSound() {
      if (this.spinOsc) {
        this.spinGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
        this.spinOsc.stop(this.ctx.currentTime + 0.3);
        this.spinOsc = null;
      }
    },

    playStopSound() {
      this.init();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    },

    playReachSound() {
      this.init();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(800, this.ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.6);
    },

    createDelay(wetLevel = 0.3, delayTime = 0.18, feedback = 0.35) {
      const delay = this.ctx.createDelay();
      delay.delayTime.value = delayTime;
      const feedbackGain = this.ctx.createGain();
      feedbackGain.gain.value = feedback;
      const wetGain = this.ctx.createGain();
      wetGain.gain.value = wetLevel;
      delay.connect(feedbackGain);
      feedbackGain.connect(delay);
      delay.connect(wetGain);
      wetGain.connect(this.ctx.destination);
      return delay;
    },

    playWinFanfare() {
      this.init();
      const delay = this.createDelay(0.25, 0.2, 0.3);
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const startTime = this.ctx.currentTime + i * 0.15;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        gain.connect(delay);
        osc.start(startTime);
        osc.stop(startTime + 1.2);
      });
      // ハーモニクス（オクターブ上を薄く重ねる）
      const harmNotes = [1047, 1319];
      harmNotes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const startTime = this.ctx.currentTime + 0.45 + i * 0.12;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.08, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.0);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        gain.connect(delay);
        osc.start(startTime);
        osc.stop(startTime + 1.0);
      });
    },
  };

  // ===== ParticleSystem =====
  class ParticleSystem {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'particle-canvas';
      this.ctx = this.canvas.getContext('2d');
      this.particles = [];
      this.colors = ['#e94560', '#ff6b81', '#ffd700', '#00d4ff', '#7c4dff', '#fff'];
      this.running = false;
    }

    start(container) {
      container.appendChild(this.canvas);
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.particles = [];

      const shapes = ['rect', 'circle', 'triangle', 'star'];
      for (let i = 0; i < 120; i++) {
        this.particles.push({
          x: Math.random() * this.canvas.width,
          y: -20 - Math.random() * 200,
          vx: (Math.random() - 0.5) * 4,
          vy: Math.random() * 3 + 2,
          size: Math.random() * 8 + 4,
          rotation: Math.random() * 360,
          rotSpeed: (Math.random() - 0.5) * 10,
          color: this.colors[Math.floor(Math.random() * this.colors.length)],
          opacity: 1,
          shape: shapes[Math.floor(Math.random() * shapes.length)],
        });
      }
      this.running = true;
      this.animate();
    }

    animate() {
      if (!this.running) return;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      let alive = false;
      for (const p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.rotation += p.rotSpeed;
        if (p.y > this.canvas.height + 50) p.opacity -= 0.02;
        if (p.opacity <= 0) continue;
        alive = true;
        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate((p.rotation * Math.PI) / 180);
        this.ctx.globalAlpha = p.opacity;
        this.ctx.fillStyle = p.color;
        this.drawShape(p.shape, p.size);
        this.ctx.restore();
      }
      if (alive) {
        requestAnimationFrame(() => this.animate());
      } else {
        this.stop();
      }
    }

    drawShape(shape, size) {
      const half = size / 2;
      switch (shape) {
        case 'circle':
          this.ctx.beginPath();
          this.ctx.arc(0, 0, half, 0, Math.PI * 2);
          this.ctx.fill();
          break;
        case 'triangle':
          this.ctx.beginPath();
          this.ctx.moveTo(0, -half);
          this.ctx.lineTo(half, half);
          this.ctx.lineTo(-half, half);
          this.ctx.closePath();
          this.ctx.fill();
          break;
        case 'star': {
          this.ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const method = i === 0 ? 'moveTo' : 'lineTo';
            this.ctx[method](Math.cos(angle) * half, Math.sin(angle) * half);
          }
          this.ctx.closePath();
          this.ctx.fill();
          break;
        }
        default:
          this.ctx.fillRect(-half, -half / 2, size, size / 2);
      }
    }

    stop() {
      this.running = false;
      if (this.canvas.parentNode) this.canvas.remove();
    }
  }

  let particleSystem = null;

  // ===== イベント =====
  const handleAddItem = (event) => {
    if (event) event.preventDefault();
    addItem(itemInputEl.value);
  };

  if (itemFormEl) {
    itemFormEl.addEventListener('submit', handleAddItem);
  } else {
    addBtnEl.addEventListener('click', handleAddItem);
  }
  startBtn.addEventListener('click', start);
  resetBtnEl.addEventListener('click', resetWonStatus);
  stopBtns.forEach((btn, i) => {
    btn.addEventListener('click', () => onStopButtonClick(i));
  });
  modalCloseEl.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && slotOverlayEl.classList.contains('visible')) {
      e.preventDefault();
      // 左から順にまだ回転中のリールを停止
      for (let i = 0; i < reels.length; i++) {
        if (reels[i].state === State.SPINNING || reels[i].state === State.ACCELERATING) {
          onStopButtonClick(i);
          break;
        }
      }
    }
  });
  if (reducedMotionQuery) {
    if (typeof reducedMotionQuery.addEventListener === 'function') {
      reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
    } else if (typeof reducedMotionQuery.addListener === 'function') {
      reducedMotionQuery.addListener(handleReducedMotionChange);
    }
  }

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
    if (items.some((item) => item.name === trimmed)) {
      alert('同じ名前のアイテムが既に存在します');
      return;
    }
    items.push({ name: trimmed, won: false });
    saveItems();
    renderItemList();
    itemInputEl.value = '';
    itemInputEl.focus();

    // 新規アイテム追加アニメーション
    const newItem = itemListEl.lastElementChild;
    if (newItem && !prefersReducedMotion) {
      gsap.fromTo(newItem,
        { opacity: 0, scale: 0.8, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: "back.out(1.7)" }
      );
    }
  }

  function removeItem(index) {
    if (prefersReducedMotion) {
      items.splice(index, 1);
      saveItems();
      renderItemList();
      return;
    }

    const li = itemListEl.children[index];
    if (li) {
      gsap.to(li, {
        opacity: 0, scale: 0.85, y: -8,
        duration: 0.25, ease: "power2.in",
        onComplete: () => {
          items.splice(index, 1);
          saveItems();
          renderItemList();
        },
      });
    } else {
      items.splice(index, 1);
      saveItems();
      renderItemList();
    }
  }

  function resetWonStatus() {
    items.forEach((item) => (item.won = false));
    saveItems();
    renderItemList();

    // リセットアニメーション
    if (!prefersReducedMotion) {
      const itemRows = itemListEl.querySelectorAll('.item-row');
      gsap.fromTo(itemRows,
        { opacity: 0, y: 10, scale: 0.92 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, stagger: 0.03, ease: "power2.out" }
      );
    }
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
    const remaining = items.filter((i) => !i.won);
    startBtn.disabled = remaining.length < 3;
  }

  function handleReducedMotionChange(event) {
    prefersReducedMotion = event.matches;
  }

  function readCssVariablePx(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function refreshLayoutMetrics() {
    layout.itemHeight = readCssVariablePx('--item-height', DEFAULT_ITEM_HEIGHT);
    layout.reelWidth = readCssVariablePx('--reel-width', DEFAULT_REEL_WIDTH);
    layout.reelGap = readCssVariablePx('--reel-gap', DEFAULT_REEL_GAP);
  }

  function getVisibleItems() {
    return Math.max(1, Math.round(readCssVariablePx('--visible-items', 5)));
  }

  function clearWinOverlays() {
    const oldSvg = document.querySelector('.win-line-svg');
    if (oldSvg) oldSvg.remove();
    const oldCellLayer = document.querySelector('.win-cell-layer');
    if (oldCellLayer) oldCellLayer.remove();
  }

  function resolveReelRepeats(itemCount) {
    if (itemCount >= 60) return 8;
    if (itemCount >= 40) return 10;
    if (itemCount >= 24) return 14;
    if (itemCount >= 12) return 18;
    return BASE_REPEATS;
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
      const lineItems = [getItemAtRow(0, line[0]), getItemAtRow(1, line[1]), getItemAtRow(2, line[2])];
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
    // フォールバック: 偶然一致しているラインのリール配置を手動入れ替え
    fixAccidentalAlignment();
  }

  function fixAccidentalAlignment() {
    for (const line of ALL_LINES) {
      if (line[0] === winningLine[0] && line[1] === winningLine[1] && line[2] === winningLine[2]) {
        continue;
      }
      const lineItems = [getItemAtRow(0, line[0]), getItemAtRow(1, line[1]), getItemAtRow(2, line[2])];
      if (lineItems[0] === lineItems[1] && lineItems[1] === lineItems[2]) {
        // 3番目のリールの該当行を別アイテムとスワップ
        const order = reelOrders[2];
        const problemRow = line[2];
        const problemIdx = (reelWinnerIdx[2] + (problemRow - winningLine[2]) + order.length) % order.length;
        const matchedName = lineItems[2];
        // 一致しないアイテムを探してスワップ
        for (let s = 0; s < order.length; s++) {
          if (s !== problemIdx && order[s] !== matchedName) {
            [order[problemIdx], order[s]] = [order[s], order[problemIdx]];
            // winnerIdxを再計算
            reelWinnerIdx[2] = order.indexOf(choices[winnerIndex]);
            break;
          }
        }
      }
    }
  }

  // ===== イージング関数 =====
  function easeInQuad(t) {
    return t * t;
  }

  // C¹連続な減速曲線: easeOutQuart — f(t)=1-(1-t)⁴, f'(0)=4.0, f'(1)=0
  // 導関数が全区間で連続するため、停止前の不自然な速度ジャンプが起きない
  function easeOutSmooth(t) {
    const u = 1 - t;
    return 1 - u * u * u * u;
  }

  // ===== 当選ライン選択 =====
  function selectBestWinLine() {
    // 各WIN_LINEについて、偶然一致の起きにくさをスコアリング
    const shuffledLines = shuffle(WIN_LINES);
    let bestLine = shuffledLines[0];
    let bestScore = -1;

    for (const line of shuffledLines) {
      // このラインを仮選択した場合、他のALL_LINESとの行重複数をカウント
      let score = 0;
      for (const otherLine of ALL_LINES) {
        if (otherLine[0] === line[0] && otherLine[1] === line[1] && otherLine[2] === line[2]) continue;
        // 行が異なるほどスコアが高い（偶然一致しにくい）
        let diff = 0;
        for (let r = 0; r < 3; r++) {
          if (otherLine[r] !== line[r]) diff++;
        }
        score += diff;
      }
      if (score > bestScore) {
        bestScore = score;
        bestLine = line;
      }
    }
    return bestLine;
  }

  // ===== 開始 =====
  function start() {
    const remaining = items.filter((i) => !i.won);
    if (remaining.length < 3) {
      alert('未抽選のアイテムが3つ以上必要です');
      return;
    }

    choices = remaining.map((i) => i.name);
    refreshLayoutMetrics();
    reelRepeats = resolveReelRepeats(choices.length);
    winnerIndex = Math.floor(Math.random() * choices.length);
    winningLine = selectBestWinLine();
    generateReelOrders();
    isReach = false;

    startBtn.disabled = true;
    modalResultEl.textContent = '';
    gsap.killTweensOf([modalResultEl, modalCloseEl, slotMachineEl]);
    gsap.set(modalResultEl, { clearProps: "all" });
    gsap.set(modalCloseEl, { clearProps: "all" });
    modalCloseEl.classList.remove('visible');
    slotOverlayEl.classList.add('visible');
    document.body.style.overflow = 'hidden';
    slotOverlayEl.classList.remove('win-celebration');

    // モーダル入場アニメーション (GSAP)
    gsap.fromTo(slotMachineEl,
      { scale: 0.85, y: 30, opacity: 0 },
      { scale: 1, y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.7)", delay: 0.05 }
    );

    clearWinOverlays();
    const oldFlash = document.querySelector('.screen-flash');
    if (oldFlash) oldFlash.remove();
    const oldReachLabel = document.querySelector('.reach-label');
    if (oldReachLabel) oldReachLabel.remove();
    if (particleSystem) particleSystem.stop();

    const slotFrame = document.querySelector('.slot-frame');
    slotFrame.classList.remove('reach', 'reach-genuine');
    document.querySelectorAll('.reach-target').forEach((el) => el.classList.remove('reach-target'));
    if (!prefersReducedMotion) {
      gsap.fromTo(slotFrame,
        { x: 0, y: 0, rotation: 0 },
        {
          keyframes: [
            { x: -2, y: 1, rotation: -0.2, duration: 0.085 },
            { x: 2, y: -1, rotation: 0.2, duration: 0.085 },
            { x: -1, y: 2, rotation: -0.15, duration: 0.085 },
            { x: 0, y: 0, rotation: 0, duration: 0.085 },
          ],
          ease: "power2.out",
          clearProps: "x,y,rotation",
        }
      );
    }

    soundEngine.init();
    soundEngine.startSpinSound();

    initReels();

    lastTime = performance.now();
    animFrameId = requestAnimationFrame(loop);

    // 停止タイマーをクリアしてから設定
    reelStopTimers.forEach((t) => clearTimeout(t));
    reelStopTimers = [];

    // ストップボタンを有効化
    stopBtns.forEach((btn) => { btn.disabled = false; });
    if (stopBtnsContainer) stopBtnsContainer.classList.add('active');

    // 自動停止タイマー（フォールバック）
    reelStopTimers.push(setTimeout(() => triggerStop(0), AUTO_STOP_DELAYS[0]));
    reelStopTimers.push(setTimeout(() => triggerStop(1), AUTO_STOP_DELAYS[1]));
    reelStopTimers.push(setTimeout(() => triggerStop(2), AUTO_STOP_DELAYS[2]));
  }

  // ===== リール初期化 =====
  function initReels() {
    reels = [];
    for (let r = 0; r < 3; r++) {
      const windowEl = document.getElementById(`reel-${r}`);
      const stripEl = windowEl.querySelector('.reel-strip');
      const order = reelOrders[r];

      stripEl.innerHTML = '';
      stripEl.classList.remove('spinning');
      stripEl.style.filter = 'none';
      gsap.killTweensOf(stripEl);
      gsap.set(stripEl, { clearProps: 'transform' });
      for (let rep = 0; rep < reelRepeats; rep++) {
        for (let c = 0; c < order.length; c++) {
          const itemEl = document.createElement('div');
          itemEl.className = 'reel-item';
          itemEl.textContent = order[c];
          // 長いテキストのフォントサイズ縮小
          if (order[c].length > 8) {
            const scale = Math.max(0.65, 8 / order[c].length);
            itemEl.style.fontSize = `${scale}em`;
          }
          stripEl.appendChild(itemEl);
        }
      }

      const randomOffset = Math.floor(Math.random() * choices.length);
      const initialPos = -(randomOffset + choices.length * 2 - CENTER_OFFSET) * layout.itemHeight;

      const reel = {
        el: windowEl,
        stripEl: stripEl,
        position: initialPos,
        state: State.ACCELERATING,
        stopAnim: null,
        accelStartTime: performance.now(),
        reelIndex: r,
        repeatCount: reelRepeats,
        blurTween: null,
      };

      applyTransform(reel);
      reels.push(reel);
    }

    slotOverlayEl.classList.add('spinning-active');
  }

  // ===== アニメーション =====
  function loop(timestamp) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    for (const reel of reels) {
      switch (reel.state) {
        case State.ACCELERATING:
          updateAccelerating(reel, timestamp, deltaTime);
          break;
        case State.SPINNING:
          updateSpinning(reel, deltaTime);
          break;
        case State.STOPPING:
          updateStopping(reel, timestamp);
          break;
      }
    }

    if (reels.some((r) => r.state !== State.STOPPED)) {
      animFrameId = requestAnimationFrame(loop);
    } else {
      showResult();
    }
  }

  function updateAccelerating(reel, timestamp, deltaTime) {
    const elapsed = timestamp - reel.accelStartTime;
    const t = Math.min(elapsed / ACCEL_DURATION, 1.0);
    const easedT = easeInQuad(t);
    const currentSpeed = SPIN_SPEED * easedT;
    reel.position -= currentSpeed * (deltaTime / 1000);

    wrapPosition(reel);
    applyTransform(reel);

    if (t >= 1.0) {
      reel.state = State.SPINNING;
      reel.stripEl.classList.add('spinning');
    }
  }

  function updateSpinning(reel, deltaTime) {
    reel.position -= SPIN_SPEED * (deltaTime / 1000);
    wrapPosition(reel);
    applyTransform(reel);
  }

  function wrapPosition(reel) {
    const oneSetLength = choices.length * layout.itemHeight;
    const halfStrip = oneSetLength * (reel.repeatCount / 2);
    if (reel.position < -halfStrip) {
      reel.position += oneSetLength * Math.max(1, Math.floor(reel.repeatCount / 4));
    }
  }

  function triggerStop(reelIndex) {
    const reel = reels[reelIndex];
    if (reel.state !== State.SPINNING && reel.state !== State.ACCELERATING) return;

    // 加速中ならまず回転状態にする
    if (reel.state === State.ACCELERATING) {
      reel.state = State.SPINNING;
    }

    reel.stripEl.classList.remove('spinning');

    // ストップボタンを無効化
    if (stopBtns[reelIndex]) stopBtns[reelIndex].disabled = true;

    // リーチ時のリール判定
    const othersSettled = reels.filter((r, i) =>
      i !== reelIndex && (r.state === State.STOPPED || r.state === State.STOPPING)
    ).length;
    const isReachTarget = isReach && othersSettled === 2;

    const currentPos = reel.position;
    const endPos = calculateStopPosition(
      currentPos, reelWinnerIdx[reelIndex], choices.length, winningLine[reelIndex], isReachTarget
    );

    // 距離に基づいて自然な減速時間を算出（初速=SPIN_SPEEDに常に一致）
    const distance = currentPos - endPos;
    let duration = (distance * EASE_DERIV_AT_0 / SPIN_SPEED) * 1000;

    duration = Math.max(MIN_STOP_DURATION, Math.min(duration, MAX_STOP_DURATION));
    if (prefersReducedMotion) duration = Math.min(duration, 1200);

    reel.stopAnim = {
      startPos: currentPos,
      endPos: endPos,
      startTime: performance.now(),
      duration: duration,
    };
    reel.state = State.STOPPING;

    // CSSブラーをGSAPで同期（位置の減速と視覚的クリアネスを連動）
    if (reel.blurTween) reel.blurTween.kill();
    const blurObj = { value: 1.8 };
    reel.blurTween = gsap.to(blurObj, {
      value: 0,
      duration: duration / 1000 * 0.85,
      ease: 'power2.out',
      onUpdate: () => {
        reel.stripEl.style.filter = blurObj.value > 0.1
          ? `blur(${blurObj.value}px)` : 'none';
      },
    });
  }

  function calculateStopPosition(currentPos, winner, choicesLen, targetRow, isReachTarget) {
    const itemH = layout.itemHeight;
    const oneSetLen = choicesLen * itemH;
    const rowOffset = (targetRow - CENTER_OFFSET) * itemH;
    // リーチ対象リールは停止距離を増やすことで自然な初速のまま長時間回す
    const baseDuration = isReachTarget ? REACH_MIN_DURATION : MIN_STOP_DURATION;
    const minDistance = SPIN_SPEED * (baseDuration / 1000) / EASE_DERIV_AT_0;

    const fixedPart = currentPos + (winner - CENTER_OFFSET) * itemH - rowOffset;
    let k = Math.ceil((minDistance - fixedPart) / oneSetLen);
    if (k < 1) k = 1;

    return -(winner + k * choicesLen - CENTER_OFFSET) * itemH + rowOffset;
  }

  function updateStopping(reel, now) {
    const a = reel.stopAnim;
    const elapsed = now - a.startTime;
    const t = Math.min(elapsed / a.duration, 1.0);
    const easedT = easeOutSmooth(t);
    reel.position = a.startPos + (a.endPos - a.startPos) * easedT;
    applyTransform(reel);

    if (t >= 1.0) {
      reel.position = a.endPos;
      applyTransform(reel);
      reel.state = State.STOPPED;
      reel.stripEl.style.filter = 'none';
      if (reel.blurTween) { reel.blurTween.kill(); reel.blurTween = null; }

      // GSAP バウンス（自然なオーバーシュート）
      // endPos を基準に絶対座標で指定（y:0 にすると applyTransform の translateY が上書きされるため）
      if (!prefersReducedMotion) {
        const bounceAmt = Math.max(6, Math.round(layout.itemHeight * 0.16));
        const endY = reel.position;
        gsap.fromTo(reel.stripEl,
          { y: endY - bounceAmt, yPercent: 0 },
          {
            y: endY,
            yPercent: 0,
            duration: GSAP_BOUNCE_DURATION,
            ease: 'bounce.out',
            onComplete: () => onReelStopped(reel.reelIndex),
          }
        );
      } else {
        onReelStopped(reel.reelIndex);
      }
    }
  }

  function applyTransform(reel) {
    reel.stripEl.style.transform = `translateY(${reel.position}px)`;
  }

  function onStopButtonClick(reelIndex) {
    const reel = reels[reelIndex];
    if (!reel || (reel.state !== State.SPINNING && reel.state !== State.ACCELERATING)) return;
    clearTimeout(reelStopTimers[reelIndex]);
    triggerStop(reelIndex);
  }

  // ===== リール停止イベント =====
  function onReelStopped(reelIndex) {
    soundEngine.playStopSound();

    // 停止フラッシュ
    const windowEl = document.getElementById(`reel-${reelIndex}`);
    windowEl.classList.add('just-stopped');
    setTimeout(() => windowEl.classList.remove('just-stopped'), 300);

    const slotFrame = document.querySelector('.slot-frame');
    if (!prefersReducedMotion) {
      // フレーム振動 (GSAP)
      gsap.fromTo(slotFrame,
        { y: 0 },
        { y: 3, duration: 0.075, yoyo: true, repeat: 1, ease: "power2.out", clearProps: "y" }
      );
    }

    // 2つ目のリール停止時にリーチ判定
    const stoppedCount = reels.filter((r) => r.state === State.STOPPED).length;
    if (stoppedCount === 2 && checkReach()) {
      isReach = true;
      soundEngine.playReachSound();

      slotFrame.classList.add('reach');
      if (isReachGenuine) {
        slotFrame.classList.add('reach-genuine');
      }

      // 回転中のリールにreach-targetクラスを追加
      const spinningReelIdx = reels.findIndex((r) =>
        r.state === State.SPINNING || r.state === State.ACCELERATING
      );
      if (spinningReelIdx >= 0) {
        reels[spinningReelIdx].el.classList.add('reach-target');
      }

      const label = document.createElement('div');
      label.className = 'reach-label';
      label.textContent = 'リーチ！';
      slotFrame.appendChild(label);

      // 回転中のリールの自動停止タイマーを延長
      if (spinningReelIdx >= 0) {
        clearTimeout(reelStopTimers[spinningReelIdx]);
        const reachDelay = prefersReducedMotion ? Math.min(400, REACH_EXTRA_DELAY) : REACH_EXTRA_DELAY;
        reelStopTimers[spinningReelIdx] = setTimeout(() => triggerStop(spinningReelIdx), reachDelay);
      }
    }

    // 最後のリール停止時にスピン音を止める
    if (stoppedCount === 3) {
      soundEngine.stopSpinSound();
      slotOverlayEl.classList.remove('spinning-active');
    }
  }

  // ===== リーチ判定 =====
  function checkReach() {
    isReachGenuine = false;
    const stoppedReels = [];
    for (let i = 0; i < 3; i++) {
      if (reels[i].state === State.STOPPED) stoppedReels.push(i);
    }
    if (stoppedReels.length !== 2) return false;

    const [r1, r2] = stoppedReels;
    let hasReach = false;
    for (const line of WIN_LINES) {
      const item1 = getItemAtRow(r1, line[r1]);
      const item2 = getItemAtRow(r2, line[r2]);
      if (item1 === item2) {
        hasReach = true;
        if (line[0] === winningLine[0] && line[1] === winningLine[1] && line[2] === winningLine[2]) {
          isReachGenuine = true;
        }
      }
    }
    return hasReach;
  }

  // ===== 結果表示 (GSAP Timeline) =====
  function showResult() {
    const winnerName = choices[winnerIndex];

    // リーチ演出をクリーンアップ
    const slotFrame = document.querySelector('.slot-frame');
    slotFrame.classList.remove('reach', 'reach-genuine');
    document.querySelectorAll('.reach-target').forEach((el) => el.classList.remove('reach-target'));
    const reachLabel = document.querySelector('.reach-label');
    if (reachLabel) reachLabel.remove();

    // 当選テキスト設定
    modalResultEl.textContent = winnerName;

    // 当選アイテムを当選状態に更新
    const item = items.find((i) => i.name === winnerName && !i.won);
    if (item) {
      item.won = true;
      saveItems();
      renderItemList();
    }

    // 全て当選済みかチェック
    const remainingItems = items.filter((i) => !i.won);
    const isAllDone = remainingItems.length === 0;

    // ファンファーレ
    soundEngine.playWinFanfare();

    if (prefersReducedMotion) {
      drawWinLine();
      modalCloseEl.classList.add('visible');
      if (isAllDone) {
        const completeMsg = document.createElement('div');
        completeMsg.className = 'complete-message';
        completeMsg.textContent = '全て抽選完了！';
        modalResultEl.parentNode.insertBefore(completeMsg, modalResultEl.nextSibling);
      }
      return;
    }

    // ===== GSAP タイムライン演出 =====
    const tl = gsap.timeline();

    // 画面フラッシュ
    const flash = document.createElement('div');
    flash.className = 'screen-flash';
    document.body.appendChild(flash);
    tl.fromTo(flash,
      { opacity: 0.85 },
      { opacity: 0, duration: 0.52, ease: "power2.out", onComplete: () => flash.remove() },
      0
    );

    // 背景カラーシフト
    slotOverlayEl.classList.add('win-celebration');

    // 紙吹雪
    tl.call(() => {
      particleSystem = new ParticleSystem();
      particleSystem.start(slotOverlayEl);
    }, null, 0.08);

    // 当選テキスト演出 (elastic.out でバウンス)
    gsap.set(modalResultEl, { opacity: 0, scale: 0.3 });
    tl.to(modalResultEl,
      { scale: 1, opacity: 1, duration: 1.4, ease: "elastic.out(1.1, 0.5)" },
      0.12
    );

    // 当選ライン描画
    tl.call(() => drawWinLine(), null, 0.35);

    // 完了メッセージ
    if (isAllDone) {
      tl.call(() => {
        const completeMsg = document.createElement('div');
        completeMsg.className = 'complete-message';
        completeMsg.textContent = '全て抽選完了！';
        modalResultEl.parentNode.insertBefore(completeMsg, modalResultEl.nextSibling);
        gsap.fromTo(completeMsg,
          { y: 10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, ease: "power2.out" }
        );
      }, null, 2.5);
    }

    // 閉じるボタン表示
    const closeDelay = isAllDone ? 2.0 : 1.5;
    tl.call(() => {
      modalCloseEl.classList.add('visible');
      gsap.fromTo(modalCloseEl,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }
      );
    }, null, closeDelay);
  }

  function closeModal() {
    // 実行中のGSAPアニメーションをキル
    gsap.killTweensOf([slotMachineEl, modalResultEl, modalCloseEl]);

    if (prefersReducedMotion) {
      doCloseCleanup();
      return;
    }

    // GSAP モーダル退場アニメーション
    gsap.to(slotMachineEl, {
      scale: 0.9, opacity: 0, y: 20,
      duration: 0.3, ease: "power3.in",
      onComplete: doCloseCleanup,
    });
  }

  function doCloseCleanup() {
    slotOverlayEl.classList.remove('visible', 'win-celebration', 'spinning-active');
    modalCloseEl.classList.remove('visible');
    document.body.style.overflow = '';
    clearWinOverlays();
    if (particleSystem) particleSystem.stop();
    const completeMsg = document.querySelector('.complete-message');
    if (completeMsg) completeMsg.remove();
    // blurTweenをクリーンアップ
    for (const reel of reels) {
      if (reel.blurTween) { reel.blurTween.kill(); reel.blurTween = null; }
      reel.stripEl.style.filter = 'none';
      gsap.killTweensOf(reel.stripEl);
    }
    // ストップボタンをリセット
    if (stopBtnsContainer) stopBtnsContainer.classList.remove('active');
    stopBtns.forEach((btn) => { btn.disabled = true; });
    // reach-targetクラスをクリア
    document.querySelectorAll('.reach-target').forEach((el) => el.classList.remove('reach-target'));
    startBtn.disabled = false;
    updateStartButton();
    // GSAPインラインスタイルをクリア
    gsap.set([slotMachineEl, modalResultEl, modalCloseEl], { clearProps: "all" });
  }

  // ===== 当選ラインSVG =====
  function drawWinLine() {
    refreshLayoutMetrics();
    const container = document.querySelector('.reel-container');
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const reelWindows = Array.from(container.querySelectorAll('.reel-window'));
    if (reelWindows.length !== 3) return;
    const visibleItems = getVisibleItems();

    clearWinOverlays();

    const cellLayer = document.createElement('div');
    cellLayer.classList.add('win-cell-layer');

    const cellData = reelWindows.map((reelWindow, i) => {
      const reelRect = reelWindow.getBoundingClientRect();
      const reelStyle = getComputedStyle(reelWindow);
      const borderTop = Number.parseFloat(reelStyle.borderTopWidth) || 0;
      const borderBottom = Number.parseFloat(reelStyle.borderBottomWidth) || 0;
      const borderLeft = Number.parseFloat(reelStyle.borderLeftWidth) || 0;
      const borderRight = Number.parseFloat(reelStyle.borderRightWidth) || 0;

      const rowHeight = (reelRect.height - borderTop - borderBottom) / visibleItems;
      const left = reelRect.left - containerRect.left + borderLeft;
      const top = reelRect.top - containerRect.top + borderTop + winningLine[i] * rowHeight;
      const width = reelRect.width - borderLeft - borderRight;
      const height = rowHeight;

      const cellBox = document.createElement('div');
      cellBox.className = 'win-cell-box';
      cellBox.style.left = `${left}px`;
      cellBox.style.top = `${top}px`;
      cellBox.style.width = `${width}px`;
      cellBox.style.height = `${height}px`;
      cellLayer.appendChild(cellBox);

      return { left, top, width, height, cy: top + height / 2 };
    });

    container.appendChild(cellLayer);

    // SVG: リール間ギャップにのみコネクタ線を描画（セル上の文字を隠さない）
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('win-line-svg');
    svg.setAttribute('viewBox', `0 0 ${containerRect.width} ${containerRect.height}`);

    // 左端マーカー（右向き三角）
    const mkSize = 7;
    const lx = cellData[0].left - 3;
    const ly = cellData[0].cy;
    const leftMarker = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    leftMarker.setAttribute('points',
      `${lx - mkSize},${ly - mkSize} ${lx},${ly} ${lx - mkSize},${ly + mkSize}`);
    leftMarker.classList.add('win-marker');
    svg.appendChild(leftMarker);

    // 右端マーカー（左向き三角）
    const rx = cellData[2].left + cellData[2].width + 3;
    const ry = cellData[2].cy;
    const rightMarker = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    rightMarker.setAttribute('points',
      `${rx + mkSize},${ry - mkSize} ${rx},${ry} ${rx + mkSize},${ry + mkSize}`);
    rightMarker.classList.add('win-marker');
    svg.appendChild(rightMarker);

    // 左マーカー→リール0 左端
    const segments = [
      [lx, ly, cellData[0].left, cellData[0].cy],
    ];
    // リール間ギャップコネクタ
    for (let g = 0; g < 2; g++) {
      segments.push([
        cellData[g].left + cellData[g].width, cellData[g].cy,
        cellData[g + 1].left, cellData[g + 1].cy,
      ]);
    }
    // リール2 右端→右マーカー
    segments.push([
      cellData[2].left + cellData[2].width, cellData[2].cy,
      rx, ry,
    ]);

    for (const [x1, y1, x2, y2] of segments) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.classList.add('win-connector');
      svg.appendChild(line);
    }

    container.appendChild(svg);

    if (prefersReducedMotion) {
      cellLayer.classList.add('show');
      svg.classList.add('show');
      return;
    }

    // GSAP スタガー演出
    const cellBoxes = cellLayer.querySelectorAll('.win-cell-box');
    gsap.fromTo(cellBoxes,
      { opacity: 0, scale: 0.8 },
      {
        opacity: 1, scale: 1,
        duration: 0.35,
        stagger: 0.12,
        ease: "back.out(2.5)",
        onComplete: () => cellLayer.classList.add('show'),
      }
    );
    gsap.delayedCall(0.5, () => svg.classList.add('show'));
  }

// ===== 初期化 =====
refreshLayoutMetrics();
loadItems();

// 初回ロード時のアイテムスタガーアニメーション
if (!prefersReducedMotion) {
  const initialItems = itemListEl.querySelectorAll('.item-row');
  if (initialItems.length > 0) {
    gsap.fromTo(initialItems,
      { opacity: 0, y: 15, scale: 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: 0.35, stagger: 0.04, ease: "power2.out" }
    );
  }
}
