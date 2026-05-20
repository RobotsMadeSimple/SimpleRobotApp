const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const { Bonjour } = require('bonjour-service');

const GITHUB_REPO    = 'RobotsMadeSimple/SimpleRobotApp';
const INSTALLER_ASSET = 'SimpleRobotApp-Setup.exe';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'SimpleRobotApp' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const download = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, { headers: { 'User-Agent': 'SimpleRobotApp' } }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) { download(res.headers.location); return; }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        const stream = fs.createWriteStream(dest);
        res.on('data', chunk => { received += chunk.length; if (total) onProgress(received / total); stream.write(chunk); });
        res.on('end', () => { stream.end(); resolve(); });
        res.on('error', reject);
        stream.on('error', reject);
      }).on('error', reject);
    };
    download(url);
  });
}

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('check-for-updates', async () => {
  try {
    const data = await fetchJson(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    return { version: (data.tag_name || '').replace(/^v/, '') };
  } catch { return null; }
});

ipcMain.handle('download-and-install', async (event) => {
  const data = await fetchJson(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
  const asset = (data.assets || []).find(a => a.name === INSTALLER_ASSET);
  if (!asset) throw new Error('Installer asset not found in latest release');
  const dest = path.join(os.tmpdir(), INSTALLER_ASSET);
  await downloadFile(asset.browser_download_url, dest, progress => {
    event.sender.send('update-progress', progress);
  });
  spawn(dest, [], { detached: true, stdio: 'ignore' }).unref();
  app.quit();
});

// Serve the dist folder over a local HTTP server so that
// asset paths (/_expo/...) resolve correctly in Electron.
function startAppServer(distPath, port) {
  const mime = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.ttf':  'font/ttf',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
  };

  return http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';

    let filePath = path.join(distPath, urlPath);

    // SPA fallback — return index.html for unknown routes
    if (!fs.existsSync(filePath)) {
      filePath = path.join(distPath, 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = mime[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }).listen(port);
}

// Browse for _robot._tcp.local. mDNS services and expose them at
// http://localhost:3001/get-robots so the web app can discover robots.
function startDiscoveryServer() {
  const robots = new Map();
  const bonjour = new Bonjour();
  const browser = bonjour.find({ type: 'robot' });

  browser.on('up', service => {
    const ip = (service.addresses && service.addresses[0]) || service.host;
    robots.set(service.name, {
      robotName:       service.txt?.RobotName       || service.name,
      ipAddress:       ip,
      port:            service.port,
      robotType:       service.txt?.RobotType        || '',
      controlEndpoint: service.txt?.ControlEndpoint  || 'control',
      serialNumber:    service.txt?.SerialNumber      || '',
    });
  });

  browser.on('down', service => {
    robots.delete(service.name);
  });

  http.createServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify([...robots.values()]));
  }).listen(3001);
}

app.whenReady().then(() => {
  const distPath = path.join(__dirname, 'dist');
  const port = 45678;

  startAppServer(distPath, port);
  startDiscoveryServer();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  win.loadURL(`http://localhost:${port}`);
});

app.on('window-all-closed', () => {
  app.quit();
});
