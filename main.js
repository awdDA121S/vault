const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const zlib = require('zlib');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 700, minWidth: 900, minHeight: 600,
    frame: false, transparent: true,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    show: false
  });
  mainWindow.loadFile('src/index.html');
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Inject CSS to hide status bar element if Electron renders one
    mainWindow.webContents.insertCSS(`
      ::-webkit-status-bar, #statusbar, .statusbar { display: none !important; height: 0 !important; }
    `).catch(() => {});
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  // Intercept status bar update events — returning false suppresses the bar
  mainWindow.webContents.on('update-target-url', (event) => {
    event.preventDefault && event.preventDefault();
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());

ipcMain.handle('select-saves-folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'], title: 'Выбери папку saves'
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('find-tlauncher-saves', async () => {
  const appdata  = process.env.APPDATA  || path.join(os.homedir(), 'AppData', 'Roaming');
  const localapp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

  function scanInstances(instancesDir) {
    if (!fs.existsSync(instancesDir)) return null;
    try {
      const instances = fs.readdirSync(instancesDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => ({
          name: e.name,
          mtime: (() => { try { return fs.statSync(path.join(instancesDir, e.name)).mtimeMs; } catch { return 0; } })()
        }))
        .sort((a, b) => b.mtime - a.mtime);
      for (const inst of instances) {
        const saves = path.join(instancesDir, inst.name, 'minecraft', 'saves');
        if (fs.existsSync(saves)) return saves;
      }
    } catch {}
    return null;
  }

  const prismFound = scanInstances(path.join(appdata, 'PrismLauncher', 'instances'))
    || scanInstances(path.join(localapp, 'PrismLauncher', 'instances'));
  if (prismFound) return prismFound;

  const mmcFound = scanInstances(path.join(appdata, 'MultiMC', 'instances'))
    || scanInstances(path.join(os.homedir(), 'MultiMC', 'instances'));
  if (mmcFound) return mmcFound;

  const tl = path.join(appdata, '.tlauncher', 'minecraft', 'game', 'saves');
  if (fs.existsSync(tl)) return tl;

  const vanilla = path.join(appdata, '.minecraft', 'saves');
  if (fs.existsSync(vanilla)) return vanilla;

  return null;
});

// Get all available instances across all launchers
ipcMain.handle('find-all-instances', async () => {
  const appdata  = process.env.APPDATA  || path.join(os.homedir(), 'AppData', 'Roaming');
  const localapp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const results  = [];

  // Try to detect MC version from instance folder
  function detectVersion(instanceDir) {
    try {
      // Prism/MultiMC: mmc-pack.json
      const mmcPack = path.join(instanceDir, 'mmc-pack.json');
      if (fs.existsSync(mmcPack)) {
        const data = JSON.parse(fs.readFileSync(mmcPack, 'utf8'));
        const comp = (data.components || []).find(c => c.uid === 'net.minecraft');
        if (comp && comp.version) return comp.version;
      }
      // Prism: instance.cfg
      const cfg = path.join(instanceDir, 'instance.cfg');
      if (fs.existsSync(cfg)) {
        const text = fs.readFileSync(cfg, 'utf8');
        const m = text.match(/IntendedVersion=([^\r\n]+)/);
        if (m) return m[1].trim();
      }
      // Vanilla / TLauncher: minecraft/version.json inside instance
      const verJson = path.join(instanceDir, 'minecraft', 'version.json');
      if (fs.existsSync(verJson)) {
        const data = JSON.parse(fs.readFileSync(verJson, 'utf8'));
        if (data.id) return data.id;
      }
    } catch {}
    return null;
  }

  // For standalone saves folders (vanilla, TLauncher) — look for version.json one level up
  function detectVersionFromSaves(savesPath) {
    try {
      // Go up from saves to .minecraft root
      const mcRoot = path.dirname(savesPath);
      // Check versions folder for most recent version
      const versionsDir = path.join(mcRoot, 'versions');
      if (fs.existsSync(versionsDir)) {
        const vers = fs.readdirSync(versionsDir, { withFileTypes: true })
          .filter(e => e.isDirectory())
          .map(e => ({
            name: e.name,
            mtime: (() => { try { return fs.statSync(path.join(versionsDir, e.name)).mtimeMs; } catch { return 0; } })()
          }))
          .sort((a, b) => b.mtime - a.mtime);
        if (vers.length > 0) return vers[0].name;
      }
    } catch {}
    return null;
  }

  // Check if version is supported (1.21.x where x >= 4, or exactly 1.21.11)
  function versionSupported(ver) {
    if (!ver) return null; // unknown
    // Supported: 1.21.4 and above (they share similar NBT structure)
    const m = ver.match(/^1\.(\d+)\.(\d+)/);
    if (m) {
      const minor = parseInt(m[1]);
      const patch = parseInt(m[2]);
      if (minor > 21) return true;
      if (minor === 21 && patch >= 4) return true;
      return false;
    }
    return null;
  }

  function scanInstances(instancesDir, launcherName) {
    if (!fs.existsSync(instancesDir)) return;
    try {
      const instances = fs.readdirSync(instancesDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => ({
          name: e.name,
          mtime: (() => { try { return fs.statSync(path.join(instancesDir, e.name)).mtimeMs; } catch { return 0; } })()
        }))
        .sort((a, b) => b.mtime - a.mtime);
      for (const inst of instances) {
        const instPath = path.join(instancesDir, inst.name);
        const saves = path.join(instPath, 'minecraft', 'saves');
        if (fs.existsSync(saves)) {
          const version = detectVersion(instPath);
          const supported = versionSupported(version);
          results.push({
            launcher: launcherName,
            name: inst.name,
            saves,
            version: version || 'неизвестно',
            supported, // true=OK, false=не поддерживается, null=неизвестно
            mtime: inst.mtime
          });
        }
      }
    } catch {}
  }

  scanInstances(path.join(appdata,  'PrismLauncher', 'instances'), 'Prism Launcher');
  scanInstances(path.join(localapp, 'PrismLauncher', 'instances'), 'Prism Launcher');
  scanInstances(path.join(appdata,  'MultiMC', 'instances'), 'MultiMC');
  scanInstances(path.join(os.homedir(), 'MultiMC', 'instances'), 'MultiMC');

  const tl = path.join(appdata, '.tlauncher', 'minecraft', 'game', 'saves');
  if (fs.existsSync(tl)) {
    const ver = detectVersionFromSaves(tl);
    results.push({ launcher: 'TLauncher', name: 'TLauncher', saves: tl, version: ver, supported: versionSupported(ver), mtime: 0 });
  }

  const vanilla = path.join(appdata, '.minecraft', 'saves');
  if (fs.existsSync(vanilla)) {
    const ver = detectVersionFromSaves(vanilla);
    results.push({ launcher: 'Minecraft', name: '.minecraft', saves: vanilla, version: ver, supported: versionSupported(ver), mtime: 0 });
  }

  const seen = new Set();
  return results.filter(r => { if (seen.has(r.saves)) return false; seen.add(r.saves); return true; });
});

ipcMain.handle('get-worlds', async (_, savesPath) => {
  try {
    if (!fs.existsSync(savesPath)) return [];
    const entries = fs.readdirSync(savesPath, { withFileTypes: true });
    const worlds = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const wp   = path.join(savesPath, e.name);
      const ldat = path.join(wp, 'level.dat');
      if (!fs.existsSync(ldat)) continue;
      let info = { name: e.name, hardcore: false, gameType: 0, lastPlayed: 0 };
      try { info = await parseWorldInfo(ldat); } catch(err) {
        console.error('parseWorldInfo failed:', e.name, err.message);
      }
      worlds.push({ folder: e.name, path: wp, ...info });
    }
    worlds.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
    return worlds;
  } catch(err) {
    console.error('get-worlds error:', err.message);
    return [];
  }
});

