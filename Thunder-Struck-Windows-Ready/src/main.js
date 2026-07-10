const { app, BrowserWindow, shell, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('Thunder Struck');
const APP_VERSION = '1.1.0';
const GITHUB_REPO = 'RMOneill12/Thunder-Struck';

function getWindyKey() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'build-config.json'), 'utf8')).windyApiKey || '';
  } catch { return ''; }
}

function newerVersion(latest, current) {
  const parts = value => value.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const a = parts(latest), b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

ipcMain.handle('search-locations', async (_event, query) => {
  if (!query || query.trim().length < 2) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(query.trim())}`;
  const response = await fetch(url, { headers: { 'User-Agent': `Thunder-Struck/${APP_VERSION} (RMO Productions)` } });
  if (!response.ok) throw new Error('Location search is unavailable');
  return (await response.json()).map(item => ({ name: item.display_name, lat: Number(item.lat), lon: Number(item.lon) }));
});

ipcMain.handle('get-forecast', async (_event, { lat, lon }) => {
  const key = getWindyKey();
  if (!key) return { configured: false };
  const response = await fetch('https://api.windy.com/api/point-forecast/v2', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, model: 'gfs', parameters: ['temp', 'precip', 'wind', 'rh', 'clouds'], levels: ['surface'], key })
  });
  if (!response.ok) throw new Error(`Windy forecast request failed (${response.status})`);
  return { configured: true, data: await response.json() };
});

ipcMain.handle('check-for-updates', async () => {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': `Thunder-Struck/${APP_VERSION}` } });
  if (response.status === 404) return { found: false, reason: 'No published release was found.' };
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  const release = await response.json();
  const asset = release.assets.find(a => /setup.*\.exe$/i.test(a.name)) || release.assets.find(a => /\.exe$/i.test(a.name));
  return { found: newerVersion(release.tag_name, APP_VERSION), version: release.tag_name, url: asset?.browser_download_url || release.html_url };
});

ipcMain.handle('download-update', async (_event, url) => {
  if (!/^https:\/\/github\.com\//i.test(url)) throw new Error('Invalid update address');
  session.defaultSession.downloadURL(url);
  return true;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#07111f',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#07111f', symbolColor: '#ffffff', height: 46 },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
