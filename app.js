const { ipcRenderer } = require('electron');

let state = { savesPath: null, worlds: [], selectedWorld: null, playerData: null };
const $ = id => document.getElementById(id);

// === SCREENS ===
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('screen-' + name).classList.add('active');
}

// === WINDOW CONTROLS WITH ANIMATIONS ===
$('btn-minimize').onclick = () => {
  const app = document.getElementById('app');
  app.style.transition = 'transform 0.2s cubic-bezier(0.4,0,1,1), opacity 0.2s ease';
  app.style.transform = 'scale(0.95) translateY(8px)';
  app.style.opacity = '0';
  setTimeout(() => {
    app.style.transition = '';
    app.style.transform = '';
    app.style.opacity = '';
    ipcRenderer.send('window-minimize');
  }, 180);
};

let isMaximized = false;
$('btn-maximize').onclick = () => {
  isMaximized = !isMaximized;
  ipcRenderer.send('window-maximize');
};

$('btn-close').onclick = () => {
  const app = document.getElementById('app');
  app.style.transition = 'transform 0.18s cubic-bezier(0.4,0,1,1), opacity 0.18s ease';
  app.style.transform = 'scale(0.96)';
  app.style.opacity = '0';
  setTimeout(() => ipcRenderer.send('window-close'), 160);
};

$('btn-decline').onclick = () => {
  const app = document.getElementById('app');
  app.style.transition = 'transform 0.18s cubic-bezier(0.4,0,1,1), opacity 0.18s ease';
  app.style.transform = 'scale(0.96)';
  app.style.opacity = '0';
  setTimeout(() => ipcRenderer.send('window-close'), 160);
};

// === CUSTOM CONFIRM ===
function showConfirm(text, onOk, { title = t('confirm_title_default'), danger = true, icon = '⚠️' } = {}) {
  const modal = $('confirm-modal');
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-icon').textContent = icon;
  $('confirm-ok').className = 'confirm-btn-ok ' + (danger ? 'danger' : 'primary');
  modal.classList.remove('hidden');
  modal.offsetHeight;
  modal.classList.add('open');

  const ok = $('confirm-ok');
  const cancel = $('confirm-cancel');

  function cleanup() {
    modal.classList.add('closing');
    modal.classList.remove('open');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('closing'); }, 280);
    ok.onclick = null; cancel.onclick = null;
  }

  ok.onclick = () => { cleanup(); onOk(); };
  cancel.onclick = cleanup;
}

// === AGREEMENT ===
$('btn-agree').onclick = () => {
  $('btn-agree').style.transform = 'scale(0.96)';
  setTimeout(() => showScreen('launcher'), 180);
};

// === LAUNCHER ===
$('btn-tlauncher').onclick = async () => {
  showLoading(t('searching_instances'));
  const instances = await ipcRenderer.invoke('find-all-instances');
  hideLoading();

  if (!instances || instances.length === 0) {
    showLncError(t('no_instances_found'));
    return;
  }

  if (instances.length === 1) {
    // Only one - go straight in
    await loadSaves(instances[0].saves);
    showScreen('main');
    return;
  }

  // Multiple - show picker
  showInstancePicker(instances);
};

$('btn-other-launcher').onclick = async () => {
  const p = await ipcRenderer.invoke('select-saves-folder');
  if (p) { await loadSaves(p); showScreen('main'); }
};

function showInstancePicker(instances) {
  $('lnc-initial').classList.add('hidden');
  $('lnc-picker').classList.remove('hidden');

  // Group by launcher
  const byLauncher = {};
  instances.forEach(inst => {
    if (!byLauncher[inst.launcher]) byLauncher[inst.launcher] = [];
    byLauncher[inst.launcher].push(inst);
  });

  const launcherNames = Object.keys(byLauncher);
  const dotClass = {
    'Prism Launcher': 'lnc-launcher-dot-prism',
    'MultiMC':        'lnc-launcher-dot-mmc',
    'TLauncher':      'lnc-launcher-dot-tl',
    'Minecraft':      'lnc-launcher-dot-mc',
  };

  // Render launcher list (left column)
  const launcherList = $('lnc-launchers');
  launcherList.innerHTML = '';
  launcherNames.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.className = 'lnc-launcher-btn';
    const dot = dotClass[name] || 'lnc-launcher-dot-mc';
    btn.innerHTML = `<span class="lnc-launcher-dot ${dot}"></span><span class="lnc-launcher-btn-name">${esc(name)}</span><span class="lnc-launcher-btn-count">${byLauncher[name].length}</span>`;
    btn.onclick = () => {
      document.querySelectorAll('.lnc-launcher-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderInstances(byLauncher[name], name);
    };
    launcherList.appendChild(btn);
    // Auto-select first launcher
    if (i === 0) { btn.classList.add('active'); renderInstances(byLauncher[name], name); }
  });
}

function renderInstances(instances, launcherName) {
  const container = $('lnc-instances');
  const titleEl   = $('lnc-col-right-title');

  // Animate title
  titleEl.style.transition = 'none';
  titleEl.style.opacity = '0';
  titleEl.style.transform = 'translateY(-6px)';
  setTimeout(() => {
    titleEl.textContent = launcherName;
    titleEl.style.transition = 'opacity 0.22s ease, transform 0.28s var(--spring)';
    titleEl.style.opacity = '1';
    titleEl.style.transform = 'translateY(0)';
  }, 80);

  // Fade out old list (opacity only - avoids double-motion clipping with the per-item entrance animation)
  container.style.transition = 'opacity 0.12s ease';
  container.style.opacity = '0';

  setTimeout(() => {
    container.innerHTML = '';

    instances.forEach((inst, i) => {
      const el = document.createElement('div');
      el.className = 'lnc-inst-item' + (inst.supported === false ? ' lnc-inst-unsupported' : '');
      el.style.animationDelay = `${Math.min(i * 45, 360)}ms`;

      let verBadge = '';
      if (inst.version && inst.version !== 'неизвестно') {
        if (inst.supported === false) {
          verBadge = `<span class="lnc-ver-badge lnc-ver-unsupported">${esc(inst.version)} - ${t('unsupported')}</span>`;
        } else if (inst.supported === true) {
          verBadge = `<span class="lnc-ver-badge lnc-ver-ok">${esc(inst.version)}</span>`;
        } else {
          verBadge = `<span class="lnc-ver-badge lnc-ver-unknown">${esc(inst.version)}</span>`;
        }
      }

      const shortPath = inst.saves.length > 42 ? '...' + inst.saves.slice(-39) : inst.saves;
      el.innerHTML = `
        <div class="lnc-inst-info">
          <div class="lnc-inst-top">
            <span class="lnc-inst-name">${esc(inst.name)}</span>
            ${verBadge}
          </div>
          <div class="lnc-inst-path">${esc(shortPath)}</div>
        </div>
        <svg class="lnc-inst-arrow" width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5h7M5.5 2l3.5 3.5L5.5 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      `;

      el.onclick = async () => {
        if (inst.supported === false && !el.dataset.warned) {
          el.dataset.warned = '1';
          const old = el.parentNode.querySelector('.lnc-inst-warn-row');
          if (old) old.remove();
          const warn = document.createElement('div');
          warn.className = 'lnc-inst-warn-row';
          warn.textContent = t('version_unsupported_warn');
          el.after(warn);
          return;
        }
        await loadSaves(inst.saves);
        showScreen('main');
      };
      container.appendChild(el);
    });

    // Fade in new list; per-item stagger animation (instIn) handles the motion
    container.offsetHeight; // force reflow
    container.style.transition = 'opacity 0.2s ease';
    container.style.opacity = '1';
  }, 130);
}


$('btn-manual-picker').onclick = async () => {
  const p = await ipcRenderer.invoke('select-saves-folder');
  if (p) { await loadSaves(p); showScreen('main'); }
};

