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
function showConfirm(text, onOk, { title = 'Подтверждение', danger = true, icon = '⚠️' } = {}) {
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
  showLoading('Ищу инстансы...');
  const instances = await ipcRenderer.invoke('find-all-instances');
  hideLoading();

  if (!instances || instances.length === 0) {
    showLncError('Ничего не найдено. Выбери папку вручную.');
    return;
  }

  if (instances.length === 1) {
    // Only one — go straight in
    await loadSaves(instances[0].saves);
    showScreen('main');
    return;
  }

  // Multiple — show picker
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

  // Fade + slide out old list
  container.style.transition = 'opacity 0.12s ease, transform 0.12s ease';
  container.style.opacity = '0';
  container.style.transform = 'translateX(10px)';

  setTimeout(() => {
    container.innerHTML = '';

    instances.forEach((inst, i) => {
      const el = document.createElement('div');
      el.className = 'lnc-inst-item' + (inst.supported === false ? ' lnc-inst-unsupported' : '');
      el.style.animationDelay = `${i * 45}ms`;

      let verBadge = '';
      if (inst.version && inst.version !== 'неизвестно') {
        if (inst.supported === false) {
          verBadge = `<span class="lnc-ver-badge lnc-ver-unsupported">${esc(inst.version)} — ${t('unsupported')}</span>`;
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

    // Fade + slide in new list
    container.style.transform = 'translateX(-8px)';
    container.offsetHeight; // force reflow
    container.style.transition = 'opacity 0.2s ease, transform 0.28s var(--spring)';
    container.style.opacity = '1';
    container.style.transform = 'translateX(0)';
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
  renderWorlds();
}

// === RENDER WORLDS ===
function renderWorlds() {
  const list = $('worlds-list');
  if (!state.worlds || !state.worlds.length) {
    list.innerHTML = '<div class="worlds-empty">Миры не найдены</div>';
    return;
  }
  list.innerHTML = '';
  state.worlds.forEach(w => {
    const el = document.createElement('div');
    el.className = 'world-item' + (w.hardcore ? ' hardcore' : '');
    el.dataset.path = w.path;
    let badges = '';
    if (w.hardcore)    badges += '<span class="badge badge-hc">Hardcore</span>';
    if (w.gameType===1) badges += '<span class="badge badge-cr">Creative</span>';
    if (w.gameType===2) badges += '<span class="badge badge-adv">Adventure</span>';
    el.innerHTML = `<div class="wi-name">${esc(w.name)}</div><div class="wi-badges">${badges}</div>`;
    el.onclick = () => selectWorld(w, el);
    list.appendChild(el);
  });
}

// === SELECT WORLD ===
async function selectWorld(world, el) {
  document.querySelectorAll('.world-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  state.selectedWorld = world;
  selectedPlayer = null;
  showLoading('Читаю данные мира...');
  try {
    // Load player data, players list, inventory, stats, backups in parallel
    const [playerData, players, inventory, stats, backups] = await Promise.all([
      ipcRenderer.invoke('get-player-data', world.path),
      ipcRenderer.invoke('get-players', world.path).catch(() => []),
      ipcRenderer.invoke('get-inventory', world.path).catch(() => []),
      ipcRenderer.invoke('get-stats', world.path).catch(() => null),
      ipcRenderer.invoke('get-backups', world.path).catch(() => [])
    ]);
    state.playerData = playerData;
    state.cachedPlayers = players;
    hideLoading();
    renderPanel(world, state.playerData);
    renderInventory(inventory);
    renderStats(stats);
    renderBackups(backups, world.path);
  } catch(e) {
    hideLoading();
    showToast('error', 'Ошибка чтения: ' + e.message);
  }
}

// === RENDER PANEL ===
function renderPanel(world, data) {
  $('welcome-screen').classList.add('hidden');
  const panel = $('world-panel');
  panel.classList.remove('hidden');
  panel.style.animation = 'none';
  panel.offsetHeight;
  panel.style.animation = '';

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

  // Hardcore button — based on world.hardcore ONLY, never flip-flop
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

  // Player switcher — use cached list, no delay
  const switchBtn = $('btn-switch-player');
  const cachedPlayers = state.cachedPlayers || [];
  switchBtn.style.display = cachedPlayers.length > 0 ? 'flex' : 'none';
}

// === PLAYER SWITCHER ===
let selectedPlayer = null; // null = host (level.dat), otherwise { uuid, name, datPath }

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
      <span class="player-picker-status ${p.dead ? 'player-picker-dead' : ''}">${p.dead ? 'мёртв' : p.health + ' HP'}</span>
    `;
    el.onclick = async () => {
      selectedPlayer = p;
      $('current-player-name').textContent = p.name;
      $('player-picker').classList.add('hidden');
      // Reload panel data for selected player
      if (state.selectedWorld) {
        showLoading('Читаю данные игрока...');
        try {
          const [inventory, stats] = await Promise.all([
            ipcRenderer.invoke('get-inventory-player', state.selectedWorld.path, p.datPath).catch(() => []),
            ipcRenderer.invoke('get-stats', state.selectedWorld.path).catch(() => null)
          ]);
          // Update player stats display from dat file
          const playerInfo = await ipcRenderer.invoke('get-player-data-from-dat', p.datPath).catch(() => null);
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
  showLoading('Ищу инстансы...');
  const instances = await ipcRenderer.invoke('find-all-instances');
  hideLoading();

  if (!instances || instances.length === 0) {
    // No instances found — just open folder picker
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

// Back button on picker — go back to main if already had a saves path
$('btn-lnc-back').onclick = () => {
  if (state.savesPath) {
    // Already have saves — go back to main
    $('lnc-picker').classList.add('hidden');
    $('lnc-initial').classList.remove('hidden');
    showScreen('main');
  } else {
    $('lnc-picker').classList.add('hidden');
    $('lnc-initial').classList.remove('hidden');
  }
};

// === ABOUT MODAL ===
$('btn-about').onclick = () => {
  const m = $('modal-about');
  m.classList.remove('hidden', 'closing');
  // Force reflow then animate in
  m.offsetHeight;
  m.classList.add('open');
};

function closeModal() {
  const m = $('modal-about');
  m.classList.add('closing');
  m.classList.remove('open');
  setTimeout(() => m.classList.add('hidden'), 280);
}

$('modal-close').onclick = closeModal;
$('modal-about').onclick = e => { if (e.target === $('modal-about')) closeModal(); };

// Copy email on click
document.getElementById('copy-email').onclick = () => {
  navigator.clipboard.writeText('reimumom@duck.com').then(() => {
    showToast('success', 'Почта скопирована');
  }).catch(() => {});
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('modal-about').classList.contains('hidden')) closeModal();
});

// === ACTIONS ===
async function doAction(action, params = {}) {
  if (!state.selectedWorld) return;
  if (selectedPlayer) params.playerDat = selectedPlayer.datPath;
  showLoading('Применяю изменения...');
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
      }
    } else {
      showToast('error', res.error || 'Что-то пошло не так');
    }
  } catch(e) {
    hideLoading();
    showToast('error', 'Ошибка: ' + e.message);
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
    heal:            'Здоровье и голод восстановлены',
    teleport:        'Телепортация выполнена',
    'teleport-spawn':'Телепортирован на спавн',
    'clear-effects': 'Эффекты очищены',
    'repair-items':  'Предметы починены',
    'toggle-hardcore':'Хардкор изменён',
    revive:          'Игрок воскрешён',
    'clear-weather':  'Погода очищена — теперь ясно',
    'set-day':        'Время установлено на полдень',
    'set-night':      'Время установлено на полночь',
  })[a] || 'Готово';
}

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
  if (x==='' || y==='' || z==='') { showToast('error', 'Введи координаты X Y Z'); return; }
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
  $('loading').querySelector('.loading-label').textContent = txt || 'Загрузка...';
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
    tech_badge:'Технология NXBT-Bridge 3.2.5 · Прямой патчинг NBT-структур · Только для Java 1.21.11',
    where_mc:'Где установлен Minecraft?', auto_search_desc:'Автопоиск найдёт все лаунчеры и инстансы',
    auto_search:'Автопоиск', auto_search_sub:'Prism, MultiMC, TLauncher',
    manual:'Вручную', manual_desc:'Выбрать папку saves',
    launchers:'Лаунчеры', instances:'Инстансы',
    app_sub:'World Editor', welcome_title:'Добро пожаловать в Vault',
    welcome_desc:'Выбери папку saves и мир для редактирования. Перед применением изменений выйди из мира в главное меню.',
    applying:'Применяю изменения...', saves_not_selected:'Папка saves не выбрана',
    choose_saves:'Выбрать папку saves',
    ab_tech:'Технология', ab_why:'Почему нельзя выдать себе что угодно',
    ab_tech_desc:'NXBT-Bridge 3.2.5 — стабильный патч-движок с полностью переработанным алгоритмом обхода compound-тегов. Устранены утечки при записи gzip-блоков, добавлена валидация целостности перед применением патча. Поддерживает все форматы playerdata начиная с DataVersion 3953 (Java 1.21+). Среднее время патча — менее 12мс. Без запуска игры.',
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
    ab_fine:'Программное обеспечение предоставляется на условиях "как есть" (AS IS). Разработчик прилагает все усилия для обеспечения стабильности NXBT-Bridge, однако не гарантирует абсолютную совместимость со сторонними модификациями Minecraft и не несёт ответственности за повреждение игровых файлов. Venth Team оставляет за собой право изменять функциональность без предварительного уведомления.',
    i_me:'Я', i_host:'Я (хозяин мира)', unsupported:'не поддерж.', version_unsupported_warn:'Версия не поддерживается. Нажми ещё раз чтобы открыть.',
    set_night:'Сделать ночь', inventory:'Инвентарь', inv_empty:'Нет данных',
    stats:'Статистика', stats_no_file:'Файл статистики не найден',
    stat_playtime:'Время игры', stat_deaths:'Смертей', stat_kills:'Убито мобов',
    stat_mined:'Блоков добыто', stat_jumps:'Прыжков', stat_walked:'Пройдено',
    backups:'Бэкапы', no_backups:'Нет бэкапов',
    restore:'Восстановить', restore_confirm:'Текущее состояние мира будет заменено. Перед этим создастся авто-бэкап. Продолжить?', restore_ok:'Мир восстановлен'
  },
  en: {
    player_status:'Player Status', health:'Health', hunger:'Hunger', mode:'Mode',
    xp_level:'XP Level', hardcore:'Hardcore', world_day:'World Day', time_of_day:'Time of Day',
    last_death:'Last Death', position:'Position', actions:'Actions',
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
    tech_badge:'Technology NXBT-Bridge 3.2.5 · Direct NBT patching · Java 1.21.11 only',
    where_mc:'Where is Minecraft installed?', auto_search_desc:'Auto-detect will find all launchers and instances',
    auto_search:'Auto-detect', auto_search_sub:'Prism, MultiMC, TLauncher',
    manual:'Manual', manual_desc:'Choose saves folder',
    launchers:'Launchers', instances:'Instances',
    app_sub:'World Editor', welcome_title:'Welcome to Vault',
    welcome_desc:'Choose a saves folder and world to edit. Exit the world to main menu before applying changes.',
    applying:'Applying changes...', saves_not_selected:'No saves folder selected',
    choose_saves:'Choose saves folder',
    ab_tech:'Technology', ab_why:'Why you can\'t give yourself anything',
    ab_tech_desc:'NXBT-Bridge 3.2.5 — stable patch engine with fully reworked compound tag traversal. Eliminates gzip block write leaks, adds integrity validation before patching. Supports all playerdata formats from DataVersion 3953 (Java 1.21+). Average patch time under 12ms. No game launch required.',
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
    restore:'Restore', restore_confirm:'Current world state will be replaced. An auto-backup will be created first. Continue?', restore_ok:'World restored'
  },
  de: {
    player_status:'Spielerstatus', health:'Gesundheit', hunger:'Hunger', mode:'Modus',
    xp_level:'XP-Level', hardcore:'Hardcore', world_day:'Welttag', time_of_day:'Tageszeit',
    last_death:'Letzter Tod', position:'Position', actions:'Aktionen',
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
    tech_badge:'Technologie NXBT-Bridge 3.2.5 · Direktes NBT-Patching · Nur Java 1.21.11',
    where_mc:'Wo ist Minecraft installiert?', auto_search_desc:'Automatische Suche findet alle Launcher und Instanzen',
    auto_search:'Automatisch', auto_search_sub:'Prism, MultiMC, TLauncher',
    manual:'Manuell', manual_desc:'Ordner wählen',
    launchers:'Launcher', instances:'Instanzen',
    app_sub:'Welt-Editor', welcome_title:'Willkommen bei Vault',
    welcome_desc:'Wähle einen Saves-Ordner und eine Welt. Verlasse die Welt ins Hauptmenü, bevor du Änderungen vornimmst.',
    applying:'Änderungen anwenden...', saves_not_selected:'Kein Saves-Ordner ausgewählt',
    choose_saves:'Saves-Ordner wählen',
    ab_tech:'Technologie', ab_why:'Warum man sich nicht alles geben kann',
    ab_tech_desc:'NXBT-Bridge 3.2.5 — stabiler Patch-Engine mit überarbeitetem Compound-Tag-Algorithmus. Behebt gzip-Schreibfehler und fügt Integritätsprüfung hinzu. Unterstützt DataVersion 3953+ (Java 1.21+). Durchschnittliche Patchzeit unter 12ms.',
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
    restore:'Wiederherstellen', restore_confirm:'Der aktuelle Weltzustand wird ersetzt. Ein Auto-Backup wird erstellt. Fortfahren?', restore_ok:'Welt wiederhergestellt'
  },
  fr: {
    player_status:'Statut du joueur', health:'Santé', hunger:'Faim', mode:'Mode',
    xp_level:'Niveau XP', hardcore:'Hardcore', world_day:'Jour du monde', time_of_day:'Heure',
    last_death:'Dernière mort', position:'Position', actions:'Actions',
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
    tech_badge:'Technologie NXBT-Bridge 3.2.5 · Patch NBT direct · Java 1.21.11 uniquement',
    where_mc:'Où est installé Minecraft?', auto_search_desc:'La détection automatique trouve tous les lanceurs',
    auto_search:'Détection auto', auto_search_sub:'Prism, MultiMC, TLauncher',
    manual:'Manuel', manual_desc:'Choisir dossier saves',
    launchers:'Lanceurs', instances:'Instances',
    app_sub:'Éditeur de monde', welcome_title:'Bienvenue dans Vault',
    welcome_desc:'Choisissez un dossier saves et un monde. Quittez le monde avant d\'appliquer les modifications.',
    applying:'Application des modifications...', saves_not_selected:'Aucun dossier saves sélectionné',
    choose_saves:'Choisir dossier saves',
    ab_tech:'Technologie', ab_why:'Pourquoi on ne peut pas tout s\'accorder',
    ab_tech_desc:'NXBT-Bridge 3.2.5 — moteur de patch stable avec algorithme de parcours compound remanié. Corrige les fuites d\'écriture gzip et ajoute une validation d\'intégrité. Supporte DataVersion 3953+ (Java 1.21+). Temps de patch moyen inférieur à 12ms.',
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
    restore:'Restaurer', restore_confirm:'L\'état actuel sera remplacé. Une sauvegarde auto sera créée. Continuer?', restore_ok:'Monde restauré'
  },
  zh: {
    player_status:'玩家状态', health:'生命', hunger:'饥饿', mode:'模式',
    xp_level:'经验等级', hardcore:'极限', world_day:'世界天数', time_of_day:'时间',
    last_death:'上次死亡', position:'位置', actions:'操作',
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
    tech_badge:'技术 NXBT-Bridge 3.2.5 · 直接NBT修补 · 仅限Java 1.21.11',
    where_mc:'Minecraft安装在哪里？', auto_search_desc:'自动检测所有启动器和实例',
    auto_search:'自动检测', auto_search_sub:'Prism, MultiMC, TLauncher',
    manual:'手动', manual_desc:'选择存档文件夹',
    launchers:'启动器', instances:'实例',
    app_sub:'世界编辑器', welcome_title:'欢迎使用Vault',
    welcome_desc:'选择存档文件夹和世界。修改前请先退出到主菜单。',
    applying:'正在应用更改...', saves_not_selected:'未选择存档文件夹',
    choose_saves:'选择存档文件夹',
    ab_tech:'技术', ab_why:'为什么不能给自己任何东西',
    ab_tech_desc:'NXBT-Bridge 3.2.5 — 稳定的补丁引擎，完全重构了compound标签遍历算法。修复了gzip块写入泄漏，添加了补丁前完整性验证。支持DataVersion 3953+（Java 1.21+）。平均补丁时间不足12毫秒。无需启动游戏。',
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
    restore:'恢复', restore_confirm:'当前世界状态将被替换。将先创建自动备份。继续？', restore_ok:'世界已恢复'
  },
  es: {
    player_status:'Estado del jugador', health:'Salud', hunger:'Hambre', mode:'Modo',
    xp_level:'Nivel XP', hardcore:'Hardcore', world_day:'Día del mundo', time_of_day:'Hora',
    last_death:'Última muerte', position:'Posición', actions:'Acciones',
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
    tech_badge:'Tecnología NXBT-Bridge 3.2.5 · Parcheo NBT directo · Solo Java 1.21.11',
    where_mc:'¿Dónde está instalado Minecraft?', auto_search_desc:'Detección automática de launchers e instancias',
    auto_search:'Detección auto', auto_search_sub:'Prism, MultiMC, TLauncher',
    manual:'Manual', manual_desc:'Elegir carpeta saves',
    launchers:'Launchers', instances:'Instancias',
    app_sub:'Editor de mundo', welcome_title:'Bienvenido a Vault',
    welcome_desc:'Elige una carpeta saves y un mundo. Sal del mundo al menú principal antes de aplicar cambios.',
    applying:'Aplicando cambios...', saves_not_selected:'Sin carpeta saves seleccionada',
    choose_saves:'Elegir carpeta saves',
    ab_tech:'Tecnología', ab_why:'Por qué no puedes darte todo',
    ab_tech_desc:'NXBT-Bridge 3.2.5 — motor de parcheo estable con algoritmo de recorrido compound rediseñado. Elimina fugas de escritura gzip y añade validación de integridad. Compatible con DataVersion 3953+ (Java 1.21+). Tiempo medio de parcheo inferior a 12ms.',
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
    restore:'Restaurar', restore_confirm:'El estado actual será reemplazado. Se creará un backup automático. ¿Continuar?', restore_ok:'Mundo restaurado'
  }
};

let currentLang = localStorage.getItem('vault_lang') || 'ru';

function t(key) { return (LANGS[currentLang] || LANGS.ru)[key] || LANGS.ru[key] || key; }

function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    // For elements with HTML (welcome-desc has <br>), use textContent
    el.textContent = translated;
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

  // saves-path-label — only if showing default text
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
    grid.innerHTML = `<div class="inv-empty">${t('inv_empty')}</div>`;
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
  const body = $('stats-body');
  if (!stats) {
    body.innerHTML = `<div class="inv-empty">${t('stats_no_file')}</div>`;
    return;
  }
  const timeStr = `${stats.hours}ч ${stats.minutes}м`;
  body.innerHTML = `<div class="stats-grid">
    <div class="stat-item"><span class="stat-item-label">${t('stat_playtime')}</span><span class="stat-item-val">${timeStr}</span></div>
    <div class="stat-item"><span class="stat-item-label">${t('stat_deaths')}</span><span class="stat-item-val">${stats.deaths}</span></div>
    <div class="stat-item"><span class="stat-item-label">${t('stat_kills')}</span><span class="stat-item-val">${stats.totalKills}</span></div>
    <div class="stat-item"><span class="stat-item-label">${t('stat_mined')}</span><span class="stat-item-val">${stats.totalMined.toLocaleString()}</span></div>
    <div class="stat-item"><span class="stat-item-label">${t('stat_jumps')}</span><span class="stat-item-val">${stats.jumps.toLocaleString()}</span></div>
    <div class="stat-item"><span class="stat-item-label">${t('stat_walked')}</span><span class="stat-item-val">${stats.kmWalked} км</span></div>
  </div>`;
}

// === BACKUPS ===
function renderBackups(backups, worldPath) {
  const list = $('backup-list');
  if (!backups || !backups.length) {
    list.innerHTML = `<div class="inv-empty">${t('no_backups')}</div>`;
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
        <button class="backup-item-delete" title="Удалить">✕</button>
      </div>
    `;
    el.querySelector('.backup-item-restore').onclick = async () => {
      showConfirm(
        t('restore_confirm'),
        async () => {
          showLoading('Восстанавливаю...');
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
          } else { showToast('error', res.error || 'Ошибка'); }
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
            showToast('success', 'Бэкап удалён');
            const newBackups = await ipcRenderer.invoke('get-backups', worldPath);
            renderBackups(newBackups, worldPath);
          } else { showToast('error', 'Ошибка удаления'); }
        },
        { title: t('confirm_title_delete'), danger: true, icon: '🗑' }
      );
    };
    list.appendChild(el);
  });
}
