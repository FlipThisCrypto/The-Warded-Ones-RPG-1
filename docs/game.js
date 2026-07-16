// The Warded Ones RPG 1 - Game Engine
// Fiend Studios © 2025

'use strict';

// ─── Constants ────────────────────────────────────────────────
const GAME_VERSION = '0.2.0';
const SAVE_KEY = 'warded_ones_save_v1';

// ─── Game State Machine ───────────────────────────────────────
const STATE = {
  LOADING: 'LOADING',
  TITLE: 'TITLE',
  MENU: 'MENU',
  CUTSCENE: 'CUTSCENE',
  EXPLORE: 'EXPLORE',
  DIALOGUE: 'DIALOGUE',
  BATTLE: 'BATTLE',
  VICTORY: 'VICTORY',
  DEFEAT: 'DEFEAT',
  QUEST_COMPLETE: 'QUEST_COMPLETE',
  PAUSE: 'PAUSE',
};

// ─── Main Game Class ──────────────────────────────────────────
class WardedOnesGame {
  constructor() {
    this.state = STATE.LOADING;
    this.data = {};
    this.party = [];
    this.inventory = [];
    this.quests = [];
    this.gold = 0;
    this.playtime = 0;
    this.saveExists = false;

    this.battle = null;
    this.dialogue = null;
    this.explore = null;
    this.ui = null;

    this.images = {};
    this.loadedImages = 0;
    this.totalImages = 0;

    this.lastTime = 0;
    this.animFrame = 0;
    this.animTimer = 0;
    this.titleGlow = 0;
    this.particleTime = 0;
    this.particles = [];

    this.input = new InputManager(this);
    this.audio = new AudioManager();
  }

  async init() {
    // Load game data
    const [chars, enemies, abilities, items, quests, dialogue] = await Promise.all([
      fetch('data/characters.json').then(r => r.json()),
      fetch('data/enemies.json').then(r => r.json()),
      fetch('data/abilities.json').then(r => r.json()),
      fetch('data/items.json').then(r => r.json()),
      fetch('data/quests.json').then(r => r.json()),
      fetch('data/dialogue.json').then(r => r.json()),
    ]);

    this.data.characters = chars;
    this.data.enemies = enemies;
    this.data.abilities = abilities;
    this.data.items = items;
    this.data.questDefs = quests;
    this.data.dialogue = dialogue;

    // Preload images
    const imageList = [
      'assets/ui/logo.png',
      'assets/ui/banner.png',
      'assets/ui/title_char.png',
      'assets/characters/motley_max.png',
      'assets/characters/gloam.png',
      'assets/characters/tumbling_tess.png',
      'assets/enemies/abyss_tiger.png',
      'assets/enemies/arcane_leopard.png',
      'assets/enemies/blaze_lion.png',
      'assets/enemies/azure_tiger.png',
      'assets/enemies/arctic_lion.png',
      'assets/backgrounds/battle_bg.jpg',
      'assets/backgrounds/battle_bg2.jpg',
      'assets/backgrounds/battle_bg3.jpg',
    ];

    this.totalImages = imageList.length;
    await this.preloadImages(imageList);

    this.saveExists = !!localStorage.getItem(SAVE_KEY);
    this.state = STATE.TITLE;
    this.ui = new UI(this);
    this.explore = new ExploreManager(this);
    this.requestFrame();
  }

  preloadImages(list) {
    return new Promise(resolve => {
      if (list.length === 0) { resolve(); return; }
      let done = 0;
      list.forEach(src => {
        const img = new Image();
        img.onload = () => {
          this.images[src] = img;
          done++;
          this.loadedImages = done;
          if (done === list.length) resolve();
        };
        img.onerror = () => {
          done++;
          this.loadedImages = done;
          if (done === list.length) resolve();
        };
        img.src = src;
      });
    });
  }

  requestFrame() {
    requestAnimationFrame(ts => this.loop(ts));
  }

  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;
    this.animTimer += dt;
    this.titleGlow = (Math.sin(this.animTimer * 1.5) + 1) / 2;
    this.particleTime += dt;

    this.update(dt);
    this.render();
    this.requestFrame();
  }

  update(dt) {
    if (this.state === STATE.TITLE) this.updateParticles(dt);
    if (this.state === STATE.BATTLE && this.battle) this.battle.update(dt);
  }

  // ─── Rendering ────────────────────────────────────────────
  render() {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    switch (this.state) {
      case STATE.TITLE: this.renderTitle(ctx, canvas); break;
      case STATE.MENU: this.ui.renderMenu(ctx, canvas); break;
      case STATE.CUTSCENE: this.ui.renderCutscene(ctx, canvas); break;
      case STATE.EXPLORE: this.explore.render(ctx, canvas); break;
      case STATE.DIALOGUE: this.renderDialogueOverlay(ctx, canvas); break;
      case STATE.BATTLE: if (this.battle) this.battle.render(ctx, canvas); break;
      case STATE.VICTORY: if (this.battle) this.battle.renderVictory(ctx, canvas); break;
      case STATE.DEFEAT: if (this.battle) this.battle.renderDefeat(ctx, canvas); break;
      case STATE.QUEST_COMPLETE: this.ui.renderQuestComplete(ctx, canvas); break;
      case STATE.PAUSE: this.explore.render(ctx, canvas); this.ui.renderPause(ctx, canvas); break;
    }
  }

  // ─── Title Screen ─────────────────────────────────────────
  renderTitle(ctx, canvas) {
    const W = canvas.width, H = canvas.height;

    // Deep dark gradient background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#050010');
    grad.addColorStop(0.5, '#0a0520');
    grad.addColorStop(1, '#000008');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Draw particles
    this.renderParticles(ctx);

    // Atmospheric glow
    const glow = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.6);
    glow.addColorStop(0, `rgba(80, 20, 120, ${0.15 + this.titleGlow * 0.1})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Title character portrait (right side)
    const titleChar = this.images['assets/ui/title_char.png'];
    if (titleChar) {
      const cH = Math.min(H * 0.8, 500);
      const cW = cH;
      ctx.globalAlpha = 0.7;
      ctx.drawImage(titleChar, W - cW * 0.6, H - cH, cW, cH);
      ctx.globalAlpha = 1;
    }

    // Decorative line
    ctx.strokeStyle = `rgba(180, 100, 255, ${0.4 + this.titleGlow * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.05, H * 0.32);
    ctx.lineTo(W * 0.95, H * 0.32);
    ctx.stroke();

    // "THE WARDED ONES" title
    const titleY = H * 0.22;
    ctx.textAlign = 'center';

    // Shadow/glow
    ctx.shadowColor = `rgba(160, 60, 255, ${0.6 + this.titleGlow * 0.4})`;
    ctx.shadowBlur = 30 + this.titleGlow * 20;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(W * 0.065)}px 'Cinzel', 'Georgia', serif`;
    ctx.fillText('THE WARDED ONES', W / 2, titleY);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = `${Math.floor(W * 0.025)}px 'Cinzel', 'Georgia', serif`;
    ctx.fillStyle = `rgba(200, 150, 255, ${0.7 + this.titleGlow * 0.3})`;
    ctx.fillText("JESTER'S TRIAL", W / 2, titleY + Math.floor(W * 0.042));

    ctx.strokeStyle = `rgba(180, 100, 255, ${0.4 + this.titleGlow * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.05, H * 0.34);
    ctx.lineTo(W * 0.95, H * 0.34);
    ctx.stroke();

    // Menu items
    const menuItems = [
      { label: '▶  NEW GAME', y: H * 0.48, action: 'new_game' },
      { label: this.saveExists ? '◈  CONTINUE' : '○  CONTINUE', y: H * 0.56, action: 'continue', disabled: !this.saveExists },
      { label: '⚙  SETTINGS', y: H * 0.64, action: 'settings' },
    ];

    menuItems.forEach((item, i) => {
      const selected = this.ui && this.ui.titleSelection === i;
      ctx.font = `${Math.floor(W * 0.022)}px 'Cinzel', 'Georgia', serif`;

      if (item.disabled) {
        ctx.fillStyle = 'rgba(100, 70, 130, 0.5)';
      } else if (selected) {
        ctx.shadowColor = 'rgba(200, 100, 255, 0.8)';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#f0c060';
      } else {
        ctx.fillStyle = 'rgba(200, 160, 255, 0.9)';
      }

      ctx.textAlign = 'center';
      ctx.fillText(item.label, W / 2, item.y);
      ctx.shadowBlur = 0;
    });

    // Version and studio tag
    ctx.font = `${Math.floor(W * 0.012)}px monospace`;
    ctx.fillStyle = 'rgba(120, 80, 160, 0.6)';
    ctx.textAlign = 'left';
    ctx.fillText(`v${GAME_VERSION}`, W * 0.02, H * 0.97);
    ctx.textAlign = 'right';
    ctx.fillText('FIEND STUDIOS © 2025', W * 0.98, H * 0.97);

    // Press key prompt
    ctx.textAlign = 'center';
    ctx.font = `${Math.floor(W * 0.014)}px 'Georgia', serif`;
    ctx.fillStyle = `rgba(180, 140, 220, ${0.5 + this.titleGlow * 0.5})`;
    ctx.fillText('[ ENTER / CLICK to select ]', W / 2, H * 0.88);
  }

  // ─── Particle System ──────────────────────────────────────
  updateParticles(dt) {
    // Spawn
    if (this.particles.length < 60 && Math.random() < 0.3) {
      const canvas = document.getElementById('game-canvas');
      this.particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height + 10,
        vx: (Math.random() - 0.5) * 20,
        vy: -(20 + Math.random() * 50),
        life: 1,
        size: 1 + Math.random() * 3,
        color: Math.random() < 0.5 ? 'rgba(150,80,255,' : 'rgba(255,200,80,',
      });
    }
    // Update
    this.particles = this.particles.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 0.3;
      return p.life > 0 && p.y > -20;
    });
  }

  renderParticles(ctx) {
    this.particles.forEach(p => {
      ctx.fillStyle = p.color + p.life * 0.8 + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ─── New Game ─────────────────────────────────────────────
  startNewGame() {
    this.party = this.data.characters.map(c => this.createPartyMember(c));
    this.inventory = [
      { id: 'healing_potion', quantity: 3 },
      { id: 'ether_orb', quantity: 2 },
      { id: 'ward_shard', quantity: 2 },
    ];
    this.gold = 50;
    this.quests = JSON.parse(JSON.stringify(this.data.questDefs));
    this.playtime = 0;

    // Start with intro cutscene
    this.dialogue = new DialogueManager(this, 'intro', () => {
      this.state = STATE.EXPLORE;
      this.explore.init();
    });
    this.state = STATE.CUTSCENE;
  }

  createPartyMember(charDef) {
    return {
      ...charDef,
      currentHp: charDef.stats.hp,
      currentMp: charDef.stats.mp,
      level: 1,
      exp: 0,
      expToNext: 100,
      statusEffects: [],
    };
  }

  // ─── Save / Load ─────────────────────────────────────────
  save() {
    const saveData = {
      version: GAME_VERSION,
      timestamp: Date.now(),
      playtime: this.playtime,
      gold: this.gold,
      party: this.party.map(m => ({
        id: m.id,
        level: m.level,
        exp: m.exp,
        expToNext: m.expToNext,
        currentHp: m.currentHp,
        currentMp: m.currentMp,
      })),
      inventory: this.inventory,
      quests: this.quests,
      exploreState: this.explore ? this.explore.getSaveData() : null,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    this.saveExists = true;
    return true;
  }

  load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      this.gold = data.gold || 0;
      this.playtime = data.playtime || 0;
      this.inventory = data.inventory || [];
      this.quests = data.quests || JSON.parse(JSON.stringify(this.data.questDefs));

      this.party = data.party.map(saved => {
        const def = this.data.characters.find(c => c.id === saved.id);
        if (!def) return null;
        const member = this.createPartyMember(def);
        member.level = saved.level;
        member.exp = saved.exp;
        member.expToNext = saved.expToNext;
        member.currentHp = saved.currentHp;
        member.currentMp = saved.currentMp;
        return member;
      }).filter(Boolean);

      this.explore = new ExploreManager(this);
      this.explore.init(data.exploreState);
      this.state = STATE.EXPLORE;
      return true;
    } catch (e) {
      console.error('Save load failed:', e);
      return false;
    }
  }

  // ─── Dialogue ─────────────────────────────────────────────
  startDialogue(key, onComplete) {
    this.dialogue = new DialogueManager(this, key, onComplete);
    this.prevState = this.state;
    this.state = STATE.DIALOGUE;
  }

  renderDialogueOverlay(ctx, canvas) {
    // Render explore underneath if coming from explore
    if (this.prevState === STATE.EXPLORE) {
      this.explore.render(ctx, canvas);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#050010');
      grad.addColorStop(1, '#0a0520');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (this.dialogue) this.dialogue.render(ctx, canvas);
  }

  // ─── Battle ───────────────────────────────────────────────
  startBattle(enemyIds, bgKey, onWin, onLose) {
    const enemies = enemyIds.map(id => {
      const def = this.data.enemies.find(e => e.id === id);
      if (!def) return null;
      return {
        ...def,
        currentHp: def.stats.hp,
        currentMp: def.stats.mp,
        statusEffects: [],
        shieldAmount: 0,
      };
    }).filter(Boolean);

    this.battle = new BattleManager(this, this.party.filter(m => m.currentHp > 0), enemies, bgKey, onWin, onLose);
    this.state = STATE.BATTLE;
  }

  // ─── Quest helpers ────────────────────────────────────────
  advanceQuest(questId, stageId) {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return;
    const stage = quest.stages.find(s => s.id === stageId);
    if (stage) stage.complete = true;
  }

  incrementQuestCount(questId, stageId) {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return;
    const stage = quest.stages.find(s => s.id === stageId);
    if (!stage) return;
    stage.current = (stage.current || 0) + 1;
    if (stage.current >= stage.count) stage.complete = true;
    // Update objective text
    stage.objective = `Defeat the Guardian Beasts (${Math.min(stage.current, stage.count)}/${stage.count})`;
  }

  getQuestObjective(questId) {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return '';
    const stage = quest.stages.find(s => !s.complete);
    return stage ? stage.objective : 'Quest Complete!';
  }

  isQuestStageDone(questId, stageId) {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return false;
    const stage = quest.stages.find(s => s.id === stageId);
    return stage ? stage.complete : false;
  }

  allQuestStagesDone(questId) {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return false;
    return quest.stages.every(s => s.complete);
  }

  completeQuest(questId) {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return;
    quest.complete = true;
    const rewards = quest.rewards;
    this.gold += rewards.gold || 0;
    this.party.forEach(m => {
      this.grantExp(m, rewards.exp || 0);
    });
    rewards.items?.forEach(itemId => {
      this.addItem(itemId);
    });
    this.ui.questCompleteData = { quest, rewards };
    this.state = STATE.QUEST_COMPLETE;
  }

  // ─── Inventory helpers ────────────────────────────────────
  addItem(itemId, qty = 1) {
    const existing = this.inventory.find(i => i.id === itemId);
    if (existing) { existing.quantity += qty; }
    else { this.inventory.push({ id: itemId, quantity: qty }); }
  }

  removeItem(itemId, qty = 1) {
    const existing = this.inventory.find(i => i.id === itemId);
    if (!existing) return false;
    existing.quantity -= qty;
    if (existing.quantity <= 0) this.inventory = this.inventory.filter(i => i.id !== itemId);
    return true;
  }

  getItemDef(id) {
    return this.data.items.find(i => i.id === id);
  }

  getAbilityDef(id) {
    return this.data.abilities[id];
  }

  // ─── Level/EXP ────────────────────────────────────────────
  grantExp(member, amount) {
    member.exp += amount;
    while (member.exp >= member.expToNext) {
      member.exp -= member.expToNext;
      this.levelUp(member);
    }
  }

  levelUp(member) {
    member.level++;
    const g = member.growth;
    member.stats.hp += g.hp;
    member.stats.mp += g.mp;
    member.stats.atk += g.atk;
    member.stats.def += g.def;
    member.stats.spd += g.spd;
    member.stats.lck += g.lck;
    // Restore on level up
    member.currentHp = Math.min(member.currentHp + g.hp, member.stats.hp);
    member.currentMp = Math.min(member.currentMp + g.mp, member.stats.mp);
    member.expToNext = Math.floor(member.expToNext * 1.4);
    return { level: member.level, name: member.name };
  }
}

// ─── Input Manager ───────────────────────────────────────────
class InputManager {
  constructor(game) {
    this.game = game;
    this.keys = {};
    this.justPressed = {};
    window.addEventListener('keydown', e => this.onKey(e));
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
  }

  onKey(e) {
    if (!this.keys[e.code]) this.justPressed[e.code] = true;
    this.keys[e.code] = true;

    const g = this.game;
    const ui = g.ui;

    if (g.state === STATE.TITLE) {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { ui.titleSelection = Math.max(0, ui.titleSelection - 1); }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { ui.titleSelection = Math.min(2, ui.titleSelection + 1); }
      if (e.code === 'Enter' || e.code === 'Space') { ui.confirmTitleSelection(); }
    }

    if (g.state === STATE.DIALOGUE || g.state === STATE.CUTSCENE) {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') {
        g.dialogue?.advance();
      }
    }

    if (g.state === STATE.EXPLORE) {
      if (e.code === 'Escape') { g.prevState = STATE.EXPLORE; g.state = STATE.PAUSE; }
      if (e.code === 'KeyF' || e.code === 'Enter') { g.explore.interact(); }
    }

    if (g.state === STATE.PAUSE) {
      if (e.code === 'Escape') { g.state = STATE.EXPLORE; }
      if (e.code === 'KeyS') { g.save(); ui.showNotification('Game saved!'); g.state = STATE.EXPLORE; }
    }

    if (g.state === STATE.BATTLE && g.battle) {
      g.battle.onKey(e.code);
    }

    if (g.state === STATE.VICTORY) {
      if (e.code === 'Enter' || e.code === 'Space') { g.battle?.endVictory(); }
    }

    if (g.state === STATE.DEFEAT) {
      if (e.code === 'Enter' || e.code === 'Space') { g.battle?.endDefeat(); }
    }

    if (g.state === STATE.QUEST_COMPLETE) {
      if (e.code === 'Enter' || e.code === 'Space') { g.state = STATE.EXPLORE; }
    }
  }

  isDown(code) { return !!this.keys[code]; }
  wasPressed(code) {
    const p = this.justPressed[code];
    this.justPressed[code] = false;
    return p;
  }
}

// ─── Audio Manager ───────────────────────────────────────────
class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterVol = 0.6;
    this.musicVol = 0.5;
    this.sfxVol = 0.7;
    this.currentMusic = null;
  }

  initContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  playTone(freq, duration, type = 'sine', volume = 0.3) {
    try {
      this.initContext();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(volume * this.sfxVol * this.masterVol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }

  playConfirm() { this.playTone(660, 0.1); setTimeout(() => this.playTone(880, 0.15), 80); }
  playCancel() { this.playTone(330, 0.15, 'sawtooth', 0.2); }
  playAttack() {
    this.playTone(200, 0.05, 'sawtooth', 0.3);
    setTimeout(() => this.playTone(150, 0.1, 'sawtooth', 0.2), 50);
  }
  playMagic() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.playTone(f, 0.15, 'sine', 0.25), i * 60));
  }
  playHit() { this.playTone(180, 0.08, 'square', 0.25); }
  playHeal() { [440, 523, 659].forEach((f, i) => setTimeout(() => this.playTone(f, 0.2, 'sine', 0.2), i * 80)); }
  playVictory() {
    const melody = [523, 659, 784, 1047, 784, 1047, 1319];
    melody.forEach((f, i) => setTimeout(() => this.playTone(f, 0.25, 'sine', 0.35), i * 120));
  }
  playDefeat() {
    [440, 392, 330, 277].forEach((f, i) => setTimeout(() => this.playTone(f, 0.4, 'sawtooth', 0.2), i * 200));
  }
  playCursor() { this.playTone(440, 0.05, 'sine', 0.15); }
  playDialogue() { this.playTone(880, 0.04, 'sine', 0.1); }
}