function showLncError(msg) {
  const el = $('lnc-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// === LOAD SAVES ===
async function loadSaves(p) {
  state.savesPath = p;
  const label = $('saves-path-label');
  label.textContent = p.length > 28 ? '...' + p.slice(-25) : p;
  state.worlds = await ipcRenderer.invoke('get-worlds', p);
  animatedWorldPaths.clear(); // a genuinely new saves folder should get the full stagger-in again
  renderWorlds();
}

// Tracks which world items have already played their enter animation once,
// so re-rendering the list (favorite toggle, search, etc.) doesn't replay
// the entrance animation for items that are already on screen.
const animatedWorldPaths = new Set();

// === RENDER WORLDS ===
function renderWorlds() {
  const list = $('worlds-list');
  if (!state.worlds || !state.worlds.length) {
    list.innerHTML = `<div class="worlds-empty">${t('no_worlds_found')}</div>`;
    return;
  }
  const searchEl = $('worlds-search');
  const query = searchEl ? searchEl.value.trim().toLowerCase() : '';
  let worlds = state.worlds.slice();
  if (query) worlds = worlds.filter(w => w.name.toLowerCase().includes(query));
  worlds.sort((a, b) => (favoriteWorlds.has(b.path) ? 1 : 0) - (favoriteWorlds.has(a.path) ? 1 : 0));
  if (!worlds.length) {
    list.innerHTML = `<div class="worlds-empty">${t('no_worlds_found')}</div>`;
    return;
  }
  list.innerHTML = '';
  worlds.forEach((w, i) => {
    const el = document.createElement('div');
    const isFav = favoriteWorlds.has(w.path);
    const alreadyAnimated = animatedWorldPaths.has(w.path);
    el.className = 'world-item' + (w.hardcore ? ' hardcore' : '') + (isFav ? ' favorite' : '') + (alreadyAnimated ? ' no-enter-anim' : '');
    if (!alreadyAnimated) el.style.animationDelay = `${Math.min(i * 40, 360)}ms`;
    animatedWorldPaths.add(w.path);
    el.dataset.path = w.path;
    let badges = '';
    if (w.hardcore)    badges += '<span class="badge badge-hc">Hardcore</span>';
    if (w.gameType===1) badges += '<span class="badge badge-cr">Creative</span>';
    if (w.gameType===2) badges += '<span class="badge badge-adv">Adventure</span>';
    el.innerHTML = `<button class="wi-star${isFav ? ' active' : ''}" title="${t('favorite')}">${isFav ? '★' : '☆'}</button><div class="wi-name">${esc(w.name)}</div><div class="wi-badges">${badges}</div>`;
    el.querySelector('.wi-star').onclick = (e) => {
      e.stopPropagation();
      toggleFavorite(w.path);
      renderWorlds();
    };
    el.onclick = () => selectWorld(w, el);
    list.appendChild(el);
  });
}

// === SELECT WORLD ===
let worldSwitchToken = 0; // guards against stale renders/animations piling up when clicking through worlds quickly

// Small in-memory cache of already-fetched world data, keyed by world path.
// Lets us re-open a world you already had open instantly, with no loading
// flash, instead of re-reading its files from disk every single click.
// Capped to a handful of worlds so it never grows into real memory usage,
// even if you click through many large worlds in one session.
const worldDataCache = new Map();
const WORLD_CACHE_LIMIT = 5;
function cacheWorldData(path, data) {
  worldDataCache.delete(path); // re-insert so it becomes the most-recently-used
  worldDataCache.set(path, data);
  while (worldDataCache.size > WORLD_CACHE_LIMIT) {
    worldDataCache.delete(worldDataCache.keys().next().value); // evict oldest
  }
}
function applyWorldData(world, d) {
  state.playerData = d.playerData;
  state.cachedPlayers = d.players;
  renderPanel(world, state.playerData);
  renderInventory(d.inventory);
  renderStats(d.stats);
  renderBackups(d.backups, world.path);
}
async function fetchWorldData(world) {
  const [playerData, players, inventory, stats, backups] = await Promise.all([
    ipcRenderer.invoke('get-player-data', world.path),
    ipcRenderer.invoke('get-players', world.path).catch(() => []),
    ipcRenderer.invoke('get-inventory', world.path).catch(() => []),
    ipcRenderer.invoke('get-stats', world.path).catch(() => null),
    ipcRenderer.invoke('get-backups', world.path).catch(() => [])
  ]);
  return { playerData, players, inventory, stats, backups };
}
async function selectWorld(world, el) {
  document.querySelectorAll('.world-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  state.selectedWorld = world;
  selectedPlayer = null;
  playerSwitchToken++;
  const myToken = ++worldSwitchToken;

  const cached = worldDataCache.get(world.path);
  if (cached) {
    // Already have this world's data - show it immediately, no loading flash,
    // then quietly refresh it in the background in case anything changed on disk.
    applyWorldData(world, cached);
    try {
      const fresh = await fetchWorldData(world);
      if (myToken !== worldSwitchToken) return;
      cacheWorldData(world.path, fresh);
      applyWorldData(world, fresh);
    } catch(e) { /* silent - we already have cached data showing */ }
    return;
  }

  showLoading(t('reading_world_data'));
  try {
    const fresh = await fetchWorldData(world);
    // If the user already clicked a different world while this one was loading,
    // drop this stale result instead of rendering/animating it on top of the newer one.
    if (myToken !== worldSwitchToken) return;
    hideLoading();
    cacheWorldData(world.path, fresh);
    applyWorldData(world, fresh);
  } catch(e) {
    if (myToken !== worldSwitchToken) return;
    hideLoading();
    showToast('error', t('err_label') + ': ' + e.message);
  }
}

// === RENDER PANEL ===
function renderPanel(world, data) {
  $('welcome-screen').classList.add('hidden');
  const panel = $('world-panel');
  const wasHidden = panel.classList.contains('hidden');
  panel.classList.remove('hidden');
  // Only replay the full slide/fade entrance the first time the panel appears.
  // If it's already visible and we're just switching between worlds, replaying
  // this every click is what piles up and feels chaotic under rapid clicking.
  if (wasHidden) {
    panel.style.animation = 'none';
    panel.offsetHeight;
    panel.style.animation = '';
  }

  $('panel-world-name').textContent = world.name;

  const badges = $('panel-badges');
  badges.innerHTML = '';
  if (world.hardcore)     badges.innerHTML += '<span class="badge badge-hc">Hardcore</span>';
  if (world.gameType===1) badges.innerHTML += '<span class="badge badge-cr">Creative</span>';
  if (world.gameType===2) badges.innerHTML += '<span class="badge badge-adv">Adventure</span>';

  const dead = data.dead || data.health <= 0;

  const status = $('panel-status');
  status.className = 'wp-status' + (dead ? ' dead' : '');
  status.innerHTML = `<span class="wp-status-dot"></span>${dead ? t('dead') : t('alive')}`;

  // Warning banner
  $('mc-warning').style.display = 'flex';

  // Stats
  const gmMap = [t('gamemode_s'), t('gamemode_c'), t('gamemode_a'), t('gamemode_sp')];
  const hp = data.health || 0;
  $('stat-health').textContent   = `${hp} / 20`;
  $('stat-food').textContent     = `${data.foodLevel || 0} / 20`;
  $('stat-gamemode').textContent = gmMap[data.gameType] || t('gamemode_s');
  $('stat-xp').textContent       = `${data.xpLevel || 0} lvl`;
  $('stat-hardcore').textContent = world.hardcore ? t('yes') : t('no');

  // Day and time
  if (data.dayTime !== undefined) {
    const { days, timeStr } = formatDayTime(data.dayTime);
    $('stat-day').textContent  = days;
    $('stat-time').textContent = timeStr;
  }

  // Last death
  const deathRow = $('last-death-row');
  if (data.lastDeathX && Array.isArray(data.lastDeathX)) {
    deathRow.style.display = 'flex';
    $('stat-last-death').textContent = `${data.lastDeathX[0]}, ${data.lastDeathX[1]}, ${data.lastDeathX[2]}`;
  } else {
    deathRow.style.display = 'none';
  }

  $('health-fill').style.width = (dead ? 0 : Math.max(0, hp) / 20 * 100) + '%';
  $('food-fill').style.width   = (dead ? 0 : Math.max(0, data.foodLevel||0) / 20 * 100) + '%';

  if (data.pos && data.pos.length === 3) {
    $('coord-x').textContent = data.pos[0];
    $('coord-y').textContent = data.pos[1];
    $('coord-z').textContent = data.pos[2];
    $('tp-x').value = data.pos[0];
    $('tp-y').value = data.pos[1];
    $('tp-z').value = data.pos[2];
  }

  // Revive section
  const revive = $('revive-section');
  if (dead) {
    revive.classList.remove('hidden');
    const lbl = revive.querySelector('.revive-label');
    if (lbl) lbl.textContent = world.hardcore ? t('player_dead_hardcore') : t('player_dead');
  } else {
    revive.classList.add('hidden');
  }

  // Hardcore button - based on world.hardcore ONLY, never flip-flop
  const hcBtn  = $('btn-toggle-hardcore');
  const hcText = $('hc-btn-text');
  const hcHint = $('hc-hint');
  if (world.hardcore) {
    hcBtn.className    = 'act-btn act-red';
    hcText.textContent = t('disable_hardcore');
    hcHint.textContent = t('hardcore_on');
  } else {
    hcBtn.className    = 'act-btn act-amber';
    hcText.textContent = t('enable_hardcore');
    hcHint.textContent = t('hardcore_off');
  }

  // Player switcher - use cached list, no delay
  const switchBtn = $('btn-switch-player');
  const cachedPlayers = state.cachedPlayers || [];
  switchBtn.style.display = cachedPlayers.length > 0 ? 'flex' : 'none';
}

// === PLAYER SWITCHER ===
let selectedPlayer = null; // null = host (level.dat), otherwise { uuid, name, datPath }
let playerSwitchToken = 0; // guards against stale async responses when switching players quickly

$('btn-switch-player').onclick = async () => {
  const picker = $('player-picker');
  if (!picker.classList.contains('hidden')) {
    picker.classList.add('hidden');
    return;
  }
  if (!state.selectedWorld) return;

  // Show immediately with cached (fast) names
  const players = state.cachedPlayers || [];
  renderPlayerPicker(players);
  picker.classList.remove('hidden');

  // Then resolve real names in background
  if (players.length > 0) {
    ipcRenderer.invoke('resolve-player-names', players).then(resolved => {
      state.cachedPlayers = resolved;
      if (!picker.classList.contains('hidden')) {
        renderPlayerPicker(resolved);
      }
    }).catch(() => {});
  }
};

function renderPlayerPicker(players) {
  const list = $('player-picker-list');
  list.innerHTML = '';

  // "Я" option (host)
  const hostEl = document.createElement('div');
  hostEl.className = 'player-picker-item' + (!selectedPlayer ? ' active' : '');
  hostEl.innerHTML = `
    <div class="player-picker-avatar">Я</div>
    <span class="player-picker-name">${t('i_host')}</span>
    <span class="player-picker-status">${state.playerData?.dead ? `<span class="player-picker-dead">${t('dead')}</span>` : '20 HP'}</span>
  `;
  hostEl.onclick = () => {
    selectedPlayer = null;
    playerSwitchToken++; // invalidate any in-flight player fetch
    $('current-player-name').textContent = t('i_me');
    $('player-picker').classList.add('hidden');
    if (state.selectedWorld && state.playerData) renderPanel(state.selectedWorld, state.playerData);
  };
  list.appendChild(hostEl);

  players.forEach(p => {
    const el = document.createElement('div');
    el.className = 'player-picker-item' + (selectedPlayer?.uuid === p.uuid ? ' active' : '');
    const initials = p.name.slice(0, 2).toUpperCase();
    el.innerHTML = `
      <div class="player-picker-avatar">${esc(initials)}</div>
      <span class="player-picker-name">${esc(p.name)}</span>
      <span class="player-picker-status ${p.dead ? 'player-picker-dead' : ''}">${p.dead ? t('dead') : p.health + ' HP'}</span>
    `;
    el.onclick = async () => {
      selectedPlayer = p;
      const myToken = ++playerSwitchToken;
      $('current-player-name').textContent = p.name;
      $('player-picker').classList.add('hidden');
      // Reload panel data for selected player
      if (state.selectedWorld) {
        showLoading(t('reading_player_data'));
        try {
          const [inventory, stats] = await Promise.all([
            ipcRenderer.invoke('get-inventory-player', state.selectedWorld.path, p.datPath).catch(() => []),
            ipcRenderer.invoke('get-stats', state.selectedWorld.path).catch(() => null)
          ]);
          // Update player stats display from dat file
          const playerInfo = await ipcRenderer.invoke('get-player-data-from-dat', p.datPath).catch(() => null);
          if (myToken !== playerSwitchToken) { hideLoading(); return; } // a newer switch happened meanwhile - discard stale data
          if (playerInfo) {
            // Merge keeping world info (hardcore, gameType etc) from world, but player stats from dat
            const merged = {
              ...state.playerData,
              health: playerInfo.health,
              foodLevel: playerInfo.foodLevel,
              xpLevel: playerInfo.xpLevel,
              pos: playerInfo.pos,
              dead: playerInfo.dead,
              dayTime: state.playerData.dayTime,
              lastDeathX: playerInfo.lastDeathX || state.playerData.lastDeathX
            };
            renderPanel(state.selectedWorld, merged);
          }
          renderInventory(inventory);
          renderStats(stats);
          hideLoading();
        } catch(e) {
          hideLoading();
        }
      }
    };
    list.appendChild(el);
  });
}

// Close picker on outside click
document.addEventListener('click', e => {
  const picker = $('player-picker');
  const btn = $('btn-switch-player');
  if (!picker.classList.contains('hidden') && !picker.contains(e.target) && !btn.contains(e.target)) {
    picker.classList.add('hidden');
  }
});
$('btn-pick-saves').onclick = async () => {
  const p = await ipcRenderer.invoke('select-saves-folder');
  if (p) await loadSaves(p);
};

// === SWITCH INSTANCE ===
$('btn-switch-instance').onclick = async () => {
  showLoading(t('searching_instances'));
  const instances = await ipcRenderer.invoke('find-all-instances');
  hideLoading();

  if (!instances || instances.length === 0) {
    // No instances found - just open folder picker
    const p = await ipcRenderer.invoke('select-saves-folder');
    if (p) await loadSaves(p);
    return;
  }

  // Show launcher screen with instance picker
  showScreen('launcher');
  $('lnc-initial').classList.add('hidden');
  $('lnc-picker').classList.remove('hidden');
  showInstancePicker(instances);
};

// Back button on picker - go back to main if already had a saves path
$('btn-lnc-back').onclick = () => {
  if (state.savesPath) {
    // Already have saves - go back to main
    $('lnc-picker').classList.add('hidden');
    $('lnc-initial').classList.remove('hidden');
    showScreen('main');
  } else {
    $('lnc-picker').classList.add('hidden');
    $('lnc-initial').classList.remove('hidden');
  }
};

// === ABOUT MODAL ===
$('btn-about').onclick = () => openModal('modal-about');

function openModal(id) {
  const m = $(id);
  m.classList.remove('hidden', 'closing');
  // Force reflow then animate in
  m.offsetHeight;
  m.classList.add('open');
}

function closeModal(id = 'modal-about') {
  const m = $(id);
  m.classList.add('closing');
  m.classList.remove('open');
  setTimeout(() => m.classList.add('hidden'), 280);
}

$('modal-close').onclick = () => closeModal('modal-about');
$('modal-about').onclick = e => { if (e.target === $('modal-about')) closeModal('modal-about'); };

// === CHANGELOG MODAL ===
$('btn-changelog').onclick = () => openModal('modal-changelog');
$('modal-changelog-close').onclick = () => closeModal('modal-changelog');
$('modal-changelog').onclick = e => { if (e.target === $('modal-changelog')) closeModal('modal-changelog'); };

// Copy email on click
document.getElementById('copy-email').onclick = () => {
  navigator.clipboard.writeText('reimumom@duck.com').then(() => {
    showToast('success', t('email_copied'));
  }).catch(() => {});
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('modal-about').classList.contains('hidden')) closeModal('modal-about');
  if (e.key === 'Escape' && !$('modal-changelog').classList.contains('hidden')) closeModal('modal-changelog');
});

// === ACTIONS ===
async function doAction(action, params = {}) {
  if (!state.selectedWorld) return;
  if (selectedPlayer) params.playerDat = selectedPlayer.datPath;
  showLoading(t('applying'));
  try {
    const res = await ipcRenderer.invoke('apply-action', {
      worldPath: state.selectedWorld.path, action, params
    });
    hideLoading();
    if (res.success) {
      showToast('success', successMsg(action));
      await refreshData();
      // Refresh backups list after backup action
      if (action === 'backup') {
        const backups = await ipcRenderer.invoke('get-backups', state.selectedWorld.path).catch(() => []);
        renderBackups(backups, state.selectedWorld.path);
        const cachedB = worldDataCache.get(state.selectedWorld.path);
        if (cachedB) cacheWorldData(state.selectedWorld.path, { ...cachedB, backups });
      }
    } else {
      showToast('error', res.error || t('err_generic'));
    }
  } catch(e) {
    hideLoading();
    showToast('error', t('err_label') + ': ' + e.message);
  }
}

async function refreshData() {
  if (!state.selectedWorld) return;
  try {
    state.playerData = await ipcRenderer.invoke('get-player-data', state.selectedWorld.path);
    state.worlds = await ipcRenderer.invoke('get-worlds', state.savesPath);
    const prev = state.selectedWorld.path;
    state.selectedWorld = state.worlds.find(w => w.path === prev) || state.selectedWorld;
    renderPanel(state.selectedWorld, state.playerData);
    renderWorlds();
    // Keep the cached copy in sync too, so a later revisit of this world
    // doesn't briefly flash outdated data before the background refresh lands.
    const cachedD = worldDataCache.get(state.selectedWorld.path);
    if (cachedD) cacheWorldData(state.selectedWorld.path, { ...cachedD, playerData: state.playerData });
    // Re-highlight active world
    requestAnimationFrame(() => {
      document.querySelectorAll('.world-item').forEach(el => {
        if (el.dataset.path === state.selectedWorld.path) el.classList.add('active');
      });
    });
  } catch(e) { console.error('refreshData:', e); }
}

function successMsg(a) {
  return ({
    heal:            t('act_heal'),
    teleport:        t('act_teleport'),
    'teleport-spawn':t('act_teleport_spawn'),
    'clear-effects': t('act_clear_effects'),
    'repair-items':  t('act_repair_items'),
    'toggle-hardcore':t('act_toggle_hardcore'),
    revive:          t('act_revive'),
    'clear-weather':  t('act_clear_weather'),
    'set-day':        t('act_set_day'),
    'set-night':      t('act_set_night'),
  })[a] || t('act_done');
}

// === PANEL TABS (Player / World) ===
function switchPanelTab(cat) {
  document.querySelectorAll('.panel-tab').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  document.querySelectorAll('.panel-grid > .p-card[data-cat]').forEach(card => {
    card.classList.toggle('hidden', card.dataset.cat !== cat);
  });
  document.querySelectorAll('.actions-grid').forEach(g => {
    g.classList.toggle('hidden', g.dataset.cat !== cat);
  });
}
document.querySelectorAll('.panel-tab').forEach(tabBtn => {
  tabBtn.onclick = () => switchPanelTab(tabBtn.dataset.cat);
});

// === COLLAPSIBLE SECTIONS (accordion) ===
// Temporarily drop the heavy backdrop-filter blur while the card is resizing
// so the compositor doesn't have to resample the blur region every frame.
document.querySelectorAll('.p-card-header-toggle').forEach(header => {
  header.onclick = () => {
    const card = header.closest('.p-card');
    const wrap = card.querySelector('.p-card-body-wrap');
    // If a previous toggle's listener is still pending (rapid re-clicking
    // before the last animation finished), remove it first so listeners
    // don't pile up on the same element.
    if (wrap._animDoneHandler) wrap.removeEventListener('transitionend', wrap._animDoneHandler);
    card.classList.add('p-card-animating');
    card.classList.toggle('collapsed');
    const onDone = (e) => {
      if (e.target !== wrap) return;
      card.classList.remove('p-card-animating');
      wrap.removeEventListener('transitionend', onDone);
      wrap._animDoneHandler = null;
    };
    wrap._animDoneHandler = onDone;
    wrap.addEventListener('transitionend', onDone);
  };
});

$('btn-heal').onclick            = () => doAction('heal');
$('btn-tp-spawn').onclick        = () => doAction('teleport-spawn');
$('btn-clear-effects').onclick   = () => doAction('clear-effects');
$('btn-repair').onclick          = () => doAction('repair-items');
$('btn-backup').onclick = () => {
  const name = $('backup-name').value.trim();
  doAction('backup', { name: name || undefined });
  $('backup-name').value = '';
};
$('btn-clear-weather').onclick   = () => doAction('clear-weather');
$('btn-set-day').onclick         = () => doAction('set-day');
$('btn-set-night').onclick       = () => doAction('set-night');
$('btn-revive').onclick          = () => doAction('revive');
$('btn-toggle-hardcore').onclick = () => {
  if (!state.selectedWorld) return;
  doAction('toggle-hardcore', { enable: !state.selectedWorld.hardcore });
};
$('btn-teleport').onclick = () => {
  const x = $('tp-x').value, y = $('tp-y').value, z = $('tp-z').value;
  if (x==='' || y==='' || z==='') { showToast('error', t('enter_coords')); return; }
  doAction('teleport', { x, y, z });
};

// === TOAST ===
let toastT = null;
function showToast(type, msg) {
  const t = $('toast');
  const icons = { success: '✓', error: '✕' };
  $('toast-icon').textContent = icons[type] || '·';
  $('toast-msg').textContent  = msg;
  t.className = `toast ${type} show`;
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 3200);
}

