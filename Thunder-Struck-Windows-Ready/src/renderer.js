const views = {
  temp: { title: 'Temperature', subtitle: 'Surface temperature forecast', icon: '☀', overlay: 'temp', product: 'gfs' },
  radar: { title: 'Lightning Tracker', subtitle: 'Live radar and lightning activity', icon: 'ϟ', overlay: 'radar', product: 'radar' },
  fog: { title: 'Fog', subtitle: 'Fog and visibility conditions', icon: '≋', overlay: 'fog', product: 'gfs' },
  rain: { title: 'Rain & Clouds', subtitle: 'Rain, thunder and cloud forecast', icon: '☂', overlay: 'rain', product: 'gfs' }
};
const defaults = { lat: 50.4452, lon: -104.6189, name: 'Regina', unit: '°C', view: 'temp' };
let state;
try { state = { ...defaults, ...JSON.parse(localStorage.getItem('thunder-struck-settings') || '{}') }; } catch { state = { ...defaults }; }

const map = document.querySelector('#windyMap');
const mapWrap = document.querySelector('.map-wrap');
const dialog = document.querySelector('#settingsDialog');
const toast = document.querySelector('#toast');

function save() { localStorage.setItem('thunder-struck-settings', JSON.stringify(state)); }
function formatCoordinate(value, positive, negative) { return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`; }
function windyUrl(view) {
  const v = views[view];
  const metricTemp = state.unit === '°F' ? '°F' : '°C';
  const p = new URLSearchParams({ lat: state.lat, lon: state.lon, detailLat: state.lat, detailLon: state.lon, width: 1200, height: 700, zoom: 6, level: 'surface', overlay: v.overlay, product: v.product, menu: '', message: 'true', marker: '', calendar: 'now', pressure: '', type: 'map', location: 'coordinates', detail: '', metricWind: 'default', metricTemp, radarRange: '-1' });
  return `https://embed.windy.com/embed2.html?${p}`;
}
function render(reload = true) {
  const v = views[state.view];
  document.querySelector('#placeName').textContent = state.name || 'Selected Location';
  document.querySelector('#coordinates').textContent = `${formatCoordinate(state.lat,'N','S')} · ${formatCoordinate(state.lon,'E','W')}`;
  document.querySelector('#viewTitle').textContent = v.title;
  document.querySelector('#viewSubtitle').textContent = v.subtitle;
  const icon = document.querySelector('#viewIcon'); icon.textContent = v.icon; icon.className = `view-icon ${state.view === 'radar' ? 'lightning' : state.view}`;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === state.view));
  if (reload) { mapWrap.classList.remove('loaded'); map.src = windyUrl(state.view); }
}
function showToast(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800); }

map.addEventListener('load', () => { mapWrap.classList.add('loaded'); document.querySelector('#updatedText').textContent = `Loaded ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`; });
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => { state.view = tab.dataset.view; save(); render(); }));
document.querySelector('#settingsButton').addEventListener('click', () => {
  document.querySelector('#latInput').value = state.lat; document.querySelector('#lonInput').value = state.lon; document.querySelector('#nameInput').value = state.name;
  document.querySelectorAll('[data-unit]').forEach(b => b.classList.toggle('active', b.dataset.unit === state.unit)); dialog.showModal();
});
document.querySelectorAll('[data-unit]').forEach(b => b.addEventListener('click', () => document.querySelectorAll('[data-unit]').forEach(x => x.classList.toggle('active', x === b))));
document.querySelector('#saveSettings').addEventListener('click', () => {
  const lat = Number(document.querySelector('#latInput').value), lon = Number(document.querySelector('#lonInput').value), error = document.querySelector('#settingsError');
  if (!Number.isFinite(lat) || lat < -85 || lat > 85 || !Number.isFinite(lon) || lon < -180 || lon > 180) { error.textContent = 'Enter a latitude from −85 to 85 and longitude from −180 to 180.'; return; }
  error.textContent = ''; state.lat = lat; state.lon = lon; state.name = document.querySelector('#nameInput').value.trim() || 'Selected Location'; state.unit = document.querySelector('[data-unit].active').dataset.unit; save(); dialog.close(); render(); showToast('Map location updated');
});
document.querySelector('#locateButton').addEventListener('click', () => {
  if (!navigator.geolocation) return showToast('Location is not available on this device');
  showToast('Finding your location…');
  navigator.geolocation.getCurrentPosition(pos => { state.lat = pos.coords.latitude; state.lon = pos.coords.longitude; state.name = 'My Location'; save(); render(); showToast('Showing your current location'); }, () => showToast('Location permission was not granted'), { enableHighAccuracy: true, timeout: 10000 });
});
render();
