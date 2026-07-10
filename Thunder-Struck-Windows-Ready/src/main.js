const { app, BrowserWindow, shell, ipcMain, session, Tray, Menu, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('Thunder Struck');
const APP_VERSION = '1.2.0';
const GITHUB_REPO = 'RMOneill12/Thunder-Struck';
let mainWindow, tray, quitting = false, alertTimer;

function prefsPath(){ return path.join(app.getPath('userData'),'permissions.json') }
function readPrefs(){ try{return JSON.parse(fs.readFileSync(prefsPath(),'utf8'))}catch{return{location:false,notifications:false,alertLocation:null}} }
function writePrefs(value){ fs.writeFileSync(prefsPath(),JSON.stringify(value,null,2)) }

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
  const params=new URLSearchParams({latitude:lat,longitude:lon,current:'temperature_2m,weather_code',hourly:'temperature_2m,weather_code,precipitation_probability,cloud_cover',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',temperature_unit:'celsius',timezone:'auto',forecast_days:'16'});
  const response=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if(!response.ok)throw new Error(`Forecast service returned ${response.status}`);
  return {configured:true,data:await response.json(),source:'Open-Meteo'};
});

ipcMain.handle('get-fishing-lakes',async(_event,{lat,lon})=>{
  const q=`[out:json][timeout:25];(nwr(around:200000,${lat},${lon})[natural=water][fishing];nwr(around:200000,${lat},${lon})[leisure=fishing];nwr(around:200000,${lat},${lon})[sport=fishing];);out center tags 250;`;
  let json;for(const endpoint of ['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter']){try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`data=${encodeURIComponent(q)}`});if(response.ok&&response.headers.get('content-type')?.includes('json')){json=await response.json();break}}catch{}}
  if(!json)throw new Error('Fishing-water source is temporarily unavailable');
  return json.elements.map(e=>({id:`${e.type}/${e.id}`,lat:e.lat??e.center?.lat,lon:e.lon??e.center?.lon,name:e.tags?.name||'Known fishing water',fishing:e.tags?.fishing||e.tags?.sport||'yes',website:e.tags?.website||''})).filter(x=>Number.isFinite(x.lat));
});

ipcMain.handle('get-permissions',()=>readPrefs());
ipcMain.handle('set-permissions',(_e,value)=>{const p={...readPrefs(),...value};writePrefs(p);scheduleAlerts();return p});
ipcMain.handle('set-alert-location',(_e,value)=>{const p={...readPrefs(),alertLocation:value};writePrefs(p);return p});

async function checkLightningRisk(){const p=readPrefs();if(!p.notifications||!p.alertLocation)return;const {lat,lon}=p.alertLocation;const points=[[lat,lon,0],[lat+.09,lon,10],[lat-.09,lon,10],[lat,lon+.13,10],[lat,lon-.13,10],[lat+.225,lon,25],[lat-.225,lon,25],[lat,lon+.32,25],[lat,lon-.32,25],[lat+.45,lon,50],[lat-.45,lon,50],[lat,lon+.64,50],[lat,lon-.64,50]];let nearest=null;for(const [a,o,d]of points){try{const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${a}&longitude=${o}&current=weather_code&forecast_days=1`);const j=await r.json();if([95,96,99].includes(j.current?.weather_code))nearest=nearest===null?d:Math.min(nearest,d)}catch{}}if(nearest!==null){const last=p.lastAlert||0;if(Date.now()-last>60*60*1000){p.lastAlert=Date.now();writePrefs(p);const n=new Notification({title:'Thunder Struck',body:`Lightning risk detected approximately ${nearest} km away from you.`,icon:path.join(__dirname,'..','assets','icon.png'),closeButtonText:'Close'});n.on('click',()=>{mainWindow?.show();mainWindow?.focus()});n.show()}}}
function scheduleAlerts(){clearInterval(alertTimer);if(readPrefs().notifications){checkLightningRisk();alertTimer=setInterval(checkLightningRisk,15*60*1000)}}

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
  const win = mainWindow = new BrowserWindow({
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
  win.on('close',e=>{if(!quitting&&readPrefs().notifications){e.preventDefault();win.hide()}});
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc,permission,callback)=>callback(permission==='geolocation'&&readPrefs().location));
  createWindow();
  tray=new Tray(path.join(__dirname,'..','assets','icon.ico'));tray.setToolTip('Thunder Struck');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Thunder Struck',click:()=>{mainWindow.show();mainWindow.focus()}},{type:'separator'},{label:'Quit',click:()=>{quitting=true;app.quit()}}]));tray.on('double-click',()=>mainWindow.show());scheduleAlerts();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !readPrefs().notifications) app.quit();
});
