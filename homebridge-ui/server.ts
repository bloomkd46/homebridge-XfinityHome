/* eslint-disable no-console */
import debug from 'debug';
import { EventEmitter } from 'events';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, unwatchFile, watch, watchFile } from 'fs';
import Proxy from 'http-mitm-proxy';
import os from 'os';
import path from 'path';
import qrcode from 'qrcode';

import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';


import type { PlatformAccessory } from 'homebridge';
import type { Device } from 'xfinityhome';
type CONTEXT = {
  device: Device['device'];
  logPath?: string;
  refreshToken?: string;
};


class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    const events = new EventEmitter();

    const plugin = 'homebridge-xfinityhome';
    const platform = 'XfinityHomePlatform';
    const storagePath = this.homebridgeStoragePath ?? '';
    const configPath = this.homebridgeConfigPath ?? '';
    const config = JSON.parse(readFileSync(configPath, 'utf-8')).platforms.find((plugin) => plugin.platform === platform);

    /*
      A native method getCachedAccessories() was introduced in config-ui-x v4.37.0
      The following is for users who have a lower version of config-ui-x
    */
    const cachedAccessoriesDir = path.join(storagePath, '/accessories/cachedAccessories') +
      (config?._bridge?.username ? ('.' + config?._bridge?.username?.split(':').join('')) : '');
    this.onRequest('/getCachedAccessories', async () => {
      try {
        // Define the plugin and create the array to return
        if (existsSync(cachedAccessoriesDir)) {
          return JSON.parse(readFileSync(cachedAccessoriesDir, 'utf-8')).filter(accessory => accessory.plugin === plugin);
        } else {
          return [];
        }
      } catch (err) {
        // Just return an empty accessory list in case of any errors
        console.log(err);
        return [];
      }
    });
    this.onRequest('/getGeneralLog', async () => {
      return path.join(storagePath, 'XfinityHome', 'General.log');
    });
    this.onRequest('/getLogs', async (payload) => {
      try {
        return readFileSync(payload.logPath).toString().replace(/\n/g, '<br>');
      } catch (err) {
        return `Failed To Load Logs From ${payload.logPath}`;
      }
    });
    this.onRequest('/getRelativePath', (payload) => {
      return path.relative(path.join(__dirname, '/public/index.html'), payload.path);
    });
    this.onRequest('/deleteLog', async (payload) => {
      try {
        return rmSync(payload.logPath, { force: true });
      } catch (err) {
        return err;
      }
    });
    this.onRequest('/watchLog', async (payload) => {
      try {
        return await watchFilePromise(payload.path);
      } catch (err) {
        return Promise.reject(err);
      }
    });
    const watchFilePromise = async (file: string) => {
      return new Promise((resolve, reject) => {
        if (!existsSync(file)) {
          reject('File does not exist: ' + file);
          return;
        }
        try {
          const aborter = new AbortController();
          const watcher = watch(file, { signal: aborter.signal });
          watcher.once('change', () => {
            aborter.abort();
            resolve(readFileSync(file));
          });
          watcher.once('error', err => {
            console.error(err);
            aborter.abort();
            watchFile(file, () => {
              unwatchFile(file);
              resolve(readFileSync(file));
            });
          });
        } catch {
          watchFile(file, () => {
            unwatchFile(file);
            resolve(readFileSync(file));
          });
        }
      });
    };
    this.onRequest('/watchAccessory', async payload => {
      const loop = async () => {
        const oldFile: PlatformAccessory<CONTEXT>[] =
          JSON.parse(readFileSync(cachedAccessoriesDir, 'utf-8')).filter(accessory => accessory.plugin === plugin);
        await watchFilePromise(cachedAccessoriesDir);
        const newFile: PlatformAccessory<CONTEXT>[]
          = JSON.parse(readFileSync(cachedAccessoriesDir, 'utf-8')).filter(accessory => accessory.plugin === plugin);
        const oldAccessory = oldFile.find(accessory => accessory.UUID === payload.accessory.UUID);
        const newAccessory = newFile.find(accessory => accessory.UUID === payload.accessory.UUID);
        if (JSON.stringify(oldAccessory) !== JSON.stringify(newAccessory)) {
          return newAccessory;
        } else {
          loop();
        }
      };
      return loop();
    });

    this.onRequest('/proxyActive', async () => {
      return new Promise((resolve) => {
        events.on('proxy', () => resolve(''));
      });
    });
    /*this.onRequest('/sslActive', async () => {
      return new Promise((resolve) => {
        events.on('ssl', () => resolve());
      });
    });*/
    this.onRequest('/token', async () => {
      return new Promise((resolve) => {
        events.on('token', token => resolve(token));
      });
    });

    this.onRequest('/startProxy', async () => {
      // Disable debug messages from the proxy
      try {
        debug.disable();
      } catch (err) {
        //Do nothing
      }
      const ROOT = path.join(storagePath, 'XfinityHome');
      if (!existsSync(ROOT)) {
        mkdirSync(ROOT);
      }

      const pemFile = path.join(ROOT, 'certs', 'ca.pem');

      const localIPs: string[] = [];
      const ifaces = os.networkInterfaces();
      Object.keys(ifaces).forEach(name => {
        ifaces[name]?.forEach(network => {
          const familyV4Value = typeof network.family === 'string' ? 'IPv4' : 4;
          if (network.family === familyV4Value && !network.internal) {
            localIPs.push(network.address);
          }
        });
      });
      localIPs.push(os.hostname() + os.hostname().endsWith('.local') ? '' : '.local');



      const proxy = Proxy();
      const localIPPorts = localIPs.map(ip => `${ip}:${585}`);

      proxy.onError((ctx, err) => {
        switch (err?.name) {
          case 'ERR_STREAM_DESTROYED':
          case 'ECONNRESET':
            return;

          case 'ECONNREFUSED':
            console.error('Failed to intercept secure communications. This could happen due to bad CA certificate.');
            return;

          case 'EACCES':
            console.error(`Permission was denied to use port ${585}.`);
            return;

          default:
          //console.error('Error:', err.code, err);
        }
      });

      proxy.onRequest((ctx, callback) => {
        if (ctx.clientToProxyRequest.method === 'GET' && ctx.clientToProxyRequest.url === '/cert' &&
          localIPPorts.includes(ctx.clientToProxyRequest.headers.host ?? '')) {
          ctx.use(Proxy.gunzip);
          console.log('Intercepted certificate request');

          ctx.proxyToClientResponse.writeHead(200, {
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=0',
            'Content-Type': 'application/x-x509-ca-cert',
            'Content-Disposition': 'attachment; filename=cert.pem',
            'Content-Transfer-Encoding': 'binary',
            'Content-Length': statSync(pemFile).size,
            'Connection': 'keep-alive',
          });
          //ctx.proxyToClientResponse.end(fs.readFileSync(path.join(ROOT, 'certs', 'ca.pem')));
          ctx.proxyToClientResponse.write(readFileSync(pemFile));
          ctx.proxyToClientResponse.end();

          return;

        } else if (ctx.clientToProxyRequest.method === 'POST' && ctx.clientToProxyRequest.headers.host === 'oauth.xfinity.com' &&
          ctx.clientToProxyRequest.url === '/oauth/token') {
          ctx.use(Proxy.gunzip);

          ctx.onRequestData((ctx, chunk, callback) => {
            return callback(undefined, chunk);
          });
          ctx.onRequestEnd((ctx, callback) => {
            callback();
          });

          const chunks: Buffer[] = [];
          ctx.onResponseData((ctx, chunk, callback) => {
            chunks.push(chunk);
            return callback(undefined, chunk);
          });
          ctx.onResponseEnd((ctx, callback) => {
            events.emit('token', JSON.parse(Buffer.concat(chunks).toString()).refresh_token);
            //token = JSON.parse(Buffer.concat(chunks).toString()).refresh_token;
            //this.pushEvent('token', { refreshToken: JSON.parse(Buffer.concat(chunks).toString()).refresh_token });
            //emitter.emit('tuya-config', Buffer.concat(chunks).toString());
            callback();
          });
        } else {
          //this.pushEvent('proxy', {});
          events.emit('proxy');
          /*ctx.onRequestData(function (ctx, chunk, callback) {
            ctx.onResponseData(function (ctx, chunk, callback) {
              //this.pushEvent('sslProxy', {});
              events.emit('ssl');
            });
          });*/
        }
        return callback();
      });

      /*emitter.on('tuya-config', body => {
        //if (body.indexOf('tuya.m.my.group.device.list') === -1) return;
        console.log('Intercepted token from Xfinity Home');
        try {
          console.log('Your refresh token is: ' + JSON.parse(body).refresh_token);
        } catch (err) {
          console.error(err);
        }
      });*/
      this.onRequest('/stopProxy', () => {
        if (proxy && typeof proxy.close === 'function') {
          proxy.close();
        }
        if (existsSync(path.join(ROOT, 'certs'))) {
          rmSync(path.join(ROOT, 'certs'), { recursive: true, force: true });
        }
        if (existsSync(path.join(ROOT, 'keys'))) {
          rmSync(path.join(ROOT, 'keys'), { recursive: true, force: true });
        }
        return '';
      });
      return new Promise((resolve) => {
        proxy.listen({ port: 585, sslCaDir: ROOT }, async err => {
          if (err) {
            console.error('Error starting proxy: ' + err);
          }
          const address = localIPs[0];
          const port = 585;
          qrcode.toString(`http://${address}:${port}/cert`, { type: 'svg' })
            .then(qrcode => resolve({ ip: address, port: port, qrcode: qrcode }));
        });
      });

    });
    this.ready();
  }
}

(() => new PluginUiServer())();