// ─── UI Manager ──────────────────────────────────────────────
class UI {
  constructor(game) {
    this.game = game;
    this.titleSelection = 0;
    this.questCompleteData = null;
    this.notification = null;
    this.notifTimer = 0;
    this.pauseSelection = 0;
    this.pauseItems = ['Resume', 'Save Game', 'Settings', 'Main Menu'];
  }

  confirmTitleSelection() {
    const g = this.game;
    g.audio.playConfirm();
    if (this.titleSelection === 0) { g.startNewGame(); }
    else if (this.titleSelection === 1 && g.saveExists) {
      if (!g.load()) { this.showNotification('Load failed!'); }
    } else if (this.titleSelection === 2) {
      this.showNotification('Settings — coming soon!');
    }
  }

  showNotification(text) {
    this.notification = text;
    this.notifTimer = 2.5;
  }

  renderMenu(ctx, canvas) {
    // Placeholder for separate menu screen
    const g = this.game;
    g.state = STATE.TITLE;
  }

  renderCutscene(ctx, canvas) {
    const W = canvas.width, H = canvas.height;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#040010');
    grad.addColorStop(1, '#08021a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    this.game.renderParticles(ctx);
    if (this.game.dialogue) this.game.dialogue.render(ctx, canvas);
  }

  renderPause(ctx, canvas) {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);

    const boxW = 320, boxH = 320;
    const bx = (W - boxW) / 2, by = (H - boxH) / 2;
    drawRoundedRect(ctx, bx, by, boxW, boxH, 12, 'rgba(10,5,30,0.95)', 'rgba(150,80,255,0.8)', 2);

    ctx.fillStyle = '#e0c0ff';
    ctx.font = `bold 22px 'Cinzel', serif`;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, by + 50);

    this.pauseItems.forEach((label, i) => {
      const y = by + 100 + i * 52;
      const selected = this.pauseSelection === i;
      if (selected) {
        ctx.fillStyle = 'rgba(100,40,160,0.6)';
        ctx.fillRect(bx + 20, y - 28, boxW - 40, 44);
      }
      ctx.fillStyle = selected ? '#f0c060' : '#c090e0';
      ctx.font = `${selected ? 'bold' : ''} 18px 'Cinzel', serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, W / 2, y);
    });

    const g = this.game;
    const objective = g.getQuestObjective('trial_of_wards');
    ctx.font = '13px Georgia, serif';
    ctx.fillStyle = 'rgba(150,100,200,0.8)';
    ctx.textAlign = 'center';
    ctx.fillText(`⬡ ${objective}`, W / 2, by + boxH - 20);
  }

  renderQuestComplete(ctx, canvas) {
    const W = canvas.width, H = canvas.height;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#060020');
    grad.addColorStop(1, '#0a0530');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    this.game.renderParticles(ctx);

    const boxW = 560, boxH = 400;
    const bx = (W - boxW) / 2, by = (H - boxH) / 2;
    drawRoundedRect(ctx, bx, by, boxW, boxH, 16, 'rgba(10,5,40,0.97)', 'rgba(200,150,255,0.9)', 2);

    ctx.textAlign = 'center';
    ctx.font = `bold 26px 'Cinzel', serif`;
    ctx.shadowColor = 'rgba(200,150,255,0.8)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#f0d080';
    ctx.fillText('✦  QUEST COMPLETE  ✦', W / 2, by + 60);
    ctx.shadowBlur = 0;

    const data = this.questCompleteData;
    if (data) {
      ctx.font = `20px 'Cinzel', serif`;
      ctx.fillStyle = '#e0c0ff';
      ctx.fillText(data.quest.title, W / 2, by + 100);

      ctx.font = '15px Georgia, serif';
      ctx.fillStyle = '#a080d0';
      ctx.fillText(data.quest.description, W / 2, by + 135);

      // Rewards
      ctx.font = `bold 18px 'Cinzel', serif`;
      ctx.fillStyle = '#f0c060';
      ctx.fillText('REWARDS', W / 2, by + 190);

      ctx.font = '16px Georgia, serif';
      ctx.fillStyle = '#d0b0f0';
      ctx.fillText(`⬡ ${data.rewards.exp} EXP`, W / 2, by + 225);
      ctx.fillText(`✦ ${data.rewards.gold} Gold`, W / 2, by + 255);
      if (data.rewards.items?.length) {
        const itemNames = data.rewards.items.map(id => {
          const def = this.game.getItemDef(id);
          return def ? def.name : id;
        }).join(', ');
        ctx.fillText(`Item: ${itemNames}`, W / 2, by + 285);
      }
    }

    ctx.font = '14px Georgia, serif';
    ctx.fillStyle = `rgba(180,140,255,${0.5 + this.game.titleGlow * 0.5})`;
    ctx.fillText('[ Press ENTER to continue ]', W / 2, by + boxH - 25);
  }

  renderHUD(ctx, canvas) {
    if (!this.game.party.length) return;
    const W = canvas.width;

    // Quest objective
    const obj = this.game.getQuestObjective('trial_of_wards');
    ctx.font = '12px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8, 8, Math.min(obj.length * 7.5 + 20, 400), 26);
    ctx.fillStyle = '#e0c0ff';
    ctx.fillText('⬡ ' + obj, 16, 25);

    // Notification
    if (this.notification && this.notifTimer > 0) {
      this.notifTimer -= 0.016;
      ctx.textAlign = 'center';
      const alpha = Math.min(1, this.notifTimer);
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.7})`;
      ctx.fillRect(W/2 - 150, canvas.height * 0.08 - 16, 300, 34);
      ctx.fillStyle = `rgba(240,200,80,${alpha})`;
      ctx.font = 'bold 15px Georgia, serif';
      ctx.fillText(this.notification, W/2, canvas.height * 0.08 + 5);
    }

    // Controls hint
    ctx.textAlign = 'center';
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(150,100,200,0.5)';
    ctx.fillText('WASD/Arrows: Move   F/Enter: Interact   Esc: Pause', W/2, canvas.height - 8);
  }
}

