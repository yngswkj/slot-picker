(() => {
  // ===== 定数 =====
  const DEFAULT_ITEM_HEIGHT = 82;
  const CENTER_OFFSET = 1;
  const BASE_REPEATS = 20;
  const SPIN_SPEED = 2500;
  const EXTRA_ROTATIONS = 3;
  const STOP_DURATION = 2200;
  const STOP_DELAYS = [1500, 2500, 3500];
  const DEFAULT_REEL_WIDTH = 186;
  const DEFAULT_REEL_GAP = 10;
  const LS_KEY = 'slot-picker-items';
  const ACCEL_DURATION = 800;
  const BOUNCE_DURATION = 200;
  const DEFAULT_BOUNCE_AMOUNT = 12;
  const REACH_EXTRA_DELAY = 1500;
  const REACH_STOP_DURATION = 3000;

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

  const State = { IDLE: 0, ACCELERATING: 1, SPINNING: 2, STOPPING: 3, BOUNCING: 4, STOPPED: 5 };

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
  const itemListEl = document.getElementById('item-list');
  const startBtn = document.getElementById('start-btn');
  const resetBtnEl = document.getElementById('reset-btn');
  const slotMachineEl = document.getElementById('slot-machine');
  const modalResultEl = document.getElementById('modal-result');
  const modalCloseEl = document.getElementById('modal-close');

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

    playWinFanfare() {
      this.init();
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const startTime = this.ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.8);
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

      for (let i = 0; i < 100; i++) {
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
        this.ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        this.ctx.restore();
      }
      if (alive) {
        requestAnimationFrame(() => this.animate());
      } else {
        this.stop();
      }
    }

    stop() {
      this.running = false;
      if (this.canvas.parentNode) this.canvas.remove();
    }
  }

  let particleSystem = null;

  // ===== イベント =====
  addBtnEl.addEventListener('click', () => addItem(itemInputEl.value));
  itemInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem(itemInputEl.value);
  });
  startBtn.addEventListener('click', start);
  resetBtnEl.addEventListener('click', resetWonStatus);
  modalCloseEl.addEventListener('click', closeModal);
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
    items.forEach((item) => (item.won = false));
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
    const remaining = items.filter((i) => !i.won);
    startBtn.disabled = remaining.length < 2;
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
    return Math.max(1, Math.round(readCssVariablePx('--visible-items', 3)));
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

  function getBounceAmount() {
    if (prefersReducedMotion) {
      return Math.max(5, Math.round(layout.itemHeight * 0.08));
    }
    return Math.max(DEFAULT_BOUNCE_AMOUNT, Math.round(layout.itemHeight * 0.15));
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
  }

  // ===== イージング関数 =====
  function easeInQuad(t) {
    return t * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeOutWithSlow(t) {
    if (t < 0.7) {
      return 0.85 * easeOutCubic(t / 0.7);
    } else if (t < 0.85) {
      const localT = (t - 0.7) / 0.15;
      return 0.85 + 0.1 * localT;
    } else {
      const localT = (t - 0.85) / 0.15;
      return 0.95 + 0.05 * easeOutCubic(localT);
    }
  }

  // ===== 開始 =====
  function start() {
    const remaining = items.filter((i) => !i.won);
    if (remaining.length < 2) {
      alert('未抽選のアイテムが2つ以上必要です');
      return;
    }

    choices = remaining.map((i) => i.name);
    refreshLayoutMetrics();
    reelRepeats = resolveReelRepeats(choices.length);
    winnerIndex = Math.floor(Math.random() * choices.length);
    winningLine = WIN_LINES[Math.floor(Math.random() * WIN_LINES.length)];
    generateReelOrders();
    isReach = false;

    startBtn.disabled = true;
    modalResultEl.textContent = '';
    modalResultEl.classList.remove('flash', 'win-reveal');
    modalCloseEl.classList.remove('visible');
    slotMachineEl.classList.add('visible');
    slotMachineEl.classList.remove('win-celebration');

    clearWinOverlays();
    const oldFlash = document.querySelector('.screen-flash');
    if (oldFlash) oldFlash.remove();
    const oldReachLabel = document.querySelector('.reach-label');
    if (oldReachLabel) oldReachLabel.remove();
    if (particleSystem) particleSystem.stop();

    const slotFrame = document.querySelector('.slot-frame');
    slotFrame.classList.remove('reach');
    if (!prefersReducedMotion) {
      slotFrame.classList.add('starting');
      setTimeout(() => slotFrame.classList.remove('starting'), 300);
    }

    soundEngine.init();
    soundEngine.startSpinSound();

    initReels();

    lastTime = performance.now();
    animFrameId = requestAnimationFrame(loop);

    // 停止タイマーをクリアしてから設定
    reelStopTimers.forEach((t) => clearTimeout(t));
    reelStopTimers = [];

    reelStopTimers.push(setTimeout(() => triggerStop(0), STOP_DELAYS[0]));
    reelStopTimers.push(setTimeout(() => triggerStop(1), STOP_DELAYS[1]));
    // 3つ目のリールはリーチ判定後に動的に設定するため、初期タイマーも設定
    reelStopTimers.push(setTimeout(() => triggerStop(2), STOP_DELAYS[2]));
  }

  // ===== リール初期化 =====
  function initReels() {
    reels = [];
    for (let r = 0; r < 3; r++) {
      const windowEl = document.getElementById(`reel-${r}`);
      const stripEl = windowEl.querySelector('.reel-strip');
      const order = reelOrders[r];

      stripEl.innerHTML = '';
      stripEl.classList.remove('spinning', 'blur-light');
      for (let rep = 0; rep < reelRepeats; rep++) {
        for (let c = 0; c < order.length; c++) {
          const itemEl = document.createElement('div');
          itemEl.className = 'reel-item';
          itemEl.textContent = order[c];
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
      };

      applyTransform(reel);
      reels.push(reel);
    }

    slotMachineEl.classList.add('spinning-active');
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
        case State.BOUNCING:
          updateBouncing(reel, timestamp);
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
    reel.stripEl.classList.add('blur-light');

    const currentPos = reel.position;
    const basePos = calculateStopPosition(currentPos, reelWinnerIdx[reelIndex], choices.length);
    const targetRow = winningLine[reelIndex];
    const rowOffset = (targetRow - CENTER_OFFSET) * layout.itemHeight;
    const endPos = basePos + rowOffset;

    let duration = isReach && reelIndex === 2 ? REACH_STOP_DURATION : STOP_DURATION;
    if (prefersReducedMotion) duration = Math.min(duration, 1200);

    reel.stopAnim = {
      startPos: currentPos,
      endPos: endPos,
      startTime: performance.now(),
      duration: duration,
      bounceStartTime: 0,
    };
    reel.state = State.STOPPING;
  }

  function calculateStopPosition(currentPos, winner, choicesLen) {
    const currentCenterFloat = CENTER_OFFSET - currentPos / layout.itemHeight;
    let nextK = Math.ceil((currentCenterFloat - winner) / choicesLen);
    if (nextK < 0) nextK = 0;
    const finalK = nextK + EXTRA_ROTATIONS;
    const targetStripIndex = winner + finalK * choicesLen;
    return -(targetStripIndex - CENTER_OFFSET) * layout.itemHeight;
  }

  function updateStopping(reel, now) {
    const a = reel.stopAnim;
    const elapsed = now - a.startTime;
    const t = Math.min(elapsed / a.duration, 1.0);
    const easedT = easeOutWithSlow(t);
    reel.position = a.startPos + (a.endPos - a.startPos) * easedT;
    applyTransform(reel);

    if (t >= 1.0) {
      reel.position = a.endPos;
      applyTransform(reel);
      a.bounceStartTime = now;
      reel.state = State.BOUNCING;
    }
  }

  function updateBouncing(reel, now) {
    const a = reel.stopAnim;
    const elapsed = now - a.bounceStartTime;
    const t = Math.min(elapsed / BOUNCE_DURATION, 1.0);
    const bounce = Math.sin(t * Math.PI) * getBounceAmount();
    reel.position = a.endPos - bounce;
    applyTransform(reel);

    if (t >= 1.0) {
      reel.position = a.endPos;
      applyTransform(reel);
      reel.state = State.STOPPED;
      reel.stripEl.classList.remove('blur-light');
      onReelStopped(reel.reelIndex);
    }
  }

  function applyTransform(reel) {
    reel.stripEl.style.transform = `translateY(${reel.position}px)`;
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
      // フレーム振動
      slotFrame.classList.remove('reel-impact');
      void slotFrame.offsetWidth; // reflow
      slotFrame.classList.add('reel-impact');
      setTimeout(() => slotFrame.classList.remove('reel-impact'), 150);
    }

    // 2つ目のリール停止時にリーチ判定
    const stoppedCount = reels.filter((r) => r.state === State.STOPPED).length;
    if (stoppedCount === 2 && checkReach()) {
      isReach = true;
      soundEngine.playReachSound();

      slotFrame.classList.add('reach');

      const label = document.createElement('div');
      label.className = 'reach-label';
      label.textContent = 'リーチ！';
      slotFrame.appendChild(label);

      // 3つ目のリールがまだ回転中なら停止タイマーを延長
      const reel2 = reels[2];
      if (reel2.state === State.SPINNING || reel2.state === State.ACCELERATING) {
        clearTimeout(reelStopTimers[2]);
        const reachDelay = prefersReducedMotion ? Math.min(400, REACH_EXTRA_DELAY) : REACH_EXTRA_DELAY;
        reelStopTimers[2] = setTimeout(() => triggerStop(2), reachDelay);
      }
    }

    // 最後のリール停止時にスピン音を止める
    if (stoppedCount === 3) {
      soundEngine.stopSpinSound();
      slotMachineEl.classList.remove('spinning-active');
    }
  }

  // ===== リーチ判定 =====
  function checkReach() {
    for (const line of ALL_LINES) {
      const i0 = getItemAtRow(0, line[0]);
      const i1 = getItemAtRow(1, line[1]);
      if (i0 === i1) return true;
    }
    return false;
  }

  // ===== 結果表示 =====
  function showResult() {
    const winnerName = choices[winnerIndex];

    if (!prefersReducedMotion) {
      // 画面フラッシュ
      const flash = document.createElement('div');
      flash.className = 'screen-flash';
      document.body.appendChild(flash);
      flash.addEventListener('animationend', () => flash.remove());

      // 背景カラーシフト
      slotMachineEl.classList.add('win-celebration');
    }

    // ファンファーレ
    soundEngine.playWinFanfare();

    if (!prefersReducedMotion) {
      // 紙吹雪
      particleSystem = new ParticleSystem();
      particleSystem.start(slotMachineEl);
    }

    // 当選テキスト
    modalResultEl.textContent = winnerName;
    if (!prefersReducedMotion) {
      requestAnimationFrame(() => {
        modalResultEl.classList.add('win-reveal');
      });
    }

    drawWinLine();

    // リーチ演出をクリーンアップ
    const slotFrame = document.querySelector('.slot-frame');
    slotFrame.classList.remove('reach');
    const reachLabel = document.querySelector('.reach-label');
    if (reachLabel) reachLabel.remove();

    // 当選アイテムを当選状態に更新
    const item = items.find((i) => i.name === winnerName && !i.won);
    if (item) {
      item.won = true;
      saveItems();
      renderItemList();
    }

    // 全て当選済みかチェック
    const remainingItems = items.filter((i) => !i.won);
    if (remainingItems.length === 0) {
      setTimeout(() => {
        modalResultEl.textContent = `${winnerName} - 全て抽選完了！`;
      }, 2000);
    }

    // 閉じるボタンを表示
    setTimeout(() => {
      modalCloseEl.classList.add('visible');
    }, 1500);
  }

  function closeModal() {
    slotMachineEl.classList.remove('visible', 'win-celebration', 'spinning-active');
    modalCloseEl.classList.remove('visible');
    clearWinOverlays();
    if (particleSystem) particleSystem.stop();
    startBtn.disabled = false;
    updateStartButton();
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

    const points = reelWindows.map((reelWindow, i) => {
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

      const x = left + width / 2;
      const y = top + height / 2;
      return `${x},${y}`;
    });

    container.appendChild(cellLayer);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('win-line-svg');
    svg.setAttribute('viewBox', `0 0 ${containerRect.width} ${containerRect.height}`);

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points.join(' '));
    polyline.classList.add('win-line');
    svg.appendChild(polyline);

    container.appendChild(svg);

    requestAnimationFrame(() => {
      cellLayer.classList.add('show');
      polyline.classList.add('show');
    });
  }

  // ===== 初期化 =====
  refreshLayoutMetrics();
  loadItems();
})();
