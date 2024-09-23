const { app, BrowserWindow, Tray, dialog, ipcMain, Menu } = require('electron')
const https = require('https');
const path = require('path')
const express = require('express')
const exec = require('child_process').spawn
const killPort = require('kill-port')

let win;
let uniproxy;

// 下载配置文件的函数
function downloadConfig(url, localPath) {
  return new Promise((resolve, reject) => {
    console.log(`Starting download of ${url} to ${localPath}`);
    const file = fs.createWriteStream(localPath);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          console.log(`Download completed: ${localPath}`);

          // 读取文件内容进行验证
          fs.readFile(localPath, 'utf8', (err, data) => {
            if (err) {
              reject(new Error(`Failed to read downloaded file: ${err.message}`));
              return;
            }
            console.log(`Downloaded config content: ${data}`);
            resolve();
          });
        });
      });
    }).on('error', (err) => {
      fs.unlink(localPath, () => reject(err));
    });
  });
}

// 更新配置文件的函数
async function updateConfig() {
  const remoteConfigUrl = 'https://oss.starn.cc/config.json';
  const localConfigPath = path.join(process.resourcesPath, "libs/", `${process.platform}-${process.arch}`, "config.json");

  // 创建目录路径
  const dir = path.dirname(localConfigPath);
  await fs.promises.mkdir(dir, { recursive: true }).catch(err => {
    console.error(`Failed to create directory ${dir}:`, err);
    throw err;
  });

  try {
    await downloadConfig(remoteConfigUrl, localConfigPath);
    console.log("Config file downloaded successfully");
  } catch (err) {
    console.error('Failed to update config:', err);
    throw err;
  }
}

// 初始化应用程序的函数
async function init() {
  try {
    // 确保更新配置文件完成再继续初始化
    await updateConfig();
  } catch (err) {
    console.error('Initialization halted due to config update failure.');
    app.quit();
    return;
  }

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

  const uniproxyName = process.platform === "darwin" ? "uniproxy" : "uniproxy.exe";
  const uniproxyPath = path.join(process.resourcesPath, "libs/", `${process.platform}-${process.arch}`, uniproxyName);
  const uniproxyConfigPath = path.join(process.resourcesPath, "libs/", `${process.platform}-${process.arch}`, "config.json");

  // 确保所有路径都是绝对路径，并且正确
  console.log(`uniproxyPath: ${uniproxyPath}`);
  console.log(`uniproxyConfigPath: ${uniproxyConfigPath}`);
  
  // 读取并打印配置文件内容
  fs.readFile(uniproxyConfigPath, 'utf8', (err, data) => {
    if (err) {
      console.error(`Failed to read uniproxy config file: ${err.message}`);
      return;
    }
    console.log(`Using uniproxy config content: ${data}`);
  });

  // 停止占用的端口，避免冲突
  killPort(33212);

  // 拼接参数字符串
  const uniproxyArgs = [
    "-host", "127.0.0.1",
    "-port", "33212",
    "-conf", uniproxyConfigPath
  ];

  // 打印用于调试的完整命令行
  console.log(`Executing: ${uniproxyPath} ${uniproxyArgs.join(' ')}`);

  // 启动 uniproxy
  uniproxy = execFile(uniproxyPath, uniproxyArgs, {
    cwd: path.dirname(uniproxyPath)
  }, (err, stdout, stderr) => {
    if (err) {
      console.error(`Error executing uniproxy: ${err}`);
      return;
    }
    console.log(`uniproxy stdout: ${stdout}`);
    console.error(`uniproxy stderr: ${stderr}`);
  });

  // 设置应用的加载方式
  if (app.isPackaged) {
    const server = express();
    server.use('/', express.static(__dirname));
    const srv = server.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      if (port) {
        win.loadURL(`http://127.0.0.1:${port}/dist/index.html`);
      } else {
        win.loadFile('./dist/index.html');
      }
    });
  } else {
    win.loadURL('http://127.0.0.1:9000');
    win.webContents.openDevTools();
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('close', (e) => {
    if (!global.isQuit) {
      e.preventDefault();
      if (typeof app.hide === 'function') app.hide();
    }
  });

  global.win = win;
  global.isQuit = false;

  // 设置托盘图标
  const trayIconPath = path.join(__dirname, process.platform === 'darwin' ? 'assets/iconOff@2x.png' : 'assets/iconOff.ico');
  const tray = new Tray(trayIconPath);
  global.tray = tray;

  // 设置 IPC 事件
  ipcMain.on('show', () => {
    win.show();
  });
  ipcMain.on('quit', () => {
    uniproxy.kill();
    global.isQuit = true;
    app.quit();
  });
}

// macOS 特殊处理
if (process.platform === 'darwin') {
  app.dock.hide();
}

// 处理所有窗口关闭的事件
app.on('window-all-closed', () => {
  app.quit();
});

// 保证应用程序为单实例
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on('ready', () => {
    init();
  });
}
