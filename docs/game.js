// The Warded Ones RPG 1 - Game Engine
// Fiend Studios © 2025

'use strict';

// ─── Constants ────────────────────────────────────────────────
const GAME_VERSION = '0.3.0';
const SAVE_KEY = 'warded_ones_save_v1';
const SAVE_SCHEMA_VERSION = 2;

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
  JOURNAL: 'JOURNAL',
  PROLOGUE: 'PROLOGUE',
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
    this.prologue = null;
    this.battleTransition = null;
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

    let rawSave = null;
    try { rawSave = localStorage.getItem(SAVE_KEY); }
    catch (e) { console.warn('Save storage unavailable:', e); }
    this.saveExists = !!rawSave;
    this.saveMeta = null;
    if (rawSave) {
      try {
        const sd = JSON.parse(rawSave);
        const mins = Math.floor((sd.playtime || 0) / 60);
        const d = new Date(sd.timestamp || 0);
        const dateStr = `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
        const lv = sd.party?.[0]?.level ?? 1;
        this.saveMeta = `Lv.${lv}  ${mins}m  ${dateStr}`;
      } catch(e) {}
    }
    this.state = STATE.TITLE;
    this.ui = new UI(this);
    this.explore = new ExploreManager(this);
    this.audio.playExploreMusic(); // theme plays from title screen
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
    if (this.state === STATE.PROLOGUE && this.prologue) this.prologue.update(dt);
    if (this.battleTransition) this.updateBattleTransition(dt);
  }

  // Ward-circle iris wipe into a battle. The iris closes over the explore
  // scene; at the midpoint the battle is created (state flips to BATTLE);
  // then it opens to reveal the fight. Echoes the ward-magic identity.
  startBattleTransition(enemyIds, bgKey, onWin, onLose) {
    // Called from explore (directly or after a battle-intro dialogue). Show the
    // map — not a leftover dialogue box — under the closing iris.
    this.state = STATE.EXPLORE;
    this.battleTransition = { t: 0, dur: 1.0, fired: false, args: [enemyIds, bgKey, onWin, onLose] };
  }

  updateBattleTransition(dt) {
    const tr = this.battleTransition;
    tr.t += dt;
    if (!tr.fired && tr.t >= tr.dur * 0.5) {
      tr.fired = true;
      this.startBattle(...tr.args);
      if (this.battle) this.battle.fadeIn = 0; // the iris IS the intro; skip the battle's own fade
    }
    if (tr.t >= tr.dur) this.battleTransition = null;
  }

  renderBattleTransition(ctx, canvas) {
    const tr = this.battleTransition;
    if (!tr) return;
    const W = canvas.width, H = canvas.height;
    const p = Math.min(1, tr.t / tr.dur);
    const maxR = Math.hypot(W / 2, H / 2) + 20;
    // Closed at the midpoint, open at the ends.
    const r = maxR * (p < 0.5 ? 1 - p * 2 : (p - 0.5) * 2);
    const cx = W / 2, cy = H / 2;
    // Black field with a circular hole (even-odd fill)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true); // reverse winding = hole
    ctx.fillStyle = '#04000c';
    ctx.fill('evenodd');
    // Concentric ward rings + rotating spokes at the iris edge
    const spin = p * 4;
    for (let ri = 0; ri < 3; ri++) {
      const rr = r + 8 + ri * 22;
      ctx.strokeStyle = `rgba(150,80,255,${0.5 - ri * 0.13})`;
      ctx.lineWidth = 2 - ri * 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (r > 8) {
      ctx.strokeStyle = 'rgba(180,110,255,0.5)';
      ctx.lineWidth = 1;
      const spokes = 8;
      for (let s = 0; s < spokes; s++) {
        const a = spin + (s / spokes) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.lineTo(cx + Math.cos(a) * (r + 40), cy + Math.sin(a) * (r + 40));
        ctx.stroke();
      }
    }
    ctx.restore();
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
      case STATE.JOURNAL: this.explore.render(ctx, canvas); this.ui.renderJournal(ctx, canvas); break;
      case STATE.PROLOGUE: if (this.prologue) this.prologue.render(ctx, canvas); break;
    }
    // Iris wipe draws over whatever's rendered (explore before the midpoint,
    // the battle after it).
    if (this.battleTransition) this.renderBattleTransition(ctx, canvas);
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

    // Animated ward circle — rotates behind menu items
    const t = this.animTimer;
    ctx.save();
    ctx.translate(W / 2, H * 0.55);
    const ringRadii = [70, 110, 148, 178, 202];
    ringRadii.forEach((r, ri) => {
      const rot = t * (ri % 2 === 0 ? 0.18 : -0.13) + ri * 0.9;
      const alpha = 0.07 + ri * 0.015;
      ctx.strokeStyle = `rgba(160,80,255,${alpha})`;
      ctx.lineWidth = ri === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      // Spokes
      if (ri < 4) {
        const spokeCount = 4 + ri * 2;
        ctx.strokeStyle = `rgba(160,80,255,${alpha * 0.6})`;
        ctx.lineWidth = 0.5;
        for (let s = 0; s < spokeCount; s++) {
          const angle = rot + (s / spokeCount) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
          ctx.stroke();
        }
      }
    });
    // Orbiting rune dots
    const dotDefs = [
      { orbitR: 110, count: 6, speed: 0.25, color: 'rgba(200,100,255,' },
      { orbitR: 178, count: 8, speed: -0.18, color: 'rgba(255,200,80,' },
    ];
    dotDefs.forEach(d => {
      for (let di = 0; di < d.count; di++) {
        const angle = t * d.speed + (di / d.count) * Math.PI * 2;
        const dx = Math.cos(angle) * d.orbitR;
        const dy = Math.sin(angle) * d.orbitR;
        ctx.fillStyle = d.color + '0.55)';
        ctx.beginPath();
        ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();

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
      { label: this.saveExists ? '◈  CONTINUE' : '○  CONTINUE', y: H * 0.56, action: 'continue', disabled: !this.saveExists, sub: this.saveMeta },
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
      if (item.sub) {
        ctx.font = `${Math.floor(W * 0.013)}px monospace`;
        ctx.fillStyle = selected ? 'rgba(240,192,80,0.6)' : 'rgba(160,110,200,0.5)';
        ctx.fillText(item.sub, W / 2, item.y + 18);
      }
    });

    // Party portraits row — bottom left, silhouetted and glowing
    const partyPortraits = [
      { key: 'assets/characters/motley_max.png',    name: 'Motley Max',    role: 'Trickster' },
      { key: 'assets/characters/gloam.png',         name: 'Gloam',         role: 'Shadow Mage' },
      { key: 'assets/characters/tumbling_tess.png', name: 'Tumbling Tess', role: 'Acrobat' },
    ];
    const pSize = 80;
    const pY = H * 0.70;
    partyPortraits.forEach((p, i) => {
      const px = W * 0.08 + i * (pSize + 24);
      const img = this.images[p.key];
      if (img) {
        ctx.save();
        ctx.globalAlpha = 0.55 + this.titleGlow * 0.25;
        ctx.shadowColor = 'rgba(160,80,255,0.5)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.roundRect(px, pY, pSize, pSize, 6);
        ctx.clip();
        ctx.drawImage(img, px, pY, pSize, pSize);
        ctx.restore();
        // Border glow
        ctx.strokeStyle = `rgba(160,80,255,${0.3 + this.titleGlow * 0.3})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px, pY, pSize, pSize);
      }
      ctx.fillStyle = `rgba(200,160,255,${0.6 + this.titleGlow * 0.2})`;
      ctx.font = 'bold 10px Cinzel, serif';
      ctx.textAlign = 'left';
      ctx.fillText(p.name, px, pY + pSize + 14);
      ctx.fillStyle = 'rgba(140,90,200,0.7)';
      ctx.font = '9px Georgia, serif';
      ctx.fillText(p.role, px, pY + pSize + 26);
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
    ctx.fillText('W/S or ARROWS: Navigate   |   ENTER / CLICK: Select', W / 2, H * 0.88);

    // Prologue replay hint
    ctx.font = `${Math.floor(W * 0.011)}px monospace`;
    ctx.fillStyle = 'rgba(150, 110, 200, 0.55)';
    ctx.fillText('P — replay the prologue flight', W / 2, H * 0.92);

    // Overwrite-save confirmation modal (drawn last, over everything)
    if (this.ui && this.ui.confirmDialog) this._renderConfirmDialog(ctx, W, H);
  }

  _renderConfirmDialog(ctx, W, H) {
    const cd = this.ui.confirmDialog;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, W, H);
    const boxW = 460, boxH = 210, bx = (W - boxW) / 2, by = (H - boxH) / 2;
    drawRoundedRect(ctx, bx, by, boxW, boxH, 12, 'rgba(14,6,32,0.98)', 'rgba(200,120,255,0.85)', 2);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0c060';
    ctx.font = `bold 22px 'Cinzel', serif`;
    ctx.fillText('Overwrite your save?', W / 2, by + 46);

    ctx.fillStyle = '#c8b0e8';
    ctx.font = '13px Georgia, serif';
    ctx.fillText('Starting a new game will overwrite your existing save.', W / 2, by + 78);
    if (this.game.saveMeta) {
      ctx.fillStyle = 'rgba(160,120,210,0.85)';
      ctx.font = '12px monospace';
      ctx.fillText(`Current save — ${this.game.saveMeta}`, W / 2, by + 100);
    }

    // Two option buttons — "No" is the safe default (choice 1)
    const btnW = 180, btnH = 44, gap = 24, btnY = by + 132;
    const yesX = W / 2 - btnW - gap / 2, noX = W / 2 + gap / 2;
    cd.yesRect = { x: yesX, y: btnY, w: btnW, h: btnH };
    cd.noRect = { x: noX, y: btnY, w: btnW, h: btnH };
    const drawBtn = (r, label, selected, danger) => {
      drawRoundedRect(ctx, r.x, r.y, r.w, r.h, 8,
        selected ? (danger ? 'rgba(120,30,40,0.9)' : 'rgba(40,80,50,0.9)') : 'rgba(30,18,50,0.9)',
        selected ? (danger ? '#ff8080' : '#80e0a0') : 'rgba(120,80,180,0.5)', 2);
      ctx.fillStyle = selected ? '#ffffff' : '#b0a0d0';
      ctx.font = `${selected ? 'bold ' : ''}14px 'Cinzel', serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, r.x + r.w / 2, r.y + 28);
    };
    drawBtn(cd.yesRect, 'Yes, start over', cd.choice === 0, true);
    drawBtn(cd.noRect, 'No, keep my save', cd.choice === 1, false);

    ctx.fillStyle = 'rgba(150,110,200,0.6)';
    ctx.font = '10px monospace';
    ctx.fillText('← → choose    ENTER confirm    ESC cancel', W / 2, by + boxH - 14);
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
    this.battle = null;
    this.battleTransition = null; // never carry a pending wipe into a new run
    // Recruitable characters (charDef.recruit) join later via map NPCs.
    this.party = this.data.characters.filter(c => !c.recruit)
      .map(c => this.createPartyMember(c));
    this.inventory = [
      { id: 'healing_potion', quantity: 3 },
      { id: 'ether_orb', quantity: 2 },
      { id: 'ward_shard', quantity: 2 },
    ];
    this.gold = 50;
    this.quests = JSON.parse(JSON.stringify(this.data.questDefs));
    this.playtime = 0;

    // Fresh world for a fresh run — the prologue camera renders the map live,
    // and a reused ExploreManager would leak spent chests/zones/NPC flags from
    // a previous run into the new game (and soft-lock its quests).
    // Must come after this.party is set: the constructor syncs recruit NPCs.
    this.explore = new ExploreManager(this);

    // Scroll-scrubbed prologue flight over the grounds, then the intro cutscene
    this.prologue = new ScrollFlightManager(this, () => {
      this.prologue = null;
      this.dialogue = new DialogueManager(this, 'intro', () => {
        this.state = STATE.EXPLORE;
        this.audio.playExploreMusic();
      });
      this.state = STATE.CUTSCENE;
    });
    this.state = STATE.PROLOGUE;
  }

  // Re-watch the opening flight from the title screen (P). Renders the world
  // as it currently stands — a fresh map at boot, your map after a Continue.
  startPrologueReplay() {
    this.prologue = new ScrollFlightManager(this, () => {
      this.prologue = null;
      this.state = STATE.TITLE;
    });
    this.state = STATE.PROLOGUE;
  }

  // Finale victory lap: same flight engine, past-tense copy, restored world.
  startEpilogue() {
    this.prologue = new ScrollFlightManager(this, () => {
      this.prologue = null;
      this.state = STATE.EXPLORE;
    }, ScrollFlightManager.EPILOGUE);
    this.state = STATE.PROLOGUE;
  }

  dismissQuestComplete() {
    const done = this.ui.questCompleteData?.quest;
    this.state = STATE.EXPLORE;
    // The Astral Hunt is the finale — send the player on the epilogue flight
    if (done && done.id === 'the_astral_hunt') this.startEpilogue();
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
      schemaVersion: SAVE_SCHEMA_VERSION,
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
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
      this.saveExists = true;
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      this.ui?.showNotification('Unable to save. Check browser storage permissions.');
      return false;
    }
  }

  load() {
    let raw;
    try { raw = localStorage.getItem(SAVE_KEY); }
    catch (e) { console.error('Save storage unavailable:', e); return false; }
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      this.battle = null;
      this.battleTransition = null;
      this.gold = data.gold || 0;
      this.playtime = data.playtime || 0;
      this.inventory = data.inventory || [];
      this.quests = data.quests || JSON.parse(JSON.stringify(this.data.questDefs));

      const savedParty = Array.isArray(data.party) && data.party.length ? data.party : [{ id: 'motley_max' }];
      this.party = savedParty.map(saved => {
        const def = this.data.characters.find(c => c.id === saved.id);
        if (!def) return null;
        const member = this.createPartyMember(def);
        member.level = Math.max(1, Number(saved.level) || 1);
        member.exp = Math.max(0, Number(saved.exp) || 0);
        member.expToNext = Math.max(1, Number(saved.expToNext) || 100);
        member.currentHp = Math.max(0, Math.min(member.stats.hp, Number(saved.currentHp) || member.stats.hp));
        member.currentMp = Math.max(0, Math.min(member.stats.mp, Number(saved.currentMp) || member.stats.mp));
        return member;
      }).filter(Boolean);

      this.explore = new ExploreManager(this);
      this.explore.init(data.exploreState);
      this.state = STATE.EXPLORE;
      this.audio.playExploreMusic();
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
    // Snapshot for the defeat-screen Retry option: same encounter, and the
    // party restored to exactly what they walked in with.
    this._retryBattle = {
      enemyIds: [...enemyIds], bgKey, onWin, onLose,
      partySnapshot: this.party.map(m => ({ id: m.id, hp: m.currentHp, mp: m.currentMp })),
    };
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
    this.audio.playBattleMusic(enemies.some(e => e.boss));
  }

  /** Defeat-screen Retry: restore the pre-battle party and re-run the fight. */
  retryLastBattle() {
    const r = this._retryBattle;
    if (!r) { this.battle?.endDefeat(); return; }
    r.partySnapshot.forEach(s => {
      const m = this.party.find(p => p.id === s.id);
      if (m) { m.currentHp = s.hp; m.currentMp = s.mp; }
    });
    this.battle = null;
    this.startBattle(r.enemyIds, r.bgKey, r.onWin, r.onLose);
  }

  // ─── Quest helpers ────────────────────────────────────────
  advanceQuest(questId, stageId) {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return;
    const stage = quest.stages.find(s => s.id === stageId);
    if (stage) { stage.complete = true; this.save(); } // auto-save on stage completion
  }

  incrementQuestCount(questId, stageId) {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return;
    const stage = quest.stages.find(s => s.id === stageId);
    if (!stage) return;
    stage.current = (stage.current || 0) + 1;
    if (stage.current >= stage.count) { stage.complete = true; this.save(); } // auto-save on stage completion
    // Update the "(n/m)" counter inside the stage's own objective text.
    stage.objective = stage.objective.replace(
      /\(\d+\/\d+\)/, `(${Math.min(stage.current, stage.count)}/${stage.count})`);
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
    const levelUps = [];
    this.party.forEach(m => {
      const ups = this.grantExp(m, rewards.exp || 0);
      if (ups.length) {
        const gains = {};
        ups.forEach(u => Object.keys(u.gains).forEach(k => { gains[k] = (gains[k] || 0) + u.gains[k]; }));
        levelUps.push({ name: m.name, level: m.level, levels: ups.length, gains });
      }
    });
    rewards.items?.forEach(itemId => {
      this.addItem(itemId);
    });
    // Chain: unlock the follow-up quest, if this one names it.
    if (quest.unlocks) {
      const next = this.quests.find(q => q.id === quest.unlocks);
      if (next && next.locked) {
        next.locked = false;
        this.ui.showNotification(`New quest: ${next.title || next.id}!`);
      }
    }
    this.ui.questCompleteData = { quest, rewards, levelUps };
    this.state = STATE.QUEST_COMPLETE;
    this.save();
  }

  /** The quest whose objective the HUD tracks: first unlocked, incomplete. */
  activeQuestId() {
    const q = this.quests.find(q => !q.locked && !q.complete);
    return q ? q.id : (this.quests[0] ? this.quests[0].id : '');
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
  // Returns an array of per-level results (with stat gains) for fanfare.
  grantExp(member, amount) {
    member.exp += amount;
    const ups = [];
    while (member.exp >= member.expToNext) {
      member.exp -= member.expToNext;
      ups.push(this.levelUp(member));
    }
    return ups;
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
    this.audio.playLevelUp();
    return { level: member.level, name: member.name, gains: { ...g } };
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
    // Snapshot the state for this keypress: the blocks below transition
    // g.state, and without this a single press could fall through into the
    // next state's handler (e.g. Escape: EXPLORE -> PAUSE -> instantly back).
    const s0 = g.state;

    if (s0 === STATE.TITLE) {
      if (ui.confirmDialog) {
        // Overwrite-save confirmation owns the keys while open
        if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ArrowRight' || e.code === 'KeyD') {
          ui.confirmDialog.choice = ui.confirmDialog.choice === 0 ? 1 : 0;
          g.audio.playCursor();
        }
        if (e.code === 'Enter' || e.code === 'Space') { ui.resolveConfirmDialog(ui.confirmDialog.choice === 0); }
        if (e.code === 'Escape' || e.code === 'KeyX') { ui.resolveConfirmDialog(false); }
        return;
      }
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { ui.titleSelection = Math.max(0, ui.titleSelection - 1); }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { ui.titleSelection = Math.min(2, ui.titleSelection + 1); }
      if (e.code === 'Enter' || e.code === 'Space') { ui.confirmTitleSelection(); }
      if (e.code === 'KeyP' && !e.repeat) { g.startPrologueReplay(); g.audio.playConfirm(); }
    }

    if (s0 === STATE.DIALOGUE || s0 === STATE.CUTSCENE) {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') {
        g.dialogue?.advance();
      }
    }

    if (s0 === STATE.PROLOGUE && g.prologue && !e.repeat) {
      // !e.repeat: a held Enter from the title confirm must not auto-blow
      // through the one-time cinematic (W/S scrubbing polls isDown instead)
      if (e.code === 'Escape' || e.code === 'KeyX') { g.prologue.skip(); }
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyF' || e.code === 'KeyZ') {
        if (g.prologue.atEnd()) g.prologue.begin();
        else g.prologue.advanceSection();
      }
    }

    if (s0 === STATE.EXPLORE) {
      if (e.code === 'Escape') { g.prevState = STATE.EXPLORE; g.state = STATE.PAUSE; }
      if (e.code === 'KeyF' || e.code === 'Enter') { g.explore.interact(); }
      if (e.code === 'KeyJ') { g.state = STATE.JOURNAL; g.audio.playConfirm(); }
    }

    if (s0 === STATE.JOURNAL) {
      if (e.code === 'Escape' || e.code === 'KeyJ' || e.code === 'Enter' || e.code === 'Space') {
        g.state = STATE.EXPLORE;
        g.audio.playCancel();
      }
    }

    if (s0 === STATE.PAUSE) {
      const audio = g.audio;
      // Items: 0=Resume, 1=Save, 2=MainMenu; 3=MusicVol, 4=SfxVol
      if (e.code === 'Escape') { g.state = STATE.EXPLORE; }
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        ui.pauseSelection = (ui.pauseSelection - 1 + 5) % 5;
      }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        ui.pauseSelection = (ui.pauseSelection + 1) % 5;
      }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        if (ui.pauseSelection === 3) { audio.musicVol = Math.max(0, audio.musicVol - 0.1); if (audio._audioEl) audio._audioEl.volume = audio.musicVol * audio.masterVol; }
        if (ui.pauseSelection === 4) audio.sfxVol = Math.max(0, audio.sfxVol - 0.1);
        if (ui.pauseSelection >= 3) audio.saveSettings();
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        if (ui.pauseSelection === 3) { audio.musicVol = Math.min(1, audio.musicVol + 0.1); if (audio._audioEl) audio._audioEl.volume = audio.musicVol * audio.masterVol; }
        if (ui.pauseSelection === 4) audio.sfxVol = Math.min(1, audio.sfxVol + 0.1);
        if (ui.pauseSelection >= 3) audio.saveSettings();
      }
      if (e.code === 'Enter' || e.code === 'KeyZ' || e.code === 'KeyF') {
        if (ui.pauseSelection === 0) { g.state = STATE.EXPLORE; }
        if (ui.pauseSelection === 1) {
          if (g.save()) ui.showNotification('Game saved!');
          g.state = STATE.EXPLORE;
        }
        if (ui.pauseSelection === 2) { g.state = STATE.TITLE; g.audio.playExploreMusic(); }
      }
    }

    if (s0 === STATE.BATTLE && g.battle) {
      g.battle.onKey(e.code);
    }

    if (s0 === STATE.VICTORY) {
      if (e.code === 'Enter' || e.code === 'Space') { g.battle?.endVictory(); }
    }

    if (s0 === STATE.DEFEAT) {
      if (e.code === 'Enter' || e.code === 'Space') { g.retryLastBattle(); }
      if (e.code === 'Escape' || e.code === 'KeyX') { g.battle?.endDefeat(); }
    }

    if (s0 === STATE.QUEST_COMPLETE) {
      if (e.code === 'Enter' || e.code === 'Space') { g.dismissQuestComplete(); }
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
    this.loadSettings();
  }

  initContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  // ── Settings persistence (survives reloads, separate from save slots) ──
  loadSettings() {
    try {
      const raw = localStorage.getItem('warded_ones_settings_v1');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.musicVol === 'number') this.musicVol = Math.max(0, Math.min(1, s.musicVol));
      if (typeof s.sfxVol === 'number') this.sfxVol = Math.max(0, Math.min(1, s.sfxVol));
    } catch (e) {}
  }

  saveSettings() {
    try {
      localStorage.setItem('warded_ones_settings_v1',
        JSON.stringify({ musicVol: this.musicVol, sfxVol: this.sfxVol }));
    } catch (e) {}
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
  playLevelUp() {
    const melody = [440, 554, 659, 880, 1109, 1319];
    melody.forEach((f, i) => setTimeout(() => this.playTone(f, 0.15, 'sine', 0.3), i * 60));
  }
  playDefeat() {
    [440, 392, 330, 277].forEach((f, i) => setTimeout(() => this.playTone(f, 0.4, 'sawtooth', 0.2), i * 200));
  }
  playCursor() { this.playTone(440, 0.05, 'sine', 0.15); }
  playDialogue() { this.playTone(880, 0.04, 'sine', 0.1); }

  // ── Music ────────────────────────────────────────────────────
  stopMusic() {
    // Stop HTML audio track
    if (this._audioEl) {
      this._audioEl.pause();
      this._audioEl.currentTime = 0;
      this._audioEl = null;
    }
    // Stop procedural oscillator nodes
    if (this._musicNodes) {
      this._musicNodes.forEach(n => { try { n.stop(); } catch(e) {} });
    }
    this._musicNodes = [];
    this._musicTrack = null;
    if (this._beatTimeout) { clearTimeout(this._beatTimeout); this._beatTimeout = null; }
    if (this._melodyTimeout) { clearTimeout(this._melodyTimeout); this._melodyTimeout = null; }
  }

  _makeDrone(freq, type, vol, detune = 0) {
    // Returns a running oscillator+gain node pair — caller stores for cleanup
    this.initContext();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filt = this.ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    filt.type = 'lowpass';
    filt.frequency.value = 800;
    osc.connect(filt);
    filt.connect(gain);
    gain.connect(this.ctx.destination);
    gain.gain.value = vol * this.musicVol * this.masterVol;
    osc.start();
    return [osc, gain, filt];
  }

  playExploreMusic() {
    if (this._musicTrack === 'explore') return;
    this.stopMusic();
    this._musicTrack = 'explore';
    try {
      const audio = new Audio('assets/the_warded_ones.mp3');
      audio.loop = true;
      audio.volume = this.musicVol * this.masterVol;
      audio.play().catch(() => {});
      this._audioEl = audio;
    } catch(e) {}
  }

  playBattleMusic(isBoss = false) {
    const track = isBoss ? 'boss' : 'battle';
    if (this._musicTrack === track) return;
    this.stopMusic();
    this._musicTrack = track;
    try {
      this.initContext();
      this._musicNodes = [];

      // Boss: lower, denser, phrygian (menacing). Normal: E-minor drive.
      const cfg = isBoss ? {
        bass: [36.7, 'sawtooth', 0.10, 0], mid: [73.4, 'sawtooth', 0.05, 7],
        beat: [1,0,1,1, 0,1,0,1, 1,0,1,1, 0,1,1,0], beatMs: 110,
        accentHi: 92.5, accentLo: 61.7, beatGain: 0.20,
        melody: [329.6, 349.2, 392.0, 493.9, 523.3, 493.9], melType: 'sawtooth', melGain: 0.07,
      } : {
        bass: [41.2, 'sawtooth', 0.09, 0], mid: [82.4, 'square', 0.04, 5],
        beat: [1,0,0,1, 0,1,0,0, 1,0,0,1, 0,1,0,0], beatMs: 125,
        accentHi: 82.4, accentLo: 61.7, beatGain: 0.18,
        melody: [329.6, 392.0, 493.9, 659.3, 493.9, 392.0], melType: 'square', melGain: 0.055,
      };

      this._musicNodes.push(...this._makeDrone(...cfg.bass));
      this._musicNodes.push(...this._makeDrone(...cfg.mid));

      const beatPattern = cfg.beat;
      let beatIdx = 0;
      const doBeat = () => {
        if (this._musicTrack !== track) return;
        try {
          if (beatPattern[beatIdx % beatPattern.length]) {
            this.initContext();
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = beatIdx % 8 === 0 ? cfg.accentHi : cfg.accentLo;
            osc.connect(g);
            g.connect(this.ctx.destination);
            const now = this.ctx.currentTime;
            g.gain.setValueAtTime(cfg.beatGain * this.musicVol * this.masterVol, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
            osc.start(now);
            osc.stop(now + 0.12);
          }
        } catch(e) {}
        beatIdx++;
        this._beatTimeout = setTimeout(doBeat, cfg.beatMs);
      };
      doBeat();

      const battleMelody = cfg.melody;
      let mIdx = 0;
      const doMelody = () => {
        if (this._musicTrack !== track) return;
        try {
          this.initContext();
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = cfg.melType;
          osc.frequency.value = battleMelody[mIdx % battleMelody.length];
          osc.connect(g);
          g.connect(this.ctx.destination);
          const now = this.ctx.currentTime;
          g.gain.setValueAtTime(cfg.melGain * this.musicVol * this.masterVol, now);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
          osc.start(now);
          osc.stop(now + 0.3);
        } catch(e) {}
        mIdx++;
        this._melodyTimeout = setTimeout(doMelody, 250 + (mIdx % 4 === 0 ? 500 : 0));
      };
      setTimeout(doMelody, 500);
    } catch(e) {}
  }
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
    this.pauseItems = ['Resume', 'Save Game', 'Main Menu', 'Music Vol', 'SFX Vol'];
    // { choice: 0=Yes / 1=No, yesRects/noRects populated on render }
    this.confirmDialog = null;
  }

  confirmTitleSelection() {
    const g = this.game;
    if (this.titleSelection === 0) {
      // New Game over an existing save is destructive — the first auto-save
      // would overwrite it. Confirm first (default to the safe "No").
      if (g.saveExists) {
        g.audio.playConfirm();
        this.confirmDialog = { choice: 1, yesRect: null, noRect: null };
        return;
      }
      g.audio.playConfirm();
      g.startNewGame();
    }
    else if (this.titleSelection === 1 && g.saveExists) {
      g.audio.playConfirm();
      if (!g.load()) { this.showNotification('Load failed!'); }
    } else if (this.titleSelection === 2) {
      g.audio.playConfirm();
      this.showNotification('Settings — coming soon!');
    }
  }

  // Resolve the New Game overwrite confirmation. choice 0 = start over.
  resolveConfirmDialog(accept) {
    const g = this.game;
    this.confirmDialog = null;
    if (accept) { g.audio.playConfirm(); g.startNewGame(); }
    else { g.audio.playCancel(); }
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

    const boxW = 340, boxH = 400;
    const bx = (W - boxW) / 2, by = (H - boxH) / 2;
    drawRoundedRect(ctx, bx, by, boxW, boxH, 12, 'rgba(10,5,30,0.95)', 'rgba(150,80,255,0.8)', 2);

    ctx.fillStyle = '#e0c0ff';
    ctx.font = `bold 22px 'Cinzel', serif`;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, by + 46);

    // Menu items (skip Settings — replaced by inline sliders)
    const items = ['Resume', 'Save Game', 'Main Menu'];
    items.forEach((label, i) => {
      const y = by + 92 + i * 46;
      const selected = this.pauseSelection === i;
      if (selected) {
        ctx.fillStyle = 'rgba(100,40,160,0.6)';
        ctx.fillRect(bx + 20, y - 24, boxW - 40, 36);
      }
      ctx.fillStyle = selected ? '#f0c060' : '#c090e0';
      ctx.font = `${selected ? 'bold' : ''} 16px 'Cinzel', serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, W / 2, y);
    });

    // ── Volume sliders ─────────────────────────────
    const audio = this.game.audio;
    const sliderY = by + 240, sliderX = bx + 30, sliderW = boxW - 60;

    const drawSlider = (label, value, y) => {
      ctx.fillStyle = '#a080c0';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, sliderX, y - 2);
      ctx.fillStyle = '#201030';
      ctx.fillRect(sliderX, y + 4, sliderW, 8);
      ctx.fillStyle = '#8050d0';
      ctx.fillRect(sliderX, y + 4, sliderW * value, 8);
      ctx.fillStyle = '#d0a0ff';
      ctx.beginPath();
      ctx.arc(sliderX + sliderW * value, y + 8, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c0a0e0';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(value * 100) + '%', bx + boxW - 20, y - 2);
    };

    ctx.strokeStyle = 'rgba(100,60,160,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx + 20, by + 228); ctx.lineTo(bx + boxW - 20, by + 228); ctx.stroke();
    ctx.fillStyle = '#8060a0';
    ctx.font = 'bold 11px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.fillText('VOLUME', W / 2, by + 242);

    drawSlider('Music', audio.musicVol, sliderY + 12);
    drawSlider('SFX  ', audio.sfxVol,   sliderY + 52);

    ctx.fillStyle = '#807090';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('W/S: Navigate  |  A/D: Adjust Vol  |  ESC / ENTER: Confirm / Resume', W / 2, by + boxH - 30);

    const g = this.game;
    const objective = g.getQuestObjective(g.activeQuestId());
    ctx.font = '12px Georgia, serif';
    ctx.fillStyle = 'rgba(150,100,200,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText(`⬡ ${objective}`, W / 2, by + boxH - 12);
  }

  renderJournal(ctx, canvas) {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, H);

    const boxW = 440, boxH = 340;
    const bx = (W - boxW) / 2, by = (H - boxH) / 2;
    drawRoundedRect(ctx, bx, by, boxW, boxH, 12, 'rgba(12, 6, 28, 0.95)', 'rgba(0, 240, 255, 0.5)', 2);

    ctx.fillStyle = '#e0c0ff';
    ctx.font = `bold 22px 'Cinzel', serif`;
    ctx.textAlign = 'center';
    ctx.fillText('QUEST JOURNAL', W / 2, by + 46);

    // Locked quests stay hidden until their predecessor unlocks them.
    const quests = (this.game.quests || []).filter(q => !q.locked);
    ctx.textAlign = 'left';

    if (quests.length === 0) {
      ctx.fillStyle = '#807090';
      ctx.font = "14px Georgia";
      ctx.fillText("No active quests.", bx + 40, by + 100);
    } else {
      quests.forEach((q, idx) => {
        const qy = by + 90 + idx * 80;
        const title = q.title || q.id;
        
        ctx.fillStyle = q.complete ? '#80ffcc' : '#f5e01d';
        ctx.font = "bold 14px Cinzel, serif";
        ctx.fillText(`${q.complete ? '✓' : '⬡'} ${title}`, bx + 40, qy);
        
        const activeStage = q.stages.find(s => !s.complete);
        const objective = activeStage ? activeStage.objective : 'Quest Complete!';
        
        ctx.fillStyle = '#b0a0c0';
        ctx.font = "12px Georgia";
        ctx.fillText(objective, bx + 56, qy + 22);

        const completedCount = q.stages.filter(s => s.complete).length;
        const totalCount = q.stages.length;
        ctx.fillStyle = '#605080';
        ctx.font = "10px monospace";
        ctx.fillText(`Stage Progress: ${completedCount}/${totalCount}`, bx + 56, qy + 40);
      });
    }

    ctx.fillStyle = '#807090';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Press J or ESC to close journal', W / 2, by + boxH - 20);
  }

  renderQuestComplete(ctx, canvas) {
    const W = canvas.width, H = canvas.height;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#060020');
    grad.addColorStop(1, '#0a0530');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    this.game.renderParticles(ctx);

    const luN = this.questCompleteData?.levelUps?.length || 0;
    const boxW = 560, boxH = 400 + (luN ? luN * 20 + 10 : 0);
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

      // Level-ups from the quest EXP (previously silent)
      if (data.levelUps && data.levelUps.length) {
        let ly = by + 315;
        ctx.font = 'bold 13px Cinzel, serif';
        data.levelUps.forEach(lu => {
          ctx.fillStyle = '#f0c060';
          const txt = lu.levels > 1 ? `✨ ${lu.name} → Level ${lu.level} (+${lu.levels})` : `✨ ${lu.name} → Level ${lu.level}`;
          ctx.fillText(txt, W / 2, ly);
          ly += 20;
        });
      }
    }

    ctx.font = '14px Georgia, serif';
    ctx.fillStyle = `rgba(180,140,255,${0.5 + this.game.titleGlow * 0.5})`;
    ctx.fillText('[ Press ENTER to continue ]', W / 2, by + boxH - 25);
  }

  renderHUD(ctx, canvas) {
    if (!this.game.party.length) return;
    const W = canvas.width;

    // Quest progress panel
    const quest = this.game.quests?.find(q => q.id === 'trial_of_wards');
    const stage = quest?.stages?.find(s => !s.complete);
    const obj = stage ? stage.objective : '✦ Quest Complete!';
    const doneCount = quest?.stages?.filter(s => s.complete).length ?? 0;
    const totalCount = quest?.stages?.length ?? 0;
    const panelW = Math.min(Math.max(obj.length * 7 + 60, 220), 420);
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(8, 8, panelW, 38);
    ctx.strokeStyle = 'rgba(120,60,200,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, panelW, 38);
    ctx.font = 'bold 10px Cinzel, serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(150,80,255,0.9)';
    ctx.fillText(`JESTER'S TRIAL  ${doneCount}/${totalCount}`, 16, 21);
    ctx.font = '11px Georgia, serif';
    ctx.fillStyle = '#d0b0ff';
    ctx.fillText('⬡ ' + obj, 16, 37);

    // Notification
    if (this.notification && this.notifTimer > 0) {
      this.notifTimer -= 0.016;
      const alpha = Math.min(1, this.notifTimer);
      const slideY = this.notifTimer > 2.5 ? (3 - this.notifTimer) * 40 : // slide in
                     this.notifTimer < 0.5 ? (0.5 - this.notifTimer) * -80 : 0; // slide out
      const isQuest = this.notification.startsWith('✦') || this.notification.includes('Quest') || this.notification.includes('Guardian');
      const nW = Math.min(this.notification.length * 9 + 60, 480);
      const nx = W/2 - nW/2, ny = canvas.height * 0.06 + slideY;
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.8})`;
      ctx.fillRect(nx, ny, nW, 42);
      ctx.strokeStyle = isQuest ? `rgba(240,200,80,${alpha * 0.8})` : `rgba(160,100,255,${alpha * 0.6})`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(nx, ny, nW, 42);
      if (isQuest) {
        ctx.fillStyle = `rgba(240,200,80,${alpha * 0.15})`;
        ctx.fillRect(nx, ny, nW, 42);
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = isQuest ? `rgba(255,220,80,${alpha})` : `rgba(200,180,255,${alpha})`;
      ctx.font = `bold 14px ${isQuest ? 'Cinzel,' : ''} Georgia, serif`;
      ctx.fillText(this.notification, W/2, ny + 26);
    }

    // Gold + playtime — top right chip
    const g2 = this.game;
    const goldStr = `⬡ ${g2.gold} G`;
    const timeStr = (() => { const m = Math.floor((g2.playtime||0)/60); const s = Math.floor((g2.playtime||0)%60); return `${m}:${String(s).padStart(2,'0')}`; })();
    const chipW = 130;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(W - chipW - 8, 8, chipW, 38);
    ctx.strokeStyle = 'rgba(200,160,60,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(W - chipW - 8, 8, chipW, 38);
    ctx.fillStyle = '#f0d060';
    ctx.font = 'bold 13px Georgia, serif';
    ctx.textAlign = 'right';
    ctx.fillText(goldStr, W - 14, 24);
    ctx.fillStyle = 'rgba(160,120,200,0.7)';
    ctx.font = '10px monospace';
    ctx.fillText(timeStr, W - 14, 40);

    // Party status panel — bottom left
    const party = this.game.party;
    if (party && party.length) {
      const cardW = 158, cardH = 34, cardGap = 4;
      const panelH = party.length * cardH + (party.length - 1) * cardGap;
      const startY = canvas.height - 28 - panelH;
      party.forEach((m, i) => {
        const cx = 8, cy = startY + i * (cardH + cardGap);
        const hpRatio = Math.max(0, Math.min(1, m.currentHp / m.maxHp));
        const mpRatio = Math.max(0, Math.min(1, m.currentMp / m.maxMp));
        const isKO = m.currentHp <= 0;
        ctx.fillStyle = isKO ? 'rgba(40,0,0,0.7)' : 'rgba(0,0,0,0.62)';
        ctx.fillRect(cx, cy, cardW, cardH);
        ctx.strokeStyle = isKO ? 'rgba(180,30,30,0.5)' : 'rgba(100,60,180,0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, cardW, cardH);
        // Name + level
        ctx.fillStyle = isKO ? 'rgba(180,60,60,0.9)' : '#c8a8ff';
        ctx.font = 'bold 10px Cinzel, serif';
        ctx.textAlign = 'left';
        ctx.fillText(m.name, cx + 6, cy + 12);
        ctx.fillStyle = isKO ? 'rgba(180,60,60,0.7)' : 'rgba(180,140,255,0.6)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(isKO ? 'KO' : `Lv.${m.level}`, cx + cardW - 5, cy + 12);
        // HP bar track + fill
        const barX = cx + 6, barY = cy + 17, barW = cardW - 12;
        ctx.fillStyle = 'rgba(60,20,20,0.8)';
        ctx.fillRect(barX, barY, barW, 6);
        const hpColor = hpRatio > 0.5 ? '#40c060' : hpRatio > 0.25 ? '#c0a020' : '#c03030';
        ctx.fillStyle = hpColor;
        ctx.fillRect(barX, barY, barW * hpRatio, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(barX, barY, barW * hpRatio, 2);
        // HP text
        ctx.fillStyle = 'rgba(220,220,220,0.7)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`HP ${m.currentHp}/${m.maxHp}`, barX, cy + 32);
        // MP bar track + fill
        ctx.fillStyle = 'rgba(20,20,60,0.8)';
        ctx.fillRect(barX + 60, barY, barW - 60, 6);
        ctx.fillStyle = '#4080c0';
        ctx.fillRect(barX + 60, barY, (barW - 60) * mpRatio, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(barX + 60, barY, (barW - 60) * mpRatio, 2);
        // MP text
        ctx.fillStyle = 'rgba(140,180,240,0.7)';
        ctx.textAlign = 'right';
        ctx.fillText(`MP ${m.currentMp}/${m.maxMp}`, cx + cardW - 5, cy + 32);
      });
    }

    // Controls hint
    ctx.textAlign = 'center';
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(150,100,200,0.5)';
    ctx.fillText('WASD/Arrows: Move   F/Enter: Interact   J: Journal   Esc: Pause', W/2, canvas.height - 8);
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

// ─── Scroll-Flight Cinematics ────────────────────────────────
// A scroll-scrubbed camera flight over the live-rendered Warded Grounds:
// scrolling (mouse wheel / touch drag / W-S keys) drives a continuous camera
// through story-beat sections, each with pinned copy, a route rail, and a
// progress bar. Used for the new-game prologue (default config), the finale
// epilogue (EPILOGUE config), and the title-screen prologue replay.
//
// Camera architecture B ("dive + aerial connector") from the scroll-world
// SKILL, which prescribes it for miniature / diorama / god's-eye worlds —
// exactly what the top-down Grounds are. The flight is an interleaved chain
// of segments: each section owns a DIVE that descends onto its subject and
// holds there while its copy peaks, and consecutive sections are joined by a
// CONNECTOR that pulls up to a god's-eye overview, glides across the map, and
// descends into the next subject. (Architecture A — one continuous glide —
// would peak each section's copy in mid-air between its subjects.)
//
// Seams are frame-identical: a connector's endpoints are the *same objects*
// as its neighbouring dives' poses, and per-segment easing zeroes camera
// velocity at every seam, so the direction reversal inherent to B reads as an
// intentional "zoom out to the map, fly to the next island" rather than a
// rewind stutter.
//
// Scrub pacing math — smoothstep, the lingerEase monotone time-remap, the
// 0.18 chase lerp, the per-section copy opacity curves, the near-section
// rule, and the prefers-reduced-motion fallback — adapted from the
// scroll-world scrub engine: https://github.com/oso95/scroll-world (MIT).
class ScrollFlightManager {
  constructor(game, onComplete, opts = {}) {
    this.game = game;
    this.onComplete = onComplete;

    // A section is a PLACE: `cam` is the arrived pose (close on the subject),
    // `from` the pose its dive descends from (defaults to higher + pulled back).
    // Copy the section objects — configs are shared; segment offsets are ours.
    this.sections = (opts.sections || [
      { label: 'The Grounds',   eyebrow: 'THE WARDED ONES',  title: 'The Warded Grounds',
        body: 'For an age the wards have held — quiet stone and patient starlight. Tonight, they tremble.',
        accent: '#a06cff', cam: { x: 450, y: 302, z: 1.02 },
        from: { x: 450, y: 300, z: 0.72 },   // opens on the whole grounds
        scroll: 1.1, linger: 0.3 },
      { label: 'The Wards',     eyebrow: 'CIRCLES OF POWER', title: 'The circle weakens.',
        body: 'Five rings bound in ancient pact keep the chaos beyond the walls. When they falter, the beasts feel it first.',
        accent: '#7fd4ff', cam: { x: 450, y: 328, z: 1.42 }, linger: 0.4 },
      { label: 'The Guardians', eyebrow: 'ONCE PROTECTORS',  title: 'Guardians turned feral.',
        body: 'The great cats sworn to guard these grounds now stalk the fissures they were meant to seal.',
        accent: '#ff8a5c', cam: { x: 430, y: 426, z: 1.52 }, linger: 0.45 },
      { label: 'The Ward Stone', eyebrow: 'THE LAST ANCHOR', title: 'One stone holds the balance.',
        body: 'Claim it, and the wards are restored. Fail, and the grounds fall to the chaos below.',
        accent: '#ffd166', cam: { x: 720, y: 158, z: 1.58 }, linger: 0.45 },
      { label: 'The Elder',     eyebrow: 'YOUR TRIAL BEGINS', title: 'The Elder awaits a Jester.',
        body: 'Chaos answers chaos. A trickster\'s wit may mend what solemn magic cannot.',
        accent: '#c9a0ff', cam: { x: 148, y: 176, z: 1.78 }, scroll: 1.25, linger: 0.5 },
    ]).map(s => ({ ...s }));
    this.endCta = opts.endCta || 'BEGIN THE TRIAL';

    const DIVE_W = opts.diveScroll || 1.0;   // scroll-units per dive
    const CONN_W = opts.connScroll || 0.85;  // ...per connector
    // How far the connector pulls up mid-flight. 0.45 → the camera rises to
    // ~55% zoom at the apex: the whole diorama in frame, then it descends.
    const CONN_ARC = opts.connArc != null ? opts.connArc : 0.45;

    // Resolve each section's dive-start pose ONCE, so the connector that ends
    // there and the dive that starts there share the identical object — the
    // frame-identical seam rule, in camera terms.
    this.sections.forEach(s => { s._from = s.from || ScrollFlightManager.approach(s.cam); });

    // Interleaved chain: dive0, conn0, dive1, conn1, … diveN-1
    this.segments = [];
    this.sections.forEach((s, i) => {
      const dive = { kind: 'dive', si: i, w: s.scroll || DIVE_W, linger: s.linger || 0,
                     from: s._from, to: s.cam, arc: 0 };
      this.segments.push(dive);
      s._seg = dive;   // the copy for section i is pinned to its dive
      const next = this.sections[i + 1];
      if (next) {
        this.segments.push({ kind: 'conn', si: i, w: CONN_W, linger: 0, arc: CONN_ARC,
                             from: s.cam, to: next._from });
      }
    });
    let off = 0;
    this.segments.forEach(sg => { sg.start = off; off += sg.w; sg.end = off; });
    this.totalW = off;

    this.scrollTarget = 0;
    this.scrollCur = 0;
    this.fadeIn = 1.0;
    this.fadeOut = 0;
    this.finishing = false;
    this.done = false;
    this.lastActive = -1;
    this._blipCd = 0;
    this.dotRects = [];   // route-rail hit areas, rebuilt each render
    this.skipRect = null; // skip-button hit area
    // Coarse-pointer check (not maxTouchPoints): a touchscreen laptop driven
    // by mouse+keyboard should still see the wheel/ESC affordances.
    this.isTouch = !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
    // prefers-reduced-motion: the camera snaps between poses instead of
    // gliding (scroll-world's reduce path: chase factor 1, no drift).
    this.reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // A dive's default start: pulled up (zoomed out) and slightly back, so the
  // segment reads as a descent onto the subject.
  static approach(cam) { return { x: cam.x, y: cam.y - 24, z: cam.z * 0.7 }; }

  // Finale config: a victory lap over the restored grounds — the live render
  // already shows the claimed Ward Stone, calm Star Sigil, and opened caches.
  static get EPILOGUE() {
    return {
      endCta: 'RETURN TO THE GROUNDS',
      sections: [
        { label: 'The Wards',     eyebrow: 'THE TRIAL IS OVER',   title: 'The wards hold.',
          body: 'The circle burns whole again — five rings, unbroken, singing beneath the stone.',
          accent: '#ffd166', cam: { x: 450, y: 328, z: 1.38 },
          from: { x: 450, y: 300, z: 0.78 },   // opens on the whole restored grounds
          scroll: 1.1, linger: 0.35 },
        { label: 'The Guardians', eyebrow: 'PEACE IN THE GROUNDS', title: 'The guardians rest.',
          body: 'The fissures lie quiet. The great cats keep their watch once more — protectors, not prey.',
          accent: '#7fd4ff', cam: { x: 430, y: 426, z: 1.48 }, linger: 0.45 },
        { label: 'The Sigil',     eyebrow: 'THE HUNT IS ENDED',   title: 'The stars stand down.',
          body: 'What walked out of the constellations walks there no longer. The sigil glows soft and calm.',
          accent: '#8ef0c0', cam: { x: 455, y: 118, z: 1.52 }, linger: 0.45 },
        { label: 'The Company',   eyebrow: 'WARD-KEEPERS ALL',    title: 'Six Jesters, one legend.',
          body: 'Where one answered the call, a full company now stands. The Elder bows to you.',
          accent: '#c9a0ff', cam: { x: 148, y: 176, z: 1.66 }, scroll: 1.25, linger: 0.5 },
      ],
    };
  }

  // ── pacing math ported from scroll-world (MIT) ──
  static clamp(x, a = 0, b = 1) { return Math.min(b, Math.max(a, x)); }
  static smooth(x) { x = ScrollFlightManager.clamp(x); return x * x * (3 - 2 * x); }
  // Monotone remap of scroll→time: the camera settles mid-scene (where the
  // copy peaks) and moves quicker near the seams. f(0)=0, f(1)=1 always.
  static lingerEase(x, L) { L = ScrollFlightManager.clamp(L); const c = x - 0.5; return (1 - L) * x + L * (4 * c * c * c + 0.5); }

  onWheel(deltaY) { this.scrollTarget = ScrollFlightManager.clamp(this.scrollTarget + deltaY / 700, 0, this.totalW); }
  onDrag(deltaY)  { this.scrollTarget = ScrollFlightManager.clamp(this.scrollTarget + deltaY / 350, 0, this.totalW); }

  segmentAt(u) {
    let i = 0;
    for (let k = 0; k < this.segments.length; k++) if (u >= this.segments[k].start) i = k;
    return i;
  }

  // Which section the rail/accent should read as current: a dive belongs to
  // its own section; a connector hands over at its midpoint (scroll-world's
  // `near` rule).
  sectionAt(u) {
    const sg = this.segments[this.segmentAt(u)];
    if (sg.kind === 'dive') return sg.si;
    const local = (u - sg.start) / (sg.end - sg.start);
    return ScrollFlightManager.clamp(local > 0.5 ? sg.si + 1 : sg.si, 0, this.sections.length - 1);
  }

  jumpTo(i) {
    const seg = this.sections[i]._seg;   // settle inside the section's dive
    this.scrollTarget = seg.start + (seg.end - seg.start) * 0.5;
    this.lastActive = i; // pre-claim the section so the boundary watcher doesn't double-blip
    this.game.audio.playCursor();
  }

  advanceSection() {
    const si = this.sectionAt(this.scrollTarget);
    if (si >= this.sections.length - 1) { this.scrollTarget = this.totalW; return; }
    this.jumpTo(si + 1);
  }

  atEnd() { return this.scrollCur > this.totalW - 0.06; }

  begin() {
    if (this.finishing) return;
    this.finishing = true;
    this.game.audio.playConfirm();
  }

  skip() {
    if (this.finishing) return;
    this.finishing = true;
    this.fadeOut = 0.35; // shorter fade when skipping
    this.game.audio.playCancel();
  }

  onClick(cx, cy) {
    for (let i = 0; i < this.dotRects.length; i++) {
      const r = this.dotRects[i];
      if (cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h) { this.jumpTo(i); return; }
    }
    const sr = this.skipRect;
    if (sr && cx > sr.x && cx < sr.x + sr.w && cy > sr.y && cy < sr.y + sr.h) { this.skip(); return; }
    if (this.atEnd()) this.begin();
  }

  update(dt) {
    if (this.done) return;
    const input = this.game.input;
    const dir = ((input.isDown('KeyS') || input.isDown('ArrowDown')) ? 1 : 0)
              - ((input.isDown('KeyW') || input.isDown('ArrowUp')) ? 1 : 0);
    if (dir) this.scrollTarget = ScrollFlightManager.clamp(this.scrollTarget + dir * dt * 1.1, 0, this.totalW);

    // Chase the target (scroll-world's per-frame 0.18 lerp, dt-normalized;
    // under prefers-reduced-motion the chase is instant — no drifting camera)
    this.scrollCur += (this.scrollTarget - this.scrollCur) * (this.reduce ? 1 : Math.min(1, dt * 60 * 0.18));

    if (this.fadeIn > 0) this.fadeIn = Math.max(0, this.fadeIn - dt * 1.2);
    if (this.finishing) {
      this.fadeOut = Math.min(1, this.fadeOut + dt * 1.6);
      if (this.fadeOut >= 1 && !this.done) {
        this.done = true;
        if (this.onComplete) this.onComplete();
      }
    }

    if (this._blipCd > 0) this._blipCd -= dt;
    const active = this.sectionAt(this.scrollCur);
    if (active !== this.lastActive) {
      // Cooldown stops seam flap: scroll jitter parked exactly on a section
      // boundary would otherwise re-blip on every crossing.
      if (this.lastActive !== -1 && this._blipCd <= 0) {
        this.game.audio.playCursor();
        this._blipCd = 0.3;
      }
      this.lastActive = active;
    }
  }

  cameraAt(u) {
    const sg = this.segments[this.segmentAt(u)];
    const local = ScrollFlightManager.clamp((u - sg.start) / (sg.end - sg.start));
    // smooth() zeroes velocity at both seam edges, so the direction reversal
    // between a dive and a connector never reads as a rewind (the seam rule).
    const eased = ScrollFlightManager.smooth(ScrollFlightManager.lingerEase(local, sg.linger));
    const a = sg.from, b = sg.to;
    // The connector's aerial arc: zoom out to a god's-eye overview at the
    // apex, then descend. sin(π·t) is exactly 0 at both seams, so the shared
    // endpoint poses stay frame-identical no matter how big the arc is.
    const lift = sg.arc ? (1 - sg.arc * Math.sin(Math.PI * eased)) : 1;
    return {
      x: a.x + (b.x - a.x) * eased,
      y: a.y + (b.y - a.y) * eased,
      z: (a.z + (b.z - a.z) * eased) * lift,
    };
  }

  _accentRgba(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  render(ctx, canvas) {
    const W = canvas.width, H = canvas.height;
    const t = this.game.animTimer, glow = this.game.titleGlow;
    const ex = this.game.explore;
    const smooth = ScrollFlightManager.smooth, clamp = ScrollFlightManager.clamp;

    // Void backdrop behind/around the grounds
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#050010');
    bgGrad.addColorStop(1, '#02000a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // ── The world, seen through the flight camera ──
    const cam = this.cameraAt(this.scrollCur);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);
    ex._renderFloor(ctx, W, H);
    ex._renderWardCircle(ctx, W, H, t, glow);
    ex._renderStructures(ctx, W, H, glow);
    ex._renderEncounterZones(ctx, t, glow);
    ex._renderWardStone(ctx, t, glow); // also draws chests + the Star Sigil
    ex._renderNPCs(ctx, t, glow);
    ctx.restore();

    // Screen-space vignette
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.85);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Cinematic letterbox
    ctx.fillStyle = 'rgba(2,0,8,0.92)';
    ctx.fillRect(0, 0, W, 46);
    ctx.fillRect(0, H - 46, W, 46);

    const N = this.sections.length;
    const u = this.scrollCur;
    const activeSection = this.sectionAt(u);
    const accent = this.sections[activeSection].accent;

    // ── Pinned copy (opacity curves ported from scroll-world) ──
    // Copy is pinned to the section's DIVE, so it peaks while the camera is
    // settled on its subject; connectors are pure transit and show no copy.
    this.sections.forEach((s, i) => {
      const seg = s._seg;
      const pr = clamp((u - seg.start) / (seg.end - seg.start));
      const before = u < seg.start, after = u > seg.end;
      let cop;
      if (i === 0) cop = after ? 0 : smooth(1 - pr / 0.62);            // greets on landing
      else if (i === N - 1) cop = before ? 0 : smooth(pr / 0.4);       // holds at the end
      else cop = (before || after) ? 0 : smooth(1 - Math.abs(pr - 0.5) / 0.5);
      if (cop <= 0.01) return;

      // Left scrim so copy reads over the world (600px: the widest title,
      // "One stone holds the balance." at bold 30px Cinzel, ends at x≈546)
      const scrim = ctx.createLinearGradient(0, 0, 600, 0);
      scrim.addColorStop(0, `rgba(3,0,12,${0.72 * cop})`);
      scrim.addColorStop(0.6, `rgba(3,0,12,${0.38 * cop})`);
      scrim.addColorStop(1, 'rgba(3,0,12,0)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 46, 600, H - 92);

      const cx2 = 56;
      const cy2 = H * 0.5 + (this.reduce ? 0 : (0.5 - pr) * 26);
      ctx.textAlign = 'left';
      ctx.globalAlpha = cop;
      ctx.fillStyle = 'rgba(170,140,210,0.85)';
      ctx.font = '10px monospace';
      ctx.fillText(`0${i + 1} / 0${N}`, cx2, cy2 - 78);
      ctx.fillStyle = s.accent;
      ctx.font = 'bold 12px Cinzel, serif';
      ctx.fillText(s.eyebrow.split('').join(' '), cx2, cy2 - 54);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = this._accentRgba(s.accent, 0.45);
      ctx.shadowBlur = 18;
      ctx.font = 'bold 30px Cinzel, Georgia, serif';
      ctx.fillText(s.title, cx2, cy2 - 20);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(216,198,240,0.92)';
      ctx.font = '14px Georgia, serif';
      wrapText(ctx, s.body, cx2, cy2 + 8, 350, 20);
      ctx.globalAlpha = 1;
    });

    // ── Route rail (right edge) ──
    this.dotRects = [];
    const railX = W - 34;
    const railTop = H / 2 - ((N - 1) * 26) / 2;
    ctx.strokeStyle = this._accentRgba(accent, 0.28);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(railX, railTop - 8);
    ctx.lineTo(railX, railTop + (N - 1) * 26 + 8);
    ctx.stroke();
    this.sections.forEach((s, i) => {
      const dy = railTop + i * 26;
      const isActive = i === activeSection;
      ctx.fillStyle = isActive ? s.accent : this._accentRgba(s.accent, 0.35);
      ctx.beginPath();
      ctx.arc(railX, dy, isActive ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (isActive) {
        ctx.strokeStyle = this._accentRgba(s.accent, 0.35);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(railX, dy, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(230,215,255,0.9)';
        ctx.font = 'bold 10px Cinzel, serif';
        ctx.textAlign = 'right';
        ctx.fillText(s.label, railX - 16, dy + 3);
      }
      // Finger-sized hit areas on touch (the visible dot stays small)
      const hp = this.isTouch ? 22 : 14;
      this.dotRects.push({ x: railX - hp, y: dy - hp, w: hp * 2, h: hp * 2 });
    });

    // ── Progress bar (top edge) ──
    ctx.fillStyle = this._accentRgba(accent, 0.18);
    ctx.fillRect(0, 0, W, 3);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, W * clamp(u / this.totalW), 3);

    // ── Scroll hint (fades once the flight starts) ──
    const hintOp = clamp(1 - u / 0.5);
    if (hintOp > 0.01 && !this.finishing) {
      ctx.globalAlpha = hintOp;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(200,170,255,0.85)';
      ctx.font = '11px monospace';
      ctx.fillText(this.isTouch ? 'DRAG TO FLY' : 'SCROLL TO FLY IN', W / 2, H - 60);
      if (!this.isTouch && !this.reduce) {
        // little mouse-wheel glyph with a travelling dot
        const mx = W / 2, my = H - 96;
        ctx.strokeStyle = 'rgba(200,170,255,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(mx - 9, my - 14, 18, 28, 9);
        ctx.stroke();
        const dotT = (t % 1.7) / 1.7;
        ctx.globalAlpha = hintOp * Math.sin(dotT * Math.PI);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(mx, my - 7 + dotT * 11, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ── End CTA ──
    if (this.atEnd() && !this.finishing) {
      const pulse = 0.65 + Math.sin(t * 3) * 0.35;
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(240,208,128,${pulse})`;
      ctx.font = 'bold 16px Cinzel, serif';
      ctx.fillText(this.isTouch ? `✦  TAP — ${this.endCta}  ✦` : `✦  ENTER — ${this.endCta}  ✦`, W / 2, H - 62);
    }

    // ── Skip button (bottom right) ──
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(150,110,200,0.55)';
    ctx.font = '10px monospace';
    const skipLabel = this.isTouch ? '✕ SKIP' : 'ESC — SKIP';
    ctx.fillText(skipLabel, W - 16, H - 18);
    this.skipRect = this.isTouch ? { x: W - 216, y: H - 46, w: 208, h: 44 }
                                 : { x: W - 176, y: H - 40, w: 168, h: 32 };

    // ── Fades ──
    if (this.fadeIn > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.fadeIn})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.fadeOut > 0) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.fadeOut)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

