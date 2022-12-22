/* eslint-disable no-console */
import type { IHomebridgePluginUi } from './ui.interface';
declare const homebridge: IHomebridgePluginUi;

//Intro Elements
const pageIntro = document.getElementById('pageIntro') as HTMLDivElement;
const introContinue = document.getElementById('introContinue') as HTMLButtonElement;
//Settings Elements
const menuSettings = document.getElementById('menuSettings') as HTMLButtonElement;
//Config Tool Elements
const menuConfigTool = document.getElementById('menuConfigTool') as HTMLButtonElement;
const pageConfigTool = document.getElementById('pageConfigTool') as HTMLDivElement;
const exitConfigTool = document.getElementById('exitSetup') as HTMLButtonElement;
//  Part 1
const configToolPart1 = document.getElementById('part1') as HTMLDivElement;
const configToolQRCodeAlt = document.getElementById('qrcode-alt') as HTMLSpanElement;
const configToolCertificate = document.getElementById('certificate') as HTMLAnchorElement;
const configToolQRCodeSvg = document.getElementById('qrcode-svg') as HTMLElement;
const configToolQRCode = document.getElementById('qrcode') as HTMLSpanElement;
const configToolIP = document.getElementById('ip') as HTMLSpanElement;
const configToolPort = document.getElementById('port') as HTMLSpanElement;
//  Part 2
const configToolPart2 = document.getElementById('part2') as HTMLDivElement;
//  Part 3
const configToolPart3 = document.getElementById('part3') as HTMLDivElement;
//Log Elements
const menuLogs = document.getElementById('menuLogs') as HTMLButtonElement;
const pageLogs = document.getElementById('pageLogs') as HTMLDivElement;
const deviceSelect = document.getElementById('deviceSelect') as HTMLSelectElement;
const logDownload = document.getElementById('logDownload') as HTMLAnchorElement;
const logDelete = document.getElementById('logDelete') as HTMLButtonElement;
const logZone = document.getElementById('logZone') as HTMLDivElement;
//Device Info Elements
const deviceInfo = document.getElementById('deviceInfo') as HTMLButtonElement;
const deviceName = document.getElementById('deviceName') as HTMLHeadingElement;
const deviceDetailsTable = document.getElementById('deviceDetailsTable') as HTMLTableSectionElement;
//Miscellaneous Elements
const menuWrapper = document.getElementById('menuWrapper') as HTMLDivElement;
(async () => {
  try {
    let currentLogPath = '';
    let currentLog = '';
    const currentConfig = await homebridge.getPluginConfig();
    const showIntro = () => {
      introContinue.addEventListener('click', () => {
        homebridge.showSpinner();
        pageIntro.style.display = 'none';
        menuWrapper.style.display = 'inline-flex';
        showConfigTool();
      });
      pageIntro.style.display = 'block';
    };
    const showLogs = async () => {
      homebridge.showSpinner();
      homebridge.hideSchemaForm();
      menuConfigTool.classList.remove('btn-elegant');
      menuConfigTool.classList.add('btn-primary');
      menuLogs.classList.add('btn-elegant');
      menuLogs.classList.remove('btn-primary');
      menuSettings.classList.remove('btn-elegant');
      menuSettings.classList.add('btn-primary');
      pageConfigTool.style.display = 'none';
      pageLogs.style.display = 'block';
      let cachedAccessories = await homebridge.request('/getCachedAccessories');
      if (cachedAccessories.length > 0) {
        cachedAccessories.sort((a, b) => {
          return a.displayName.toLowerCase() > b.displayName.toLowerCase()
            ? 1
            : b.displayName.toLowerCase() > a.displayName.toLowerCase()
              ? -1
              : 0;
        });
      }
      deviceSelect.innerHTML = '';
      cachedAccessories.forEach(a => {
        if (a.context.logPath) {
          const option = document.createElement('option');
          option.text = a.displayName;
          option.value = a.context.logPath;
          deviceSelect.add(option);
        }
      });
      const showDeviceLog = async logPath => {
        currentLogPath = logPath;
        homebridge.showSpinner();
        const logs = await homebridge.request('/getLogs', { logPath: logPath });
        currentLog = `data:text/plain;base64,${btoa(logs.split('<br>').join('\n'))}`;
        logDownload.href = currentLog;
        logDownload.download = logPath.split('/').pop();

        logZone.innerHTML = logs;
        logZone.scrollTo(0, logZone.scrollHeight);

        const device = cachedAccessories.find(x => x.context.logPath === logPath);
        if (device) {
          deviceInfo.style.display = 'inline';
          deviceName.innerHTML = device.displayName;
          let deviceHTML = '';
          Object.keys(device.context.device).forEach(key => {
            deviceHTML +=
              `<tr>
                    <th scope="row">${key}</th>
                    <td><pre style="color: inherit;">${JSON.stringify(device.context.device[key], null, 1)}</pre></td>
                  </tr>`;
          });
          deviceDetailsTable.innerHTML = deviceHTML;
        } else {
          deviceInfo.style.display = 'none';
        }

        homebridge.hideSpinner();

        homebridge.request('/watchForChanges', { path: logPath }).then(() => {
          if (logPath === currentLogPath) {
            showDeviceLog(logPath);
            setTimeout(async () => {
              if (logPath === currentLogPath) {
                cachedAccessories = await homebridge.request('/getCachedAccessories');

                showDeviceLog(logPath);
              }
            }, 1500);
          }
        }).catch(err => {
          console.error(err);
        });
      };
      deviceSelect.addEventListener('change', () => showDeviceLog(deviceSelect.value));
      if (cachedAccessories.length > 0) {
        const generalLog = await homebridge.request('/getGeneralLog');
        const option = document.createElement('option');
        option.text = 'General';
        option.value = generalLog;
        option.selected = true;
        deviceSelect.add(option, 0);
        showDeviceLog(generalLog);
      } else {
        const option = document.createElement('option');
        option.text = 'No Devices';
        deviceSelect.add(option);
        deviceSelect.disabled = true;
      }
      homebridge.hideSpinner();
    };
    const showConfigTool = async () => {
      homebridge.showSpinner();
      menuWrapper.style.display = 'none';
      homebridge.hideSchemaForm();
      menuConfigTool.classList.add('btn-elegant');
      menuConfigTool.classList.remove('btn-primary');
      menuLogs.classList.remove('btn-elegant');
      menuLogs.classList.add('btn-primary');
      menuSettings.classList.remove('btn-elegant');
      menuSettings.classList.add('btn-primary');
      pageConfigTool.style.display = 'block';
      pageLogs.style.display = 'none';

      configToolPart1.style.display = 'block';
      configToolPart2.style.display = 'none';
      configToolPart3.style.display = 'none';

      const proxy = await homebridge.request('/startProxy');
      configToolIP.innerText = proxy.ip;
      configToolPort.innerText = proxy.port;
      configToolQRCodeAlt.style.display = 'inline';
      const certificateLink = `http://${proxy.ip}:${proxy.port}/cert`;
      configToolCertificate.innerText = certificateLink;
      configToolCertificate.href = certificateLink;
      configToolQRCodeSvg.innerHTML = proxy.qrcode;
      configToolQRCode.style.display = 'none';
      if (!(/iPad|iPhone|iPod/.test(navigator.userAgent))) {
        configToolQRCode.style.display = 'block';
        configToolQRCodeAlt.style.display = 'none';
      }
      configToolPart1.style.display = 'block';
      homebridge.hideSpinner();

      await homebridge.request('/proxyActive');
      homebridge.showSpinner();
      configToolPart1.style.display = 'none';
      configToolPart2.style.display = 'block';
      homebridge.hideSpinner();

      const token = await homebridge.request('/token');
      homebridge.showSpinner();
      configToolPart2.style.display = 'none';
      configToolPart3.style.display = 'block';
      currentConfig[0].refreshToken = token;
      await homebridge.updatePluginConfig(currentConfig);
      await homebridge.savePluginConfig();
      homebridge.hideSpinner();
    };
    const showSettings = async () => {
      homebridge.showSpinner();
      menuConfigTool.classList.remove('btn-elegant');
      menuConfigTool.classList.add('btn-primary');
      menuLogs.classList.remove('btn-elegant');
      menuLogs.classList.add('btn-primary');
      menuSettings.classList.add('btn-elegant');
      menuSettings.classList.remove('btn-primary');
      pageConfigTool.style.display = 'none';
      pageLogs.style.display = 'none';
      homebridge.showSchemaForm();
      homebridge.hideSpinner();
    };
    menuSettings.addEventListener('click', () => showSettings());
    menuLogs.addEventListener('click', () => showLogs());
    menuConfigTool.addEventListener('click', () => showConfigTool());
    exitConfigTool.addEventListener('click', async () => {
      await homebridge.request('/stopProxy');
      menuWrapper.style.display = 'inline-flex';
      showSettings();
    });
    logDelete.addEventListener('click', async () => {
      homebridge.showSpinner();
      logZone.innerHTML = 'Deleting log file at ' + currentLogPath;
      await homebridge.request('/deleteLog', { logPath: currentLogPath });
      logZone.innerHTML = 'successfully deleted log file at ' + currentLogPath;
      homebridge.hideSpinner();
    });
    if (currentConfig.length) {
      menuWrapper.style.display = 'inline-flex';
      showSettings();
    } else {
      currentConfig.push({ name: 'Xfinity Home' });
      await homebridge.updatePluginConfig(currentConfig);
      showIntro();
    }
  } catch (err: any) {
    homebridge.toast.error(err.message, 'Error');
    console.log(err);
    homebridge.closeSettings();
  } finally {
    homebridge.hideSpinner();
  }
})();