// ─── Dialogue Manager ────────────────────────────────────────
class DialogueManager {
  constructor(game, key, onComplete) {
    this.game = game;
    this.lines = game.data.dialogue[key] || [];
    this.index = 0;
    this.onComplete = onComplete;
    this.displayText = '';
    this.targetText = this.lines[0]?.text || '';
    this.charIndex = 0;
    this.charTimer = 0;
    this.charSpeed = 0.03;
    this.done = false;
  }

  advance() {
    // If text not fully shown, skip to end
    if (this.charIndex < this.targetText.length) {
      this.charIndex = this.targetText.length;
      this.displayText = this.targetText;
      return;
    }
    this.game.audio.playDialogue();
    this.index++;
    if (this.index >= this.lines.length) {
      this.done = true;
      if (this.onComplete) this.onComplete();
      return;
    }
    this.targetText = this.lines[this.index].text;
    this.displayText = '';
    this.charIndex = 0;
  }

  update(dt) {
    if (this.charIndex >= this.targetText.length) return;
    this.charTimer += dt;
    while (this.charTimer >= this.charSpeed && this.charIndex < this.targetText.length) {
      this.charTimer -= this.charSpeed;
      this.charIndex++;
      this.displayText = this.targetText.slice(0, this.charIndex);
    }
  }