ipcMain.handle('get-player-data', async (_, worldPath) => {
  try {
    const ldat = path.join(worldPath, 'level.dat');
    const worldInfo = await parseWorldInfo(ldat);

    // In singleplayer, player data is stored in level.dat → Data.Player
    // playerdata/*.dat is only used on servers
    const playerInfo = await parsePlayerFromLevelDat(ldat);

    return { ...worldInfo, ...playerInfo };
  } catch(err) {
    console.error('get-player-data error:', err.message);
    return { error: err.message };
  }
});

ipcMain.handle('apply-action', async (_, { worldPath, action, params }) => {
  try {
    const ldat = path.join(worldPath, 'level.dat');
    // If a specific player dat is selected (multiplayer), use it directly
    const playerDat = params && params.playerDat ? params.playerDat : null;
    switch (action) {
      case 'toggle-hardcore':  await toggleHardcore(ldat, params.enable); break;
      case 'revive':           await (playerDat ? revivePlayerDat(playerDat) : revivePlayer(ldat)); break;
      case 'heal':             await (playerDat ? healPlayerDat(playerDat) : healPlayer(ldat)); break;
      case 'teleport':         await (playerDat ? teleportPlayerDat(playerDat, params.x, params.y, params.z) : teleportPlayer(ldat, params.x, params.y, params.z)); break;
      case 'teleport-spawn':   await (playerDat ? teleportToSpawnDat(playerDat) : teleportToSpawn(ldat)); break;
      case 'clear-effects':    await (playerDat ? clearEffectsDat(playerDat) : clearEffects(ldat)); break;
      case 'repair-items':     await (playerDat ? repairItemsDat(playerDat) : repairItems(ldat)); break;
      case 'clear-weather':    await clearWeather(ldat); break;
      case 'set-day':          await setDay(ldat); break;
      case 'set-night':        await setNight(ldat); break;
      case 'backup':           await backupWorld(worldPath, params && params.name); break;
    }
    return { success: true };
  } catch(err) {
    console.error('apply-action error:', action, err.message);
    return { success: false, error: err.message };
  }
});