// === LOADING ===
function showLoading(txt) {
  $('loading').classList.remove('hidden');
  $('loading').querySelector('.loading-label').textContent = txt || t('loading');
}
function hideLoading() { $('loading').classList.add('hidden'); }

// === UTILS ===
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// === LOCALIZATION ===
const LANGS = {
  ru: {
    player_status:'Статус игрока', health:'Здоровье', hunger:'Голод', mode:'Режим',
    xp_level:'Уровень XP', hardcore:'Хардкор', world_day:'День мира', time_of_day:'Время суток',
    last_death:'Последняя смерть', position:'Позиция', actions:'Действия',
    actions_cat_player:'Игрок', actions_cat_world:'Мир',
    heal:'Вылечить', tp_spawn:'ТП на спавн', clear_effects:'Очистить эффекты',
    repair:'Починить предметы', backup:'Создать бэкап', clear_weather:'Ясная погода',
    set_day:'Сделать день', contact_us:'Идеи или баги', teleport:'Телепортировать',
    revive:'Воскресить', worlds:'МИРЫ', switch_instance:'Сменить инстанс',
    choose_saves:'Выбрать папку saves',
    disable_hardcore:'Выключить хардкор', enable_hardcore:'Включить хардкор',
    hardcore_on:'Хардкор включен', hardcore_off:'Хардкор выключен',
    player_dead_hardcore:'Игрок мёртв в хардкоре', player_dead:'Игрок мёртв',
    yes:'Да', no:'Нет', alive:'Живой', dead:'Мёртв',
    gamemode_s:'Survival', gamemode_c:'Creative', gamemode_a:'Adventure', gamemode_sp:'Spectator',
    day:'день', morning:'утро', noon:'полдень', evening:'вечер', night:'ночь', midnight:'полночь',
    no_death:'Нет данных',
    mc_warning:'Minecraft запущен. Выйди из мира в главное меню перед применением изменений.',
    confirm_delete_backup:'Удалить бэкап? Это действие необратимо.', confirm_title_delete:'Удалить бэкап', confirm_title_restore:'Восстановить мир', cancel:'Отмена', confirm_ok:'Подтвердить',
    agree_btn:'Принимаю условия', decline_btn:'Отклонить и выйти',
    tech_badge:'Технология NXBT-Bridge 3.3.5 · Прямой патчинг NBT-структур · Только для Java 1.21.11',
    where_mc:'Где установлен Minecraft?', auto_search_desc:'Автопоиск найдёт все лаунчеры и инстансы',
    auto_search:'Автопоиск', auto_search_sub:'Prism, MultiMC, TLauncher',
    manual:'Вручную', manual_desc:'Выбрать папку saves',
    launchers:'Лаунчеры', instances:'Инстансы',
    app_sub:'World Editor', welcome_title:'Добро пожаловать в Vault',
    welcome_desc:'Выбери папку saves и мир для редактирования. Перед применением изменений выйди из мира в главное меню.',
    applying:'Применяю изменения...', saves_not_selected:'Папка saves не выбрана',
    ab_tech:'Технология', ab_why:'Почему нельзя выдать себе что угодно',
    ab_tech_desc:'NXBT-Bridge 3.3.5 - стабильный патч-движок с полностью переработанным алгоритмом обхода compound-тегов. Устранены утечки при записи gzip-блоков, добавлена валидация целостности перед применением патча. Поддерживает все форматы playerdata начиная с DataVersion 3953 (Java 1.21+). Среднее время патча - менее 12мс. Без запуска игры. В версии 3.3.0 ускорена запись NBT-тегов примерно на 20% и исправлена редкая ошибка чтения повреждённых chunk-файлов. В версии 3.3.5 незначительно снижено потребление памяти при обработке крупных region-файлов (свыше 50 МБ).',
    ab_lim1_title:'Ограничения сигнатурной привязки',
    ab_lim1_desc:'NXBT-Bridge работает через статические сигнатуры NBT-полей. Предметы инвентаря хранятся в динамически-генерируемых compound-тегах с уникальными UUID. Запись без пересчёта контрольных сумм вызывает corruption файла. Поддержка инвентаря запланирована в NXBT-Bridge 4.0.',
    ab_lim2_title:'Версионная привязка',
    ab_lim2_desc:'Смещения и XOR-маски уникальны для каждой версии Minecraft. Текущая сборка откалибрована под Java Edition 1.21.11. Поддержка других версий тестируется командой.',
    ab_lim3_title:'Статус разработки',
    ab_lim3_desc:'Vault находится в активной разработке. Venth Team продолжает реверс-инжиниринг новых версий и расширяет список поддерживаемых параметров. Следи за обновлениями.',
    ab_eula_title:'Пользовательское соглашение',
    ab_eula1:'Данное программное обеспечение разработано командой Venth Team и не является продуктом Mojang Studios или Microsoft Corporation. Любые совпадения с официальными инструментами случайны.',
    ab_eula2:'Vault вносит прямые изменения в бинарные файлы сохранений Minecraft. Пользователь принимает полную ответственность за сохранность данных. Разработчики не несут ответственности за потерю прогресса, повреждение файлов или любой иной ущерб, включая косвенный.',
    ab_eula3:'Использование на серверах может нарушать пользовательское соглашение сервиса и повлечь блокировку аккаунта. Используй на свой страх и риск.',
    ab_fine:'Программное обеспечение представляется на условиях "как есть" (AS IS). Разработчик прилагает все усилия для обеспечения стабильности NXBT-Bridge, однако не гарантирует абсолютную совместимость со сторонними модификациями Minecraft и не несёт ответственности за повреждение игровых файлов. Venth Team оставляет за собой право изменять функциональность без предварительного уведомления.',
    i_me:'Я', i_host:'Я (хозяин мира)', unsupported:'не поддерж.', version_unsupported_warn:'Версия не поддерживается. Нажми ещё раз чтобы открыть.',
    set_night:'Сделать ночь', inventory:'Инвентарь', inv_empty:'Нет данных',
    stats:'Статистика', stats_no_file:'Файл статистики не найден',
    stat_playtime:'Время игры', stat_deaths:'Смертей', stat_kills:'Убито мобов',
    stat_mined:'Блоков добыто', stat_jumps:'Прыжков', stat_walked:'Пройдено',
    backups:'Бэкапы', no_backups:'Нет бэкапов',
    restore:'Восстановить', restore_confirm:'Текущее состояние мира будет заменено. Перед этим создастся авто-бэкап. Продолжить?', restore_ok:'Мир восстановлен',
    no_worlds_found:'Миры не найдены', searching_instances:'Ищу инстансы...', reading_world_data:'Читаю данные мира...', reading_player_data:'Читаю данные игрока...',
    restoring:'Восстанавливаю...', loading:'Загрузка...', err_reading:'Ошибка чтения', email_copied:'Почта скопирована', err_generic:'Что-то пошло не так',
    cl_title:'История версий', cl_subtitle:'Что нового в Vault', cl_badge_release:'Релиз', cl_badge_prerelease:'Пре-релиз', cl_added:'Добавлено', cl_changed:'Изменено', cl_fixed:'Исправлено', cl_210_add_1:'Категории действий «Игрок» и «Мир» с отдельными вкладками', cl_210_add_2:'Свёртываемые (аккордеон) секции карточек в панели мира', cl_210_add_3:'Кэш данных миров - повторное открытие мира без экрана загрузки', cl_210_add_4:'Полный перевод всех сообщений и уведомлений на 6 языков', cl_210_add_5:'Тактильная отдача при нажатии на кнопки и вкладки', cl_210_add_6:'Добавлена поддержка PolyMC, GDLauncher, ATLauncher, Technic Launcher и CurseForge', cl_210_add_7:'Добавлена поддержка Modrinth App, FTB App, XMCL и Lunar Client', cl_210_chg_1:'Единый компактный вид свёрнутых карточек', cl_210_chg_2:'Более мягкая анимация для частых действий, пружинистая - только для редких переходов', cl_210_chg_3:'Успокоена фоновая пульсация декоративных элементов', cl_210_chg_4:'Ограничена задержка появления длинных списков миров и инстансов', cl_210_fix_1:'Битые никнеймы игроков в некоторых случаях', cl_210_fix_2:'Гонка состояний при быстром переключении между игроками', cl_210_fix_3:'Неровная сетка инвентаря', cl_210_fix_4:'Пустое место под свёрнутыми карточками', cl_210_fix_5:'Обрезанный текст и стрелка в свёрнутых заголовках', cl_210_fix_6:'Рывки при анимации сворачивания карточек', cl_210_fix_7:'Хаотичное наслоение анимаций при быстром переключении миров', cl_210_fix_8:'Смещение интерфейса при появлении и исчезновении полосы прокрутки', cl_210_fix_9:'Полное отключение анимаций системной настройкой «уменьшить движение»', cl_202_add_1:'Первый рабочий пре-релиз: определение лаунчеров и инстансов, прямое редактирование данных игрока и мира через NXBT-Bridge, базовый интерфейс', cl_nxbt_title:'История NXBT-Bridge', cl_nxbt_v203_label:'v2.0.3 - NXBT-Bridge 3.3.0', cl_nxbt_1:'Переработан алгоритм обхода compound-тегов', cl_nxbt_2:'Устранены утечки при записи gzip-блоков', cl_nxbt_3:'Добавлена валидация целостности перед применением патча', cl_nxbt_4:'Ускорена запись NBT-тегов примерно на 20%', cl_nxbt_5:'Исправлена редкая ошибка чтения повреждённых chunk-файлов', cl_nxbt_6:'Добавлена поддержка форматов playerdata начиная с DataVersion 3953 (Java 1.21+)', cl_nxbt_v202_label:'v2.0.2-beta - первая интеграция', cl_nxbt_7:'Добавлена базовая интеграция NXBT-Bridge для прямого редактирования данных игрока и мира', cl_nxbt_v204_label:'v2.0.4 - NXBT-Bridge 3.3.5', cl_nxbt_8:'Незначительно снижено потребление памяти при обработке крупных region-файлов (свыше 50 МБ)', cl_nxbt_9:'Повышена надёжность сохранения данных мира - теперь используется атомарная запись, исключающая повреждение файла при сбое во время сохранения', cl_nxbt_10:'Добавлена поддержка функций setExperience() и setExperienceDat() - подготовлено заранее', cl_204_chg_1:'Обновлён NXBT-Bridge до версии 3.3.5', cl_204_chg_2:'Анимации переходов и появления элементов (миры, установка через лаунчер, аккордеон, модальные окна) стали ещё более плавными', cl_204_chg_3:'Незначительно уменьшен размер файлов приложения за счёт удаления неиспользуемого кода', cl_204_chg_4:'Сайт проекта проверен и подтверждён в Google', cl_204_fix_1:'Смещённый текст «Нет данных» в пустом списке инвентаря', cl_204_fix_2:'Смещённый текст «Нет данных» в пустом списке статистики', cl_204_fix_3:'Смещённый текст «Нет данных» в пустом списке бэкапов', cl_204_fix_4:'Текст пустого списка инвентаря не обновлялся при смене языка без повторного открытия карточки', cl_204_fix_5:'Текст пустого списка статистики не обновлялся при смене языка без повторного открытия карточки', cl_204_fix_6:'Текст пустого списка бэкапов не обновлялся при смене языка без повторного открытия карточки', cl_204_fix_7:'Несогласованный стиль кавычек в одной из строк истории обновлений на китайском языке', cl_204_fix_8:'Устранён риск повреждения файла мира при аварийном завершении программы во время записи данных (переход на атомарную запись через временный файл)', cl_204_fix_9:'Непредвиденные ошибки теперь не приводят к полному краху приложения - они логируются, а работа программы продолжается',
    err_label:'Ошибка', enter_coords:'Введи координаты X Y Z', backup_deleted:'Бэкап удалён', err_delete:'Ошибка удаления', delete_tooltip:'Удалить',
    unit_h:'ч', unit_m:'м', unit_km:'км', favorite:'Избранное', search_worlds_placeholder:'Поиск миров...',
    act_heal:'Здоровье и голод восстановлены', act_teleport:'Телепортация выполнена', act_teleport_spawn:'Телепортирован на спавн',
    act_clear_effects:'Эффекты очищены', act_repair_items:'Предметы починены', act_toggle_hardcore:'Хардкор изменён',
    act_revive:'Игрок воскрешён', act_clear_weather:'Погода очищена - теперь ясно', act_set_day:'Время установлено на полдень',
    act_set_night:'Время установлено на полночь', act_done:'Готово',
    no_instances_found:'Ничего не найдено. Выбери папку вручную.', confirm_title_default:'Подтверждение'
  },
  en: {
    player_status:'Player Status', health:'Health', hunger:'Hunger', mode:'Mode',
    xp_level:'XP Level', hardcore:'Hardcore', world_day:'World Day', time_of_day:'Time of Day',
    last_death:'Last Death', position:'Position', actions:'Actions',
    actions_cat_player:'Player', actions_cat_world:'World',
    heal:'Heal', tp_spawn:'TP to Spawn', clear_effects:'Clear Effects',
    repair:'Repair Items', backup:'Create Backup', clear_weather:'Clear Weather',
    set_day:'Set Day', contact_us:'Ideas or bugs', teleport:'Teleport',
    revive:'Revive', worlds:'WORLDS', switch_instance:'Switch Instance',
    choose_saves:'Choose saves folder',
    disable_hardcore:'Disable Hardcore', enable_hardcore:'Enable Hardcore',
    hardcore_on:'Hardcore enabled', hardcore_off:'Hardcore disabled',
    player_dead_hardcore:'Player died in hardcore', player_dead:'Player is dead',
    yes:'Yes', no:'No', alive:'Alive', dead:'Dead',
    gamemode_s:'Survival', gamemode_c:'Creative', gamemode_a:'Adventure', gamemode_sp:'Spectator',
    day:'day', morning:'morning', noon:'noon', evening:'evening', night:'night', midnight:'midnight',
    no_death:'No data',
    mc_warning:'Minecraft is running. Exit the world to the main menu before making changes.',
    confirm_delete_backup:'Delete backup? This action cannot be undone.', confirm_title_delete:'Delete Backup', confirm_title_restore:'Restore World', cancel:'Cancel', confirm_ok:'Confirm',
    agree_btn:'Accept terms', decline_btn:'Decline and exit',
    tech_badge:'Technology NXBT-Bridge 3.3.5 · Direct NBT patching · Java 1.21.11 only',
    where_mc:'Where is Minecraft installed?', auto_search_desc:'Auto-detect will find all launchers and instances',
    auto_search:'Auto-detect', auto_search_sub:'Prism, MultiMC, TLauncher',
    manual:'Manual', manual_desc:'Choose saves folder',
    launchers:'Launchers', instances:'Instances',
    app_sub:'World Editor', welcome_title:'Welcome to Vault',
    welcome_desc:'Choose a saves folder and world to edit. Exit the world to main menu before applying changes.',
    applying:'Applying changes...', saves_not_selected:'No saves folder selected',
    ab_tech:'Technology', ab_why:'Why you can\'t give yourself anything',
    ab_tech_desc:'NXBT-Bridge 3.3.5 - stable patch engine with fully reworked compound tag traversal. Eliminates gzip block write leaks, adds integrity validation before patching. Supports all playerdata formats from DataVersion 3953 (Java 1.21+). Average patch time under 12ms. No game launch required. Version 3.3.0 speeds up NBT tag writing by around 20% and fixes a rare bug with reading corrupted chunk files. Version 3.3.5 slightly reduces memory usage when processing large region files (over 50 MB).',
    ab_lim1_title:'Signature binding limitations',
    ab_lim1_desc:'NXBT-Bridge uses static NBT field signatures. Inventory items are stored in dynamically-generated compound tags with unique UUIDs. Writing without checksum recalculation causes file corruption. Inventory editing planned for NXBT-Bridge 4.0.',
    ab_lim2_title:'Version binding',
    ab_lim2_desc:'Offsets and XOR masks are unique to each Minecraft version. Current build is calibrated for Java Edition 1.21.11. Support for other versions is being tested.',
    ab_lim3_title:'Development status',
    ab_lim3_desc:'Vault is in active development. Venth Team continues reverse engineering new versions and expanding supported parameters. Stay tuned.',
    ab_eula_title:'End User License Agreement',
    ab_eula1:'This software is developed by Venth Team and is not a product of Mojang Studios or Microsoft Corporation.',
    ab_eula2:'Vault makes direct changes to Minecraft save files. The user accepts full responsibility for data integrity.',
    ab_eula3:'Use on servers may violate the service agreement and result in account suspension. Use at your own risk.',
    ab_fine:'By accepting this agreement the user confirms that all information is for informational purposes only and may not reflect reality. Venth Team is not liable for any damages.',
    i_me:'Me', i_host:'Me (world owner)', unsupported:'unsupported', version_unsupported_warn:'Version not supported. Click again to open anyway.',
    set_night:'Set Night', inventory:'Inventory', inv_empty:'No data',
    stats:'Statistics', stats_no_file:'Stats file not found',
    stat_playtime:'Play time', stat_deaths:'Deaths', stat_kills:'Mobs killed',
    stat_mined:'Blocks mined', stat_jumps:'Jumps', stat_walked:'Distance walked',
    backups:'Backups', no_backups:'No backups',
    restore:'Restore', restore_confirm:'Current world state will be replaced. An auto-backup will be created first. Continue?', restore_ok:'World restored',
    no_worlds_found:'No worlds found', searching_instances:'Searching instances...', reading_world_data:'Reading world data...', reading_player_data:'Reading player data...',
    restoring:'Restoring...', loading:'Loading...', err_reading:'Read error', email_copied:'Email copied', err_generic:'Something went wrong',
    cl_title:'Changelog', cl_subtitle:'What\'s new in Vault', cl_badge_release:'Release', cl_badge_prerelease:'Pre-release', cl_added:'Added', cl_changed:'Changed', cl_fixed:'Fixed', cl_210_add_1:'Player/World action categories with separate tabs', cl_210_add_2:'Collapsible accordion sections in the world panel', cl_210_add_3:'World data cache - reopening an already-open world skips the loading screen', cl_210_add_4:'Full translation of all messages and notifications into 6 languages', cl_210_add_5:'Tactile press feedback on buttons and tabs', cl_210_add_6:'Added support for PolyMC, GDLauncher, ATLauncher, Technic Launcher, and CurseForge', cl_210_add_7:'Added support for Modrinth App, FTB App, XMCL, and Lunar Client', cl_210_chg_1:'Unified, compact look for collapsed cards', cl_210_chg_2:'Softer animation for frequent actions; the bouncy spring is now reserved for rare transitions', cl_210_chg_3:'Calmer background pulse on decorative elements', cl_210_chg_4:'Capped entrance delay for long world/instance lists', cl_210_fix_1:'Broken player nicknames in some cases', cl_210_fix_2:'Race condition when quickly switching between players', cl_210_fix_3:'Uneven inventory grid', cl_210_fix_4:'Empty space left under collapsed cards', cl_210_fix_5:'Clipped text and arrow in collapsed card headers', cl_210_fix_6:'Jank during the card collapse animation', cl_210_fix_7:'Chaotic animation pile-up when rapidly switching worlds', cl_210_fix_8:'Layout shift when the scrollbar appears/disappears', cl_210_fix_9:'All animations being disabled by the "reduce motion" system setting', cl_202_add_1:'First working pre-release: launcher/instance detection, direct player and world data editing via NXBT-Bridge, basic interface', cl_nxbt_title:'NXBT-Bridge History', cl_nxbt_v203_label:'v2.0.3 - NXBT-Bridge 3.3.0', cl_nxbt_1:'Reworked the compound-tag traversal algorithm', cl_nxbt_2:'Fixed leaks when writing gzip blocks', cl_nxbt_3:'Added integrity validation before applying a patch', cl_nxbt_4:'Sped up NBT tag writes by about 20%', cl_nxbt_5:'Fixed a rare read error on corrupted chunk files', cl_nxbt_6:'Added support for playerdata formats starting from DataVersion 3953 (Java 1.21+)', cl_nxbt_v202_label:'v2.0.2-beta - first integration', cl_nxbt_7:'Added basic NXBT-Bridge integration for direct player and world data editing', cl_nxbt_v204_label:'v2.0.4 - NXBT-Bridge 3.3.5', cl_nxbt_8:'Slightly reduced memory usage when processing large region files (over 50 MB)', cl_nxbt_9:'Improved reliability of world data saving - now uses atomic writes to prevent file corruption if a failure occurs during saving', cl_nxbt_10:'Added support for the setExperience() and setExperienceDat() functions - prepared in advance', cl_204_chg_1:'Updated NXBT-Bridge to version 3.3.5', cl_204_chg_2:'Transition and entry animations (worlds, launcher install, accordion, modals) are now even smoother', cl_204_chg_3:'Slightly reduced app file size by removing unused code', cl_204_chg_4:'Project website verified and confirmed in Google', cl_204_fix_1:'Off-center "No data" text in the empty inventory list', cl_204_fix_2:'Off-center "No data" text in the empty stats list', cl_204_fix_3:'Off-center "No data" text in the empty backups list', cl_204_fix_4:'Empty inventory list text not updating on language change without reopening the card', cl_204_fix_5:'Empty stats list text not updating on language change without reopening the card', cl_204_fix_6:'Empty backups list text not updating on language change without reopening the card', cl_204_fix_7:'Inconsistent quote style in one of the Chinese changelog history lines', cl_204_fix_8:'Fixed a risk of world file corruption if the app crashed mid-write (switched to atomic temp-file writes)', cl_204_fix_9:'Unexpected errors no longer crash the whole app, they are now logged and the app keeps running',
    err_label:'Error', enter_coords:'Enter X Y Z coordinates', backup_deleted:'Backup deleted', err_delete:'Delete error', delete_tooltip:'Delete',
    unit_h:'h', unit_m:'m', unit_km:'km', favorite:'Favorite', search_worlds_placeholder:'Search worlds...',
    act_heal:'Health and hunger restored', act_teleport:'Teleport complete', act_teleport_spawn:'Teleported to spawn',
    act_clear_effects:'Effects cleared', act_repair_items:'Items repaired', act_toggle_hardcore:'Hardcore toggled',
    act_revive:'Player revived', act_clear_weather:'Weather cleared - now clear', act_set_day:'Time set to noon',
    act_set_night:'Time set to midnight', act_done:'Done',
    no_instances_found:'Nothing found. Choose the folder manually.', confirm_title_default:'Confirm'
  },
  de: {
    player_status:'Spielerstatus', health:'Gesundheit', hunger:'Hunger', mode:'Modus',
    xp_level:'XP-Level', hardcore:'Hardcore', world_day:'Welttag', time_of_day:'Tageszeit',
    last_death:'Letzter Tod', position:'Position', actions:'Aktionen',
    actions_cat_player:'Spieler', actions_cat_world:'Welt',
    heal:'Heilen', tp_spawn:'TP zu Spawn', clear_effects:'Effekte löschen',
    repair:'Reparieren', backup:'Backup', clear_weather:'Wetter klären',
    set_day:'Tag setzen', contact_us:'Ideen oder Bugs', teleport:'Teleportieren',
    revive:'Wiederbeleben', worlds:'WELTEN', switch_instance:'Instanz wechseln',
    choose_saves:'Saves-Ordner wählen',
    disable_hardcore:'Hardcore deaktivieren', enable_hardcore:'Hardcore aktivieren',
    hardcore_on:'Hardcore aktiv', hardcore_off:'Hardcore inaktiv',
    player_dead_hardcore:'Spieler im Hardcore gestorben', player_dead:'Spieler ist tot',
    yes:'Ja', no:'Nein', alive:'Lebendig', dead:'Tot',
    gamemode_s:'Überleben', gamemode_c:'Kreativ', gamemode_a:'Abenteuer', gamemode_sp:'Zuschauer',
    day:'Tag', morning:'Morgen', noon:'Mittag', evening:'Abend', night:'Nacht', midnight:'Mitternacht',
    no_death:'Keine Daten',
    mc_warning:'Minecraft läuft. Verlasse die Welt ins Hauptmenü, bevor du Änderungen vornimmst.',
    confirm_delete_backup:'Backup löschen? Diese Aktion ist nicht umkehrbar.', confirm_title_delete:'Backup löschen', confirm_title_restore:'Welt wiederherstellen', cancel:'Abbrechen', confirm_ok:'Bestätigen',
    agree_btn:'Bedingungen akzeptieren', decline_btn:'Ablehnen und beenden',
    tech_badge:'Technologie NXBT-Bridge 3.3.5 · Direktes NBT-Patching · Nur Java 1.21.11',
    where_mc:'Wo ist Minecraft installiert?', auto_search_desc:'Automatische Suche findet alle Launcher und Instanzen',
    auto_search:'Automatisch', auto_search_sub:'Prism, MultiMC, TLauncher',
    manual:'Manuell', manual_desc:'Ordner wählen',
    launchers:'Launcher', instances:'Instanzen',
    app_sub:'Welt-Editor', welcome_title:'Willkommen bei Vault',
    welcome_desc:'Wähle einen Saves-Ordner und eine Welt. Verlasse die Welt ins Hauptmenü, bevor du Änderungen vornimmst.',
    applying:'Änderungen anwenden...', saves_not_selected:'Kein Saves-Ordner ausgewählt',
    ab_tech:'Technologie', ab_why:'Warum man sich nicht alles geben kann',
    ab_tech_desc:'NXBT-Bridge 3.3.5 - stabiler Patch-Engine mit überarbeitetem Compound-Tag-Algorithmus. Behebt gzip-Schreibfehler und fügt Integritätsprüfung hinzu. Unterstützt DataVersion 3953+ (Java 1.21+). Durchschnittliche Patchzeit unter 12ms. Version 3.3.0 beschleunigt das Schreiben von NBT-Tags um etwa 20% und behebt einen seltenen Fehler beim Lesen beschädigter Chunk-Dateien. Version 3.3.5 reduziert den Speicherverbrauch bei der Verarbeitung großer Region-Dateien (über 50 MB) leicht.',
    ab_lim1_title:'Signaturbindungsbeschränkungen',
    ab_lim1_desc:'NXBT-Bridge arbeitet mit statischen NBT-Feldsignaturen. Inventarobjekte werden in compound-Tags mit eindeutigen UUIDs gespeichert. Inventarbearbeitung ist für NXBT-Bridge 4.0 geplant.',
    ab_lim2_title:'Versionsbindung',
    ab_lim2_desc:'Offsets und XOR-Masken sind für jede Minecraft-Version einzigartig. Der aktuelle Build ist für Java Edition 1.21.11 kalibriert.',
    ab_lim3_title:'Entwicklungsstatus',
    ab_lim3_desc:'Vault befindet sich in aktiver Entwicklung. Venth Team setzt das Reverse Engineering neuer Versionen fort.',
    ab_eula_title:'Benutzervereinbarung',
    ab_eula1:'Diese Software wurde von Venth Team entwickelt und ist kein Produkt von Mojang Studios oder Microsoft Corporation.',
    ab_eula2:'Vault nimmt direkte Änderungen an Minecraft-Speicherdateien vor. Der Benutzer übernimmt die volle Verantwortung.',
    ab_eula3:'Die Verwendung auf Servern kann zum Kontosperrung führen. Auf eigene Gefahr verwenden.',
    ab_fine:'Mit der Annahme dieser Vereinbarung bestätigt der Benutzer, dass alle Informationen nur informativer Natur sind. Venth Team haftet nicht für Schäden.',
    i_me:'Ich', i_host:'Ich (Weltbesitzer)', unsupported:'nicht unterstützt', version_unsupported_warn:'Version nicht unterstützt. Nochmal klicken zum Öffnen.',
    set_night:'Nacht setzen', inventory:'Inventar', inv_empty:'Keine Daten',
    stats:'Statistiken', stats_no_file:'Statistikdatei nicht gefunden',
    stat_playtime:'Spielzeit', stat_deaths:'Tode', stat_kills:'Getötete Mobs',
    stat_mined:'Abgebaute Blöcke', stat_jumps:'Sprünge', stat_walked:'Gelaufene Distanz',
    backups:'Backups', no_backups:'Keine Backups',
    restore:'Wiederherstellen', restore_confirm:'Der aktuelle Weltzustand wird ersetzt. Ein Auto-Backup wird erstellt. Fortfahren?', restore_ok:'Welt wiederhergestellt',
    no_worlds_found:'Keine Welten gefunden', searching_instances:'Suche Instanzen...', reading_world_data:'Lese Weltdaten...', reading_player_data:'Lese Spielerdaten...',
    restoring:'Stelle wieder her...', loading:'Lädt...', err_reading:'Lesefehler', email_copied:'E-Mail kopiert', err_generic:'Etwas ist schiefgelaufen',
    cl_title:'Änderungsprotokoll', cl_subtitle:'Was ist neu in Vault', cl_badge_release:'Release', cl_badge_prerelease:'Vorabversion', cl_added:'Hinzugefügt', cl_changed:'Geändert', cl_fixed:'Behoben', cl_210_add_1:'Aktionskategorien „Spieler" und „Welt" mit eigenen Tabs', cl_210_add_2:'Einklappbare Akkordeon-Abschnitte im Weltpanel', cl_210_add_3:'Welt-Daten-Cache – erneutes Öffnen einer bereits geöffneten Welt ohne Ladebildschirm', cl_210_add_4:'Vollständige Übersetzung aller Meldungen in 6 Sprachen', cl_210_add_5:'Taktile Rückmeldung beim Klicken auf Buttons und Tabs', cl_210_add_6:'Unterstützung für PolyMC, GDLauncher, ATLauncher, Technic Launcher und CurseForge hinzugefügt', cl_210_add_7:'Unterstützung für Modrinth App, FTB App, XMCL und Lunar Client hinzugefügt', cl_210_chg_1:'Einheitliches, kompaktes Design für eingeklappte Karten', cl_210_chg_2:'Sanftere Animation für häufige Aktionen; der Federeffekt bleibt seltenen Übergängen vorbehalten', cl_210_chg_3:'Ruhigeres Pulsieren dekorativer Elemente', cl_210_chg_4:'Begrenzte Verzögerung beim Erscheinen langer Welt-/Instanzlisten', cl_210_fix_1:'Fehlerhafte Spielernamen in manchen Fällen', cl_210_fix_2:'Race Condition beim schnellen Spielerwechsel', cl_210_fix_3:'Ungleichmäßiges Inventar-Raster', cl_210_fix_4:'Leerraum unter eingeklappten Karten', cl_210_fix_5:'Abgeschnittener Text und Pfeil in eingeklappten Kartenüberschriften', cl_210_fix_6:'Ruckeln bei der Einklapp-Animation', cl_210_fix_7:'Chaotisches Animations-Stapeln beim schnellen Weltwechsel', cl_210_fix_8:'Layout-Verschiebung beim Ein-/Ausblenden der Scrollbar', cl_210_fix_9:'Vollständiges Deaktivieren aller Animationen durch die Systemeinstellung „Bewegung reduzieren"', cl_202_add_1:'Erste funktionierende Vorabversion: Erkennung von Launchern/Instanzen, direkte Bearbeitung von Spieler- und Weltdaten über NXBT-Bridge, einfache Oberfläche', cl_nxbt_title:'NXBT-Bridge-Verlauf', cl_nxbt_v203_label:'v2.0.3 - NXBT-Bridge 3.3.0', cl_nxbt_1:'Algorithmus zum Durchlaufen von Compound-Tags überarbeitet', cl_nxbt_2:'Lecks beim Schreiben von gzip-Blöcken behoben', cl_nxbt_3:'Integritätsprüfung vor dem Anwenden eines Patches hinzugefügt', cl_nxbt_4:'NBT-Tag-Schreibvorgänge um ca. 20% beschleunigt', cl_nxbt_5:'Seltenen Lesefehler bei beschädigten Chunk-Dateien behoben', cl_nxbt_6:'Unterstützung für Playerdata-Formate ab DataVersion 3953 (Java 1.21+) hinzugefügt', cl_nxbt_v202_label:'v2.0.2-beta - erste Integration', cl_nxbt_7:'Grundlegende NXBT-Bridge-Integration für die direkte Bearbeitung von Spieler- und Weltdaten hinzugefügt', cl_nxbt_v204_label:'v2.0.4 - NXBT-Bridge 3.3.5', cl_nxbt_8:'Speicherverbrauch bei der Verarbeitung großer Region-Dateien (über 50 MB) leicht reduziert', cl_nxbt_9:'Verbesserte Zuverlässigkeit beim Speichern von Weltdaten - verwendet nun atomares Schreiben, um Dateibeschädigungen bei einem Fehler während des Speicherns zu verhindern', cl_nxbt_10:'Unterstützung für die Funktionen setExperience() und setExperienceDat() hinzugefügt - im Voraus vorbereitet', cl_204_chg_1:'NXBT-Bridge auf Version 3.3.5 aktualisiert', cl_204_chg_2:'Übergangs- und Eintrittsanimationen (Welten, Launcher-Installation, Akkordeon, Modale) sind jetzt noch flüssiger', cl_204_chg_3:'App-Dateigröße durch Entfernen ungenutzten Codes geringfügig reduziert', cl_204_chg_4:'Projekt-Website in Google verifiziert und bestätigt', cl_204_fix_1:'Nicht zentrierter „Keine Daten"-Text in der leeren Inventarliste', cl_204_fix_2:'Nicht zentrierter „Keine Daten"-Text in der leeren Statistikliste', cl_204_fix_3:'Nicht zentrierter „Keine Daten"-Text in der leeren Backup-Liste', cl_204_fix_4:'Text der leeren Inventarliste wurde bei Sprachwechsel nicht aktualisiert, ohne die Karte erneut zu öffnen', cl_204_fix_5:'Text der leeren Statistikliste wurde bei Sprachwechsel nicht aktualisiert, ohne die Karte erneut zu öffnen', cl_204_fix_6:'Text der leeren Backup-Liste wurde bei Sprachwechsel nicht aktualisiert, ohne die Karte erneut zu öffnen', cl_204_fix_7:'Uneinheitlicher Anführungszeichenstil in einer Änderungsprotokoll-Zeile auf Chinesisch', cl_204_fix_8:'Risiko einer Weltdatei-Beschädigung bei Absturz während des Schreibens behoben (Umstellung auf atomares Schreiben über temporäre Datei)', cl_204_fix_9:'Unerwartete Fehler führen nicht mehr zum vollständigen Absturz der App, sie werden protokolliert, und die App läuft weiter',
    err_label:'Fehler', enter_coords:'X Y Z Koordinaten eingeben', backup_deleted:'Backup gelöscht', err_delete:'Löschfehler', delete_tooltip:'Löschen',
    unit_h:'Std', unit_m:'Min', unit_km:'km', favorite:'Favorit', search_worlds_placeholder:'Welten suchen...',
    act_heal:'Gesundheit und Hunger wiederhergestellt', act_teleport:'Teleportation abgeschlossen', act_teleport_spawn:'Zum Spawn teleportiert',
    act_clear_effects:'Effekte entfernt', act_repair_items:'Gegenstände repariert', act_toggle_hardcore:'Hardcore geändert',
    act_revive:'Spieler wiederbelebt', act_clear_weather:'Wetter geklärt - jetzt klar', act_set_day:'Zeit auf Mittag gesetzt',
    act_set_night:'Zeit auf Mitternacht gesetzt', act_done:'Fertig',
    no_instances_found:'Nichts gefunden. Wähle den Ordner manuell.', confirm_title_default:'Bestätigung'
  },
  fr: {
    player_status:'Statut du joueur', health:'Santé', hunger:'Faim', mode:'Mode',
    xp_level:'Niveau XP', hardcore:'Hardcore', world_day:'Jour du monde', time_of_day:'Heure',
    last_death:'Dernière mort', position:'Position', actions:'Actions',
    actions_cat_player:'Joueur', actions_cat_world:'Monde',
    heal:'Soigner', tp_spawn:'TP au spawn', clear_effects:'Effacer effets',
    repair:'Réparer', backup:'Sauvegarde', clear_weather:'Ciel dégagé',
    set_day:'Faire jour', contact_us:'Idées ou bugs', teleport:'Téléporter',
    revive:'Ressusciter', worlds:'MONDES', switch_instance:'Changer instance',
    choose_saves:'Choisir dossier saves',
    disable_hardcore:'Désactiver Hardcore', enable_hardcore:'Activer Hardcore',
    hardcore_on:'Hardcore activé', hardcore_off:'Hardcore désactivé',
    player_dead_hardcore:'Joueur mort en hardcore', player_dead:'Joueur mort',
    yes:'Oui', no:'Non', alive:'Vivant', dead:'Mort',
    gamemode_s:'Survie', gamemode_c:'Créatif', gamemode_a:'Aventure', gamemode_sp:'Spectateur',
    day:'jour', morning:'matin', noon:'midi', evening:'soir', night:'nuit', midnight:'minuit',
    no_death:'Pas de données',
    mc_warning:'Minecraft est lancé. Quittez le monde vers le menu principal avant de modifier.',
    confirm_delete_backup:'Supprimer la sauvegarde? Cette action est irréversible.', confirm_title_delete:'Supprimer', confirm_title_restore:'Restaurer le monde', cancel:'Annuler', confirm_ok:'Confirmer',
    agree_btn:'Accepter les conditions', decline_btn:'Refuser et quitter',
    tech_badge:'Technologie NXBT-Bridge 3.3.5 · Patch NBT direct · Java 1.21.11 uniquement',
    where_mc:'Où est installé Minecraft?', auto_search_desc:'La détection automatique trouve tous les lanceurs',
    auto_search:'Détection auto', auto_search_sub:'Prism, MultiMC, TLauncher',
    manual:'Manuel', manual_desc:'Choisir dossier saves',
    launchers:'Lanceurs', instances:'Instances',
    app_sub:'Éditeur de monde', welcome_title:'Bienvenue dans Vault',
    welcome_desc:'Choisissez un dossier saves et un monde. Quittez le monde avant d\'appliquer les modifications.',
    applying:'Application des modifications...', saves_not_selected:'Aucun dossier saves sélectionné',
    ab_tech:'Technologie', ab_why:'Pourquoi on ne peut pas tout s\'accorder',
    ab_tech_desc:'NXBT-Bridge 3.3.5 - moteur de patch stable avec algorithme de parcours compound remanié. Corrige les fuites d\'écriture gzip et ajoute une validation d\'intégrité. Supporte DataVersion 3953+ (Java 1.21+). Temps de patch moyen inférieur à 12ms. La version 3.3.0 accélère l\'écriture des tags NBT d\'environ 20% et corrige un bug rare de lecture des fichiers de chunk corrompus. La version 3.3.5 réduit légèrement la consommation mémoire lors du traitement de fichiers de région volumineux (plus de 50 Mo).',
    ab_lim1_title:'Limitations de liaison de signature',
    ab_lim1_desc:'NXBT-Bridge utilise des signatures de champs NBT statiques. L\'édition d\'inventaire est prévue pour NXBT-Bridge 4.0.',
    ab_lim2_title:'Liaison de version',
    ab_lim2_desc:'Les offsets sont uniques à chaque version. La build actuelle est calibrée pour Java Edition 1.21.11.',
    ab_lim3_title:'Statut de développement',
    ab_lim3_desc:'Vault est en développement actif. Venth Team continue le reverse engineering de nouvelles versions.',
    ab_eula_title:'Accord utilisateur',
    ab_eula1:'Ce logiciel est développé par Venth Team et n\'est pas un produit de Mojang Studios ou Microsoft Corporation.',
    ab_eula2:'Vault modifie directement les fichiers de sauvegarde. L\'utilisateur accepte l\'entière responsabilité.',
    ab_eula3:'L\'utilisation sur des serveurs peut entraîner une suspension de compte. Utilisez à vos risques.',
    ab_fine:'En acceptant cet accord l\'utilisateur confirme que toutes les informations sont à titre informatif. Venth Team n\'est pas responsable des dommages.',
    i_me:'Moi', i_host:'Moi (propriétaire)', unsupported:'non supporté', version_unsupported_warn:'Version non supportée. Cliquez encore pour ouvrir.',
    set_night:'Faire nuit', inventory:'Inventaire', inv_empty:'Pas de données',
    stats:'Statistiques', stats_no_file:'Fichier stats introuvable',
    stat_playtime:'Temps de jeu', stat_deaths:'Morts', stat_kills:'Mobs tués',
    stat_mined:'Blocs minés', stat_jumps:'Sauts', stat_walked:'Distance parcourue',
    backups:'Sauvegardes', no_backups:'Pas de sauvegardes',
    restore:'Restaurer', restore_confirm:'L\'état actuel sera remplacé. Une sauvegarde auto sera créée. Continuer?', restore_ok:'Monde restauré',
    no_worlds_found:'Aucun monde trouvé', searching_instances:'Recherche des instances...', reading_world_data:'Lecture des données du monde...', reading_player_data:'Lecture des données du joueur...',
    restoring:'Restauration...', loading:'Chargement...', err_reading:'Erreur de lecture', email_copied:'E-mail copié', err_generic:'Un problème est survenu',
    cl_title:'Journal des modifications', cl_subtitle:'Quoi de neuf dans Vault', cl_badge_release:'Version stable', cl_badge_prerelease:'Version préliminaire', cl_added:'Ajouté', cl_changed:'Modifié', cl_fixed:'Corrigé', cl_210_add_1:'Catégories d\'actions « Joueur » et « Monde » avec onglets séparés', cl_210_add_2:'Sections accordéon repliables dans le panneau du monde', cl_210_add_3:'Cache des données du monde - réouvrir un monde déjà ouvert sans écran de chargement', cl_210_add_4:'Traduction complète de tous les messages en 6 langues', cl_210_add_5:'Retour tactile au clic sur les boutons et onglets', cl_210_add_6:'Prise en charge de PolyMC, GDLauncher, ATLauncher, Technic Launcher et CurseForge ajoutée', cl_210_add_7:'Prise en charge de Modrinth App, FTB App, XMCL et Lunar Client ajoutée', cl_210_chg_1:'Apparence unifiée et compacte des cartes repliées', cl_210_chg_2:'Animation plus douce pour les actions fréquentes ; l\'effet ressort est réservé aux transitions rares', cl_210_chg_3:'Pulsation de fond des éléments décoratifs adoucie', cl_210_chg_4:'Délai d\'apparition plafonné pour les longues listes de mondes/instances', cl_210_fix_1:'Pseudos de joueurs corrompus dans certains cas', cl_210_fix_2:'Situation de concurrence lors du changement rapide de joueur', cl_210_fix_3:'Grille d\'inventaire irrégulière', cl_210_fix_4:'Espace vide sous les cartes repliées', cl_210_fix_5:'Texte et flèche tronqués dans les en-têtes de cartes repliées', cl_210_fix_6:'Saccades pendant l\'animation de repli des cartes', cl_210_fix_7:'Empilement chaotique des animations lors de changements rapides de monde', cl_210_fix_8:'Décalage de mise en page à l\'apparition/disparition de la barre de défilement', cl_210_fix_9:'Désactivation totale des animations par le paramètre système « réduire les animations »', cl_202_add_1:'Première pré-version fonctionnelle : détection des launchers/instances, édition directe des données joueur et monde via NXBT-Bridge, interface basique', cl_nxbt_title:'Historique de NXBT-Bridge', cl_nxbt_v203_label:'v2.0.3 - NXBT-Bridge 3.3.0', cl_nxbt_1:'Algorithme de parcours des balises compound retravaillé', cl_nxbt_2:'Fuites corrigées lors de l\'écriture des blocs gzip', cl_nxbt_3:'Validation d\'intégrité ajoutée avant l\'application d\'un patch', cl_nxbt_4:'Écriture des balises NBT accélérée d\'environ 20%', cl_nxbt_5:'Erreur de lecture rare corrigée sur les fichiers chunk corrompus', cl_nxbt_6:'Prise en charge des formats playerdata ajoutée à partir de DataVersion 3953 (Java 1.21+)', cl_nxbt_v202_label:'v2.0.2-beta - première intégration', cl_nxbt_7:'Intégration de base de NXBT-Bridge ajoutée pour l\'édition directe des données joueur et monde', cl_nxbt_v204_label:'v2.0.4 - NXBT-Bridge 3.3.5', cl_nxbt_8:'Légère réduction de la consommation mémoire lors du traitement des fichiers de région volumineux (plus de 50 Mo)', cl_nxbt_9:'Fiabilité accrue de l’enregistrement des données du monde - utilise désormais une écriture atomique pour éviter la corruption du fichier en cas d’échec pendant l’enregistrement', cl_nxbt_10:'Ajout du support des fonctions setExperience() et setExperienceDat() - préparé en avance', cl_204_chg_1:'NXBT-Bridge mis à jour vers la version 3.3.5', cl_204_chg_2:'Les animations de transition et d’apparition (mondes, installation via launcher, accordéon, fenêtres modales) sont désormais encore plus fluides', cl_204_chg_3:'Légère réduction de la taille des fichiers grâce à la suppression de code inutilisé', cl_204_chg_4:'Site du projet vérifié et confirmé dans Google', cl_204_fix_1:'Texte « Aucune donnée » décentré dans la liste vide de l\'inventaire', cl_204_fix_2:'Texte « Aucune donnée » décentré dans la liste vide des statistiques', cl_204_fix_3:'Texte « Aucune donnée » décentré dans la liste vide des sauvegardes', cl_204_fix_4:'Le texte de la liste vide de l\'inventaire ne se mettait pas à jour lors du changement de langue sans rouvrir la carte', cl_204_fix_5:'Le texte de la liste vide des statistiques ne se mettait pas à jour lors du changement de langue sans rouvrir la carte', cl_204_fix_6:'Le texte de la liste vide des sauvegardes ne se mettait pas à jour lors du changement de langue sans rouvrir la carte', cl_204_fix_7:'Style de guillemets incohérent dans une ligne de l\'historique des modifications en chinois', cl_204_fix_8:'Correction d\'un risque de corruption du fichier du monde en cas de crash pendant l\'écriture (passage à une écriture atomique via fichier temporaire)', cl_204_fix_9:'Les erreurs inattendues ne provoquent plus le crash complet de l\'application, elles sont désormais journalisées et l\'application continue de fonctionner',
    err_label:'Erreur', enter_coords:'Entrez les coordonnées X Y Z', backup_deleted:'Sauvegarde supprimée', err_delete:'Erreur de suppression', delete_tooltip:'Supprimer',
    unit_h:'h', unit_m:'min', unit_km:'km', favorite:'Favori', search_worlds_placeholder:'Rechercher des mondes...',
    act_heal:'Santé et faim restaurées', act_teleport:'Téléportation effectuée', act_teleport_spawn:'Téléporté au point d\'apparition',
    act_clear_effects:'Effets supprimés', act_repair_items:'Objets réparés', act_toggle_hardcore:'Hardcore modifié',
    act_revive:'Joueur ressuscité', act_clear_weather:'Météo dégagée - maintenant clair', act_set_day:'Heure réglée sur midi',
    act_set_night:'Heure réglée sur minuit', act_done:'Terminé',
    no_instances_found:'Rien trouvé. Choisis le dossier manuellement.', confirm_title_default:'Confirmation'
  },
  zh: {
    player_status:'玩家状态', health:'生命', hunger:'饥饿', mode:'模式',
    xp_level:'经验等级', hardcore:'极限', world_day:'世界天数', time_of_day:'时间',
    last_death:'上次死亡', position:'位置', actions:'操作',
    actions_cat_player:'玩家', actions_cat_world:'世界',
    heal:'治疗', tp_spawn:'传送到出生点', clear_effects:'清除效果',
    repair:'修复物品', backup:'创建备份', clear_weather:'晴天',
    set_day:'设置为白天', contact_us:'想法或错误', teleport:'传送',
    revive:'复活', worlds:'世界', switch_instance:'切换实例',
    choose_saves:'选择存档文件夹',
    disable_hardcore:'关闭极限模式', enable_hardcore:'开启极限模式',
    hardcore_on:'极限模式已开启', hardcore_off:'极限模式已关闭',
    player_dead_hardcore:'玩家在极限模式中死亡', player_dead:'玩家已死亡',
    yes:'是', no:'否', alive:'存活', dead:'死亡',
    gamemode_s:'生存', gamemode_c:'创造', gamemode_a:'冒险', gamemode_sp:'旁观',
    day:'天', morning:'早晨', noon:'正午', evening:'傍晚', night:'夜晚', midnight:'午夜',
    no_death:'无数据',
    mc_warning:'Minecraft正在运行。请先退出到主菜单再进行修改。',
    confirm_delete_backup:'删除备份？此操作无法撤销。', confirm_title_delete:'删除备份', confirm_title_restore:'恢复世界', cancel:'取消', confirm_ok:'确认',
    agree_btn:'接受条款', decline_btn:'拒绝并退出',
    tech_badge:'技术 NXBT-Bridge 3.3.5 · 直接NBT修补 · 仅限Java 1.21.11',
    where_mc:'Minecraft安装在哪里？', auto_search_desc:'自动检测所有启动器和实例',
    auto_search:'自动检测', auto_search_sub:'Prism, MultiMC, TLauncher',
    manual:'手动', manual_desc:'选择存档文件夹',
    launchers:'启动器', instances:'实例',
    app_sub:'世界编辑器', welcome_title:'欢迎使用Vault',
    welcome_desc:'选择存档文件夹和世界。修改前请先退出到主菜单。',
    applying:'正在应用更改...', saves_not_selected:'未选择存档文件夹',
    ab_tech:'技术', ab_why:'为什么不能给自己任何东西',
    ab_tech_desc:'NXBT-Bridge 3.3.5 - 稳定的补丁引擎，完全重构了compound标签遍历算法。修复了gzip块写入泄漏，添加了补丁前完整性验证。支持DataVersion 3953+（Java 1.21+）。平均补丁时间不足12毫秒。无需启动游戏。3.3.0版本将NBT标签写入速度提升约20%，并修复了读取损坏区块文件的一个罕见错误。3.3.5版本在处理大型region文件（超过50MB）时略微降低了内存占用。',
    ab_lim1_title:'签名绑定限制',
    ab_lim1_desc:'NXBT-Bridge使用静态NBT字段签名。物品栏编辑计划在NXBT-Bridge 4.0中支持。',
    ab_lim2_title:'版本绑定',
    ab_lim2_desc:'偏移量对每个Minecraft版本都是唯一的。当前版本针对Java Edition 1.21.11进行了校准。',
    ab_lim3_title:'开发状态',
    ab_lim3_desc:'Vault正在积极开发中。Venth Team继续对新版本进行逆向工程。',
    ab_eula_title:'用户协议',
    ab_eula1:'本软件由Venth Team开发，不是Mojang Studios或Microsoft Corporation的产品。',
    ab_eula2:'Vault直接修改Minecraft存档文件。用户承担数据安全的全部责任。',
    ab_eula3:'在服务器上使用可能导致账号封禁。请自行承担风险。',
    ab_fine:'接受本协议即表示用户确认所有信息仅供参考。Venth Team不对任何损失承担责任。',
    i_me:'我', i_host:'我（世界主人）', unsupported:'不支持', version_unsupported_warn:'版本不受支持。再次点击以强制打开。',
    set_night:'设置为夜晚', inventory:'物品栏', inv_empty:'无数据',
    stats:'统计', stats_no_file:'未找到统计文件',
    stat_playtime:'游戏时间', stat_deaths:'死亡次数', stat_kills:'击杀生物',
    stat_mined:'挖掘方块', stat_jumps:'跳跃次数', stat_walked:'行走距离',
    backups:'备份', no_backups:'无备份',
    restore:'恢复', restore_confirm:'当前世界状态将被替换。将先创建自动备份。继续？', restore_ok:'世界已恢复',
    no_worlds_found:'未找到存档', searching_instances:'正在搜索实例...', reading_world_data:'正在读取世界数据...', reading_player_data:'正在读取玩家数据...',
    restoring:'正在恢复...', loading:'加载中...', err_reading:'读取错误', email_copied:'邮箱已复制', err_generic:'出了点问题',
    cl_title:'更新日志', cl_subtitle:'Vault 有什么新变化', cl_badge_release:'正式版', cl_badge_prerelease:'预发布', cl_added:'新增', cl_changed:'变更', cl_fixed:'修复', cl_210_add_1:'“玩家”和“世界”操作分类，独立标签页', cl_210_add_2:'世界面板中可折叠的手风琴式区块', cl_210_add_3:'世界数据缓存-重新打开已打开过的世界时不再显示加载界面', cl_210_add_4:'所有消息和通知全面支持6种语言翻译', cl_210_add_5:'按钮和标签点击时的触感反馈', cl_210_add_6:'新增对 PolyMC、GDLauncher、ATLauncher、Technic Launcher 和 CurseForge 的支持', cl_210_add_7:'新增对 Modrinth App、FTB App、XMCL 和 Lunar Client 的支持', cl_210_chg_1:'折叠卡片外观统一、更紧凑', cl_210_chg_2:'高频操作的动画更柔和，弹性效果仅保留给少数过渡动画', cl_210_chg_3:'装饰元素的背景脉动效果更柔和', cl_210_chg_4:'限制了较长的世界/实例列表的出现延迟上限', cl_210_fix_1:'部分情况下玩家昵称显示异常的问题', cl_210_fix_2:'快速切换玩家时的竞态问题', cl_210_fix_3:'背包网格不均匀的问题', cl_210_fix_4:'折叠卡片下方出现空白区域的问题', cl_210_fix_5:'折叠卡片标题文字和箭头被截断的问题', cl_210_fix_6:'卡片折叠动画卡顿的问题', cl_210_fix_7:'快速切换世界时动画混乱堆叠的问题', cl_210_fix_8:'滚动条出现/消失导致界面跳动的问题', cl_210_fix_9:'系统“减少动态效果”设置导致所有动画完全失效的问题', cl_202_add_1:'首个可用的预发布版本：启动器/实例检测，通过NXBT-Bridge直接编辑玩家和世界数据，基础界面', cl_nxbt_title:'NXBT-Bridge 更新历史', cl_nxbt_v203_label:'v2.0.3 - NXBT-Bridge 3.3.0', cl_nxbt_1:'重写了 compound 标签遍历算法', cl_nxbt_2:'修复了写入 gzip 数据块时的泄漏问题', cl_nxbt_3:'新增应用补丁前的完整性校验', cl_nxbt_4:'NBT 标签写入速度提升约20%', cl_nxbt_5:'修复了读取损坏 chunk 文件时的罕见错误', cl_nxbt_6:'新增对 DataVersion 3953 起（Java 1.21+）playerdata 格式的支持', cl_nxbt_v202_label:'v2.0.2-beta - 首次集成', cl_nxbt_7:'新增 NXBT-Bridge 基础集成，用于直接编辑玩家和世界数据', cl_nxbt_v204_label:'v2.0.4 - NXBT-Bridge 3.3.5', cl_nxbt_8:'处理大型 region 文件（超过 50 MB）时略微降低了内存占用', cl_nxbt_9:'提高了世界数据保存的可靠性,现在使用原子写入,防止保存过程中发生故障导致文件损坏', cl_nxbt_10:'添加了 setExperience() 和 setExperienceDat() 函数支持,提前准备', cl_204_chg_1:'将 NXBT-Bridge 更新至 3.3.5 版本', cl_204_chg_2:'过渡和进入动画(世界列表、启动器安装、手风琴、弹窗)现在更加流畅', cl_204_chg_3:'通过移除未使用的代码,略微减小了应用程序的文件大小', cl_204_chg_4:'项目网站已在 Google 中验证并确认', cl_204_fix_1:'库存空列表中“无数据”文字偏移的问题', cl_204_fix_2:'统计空列表中“无数据”文字偏移的问题', cl_204_fix_3:'备份空列表中“无数据”文字偏移的问题', cl_204_fix_4:'库存空列表文字在切换语言后不重新打开卡片就不会更新的问题', cl_204_fix_5:'统计空列表文字在切换语言后不重新打开卡片就不会更新的问题', cl_204_fix_6:'备份空列表文字在切换语言后不重新打开卡片就不会更新的问题', cl_204_fix_7:'更新日志历史记录中一行中文文字引号样式不一致的问题', cl_204_fix_8:'修复了程序在写入数据时崩溃可能导致存档文件损坏的风险(改为通过临时文件进行原子写入)', cl_204_fix_9:'意外错误现在不会导致程序完全崩溃,错误会被记录,程序将继续运行',
    err_label:'错误', enter_coords:'请输入 X Y Z 坐标', backup_deleted:'备份已删除', err_delete:'删除错误', delete_tooltip:'删除',
    unit_h:'时', unit_m:'分', unit_km:'公里', favorite:'收藏', search_worlds_placeholder:'搜索存档...',
    act_heal:'生命和饥饿已恢复', act_teleport:'传送完成', act_teleport_spawn:'已传送到重生点',
    act_clear_effects:'效果已清除', act_repair_items:'物品已修复', act_toggle_hardcore:'极限模式已切换',
    act_revive:'玩家已复活', act_clear_weather:'天气已清除 - 现在晴朗', act_set_day:'时间已设置为正午',
    act_set_night:'时间已设置为午夜', act_done:'完成',
    no_instances_found:'未找到任何内容。请手动选择文件夹。', confirm_title_default:'确认'
  },
  es: {
    player_status:'Estado del jugador', health:'Salud', hunger:'Hambre', mode:'Modo',
    xp_level:'Nivel XP', hardcore:'Hardcore', world_day:'Día del mundo', time_of_day:'Hora',
    last_death:'Última muerte', position:'Posición', actions:'Acciones',
    actions_cat_player:'Jugador', actions_cat_world:'Mundo',
    heal:'Curar', tp_spawn:'TP al spawn', clear_effects:'Borrar efectos',
    repair:'Reparar', backup:'Copia de seguridad', clear_weather:'Cielo despejado',
    set_day:'Hacer de día', contact_us:'Ideas o bugs', teleport:'Teleportar',
    revive:'Revivir', worlds:'MUNDOS', switch_instance:'Cambiar instancia',
    choose_saves:'Elegir carpeta saves',
    disable_hardcore:'Desactivar Hardcore', enable_hardcore:'Activar Hardcore',
    hardcore_on:'Hardcore activado', hardcore_off:'Hardcore desactivado',
    player_dead_hardcore:'Jugador muerto en hardcore', player_dead:'Jugador muerto',
    yes:'Sí', no:'No', alive:'Vivo', dead:'Muerto',
    gamemode_s:'Supervivencia', gamemode_c:'Creativo', gamemode_a:'Aventura', gamemode_sp:'Espectador',
    day:'día', morning:'mañana', noon:'mediodía', evening:'tarde', night:'noche', midnight:'medianoche',
    no_death:'Sin datos',
    mc_warning:'Minecraft está ejecutándose. Sal del mundo al menú principal antes de modificar.',
    confirm_delete_backup:'¿Eliminar copia? Esta acción es irreversible.', confirm_title_delete:'Eliminar', confirm_title_restore:'Restaurar mundo', cancel:'Cancelar', confirm_ok:'Confirmar',
    agree_btn:'Aceptar términos', decline_btn:'Rechazar y salir',
    tech_badge:'Tecnología NXBT-Bridge 3.3.5 · Parcheo NBT directo · Solo Java 1.21.11',
    where_mc:'¿Dónde está instalado Minecraft?', auto_search_desc:'Detección automática de launchers e instancias',
    auto_search:'Detección auto', auto_search_sub:'Prism, MultiMC, TLauncher',
    manual:'Manual', manual_desc:'Elegir carpeta saves',
    launchers:'Launchers', instances:'Instancias',
    app_sub:'Editor de mundo', welcome_title:'Bienvenido a Vault',
    welcome_desc:'Elige una carpeta saves y un mundo. Sal del mundo al menú principal antes de aplicar cambios.',
    applying:'Aplicando cambios...', saves_not_selected:'Sin carpeta saves seleccionada',
    ab_tech:'Tecnología', ab_why:'Por qué no puedes darte todo',
    ab_tech_desc:'NXBT-Bridge 3.3.5 - motor de parcheo estable con algoritmo de recorrido compound rediseñado. Elimina fugas de escritura gzip y añade validación de integridad. Compatible con DataVersion 3953+ (Java 1.21+). Tiempo medio de parcheo inferior a 12ms. La versión 3.3.0 acelera la escritura de etiquetas NBT en aproximadamente un 20% y corrige un error raro al leer archivos de chunk dañados. La versión 3.3.5 reduce ligeramente el uso de memoria al procesar archivos de región grandes (más de 50 MB).',
    ab_lim1_title:'Limitaciones de firma',
    ab_lim1_desc:'NXBT-Bridge usa firmas de campos NBT estáticas. La edición de inventario está planificada para NXBT-Bridge 4.0.',
    ab_lim2_title:'Vinculación de versión',
    ab_lim2_desc:'Los offsets son únicos para cada versión. La build actual está calibrada para Java Edition 1.21.11.',
    ab_lim3_title:'Estado de desarrollo',
    ab_lim3_desc:'Vault está en desarrollo activo. Venth Team continúa el ingeniería inversa de nuevas versiones.',
    ab_eula_title:'Acuerdo de usuario',
    ab_eula1:'Este software fue desarrollado por Venth Team y no es producto de Mojang Studios o Microsoft Corporation.',
    ab_eula2:'Vault modifica directamente los archivos de guardado. El usuario acepta plena responsabilidad.',
    ab_eula3:'El uso en servidores puede resultar en suspensión de cuenta. Úsalo bajo tu propio riesgo.',
    ab_fine:'Al aceptar este acuerdo el usuario confirma que toda la información es solo informativa. Venth Team no es responsable de daños.',
    i_me:'Yo', i_host:'Yo (dueño del mundo)', unsupported:'no soportado', version_unsupported_warn:'Versión no soportada. Haz clic de nuevo para abrir.',
    set_night:'Hacer de noche', inventory:'Inventario', inv_empty:'Sin datos',
    stats:'Estadísticas', stats_no_file:'Archivo de estadísticas no encontrado',
    stat_playtime:'Tiempo de juego', stat_deaths:'Muertes', stat_kills:'Mobs eliminados',
    stat_mined:'Bloques minados', stat_jumps:'Saltos', stat_walked:'Distancia caminada',
    backups:'Copias de seguridad', no_backups:'Sin copias',
    restore:'Restaurar', restore_confirm:'El estado actual será reemplazado. Se creará un backup automático. ¿Continuar?', restore_ok:'Mundo restaurado',
    no_worlds_found:'No se encontraron mundos', searching_instances:'Buscando instancias...', reading_world_data:'Leyendo datos del mundo...', reading_player_data:'Leyendo datos del jugador...',
    restoring:'Restaurando...', loading:'Cargando...', err_reading:'Error de lectura', email_copied:'Correo copiado', err_generic:'Algo salió mal',
    cl_title:'Registro de cambios', cl_subtitle:'Novedades de Vault', cl_badge_release:'Lanzamiento', cl_badge_prerelease:'Versión preliminar', cl_added:'Añadido', cl_changed:'Cambiado', cl_fixed:'Corregido', cl_210_add_1:'Categorías de acciones «Jugador» y «Mundo» con pestañas separadas', cl_210_add_2:'Secciones de acordeón plegables en el panel del mundo', cl_210_add_3:'Caché de datos del mundo: reabrir un mundo ya abierto sin pantalla de carga', cl_210_add_4:'Traducción completa de todos los mensajes a 6 idiomas', cl_210_add_5:'Retroalimentación táctil al pulsar botones y pestañas', cl_210_add_6:'Añadido soporte para PolyMC, GDLauncher, ATLauncher, Technic Launcher y CurseForge', cl_210_add_7:'Añadido soporte para Modrinth App, FTB App, XMCL y Lunar Client', cl_210_chg_1:'Aspecto unificado y compacto de las tarjetas plegadas', cl_210_chg_2:'Animación más suave para acciones frecuentes; el efecto resorte se reserva para transiciones poco frecuentes', cl_210_chg_3:'Pulsación de fondo de los elementos decorativos más calmada', cl_210_chg_4:'Retraso de aparición limitado en listas largas de mundos/instancias', cl_210_fix_1:'Apodos de jugador corruptos en algunos casos', cl_210_fix_2:'Condición de carrera al cambiar rápidamente de jugador', cl_210_fix_3:'Cuadrícula de inventario desigual', cl_210_fix_4:'Espacio vacío bajo las tarjetas plegadas', cl_210_fix_5:'Texto y flecha recortados en los encabezados de tarjetas plegadas', cl_210_fix_6:'Tirones durante la animación de plegado de tarjetas', cl_210_fix_7:'Acumulación caótica de animaciones al cambiar rápido de mundo', cl_210_fix_8:'Desplazamiento del diseño al aparecer/desaparecer la barra de desplazamiento', cl_210_fix_9:'Desactivación total de animaciones por la configuración del sistema «reducir movimiento»', cl_202_add_1:'Primera versión preliminar funcional: detección de launchers/instancias, edición directa de datos de jugador y mundo mediante NXBT-Bridge, interfaz básica', cl_nxbt_title:'Historial de NXBT-Bridge', cl_nxbt_v203_label:'v2.0.3 - NXBT-Bridge 3.3.0', cl_nxbt_1:'Algoritmo de recorrido de etiquetas compound reescrito', cl_nxbt_2:'Corregidas fugas al escribir bloques gzip', cl_nxbt_3:'Añadida validación de integridad antes de aplicar un parche', cl_nxbt_4:'Escritura de etiquetas NBT acelerada en un 20% aproximadamente', cl_nxbt_5:'Corregido un error raro de lectura en archivos chunk dañados', cl_nxbt_6:'Añadido soporte para formatos playerdata desde DataVersion 3953 (Java 1.21+)', cl_nxbt_v202_label:'v2.0.2-beta - primera integración', cl_nxbt_7:'Añadida integración básica de NXBT-Bridge para editar directamente datos de jugador y mundo', cl_nxbt_v204_label:'v2.0.4 - NXBT-Bridge 3.3.5', cl_nxbt_8:'Reducido ligeramente el uso de memoria al procesar archivos de región grandes (más de 50 MB)', cl_nxbt_9:'Mayor fiabilidad al guardar los datos del mundo - ahora se usa escritura atómica para evitar la corrupción del archivo si ocurre un fallo durante el guardado', cl_nxbt_10:'Añadido soporte para las funciones setExperience() y setExperienceDat() - preparado con antelación', cl_204_chg_1:'NXBT-Bridge actualizado a la versión 3.3.5', cl_204_chg_2:'Las animaciones de transición y entrada (mundos, instalación de launcher, acordeón, ventanas modales) son ahora aún más fluidas', cl_204_chg_3:'Tamaño de archivos de la app ligeramente reducido al eliminar código no utilizado', cl_204_chg_4:'Sitio web del proyecto verificado y confirmado en Google', cl_204_fix_1:'Texto «Sin datos» descentrado en la lista vacía de inventario', cl_204_fix_2:'Texto «Sin datos» descentrado en la lista vacía de estadísticas', cl_204_fix_3:'Texto «Sin datos» descentrado en la lista vacía de copias de seguridad', cl_204_fix_4:'El texto de la lista vacía de inventario no se actualizaba al cambiar de idioma sin reabrir la tarjeta', cl_204_fix_5:'El texto de la lista vacía de estadísticas no se actualizaba al cambiar de idioma sin reabrir la tarjeta', cl_204_fix_6:'El texto de la lista vacía de copias de seguridad no se actualizaba al cambiar de idioma sin reabrir la tarjeta', cl_204_fix_7:'Estilo de comillas incoherente en una línea del historial de cambios en chino', cl_204_fix_8:'Corregido un riesgo de corrupción del archivo del mundo si la app se bloqueaba durante la escritura (se cambió a escritura atómica mediante archivo temporal)', cl_204_fix_9:'Los errores inesperados ya no bloquean toda la aplicación, ahora se registran y la app sigue funcionando',
    err_label:'Error', enter_coords:'Introduce las coordenadas X Y Z', backup_deleted:'Copia de seguridad eliminada', err_delete:'Error al eliminar', delete_tooltip:'Eliminar',
    unit_h:'h', unit_m:'min', unit_km:'km', favorite:'Favorito', search_worlds_placeholder:'Buscar mundos...',
    act_heal:'Salud y hambre restauradas', act_teleport:'Teletransporte completado', act_teleport_spawn:'Teletransportado al punto de reaparición',
    act_clear_effects:'Efectos eliminados', act_repair_items:'Objetos reparados', act_toggle_hardcore:'Modo hardcore cambiado',
    act_revive:'Jugador revivido', act_clear_weather:'Clima despejado - ahora despejado', act_set_day:'Hora establecida al mediodía',
    act_set_night:'Hora establecida a medianoche', act_done:'Listo',
    no_instances_found:'No se encontró nada. Elige la carpeta manualmente.', confirm_title_default:'Confirmación'
  }
};

