const { app, BrowserWindow, Tray, dialog, ipcMain, Menu } = require('electron')
const path = require('path')
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

// 确保目录存在的函数
function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  fs.mkdirSync(dirname, { recursive: true });
}

// 获取远程配置文件内容并保存到临时文件，然后执行 uniproxy
async function runUniproxy() {
  try {
    // 发送 HTTP 请求获取远程 config.json 内容
    const response = await axios.get(configUrl);
    const configContent = JSON.stringify(response.data);

    // 临时配置文件路径
    const tmpConfigPath = path.join(
      process.resourcesPath,
      "libs/",
      process.platform + "-" + process.arch,
      "config.json"
    );

    // 确保临时配置文件目录存在
    ensureDirectoryExistence(tmpConfigPath);

    // 保存远程配置内容到临时文件
    fs.writeFileSync(tmpConfigPath, configContent);

    // 杀死占用端口的进程
    await killPort(33212);

    // 构建 uniproxy 执行路径
    const uniproxyName = process.platform === 'darwin' ? 'uniproxy' : 'uniproxy.exe';
    const uniproxyPath = path.join(
      process.resourcesPath,
      "libs/",
      process.platform + "-" + process.arch,
      uniproxyName
    );

    // 执行 uniproxy 并传递配置文件路径
    const uniproxy = exec(uniproxyPath, [
      "-host",
      "127.0.0.1",
      "-port",
      "33212",
      "-conf",
      tmpConfigPath
    ], {
      cwd: path.join(process.resourcesPath, "libs/", process.platform + "-" + process.arch)
    }, (err, stdout, stderr) => {
      if (err) {
        console.error(err);
        return;
      }
      // 打印标准输出和标准错误
      console.log(stdout);
      console.error(stderr);
    });

  } catch (error) {
    console.error('发生错误:', error.message);
  }
}

// 每次启动都调用该函数
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