// Get inventory
ipcMain.handle('get-inventory', async (_, worldPath) => {
  try {
    const ldat = path.join(worldPath, 'level.dat');
    const { parsed } = await readNBT(ldat);
    const Data = v(v(parsed).Data);
    if (!Data.Player) return [];
    const d = v(Data.Player);
    const invTag = d.Inventory;
    if (!invTag) return [];
    const lt = v(invTag);
    const items = lt && lt.value ? lt.value : [];
    return items.map(item => {
      const iv = v(item) || {};
      const id = v(iv.id) || '';
      const count = v(iv.count) || v(iv.Count) || 1;
      const slot = v(iv.slot) || v(iv.Slot) || 0;
      const name = id.replace('minecraft:', '').replace(/_/g, ' ');
      return { id, count, slot, name };
    }).filter(i => i.id && i.id !== 'minecraft:air');
  } catch { return []; }
});

// Get stats
ipcMain.handle('get-stats', async (_, worldPath) => {
  try {
    const statsDir = path.join(worldPath, 'stats');
    if (!fs.existsSync(statsDir)) return null;
    const files = fs.readdirSync(statsDir).filter(f => f.endsWith('.json'));
    if (!files.length) return null;
    files.sort((a,b) => fs.statSync(path.join(statsDir,b)).mtimeMs - fs.statSync(path.join(statsDir,a)).mtimeMs);
    const data = JSON.parse(fs.readFileSync(path.join(statsDir, files[0]), 'utf8'));
    const stats = data.stats || data;
    const custom = stats['minecraft:custom'] || {};
    const killed = stats['minecraft:killed'] || {};
    const mined = stats['minecraft:mined'] || {};
    const totalKills = Object.values(killed).reduce((a,b) => a+b, 0);
    const totalMined = Object.values(mined).reduce((a,b) => a+b, 0);
    const playTime = custom['minecraft:play_time'] || custom['minecraft:play_one_minute'] || 0;
    const deaths = custom['minecraft:deaths'] || 0;
    const jumps = custom['minecraft:jump'] || 0;
    const walked = custom['minecraft:walk_one_cm'] || 0;
    const hours = Math.floor(playTime / 72000);
    const minutes = Math.floor((playTime % 72000) / 1200);
    const kmWalked = (walked / 100000).toFixed(1);
    return { hours, minutes, deaths, totalKills, totalMined, jumps, kmWalked };
  } catch { return null; }
});

