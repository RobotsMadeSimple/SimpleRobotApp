const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { Bonjour } = require('bonjour-service');

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
      contextIsolation: true,
    },
  });

  win.loadURL(`http://localhost:${port}`);
});

app.on('window-all-closed', () => {
  app.quit();
});
