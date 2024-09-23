const { app, BrowserWindow, Tray, dialog, ipcMain, Menu } = require('electron')
const path = require('path')
const express = require('express')
const exec = require('child_process').spawn
const killPort = require('kill-port')
const https = require('https')

let win

function init() {
  // BrowserWindow
  const width = 400;
  const height = 510;
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
  });

  // 根据操作系统确定uniproxy的名称
  const uniproxyName = process.platform === "darwin" ? "uniproxy" : "uniproxy.exe";
  const uniproxyPath = path.join(process.resourcesPath, "libs/", process.platform + "-" + process.arch);
  const remoteConfigUrl = "https://oss.starn.cc/config.json";
  const localConfigPath = path.join(uniproxyPath, "config.json");
  const tempRemoteConfigPath = path.join(uniproxyPath, "remote_config.json");

  // Killing the existing process on port 33212
  killPort(33212);

  // 启动Uniproxy函数
  function startUniproxy(configPath) {
    console.log(`Starting Uniproxy with config: ${configPath}`);
    let uniproxy = exec(path.join(uniproxyPath, uniproxyName), [
      "-host", "127.0.0.1",
      "-port", "33212",
      "-conf", configPath
    ], { cwd: uniproxyPath }, (err, stdout, stderr) => {
      if (err) {
        console.error(`Error executing Uniproxy: ${err}`);
        return;
      }
      console.log(`Uniproxy stdout: ${stdout}`);
      console.error(`Uniproxy stderr: ${stderr}`);
    });

    global.uniproxy = uniproxy;
  }

  // Request the remote configuration file
  https.get(remoteConfigUrl, (res) => {
    if (res.statusCode !== 200) {
      console.error(`Failed to get remote config: Status Code ${res.statusCode}`);
      startUniproxy(localConfigPath);
      return;
    }

    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const configJson = JSON.parse(data); // Parsing JSON to check correctness
        fs.writeFile(tempRemoteConfigPath, JSON.stringify(configJson, null, 2), (err) => {
          if (err) {
            console.error(`Failed to write remote config to file: ${err}`);
            startUniproxy(localConfigPath);
            return;
          }
          startUniproxy(tempRemoteConfigPath);
        });
      } catch (error) {
        console.error(`Error parsing remote config: ${error.message}`);
        startUniproxy(localConfigPath);
      }
    });
  }).on('error', (err) => {
    console.error(`Error fetching remote config: ${err.message}`);
    startUniproxy(localConfigPath);
  });

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