  render(ctx, canvas) {
    this.update(1/60);

    const W = canvas.width, H = canvas.height;
    const line = this.lines[this.index];
    if (!line || this.done) return;

    // Dialogue box
    const boxH = 160;
    const by = H - boxH - 20;
    drawRoundedRect(ctx, 20, by, W - 40, boxH, 10, 'rgba(5,0,20,0.92)', 'rgba(140,70,220,0.7)', 2);

    // Portrait
    const portrait = line.portrait ? this.game.images[line.portrait] : null;
    let textX = 40;
    if (portrait) {
      const pH = boxH - 20;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(28, by + 10, pH, pH, 6);
      ctx.clip();
      ctx.drawImage(portrait, 28, by + 10, pH, pH);
      ctx.restore();
      textX = 28 + pH + 20;
    }

    // Speaker name
    ctx.fillStyle = '#f0d080';
    ctx.font = `bold 14px 'Cinzel', serif`;
    ctx.textAlign = 'left';
    ctx.fillText(line.speaker, textX, by + 28);

    // Dialogue text - wrap
    ctx.fillStyle = '#e8d8ff';
    ctx.font = '15px Georgia, serif';
    const maxW = W - textX - 50;
    wrapText(ctx, this.displayText, textX, by + 52, maxW, 22);

    // Advance prompt
    if (this.charIndex >= this.targetText.length) {
      const alpha = Math.sin(Date.now() / 300) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(200,160,255,${alpha})`;
      ctx.font = '13px Georgia, serif';
      ctx.textAlign = 'right';
      ctx.fillText('▼ Press Space/Enter', W - 40, by + boxH - 12);
    }
  }
}

// ─── Explore Manager ─────────────────────────────────────────
class ExploreManager {
  constructor(game) {
    this.game = game;
    this.playerX = 400;
    this.playerY = 300;
    this.playerDir = 'down';
    this.playerAnim = 0;
    this.animTimer = 0;
    this.speed = 150;
    this.battleCount = 0;
    this.elderTalked = false;
    this.stoneTouched = false;

    this.npcs = [
      {
        id: 'elder_ward',
        x: 250, y: 180,
        label: 'Elder Ward',
        color: '#80d0ff',
        radius: 20,
        dialogueKey: 'npc_elder_ward_first',
        talked: false,
      }
    ];

    this.objects = [
      {
        id: 'ward_stone',
        x: 680, y: 200,
        label: 'Ward Stone',
        color: '#d0a0ff',
        radius: 25,
        icon: '✦',
      }
    ];

    this.encounter_zones = [
      { x: 400, y: 400, r: 80, enemy: ['abyss_tiger'], bg: 'battle_bg', used: false },
      { x: 550, y: 350, r: 80, enemy: ['arcane_leopard'], bg: 'battle_bg2', used: false },
    ];

    this.walkCycle = 0;
    this.lastBg = 0;
  }

  init(savedData) {
    if (savedData) {
      this.playerX = savedData.playerX || 400;
      this.playerY = savedData.playerY || 300;
      this.battleCount = savedData.battleCount || 0;
      this.elderTalked = savedData.elderTalked || false;
      this.stoneTouched = savedData.stoneTouched || false;
      if (savedData.npcs) {
        savedData.npcs.forEach((ns, i) => {
          if (this.npcs[i]) this.npcs[i].talked = ns.talked;
        });
      }
      if (savedData.encounter_zones) {
        savedData.encounter_zones.forEach((ez, i) => {
          if (this.encounter_zones[i]) this.encounter_zones[i].used = ez.used;
        });
      }
    }
  }

  getSaveData() {
    return {
      playerX: this.playerX,
      playerY: this.playerY,
      battleCount: this.battleCount,
      elderTalked: this.elderTalked,
      stoneTouched: this.stoneTouched,
      npcs: this.npcs.map(n => ({ talked: n.talked })),
      encounter_zones: this.encounter_zones.map(z => ({ used: z.used })),
    };
  }

  update(dt, canvas) {
    const g = this.game;
    const input = g.input;
    const W = canvas.width, H = canvas.height;

    let dx = 0, dy = 0;
    if (input.isDown('ArrowLeft') || input.isDown('KeyA')) dx -= 1;
    if (input.isDown('ArrowRight') || input.isDown('KeyD')) dx += 1;
    if (input.isDown('ArrowUp') || input.isDown('KeyW')) dy -= 1;
    if (input.isDown('ArrowDown') || input.isDown('KeyS')) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx*dx + dy*dy);
      dx /= len; dy /= len;
      this.playerX = Math.max(30, Math.min(W - 30, this.playerX + dx * this.speed * dt));
      this.playerY = Math.max(30, Math.min(H - 30, this.playerY + dy * this.speed * dt));
      if (dx < 0) this.playerDir = 'left';
      else if (dx > 0) this.playerDir = 'right';
      else if (dy < 0) this.playerDir = 'up';
      else this.playerDir = 'down';
      this.animTimer += dt;
      if (this.animTimer > 0.2) { this.animTimer = 0; this.walkCycle = (this.walkCycle + 1) % 4; }

      // Check encounter zones
      this.encounter_zones.forEach(zone => {
        if (zone.used) return;
        const dist = Math.hypot(this.playerX - zone.x, this.playerY - zone.y);
        if (dist < zone.r) {
          zone.used = true;
          this.triggerBattle(zone.enemy, zone.bg);
        }
      });
    }
  }

  triggerBattle(enemyIds, bgKey) {
    const g = this.game;
    g.audio.playTone(200, 0.5, 'sawtooth', 0.3);
    // Show battle intro dialogue if first tiger
    const introKey = enemyIds[0] === 'abyss_tiger' ? 'battle_intro_tiger' : null;
    if (introKey) {
      g.startDialogue(introKey, () => {
        g.startBattle(enemyIds, bgKey, () => this.onBattleWin(), () => this.onBattleLose());
      });
    } else {
      g.startBattle(enemyIds, bgKey, () => this.onBattleWin(), () => this.onBattleLose());
    }
  }

  onBattleWin() {
    this.battleCount++;
    this.game.incrementQuestCount('trial_of_wards', 'defeat_guardians');
    this.game.ui.showNotification(`Guardian defeated! (${Math.min(this.battleCount, 2)}/2)`);

    // If all guardians beaten, trigger Blaze Lion encounter near ward stone
    if (this.battleCount === 2) {
      this.encounter_zones.push({ x: 680, y: 200, r: 60, enemy: ['blaze_lion'], bg: 'battle_bg3', used: false });
    }
  }

  onBattleLose() {
    // Revive party at 50% HP
    this.game.party.forEach(m => {
      if (m.currentHp <= 0) m.currentHp = Math.floor(m.stats.hp * 0.5);
    });
    this.game.ui.showNotification('Defeated... but the fight continues!');
    this.game.state = STATE.EXPLORE;
  }

  interact() {
    const g = this.game;

    // Check NPCs
    for (const npc of this.npcs) {
      const dist = Math.hypot(this.playerX - npc.x, this.playerY - npc.y);
      if (dist < npc.radius + 40) {
        g.audio.playConfirm();
        if (!npc.talked) {
          npc.talked = true;
          this.elderTalked = true;
          g.advanceQuest('trial_of_wards', 'speak_elder');
          g.startDialogue(npc.dialogueKey, () => { g.state = STATE.EXPLORE; });
        } else {
          const afterKey = this.battleCount >= 2 ? 'npc_elder_ward' : 'npc_elder_ward_first';
          g.startDialogue(afterKey, () => { g.state = STATE.EXPLORE; });
        }
        return;
      }
    }

    // Check objects
    for (const obj of this.objects) {
      const dist = Math.hypot(this.playerX - obj.x, this.playerY - obj.y);
      if (dist < obj.radius + 40) {
        if (obj.id === 'ward_stone') {
          if (!g.isQuestStageDone('trial_of_wards', 'defeat_guardians')) {
            g.ui.showNotification('The Ward Stone pulses... defeat the guardians first!');
            return;
          }
          // If Blaze Lion zone still active, trigger it
          const bossZone = this.encounter_zones.find(z => z.enemy[0] === 'blaze_lion' && !z.used);
          if (bossZone) {
            bossZone.used = true;
            g.startDialogue('battle_intro_lion', () => {
              g.startBattle(['blaze_lion'], 'battle_bg3', () => {
                this.stoneTouched = true;
                g.advanceQuest('trial_of_wards', 'claim_stone');
                g.startDialogue('ward_stone', () => {
                  g.completeQuest('trial_of_wards');
                });
              }, () => this.onBattleLose());
            });
            return;
          }
          if (!this.stoneTouched) {
            this.stoneTouched = true;
            g.advanceQuest('trial_of_wards', 'claim_stone');
            g.startDialogue('ward_stone', () => {
              g.completeQuest('trial_of_wards');
            });
          }
        }
        g.audio.playConfirm();
        return;
      }
    }
  }

  render(ctx, canvas) {
    const W = canvas.width, H = canvas.height;
    this.update(1/60, canvas);
    const t = this.game.animTimer;
    const glow = this.game.titleGlow;

    // ── Layer 1: Stone floor ────────────────────────────────
    this._renderFloor(ctx, W, H);

    // ── Layer 2: Great Ward Circle (floor engraving) ────────
    this._renderWardCircle(ctx, W, H, t, glow);

    // ── Layer 3: Structures (walls, pillars, platforms) ─────
    this._renderStructures(ctx, W, H, glow);

    // ── Layer 4: Encounter zones (cracked floor fissures) ───
    this._renderEncounterZones(ctx, t, glow);

    // ── Layer 5: Ward Stone pedestal ────────────────────────
    this._renderWardStone(ctx, t, glow);

    // ── Layer 6: NPC (Elder Ward) ───────────────────────────
    this._renderNPCs(ctx, t, glow);

    // ── Layer 7: Player ─────────────────────────────────────
    this.renderPlayer(ctx, t);

    // ── Layer 8: Interaction hints ──────────────────────────
    this._renderHints(ctx);

    // ── Layer 9: Atmosphere (vignette + rune particles) ─────
    this._renderAtmosphere(ctx, W, H, t, glow);

    // ── Layer 10: HUD ────────────────────────────────────────
    this.game.ui.renderHUD(ctx, canvas);
    this.renderPartyStatus(ctx, canvas);
  }

  // ── Floor ─────────────────────────────────────────────────
  _renderFloor(ctx, W, H) {
    // Base fill
    ctx.fillStyle = '#0d0820';
    ctx.fillRect(0, 0, W, H);

    // Stone tiles – consistent variation via hash
    const TS = 48;
    const cols = Math.ceil(W / TS) + 1;
    const rows = Math.ceil(H / TS) + 1;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const hash = (col * 7 + row * 13 + col * row * 3) % 16;
        const brightness = 14 + hash;
        const r = brightness, g = Math.floor(brightness * 0.6), b = brightness + 4;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(col * TS, row * TS, TS - 1, TS - 1);

        // Occasional darker crack line within tile
        if (hash === 5 || hash === 11) {
          ctx.strokeStyle = `rgba(0,0,0,0.3)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(col * TS + 8, row * TS + 12);
          ctx.lineTo(col * TS + 30, row * TS + 36);
          ctx.stroke();
        }
      }
    }

    // Subtle tile grid lines
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += TS) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += TS) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  // ── Great Ward Circle ──────────────────────────────────────
  _renderWardCircle(ctx, W, H, t, glow) {
    const cx = W / 2, cy = H / 2 + 20;
    const radii = [220, 170, 130, 90, 55];
    const alphas = [0.12, 0.15, 0.18, 0.22, 0.28];

    radii.forEach((r, i) => {
      const pulse = glow * 0.03;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(140,70,240,${alphas[i] + pulse})`;
      ctx.lineWidth = i === 0 ? 3 : 2;
      ctx.stroke();
    });

    // Rotating rune spokes
    const spokeCount = 8;
    for (let i = 0; i < spokeCount; i++) {
      const angle = (Math.PI * 2 * i / spokeCount) + t * 0.08;
      const innerR = 55, outerR = 170;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.strokeStyle = `rgba(120,50,220,${0.08 + glow * 0.05})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Counter-rotating inner ring of dots
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i / 12) - t * 0.12;
      const r2 = 90;
      const dx = cx + Math.cos(angle) * r2;
      const dy = cy + Math.sin(angle) * r2;
      ctx.beginPath();
      ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,100,255,${0.3 + glow * 0.3})`;
      ctx.fill();
    }

    // Center glow
    const cGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 55);
    cGrad.addColorStop(0, `rgba(100,40,200,${0.12 + glow * 0.08})`);
    cGrad.addColorStop(1, 'rgba(100,40,200,0)');
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 55, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Structures ─────────────────────────────────────────────
  _renderStructures(ctx, W, H, glow) {
    // Top border wall
    const wallH = 55;
    ctx.fillStyle = '#090614';
    ctx.fillRect(0, 0, W, wallH);
    // Wall top edge highlight
    ctx.fillStyle = 'rgba(100,60,160,0.4)';
    ctx.fillRect(0, wallH - 3, W, 3);
    // Wall pattern – vertical stones
    for (let x = 0; x < W; x += 60) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x, 0, 2, wallH);
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(x + 2, 0, 28, wallH);
    }
    // Title banner text
    ctx.fillStyle = `rgba(160,90,255,${0.4 + glow * 0.3})`;
    ctx.font = `bold 13px 'Cinzel', Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('⬡  THE WARDED GROUNDS  ⬡', W / 2, 34);

    // Side walls (thin strips)
    ctx.fillStyle = '#07050f';
    ctx.fillRect(0, wallH, 18, H - wallH);
    ctx.fillRect(W - 18, wallH, 18, H - wallH);
    ctx.fillStyle = 'rgba(100,60,160,0.3)';
    ctx.fillRect(16, wallH, 2, H - wallH);
    ctx.fillRect(W - 18, wallH, 2, H - wallH);

    // Bottom border
    ctx.fillStyle = '#07050f';
    ctx.fillRect(0, H - 18, W, 18);
    ctx.fillStyle = 'rgba(80,40,120,0.4)';
    ctx.fillRect(0, H - 20, W, 2);

    // Corner pillars
    [
      [18, wallH], [W - 54, wallH],
      [18, H - 70], [W - 54, H - 70],
    ].forEach(([px, py]) => this._drawPillar(ctx, px, py, 36, 60, glow));

    // Additional mid pillars
    [
      [18, H / 2 - 30], [W - 54, H / 2 - 30],
    ].forEach(([px, py]) => this._drawPillar(ctx, px, py, 28, 50, glow));

    // Elder Ward platform (top-left raised area)
    this._drawPlatform(ctx, 60, wallH + 8, 180, 100, glow);

    // Ward Stone pedestal (top-right)
    this._drawPedestal(ctx, 680, wallH + 10, 80, 85, glow);
  }

  _drawPillar(ctx, x, y, w, h, glow) {
    // Pillar body
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, '#1a0e2a');
    grad.addColorStop(0.3, '#2a1840');
    grad.addColorStop(1, '#0d0818');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    // Cap
    ctx.fillStyle = '#3a2060';
    ctx.fillRect(x - 4, y, w + 8, 10);
    ctx.fillRect(x - 4, y + h - 6, w + 8, 6);
    // Glow edge
    ctx.strokeStyle = `rgba(120,60,200,${0.2 + glow * 0.15})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }

  _drawPlatform(ctx, x, y, w, h, glow) {
    // Raised stone platform for Elder Ward
    ctx.fillStyle = '#100820';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1e1030';
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    // Border glow
    ctx.strokeStyle = `rgba(80,160,255,${0.25 + glow * 0.15})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    // Step at bottom
    ctx.fillStyle = '#180c28';
    ctx.fillRect(x - 6, y + h, w + 12, 8);
    ctx.fillStyle = 'rgba(80,160,255,0.15)';
    ctx.fillRect(x - 6, y + h, w + 12, 2);
    // Label
    ctx.fillStyle = 'rgba(80,160,255,0.5)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ELDER\'S ALCOVE', x + w / 2, y + h - 8);
  }

  _drawPedestal(ctx, x, y, w, h, glow) {
    // Stone pedestal for the Ward Stone
    // Base slab
    ctx.fillStyle = '#160e28';
    ctx.fillRect(x - 8, y + h - 12, w + 16, 12);
    // Body
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#1e1238');
    grad.addColorStop(1, '#0e0820');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h - 12);
    // Top face (slightly lighter)
    ctx.fillStyle = '#2a1848';
    ctx.fillRect(x, y, w, 14);
    // Glow border
    ctx.strokeStyle = `rgba(180,80,255,${0.3 + glow * 0.2})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    // Rune carved on front
    ctx.fillStyle = `rgba(180,80,255,${0.3 + glow * 0.25})`;
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.fillText('⬡', x + w / 2, y + h / 2 + 6);
    // Label
    ctx.fillStyle = 'rgba(180,80,255,0.5)';
    ctx.font = '9px monospace';
    ctx.fillText('PEDESTAL', x + w / 2, y + h - 2);
  }

  // ── Encounter Zones ────────────────────────────────────────
  _renderEncounterZones(ctx, t, glow) {
    this.encounter_zones.forEach(zone => {
      if (zone.used) return;

      const pulse = 0.5 + Math.sin(t * 2.5) * 0.3;
      const enemyDef = this.game.data.enemies.find(e => e.id === zone.enemy[0]);

      // Cracked floor fissure — radiating lines from center
      ctx.save();
      ctx.translate(zone.x, zone.y);
      const crackCount = 7;
      for (let i = 0; i < crackCount; i++) {
        const angle = (Math.PI * 2 * i / crackCount) + i * 0.3;
        const len = zone.r * 0.7 + (i % 3) * 10;
        ctx.strokeStyle = `rgba(220,60,60,${0.25 + pulse * 0.2})`;
        ctx.lineWidth = 1 + (i % 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        // Jagged crack line
        const mx = Math.cos(angle + 0.2) * len * 0.5;
        const my = Math.sin(angle + 0.2) * len * 0.5;
        ctx.quadraticCurveTo(mx, my, Math.cos(angle) * len, Math.sin(angle) * len);
        ctx.stroke();
      }
      // Glowing center pit
      const pitGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
      pitGrad.addColorStop(0, `rgba(220,50,50,${0.35 + pulse * 0.25})`);
      pitGrad.addColorStop(0.6, `rgba(120,20,20,${0.12 + pulse * 0.1})`);
      pitGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pitGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Enemy portrait (small, above zone)
      if (enemyDef) {
        const img = this.game.images[`assets/enemies/${zone.enemy[0]}.png`];
        if (img) {
          const s = 54;
          const bob = Math.sin(t * 2) * 3;
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.shadowColor = 'rgba(220,60,60,0.6)';
          ctx.shadowBlur = 12;
          ctx.drawImage(img, zone.x - s/2, zone.y - s - 8 + bob, s, s);
          ctx.restore();
          // Name tag
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(zone.x - 48, zone.y + 6, 96, 16);
          ctx.fillStyle = `rgba(255,120,120,${0.7 + glow * 0.3})`;
          ctx.font = 'bold 10px Georgia, serif';
          ctx.textAlign = 'center';
          ctx.fillText(enemyDef.name, zone.x, zone.y + 17);
        }
      }
    });
  }

  // ── Ward Stone ─────────────────────────────────────────────
  _renderWardStone(ctx, t, glow) {
    this.objects.forEach(obj => {
      const pulse = 0.6 + Math.sin(t * 1.8) * 0.4;
      const done = this.stoneTouched;
      const stoneColor = done ? [80, 255, 120] : [180, 80, 255];
      const [sr, sg, sb] = stoneColor;

      // Outer glow halo
      const haloGrad = ctx.createRadialGradient(obj.x, obj.y - 20, 0, obj.x, obj.y - 20, 70);
      haloGrad.addColorStop(0, `rgba(${sr},${sg},${sb},${0.2 + pulse * 0.15})`);
      haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(obj.x, obj.y - 20, 70, 0, Math.PI * 2);
      ctx.fill();

      // Rising energy beams
      if (!done) {
        for (let i = 0; i < 4; i++) {
          const bx = obj.x + (i - 1.5) * 14;
          const beamAlpha = (0.3 + Math.sin(t * 3 + i) * 0.2) * pulse;
          const beamGrad = ctx.createLinearGradient(bx, obj.y - 60, bx, obj.y);
          beamGrad.addColorStop(0, `rgba(${sr},${sg},${sb},0)`);
          beamGrad.addColorStop(1, `rgba(${sr},${sg},${sb},${beamAlpha})`);
          ctx.fillStyle = beamGrad;
          ctx.fillRect(bx - 2, obj.y - 60, 4, 60);
        }
      }

      // Crystal gem body — diamond shape
      const cx = obj.x, cy = obj.y - 28;
      const cw = 22, ch = 30;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(t * 0.5) * 0.08);

      ctx.beginPath();
      ctx.moveTo(0, -ch);          // top
      ctx.lineTo(cw, 0);           // right
      ctx.lineTo(0, ch * 0.6);     // bottom
      ctx.lineTo(-cw, 0);          // left
      ctx.closePath();
      const crystalGrad = ctx.createLinearGradient(-cw, -ch, cw, ch * 0.6);
      crystalGrad.addColorStop(0, `rgba(${sr},${sg},${sb},0.9)`);
      crystalGrad.addColorStop(0.5, `rgba(${Math.floor(sr*0.6)},${Math.floor(sg*0.6)},${Math.floor(sb*0.6)},0.7)`);
      crystalGrad.addColorStop(1, `rgba(${sr},${sg},${sb},0.5)`);
      ctx.fillStyle = crystalGrad;
      ctx.fill();
      ctx.strokeStyle = `rgba(${sr},${sg},${sb},${0.7 + pulse * 0.3})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner facet highlight
      ctx.beginPath();
      ctx.moveTo(0, -ch);
      ctx.lineTo(cw * 0.4, -ch * 0.1);
      ctx.lineTo(0, ch * 0.6);
      ctx.strokeStyle = `rgba(255,255,255,0.25)`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Object label
      ctx.fillStyle = `rgba(${sr},${sg},${sb},0.8)`;
      ctx.font = 'bold 11px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(done ? '✦ CLAIMED ✦' : obj.label, obj.x, obj.y + obj.radius - 2);
    });
  }

  // ── NPC (Elder Ward) ───────────────────────────────────────
  _renderNPCs(ctx, t, glow) {
    this.npcs.forEach(npc => {
      const bob = Math.sin(t * 1.4) * 2;
      const auraAlpha = 0.15 + glow * 0.12;

      // Aura glow beneath
      const aura = ctx.createRadialGradient(npc.x, npc.y + bob, 0, npc.x, npc.y + bob, 38);
      aura.addColorStop(0, `rgba(80,160,255,${auraAlpha * 2})`);
      aura.addColorStop(1, 'rgba(80,160,255,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(npc.x, npc.y + bob, 38, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(npc.x, npc.y + bob);

      // Shadow on floor
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 16, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Robe body
      ctx.fillStyle = this.elderTalked ? '#1a3040' : '#102040';
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-15, 24);
      ctx.lineTo(15, 24);
      ctx.lineTo(12, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,160,255,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Robe details — hem runes
      ctx.strokeStyle = `rgba(80,160,255,${0.25 + glow * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-12, 16); ctx.lineTo(12, 16);
      ctx.stroke();

      // Arms
      ctx.strokeStyle = '#102040';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-12, 4);
      ctx.lineTo(-18, 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(12, 4);
      ctx.lineTo(18, 14);
      ctx.stroke();

      // Staff (left hand)
      ctx.strokeStyle = '#8060a0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-18, 14);
      ctx.lineTo(-22, -18);
      ctx.stroke();
      // Staff orb
      const orbGlow = 0.5 + Math.sin(t * 2.5) * 0.3;
      ctx.fillStyle = `rgba(80,160,255,${orbGlow})`;
      ctx.beginPath();
      ctx.arc(-22, -20, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,200,255,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Head (hood)
      ctx.fillStyle = '#0e1830';
      ctx.beginPath();
      ctx.ellipse(0, -8, 10, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,160,255,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Hood tip
      ctx.fillStyle = '#0e1830';
      ctx.beginPath();
      ctx.moveTo(-6, -16);
      ctx.quadraticCurveTo(0, -28, 6, -16);
      ctx.fill();
      // Face glow
      ctx.fillStyle = `rgba(100,180,255,${0.2 + glow * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(0, -8, 5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Eyes
      ctx.fillStyle = `rgba(140,220,255,${0.8 + glow * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(-3, -9, 2, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(3, -9, 2, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Name tag
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(npc.x - 40, npc.y + bob + 30, 80, 16);
      ctx.fillStyle = npc.color;
      ctx.font = 'bold 10px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(npc.label, npc.x, npc.y + bob + 42);
    });
  }

  // ── Interaction Hints ──────────────────────────────────────
  _renderHints(ctx) {
    const showHint = (x, y, text) => {
      const w = ctx.measureText(text).width + 16;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x - w/2, y - 15, w, 18);
      ctx.strokeStyle = 'rgba(200,180,255,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - w/2, y - 15, w, 18);
      ctx.fillStyle = '#d0c0ff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(text, x, y - 1);
    };

    this.npcs.forEach(npc => {
      const dist = Math.hypot(this.playerX - npc.x, this.playerY - npc.y);
      if (dist < npc.radius + 60) showHint(npc.x, npc.y - 42, '[F] Talk');
    });

    this.objects.forEach(obj => {
      const dist = Math.hypot(this.playerX - obj.x, this.playerY - obj.y);
      if (dist < obj.radius + 60) showHint(obj.x, obj.y - obj.radius - 20, '[F] Examine');
    });
  }

  // ── Atmosphere ─────────────────────────────────────────────
  _renderAtmosphere(ctx, W, H, t, glow) {
    // Edge vignette
    const vig = ctx.createRadialGradient(W/2, H/2, W * 0.25, W/2, H/2, W * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,8,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Floating rune particles around ward circle
    const cx = W/2, cy = H/2 + 20;
    const glyphs = ['⬡', '✦', '◈', '⊕', '⟐'];
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i / 8) + t * 0.05;
      const r = 195 + Math.sin(t * 0.8 + i) * 12;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      const alpha = 0.12 + Math.sin(t * 1.5 + i * 0.8) * 0.08;
      ctx.fillStyle = `rgba(160,80,255,${alpha})`;
      ctx.font = '11px serif';
      ctx.textAlign = 'center';
      ctx.fillText(glyphs[i % glyphs.length], px, py);
    }

    // Mist wisps at floor level (bottom quarter)
    for (let i = 0; i < 5; i++) {
      const mx = (i / 4) * W;
      const my = H - 40 + Math.sin(t * 0.6 + i) * 10;
      const mistGrad = ctx.createRadialGradient(mx, my, 0, mx, my, 80);
      mistGrad.addColorStop(0, `rgba(40,20,70,${0.04 + glow * 0.02})`);
      mistGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mistGrad;
      ctx.beginPath();
      ctx.ellipse(mx, my, 80, 25, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderPlayer(ctx, t = 0) {
    const x = this.playerX;
    const isMoving = this.game.input.isDown('ArrowLeft') || this.game.input.isDown('ArrowRight') ||
                     this.game.input.isDown('ArrowUp') || this.game.input.isDown('ArrowDown') ||
                     this.game.input.isDown('KeyA') || this.game.input.isDown('KeyD') ||
                     this.game.input.isDown('KeyW') || this.game.input.isDown('KeyS');
    const bob = isMoving ? Math.sin(t * 12) * 3 : 0;
    const y = this.playerY + bob;
    const portrait = this.game.images['assets/characters/motley_max.png'];
    const size = 48;

    // Floor shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, this.playerY + size * 0.4, size * 0.4, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Player glow
    const pGlow = ctx.createRadialGradient(x, y, 0, x, y, size);
    pGlow.addColorStop(0, 'rgba(160,80,255,0.15)');
    pGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pGlow;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    if (portrait) {
      ctx.save();
      // Pulsing ring
      const ringAlpha = 0.5 + Math.sin(t * 3) * 0.25;
      ctx.beginPath();
      ctx.arc(x, y, size/2 + 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200,140,255,${ringAlpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Portrait clipped to circle
      ctx.beginPath();
      ctx.arc(x, y, size/2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(portrait, x - size/2, y - size/2, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle = '#8040ff';
      ctx.beginPath();
      ctx.arc(x, y, size/2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Name tag
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 38, y + size/2 + 4, 76, 15);
    ctx.fillStyle = '#e0c0ff';
    ctx.font = 'bold 10px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('Motley Max', x, y + size/2 + 14);
  }

  renderPartyStatus(ctx, canvas) {
    const W = canvas.width;
    const party = this.game.party;
    const barW = 120, barH = 8;
    const startX = W - barW - 20;

    party.forEach((m, i) => {
      const py = 20 + i * 65;
      const portrait = this.game.images[m.portrait];

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(startX - 40, py - 5, barW + 60, 55);

      // Portrait
      if (portrait) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(startX - 20, py + 22, 18, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(portrait, startX - 38, py + 4, 36, 36);
        ctx.restore();
      }

      // Name
      ctx.fillStyle = '#e0c0ff';
      ctx.font = 'bold 11px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText(m.name, startX, py + 8);

      // HP bar
      const hpPct = m.currentHp / m.stats.hp;
      ctx.fillStyle = 'rgba(50,20,80,0.8)';
      ctx.fillRect(startX, py + 14, barW, barH);
      ctx.fillStyle = hpPct > 0.5 ? '#40c060' : hpPct > 0.25 ? '#c0a020' : '#c04040';
      ctx.fillRect(startX, py + 14, barW * hpPct, barH);
      ctx.fillStyle = '#80ff80';
      ctx.font = '9px monospace';
      ctx.fillText(`HP ${m.currentHp}/${m.stats.hp}`, startX, py + 30);

      // MP bar
      const mpPct = m.currentMp / m.stats.mp;
      ctx.fillStyle = 'rgba(30,10,60,0.8)';
      ctx.fillRect(startX, py + 32, barW, barH - 2);
      ctx.fillStyle = '#4080c0';
      ctx.fillRect(startX, py + 32, barW * mpPct, barH - 2);
      ctx.fillStyle = '#80c0ff';
      ctx.font = '9px monospace';
      ctx.fillText(`MP ${m.currentMp}/${m.stats.mp}`, startX, py + 46);
    });
  }
}

// ─── Battle Manager ──────────────────────────────────────────
class BattleManager {
  constructor(game, party, enemies, bgKey, onWin, onLose) {
    this.game = game;
    this.bgKey = bgKey;
    this.onWin = onWin;
    this.onLose = onLose;

    // Deep copy party/enemies for battle
    this.party = party.map(m => ({ ...m, stats: { ...m.stats }, statusEffects: [], shieldAmount: 0, defending: false }));
    this.enemies = enemies;

    this.turnOrder = [];
    this.currentTurn = 0;
    this.phase = 'PLAYER_TURN'; // PLAYER_TURN, ENEMY_TURN, ANIMATING, VICTORY, DEFEAT
    this.selectedAction = 0; // 0=Attack, 1=Ability, 2=Item, 3=Defend
    this.selectedTarget = 0;
    this.selectedAbility = 0;
    this.selectedItem = 0;
    this.selectedMember = 0;
    this.subMenu = null; // null, 'target', 'ability', 'item', 'ability_target', 'item_target'
    this.battleLog = [];
    this.logTimer = 0;
    this.animTimer = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.pendingAction = null;
    this.rewards = null;
    this.levelUps = [];

    // ── Visual FX ─────────────────────────────────────────────
    this.floatingTexts = [];       // damage/heal numbers that drift up
    this.hitFlashes = {};          // id → flash intensity 0–1
    this.actionAnnounce = null;    // { text, timer, maxTimer, color }
    this.victoryParticles = [];    // burst on win
    this.enemyPositions = [];      // set each render frame, used by fx spawners
    this.partyPositions = [];

    this.buildTurnOrder();
    this.addLog(`⚔ Battle begins!`);
  }

  buildTurnOrder() {
    const combatants = [
      ...this.party.map(m => ({ ...m, isPlayer: true })),
      ...this.enemies.map(e => ({ ...e, isPlayer: false })),
    ];
    combatants.sort((a, b) => b.stats.spd - a.stats.spd);
    this.turnOrder = combatants;
    this.currentTurn = 0;
    this.advanceToNextTurn();
  }

  advanceToNextTurn() {
    // Skip dead combatants
    let loops = 0;
    while (loops < 20) {
      const c = this.turnOrder[this.currentTurn % this.turnOrder.length];
      if (c.currentHp > 0) break;
      this.currentTurn++;
      loops++;
    }
    const c = this.turnOrder[this.currentTurn % this.turnOrder.length];
    if (c.isPlayer) {
      // Find which party member
      this.selectedMember = this.party.findIndex(m => m.id === c.id && m.currentHp > 0);
      if (this.selectedMember < 0) this.selectedMember = this.party.findIndex(m => m.currentHp > 0);
      this.phase = 'PLAYER_TURN';
      this.selectedAction = 0;
      this.subMenu = null;
      c.defending = false;
      this.applyStatusEffects(c);
    } else {
      this.phase = 'ENEMY_TURN';
      this.scheduleEnemyAction(c);
    }
  }

  applyStatusEffects(combatant) {
    if (!combatant.statusEffects) return;
    combatant.statusEffects = combatant.statusEffects.filter(se => {
      if (se.type === 'burn') {
        const dmg = 8;
        combatant.currentHp = Math.max(0, combatant.currentHp - dmg);
        this.addLog(`${combatant.name} takes ${dmg} burn damage!`);
      } else if (se.type === 'poison') {
        const dmg = 5;
        combatant.currentHp = Math.max(0, combatant.currentHp - dmg);
        this.addLog(`${combatant.name} takes ${dmg} poison damage!`);
      }
      se.duration--;
      return se.duration > 0;
    });
  }

  scheduleEnemyAction(enemy) {
    setTimeout(() => {
      if (this.phase !== 'ENEMY_TURN') return;
      this.executeEnemyAction(enemy);
    }, 1200);
  }

  executeEnemyAction(enemy) {
    const alive = this.party.filter(m => m.currentHp > 0);
    if (!alive.length) { this.checkBattleEnd(); return; }

    const ability = this.chooseEnemyAbility(enemy);
    const target = alive[Math.floor(Math.random() * alive.length)];

    this.executeAbility(enemy, [target], ability, false);
    this.checkBattleEnd();

    setTimeout(() => {
      this.currentTurn++;
      this.advanceToNextTurn();
    }, 600);
  }

  chooseEnemyAbility(enemy) {
    const ai = enemy.ai || 'balanced';
    const abilities = enemy.abilities || ['claw_swipe'];
    // Simple AI: aggressive prefers high-power, balanced is random, defensive heals if low HP
    if (ai === 'aggressive' && Math.random() < 0.4) {
      const heavy = abilities.filter(a => {
        const def = this.game.getAbilityDef(a);
        return def && (def.power || 0) > 1.2;
      });
      if (heavy.length) return heavy[Math.floor(Math.random() * heavy.length)];
    }
    return abilities[Math.floor(Math.random() * abilities.length)];
  }

  executeAbility(actor, targets, abilityId, isPlayer) {
    const abilityDef = this.game.getAbilityDef(abilityId) || {
      id: abilityId, name: 'Attack', mp_cost: 0, target: 'single', type: 'attack', power: 1.0
    };

    // MP check
    if (abilityDef.mp_cost > 0) {
      if (actor.currentMp < abilityDef.mp_cost) {
        this.addLog(`${actor.name} has no MP!`);
        return false;
      }
      actor.currentMp -= abilityDef.mp_cost;
    }

    this.addLog(`${actor.name} uses ${abilityDef.name}!`);

    // Announce ability name for player actions
    if (isPlayer) {
      const abilityColors = { attack: '#ff8060', magic: '#c060ff', heal: '#60ff80', drain: '#a040ff', debuff: '#ffb040', buff: '#60d0ff', control: '#ff60ff' };
      const col = abilityColors[abilityDef.type] || '#f0d080';
      this.setActionAnnounce(abilityDef.name.toUpperCase(), col);
      this.game.audio.playMagic();
    } else {
      this.game.audio.playAttack();
    }

    const hits = abilityDef.hits || 1;
    targets.forEach(target => {
      for (let h = 0; h < hits; h++) {
        this.resolveHit(actor, target, abilityDef, isPlayer);
      }
    });

    return true;
  }

  resolveHit(actor, target, abilityDef, isPlayer) {
    // Helper: get screen position for a combatant
    const getPos = (t) => {
      const ep = this.enemyPositions.find(p => p.id === t.id);
      const pp = this.partyPositions.find(p => p.id === t.id);
      return ep || pp || { x: 450, y: 200 };
    };

    if (abilityDef.type === 'heal') {
      const heal = abilityDef.power + (actor.stats?.lck || 0) * 0.5;
      target.currentHp = Math.min(target.stats.hp, target.currentHp + heal);
      const healAmt = Math.floor(heal);
      this.addLog(`${target.name} recovers ${healAmt} HP!`);
      this.game.audio.playHeal();
      const pos = getPos(target);
      this.spawnFloat(pos.x, pos.y - 30, `+${healAmt}`, '#60ff80');
      return;
    }

    if (abilityDef.type === 'drain') {
      const dmg = this.calcDamage(actor, target, abilityDef);
      target.currentHp = Math.max(0, target.currentHp - dmg);
      actor.currentHp = Math.min(actor.stats.hp, actor.currentHp + Math.floor(dmg * 0.5));
      this.addLog(`${target.name} takes ${dmg} damage! ${actor.name} absorbs ${Math.floor(dmg*0.5)} HP!`);
      const tPos = getPos(target);
      this.spawnFloat(tPos.x, tPos.y - 30, dmg, '#c060ff');
      this.spawnHitFlash(target.id);
      this.shakeX = 5; this.shakeY = 3;
      return;
    }

    if (abilityDef.type === 'buff' && abilityDef.effect === 'evade') {
      target.statusEffects = target.statusEffects || [];
      target.statusEffects.push({ type: 'evade', duration: 1 });
      this.addLog(`${target.name} is ready to evade!`);
      const pos = getPos(target);
      this.spawnFloat(pos.x, pos.y - 30, 'EVADE+', '#60d0ff');
      return;
    }

    if (abilityDef.type === 'debuff') {
      target.statusEffects = target.statusEffects || [];
      target.statusEffects.push({ type: abilityDef.effect, duration: abilityDef.effect_duration || 2 });
      const statusLabels = { atk_down: 'ATK↓', spd_down: 'SPD↓', confuse: 'CONFUSE', burn: 'BURN!', freeze: 'FREEZE!' };
      const label = statusLabels[abilityDef.effect] || abilityDef.effect.toUpperCase();
      this.addLog(`${target.name} is ${abilityDef.effect}!`);
      const pos = getPos(target);
      this.spawnFloat(pos.x, pos.y - 30, label, '#ffb040');
      return;
    }

    // Damage calculation
    let dmg = this.calcDamage(actor, target, abilityDef);

    // Apply shield
    if (target.shieldAmount > 0) {
      const blocked = Math.min(target.shieldAmount, dmg);
      dmg -= blocked;
      target.shieldAmount -= blocked;
      if (blocked > 0) {
        this.addLog(`${target.name}'s ward absorbs ${blocked}!`);
        const pos = getPos(target);
        this.spawnFloat(pos.x, pos.y - 50, `WARD-${blocked}`, '#8080ff');
      }
    }

    // Apply defend
    if (target.defending) dmg = Math.floor(dmg * 0.5);

    // Apply evade
    const evadeEffect = target.statusEffects?.find(e => e.type === 'evade');
    if (evadeEffect && Math.random() < 0.7) {
      this.addLog(`${target.name} evades the attack!`);
      target.statusEffects = target.statusEffects.filter(e => e !== evadeEffect);
      const pos = getPos(target);
      this.spawnFloat(pos.x, pos.y - 30, 'MISS', '#a0a0a0');
      return;
    }

    const prevHp = target.currentHp;
    target.currentHp = Math.max(0, target.currentHp - dmg);
    const defeated = target.currentHp <= 0 && prevHp > 0;
    this.addLog(`${target.name} takes ${dmg} damage!${defeated ? ' Defeated!' : ''}`);
    this.game.audio.playHit();

    // Shake: heavier for big hits
    const shakeMag = Math.min(12, 4 + dmg * 0.15);
    this.shakeX = shakeMag;
    this.shakeY = shakeMag * 0.5;

    // Hit flash on target
    this.spawnHitFlash(target.id || target.name);

    // Floating damage number — color by context
    const pos = getPos(target);
    const isCrit = abilityDef.effect === 'random_power' && dmg > 30;
    const numColor = defeated ? '#ff4040' : isCrit ? '#ffee00' : isPlayer ? '#ff8060' : '#ff4040';
    this.spawnFloat(pos.x, pos.y - 40, dmg, numColor, isCrit || defeated);

    // Apply status effect from attack
    if (abilityDef.effect && abilityDef.type === 'attack' && Math.random() < 0.6) {
      target.statusEffects = target.statusEffects || [];
      target.statusEffects.push({ type: abilityDef.effect, duration: abilityDef.effect_duration || 2 });
      const statusLabels = { burn: 'BURN!', freeze: 'FREEZE!', confuse: 'CONFUSE', atk_down: 'ATK↓' };
      this.addLog(`${target.name} is ${abilityDef.effect}!`);
      this.spawnFloat(pos.x + 20, pos.y - 60, statusLabels[abilityDef.effect] || '!', '#ffb040');
    }
  }

  calcDamage(actor, target, abilityDef) {
    const atk = actor.stats?.atk || 15;
    const def = target.stats?.def || 10;
    const ignoreDef = abilityDef.ignore_def || 0;
    const effectiveDef = Math.floor(def * (1 - ignoreDef));

    let power = abilityDef.power || 1.0;

    // Jester's Gambit: random power
    if (abilityDef.effect === 'random_power') {
      power = 0.5 + Math.random() * 2.5;
      this.addLog(`${power > 1.5 ? '✨ Critical hit!' : power < 0.8 ? '💨 Weak...' : 'Hit!'}`);
    }

    const base = Math.max(1, (atk - effectiveDef) * power);
    const variance = abilityDef.variance ? base * abilityDef.variance : base * 0.1;
    return Math.max(1, Math.floor(base + (Math.random() - 0.5) * 2 * variance));
  }

  addLog(msg) {
    this.battleLog.push({ text: msg, timer: 3.0 });
    if (this.battleLog.length > 6) this.battleLog.shift();
  }

  // ─── Visual FX Spawners ───────────────────────────────────
  spawnFloat(x, y, text, color = '#ffffff', big = false) {
    this.floatingTexts.push({
      x: x + (Math.random() - 0.5) * 30,
      y,
      text: String(text),
      color,
      life: 1.0,
      vy: -(60 + Math.random() * 40),
      size: big ? 28 : 20,
    });
  }

  spawnHitFlash(targetId) {
    this.hitFlashes[targetId] = 1.0;
  }

  spawnVictoryBurst(cx, cy) {
    const colors = ['#f0d060', '#d080ff', '#60e0ff', '#ff8060', '#80ff80'];
    for (let i = 0; i < 60; i++) {
      const angle = (Math.PI * 2 * i) / 60 + Math.random() * 0.2;
      const speed = 80 + Math.random() * 200;
      this.victoryParticles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        life: 1.0,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 5,
      });
    }
  }

  setActionAnnounce(text, color = '#f0d080') {
    this.actionAnnounce = { text, timer: 1.2, maxTimer: 1.2, color };
  }

  // ─── FX Update ────────────────────────────────────────────
  updateFx(dt) {
    // Floating texts
    this.floatingTexts = this.floatingTexts.filter(ft => {
      ft.y += ft.vy * dt;
      ft.vy *= 0.92;
      ft.life -= dt * 1.2;
      return ft.life > 0;
    });

    // Hit flashes
    Object.keys(this.hitFlashes).forEach(id => {
      this.hitFlashes[id] -= dt * 5;
      if (this.hitFlashes[id] <= 0) delete this.hitFlashes[id];
    });

    // Action announce
    if (this.actionAnnounce) {
      this.actionAnnounce.timer -= dt;
      if (this.actionAnnounce.timer <= 0) this.actionAnnounce = null;
    }

    // Victory particles
    this.victoryParticles = this.victoryParticles.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt; // gravity
      p.life -= dt * 0.8;
      return p.life > 0;
    });

    // Shake decay
    if (this.shakeX > 0.2) this.shakeX *= 0.75; else this.shakeX = 0;
    if (this.shakeY > 0.2) this.shakeY *= 0.75; else this.shakeY = 0;
  }

  // ─── FX Render ────────────────────────────────────────────
  renderFx(ctx) {
    // Floating texts
    this.floatingTexts.forEach(ft => {
      const alpha = Math.min(1, ft.life * 1.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${ft.size}px 'Cinzel', Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    // Action announce (centered, fades in and out)
    if (this.actionAnnounce) {
      const a = this.actionAnnounce;
      const progress = a.timer / a.maxTimer;
      // Fade in first 0.2, hold, fade out last 0.3
      let alpha = 1;
      if (progress > 0.8) alpha = (1 - progress) / 0.2;
      else if (progress < 0.3) alpha = progress / 0.3;

      const canvas = ctx.canvas;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.textAlign = 'center';
      ctx.font = `bold 26px 'Cinzel', Georgia, serif`;
      const tw = ctx.measureText(a.text).width;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(canvas.width / 2 - tw / 2 - 16, canvas.height * 0.44 - 26, tw + 32, 40);
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.lineWidth = 4;
      ctx.strokeText(a.text, canvas.width / 2, canvas.height * 0.44);
      ctx.fillStyle = a.color;
      ctx.shadowColor = a.color;
      ctx.shadowBlur = 15;
      ctx.fillText(a.text, canvas.width / 2, canvas.height * 0.44);
      ctx.restore();
    }

    // Victory particles
    this.victoryParticles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  checkBattleEnd() {
    const allEnemiesDead = this.enemies.every(e => e.currentHp <= 0);
    const allPartyDead = this.party.every(m => m.currentHp <= 0);

    if (allEnemiesDead) {
      this.phase = 'VICTORY';
      this.calcRewards();
      this.game.state = STATE.VICTORY;
      this.game.audio.playVictory();
      const canvas = document.getElementById('game-canvas');
      this.spawnVictoryBurst(canvas.width / 2, canvas.height * 0.35);
      this.setActionAnnounce('VICTORY!', '#f0d060');
      return true;
    }
    if (allPartyDead) {
      this.phase = 'DEFEAT';
      this.game.state = STATE.DEFEAT;
      this.game.audio.playDefeat();
      return true;
    }
    return false;
  }

  calcRewards() {
    let totalExp = 0, totalGold = 0;
    const items = [];
    this.enemies.forEach(e => {
      totalExp += e.rewards?.exp || 0;
      totalGold += e.rewards?.gold || 0;
      e.rewards?.items?.forEach(id => items.push(id));
    });
    this.rewards = { exp: totalExp, gold: totalGold, items };

    this.game.gold += totalGold;
    items.forEach(id => this.game.addItem(id));

    // Grant EXP and track level-ups
    this.levelUps = [];
    this.game.party.forEach(m => {
      if (m.currentHp <= 0) return;
      const before = m.level;
      this.game.grantExp(m, totalExp);
      if (m.level > before) this.levelUps.push({ name: m.name, level: m.level });
    });

    // Sync party HP/MP back to game.party
    this.party.forEach(bp => {
      const gm = this.game.party.find(m => m.id === bp.id);
      if (gm) { gm.currentHp = bp.currentHp; gm.currentMp = bp.currentMp; }
    });
  }

  update(dt) {
    this.logTimer += dt;
    this.animTimer += dt;
    this.updateFx(dt);
  }

  // ─── Battle Input ─────────────────────────────────────────
  onKey(code) {
    if (this.phase !== 'PLAYER_TURN') return;
    const g = this.game;

    if (!this.subMenu) {
      // Main action menu
      if (code === 'ArrowUp' || code === 'KeyW') {
        this.selectedAction = (this.selectedAction - 1 + 4) % 4;
        g.audio.playCursor();
      }
      if (code === 'ArrowDown' || code === 'KeyS') {
        this.selectedAction = (this.selectedAction + 1) % 4;
        g.audio.playCursor();
      }
      if (code === 'Enter' || code === 'KeyZ') {
        g.audio.playConfirm();
        this.confirmAction();
      }
    } else if (this.subMenu === 'target') {
      const targets = this.enemies.filter(e => e.currentHp > 0);
      if (code === 'ArrowLeft' || code === 'KeyA') { this.selectedTarget = (this.selectedTarget - 1 + targets.length) % targets.length; g.audio.playCursor(); }
      if (code === 'ArrowRight' || code === 'KeyD') { this.selectedTarget = (this.selectedTarget + 1) % targets.length; g.audio.playCursor(); }
      if (code === 'Enter' || code === 'KeyZ') { g.audio.playConfirm(); this.executePlayerAttack(); }
      if (code === 'Escape' || code === 'KeyX') { this.subMenu = null; g.audio.playCancel(); }
    } else if (this.subMenu === 'ability') {
      const member = this.party[this.selectedMember];
      const abils = member?.abilities || [];
      if (code === 'ArrowUp' || code === 'KeyW') { this.selectedAbility = (this.selectedAbility - 1 + abils.length) % abils.length; g.audio.playCursor(); }
      if (code === 'ArrowDown' || code === 'KeyS') { this.selectedAbility = (this.selectedAbility + 1) % abils.length; g.audio.playCursor(); }
      if (code === 'Enter' || code === 'KeyZ') { g.audio.playConfirm(); this.subMenu = 'ability_target'; this.selectedTarget = 0; }
      if (code === 'Escape' || code === 'KeyX') { this.subMenu = null; g.audio.playCancel(); }
    } else if (this.subMenu === 'ability_target') {
      const targets = this.enemies.filter(e => e.currentHp > 0);
      if (code === 'ArrowLeft' || code === 'KeyA') { this.selectedTarget = (this.selectedTarget - 1 + targets.length) % targets.length; g.audio.playCursor(); }
      if (code === 'ArrowRight' || code === 'KeyD') { this.selectedTarget = (this.selectedTarget + 1) % targets.length; g.audio.playCursor(); }
      if (code === 'Enter' || code === 'KeyZ') { g.audio.playConfirm(); this.executePlayerAbility(); }
      if (code === 'Escape' || code === 'KeyX') { this.subMenu = 'ability'; g.audio.playCancel(); }
    } else if (this.subMenu === 'item') {
      const inv = g.inventory.filter(i => i.quantity > 0);
      if (code === 'ArrowUp' || code === 'KeyW') { this.selectedItem = (this.selectedItem - 1 + inv.length) % inv.length; g.audio.playCursor(); }
      if (code === 'ArrowDown' || code === 'KeyS') { this.selectedItem = (this.selectedItem + 1) % inv.length; g.audio.playCursor(); }
      if (code === 'Enter' || code === 'KeyZ') { g.audio.playConfirm(); this.executePlayerItem(); }
      if (code === 'Escape' || code === 'KeyX') { this.subMenu = null; g.audio.playCancel(); }
    }
  }

  confirmAction() {
    const actions = ['attack', 'ability', 'item', 'defend'];
    const action = actions[this.selectedAction];
    if (action === 'attack') { this.subMenu = 'target'; this.selectedTarget = 0; }
    else if (action === 'ability') { this.subMenu = 'ability'; this.selectedAbility = 0; }
    else if (action === 'item') { this.subMenu = 'item'; this.selectedItem = 0; }
    else if (action === 'defend') { this.executeDefend(); }
  }

  executePlayerAttack() {
    const member = this.party[this.selectedMember];
    const targets = this.enemies.filter(e => e.currentHp > 0);
    const target = targets[this.selectedTarget];
    if (!target || !member) return;

    // Basic attack
    const dmg = this.calcDamage(member, target, { power: 1.0 });
    if (target.shieldAmount > 0) {
      const blocked = Math.min(target.shieldAmount, dmg);
      target.shieldAmount -= blocked;
    }
    const effectiveDmg = target.defending ? Math.floor(dmg * 0.5) : dmg;
    const prevHp = target.currentHp;
    target.currentHp = Math.max(0, target.currentHp - effectiveDmg);
    const defeated = target.currentHp <= 0 && prevHp > 0;
    this.addLog(`${member.name} attacks ${target.name} for ${effectiveDmg}!${defeated ? ' Defeated!' : ''}`);
    this.game.audio.playAttack();
    this.shakeX = 6; this.shakeY = 3;
    this.spawnHitFlash(target.id || target.name);
    const ePos = this.enemyPositions.find(p => p.id === (target.id || target.name));
    if (ePos) this.spawnFloat(ePos.x, ePos.y - 40, effectiveDmg, defeated ? '#ff4040' : '#ff8060', defeated);
    this.setActionAnnounce('ATTACK', '#ff8060');
    this.subMenu = null;

    if (!this.checkBattleEnd()) this.endPlayerTurn();
  }

  executePlayerAbility() {
    const member = this.party[this.selectedMember];
    const abilities = member?.abilities || [];
    const abilityId = abilities[this.selectedAbility];
    const abilityDef = this.game.getAbilityDef(abilityId);
    if (!abilityDef) return;

    const targets = this.enemies.filter(e => e.currentHp > 0);
    const target = targets[this.selectedTarget];

    let targetList = [target];
    if (abilityDef.target === 'all_enemies') targetList = this.enemies.filter(e => e.currentHp > 0);
    else if (abilityDef.target === 'all_allies') targetList = this.party.filter(m => m.currentHp > 0);
    else if (abilityDef.target === 'single_ally') targetList = [member];
    else if (abilityDef.target === 'self') targetList = [member];

    const ok = this.executeAbility(member, targetList, abilityId, true);
    if (!ok) return;
    this.game.audio.playMagic();
    this.subMenu = null;

    if (!this.checkBattleEnd()) this.endPlayerTurn();
  }

  executePlayerItem() {
    const inv = this.game.inventory.filter(i => i.quantity > 0);
    const entry = inv[this.selectedItem];
    if (!entry) return;
    const def = this.game.getItemDef(entry.id);
    if (!def) return;

    const member = this.party[this.selectedMember];
    let used = false;

    if (def.effect === 'heal_hp') {
      member.currentHp = Math.min(member.stats.hp, member.currentHp + def.value);
      this.addLog(`${member.name} uses ${def.name} and recovers ${def.value} HP!`);
      this.game.audio.playHeal();
      used = true;
    } else if (def.effect === 'restore_mp') {
      member.currentMp = Math.min(member.stats.mp, member.currentMp + def.value);
      this.addLog(`${member.name} uses ${def.name} and recovers ${def.value} MP!`);
      this.game.audio.playMagic();
      used = true;
    } else if (def.effect === 'shield') {
      member.shieldAmount = (member.shieldAmount || 0) + def.value;
      this.addLog(`${member.name} uses ${def.name}! Shield: ${member.shieldAmount}`);
      used = true;
    } else if (def.effect === 'full_heal') {
      member.currentHp = member.stats.hp;
      member.currentMp = member.stats.mp;
      member.statusEffects = [];
      this.addLog(`${member.name} is fully restored!`);
      this.game.audio.playHeal();
      used = true;
    } else if (def.effect === 'revive') {
      if (member.currentHp <= 0) {
        member.currentHp = Math.floor(member.stats.hp * (def.value / 100));
        this.addLog(`${member.name} is revived with ${member.currentHp} HP!`);
        this.game.audio.playHeal();
        used = true;
      }
    }

    if (used) {
      this.game.removeItem(entry.id);
      this.subMenu = null;
      if (!this.checkBattleEnd()) this.endPlayerTurn();
    }
  }

  executeDefend() {
    const member = this.party[this.selectedMember];
    member.defending = true;
    this.addLog(`${member.name} defends! (DMG halved next hit)`);
    this.endPlayerTurn();
  }

  endPlayerTurn() {
    this.subMenu = null;
    this.currentTurn++;
    setTimeout(() => this.advanceToNextTurn(), 300);
  }

  endVictory() {
    this.game.battle = null;
    this.game.state = STATE.EXPLORE;
    if (this.onWin) this.onWin();
  }

  endDefeat() {
    this.game.battle = null;
    if (this.onLose) this.onLose();
    else this.game.state = STATE.EXPLORE;
  }

  // ─── Battle Rendering ─────────────────────────────────────
  render(ctx, canvas) {
    const W = canvas.width, H = canvas.height;

    // Background
    const bg = this.game.images[`assets/backgrounds/${this.bgKey}.jpg`];
    if (bg) {
      ctx.drawImage(bg, 0, 0, W, H);
      ctx.fillStyle = 'rgba(5,0,15,0.5)';
      ctx.fillRect(0, 0, W, H);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#080020');
      grad.addColorStop(1, '#030010');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // Screen shake — applied to the enemy area only (leaves UI stable)
    const shakeOffX = this.shakeX > 0 ? (Math.random() - 0.5) * this.shakeX * 2 : 0;
    const shakeOffY = this.shakeY > 0 ? (Math.random() - 0.5) * this.shakeY * 2 : 0;

    // Reset position tracking each frame
    this.enemyPositions = [];
    this.partyPositions = [];

    // Enemies
    const allEnemies = this.enemies; // render dead too (ghosted)
    const numE = this.enemies.length;
    allEnemies.forEach((e, i) => {
      const ex = W * (0.3 + (i - (numE-1)/2) * 0.25);
      const ey = H * 0.25;
      const es = Math.min(W * 0.28, 200);

      // Store position for FX
      this.enemyPositions.push({ id: e.id || e.name, x: ex, y: ey });

      const isDead = e.currentHp <= 0;
      const portrait = this.game.images[e.portrait];
      const flashIntensity = this.hitFlashes[e.id || e.name] || 0;

      if (portrait) {
        ctx.save();
        // Shake only living enemies
        if (!isDead && (shakeOffX !== 0 || shakeOffY !== 0)) {
          ctx.translate(shakeOffX, shakeOffY);
        }
        ctx.globalAlpha = isDead ? 0.25 : 1;
        ctx.drawImage(portrait, ex - es/2, ey - es/2, es, es);

        // Hit flash — white overlay composite
        if (flashIntensity > 0) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `rgba(255,200,200,${flashIntensity * 0.6})`;
          ctx.fillRect(ex - es/2, ey - es/2, es, es);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
      }

      if (isDead) return; // skip UI for dead enemies

      // Enemy HP bar
      const barW = 140, barH = 10;
      const bx = ex - barW/2, by = ey + es/2 + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx - 2, by - 2, barW + 4, barH + 4);
      const hpPct = e.currentHp / e.stats.hp;
      ctx.fillStyle = hpPct > 0.5 ? '#40c060' : hpPct > 0.25 ? '#c0a020' : '#c04040';
      ctx.fillRect(bx, by, barW * hpPct, barH);

      // Selection indicator
      const targets = this.enemies.filter(en => en.currentHp > 0);
      const tIdx = targets.indexOf(e);
      if ((this.subMenu === 'target' || this.subMenu === 'ability_target') && tIdx === this.selectedTarget) {
        // Pulsing selection ring
        const pulse = 0.7 + Math.sin(this.animTimer * 6) * 0.3;
        ctx.strokeStyle = `rgba(240,192,96,${pulse})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(ex - es/2 - 4, ey - es/2 - 4, es + 8, es + 8);
        ctx.fillStyle = '#f0c060';
        ctx.font = 'bold 20px Georgia';
        ctx.textAlign = 'center';
        // Bouncing arrow
        const bounce = Math.sin(this.animTimer * 8) * 4;
        ctx.fillText('▾', ex, ey - es/2 - 8 + bounce);
      }

      // Enemy name + HP
      ctx.fillStyle = '#e0d0ff';
      ctx.font = 'bold 13px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(e.name, ex, by + barH + 16);
      ctx.font = '11px monospace';
      ctx.fillStyle = '#a0d0a0';
      ctx.fillText(`${e.currentHp}/${e.stats.hp}`, ex, by + barH + 30);

      // Status icons
      if (e.statusEffects?.length) {
        ctx.font = '14px serif';
        e.statusEffects.forEach((se, si) => {
          const icons = { burn: '🔥', freeze: '❄️', confuse: '💫', poison: '☠️', atk_down: '⬇️', spd_down: '🐢' };
          ctx.fillText(icons[se.type] || '✦', ex - 20 + si * 22, ey - es/2 - 20);
        });
      }
    });

    // Party section (bottom)
    const partyY = H * 0.68;
    drawRoundedRect(ctx, 10, partyY - 10, W - 20, H - partyY - 10, 10, 'rgba(5,0,20,0.88)', 'rgba(100,50,200,0.5)', 2);

    // Current acting member indicator
    const activeMember = this.party[this.selectedMember];

    this.party.forEach((m, i) => {
      const px = 20 + i * (W / this.party.length - 10);
      const py = partyY;
      const isCurrent = i === this.selectedMember && this.phase === 'PLAYER_TURN';

      // Store position for FX (center of portrait)
      const pSize = 68;
      this.partyPositions.push({ id: m.id || m.name, x: px + pSize / 2, y: py + pSize / 2 });

      const portrait = this.game.images[m.portrait];
      if (portrait) {
        ctx.save();
        ctx.globalAlpha = m.currentHp <= 0 ? 0.3 : 1;
        if (isCurrent) {
          ctx.shadowColor = 'rgba(200,150,255,0.8)';
          ctx.shadowBlur = 15;
        }
        ctx.beginPath();
        ctx.roundRect(px, py, pSize, pSize, 6);
        ctx.clip();
        ctx.drawImage(portrait, px, py, pSize, pSize);
        ctx.restore();
      }

      // Highlight current
      if (isCurrent) {
        ctx.strokeStyle = '#f0c060';
        ctx.lineWidth = 2;
        ctx.strokeRect(px - 1, py - 1, pSize + 2, pSize + 2);
      }

      // Name
      ctx.fillStyle = m.currentHp <= 0 ? '#606060' : isCurrent ? '#f0d080' : '#d0b0ff';
      ctx.font = `${isCurrent ? 'bold' : ''} 11px Georgia, serif`;
      ctx.textAlign = 'left';
      ctx.fillText(m.name.split(' ')[0], px, py + pSize + 14);
      ctx.font = '9px monospace';
      ctx.fillText(`Lv.${m.level}`, px, py + pSize + 26);

      // HP/MP bars
      const bW = pSize, bH = 7;
      const hpPct = m.currentHp / m.stats.hp;
      ctx.fillStyle = 'rgba(30,15,50,0.8)';
      ctx.fillRect(px, py + pSize + 30, bW, bH);
      ctx.fillStyle = hpPct > 0.5 ? '#40c060' : hpPct > 0.25 ? '#c0a020' : '#c04040';
      ctx.fillRect(px, py + pSize + 30, bW * hpPct, bH);

      const mpPct = m.currentMp / m.stats.mp;
      ctx.fillStyle = 'rgba(20,10,40,0.8)';
      ctx.fillRect(px, py + pSize + 40, bW, bH - 1);
      ctx.fillStyle = '#4080c0';
      ctx.fillRect(px, py + pSize + 40, bW * mpPct, bH - 1);

      // HP/MP numbers
      ctx.fillStyle = '#80ff80';
      ctx.font = '9px monospace';
      ctx.fillText(`${m.currentHp}/${m.stats.hp}`, px, py + pSize + 58);
      ctx.fillStyle = '#80c0ff';
      ctx.fillText(`${m.currentMp}/${m.stats.mp}`, px, py + pSize + 69);
    });

    // Action menu (right side)
    if (this.phase === 'PLAYER_TURN' && !this.subMenu) {
      const menuX = W * 0.65, menuY = partyY + 5;
      const actions = ['⚔ Attack', '✨ Ability', '🧪 Item', '🛡 Defend'];
      actions.forEach((a, i) => {
        const ay = menuY + i * 35;
        const selected = this.selectedAction === i;
        if (selected) {
          ctx.fillStyle = 'rgba(120,60,200,0.5)';
          ctx.fillRect(menuX - 8, ay - 18, 180, 32);
        }
        ctx.fillStyle = selected ? '#f0c060' : '#d0b0ff';
        ctx.font = `${selected ? 'bold' : ''} 15px 'Cinzel', serif`;
        ctx.textAlign = 'left';
        ctx.fillText(a, menuX, ay);
      });
      ctx.fillStyle = 'rgba(150,100,200,0.5)';
      ctx.font = '10px monospace';
      ctx.fillText('W/S: Navigate   Enter: Confirm', menuX, menuY + 155);
    }

    // Sub-menu: Target select
    if (this.subMenu === 'target' || this.subMenu === 'ability_target') {
      const targets = this.enemies.filter(e => e.currentHp > 0);
      ctx.fillStyle = '#f0d080';
      ctx.font = 'bold 14px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.fillText('← → Select Target   Enter: Confirm   Esc: Back', W/2, partyY - 20);
    }

    // Sub-menu: Ability list
    if (this.subMenu === 'ability') {
      const member = this.party[this.selectedMember];
      const menuX = W * 0.55, menuY = partyY;
      drawRoundedRect(ctx, menuX - 10, menuY - 8, 300, 160, 8, 'rgba(5,0,25,0.95)', 'rgba(120,60,200,0.7)', 2);
      ctx.fillStyle = '#e0c0ff';
      ctx.font = 'bold 13px Cinzel, serif';
      ctx.textAlign = 'left';
      ctx.fillText('ABILITIES', menuX, menuY + 10);
      (member?.abilities || []).forEach((abilId, i) => {
        const def = this.game.getAbilityDef(abilId);
        const ay = menuY + 30 + i * 28;
        const sel = i === this.selectedAbility;
        if (sel) { ctx.fillStyle = 'rgba(100,40,160,0.5)'; ctx.fillRect(menuX - 5, ay - 16, 295, 24); }
        ctx.fillStyle = sel ? '#f0c060' : '#c090e0';
        ctx.font = `${sel ? 'bold' : ''} 12px Georgia, serif`;
        ctx.fillText(`${def?.name || abilId}  MP:${def?.mp_cost || 0}`, menuX, ay);
        if (sel && def) {
          ctx.fillStyle = '#9060b0';
          ctx.font = '10px Georgia';
          ctx.fillText(def.description || '', menuX, ay + 13);
        }
      });
    }

    // Sub-menu: Item list
    if (this.subMenu === 'item') {
      const inv = this.game.inventory.filter(i => i.quantity > 0);
      const menuX = W * 0.55, menuY = partyY;
      drawRoundedRect(ctx, menuX - 10, menuY - 8, 280, Math.max(80, inv.length * 28 + 40), 8, 'rgba(5,0,25,0.95)', 'rgba(120,60,200,0.7)', 2);
      ctx.fillStyle = '#e0c0ff';
      ctx.font = 'bold 13px Cinzel, serif';
      ctx.textAlign = 'left';
      ctx.fillText('ITEMS', menuX, menuY + 10);
      if (inv.length === 0) {
        ctx.fillStyle = '#806090';
        ctx.font = '12px Georgia';
        ctx.fillText('No items', menuX, menuY + 35);
      }
      inv.forEach((entry, i) => {
        const def = this.game.getItemDef(entry.id);
        const ay = menuY + 30 + i * 28;
        const sel = i === this.selectedItem;
        if (sel) { ctx.fillStyle = 'rgba(100,40,160,0.5)'; ctx.fillRect(menuX - 5, ay - 16, 275, 24); }
        ctx.fillStyle = sel ? '#f0c060' : '#c090e0';
        ctx.font = `${sel ? 'bold' : ''} 12px Georgia, serif`;
        ctx.fillText(`${def?.icon || '?'} ${def?.name || entry.id} x${entry.quantity}`, menuX, ay);
      });
    }

    // Battle log
    const logX = W * 0.02, logY = H * 0.5;
    const visibleLogs = this.battleLog.slice(-4);
    visibleLogs.forEach((log, i) => {
      const alpha = i === visibleLogs.length - 1 ? 1 : 0.6 - (visibleLogs.length - 1 - i) * 0.15;
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.5})`;
      ctx.fillRect(logX - 4, logY + i * 22 - 14, 320, 20);
      ctx.fillStyle = `rgba(220,200,255,${alpha})`;
      ctx.font = '12px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText(log.text, logX, logY + i * 22);
    });

    // Enemy turn indicator — animated pulse
    if (this.phase === 'ENEMY_TURN') {
      const pulse = 0.5 + Math.sin(this.animTimer * 8) * 0.2;
      ctx.fillStyle = `rgba(0,0,0,${pulse * 0.6})`;
      ctx.fillRect(0, H * 0.42, W, 36);
      ctx.fillStyle = '#ff8080';
      ctx.font = 'bold 18px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(255,80,80,0.5)';
      ctx.shadowBlur = 10;
      ctx.fillText('Enemy Turn...', W/2, H * 0.42 + 24);
      ctx.shadowBlur = 0;
    }

    // ── FX layer (drawn last, above everything) ──────────────
    this.renderFx(ctx);
  }

  renderVictory(ctx, canvas) {
    const W = canvas.width, H = canvas.height;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#050020');
    grad.addColorStop(1, '#0a0540');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    this.game.renderParticles(ctx);
    this.renderFx(ctx); // victory particle burst

    const boxW = 500, boxH = 360;
    const bx = (W - boxW)/2, by = (H - boxH)/2;
    drawRoundedRect(ctx, bx, by, boxW, boxH, 14, 'rgba(10,5,35,0.97)', 'rgba(200,160,255,0.8)', 2);

    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(200,150,255,0.8)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#f0d060';
    ctx.font = `bold 28px 'Cinzel', serif`;
    ctx.fillText('✦  VICTORY  ✦', W/2, by + 55);
    ctx.shadowBlur = 0;

    if (this.rewards) {
      ctx.font = '16px Georgia, serif';
      ctx.fillStyle = '#d0b0ff';
      ctx.fillText(`EXP: +${this.rewards.exp}`, W/2, by + 110);
      ctx.fillStyle = '#f0d060';
      ctx.fillText(`Gold: +${this.rewards.gold}`, W/2, by + 140);
      if (this.rewards.items.length) {
        const names = this.rewards.items.map(id => this.game.getItemDef(id)?.name || id).join(', ');
        ctx.fillStyle = '#80ffcc';
        ctx.fillText(`Item: ${names}`, W/2, by + 170);
      }

      // Level ups
      this.levelUps.forEach((lu, i) => {
        ctx.fillStyle = '#f0c060';
        ctx.font = 'bold 15px Cinzel, serif';
        ctx.fillText(`✨ ${lu.name} reached Level ${lu.level}!`, W/2, by + 210 + i * 28);
      });

      // Party state
      this.party.forEach((m, i) => {
        const px = bx + 40 + i * 150;
        const py = by + boxH - 90;
        const portrait = this.game.images[m.portrait];
        if (portrait) { ctx.drawImage(portrait, px, py, 50, 50); }
        ctx.fillStyle = m.currentHp <= 0 ? '#606060' : '#a0ff80';
        ctx.font = '11px Georgia';
        ctx.textAlign = 'left';
        ctx.fillText(`${m.name.split(' ')[0]}: ${m.currentHp}/${m.stats.hp} HP`, px, py + 65);
      });
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(180,140,255,${0.5 + this.game.titleGlow * 0.5})`;
    ctx.font = '14px Georgia, serif';
    ctx.fillText('[ Press ENTER to continue ]', W/2, by + boxH - 18);
  }

  renderDefeat(ctx, canvas) {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = 'rgba(20,0,0,0.95)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255,50,50,0.8)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#c04040';
    ctx.font = `bold 36px 'Cinzel', serif`;
    ctx.fillText('DEFEATED', W/2, H/2 - 40);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#906060';
    ctx.font = '16px Georgia, serif';
    ctx.fillText('The ward dims... but hope remains.', W/2, H/2 + 20);

    ctx.fillStyle = `rgba(180,100,100,${0.5 + this.game.titleGlow * 0.5})`;
    ctx.font = '14px Georgia, serif';
    ctx.fillText('[ Press ENTER to return ]', W/2, H/2 + 70);
  }
}

// ─── Utility Functions ───────────────────────────────────────
function drawRoundedRect(ctx, x, y, w, h, r, fill, stroke, lineWidth) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 1; ctx.stroke(); }
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  words.forEach(word => {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxW && line !== '') {
      ctx.fillText(line.trim(), x, cy);
      line = word + ' ';
      cy += lineH;
    } else {
      line = test;
    }
  });
  if (line) ctx.fillText(line.trim(), x, cy);
}

// ─── Canvas Click Handler ─────────────────────────────────────
function setupClickHandler(game, canvas) {
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
    const W = canvas.width, H = canvas.height;

    if (game.state === STATE.TITLE) {
      const menuY = [H * 0.48, H * 0.56, H * 0.64];
      menuY.forEach((my, i) => {
        if (Math.abs(cy - my) < 20) {
          game.ui.titleSelection = i;
          game.ui.confirmTitleSelection();
        }
      });
    }

    if (game.state === STATE.DIALOGUE || game.state === STATE.CUTSCENE) {
      game.dialogue?.advance();
    }

    if (game.state === STATE.BATTLE && game.battle) {
      const ph = game.battle.phase;
      if (ph === 'PLAYER_TURN' && !game.battle.subMenu) {
        // Click on action buttons
        const partyY = H * 0.68;
        const menuX = W * 0.65;
        const actions = ['attack', 'ability', 'item', 'defend'];
        actions.forEach((a, i) => {
          const ay = partyY + i * 35;
          if (cx > menuX - 10 && cx < menuX + 180 && cy > ay - 22 && cy < ay + 12) {
            game.battle.selectedAction = i;
            game.battle.confirmAction();
            game.audio.playConfirm();
          }
        });
      }

      // Click on enemies for target
      if (ph === 'PLAYER_TURN' && (game.battle.subMenu === 'target' || game.battle.subMenu === 'ability_target')) {
        const enemies = game.battle.enemies.filter(en => en.currentHp > 0);
        let acted = false;
        enemies.forEach((en, i) => {
          const ex = W * (0.3 + (i - (enemies.length-1)/2) * 0.25);
          const ey = H * 0.25;
          const es = Math.min(W * 0.28, 200);
          if (cx > ex - es/2 && cx < ex + es/2 && cy > ey - es/2 && cy < ey + es/2) {
            game.battle.selectedTarget = i;
            if (game.battle.subMenu === 'target') game.battle.executePlayerAttack();
            else game.battle.executePlayerAbility();
            acted = true;
          }
        });
        if (acted) return; // prevent same click from also dismissing the victory screen
      }
    }

    if (game.state === STATE.VICTORY && game.battle) {
      game.battle.endVictory();
    }
    if (game.state === STATE.DEFEAT && game.battle) {
      game.battle.endDefeat();
    }
    if (game.state === STATE.QUEST_COMPLETE) {
      game.state = STATE.EXPLORE;
    }

    if (game.state === STATE.EXPLORE) {
      // Touch/click to move (optional)
    }
  });
}

// ─── Bootstrap ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('game-canvas');

  function resizeCanvas() {
    const maxW = 900, maxH = 600;
    const ratio = maxW / maxH;
    let w = Math.min(window.innerWidth, maxW);
    let h = w / ratio;
    if (h > window.innerHeight) {
      h = Math.min(window.innerHeight, maxH);
      w = h * ratio;
    }
    canvas.width = maxW;
    canvas.height = maxH;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const game = window.game = new WardedOnesGame();
  setupClickHandler(game, canvas);

  // Loading screen
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#05001a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#8040ff';
  ctx.font = `bold 24px 'Cinzel', Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText('THE WARDED ONES', canvas.width/2, canvas.height/2 - 20);
  ctx.font = '14px Georgia, serif';
  ctx.fillStyle = '#6030a0';
  ctx.fillText('Loading...', canvas.width/2, canvas.height/2 + 20);

  await game.init();
});