// Get backups list
ipcMain.handle('get-backups', async (_, worldPath) => {
  try {
    const backupDir = path.join(path.dirname(worldPath), '_vault_backups');
    if (!fs.existsSync(backupDir)) return [];
    const worldName = path.basename(worldPath);
    const entries = fs.readdirSync(backupDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name.startsWith(worldName + '_'))
      .map(e => {
        const fullPath = path.join(backupDir, e.name);
        const mtime = fs.statSync(fullPath).mtimeMs;
        // Extract custom name if present
        const rest = e.name.slice(worldName.length + 1);
        // Try parse as date: YYYY-MM-DDTHH-MM-SS
        const dateMatch = rest.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})(.*)$/);
        let date = mtime, label = rest;
        if (dateMatch) {
          label = dateMatch[2] ? dateMatch[2].replace(/^_/, '') : '';
          date = new Date(dateMatch[1].replace('T','T').replace(/-(\d{2})-(\d{2})$/, ':$1:$2')).getTime() || mtime;
        }
        return { name: e.name, label: label || e.name, date: mtime, path: fullPath };
      })
      .sort((a,b) => b.date - a.date);
    return entries.slice(0, 20); // max 20
  } catch { return []; }
});

// Restore backup
ipcMain.handle('restore-backup', async (_, { backupPath, worldPath }) => {
  try {
    await backupWorld(worldPath);
    function copyDir(src, dst) {
      fs.mkdirSync(dst, { recursive: true });
      for (const e of fs.readdirSync(dst, { withFileTypes: true })) {
        const dp = path.join(dst, e.name);
        if (e.isDirectory()) fs.rmSync(dp, { recursive: true });
        else fs.unlinkSync(dp);
      }
      for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name), d = path.join(dst, e.name);
        if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
      }
    }
    copyDir(backupPath, worldPath);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('delete-backup', async (_, backupPath) => {
  try {
    fs.rmSync(backupPath, { recursive: true, force: true });
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

// Read player data directly from a playerdata .dat file
ipcMain.handle('get-player-data-from-dat', async (_, datPath) => {
  try {
    const { parsed } = await readNBT(datPath);
    const d = v(parsed);
    const health = v(d.Health);
    const hp = typeof health === 'number' ? health : 20;
    const foodRaw = v(d.foodLevel) !== undefined ? v(d.foodLevel) : v(d.FoodLevel);
    const foodLevel = typeof foodRaw === 'number' ? foodRaw : 20;
    const xpLevel = v(d.XpLevel) || 0;
    let pos = [0, 64, 0];
    const posTag = d.Pos;
    if (posTag) {
      const posInner = v(posTag);
      const posArr = posInner && posInner.value ? posInner.value : (Array.isArray(posInner) ? posInner : null);
      if (posArr && posArr.length >= 3) {
        pos = posArr.map(x => Math.round(typeof x === 'object' ? v(x) : x));
      }
    }
    const deathTime = v(d.DeathTime) || 0;
    const dead = hp <= 0 || deathTime > 0;
    return { health: hp, foodLevel, xpLevel, pos, dead };
  } catch { return null; }
});

// Get inventory from a specific playerdata file
ipcMain.handle('get-inventory-player', async (_, worldPath, datPath) => {
  try {
    const { parsed } = await readNBT(datPath);
    const d = v(parsed);
    const invTag = d.Inventory;
    if (!invTag) return [];
    const lt = v(invTag);
    const items = lt && lt.value ? lt.value : [];
    return items.map(item => {
      const iv = v(item) || {};
      const id = v(iv.id) || '';
      const count = v(iv.count) || v(iv.Count) || 1;
      const slot = v(iv.slot) || v(iv.Slot) || 0;
      const name = id.replace('minecraft:', '').replace(/_/g, ' ');
      return { id, count, slot, name };
    }).filter(i => i.id && i.id !== 'minecraft:air');
  } catch { return []; }
});

ipcMain.handle('get-players', async (_, worldPath) => {
  try {
    const dir = path.join(worldPath, 'playerdata');
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.dat') && !f.includes('_old'));
    if (!files.length) return [];

    const players = [];
    for (const file of files) {
      const rawName = file.replace('.dat', '');
      const datPath = path.join(dir, file);
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawName);
      // Show short UUID or filename as name — fast, no network
      const name = isUUID ? rawName.slice(0, 8) : rawName;
      let health = 20, dead = false;
      try {
        const { parsed } = await readNBT(datPath);
        const d = v(parsed);
        const hp = v(d.Health);
        health = typeof hp === 'number' ? Math.round(hp) : 20;
        dead = health <= 0 || (v(d.DeathTime) || 0) > 0;
      } catch {}
      players.push({ uuid: rawName, name, datPath, health, dead, nameResolved: false });
    }
    return players;
  } catch { return []; }
});

// Resolve player names - returns names from filenames only, no network
ipcMain.handle('resolve-player-names', async (_, players) => {
  return players.map(p => ({ ...p, nameResolved: true }));
});

// ─── FILE HELPERS ──────────────────────────────────────────────────────────

function findPlayerDat(worldPath) {
  const dir = path.join(worldPath, 'playerdata');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.dat') && !f.includes('_old'));
  if (!files.length) return null;
  files.sort((a, b) =>
    fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs
  );
  return path.join(dir, files[0]);
}

async function readNBT(filePath) {
  const pnbt = require('prismarine-nbt');
  const buf = fs.readFileSync(filePath);
  return await pnbt.parse(buf);
}

function writeNBT(filePath, parsed) {
  const pnbt = require('prismarine-nbt');
  const raw = pnbt.writeUncompressed(parsed);
  fs.writeFileSync(filePath, zlib.gzipSync(raw));
}

// Extract value from NBT tag wrapper { type, value } or plain value
function v(tag) {
  if (tag === undefined || tag === null) return undefined;
  if (typeof tag === 'object' && 'value' in tag) return tag.value;
  return tag;
}

// ─── PARSE ────────────────────────────────────────────────────────────────

async function parseWorldInfo(levelDat) {
  const { parsed } = await readNBT(levelDat);
  // Structure: parsed = { type:'compound', value:{ Data:{ type:'compound', value:{...} } } }
  const Data = v(v(parsed).Data);

  const lpRaw = v(Data.LastPlayed);
  let lastPlayed = 0;
  if (lpRaw) {
    if (typeof lpRaw === 'object' && typeof lpRaw.toNumber === 'function') lastPlayed = lpRaw.toNumber();
    else if (Array.isArray(lpRaw)) lastPlayed = lpRaw[0] * 4294967296 + lpRaw[1]; // Long as [hi, lo]
    else lastPlayed = Number(lpRaw) || 0;
  }

  const hc = v(Data.hardcore);
  const hardcore = hc === 1 || hc === true;

  // World spawn — stored as Data.spawn compound OR Data.SpawnX/Y/Z
  let spawnX = 0, spawnY = 64, spawnZ = 0;
  if (Data.spawn) {
    const sp = v(Data.spawn);
    spawnX = v(sp.x) || 0;
    spawnY = v(sp.y) || 64;
    spawnZ = v(sp.z) || 0;
  } else {
    spawnX = v(Data.SpawnX) || 0;
    spawnY = v(Data.SpawnY) || 64;
    spawnZ = v(Data.SpawnZ) || 0;
  }

  return {
    name:      v(Data.LevelName) || 'Unknown',
    hardcore,
    gameType:  v(Data.GameType) || 0,
    spawnX, spawnY, spawnZ,
    lastPlayed,
    dayTime:   (() => {
      const dt = v(Data.DayTime);
      if (!dt) return 0;
      if (typeof dt === 'object' && dt.toNumber) return dt.toNumber();
      if (Array.isArray(dt)) return dt[0] * 4294967296 + dt[1];
      return Number(dt) || 0;
    })(),
    lastDeathX: v(Data.Player) ? (() => {
      const P = v(Data.Player);
      if (!P || !P.LastDeathLocation) return null;
      const ldl = v(P.LastDeathLocation);
      if (!ldl || !ldl.pos) return null;
      const pos = v(ldl.pos);
      if (!pos) return null;
      const arr = Array.isArray(pos) ? pos : (pos.value ? pos.value : null);
      return arr ? arr.map(x => Math.round(typeof x === 'object' ? v(x) : x)) : null;
    })() : null
  };
}

async function parsePlayerFromLevelDat(levelDat) {
  const { parsed } = await readNBT(levelDat);
  const Data = v(v(parsed).Data);
  // Singleplayer stores player in Data.Player
  if (!Data.Player) {
    return { health: 20, foodLevel: 20, xpLevel: 0, pos: [0,64,0], dead: false };
  }
  const d = v(Data.Player);

  const health = v(d.Health);
  const hp = typeof health === 'number' ? health : 20;

  const foodRaw = v(d.foodLevel) !== undefined ? v(d.foodLevel) : v(d.FoodLevel);
  const foodLevel = typeof foodRaw === 'number' ? foodRaw : 20;

  const xpLevel = v(d.XpLevel) || 0;

  let pos = [0, 64, 0];
  const posTag = d.Pos;
  if (posTag) {
    const posInner = v(posTag);
    const posArr = posInner && posInner.value ? posInner.value : (Array.isArray(posInner) ? posInner : null);
    if (posArr && posArr.length >= 3) {
      pos = posArr.map(x => Math.round(typeof x === 'object' ? v(x) : x));
    }
  }

  let spawnX, spawnY, spawnZ;
  if (d.respawn) {
    const rsp = v(d.respawn);
    if (rsp && rsp.pos) {
      const rposArr = v(rsp.pos);
      if (rposArr && Array.isArray(rposArr)) {
        spawnX = rposArr[0]; spawnY = rposArr[1]; spawnZ = rposArr[2];
      }
    }
  } else {
    spawnX = v(d.SpawnX); spawnY = v(d.SpawnY); spawnZ = v(d.SpawnZ);
  }

  const deathTime = v(d.DeathTime) || 0;
  const dead = hp <= 0 || deathTime > 0;

  return { health: hp, foodLevel, xpLevel, pos, spawnX, spawnY, spawnZ, dead };
}

// ─── ACTIONS — all operate on level.dat → Data.Player ─────────────────────

// Helper: get player compound from level.dat
async function withPlayer(levelDat, fn) {
  const { parsed } = await readNBT(levelDat);
  const Data = v(v(parsed).Data);
  if (!Data.Player) throw new Error('Данные игрока не найдены в level.dat. Войди в мир хотя бы раз.');
  const player = v(Data.Player);
  await fn(player, Data, parsed);
  writeNBT(levelDat, parsed);
}

async function toggleHardcore(levelDat, enable) {
  const { parsed } = await readNBT(levelDat);
  const Data = v(v(parsed).Data);
  Data.hardcore = { type: 'byte', value: enable ? 1 : 0 };
  writeNBT(levelDat, parsed);
}

async function healPlayer(levelDat) {
  await withPlayer(levelDat, async (d) => {
    d.Health = { type: 'float', value: 20.0 };
    if (d.foodLevel !== undefined) {
      d.foodLevel           = { type: 'int',   value: 20  };
      d.foodSaturationLevel = { type: 'float', value: 5.0 };
      d.foodExhaustionLevel = { type: 'float', value: 0.0 };
    } else {
      d.FoodLevel           = { type: 'int',   value: 20  };
      d.FoodSaturationLevel = { type: 'float', value: 5.0 };
      d.FoodExhaustionLevel = { type: 'float', value: 0.0 };
    }
  });
}

async function revivePlayer(levelDat) {
  // Disable hardcore first so world isn't deleted on load
  await toggleHardcore(levelDat, false);
  await withPlayer(levelDat, async (d) => {
    d.Health = { type: 'float', value: 20.0 };
    if (d.foodLevel !== undefined) {
      d.foodLevel           = { type: 'int',   value: 20  };
      d.foodSaturationLevel = { type: 'float', value: 5.0 };
      d.foodExhaustionLevel = { type: 'float', value: 0.0 };
    } else {
      d.FoodLevel           = { type: 'int',   value: 20  };
      d.FoodSaturationLevel = { type: 'float', value: 5.0 };
      d.FoodExhaustionLevel = { type: 'float', value: 0.0 };
    }
    d.DeathTime  = { type: 'short', value: 0 };
    d.DeathScore = { type: 'int',   value: 0 };
  });
  // Re-enable hardcore after revive
  await toggleHardcore(levelDat, true);
}

async function teleportPlayer(levelDat, x, y, z) {
  await withPlayer(levelDat, async (d) => {
    d.Pos = { type: 'list', value: { type: 'double', value: [parseFloat(x), parseFloat(y), parseFloat(z)] } };
  });
}

async function teleportToSpawn(levelDat) {
  await withPlayer(levelDat, async (d) => {
    // Simply delete Pos — game will respawn player at spawn point on next load
    // This avoids spawning underground or at wrong Y
    delete d.Pos;
  });
}

async function clearEffects(levelDat) {
  await withPlayer(levelDat, async (d) => {
    const empty = { type: 'list', value: { type: 'compound', value: [] } };
    d.ActiveEffects  = empty;
    d.active_effects = empty;
  });
}

async function repairItems(levelDat) {
  await withPlayer(levelDat, async (d) => {
    function repairSlot(item) {
      if (!item) return;
      const iv = typeof item === 'object' && item.value ? item.value : item;
      if (!iv) return;
      // Old format: tag.Damage
      if (iv.tag) { const tv = v(iv.tag); if (tv && tv.Damage !== undefined) tv.Damage = { type: 'int', value: 0 }; }
      // 1.20.5+ components format
      if (iv.components) { const cv = v(iv.components); if (cv) delete cv['minecraft:damage']; }
      // Direct Damage field
      if (iv.Damage !== undefined) iv.Damage = { type: 'short', value: 0 };
    }
    function repairList(listTag) {
      if (!listTag) return;
      const lt = v(listTag);
      const items = lt && lt.value ? lt.value : (Array.isArray(lt) ? lt : []);
      for (const item of items) repairSlot(item);
    }
    // All possible inventory locations
    repairList(d.Inventory);
    repairList(d.EnderItems);
    repairList(d.HandItems);
    repairList(d.ArmorItems);
    // 1.21+ equipment compound: { head, chest, legs, feet, mainhand, offhand }
    if (d.equipment) {
      const eq = v(d.equipment);
      if (eq && typeof eq === 'object') {
        for (const slot of Object.values(eq)) {
          repairSlot(slot);
        }
      }
    }
  });
}

// ─── PLAYERDATA DAT FUNCTIONS (for multiplayer / other players) ────────────

function applyToPlayerDat(datPath, fn) {
  return new Promise(async (resolve, reject) => {
    try {
      const { parsed } = await readNBT(datPath);
      const d = v(parsed);
      await fn(d);
      writeNBT(datPath, parsed);
      resolve();
    } catch(e) { reject(e); }
  });
}

async function healPlayerDat(datPath) {
  await applyToPlayerDat(datPath, async (d) => {
    d.Health = { type: 'float', value: 20.0 };
    if (d.foodLevel !== undefined) {
      d.foodLevel = { type: 'int', value: 20 };
      d.foodSaturationLevel = { type: 'float', value: 5.0 };
      d.foodExhaustionLevel = { type: 'float', value: 0.0 };
    } else {
      d.FoodLevel = { type: 'int', value: 20 };
      d.FoodSaturationLevel = { type: 'float', value: 5.0 };
    }
  });
}

async function revivePlayerDat(datPath) {
  await applyToPlayerDat(datPath, async (d) => {
    d.Health = { type: 'float', value: 20.0 };
    if (d.foodLevel !== undefined) {
      d.foodLevel = { type: 'int', value: 20 };
      d.foodSaturationLevel = { type: 'float', value: 5.0 };
    } else {
      d.FoodLevel = { type: 'int', value: 20 };
    }
    d.DeathTime = { type: 'short', value: 0 };
    d.DeathScore = { type: 'int', value: 0 };
  });
}

async function teleportPlayerDat(datPath, x, y, z) {
  await applyToPlayerDat(datPath, async (d) => {
    d.Pos = { type: 'list', value: { type: 'double', value: [parseFloat(x), parseFloat(y), parseFloat(z)] } };
  });
}

async function teleportToSpawnDat(datPath) {
  await applyToPlayerDat(datPath, async (d) => { delete d.Pos; });
}

async function clearEffectsDat(datPath) {
  await applyToPlayerDat(datPath, async (d) => {
    const empty = { type: 'list', value: { type: 'compound', value: [] } };
    d.ActiveEffects = empty;
    d.active_effects = empty;
  });
}

async function repairItemsDat(datPath) {
  await applyToPlayerDat(datPath, async (d) => {
    function repairSlot(item) {
      if (!item) return;
      const iv = typeof item === 'object' && item.value ? item.value : item;
      if (!iv) return;
      if (iv.tag) { const tv = v(iv.tag); if (tv && tv.Damage !== undefined) tv.Damage = { type: 'int', value: 0 }; }
      if (iv.components) { const cv = v(iv.components); if (cv) delete cv['minecraft:damage']; }
      if (iv.Damage !== undefined) iv.Damage = { type: 'short', value: 0 };
    }
    function repairList(lt) {
      const items = lt && v(lt) && v(lt).value ? v(lt).value : (Array.isArray(v(lt)) ? v(lt) : []);
      for (const item of items) repairSlot(item);
    }
    repairList(d.Inventory); repairList(d.EnderItems);
    if (d.equipment) { const eq = v(d.equipment); if (eq) for (const s of Object.values(eq)) repairSlot(s); }
  });
}

async function setNight(levelDat) {
  const { parsed } = await readNBT(levelDat);
  const Data = v(v(parsed).Data);
  const cur = v(Data.DayTime);
  const curNum = typeof cur === 'object' && cur && cur.toNumber ? cur.toNumber() : (Number(cur) || 0);
  const days = Math.floor(curNum / 24000);
  const nightTime = days * 24000 + 18000; // 18000 = midnight
  Data.DayTime = { type: 'long', value: [Math.floor(nightTime / 4294967296), nightTime % 4294967296] };
  writeNBT(levelDat, parsed);
}

async function setDay(levelDat) {
  const { parsed } = await readNBT(levelDat);
  const Data = v(v(parsed).Data);
  // Set time to 6000 = noon (day)
  const cur = v(Data.DayTime);
  const curNum = typeof cur === 'object' && cur && cur.toNumber ? cur.toNumber() : (Number(cur) || 0);
  // Keep day count, set time to 6000 (noon)
  const days = Math.floor(curNum / 24000);
  Data.DayTime = { type: 'long', value: [Math.floor((days * 24000 + 6000) / 4294967296), (days * 24000 + 6000) % 4294967296] };
  writeNBT(levelDat, parsed);
}

async function clearWeather(levelDat) {
  const { parsed } = await readNBT(levelDat);
  const Data = v(v(parsed).Data);
  // Stop rain and thunder
  Data.raining         = { type: 'byte',  value: 0 };
  Data.thundering      = { type: 'byte',  value: 0 };
  Data.rainTime        = { type: 'int',   value: 168000 }; // 7 game days of clear weather
  Data.thunderTime     = { type: 'int',   value: 168000 };
  Data.clearWeatherTime= { type: 'int',   value: 168000 };
  writeNBT(levelDat, parsed);
}

async function backupWorld(worldPath, customName) {
  const worldName = path.basename(worldPath);
  const backupDir = path.join(path.dirname(worldPath), '_vault_backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const suffix = customName ? `_${customName.replace(/[^a-zA-Zа-яА-ЯёЁ0-9 _-]/g, '').trim()}` : '';
  const dest = path.join(backupDir, `${worldName}_${ts}${suffix}`);
  function copyDir(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, e.name), dd = path.join(dst, e.name);
      if (e.isDirectory()) copyDir(s, dd); else fs.copyFileSync(s, dd);
    }
  }
  copyDir(worldPath, dest);
}