let currentLang = localStorage.getItem('vault_lang') || 'ru';
let favoriteWorlds = new Set(JSON.parse(localStorage.getItem('vault_favorites') || '[]'));
function toggleFavorite(path) {
  if (favoriteWorlds.has(path)) favoriteWorlds.delete(path); else favoriteWorlds.add(path);
  localStorage.setItem('vault_favorites', JSON.stringify([...favoriteWorlds]));
}

function t(key) { return (LANGS[currentLang] || LANGS.ru)[key] || LANGS.ru[key] || key; }

function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    // For elements with HTML (welcome-desc has <br>), use textContent
    el.textContent = translated;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });

  // Dynamic: hc button and hint
  const hcText = $('hc-btn-text');
  const hcHint = $('hc-hint');
  if (hcText) {
    const isHc = state.selectedWorld && state.selectedWorld.hardcore;
    hcText.textContent = isHc ? t('disable_hardcore') : t('enable_hardcore');
  }
  if (hcHint) {
    const isHc = state.selectedWorld && state.selectedWorld.hardcore;
    hcHint.textContent = isHc ? t('hardcore_on') : t('hardcore_off');
  }

  // Revive label
  const reviveLabel = document.querySelector('.revive-label');
  if (reviveLabel) {
    const isHc = state.selectedWorld && state.selectedWorld.hardcore;
    reviveLabel.textContent = isHc ? t('player_dead_hardcore') : t('player_dead');
  }

  // saves-path-label - only if showing default text
  const sbLabel = $('saves-path-label');
  if (sbLabel && !state.savesPath) {
    sbLabel.textContent = t('choose_saves');
  }

  // Loading label
  const loadLabel = document.querySelector('.loading-label');
  if (loadLabel) loadLabel.textContent = t('applying');

  // Re-render panel if world selected
  if (state.selectedWorld && state.playerData) {
    renderPanel(state.selectedWorld, state.playerData);
  }

  // Re-render dynamically-built content so it picks up the new language
  if (state.lastStats !== undefined) renderStats(state.lastStats);
  if (state.lastBackups !== undefined && state.selectedWorld) renderBackups(state.lastBackups, state.selectedWorld.path);
  if (!state.worlds || !state.worlds.length) renderWorlds();
}

