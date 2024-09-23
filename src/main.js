const { app, BrowserWindow, Tray, dialog, ipcMain, Menu } = require('electron')
const path = require('path')
const fs = require('fs');
const express = require('express')
const exec = require('child_process').spawn
const killPort = require('kill-port')
const axios = require('axios');

let win

function init () {
  // BrowserWindow
  const width = 400
  const height = 510
  win = new BrowserWindow({
    width,
    height,
    show: false,
    resizable: false,
    frame: false,
    maximizable: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      devTools: !app.isPackaged,
      nodeIntegration: true,
      webSecurity: false,
      enableRemoteModule: true
    }
  })
  
// run uniproxy
const configUrl = "https://oss.starn.cc/config.json";
function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  fs.mkdirSync(dirname, { recursive: true });
}
async function runUniproxy() {
  try {
    const response = await axios.get(configUrl);
    const configContent = JSON.stringify(response.data, null, 2); // 格式化 JSON

    const tmpConfigPath = path.join(
      process.resourcesPath,
      'libs/',
      process.platform + "-" + process.arch,
      'tempconfig.json'
    );

    ensureDirectoryExistence(tmpConfigPath);

    fs.writeFileSync(tmpConfigPath, configContent, 'utf8');

    await killPort(33212);

    let uniproxyName = process.platform === "darwin" ? "uniproxy" : "uniproxy.exe";

    const uniproxy = exec(
      path.join(process.resourcesPath, "libs/", process.platform + "-" + process.arch, uniproxyName),
      [
        "-host",
        "127.0.0.1",
        "-port",
        "33212",
        "-conf",
        path.join(process.resourcesPath, "libs/", process.platform + "-" + process.arch, "tempconfig.json") 
        ],{
        cwd: path.join(process.resourcesPath, "libs/", process.platform + "-" + process.arch)
      },
      (err, stdout, stderr) => {
        if (err) {
          console.error(err);
          return;
        }
        console.log(stdout);
        console.error(stderr);
      }
    );

    uniproxy.stdout.on('data', (data) => {
      console.log('uniproxy stdout:', data.toString());
    });

    uniproxy.stderr.on('data', (data) => {
      console.error('uniproxy stderr:', data.toString());
    });

  } catch (error) {
    console.error(err);
  }
}
runUniproxy();
  
  if (app.isPackaged) {
    const server = express()
    server.use('/', express.static(__dirname))
    const srv = server.listen(0, '127.0.0.1', () => {
      if (srv.address().port) {
        win.loadURL(`http://127.0.0.1:${srv.address().port}/dist/index.html`)
      } else {
        win.loadFile('./dist/index.html')
      }
    })
  } else {
    win.loadURL('http://127.0.0.1:9000')
    win.webContents.openDevTools()
  }

  win.once('ready-to-show', () => {
    win.show()
  })

  win.on('close', (e) => {
    if(!global.isQuit) {
      e.preventDefault()
      if (typeof app.hide === 'function') app.hide()
    }
  })

  global.win = win
  global.isQuit = false
  // Tray
  const tray = new Tray(path.join(__dirname, process.platform === 'darwin' ? 'assets/iconOff@2x.png' : 'assets/iconOff.ico'))
  global.tray = tray
  // IPC
  ipcMain.on('show', () => {
    win.show()
  })
  ipcMain.on('quit', () => {
    uniproxy.kill()
    global.isQuit = true
    app.quit()
  })
}

if (process.platform === 'darwin') {
  app.dock.hide()
}

app.on('window-all-closed', (e) => {
  e.preventDefault()
  app.quit()
})

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (!win) return
    win.show()
  })

  app.on('ready', () => {
    init()
  })
}
