const { app, BrowserWindow, shell, ipcMain, session, Tray, Menu, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('Thunder Struck');
const APP_VERSION = app.getVersion(); // single source of truth: package.json "version"
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

const lakeCache=new Map();
const EXCLUDED_WATER=new Set(['river','stream','canal','ditch','drain','moat','wastewater','basin']);
const SEARCH_RADIUS_M=200000; // 200 km around the map center
ipcMain.handle('get-fishing-lakes',async(_event,{lat,lon})=>{
  // Cache by ~5 km grid so small pans reuse results
  const key=`${(Math.round(lat*20)/20).toFixed(2)},${(Math.round(lon*20)/20).toFixed(2)}`;
  const cached=lakeCache.get(key);
  if(cached&&Date.now()-cached.time<60*60*1000)return cached.lakes;
    // Query a bounding box covering the 200 km circle instead of an
  // around:200000 radius. Radius queries force Overpass to compute distances
  // for every water feature (extremely slow over prairie slough country and
  // it was timing out on all mirrors = zero results). Bbox queries hit the
  // spatial index directly; the renderer trims results to 200 km client-side.
  const dLat=1.85;
  const dLon=Math.min(4,200/(111.32*Math.cos(lat*Math.PI/180)));
  const bbox=`${(lat-dLat).toFixed(4)},${(lon-dLon).toFixed(4)},${(lat+dLat).toFixed(4)},${(lon+dLon).toFixed(4)}`;
  // Two-tier query: significant waters (wikidata / typed lakes / reservoirs /
  // fishing spots) get their own limit so ponds can't crowd them out, then
  // remaining named waters fill in.
  const q=`[out:json][timeout:25];(nwr(${bbox})[natural=water][name][wikidata];nwr(${bbox})["water"~"^(lake|reservoir)$"][name];nwr(${bbox})[landuse=reservoir][name];nwr(${bbox})[leisure=fishing];)->.major;.major out center 800;(nwr(${bbox})[natural=water][name]; - .major;)->.minor;.minor out center 400;`;
  const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
  const fetchOverpass=async endpoint=>{
    const response=await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(26000),headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':`Thunder-Struck/${APP_VERSION} (RMO Productions)`},body:`data=${encodeURIComponent(q)}`});
    if(!response.ok||!response.headers.get('content-type')?.includes('json'))throw new Error('bad response');
    const json=await response.json();
    if(json.remark&&/timed?[ _-]?out|error/i.test(json.remark))throw new Error('overpass timeout');
    if(!Array.isArray(json.elements))throw new Error('bad payload');
    return json.elements; // an empty array here is a real "nothing mapped" answer
  };
  let overpassOk=false;
  let elements=[];
  try{elements=await Promise.any(endpoints.map(fetchOverpass));overpassOk=true}catch{}
  const seenIds=new Set();
  const lakes=elements
    .filter(e=>{const id=`${e.type}/${e.id}`;if(seenIds.has(id))return false;seenIds.add(id);return!EXCLUDED_WATER.has(e.tags?.water)})
    .map(e=>({id:`${e.type}/${e.id}`,lat:e.lat??e.center?.lat,lon:e.lon??e.center?.lon,name:e.tags?.name||'Fishing spot',fishing:e.tags?.fishing||e.tags?.sport||'unverified',major:Boolean(e.tags?.wikidata||['lake','reservoir'].includes(e.tags?.water)||e.tags?.landuse==='reservoir'),website:e.tags?.website||''}))
    .filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon));
  if(lakes.length){lakeCache.set(key,{time:Date.now(),lakes});return lakes}
  // Fallback: two quick bounded Nominatim searches around the same center
  const box=[lon-2.7,lat+1.8,lon+2.7,lat-1.8].join(',');
  const seen=new Set(),results=[];
  for(const term of ['lake','reservoir']){
    try{
      const response=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=40&bounded=1&viewbox=${box}&q=${encodeURIComponent(term)}`,{signal:AbortSignal.timeout(6000),headers:{'User-Agent':`Thunder-Struck/${APP_VERSION} (RMO Productions)`}});
      if(response.ok)for(const x of await response.json()){
        const name=x.display_name.split(',')[0];
        if(seen.has(name.toLowerCase()))continue;
        seen.add(name.toLowerCase());
        results.push({id:`nominatim/${x.place_id}`,lat:Number(x.lat),lon:Number(x.lon),name,fishing:'unverified',major:false});
      }
    }catch{}
    if(term==='lake')await new Promise(resolve=>setTimeout(resolve,1000)); // Nominatim rate limit
  }
  if(results.length){lakeCache.set(key,{time:Date.now(),lakes:results});return results}
  if(overpassOk)return []; // genuinely no mapped waters here
  throw new Error('Lake map servers are busy — try again in a moment');
});

// Fish species observed near a lake, via the free iNaturalist API
// (taxon 47178 = ray-finned fishes). Cached per lake for 24 hours.
const fishCache=new Map();
ipcMain.handle('get-lake-fish',async(_event,{lat,lon})=>{
  const key=`${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached=fishCache.get(key);
  if(cached&&Date.now()-cached.time<24*60*60*1000)return cached.fish;
  const params=new URLSearchParams({taxon_id:'47178',lat,lng:lon,radius:'8',quality_grade:'research',per_page:'14',locale:'en'});
  const response=await fetch(`https://api.inaturalist.org/v1/observations/species_counts?${params}`,{signal:AbortSignal.timeout(10000),headers:{'User-Agent':`Thunder-Struck/${APP_VERSION} (RMO Productions)`}});
  if(!response.ok)throw new Error('Fish species lookup is unavailable');
  const json=await response.json();
  const fish=(json.results||[]).map(r=>{
    const t=r.taxon||{};
    const common=t.preferred_common_name?t.preferred_common_name.replace(/\b\w/g,c=>c.toUpperCase()):'';
    return{name:common||t.name||'Unknown fish',sci:common?t.name||'':'',photo:t.default_photo?.square_url||'',count:r.count||0};
  }).filter(f=>f.name);
  fishCache.set(key,{time:Date.now(),fish});
  return fish;
});

ipcMain.handle('get-permissions',()=>readPrefs());
ipcMain.handle('set-permissions',(_e,value)=>{const p={...readPrefs(),...value};writePrefs(p);scheduleAlerts();return p});
ipcMain.handle('set-alert-location',(_e,value)=>{const p={...readPrefs(),alertLocation:value};writePrefs(p);return p});
ipcMain.handle('get-approx-location',async()=>{const response=await fetch('https://ipwho.is/');if(!response.ok)throw new Error('Approximate location is unavailable');const j=await response.json();if(!j.success)throw new Error('Approximate location is unavailable');return{lat:j.latitude,lon:j.longitude,name:j.city||'My Location',approximate:true}});

async function checkLightningRisk(){const p=readPrefs();if(!p.notifications||!p.alertLocation)return;const {lat,lon}=p.alertLocation;const points=[[lat,lon,0],[lat+.09,lon,10],[lat-.09,lon,10],[lat,lon+.13,10],[lat,lon-.13,10],[lat+.225,lon,25],[lat-.225,lon,25],[lat,lon+.32,25],[lat,lon-.32,25],[lat+.45,lon,50],[lat-.45,lon,50],[lat,lon+.64,50],[lat,lon-.64,50]];let nearest=null;for(const [a,o,d]of points){try{const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${a}&longitude=${o}&current=weather_code&forecast_days=1`);const j=await r.json();if([95,96,99].includes(j.current?.weather_code))nearest=nearest===null?d:Math.min(nearest,d)}catch{}}if(nearest!==null){const last=p.lastAlert||0;if(Date.now()-last>60*60*1000){p.lastAlert=Date.now();writePrefs(p);const n=new Notification({title:'Thunder Struck',body:`Lightning risk detected approximately ${nearest} km away from you.`,icon:path.join(__dirname,'..','assets','icon.png'),closeButtonText:'Close'});n.on('click',()=>{mainWindow?.show();mainWindow?.focus()});n.show()}}}
// Heat warning: notifies when today's forecast reaches Environment Canada-style
// heat criteria (max temp >= 32°C, or humidex/apparent temp >= 38°C).
// Re-alerts at most once every 12 hours.
async function checkHeatRisk(){const p=readPrefs();if(!p.notifications||!p.alertLocation)return;const {lat,lon}=p.alertLocation;try{
  const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,apparent_temperature_max&forecast_days=1&timezone=auto`,{signal:AbortSignal.timeout(10000)});
  if(!r.ok)return;const j=await r.json();
  const tMax=j.daily?.temperature_2m_max?.[0],aMax=j.daily?.apparent_temperature_max?.[0];
  if(!(tMax>=32||aMax>=38))return;
  const last=p.lastHeatAlert||0;
  if(Date.now()-last<12*60*60*1000)return;
  p.lastHeatAlert=Date.now();writePrefs(p);
  const feels=Number.isFinite(aMax)&&aMax>tMax?` (feels like ${Math.round(aMax)}°C)`:'';
  const n=new Notification({title:'Thunder Struck — Heat Warning',body:`Extreme heat expected today: high near ${Math.round(tMax)}°C${feels}. Stay hydrated and limit time outdoors.`,icon:path.join(__dirname,'..','assets','icon.png'),closeButtonText:'Close'});
  n.on('click',()=>{mainWindow?.show();mainWindow?.focus()});n.show();
}catch{}}
function runAlertChecks(){checkLightningRisk();checkHeatRisk()}
function scheduleAlerts(){clearInterval(alertTimer);if(readPrefs().notifications){runAlertChecks();alertTimer=setInterval(runAlertChecks,15*60*1000)}}

ipcMain.handle('check-for-updates', async () => {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': `Thunder-Struck/${APP_VERSION}` } });
  if (response.status === 404) return { found: false, current: APP_VERSION, reason: 'No published Release exists on GitHub yet. Push a version tag (e.g. v1.4.2) to trigger the release workflow.' };
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  const release = await response.json();
  const asset = release.assets.find(a => /setup.*\.exe$/i.test(a.name)) || release.assets.find(a => /\.exe$/i.test(a.name));
  const found = newerVersion(release.tag_name, APP_VERSION);
  return {
    found,
    current: APP_VERSION,
    version: release.tag_name,
    url: asset?.browser_download_url || release.html_url,
    hasInstaller: Boolean(asset),
    reason: found ? '' : `You are running v${APP_VERSION} and the latest published Release is ${release.tag_name}.`
  };
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
    show: false,
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
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('close',e=>{if(!quitting&&readPrefs().notifications){e.preventDefault();win.hide()}});
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc,permission,callback)=>callback(permission==='geolocation'&&readPrefs().location));
  session.defaultSession.setPermissionCheckHandler((_wc,permission)=>permission==='geolocation'&&readPrefs().location);
  createWindow();
  tray=new Tray(path.join(__dirname,'..','assets','icon.ico'));tray.setToolTip('Thunder Struck');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Thunder Struck',click:()=>{mainWindow.show();mainWindow.focus()}},{type:'separator'},{label:'Quit',click:()=>{quitting=true;app.quit()}}]));tray.on('double-click',()=>mainWindow.show());scheduleAlerts();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !readPrefs().notifications) app.quit();
});