$('lang-select').value = currentLang;
$('lang-select').onchange = (e) => {
  currentLang = e.target.value;
  localStorage.setItem('vault_lang', currentLang);
  applyLang();
};

// Apply on load after DOM ready
setTimeout(applyLang, 50);

// === TIME UTILS ===
function formatDayTime(dayTime) {
  const time = ((dayTime % 24000) + 24000) % 24000;
  const days = Math.floor(dayTime / 24000) + 1;
  // MC time: 0=6:00, 6000=12:00, 12000=18:00, 18000=0:00
  const realHour = Math.floor(((time + 6000) % 24000) / 1000);
  const realMin  = Math.floor((((time + 6000) % 24000) % 1000) / (1000/60));
  const hh = String(realHour).padStart(2,'0');
  const mm = String(realMin).padStart(2,'0');

  let period;
  if      (time >= 0    && time < 3000)  period = t('morning');
  else if (time >= 3000 && time < 9000)  period = t('day');
  else if (time >= 9000 && time < 12000) period = t('evening');
  else if (time >= 12000&& time < 18000) period = t('night');
  else                                    period = t('midnight');

  return { days, timeStr: `${hh}:${mm} (${period})` };
}

// === INVENTORY ===
function renderInventory(items) {
  const grid = $('inv-grid');
  if (!items || !items.length) {
    grid.innerHTML = `<div class="inv-empty" data-i18n="inv_empty">${t('inv_empty')}</div>`;
    return;
  }
  const slots = new Array(36).fill(null);
  items.forEach(item => {
    const s = item.slot;
    if (s >= 0 && s < 36) slots[s] = item;
  });
  // Main inventory (9-35) then hotbar (0-8)
  const order = [...Array.from({length:27}, (_,i)=>i+9), ...Array.from({length:9}, (_,i)=>i)];
  grid.innerHTML = order.map(i => {
    const item = slots[i];
    if (!item) return `<div class="inv-slot"></div>`;
    // Full name: capitalize each word
    const fullName = item.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return `<div class="inv-slot" title="${esc(item.id)} x${item.count}">
      <span class="inv-slot-name">${esc(fullName)}</span>
      ${item.count > 1 ? `<span class="inv-slot-count">${item.count}</span>` : ''}
    </div>`;
  }).join('');
}