// ─── Explore Manager ─────────────────────────────────────────
class ExploreManager {
  constructor(game) {
    this.game = game;
    this.currentMap = 'warded_grounds';
    this.locationCard = { text: 'WARDED GROUNDS', timer: 2.5 };
    this.exitHintCooldown = 0;
    this.playerX = 300;
    this.playerY = 260;
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
        x: 148, y: 170,     // center of the Elder's Alcove platform (x:60-240, y:118-218)
        label: 'Elder Ward',
        color: '#80d0ff',
        radius: 20,
        dialogueKey: 'npc_elder_ward_first',
        talked: false,
      },
      {
        id: 'verity_vex',
        x: 120, y: 460,     // lower-left grounds, clear of platforms and encounter zones
        label: 'Verity Vex',
        color: '#e0b0ff',
        radius: 20,
        type: 'recruit',
        recruitId: 'verity_vex',
        dialogueKey: 'npc_verity_vex',
        afterKey: 'npc_verity_vex_after',
      },
      {
        id: 'cogsworth',
        x: 835, y: 320,     // east wall sentinel post, below the stone pedestal
        label: 'Cogsworth',
        color: '#f0c060',
        radius: 20,
        type: 'recruit',
        recruitId: 'cogsworth',
        dialogueKey: 'npc_cogsworth',
        afterKey: 'npc_cogsworth_after',
      },
      {
        id: 'sir_paradox',
        x: 450, y: 555,     // south gate, between the two encounter zones
        label: 'Sir Paradox',
        color: '#80ffd0',
        radius: 20,
        type: 'recruit',
        recruitId: 'sir_paradox',
        dialogueKey: 'npc_sir_paradox',
        afterKey: 'npc_sir_paradox_after',
      }
    ];
    // A recruit NPC whose character is already in the party (loaded save)
    // starts in the recruited state.
    this.npcs.forEach(npc => {
      if (npc.type === 'recruit' && this.game.party?.some(m => m.id === npc.recruitId)) {
        npc.recruited = true;
      }
    });

    this.objects = [
      {
        id: 'ward_stone',
        x: 720, y: 148,     // top center of the stone pedestal (x:680-760, y:120-205)
        label: 'Ward Stone',
        color: '#d0a0ff',
        radius: 25,
        icon: '✦',
      },
      {
        id: 'chest_gold',
        x: 420, y: 160,
        label: 'Chest',
        color: '#f5e01d',
        radius: 20,
        type: 'chest',
        reward: { gold: 120, item: 'potion' },
        opened: false
      },
      {
        id: 'chest_relic',
        x: 720, y: 480,
        label: 'Ancient Cache',
        color: '#80ffcc',
        radius: 20,
        type: 'chest',
        reward: { gold: 250, item: 'elixir' },
        opened: false
      },
      {
        id: 'star_sigil',
        x: 455, y: 95,      // top-center of the grounds, between alcove and pedestal
        label: 'Star Sigil',
        color: '#a0d8ff',
        radius: 22,
        type: 'sigil',
        defeated: false
      }
    ];

    this.encounter_zones = [
      { id: 'grounds_abyss', x: 280, y: 420, r: 72, enemy: ['abyss_tiger'],    bg: 'battle_bg',  used: false },
      { id: 'grounds_arcane', x: 580, y: 430, r: 72, enemy: ['arcane_leopard'], bg: 'battle_bg2', used: false },
    ];

    this.mapStates = {
      warded_grounds: { npcs: this.npcs, objects: this.objects, encounter_zones: this.encounter_zones },
      echoing_verge: {
        npcs: [{ id: 'verge_echo', x: 450, y: 190, label: 'Ward Echo', color: '#80e8ff', radius: 20,
                 type: 'guide', dialogueKey: 'npc_ward_echo' }],
        objects: [
          { id: 'echo_cache', x: 735, y: 430, label: 'Verge Cache', color: '#80ffcc', radius: 20,
            type: 'chest', reward: { gold: 180, item: 'ward_shard' }, opened: false },
          { id: 'resonant_marker', x: 185, y: 390, label: 'Resonant Marker', color: '#80d8ff', radius: 25,
            type: 'lore', discovered: false },
        ],
        encounter_zones: [
          { id: 'verge_guardians', x: 590, y: 330, r: 72, enemy: ['abyss_tiger', 'arcane_leopard'],
            bg: 'battle_bg2', used: false, verge: true },
        ],
      },
    };

    this.walkCycle = 0;
    this.lastBg = 0;
    this.huntsSpawned = false;   // post-quest replayable hunts (Azure Tiger + Arctic Lion)

    // Ambient life: footstep dust puffs + free-roaming ward motes that scatter
    // away from the player. Motes seeded deterministically (no Math.random in
    // fixed positions needed, but a one-time spread at construction is fine).
    this.dust = [];
    this.dustTimer = 0;
    this.motes = Array.from({ length: 18 }, () => ({
      x: 32 + Math.random() * 836,
      y: 70 + Math.random() * 495,
      phase: Math.random() * 6.28,
      speed: 8 + Math.random() * 10,
      blink: 1 + Math.random() * 2,
      gold: Math.random() < 0.4,
    }));
  }

  init(savedData) {
    if (savedData) {
      this.playerX = Number(savedData.playerX) || 400;
      this.playerY = Number(savedData.playerY) || 300;
      this.battleCount = savedData.battleCount || 0;
      this.elderTalked = savedData.elderTalked || false;
      this.stoneTouched = savedData.stoneTouched || false;
      // The Blaze Lion is spawned dynamically after guardian two. Recreate it
      // before applying saved zone state so a mid-quest reload cannot remove
      // the boss and soft-lock the Ward Stone.
      if (this.battleCount >= 2 && !this.stoneTouched && !this.encounter_zones.some(z => z.id === 'grounds_blaze')) {
        this.encounter_zones.push({ id: 'grounds_blaze', x: 750, y: 360, r: 60,
          enemy: ['blaze_lion'], bg: 'battle_bg3', used: this.battleCount >= 3 });
      }
      if (savedData.npcs) {
        savedData.npcs.forEach((ns, i) => {
          if (this.npcs[i]) this.npcs[i].talked = ns.talked;
        });
      }
      if (savedData.objects) {
        savedData.objects.forEach((os, i) => {
          if (this.objects[i]) {
            if (os.opened !== undefined) this.objects[i].opened = os.opened;
            if (os.defeated !== undefined) this.objects[i].defeated = os.defeated;
          }
        });
      }
      if (savedData.encounter_zones) {
        savedData.encounter_zones.forEach((ez, i) => {
          if (this.encounter_zones[i]) this.encounter_zones[i].used = ez.used;
        });
      }
      // Recreate the post-quest hunt zones (fresh/un-used — they respawn anyway)
      // after the base-zone index restore above, so indices stay aligned.
      if (savedData.huntsSpawned) this.spawnHunts();
      if (savedData.mapStates) {
        Object.entries(savedData.mapStates).forEach(([mapId, state]) => {
          const target = this.mapStates[mapId];
          if (!target || !state) return;
          (state.npcs || []).forEach(ns => Object.assign(target.npcs.find(n => n.id === ns.id) || {}, ns));
          (state.objects || []).forEach(os => Object.assign(target.objects.find(o => o.id === os.id) || {}, os));
          (state.encounter_zones || []).forEach(zs => Object.assign(target.encounter_zones.find(z => z.id && z.id === zs.id) || {}, zs));
        });
      }
      const mapId = this.mapStates[savedData.currentMap] ? savedData.currentMap : 'warded_grounds';
      this._activateMap(mapId);
      this._clampPlayer();
    }
  }

  getSaveData() {
    const grounds = this.mapStates.warded_grounds;
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      currentMap: this.currentMap,
      playerX: this.playerX,
      playerY: this.playerY,
      battleCount: this.battleCount,
      elderTalked: this.elderTalked,
      stoneTouched: this.stoneTouched,
      npcs: grounds.npcs.map(n => ({ talked: n.talked })),
      objects: grounds.objects.map(o => ({ opened: o.opened, defeated: o.defeated })),
      encounter_zones: grounds.encounter_zones.map(z => ({ used: z.used })),
      huntsSpawned: this.huntsSpawned,
      mapStates: Object.fromEntries(Object.entries(this.mapStates).map(([id, state]) => [id, {
        npcs: state.npcs.map(n => ({ id: n.id, talked: !!n.talked, recruited: !!n.recruited })),
        objects: state.objects.map(o => ({ id: o.id, opened: !!o.opened, defeated: !!o.defeated, discovered: !!o.discovered })),
        encounter_zones: state.encounter_zones.filter(z => z.id).map(z => ({ id: z.id, used: !!z.used })),
      }])),
    };
  }

  _activateMap(mapId) {
    const state = this.mapStates[mapId];
    if (!state) return false;
    this.currentMap = mapId;
    this.npcs = state.npcs;
    this.objects = state.objects;
    this.encounter_zones = state.encounter_zones;
    return true;
  }

  switchMap(mapId, spawn) {
    if (!this._activateMap(mapId)) return false;
    this.playerX = spawn.x;
    this.playerY = spawn.y;
    this.playerDir = spawn.dir || 'down';
    this.locationCard = { text: mapId === 'echoing_verge' ? 'THE ECHOING VERGE' : 'WARDED GROUNDS', timer: 3 };
    this.dust.length = 0;
    this.game.audio.playTone(mapId === 'echoing_verge' ? 520 : 360, 0.45, 'sine', 0.12);
    this.game.save();
    return true;
  }

  _clampPlayer() {
    this.playerX = Math.max(32, Math.min(868, Number(this.playerX) || 450));
    this.playerY = Math.max(65, Math.min(568, Number(this.playerY) || 300));
  }

  /** Star Sigil: a slow-turning constellation diamond with orbiting motes. */
  _renderSigil(ctx, obj, t) {
    const done = obj.defeated;
    const pulse = done ? 0.35 : 0.55 + Math.sin(t * 2.2) * 0.35;
    const [r, g, b] = done ? [120, 220, 160] : [160, 210, 255];
    const halo = ctx.createRadialGradient(obj.x, obj.y, 0, obj.x, obj.y, 52);
    halo.addColorStop(0, `rgba(${r},${g},${b},${0.10 + pulse * 0.12})`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(obj.x, obj.y, 52, 0, Math.PI * 2); ctx.fill();
    // four-point star
    ctx.save();
    ctx.translate(obj.x, obj.y);
    ctx.rotate(t * (done ? 0.15 : 0.5));
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.55 + pulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const outer = 20, inner = 6;
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.lineTo(Math.cos(a + Math.PI / 4) * inner, Math.sin(a + Math.PI / 4) * inner);
    }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
    // orbiting motes
    for (let i = 0; i < 3; i++) {
      const a = t * 1.4 + i * (Math.PI * 2 / 3);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.5 + Math.sin(t * 3 + i) * 0.3})`;
      ctx.beginPath();
      ctx.arc(obj.x + Math.cos(a) * 30, obj.y + Math.sin(a) * 12, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // label
    ctx.fillStyle = `rgba(${r},${g},${b},0.75)`;
    ctx.font = '11px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.fillText(obj.label, obj.x, obj.y + 44);
  }

  update(dt, canvas) {
    const g = this.game;
    const input = g.input;
    const W = canvas.width, H = canvas.height;
    if (this.locationCard.timer > 0) this.locationCard.timer -= dt;
    if (this.exitHintCooldown > 0) this.exitHintCooldown -= dt;

    // Freeze the player while the iris wipe closes over the scene.
    if (g.battleTransition) { this._updateAmbient(dt, W, H); return; }

    let dx = 0, dy = 0;
    if (input.isDown('ArrowLeft') || input.isDown('KeyA')) dx -= 1;
    if (input.isDown('ArrowRight') || input.isDown('KeyD')) dx += 1;
    if (input.isDown('ArrowUp') || input.isDown('KeyW')) dy -= 1;
    if (input.isDown('ArrowDown') || input.isDown('KeyS')) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx*dx + dy*dy);
      dx /= len; dy /= len;
      const nx = this.playerX + dx * this.speed * dt;
      const ny = this.playerY + dy * this.speed * dt;
      // Map boundary (wall borders: top=65, sides=32, bottom=32)
      const px = Math.max(32, Math.min(W - 32, nx));
      const py = Math.max(65, Math.min(H - 32, ny));
      // Block Elder's Alcove platform (x:60-240, y:118-218) — player walks around it
      const blockers = this.currentMap === 'warded_grounds'
        ? [{ x1: 55, x2: 245, y1: 113, y2: 223 }, { x1: 671, x2: 769, y1: 113, y2: 215 }]
        : [{ x1: 330, x2: 570, y1: 245, y2: 305 }, { x1: 92, x2: 250, y1: 120, y2: 185 }];
      const blocked = (x, y) => blockers.some(b => x > b.x1 && x < b.x2 && y > b.y1 && y < b.y2);
      const inPlatformX = blocked(px, py);
      const inPlatformY = inPlatformX;
      const inPedestalX = false;
      const inPedestalY = false;
      this.playerX = (inPlatformX && inPlatformY) ? this.playerX : px;
      this.playerY = (inPlatformX && inPlatformY) ? this.playerY :
                     (inPedestalX && inPedestalY) ? this.playerY : py;
      // Separate axis re-test for sliding along structure walls
      const pxOnly = Math.max(32, Math.min(W - 32, this.playerX + dx * this.speed * dt));
      const pyOnly = Math.max(65, Math.min(H - 32, this.playerY + dy * this.speed * dt));
      const blockedX = blocked(pxOnly, this.playerY);
      const blockedY = blocked(this.playerX, pyOnly);
      if (!blockedX) this.playerX = pxOnly;
      if (!blockedY) this.playerY = pyOnly;
      if (this.currentMap === 'warded_grounds' && this.playerY >= H - 32 && this.playerX > 390 && this.playerX < 510) {
        const trialDone = this.game.quests?.find(q => q.id === 'trial_of_wards')?.complete;
        if (trialDone) { this.switchMap('echoing_verge', { x: 450, y: 105, dir: 'down' }); return; }
        if (this.exitHintCooldown <= 0) {
          this.game.ui.showNotification('The southern ward is sealed. Claim the Ward Stone first.');
          this.exitHintCooldown = 2;
        }
      } else if (this.currentMap === 'echoing_verge' && this.playerY <= 65 && this.playerX > 390 && this.playerX < 510) {
        this.switchMap('warded_grounds', { x: 450, y: 520, dir: 'up' }); return;
      }
      if (dx < 0) this.playerDir = 'left';
      else if (dx > 0) this.playerDir = 'right';
      else if (dy < 0) this.playerDir = 'up';
      else this.playerDir = 'down';
      this.animTimer += dt;
      if (this.animTimer > 0.2) { this.animTimer = 0; this.walkCycle = (this.walkCycle + 1) % 4; }

      // Footstep dust: a little puff kicked up behind the walking sprite.
      this.dustTimer += dt;
      if (this.dustTimer >= 0.14) {
        this.dustTimer = 0;
        this.dust.push({ x: this.playerX + (Math.random() * 10 - 5), y: this.playerY + 20,
                         life: 0.5, r: 2 + Math.random() * 2 });
        if (this.dust.length > 24) this.dust.shift();
      }

      // Check encounter zones
      this.encounter_zones.forEach(zone => {
        if (zone.used) return;
        const dist = Math.hypot(this.playerX - zone.x, this.playerY - zone.y);
        if (dist < zone.r) {
          zone.used = true;
          this.triggerBattle(zone.enemy, zone.bg, zone);
        }
      });
    }

    // Post-quest hunts: spawn once the Trial is complete, then re-arm each
    // hunt zone after its cooldown — but only once the player has stepped out
    // of it, so a win doesn't instantly re-trigger.
    if (!this.huntsSpawned && this.game.quests?.find(q => q.id === 'trial_of_wards')?.complete) {
      this.spawnHunts();
      this.game.ui.showNotification('New challengers prowl the grounds…');
    }
    this.encounter_zones.forEach(z => {
      if (!z.hunt || !z.used) return;
      if (z.cooldown > 0) z.cooldown -= dt;
      // Re-arm once the cooldown has elapsed AND the player has left the zone,
      // so a fresh win never instantly re-triggers the same hunt.
      if (z.cooldown <= 0 && Math.hypot(this.playerX - z.x, this.playerY - z.y) > z.r + 10) {
        z.used = false;
      }
    });

    this._updateAmbient(dt, W, H);
  }

  // Drift the ward motes (scattering away from the player) and decay dust.
  _updateAmbient(dt, W, H) {
    this.motes.forEach(m => {
      m.x += Math.cos(m.phase) * m.speed * dt;
      m.y += Math.sin(m.phase * 0.7) * m.speed * 0.6 * dt;
      m.phase += dt * 0.4;
      // Scatter from the player
      const ddx = m.x - this.playerX, ddy = m.y - this.playerY;
      const d = Math.hypot(ddx, ddy);
      if (d < 55 && d > 0.01) { m.x += (ddx / d) * 40 * dt; m.y += (ddy / d) * 40 * dt; }
      // Wrap within the play area
      if (m.x < 32) m.x = W - 32; else if (m.x > W - 32) m.x = 32;
      if (m.y < 70) m.y = H - 32; else if (m.y > H - 32) m.y = 70;
    });
    this.dust = this.dust.filter(d => { d.life -= dt; d.r += dt * 4; return d.life > 0; });
  }

  triggerBattle(enemyIds, bgKey, zone) {
    const g = this.game;
    g.audio.playTone(200, 0.5, 'sawtooth', 0.3);
    // Walking away from a lost fight re-arms its zone — otherwise a loss
    // consumed the encounter and quest battles became uncompletable.
    const onLose = () => { if (zone) zone.used = false; this.onBattleLose(); };
    // Show battle intro dialogue if first tiger
    const introKey = enemyIds[0] === 'abyss_tiger' ? 'battle_intro_tiger' : null;
    if (introKey) {
      g.startDialogue(introKey, () => {
        g.startBattleTransition(enemyIds, bgKey, () => this.onBattleWin(zone), onLose);
      });
    } else {
      g.startBattleTransition(enemyIds, bgKey, () => this.onBattleWin(zone), onLose);
    }
  }

  onBattleWin(zone) {
    if (zone && zone.verge) {
      this.game.ui.showNotification('The Verge grows quiet. Its ward-path is secure.');
      this.game.addItem('ward_shard', 2);
      this.game.gold += 100;
      this.game.save();
      return;
    }
    // Replayable post-quest hunt: no quest progress, just rewards; the zone
    // re-arms after a cooldown (calcRewards already granted its exp/gold).
    if (zone && zone.hunt) {
      zone.cooldown = zone.respawn;
      this.game.ui.showNotification('Hunt complete! The beast will prowl again…');
      this.game.save();
      return;
    }
    this.battleCount++;
    this.game.incrementQuestCount('trial_of_wards', 'defeat_guardians');
    this.game.ui.showNotification(`Guardian defeated! (${Math.min(this.battleCount, 2)}/2)`);

    // If all guardians beaten, trigger Blaze Lion encounter near ward stone
    if (this.battleCount === 2) {
      this.encounter_zones.push({ id: 'grounds_blaze', x: 750, y: 360, r: 60, enemy: ['blaze_lion'], bg: 'battle_bg3', used: false });
    }
  }

  // Two idle guardians (Azure Tiger, Arctic Lion) become respawning hunts once
  // the first quest is done — using enemies fully defined in JSON but unused.
  spawnHunts() {
    if (this.huntsSpawned) return;
    this.huntsSpawned = true;
    this.encounter_zones.push(
      { id: 'grounds_azure_hunt', x: 180, y: 300, r: 64, enemy: ['azure_tiger'], bg: 'battle_bg2', used: false, hunt: true, respawn: 12, cooldown: 0 },
      { id: 'grounds_arctic_hunt', x: 720, y: 300, r: 64, enemy: ['arctic_lion'], bg: 'battle_bg',  used: false, hunt: true, respawn: 12, cooldown: 0 },
    );
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
        if (npc.type === 'guide') {
          g.startDialogue(npc.dialogueKey, () => { npc.talked = true; g.state = STATE.EXPLORE; g.save(); });
          return;
        }
        if (npc.type === 'recruit') {
          if (!npc.recruited) {
            g.startDialogue(npc.dialogueKey, () => {
              npc.recruited = true;
              const def = g.data.characters.find(c => c.id === npc.recruitId);
              if (def && !g.party.some(m => m.id === def.id)) {
                g.party.push(g.createPartyMember(def));
                g.ui.showNotification(`${def.name} joined the party!`);
                g.audio.playVictory();
                g.incrementQuestCount('the_astral_hunt', 'gather_jesters');
              }
              g.state = STATE.EXPLORE;
            });
          } else {
            g.startDialogue(npc.afterKey, () => { g.state = STATE.EXPLORE; });
          }
          return;
        }
        if (!npc.talked) {
          npc.talked = true;
          this.elderTalked = true;
          g.advanceQuest('trial_of_wards', 'speak_elder');
          g.startDialogue(npc.dialogueKey, () => { g.state = STATE.EXPLORE; });
        } else {
          const afterKey = this.battleCount >= 2 ? 'npc_elder_ward' : this.battleCount === 1 ? 'npc_elder_ward_one' : 'npc_elder_ward_first';
          g.startDialogue(afterKey, () => { g.state = STATE.EXPLORE; });
        }
        return;
      }
    }

    // Check objects
    for (const obj of this.objects) {
      const dist = Math.hypot(this.playerX - obj.x, this.playerY - obj.y);
      if (dist < obj.radius + 40) {
        if (obj.type === 'chest') {
          if (obj.opened) {
            g.ui.showNotification('The chest is empty.');
            g.audio.playCancel();
            return;
          }
          g.audio.playConfirm();
          obj.opened = true;
          
          let logMsg = 'Opened the chest!';
          if (obj.reward.gold) {
            g.gold += obj.reward.gold;
            logMsg += ` +${obj.reward.gold} Gold.`;
          }
          if (obj.reward.item) {
            g.addItem(obj.reward.item);
            const itemDef = g.getItemDef(obj.reward.item);
            logMsg += ` Found ${itemDef ? itemDef.name : obj.reward.item}!`;
          }
          
          g.ui.showNotification(logMsg);
          return;
        }

        if (obj.type === 'sigil') {
          const quest = g.quests.find(q => q.id === 'the_astral_hunt');
          if (!quest || quest.locked) {
            g.ui.showNotification('A dormant sigil of stars. It does not answer... yet.');
            g.audio.playTone(220, 0.3, 'sine', 0.15);
            return;
          }
          if (obj.defeated) {
            g.ui.showNotification('The sigil rests. The constellation above is calm.');
            g.audio.playTone(440, 0.2, 'sine', 0.15);
            return;
          }
          if (!g.isQuestStageDone('the_astral_hunt', 'gather_jesters')) {
            g.ui.showNotification('The sigil hums... it awaits the full company of Jesters.');
            g.audio.playTone(300, 0.3, 'sine', 0.18);
            return;
          }
          g.startDialogue('battle_intro_cougar', () => {
            g.startBattle(['astral_cougar'], 'battle_bg3', () => {
              obj.defeated = true;
              g.advanceQuest('the_astral_hunt', 'face_cougar');
              g.startDialogue('astral_hunt_complete', () => {
                g.completeQuest('the_astral_hunt');
              });
            }, () => {});
          });
          return;
        }

        if (obj.type === 'lore') {
          if (obj.discovered) {
            g.ui.showNotification('The marker repeats a steady answer: the ward-path holds.');
            g.audio.playTone(520, 0.25, 'sine', 0.12);
            return;
          }
          obj.discovered = true;
          g.addItem('ether_orb');
          g.gold += 75;
          g.startDialogue('verge_marker', () => {
            g.ui.showNotification('Discovery: +75 Gold, +1 Ether Orb');
            g.state = STATE.EXPLORE;
            g.save();
          });
          return;
        }

        if (obj.id === 'ward_stone') {
          if (!g.isQuestStageDone('trial_of_wards', 'defeat_guardians')) {
            g.ui.showNotification('The Ward Stone pulses… defeat the guardians first!');
            g.audio.playTone(180, 0.4, 'sine', 0.2);
            return;
          }
          const blazeDefeated = !this.encounter_zones.find(z => z.enemy[0] === 'blaze_lion' && !z.used)
                                && this.battleCount >= 3;
          if (this.battleCount >= 2 && !blazeDefeated) {
            const bossStillAlive = this.encounter_zones.find(z => z.enemy[0] === 'blaze_lion' && !z.used);
            if (bossStillAlive) {
              g.ui.showNotification('A fierce presence blocks the Ward Stone!');
              g.audio.playTone(180, 0.4, 'sawtooth', 0.2);
              return;
            }
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

    if (this.currentMap === 'echoing_verge') {
      this._renderVerge(ctx, canvas, t, glow);
      return;
    }

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

    // ── Layer 6.5: Footstep dust (under the sprite) ─────────
    this.dust.forEach(d => {
      ctx.fillStyle = `rgba(190,170,255,${d.life * 0.4})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * (1 + (0.5 - d.life)), 0, Math.PI * 2);
      ctx.fill();
    });

    // ── Layer 7: Player ─────────────────────────────────────
    this.renderPlayer(ctx, t);

    // ── Layer 8: Interaction hints ──────────────────────────
    this._renderHints(ctx);

    // ── Layer 9: Atmosphere (vignette + rune particles) ─────
    this._renderAtmosphere(ctx, W, H, t, glow);

    // ── Layer 10: HUD ────────────────────────────────────────
    this.game.ui.renderHUD(ctx, canvas);
    this.renderPartyStatus(ctx, canvas);
    this._renderMinimap(ctx, canvas);
    this._renderLocationCard(ctx, canvas);
  }

  _renderVerge(ctx, canvas, t, glow) {
    const W = canvas.width, H = canvas.height;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#071a2b'); sky.addColorStop(0.55, '#10253a'); sky.addColorStop(1, '#071018');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(80,210,230,0.18)'; ctx.lineWidth = 28; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(450, 60); ctx.bezierCurveTo(440, 190, 650, 300, 450, 590); ctx.stroke();
    ctx.strokeStyle = 'rgba(150,100,255,0.22)'; ctx.lineWidth = 3; ctx.stroke();
    for (let i = 0; i < 34; i++) {
      const x = 35 + ((i * 113) % 830), y = 75 + ((i * 67) % 480);
      const a = 0.18 + Math.max(0, Math.sin(t * 1.6 + i)) * 0.35;
      ctx.fillStyle = `rgba(120,230,255,${a})`; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    drawRoundedRect(ctx, 330, 245, 240, 60, 10, 'rgba(15,35,55,0.95)', 'rgba(90,210,230,0.45)', 2);
    drawRoundedRect(ctx, 92, 120, 158, 65, 10, 'rgba(20,28,48,0.95)', 'rgba(150,100,255,0.4)', 2);
    ctx.fillStyle = '#9eeeff'; ctx.font = '12px Cinzel, serif'; ctx.textAlign = 'center';
    ctx.fillText('NORTH ARCH - WARDED GROUNDS', 450, 82);
    this._renderEncounterZones(ctx, t, glow);
    this._renderWardStone(ctx, t, glow);
    this._renderNPCs(ctx, t, glow);
    this.dust.forEach(d => { ctx.fillStyle = `rgba(150,220,240,${d.life * 0.35})`; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); });
    this.renderPlayer(ctx, t);
    this._renderHints(ctx);
    this._renderAtmosphere(ctx, W, H, t, glow);
    this.game.ui.renderHUD(ctx, canvas);
    this.renderPartyStatus(ctx, canvas);
    this._renderMinimap(ctx, canvas);
    this._renderLocationCard(ctx, canvas);
  }

  _renderLocationCard(ctx, canvas) {
    if (!this.locationCard || this.locationCard.timer <= 0) return;
    const a = Math.min(1, this.locationCard.timer) * Math.min(1, (3 - this.locationCard.timer) * 2);
    ctx.save(); ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = 'rgba(2,5,14,0.78)'; ctx.fillRect(canvas.width / 2 - 190, 18, 380, 48);
    ctx.strokeStyle = 'rgba(120,210,255,0.65)'; ctx.strokeRect(canvas.width / 2 - 190, 18, 380, 48);
    ctx.fillStyle = '#d8f6ff'; ctx.font = "bold 18px 'Cinzel', serif"; ctx.textAlign = 'center';
    ctx.fillText(this.locationCard.text, canvas.width / 2, 49); ctx.restore();
  }

  _renderMinimap(ctx, canvas) {
    const W = canvas.width, H = canvas.height;
    const mmW = 110, mmH = 80;
    const mmX = 24, mmY = H - mmH - 24;

    // Outer frame with dark purple theme and cyan glow border
    drawRoundedRect(ctx, mmX, mmY, mmW, mmH, 8, 'rgba(8, 4, 24, 0.85)', 'rgba(0, 240, 255, 0.4)', 1.5);
    
    // Scale factor
    const scaleX = mmW / W;
    const scaleY = mmH / H;

    // Draw active encounter zones (red circles)
    this.encounter_zones.forEach(zone => {
      if (zone.used) return;
      ctx.fillStyle = 'rgba(255, 60, 60, 0.35)';
      ctx.beginPath();
      ctx.arc(mmX + zone.x * scaleX, mmY + zone.y * scaleY, zone.r * scaleX, 0, Math.PI * 2);
      ctx.fill();
    });

    // Map-specific points of interest and residents.
    this.objects.forEach(obj => {
      ctx.fillStyle = obj.type === 'chest' ? '#f0c060' : 'rgba(200,160,255,0.8)';
      ctx.fillRect(mmX + obj.x * scaleX - 3, mmY + obj.y * scaleY - 3, 6, 6);
    });
    this.npcs.forEach(npc => {
      ctx.fillStyle = npc.color || '#80d0ff';
      ctx.beginPath(); ctx.arc(mmX + npc.x * scaleX, mmY + npc.y * scaleY, 3.5, 0, Math.PI * 2); ctx.fill();
    });

    // Draw Player (pulsing yellow dot)
    const pulse = 1.0 + Math.sin(this.game.animTimer * 10) * 0.25;
    ctx.fillStyle = '#f5e01d';
    ctx.beginPath();
    ctx.arc(mmX + this.playerX * scaleX, mmY + this.playerY * scaleY, 3.5 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Small HUD Label
    ctx.fillStyle = 'rgba(150, 120, 200, 0.6)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('MINIMAP', mmX + 4, mmY + mmH - 4);
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

  // ── Ward Stone & Interactive Chests ────────────────────────
  _renderChest(ctx, obj, t) {
    const cx = obj.x, cy = obj.y - 8;
    const w = 24, h = 18;
    ctx.save();
    
    // Draw wood box base
    ctx.fillStyle = obj.opened ? '#5a3d28' : '#7d5233';
    ctx.strokeStyle = '#362214';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - w/2, cy - h/2, w, h, 3);
    ctx.fill();
    ctx.stroke();

    // Draw iron bands
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(cx - w/2 + 3, cy - h/2, 3, h);
    ctx.fillRect(cx + w/2 - 6, cy - h/2, 3, h);

    // Draw lock latch
    ctx.fillStyle = obj.opened ? '#c090e0' : '#ffd700'; // golden lock or purple energy glow if opened
    if (obj.opened) {
      // open lid line
      ctx.strokeStyle = '#362214';
      ctx.beginPath();
      ctx.moveTo(cx - w/2, cy - h/2 + 5);
      ctx.lineTo(cx + w/2, cy - h/2 + 5);
      ctx.stroke();
    } else {
      ctx.fillRect(cx - 2, cy - 2, 4, 5);
      // lock glow pulse
      const pulse = 0.5 + Math.sin(t * 6) * 0.5;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 8 * pulse;
    }
    
    ctx.restore();

    // Label below chest
    ctx.fillStyle = obj.opened ? '#808080' : '#ffe080';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(obj.opened ? '🔓 OPENED' : '🔒 ' + obj.label, obj.x, obj.y + 16);
  }

  _renderWardStone(ctx, t, glow) {
    this.objects.forEach(obj => {
      if (obj.type === 'chest') {
        this._renderChest(ctx, obj, t);
        return;
      }
      if (obj.type === 'sigil') {
        this._renderSigil(ctx, obj, t);
        return;
      }
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

    // Free-roaming ward motes (fireflies) — blink and drift, scatter from the
    // player (positions updated in _updateAmbient). Uses the game-level `t`;
    // ExploreManager.animTimer resets every 0.2s for the walk cycle.
    this.motes.forEach(m => {
      const a = 0.1 + 0.45 * Math.max(0, Math.sin(t * m.blink + m.phase));
      if (a <= 0.02) return;
      const core = m.gold ? '255,215,130' : '190,130,255';
      const halo = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 8);
      halo.addColorStop(0, `rgba(${core},${a * 0.5})`);
      halo.addColorStop(1, `rgba(${core},0)`);
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(m.x, m.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(${core},${a})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, 2, 0, Math.PI * 2); ctx.fill();
    });
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
      const py = 20 + i * 74;
      const portrait = this.game.images[m.portrait];

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(startX - 40, py - 5, barW + 60, 66);

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

      // EXP bar toward the next level (member.exp/expToNext were tracked but
      // never shown) — thin gold sliver with the level tag on the right.
      const expPct = Math.max(0, Math.min(1, m.exp / m.expToNext));
      ctx.fillStyle = 'rgba(40,30,16,0.85)';
      ctx.fillRect(startX, py + 50, barW, 4);
      ctx.fillStyle = '#f0c050';
      ctx.fillRect(startX, py + 50, barW * expPct, 4);
      ctx.fillStyle = 'rgba(210,180,120,0.85)';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`Lv.${m.level}`, startX + barW, py + 61);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(180,150,100,0.7)';
      ctx.fillText(`EXP ${m.exp}/${m.expToNext}`, startX, py + 61);
    });
  }
}