// === STATS ===
function renderStats(stats) {
  state.lastStats = stats;
  const body = $('stats-body');
  if (!stats) {
    body.innerHTML = `<div class="inv-empty" data-i18n="stats_no_file">${t('stats_no_file')}</div>`;
    return;
  }
  const timeStr = `${stats.hours}${t('unit_h')} ${stats.minutes}${t('unit_m')}`;
  body.innerHTML = `<div class="stats-grid">
    <div class="stat-item"><span class="stat-item-label">${t('stat_playtime')}</span><span class="stat-item-val">${timeStr}</span></div>
    <div class="stat-item"><span class="stat-item-label">${t('stat_deaths')}</span><span class="stat-item-val">${stats.deaths}</span></div>
    <div class="stat-item"><span class="stat-item-label">${t('stat_kills')}</span><span class="stat-item-val">${stats.totalKills}</span></div>
    <div class="stat-item"><span class="stat-item-label">${t('stat_mined')}</span><span class="stat-item-val">${stats.totalMined.toLocaleString()}</span></div>
    <div class="stat-item"><span class="stat-item-label">${t('stat_jumps')}</span><span class="stat-item-val">${stats.jumps.toLocaleString()}</span></div>
    <div class="stat-item"><span class="stat-item-label">${t('stat_walked')}</span><span class="stat-item-val">${stats.kmWalked} ${t('unit_km')}</span></div>
  </div>`;
}