// ─── Ability elements (drives impact VFX + damage-number colour) ─────
// Classified in code rather than duplicated across 21 JSON entries.
const ELEMENT_FX = {
  fire:      { color: '#ff6a20', num: '#ff9a4a', shape: 'ember' },
  ice:       { color: '#54d4ff', num: '#9ee6ff', shape: 'shard' },
  lightning: { color: '#ffe24a', num: '#fff29a', shape: 'spark' },
  shadow:    { color: '#a86ae6', num: '#c79aff', shape: 'smoke' },
  arcane:    { color: '#ff6aff', num: '#ff9aff', shape: 'star'  },
  physical:  { color: '#ffb060', num: '#ff8464', shape: 'slash' },
  heal:      { color: '#54ff92', num: '#7dff9a', shape: 'rise'  },
};
const ELEMENT_BY_ID = {
  flame_claw: 'fire', inferno_roar: 'fire',
  frost_breath: 'ice', blizzard_roar: 'ice',
  lightning_strike: 'lightning', storm_dash: 'lightning',
  shadow_web: 'shadow', void_drain: 'shadow', shadow_pounce: 'shadow',
  arcane_burst: 'arcane', jester_gambit: 'arcane', wild_card: 'arcane',
  marionette: 'arcane', shuffle: 'arcane', healing_jig: 'heal',
};
function abilityElement(def) {
  if (!def) return 'physical';
  if (def.id && ELEMENT_BY_ID[def.id]) return ELEMENT_BY_ID[def.id];
  if (def.type === 'heal') return 'heal';
  if (def.effect === 'burn') return 'fire';
  if (def.effect === 'freeze') return 'ice';
  return 'physical';
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
    this.fadeIn = 1.0;          // 1=black, 0=clear — fades to 0 over ~0.8s on battle start
    this.showHint = game.party?.[0]?.level <= 1 && !game._battleHintShown; // show controls hint in first battle
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
    this.enemyIntent = null;       // telegraphed enemy move during the wind-up

    // ── Visual FX ─────────────────────────────────────────────
    this.floatingTexts = [];       // damage/heal numbers that drift up
    this.hitFlashes = {};          // id → flash intensity 0–1
    this.actionAnnounce = null;    // { text, timer, maxTimer, color }
    this.victoryParticles = [];    // burst on win
    this.battleParticles = [];     // cast/hit particle systems
    this.impactParticles = [];     // per-element hit bursts (embers, shards, …)
    this.critFlash = 0;            // full-screen flash on a critical hit
    this._lastCrit = false;        // set by calcDamage, read by its callers
    this.enemyPositions = [];      // set each render frame, used by fx spawners
    this.partyPositions = [];
    this.lungeOffsets = {};        // id → { dx, dy, life 0→1 }
    this.hitBounces = {};          // id → { dx, dy, life 0→1 }
    this.deathFades = {};          // id → alpha 1→0

    this.buildTurnOrder();
    this.addLog(`⚔ Battle begins!`);
  }

  buildTurnOrder() {
    // Hold LIVE references, not copies. The turn order must see the same
    // objects the rest of combat mutates — otherwise start-of-turn upkeep
    // (clearing Defend, ticking DoT/expiry) and the dead-unit skip run
    // against a frozen snapshot and never take effect.
    this.party.forEach(m => { m.isPlayer = true; });
    this.enemies.forEach(e => { e.isPlayer = false; });
    const combatants = [...this.party, ...this.enemies];
    combatants.sort((a, b) => b.stats.spd - a.stats.spd);
    this.turnOrder = combatants;
    this.currentTurn = 0;
    this.advanceToNextTurn();
  }

  advanceToNextTurn() {
    this.enemyIntent = null; // clear any stale telegraph
    // Skip dead combatants (reads LIVE hp now, so KO'd units never act)
    let loops = 0;
    while (loops < 20) {
      const c = this.turnOrder[this.currentTurn % this.turnOrder.length];
      if (c.currentHp > 0) break;
      this.currentTurn++;
      loops++;
    }
    const c = this.turnOrder[this.currentTurn % this.turnOrder.length];

    // Start-of-turn upkeep, on the LIVE combatant and for BOTH sides:
    // clear last turn's guard, then tick DoT + status expiry.
    c.defending = false;
    const wasFrozen = c.statusEffects?.some(se => se.type === 'freeze');
    this.applyStatusEffects(c);

    // A burn/poison tick can be lethal — resolve the death before granting a turn.
    if (c.currentHp <= 0) {
      if (this.checkBattleEnd()) return;
      this.currentTurn++;
      this.advanceToNextTurn();
      return;
    }

    // Freeze (now expired by the tick above) costs the frozen unit its turn.
    if (wasFrozen) {
      this.addLog(`${c.name} is frozen solid and can't move!`);
      const pos = this._combatantPos(c);
      this.spawnFloat(pos.x, pos.y - 30, 'FROZEN', '#7fdfff');
      this.currentTurn++;
      setTimeout(() => this.advanceToNextTurn(), 500);
      return;
    }

    if (c.isPlayer) {
      // Find which party member
      this.selectedMember = this.party.findIndex(m => m.id === c.id && m.currentHp > 0);
      if (this.selectedMember < 0) this.selectedMember = this.party.findIndex(m => m.currentHp > 0);
      this.phase = 'PLAYER_TURN';
      this.selectedAction = 0;
      this.subMenu = null;
    } else {
      this.phase = 'ENEMY_TURN';
      this.scheduleEnemyAction(c);
    }
  }

  // Screen position of a combatant, from the per-frame position caches.
  _combatantPos(c) {
    const id = c.id || c.name;
    return this.enemyPositions.find(p => p.id === id)
        || this.partyPositions.find(p => p.id === id)
        || { x: 450, y: 220 };
  }

  applyStatusEffects(combatant) {
    if (!combatant.statusEffects) return;
    const pos = this._combatantPos(combatant);
    combatant.statusEffects = combatant.statusEffects.filter(se => {
      if (se.type === 'burn') {
        const dmg = 8;
        combatant.currentHp = Math.max(0, combatant.currentHp - dmg);
        this.addLog(`${combatant.name} takes ${dmg} burn damage!`);
        this.spawnFloat(pos.x, pos.y - 20, dmg, '#ff7a30');
        this.spawnHitFlash(combatant.id || combatant.name, '#ff5500');
      } else if (se.type === 'poison') {
        const dmg = 5;
        combatant.currentHp = Math.max(0, combatant.currentHp - dmg);
        this.addLog(`${combatant.name} takes ${dmg} poison damage!`);
        this.spawnFloat(pos.x, pos.y - 20, dmg, '#a0e030');
        this.spawnHitFlash(combatant.id || combatant.name, '#80c000');
      }
      se.duration--;
      return se.duration > 0;
    });
  }

  scheduleEnemyAction(enemy) {
    // Decide the move NOW and telegraph it during the wind-up, so Defend and
    // Ward Shards become informed decisions. null = the enemy will guard.
    const abilityId = this.chooseEnemyAbility(enemy);
    const def = abilityId ? this.game.getAbilityDef(abilityId) : null;
    this.enemyIntent = {
      id: enemy.id || enemy.name,
      label: abilityId === null ? 'Guard' : (def?.name || 'Attack'),
      type: def?.type || 'guard',
    };
    setTimeout(() => {
      if (this.phase !== 'ENEMY_TURN') return;
      this.executeEnemyAction(enemy, abilityId);
    }, 1700); // longer than before so the telegraph is readable
  }

  executeEnemyAction(enemy, plannedAbility) {
    this.enemyIntent = null; // wind-up is over
    const alive = this.party.filter(m => m.currentHp > 0);
    if (!alive.length) { this.checkBattleEnd(); return; }

    // Defensive archetype chose to brace instead of attack.
    if (plannedAbility === null) {
      enemy.defending = true;
      this.addLog(`${enemy.name} braces defensively!`);
      const pos = this._combatantPos(enemy);
      this.spawnFloat(pos.x, pos.y - 30, 'GUARD', '#60d0ff');
      this.checkBattleEnd();
      setTimeout(() => { this.currentTurn++; this.advanceToNextTurn(); }, 600);
      return;
    }

    // Confusion (Shuffle): the enemy may flail and strike itself instead.
    if (enemy.statusEffects?.some(se => se.type === 'confuse') && Math.random() < 0.4) {
      this.addLog(`${enemy.name} is confused and strikes itself!`);
      this.executeAbility(enemy, [enemy], 'claw_swipe', false);
      this.checkBattleEnd();
      setTimeout(() => { this.currentTurn++; this.advanceToNextTurn(); }, 600);
      return;
    }

    const ability = plannedAbility;
    const abilityDef = this.game.getAbilityDef(ability);
    // AoE hits the whole living party; aggressive enemies single out the
    // weakest target (so the telegraph is actionable); others pick at random.
    let targets;
    if (abilityDef && abilityDef.target === 'all_enemies') targets = alive;
    else if ((enemy.ai || 'balanced') === 'aggressive') targets = [alive.reduce((lo, m) => m.currentHp < lo.currentHp ? m : lo, alive[0])];
    else targets = [alive[Math.floor(Math.random() * alive.length)]];

    this.executeAbility(enemy, targets, ability, false);
    this.checkBattleEnd();

    setTimeout(() => {
      this.currentTurn++;
      this.advanceToNextTurn();
    }, 600);
  }

  chooseEnemyAbility(enemy) {
    const ai = enemy.ai || 'balanced';
    // Only consider abilities the enemy can actually afford (an MP-starved
    // enemy used to silently waste its turn); claw_swipe is the free fallback.
    let abilities = (enemy.abilities || ['claw_swipe']).filter(a => {
      const def = this.game.getAbilityDef(a);
      return !def || (def.mp_cost || 0) <= enemy.currentMp;
    });
    if (!abilities.length) abilities = ['claw_swipe'];

    // Defensive: guard (return null) when badly hurt.
    if (ai === 'defensive' && enemy.currentHp < enemy.stats.hp * 0.4 && Math.random() < 0.6) {
      return null;
    }
    // Aggressive: favour heavy hits.
    if (ai === 'aggressive' && Math.random() < 0.4) {
      const heavy = abilities.filter(a => {
        const def = this.game.getAbilityDef(a);
        return def && (def.power || 0) > 1.2;
      });
      if (heavy.length) return heavy[Math.floor(Math.random() * heavy.length)];
    }
    // Swift: favour multi-hit flurries.
    if (ai === 'swift' && Math.random() < 0.6) {
      const multi = abilities.filter(a => {
        const def = this.game.getAbilityDef(a);
        return def && (def.hits || 1) > 1;
      });
      if (multi.length) return multi[Math.floor(Math.random() * multi.length)];
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
      this.spawnImpactBurst(pos.x, pos.y, 'heal');
      this.spawnFloat(pos.x, pos.y - 30, `+${healAmt}`, ELEMENT_FX.heal.num);
      return;
    }

    if (abilityDef.type === 'drain') {
      const dmg = this.calcDamage(actor, target, abilityDef);
      target.currentHp = Math.max(0, target.currentHp - dmg);
      actor.currentHp = Math.min(actor.stats.hp, actor.currentHp + Math.floor(dmg * 0.5));
      this.addLog(`${target.name} takes ${dmg} damage! ${actor.name} absorbs ${Math.floor(dmg*0.5)} HP!`);
      const tPos = getPos(target);
      this.spawnImpactBurst(tPos.x, tPos.y, 'shadow');
      this.spawnFloat(tPos.x, tPos.y - 30, dmg, ELEMENT_FX.shadow.num);
      this.spawnHitFlash(target.id, ELEMENT_FX.shadow.color);
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

    const crit = this._lastCrit;
    const prevHp = target.currentHp;
    target.currentHp = Math.max(0, target.currentHp - dmg);
    const defeated = target.currentHp <= 0 && prevHp > 0;
    this.addLog(`${crit ? 'Critical hit! ' : ''}${target.name} takes ${dmg} damage!${defeated ? ' Defeated!' : ''}`);
    if (crit) { this.playCrit(); } else { this.game.audio.playHit(); }

    // Shake: heavier for big hits, and for crits
    const shakeMag = Math.min(16, (crit ? 10 : 4) + dmg * 0.15);
    this.shakeX = shakeMag;
    this.shakeY = shakeMag * 0.5;

    // Per-element impact burst + flash
    const element = abilityElement(abilityDef);
    const fx = ELEMENT_FX[element];
    const pos = getPos(target);
    this.spawnImpactBurst(pos.x, pos.y, element);
    this.spawnHitFlash(target.id || target.name, fx.color);
    if (crit) { this.setActionAnnounce('CRITICAL!', '#ffee00'); this.critFlash = 0.4; }

    // Lunge: actor charges toward target
    const actorId = actor.id || actor.name;
    if (isPlayer) {
      this.spawnLunge(actorId, 30, -20);   // party member lunges up-right
    } else {
      this.spawnLunge(actorId, -35, 10);   // enemy lunges left toward party
    }

    // Death fade when defeated
    if (defeated) this.spawnDeathFade(target.id || target.name);

    // Floating damage number — element-tinted, gold on a crit
    const numColor = defeated ? '#ff4040' : crit ? '#ffee00' : fx.num;
    this.spawnFloat(pos.x, pos.y - 40, crit ? `${dmg}!` : dmg, numColor, crit || defeated);

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
    let atk = actor.stats?.atk || 15;
    // atk_down debuff: applied as a damage-time multiplier so we never mutate
    // the shared stats object (enemy stats are spread by reference from JSON).
    if (actor.statusEffects?.some(se => se.type === 'atk_down')) atk = Math.floor(atk * 0.7);
    const def = target.stats?.def || 10;
    const ignoreDef = abilityDef.ignore_def || 0;
    const effectiveDef = Math.floor(def * (1 - ignoreDef));

    let power = abilityDef.power || 1.0;

    // Jester's Gambit: random power
    if (abilityDef.effect === 'random_power') {
      power = 0.5 + Math.random() * 2.5;
      this.addLog(`${power > 1.5 ? '✨ Critical hit!' : power < 0.8 ? '💨 Weak...' : 'Hit!'}`);
    }

    let base = Math.max(1, (atk - effectiveDef) * power);
    const variance = abilityDef.variance ? base * abilityDef.variance : base * 0.1;

    // Critical hit driven by the otherwise-unused LCK stat. Stored on the
    // instance so the three callers (resolveHit x2, executePlayerAttack) can
    // read it without changing calcDamage's numeric return contract.
    const critChance = 0.05 + (actor.stats?.lck || 0) * 0.01;
    this._lastCrit = Math.random() < critChance;
    if (this._lastCrit) base *= 1.7;

    return Math.max(1, Math.floor(base + (Math.random() - 0.5) * 2 * variance));
  }

  addLog(msg) {
    this.battleLog.push({ text: msg, timer: 3.0 });
    if (this.battleLog.length > 30) this.battleLog.shift();
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

  spawnBattleParticles(x, y, color = '#ffbb33', count = 18) {
    const colors = Array.isArray(color) ? color : [color, '#ffffff', '#ff6633'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 150;
      this.battleParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 4,
      });
    }
  }

  spawnHitFlash(targetId, color = '#ffaa33') {
    this.hitFlashes[targetId] = 1.0;
    this.hitBounces[targetId] = { dx: 14, dy: -6, life: 1.0 };

    // Spawn hit particles at the center of the target portrait
    const targetPos = this.enemyPositions.find(p => p.id === targetId) || 
                      this.partyPositions.find(p => p.id === targetId);
    if (targetPos) {
      this.spawnBattleParticles(targetPos.x, targetPos.y, color, 20);
    }
  }

  spawnLunge(actorId, dx, dy) {
    this.lungeOffsets[actorId] = { dx, dy, life: 1.0 };
  }

  spawnDeathFade(targetId) {
    if (!(targetId in this.deathFades)) {
      this.deathFades[targetId] = 1.0;
    }
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

  // Per-element impact burst at a hit point. Each element gets its own
  // motion + shape so abilities read distinctly at the moment of contact.
  spawnImpactBurst(x, y, element) {
    const fx = ELEMENT_FX[element] || ELEMENT_FX.physical;
    const shape = fx.shape;
    const n = shape === 'slash' ? 8 : 14;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      let vx = Math.cos(a), vy = Math.sin(a), spd, grav, life, size;
      if (shape === 'ember')      { spd = 30 + Math.random()*50; vy = -Math.abs(vy)*0.6 - 0.4; grav = -40; life = 0.6; size = 2+Math.random()*2; }
      else if (shape === 'shard') { spd = 60 + Math.random()*90; grav = 260;                   life = 0.5; size = 2+Math.random()*2; }
      else if (shape === 'spark') { spd = 120 + Math.random()*140; grav = 0;                    life = 0.28; size = 1.5+Math.random()*1.5; }
      else if (shape === 'smoke') { spd = 14 + Math.random()*24; grav = -10;                    life = 0.8; size = 4+Math.random()*4; }
      else if (shape === 'star')  { spd = 40 + Math.random()*90; grav = 0;                      life = 0.6; size = 2+Math.random()*2; }
      else if (shape === 'rise')  { spd = 20 + Math.random()*30; vy = -Math.abs(vy)-0.5; grav = -30; life = 0.7; size = 2+Math.random()*2; }
      else /* slash */            { spd = 90 + Math.random()*120; grav = 40;                     life = 0.32; size = 2+Math.random()*2; }
      this.impactParticles.push({
        x, y, vx: vx * spd, vy: vy * spd, grav, life, maxLife: life, size, shape,
        color: fx.color,
      });
    }
  }

  playCrit() {
    // Two quick hit bursts an octave apart, plus a bright ring.
    this.game.audio.playTone(220, 0.08, 'square', 0.28);
    setTimeout(() => this.game.audio.playTone(660, 0.14, 'square', 0.24), 55);
    setTimeout(() => this.game.audio.playTone(990, 0.10, 'sine', 0.18), 110);
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

    // Battle particles decay and movement
    this.battleParticles = this.battleParticles.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt; // gravity
      p.life -= dt * 2.0;
      return p.life > 0;
    });

    // Victory particles
    this.victoryParticles = this.victoryParticles.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt; // gravity
      p.life -= dt * 0.8;
      return p.life > 0;
    });

    // Impact particles (per-element hit bursts)
    this.impactParticles = this.impactParticles.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.life -= dt;
      return p.life > 0;
    });

    // Crit flash decay
    if (this.critFlash > 0) this.critFlash = Math.max(0, this.critFlash - dt * 2);

    // Shake decay
    if (this.shakeX > 0.2) this.shakeX *= 0.75; else this.shakeX = 0;
    if (this.shakeY > 0.2) this.shakeY *= 0.75; else this.shakeY = 0;

    // Lunge decay (0.25s total: out on first half, back on second)
    Object.keys(this.lungeOffsets).forEach(id => {
      this.lungeOffsets[id].life -= dt * 4;
      if (this.lungeOffsets[id].life <= 0) delete this.lungeOffsets[id];
    });

    // Hit bounce decay (0.2s)
    Object.keys(this.hitBounces).forEach(id => {
      this.hitBounces[id].life -= dt * 5;
      if (this.hitBounces[id].life <= 0) delete this.hitBounces[id];
    });

    // Death fade (0.7s)
    Object.keys(this.deathFades).forEach(id => {
      this.deathFades[id] -= dt * 1.4;
      if (this.deathFades[id] <= 0) delete this.deathFades[id];
    });
  }

  // ─── FX Render ────────────────────────────────────────────
  renderFx(ctx) {
    // Crit flash — brief screen-wide gold tint (behind the numbers)
    if (this.critFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,238,150,${this.critFlash * 0.5})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }

    // Impact particles (under the numbers, over the portraits)
    this.impactParticles.forEach(p => {
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.shape === 'shard' || p.shape === 'spark' || p.shape === 'slash') {
        // draw as a short streak along its velocity
        const len = p.shape === 'spark' ? 10 : 7;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        ctx.lineWidth = p.size * 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
        ctx.stroke();
      } else if (p.shape === 'smoke') {
        ctx.globalAlpha = a * 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + (1 - a)), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'star') {
        ctx.globalAlpha = a * (0.5 + 0.5 * Math.sin(p.life * 30));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else { // ember / rise / dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

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

    // Battle particles
    this.battleParticles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

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
      this.game.audio.stopMusic();   // silence the battle drones under the jingle
      this.game.audio.playVictory();
      const canvas = document.getElementById('game-canvas');
      this.spawnVictoryBurst(canvas.width / 2, canvas.height * 0.35);
      this.setActionAnnounce('VICTORY!', '#f0d060');
      return true;
    }
    if (allPartyDead) {
      this.phase = 'DEFEAT';
      this.game.state = STATE.DEFEAT;
      this.game.audio.stopMusic();   // silence the battle drones under the jingle
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

    // Grant EXP and track level-ups (with stat gains, for the fanfare)
    this.levelUps = [];
    this.game.party.forEach(m => {
      if (m.currentHp <= 0) return;
      const ups = this.game.grantExp(m, totalExp);
      // One fanfare entry per member: their final level + summed gains.
      if (ups.length) {
        const gains = {};
        ups.forEach(u => Object.keys(u.gains).forEach(k => { gains[k] = (gains[k] || 0) + u.gains[k]; }));
        this.levelUps.push({ name: m.name, level: m.level, levels: ups.length, gains });
      }
    });
    if (this.levelUps.length) setTimeout(() => this.game.audio.playLevelUp(), 650);

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
    if (this.fadeIn > 0) this.fadeIn = Math.max(0, this.fadeIn - dt * 1.8);
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
    this.showHint = false; this.game._battleHintShown = true;
    const member = this.party[this.selectedMember];
    const targets = this.enemies.filter(e => e.currentHp > 0);
    const target = targets[this.selectedTarget];
    if (!target || !member) return;

    // Basic attack
    const dmg = this.calcDamage(member, target, { power: 1.0 });
    const crit = this._lastCrit;
    if (target.shieldAmount > 0) {
      const blocked = Math.min(target.shieldAmount, dmg);
      target.shieldAmount -= blocked;
    }
    const effectiveDmg = target.defending ? Math.floor(dmg * 0.5) : dmg;
    const prevHp = target.currentHp;
    target.currentHp = Math.max(0, target.currentHp - effectiveDmg);
    const defeated = target.currentHp <= 0 && prevHp > 0;
    this.addLog(`${crit ? 'Critical hit! ' : ''}${member.name} attacks ${target.name} for ${effectiveDmg}!${defeated ? ' Defeated!' : ''}`);
    if (crit) { this.playCrit(); } else { this.game.audio.playAttack(); }
    const shakeMag = crit ? 12 : 6;
    this.shakeX = shakeMag; this.shakeY = shakeMag * 0.5;
    const ePos = this.enemyPositions.find(p => p.id === (target.id || target.name)) || { x: 450, y: 200 };
    this.spawnImpactBurst(ePos.x, ePos.y, 'physical');
    this.spawnHitFlash(target.id || target.name, crit ? '#ffee00' : ELEMENT_FX.physical.color);
    this.spawnLunge(member.id || member.name, 30, -20); // party lunges up-right toward enemies
    if (defeated) this.spawnDeathFade(target.id || target.name);
    const numColor = defeated ? '#ff4040' : crit ? '#ffee00' : ELEMENT_FX.physical.num;
    this.spawnFloat(ePos.x, ePos.y - 40, crit ? `${effectiveDmg}!` : effectiveDmg, numColor, crit || defeated);
    if (crit) { this.setActionAnnounce('CRITICAL!', '#ffee00'); this.critFlash = 0.4; }
    else this.setActionAnnounce('ATTACK', '#ff8060');
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
    
    // Find member position for visual FX
    const mPos = this.partyPositions.find(p => p.id === (member.id || member.name)) || { x: 100, y: 450 };

    if (def.effect === 'heal_hp') {
      member.currentHp = Math.min(member.stats.hp, member.currentHp + def.value);
      this.addLog(`${member.name} uses ${def.name} and recovers ${def.value} HP!`);
      this.game.audio.playHeal();
      this.spawnFloat(mPos.x, mPos.y - 30, `+${def.value} HP`, '#50ff50');
      this.spawnBattleParticles(mPos.x, mPos.y, '#50ff50', 15);
      used = true;
    } else if (def.effect === 'restore_mp') {
      member.currentMp = Math.min(member.stats.mp, member.currentMp + def.value);
      this.addLog(`${member.name} uses ${def.name} and recovers ${def.value} MP!`);
      this.game.audio.playMagic();
      this.spawnFloat(mPos.x, mPos.y - 30, `+${def.value} MP`, '#00f0ff');
      this.spawnBattleParticles(mPos.x, mPos.y, '#00f0ff', 15);
      used = true;
    } else if (def.effect === 'shield') {
      member.shieldAmount = (member.shieldAmount || 0) + def.value;
      this.addLog(`${member.name} uses ${def.name}! Shield: ${member.shieldAmount}`);
      this.game.audio.playMagic();
      this.spawnFloat(mPos.x, mPos.y - 30, `SHIELD +${def.value}`, '#ffffaa');
      this.spawnBattleParticles(mPos.x, mPos.y, '#ffffaa', 15);
      used = true;
    } else if (def.effect === 'full_heal') {
      member.currentHp = member.stats.hp;
      member.currentMp = member.stats.mp;
      member.statusEffects = [];
      this.addLog(`${member.name} is fully restored!`);
      this.game.audio.playHeal();
      this.spawnFloat(mPos.x, mPos.y - 30, 'RESTORED', '#80ffcc');
      this.spawnBattleParticles(mPos.x, mPos.y, '#80ffcc', 20);
      used = true;
    } else if (def.effect === 'revive') {
      if (member.currentHp <= 0) {
        member.currentHp = Math.floor(member.stats.hp * (def.value / 100));
        this.addLog(`${member.name} is revived with ${member.currentHp} HP!`);
        this.game.audio.playHeal();
        this.spawnFloat(mPos.x, mPos.y - 30, 'REVIVED', '#ffffff');
        this.spawnBattleParticles(mPos.x, mPos.y, ['#ffffff', '#ffd700'], 20);
        used = true;
      } else {
        this.addLog(`${member.name} is not KO'd!`);
        this.game.audio.playCancel();
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
    this.game.audio.playExploreMusic();
    if (this.onWin) this.onWin();
  }

  endDefeat() {
    this.game.battle = null;
    this.game.audio.playExploreMusic();
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
      const eid = e.id || e.name;

      // Compute animation offsets
      const lo = this.lungeOffsets[eid];
      let lox = 0, loy = 0;
      if (lo) {
        const t = 1 - lo.life; // 0→1 over anim
        const ping = t < 0.5 ? t * 2 : (1 - t) * 2; // ping-pong 0→1→0
        lox = lo.dx * ping;
        loy = lo.dy * ping;
      }

      const hb = this.hitBounces[eid];
      let hbx = 0, hby = 0;
      if (hb) { hbx = hb.dx * hb.life; hby = hb.dy * hb.life; }

      // Death fade alpha
      const fadeAlpha = eid in this.deathFades ? this.deathFades[eid] : (isDead ? 0 : 1);
      const dropY = isDead && !(eid in this.deathFades) ? 0 : (1 - fadeAlpha) * 30;

      if (portrait) {
        ctx.save();
        if (!isDead && (shakeOffX !== 0 || shakeOffY !== 0)) {
          ctx.translate(shakeOffX, shakeOffY);
        }
        ctx.translate(lox + hbx, loy + hby + dropY);
        ctx.globalAlpha = isDead ? Math.max(0, fadeAlpha) : 1;
        ctx.drawImage(portrait, ex - es/2, ey - es/2, es, es);

        // Hit flash — white overlay composite
        if (flashIntensity > 0) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `rgba(255,200,200,${flashIntensity * 0.6})`;
          ctx.fillRect(ex - es/2, ey - es/2, es, es);
          ctx.globalCompositeOperation = 'source-over';

          // Slash marks
          ctx.strokeStyle = `rgba(255, 50, 50, ${flashIntensity})`;
          ctx.lineWidth = 4 * flashIntensity;
          ctx.beginPath();
          ctx.moveTo(ex - es/2 + 20, ey - es/2 + 20);
          ctx.lineTo(ex + es/2 - 20, ey + es/2 - 20);
          if (flashIntensity > 0.5) {
            ctx.moveTo(ex + es/2 - 20, ey - es/2 + 20);
            ctx.lineTo(ex - es/2 + 20, ey + es/2 - 20);
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      if (isDead && !(eid in this.deathFades)) return; // skip UI for fully-settled dead enemies
      if (isDead) return; // still fading — skip HP bar etc

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
      // With 5-6 recruits, compact the row into the left 62% so the
      // action menu column (right side) stays clear of the last cards.
      const usableW = this.party.length >= 5 ? W * 0.62 : W;
      const px = 20 + i * (usableW / this.party.length - 10);
      const py = partyY;
      const isCurrent = i === this.selectedMember && this.phase === 'PLAYER_TURN';

      // Store position for FX (center of portrait)
      const pSize = 68;
      this.partyPositions.push({ id: m.id || m.name, x: px + pSize / 2, y: py + pSize / 2 });

      // Party member animation offsets
      const mid = m.id || m.name;
      const mlo = this.lungeOffsets[mid];
      let mlox = 0, mloy = 0;
      if (mlo) {
        const t = 1 - mlo.life;
        const ping = t < 0.5 ? t * 2 : (1 - t) * 2;
        mlox = mlo.dx * ping;
        mloy = mlo.dy * ping;
      }
      const mhb = this.hitBounces[mid];
      let mhbx = 0, mhby = 0;
      if (mhb) { mhbx = -mhb.dx * mhb.life; mhby = mhb.dy * mhb.life; } // bounce right (away from enemies)

      const portrait = this.game.images[m.portrait];
      if (portrait) {
        ctx.save();
        ctx.translate(mlox + mhbx, mloy + mhby);
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

        // KO stamp overlay
        if (m.currentHp <= 0) {
          ctx.save();
          ctx.translate(mlox + mhbx, mloy + mhby);
          ctx.fillStyle = 'rgba(100, 0, 0, 0.55)';
          ctx.fillRect(px, py, pSize, pSize);
          ctx.strokeStyle = '#ff3333';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 4, py + 4, pSize - 8, pSize - 8);
          ctx.fillStyle = '#ffb3b3';
          ctx.font = 'bold 16px Cinzel, serif';
          ctx.textAlign = 'center';
          ctx.fillText('KO', px + pSize/2, py + pSize/2 + 6);
          ctx.restore();
        }

        // Low HP warning border
        const hpRatio = m.currentHp / m.stats.hp;
        if (hpRatio > 0 && hpRatio < 0.3) {
          ctx.save();
          ctx.translate(mlox + mhbx, mloy + mhby);
          const pulse = 0.4 + Math.sin(this.animTimer * 10) * 0.4;
          ctx.strokeStyle = `rgba(255, 0, 60, ${pulse})`;
          ctx.lineWidth = 3;
          ctx.strokeRect(px - 1, py - 1, pSize + 2, pSize + 2);
          ctx.restore();
        }

        // Flash and slash overlays for player characters
        const flashIntensity = this.hitFlashes[mid] || 0;
        if (flashIntensity > 0) {
          ctx.save();
          ctx.translate(mlox + mhbx, mloy + mhby);
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `rgba(255,200,200,${flashIntensity * 0.6})`;
          ctx.fillRect(px, py, pSize, pSize);
          ctx.globalCompositeOperation = 'source-over';

          // Slash
          ctx.strokeStyle = `rgba(255, 50, 50, ${flashIntensity})`;
          ctx.lineWidth = 3 * flashIntensity;
          ctx.beginPath();
          ctx.moveTo(px + 10, py + 10);
          ctx.lineTo(px + pSize - 10, py + pSize - 10);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Highlight current (when active and not KO'd)
      if (isCurrent && m.currentHp > 0) {
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
      const abils = member?.abilities || [];
      const menuH = Math.max(100, abils.length * 32 + 52);
      const menuX = W * 0.55, menuY = partyY - (menuH - 140);
      drawRoundedRect(ctx, menuX - 10, menuY - 8, 300, menuH, 8, 'rgba(5,0,25,0.95)', 'rgba(120,60,200,0.7)', 2);
      ctx.fillStyle = '#e0c0ff';
      ctx.font = 'bold 13px Cinzel, serif';
      ctx.textAlign = 'left';
      ctx.fillText('ABILITIES', menuX, menuY + 10);
      ctx.fillStyle = '#4080c0';
      ctx.font = '11px monospace';
      ctx.fillText(`MP: ${member?.currentMp ?? 0}/${member?.stats?.mp ?? 0}`, menuX + 150, menuY + 10);
      abils.forEach((abilId, i) => {
        const def = this.game.getAbilityDef(abilId);
        const cost = def?.mp_cost || 0;
        const canAfford = (member?.currentMp ?? 0) >= cost;
        const ay = menuY + 34 + i * 30;
        const sel = i === this.selectedAbility;
        if (sel) { ctx.fillStyle = 'rgba(100,40,160,0.5)'; ctx.fillRect(menuX - 5, ay - 16, 295, sel && def?.description ? 40 : 24); }
        ctx.fillStyle = !canAfford ? '#604050' : sel ? '#f0c060' : '#c090e0';
        ctx.font = `${sel ? 'bold' : ''} 12px Georgia, serif`;
        ctx.fillText(def?.name || abilId, menuX, ay);
        ctx.fillStyle = !canAfford ? '#804060' : cost > 0 ? '#6090d0' : '#505060';
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${cost}MP`, menuX + 285, ay);
        ctx.textAlign = 'left';
        if (sel && def?.description) {
          ctx.fillStyle = canAfford ? '#9060b0' : '#603040';
          ctx.font = '10px Georgia';
          ctx.fillText(def.description, menuX, ay + 14);
        }
        if (!canAfford && sel) {
          ctx.fillStyle = '#c04060';
          ctx.font = 'bold 9px monospace';
          ctx.fillText('NOT ENOUGH MP', menuX + 160, ay);
        }
      });
      ctx.textAlign = 'left';
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

    // Battle log — shows last 5 entries, newest at bottom, colour-coded
    const logMaxLines = 5, logLineH = 19;
    const visibleLogs = this.battleLog.slice(-logMaxLines);
    const logPanelH = logMaxLines * logLineH + 10;
    const logX = W * 0.02, logY = H * 0.53 - logPanelH;
    drawRoundedRect(ctx, logX - 6, logY - 4, 330, logPanelH, 5, 'rgba(0,0,0,0.55)', 'rgba(80,40,120,0.35)', 1);
    visibleLogs.forEach((log, i) => {
      const isNewest = i === visibleLogs.length - 1;
      const age = visibleLogs.length - 1 - i;
      const alpha = isNewest ? 1.0 : Math.max(0.3, 0.85 - age * 0.18);
      // Colour by content
      let color = `rgba(200,180,240,${alpha})`;
      if (log.text.includes('Defeated')) color = `rgba(255,100,100,${alpha})`;
      else if (log.text.includes('recovers') || log.text.includes('heal') || log.text.includes('restored')) color = `rgba(100,240,140,${alpha})`;
      else if (log.text.includes('evades') || log.text.includes('MISS')) color = `rgba(180,180,180,${alpha})`;
      else if (log.text.includes('⚔') || log.text.includes('begins')) color = `rgba(240,200,100,${alpha})`;
      else if (log.text.includes('Critical') || log.text.includes('✨')) color = `rgba(255,240,80,${alpha})`;
      else if (log.text.includes('burn') || log.text.includes('poison')) color = `rgba(255,140,60,${alpha})`;
      ctx.fillStyle = color;
      ctx.font = isNewest ? 'bold 11px Georgia, serif' : '11px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText(log.text.length > 46 ? log.text.slice(0, 44) + '…' : log.text, logX, logY + i * logLineH + 14);
    });

    // Turn order strip — top-right corner showing who acts next
    {
      const upNext = [];
      const remaining = this.turnOrder.filter(c => c.currentHp > 0 || (c.isPlayer ? this.party.find(m=>m.id===c.id)?.currentHp > 0 : this.enemies.find(e=>(e.id||e.name)===(c.id||c.name))?.currentHp > 0));
      for (let i = 1; i <= Math.min(3, remaining.length); i++) {
        const c = this.turnOrder[(this.currentTurn + i) % this.turnOrder.length];
        if (c) upNext.push(c);
      }
      const stripX = W - 130, stripY = 8;
      drawRoundedRect(ctx, stripX, stripY, 122, 20 + upNext.length * 20, 5, 'rgba(0,0,10,0.7)', 'rgba(80,40,120,0.5)', 1);
      ctx.fillStyle = 'rgba(140,100,200,0.8)';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('NEXT UP:', stripX + 6, stripY + 13);
      upNext.forEach((c, i) => {
        const name = c.isPlayer ? (this.party.find(m=>m.id===c.id)?.name||c.name||'?').split(' ')[0]
                                 : (this.enemies.find(e=>(e.id||e.name)===(c.id||c.name))?.name||c.name||'?').split(' ')[0];
        ctx.fillStyle = c.isPlayer ? 'rgba(160,220,255,0.85)' : 'rgba(255,160,140,0.85)';
        ctx.font = '9px monospace';
        ctx.fillText(`${c.isPlayer ? '▸' : '▸'} ${name}`, stripX + 6, stripY + 13 + (i+1)*18);
      });
    }

    // Enemy turn indicator — telegraphs the wound-up move when known
    if (this.phase === 'ENEMY_TURN') {
      const pulse = 0.5 + Math.sin(this.animTimer * 8) * 0.2;
      const intent = this.enemyIntent;
      const actor = intent && this.enemies.find(e => (e.id || e.name) === intent.id);
      ctx.fillStyle = `rgba(0,0,0,${pulse * 0.6})`;
      ctx.fillRect(0, H * 0.42, W, 36);
      ctx.textAlign = 'center';
      ctx.shadowBlur = 10;
      if (intent && actor) {
        const guard = intent.type === 'guard';
        ctx.fillStyle = guard ? '#80d0ff' : '#ffcf70';
        ctx.shadowColor = guard ? 'rgba(100,180,255,0.5)' : 'rgba(255,180,80,0.5)';
        ctx.font = 'bold 17px Cinzel, serif';
        ctx.fillText(guard ? `${actor.name} braces to guard…` : `${actor.name} prepares ${intent.label}!`, W/2, H * 0.42 + 24);
        ctx.shadowBlur = 0;
        // Pulsing "!" above the acting enemy
        const pos = this.enemyPositions.find(p => p.id === intent.id);
        if (pos && !guard) {
          const bob = Math.sin(this.animTimer * 8) * 4;
          ctx.fillStyle = `rgba(255,210,90,${0.6 + pulse * 0.4})`;
          ctx.font = 'bold 28px Georgia';
          ctx.fillText('!', pos.x, pos.y - 90 + bob);
        }
      } else {
        ctx.fillStyle = '#ff8080';
        ctx.shadowColor = 'rgba(255,80,80,0.5)';
        ctx.font = 'bold 18px Cinzel, serif';
        ctx.fillText('Enemy Turn...', W/2, H * 0.42 + 24);
        ctx.shadowBlur = 0;
      }
    }

    // ── FX layer (drawn last, above everything) ──────────────
    this.renderFx(ctx);

    // ── Fade-in overlay ───────────────────────────────────────
    if (this.fadeIn > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.fadeIn})`;
      ctx.fillRect(0, 0, W, H);
    }

    // ── First-battle controls hint ────────────────────────────
    if (this.showHint && this.phase === 'PLAYER_TURN' && this.fadeIn <= 0) {
      const hx = W/2 - 220, hy = H * 0.56;
      drawRoundedRect(ctx, hx, hy, 440, 80, 8, 'rgba(0,0,20,0.88)', 'rgba(200,160,80,0.6)', 1);
      ctx.fillStyle = '#f0d080';
      ctx.font = 'bold 11px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.fillText('BATTLE CONTROLS', W/2, hy + 16);
      ctx.fillStyle = '#c0a0e0';
      ctx.font = '11px monospace';
      ctx.fillText('↑↓ Select action    Enter/Z Confirm    X/Esc Cancel', W/2, hy + 36);
      ctx.fillText('Click enemy portrait to target    Click action to select', W/2, hy + 52);
      ctx.fillStyle = 'rgba(200,160,80,0.5)';
      ctx.font = '10px Georgia';
      ctx.fillText('(This message disappears when you act)', W/2, hy + 70);
    }
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

    // Grow the box to fit level-up stat breakdowns.
    const luCount = this.levelUps ? this.levelUps.length : 0;
    const boxW = 500, boxH = 360 + luCount * 40;
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
      ctx.fillText(`EXP: +${this.rewards.exp}`, W/2, by + 104);
      ctx.fillStyle = '#f0d060';
      ctx.fillText(`Gold: +${this.rewards.gold}`, W/2, by + 130);
      if (this.rewards.items.length) {
        const names = this.rewards.items.map(id => this.game.getItemDef(id)?.name || id).join(', ');
        ctx.fillStyle = '#80ffcc';
        ctx.fillText(`Item: ${names}`, W/2, by + 156);
      }

      // Level ups — name + concrete stat gains
      let luy = by + 194;
      this.levelUps.forEach((lu) => {
        ctx.fillStyle = '#f0c060';
        ctx.font = 'bold 15px Cinzel, serif';
        const lvlText = lu.levels > 1 ? `✨ ${lu.name} reached Level ${lu.level}! (+${lu.levels})` : `✨ ${lu.name} reached Level ${lu.level}!`;
        ctx.fillText(lvlText, W/2, luy);
        const g = lu.gains || {};
        const parts = [['HP','hp'],['MP','mp'],['ATK','atk'],['DEF','def'],['SPD','spd'],['LCK','lck']]
          .filter(([,k]) => g[k]).map(([lbl,k]) => `+${g[k]} ${lbl}`);
        ctx.fillStyle = '#9fd0a0';
        ctx.font = '11px monospace';
        ctx.fillText(parts.join('   '), W/2, luy + 17);
        luy += 40;
      });

      // Party state — HP + a mini EXP bar toward the next level
      this.party.forEach((m, i) => {
        const px = bx + 40 + i * 150;
        const py = by + boxH - 96;
        const portrait = this.game.images[m.portrait];
        if (portrait) { ctx.drawImage(portrait, px, py, 50, 50); }
        ctx.fillStyle = m.currentHp <= 0 ? '#606060' : '#a0ff80';
        ctx.font = '11px Georgia';
        ctx.textAlign = 'left';
        ctx.fillText(`${m.name.split(' ')[0]}: ${m.currentHp}/${m.stats.hp} HP`, px, py + 64);
        // EXP bar
        const bw = 110, expPct = Math.max(0, Math.min(1, m.exp / m.expToNext));
        ctx.fillStyle = 'rgba(40,30,16,0.9)';
        ctx.fillRect(px, py + 72, bw, 5);
        ctx.fillStyle = '#f0c050';
        ctx.fillRect(px, py + 72, bw * expPct, 5);
        ctx.fillStyle = 'rgba(200,170,110,0.8)';
        ctx.font = '9px monospace';
        ctx.fillText(`Lv.${m.level}  EXP ${m.exp}/${m.expToNext}`, px, py + 88);
      });
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(180,140,255,${0.5 + this.game.titleGlow * 0.5})`;
    ctx.font = '14px Georgia, serif';
    ctx.fillText('[ Press ENTER to continue ]', W/2, by + boxH - 18);
  }

  renderDefeat(ctx, canvas) {
    const W = canvas.width, H = canvas.height;
    // Dark red gradient bg
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#140000');
    grad.addColorStop(1, '#060010');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255,50,50,0.8)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#c04040';
    ctx.font = `bold 40px 'Cinzel', serif`;
    ctx.fillText('✦  DEFEATED  ✦', W/2, H * 0.18);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#806060';
    ctx.font = '15px Georgia, serif';
    ctx.fillText('The ward dims… but hope remains.', W/2, H * 0.28);

    // Party portraits row
    const pSize = 72;
    const startX = W/2 - (this.party.length * (pSize + 16))/2 + pSize/2;
    this.party.forEach((m, i) => {
      const px = startX + i * (pSize + 16);
      const py = H * 0.38;
      const portrait = this.game.images[m.portrait];
      const alive = m.currentHp > 0;
      ctx.save();
      ctx.globalAlpha = alive ? 0.9 : 0.3;
      if (!alive) { ctx.filter = 'grayscale(100%)'; }
      if (portrait) {
        ctx.beginPath();
        ctx.roundRect(px - pSize/2, py, pSize, pSize, 8);
        ctx.clip();
        ctx.drawImage(portrait, px - pSize/2, py, pSize, pSize);
      }
      ctx.restore();
      ctx.strokeStyle = alive ? '#804040' : '#303030';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - pSize/2, py, pSize, pSize);
      ctx.fillStyle = alive ? '#c08080' : '#505050';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(alive ? `${m.currentHp}HP` : 'KO', px, py + pSize + 14);
      ctx.fillText(m.name.split(' ')[0], px, py + pSize + 26);
    });

    // Options notice
    const boxW = 400, boxH = 52;
    drawRoundedRect(ctx, W/2 - boxW/2, H * 0.66, boxW, boxH, 8, 'rgba(40,10,10,0.8)', 'rgba(140,40,40,0.6)', 1);
    ctx.fillStyle = '#d08080';
    ctx.font = 'bold 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('Retry restores the party as it stood before the fight.', W/2, H * 0.66 + 21);
    ctx.fillStyle = '#906060';
    ctx.font = '11px monospace';
    ctx.fillText('Waking revives the fallen at half HP.', W/2, H * 0.66 + 40);

    // Prompt
    const pulse = 0.5 + Math.sin(this.animTimer * 3) * 0.4;
    ctx.fillStyle = `rgba(200,100,100,${pulse})`;
    ctx.font = 'bold 14px Cinzel, serif';
    ctx.fillText('[ ENTER — Retry Battle    ·    ESC — Wake at the Grounds ]', W/2, H * 0.86);
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
      // Overwrite-save confirmation intercepts clicks while open
      const cd = game.ui.confirmDialog;
      if (cd) {
        const inRect = (r) => r && cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h;
        if (inRect(cd.yesRect)) game.ui.resolveConfirmDialog(true);
        else if (inRect(cd.noRect)) game.ui.resolveConfirmDialog(false);
        return;
      }
      const menuY = [H * 0.48, H * 0.56, H * 0.64];
      let hitMenu = false;
      menuY.forEach((my, i) => {
        if (Math.abs(cy - my) < 20) {
          game.ui.titleSelection = i;
          game.ui.confirmTitleSelection();
          hitMenu = true;
        }
      });
      // "Replay the Prologue" hint line
      if (!hitMenu && Math.abs(cy - H * 0.92) < 12) {
        game.startPrologueReplay();
        game.audio.playConfirm();
      }
    }

    if (game.state === STATE.DIALOGUE || game.state === STATE.CUTSCENE) {
      game.dialogue?.advance();
    }

    if (game.state === STATE.PROLOGUE && game.prologue) {
      game.prologue.onClick(cx, cy);
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
      game.dismissQuestComplete();
    }

    if (game.state === STATE.EXPLORE) {
      // Touch/click to move (optional)
    }
  });
}

// ─── Prologue scrub input (wheel + touch drag) ───────────────
// Scroll is the prologue's scrubber: wheel and touch-drag deltas drive the
// flight camera (scroll-world technique — scroll only drives time).
function setupPrologueScrollInput(game, canvas) {
  canvas.addEventListener('wheel', (e) => {
    if (game.state !== STATE.PROLOGUE || !game.prologue) return;
    e.preventDefault();
    // Normalize deltaMode: line-mode (1) and page-mode (2) wheels report tiny
    // deltas that would make the scrub feel frozen without conversion.
    const px = e.deltaMode === 1 ? e.deltaY * 33
             : e.deltaMode === 2 ? e.deltaY * canvas.height
             : e.deltaY;
    game.prologue.onWheel(px);
  }, { passive: false });

  // Track the scrubbing finger by identifier — e.touches[0] is the first
  // touch anywhere on the page (e.g. a thumb resting on the D-pad overlay),
  // not necessarily the finger dragging the canvas.
  let scrubTouchId = null, lastTouchY = null;
  canvas.addEventListener('touchstart', (e) => {
    if (game.state !== STATE.PROLOGUE || scrubTouchId !== null) return;
    const t = e.changedTouches[0];
    scrubTouchId = t.identifier;
    lastTouchY = t.clientY;
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (game.state !== STATE.PROLOGUE || !game.prologue || scrubTouchId === null) return;
    let t = null;
    for (const ct of e.changedTouches) if (ct.identifier === scrubTouchId) { t = ct; break; }
    if (!t) return;
    e.preventDefault();
    game.prologue.onDrag(lastTouchY - t.clientY); // drag up = fly forward
    lastTouchY = t.clientY;
  }, { passive: false });
  const endScrub = (e) => {
    for (const ct of e.changedTouches) {
      if (ct.identifier === scrubTouchId) { scrubTouchId = null; lastTouchY = null; }
    }
  };
  canvas.addEventListener('touchend', endScrub, { passive: true });
  canvas.addEventListener('touchcancel', endScrub, { passive: true });
}

// ─── Touch controls (mobile) ─────────────────────────────────
// Virtual D-pad + Confirm/Back buttons that feed the same InputManager
// paths as the keyboard: D-pad holds set input.keys (movement) and fire
// onKey once (menu navigation); action buttons are tap-only synthetic
// key presses. Shown only when a touch screen is present.
function setupTouchControls(game) {
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!isTouch) return;
  document.body.classList.add('touch-mode');

  const press = (code) => {
    game.audio.initContext();
    game.input.onKey({ code });
    game.input.keys[code] = false; // tap semantics: never leave a stuck key
  };

  document.querySelectorAll('#touch-dpad .touch-btn[data-code]').forEach(btn => {
    const code = btn.dataset.code;
    const down = (e) => {
      e.preventDefault();
      btn.classList.add('held');
      game.audio.initContext();
      game.input.onKey({ code });   // single fire for menus
      game.input.keys[code] = true; // held for explore movement
    };
    const up = (e) => {
      e.preventDefault();
      btn.classList.remove('held');
      game.input.keys[code] = false;
    };
    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('touchend', up, { passive: false });
    btn.addEventListener('touchcancel', up, { passive: false });
  });

  document.querySelectorAll('#touch-actions .touch-btn[data-tap]').forEach(btn => {
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      press(btn.dataset.tap);
    }, { passive: false });
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
  setupTouchControls(game);
  setupPrologueScrollInput(game, canvas);

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