// === BACKUPS ===
function renderBackups(backups, worldPath) {
  state.lastBackups = backups;
  const list = $('backup-list');
  if (!backups || !backups.length) {
    list.innerHTML = `<div class="inv-empty" data-i18n="no_backups">${t('no_backups')}</div>`;
    return;
  }
  list.innerHTML = '';
  backups.forEach(b => {
    const el = document.createElement('div');
    el.className = 'backup-item';
    const date = new Date(b.date).toLocaleString();
    const displayName = b.label || b.name;
    el.innerHTML = `
      <div class="backup-item-info">
        <div class="backup-item-name">${esc(displayName)}</div>
        <div class="backup-item-date">${date}</div>
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button class="backup-item-restore">${t('restore')}</button>
        <button class="backup-item-delete" title="${t('delete_tooltip')}">✕</button>
      </div>
    `;
    el.querySelector('.backup-item-restore').onclick = async () => {
      showConfirm(
        t('restore_confirm'),
        async () => {
          showLoading(t('restoring'));
          const res = await ipcRenderer.invoke('restore-backup', { backupPath: b.path, worldPath });
          hideLoading();
          if (res.success) {
            showToast('success', t('restore_ok'));
            const world = state.selectedWorld;
            if (world) {
              state.playerData = await ipcRenderer.invoke('get-player-data', world.path);
              renderPanel(world, state.playerData);
              const newBackups = await ipcRenderer.invoke('get-backups', world.path);
              renderBackups(newBackups, worldPath);
            }
          } else { showToast('error', res.error || t('err_label')); }
        },
        { title: t('confirm_title_restore'), danger: false, icon: '♻' }
      );
      return; // showConfirm handles async
    };
    el.querySelector('.backup-item-delete').onclick = () => {
      showConfirm(
        t('confirm_delete_backup'),
        async () => {
          const res = await ipcRenderer.invoke('delete-backup', b.path);
          if (res.success) {
            showToast('success', t('backup_deleted'));
            const newBackups = await ipcRenderer.invoke('get-backups', worldPath);
            renderBackups(newBackups, worldPath);
          } else { showToast('error', t('err_delete')); }
        },
        { title: t('confirm_title_delete'), danger: true, icon: '🗑' }
      );
    };
    list.appendChild(el);
  });
}
