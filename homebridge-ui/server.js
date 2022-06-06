//@ts-check
'use strict';

const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const { existsSync, readFileSync, mkdirSync, statSync, rmSync, watch, watchFile, unwatchFile } = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const fileSaver = require('file-saver');
//import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
//import { existsSync, promises, readFileSync } from 'fs';
class PluginUiServer extends HomebridgePluginUiServer {
  constructor () {
    const events = new EventEmitter();
    super();

    const storagePath = this.homebridgeStoragePath ?? '';

    /*
      A native method getCachedAccessories() was introduced in config-ui-x v4.37.0
      The following is for users who have a lower version of config-ui-x
    */
    this.onRequest('/getCachedAccessories', async () => {
      try {
        // Define the plugin and create the array to return
        const plugin = 'homebridge-xfinityhome';
        const devicesToReturn = [];

        // The path and file of the cached accessories
        const accFile = path.join(storagePath, '/accessories/cachedAccessories');

        // Check the file exists
        if (existsSync(accFile)) {
          // Read the cached accessories file
          const cachedAccessoriesBuffer = readFileSync(accFile);

          // Parse the JSON
          const cachedAccessories = JSON.parse(cachedAccessoriesBuffer.toString());

          // We only want the accessories for this plugin
          cachedAccessories
            .filter(accessory => accessory.plugin === plugin)
            .forEach(accessory => devicesToReturn.push(accessory));
        }

        // Return the array
        return devicesToReturn;
      } catch (err) {
        // Just return an empty accessory list in case of any errors
        return [];
      }
    });
    this.onRequest('/getGeneralLog', async () => {
      return path.join(storagePath, 'XfinityHome', 'General.log');
    });
    this.onRequest('/getLogs', async (payload) => {
      try {
        return readFileSync(payload.logPath).toString().split('\n').join('<br>');
      } catch (err) {
        return err;
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
    this.onRequest('/downloadLog', async (payload) => {
      fileSaver.saveAs(new Blob([readFileSync(payload.logPath)], { type: 'text/plain;charset=utf-8' }));
    });
    this.onRequest('/watchForChanges', async (payload) => {
      return new Promise(resolve => {
        try {
          const aborter = new AbortController();
          const watcher = watch(payload.path, { signal: aborter.signal });
          watcher.once('change', event => {
            aborter.abort();
            resolve('');
          });
          watcher.once('error', err => {
            aborter.abort(err);
            watchFile(payload.path, () => {
              unwatchFile(payload.path);
              resolve('');
            });
          });
        } catch {
          watchFile(payload.path, () => {
            unwatchFile(payload.path);
            resolve('');
          });
        }
      });
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
      const Proxy = require('http-mitm-proxy');
      const path = require('path');
      const os = require('os');
      // Disable debug messages from the proxy
      try {
        require('debug').disable();
      } catch (ex) { }
      const ROOT = path.join(storagePath, 'XfinityHome');
      if (!existsSync(ROOT)) mkdirSync(ROOT);

      const pemFile = path.join(ROOT, 'certs', 'ca.pem');

      const localIPs = [];
      const ifaces = os.networkInterfaces();
      Object.keys(ifaces).forEach(name => {
        ifaces[name]?.forEach(network => {
          const familyV4Value = typeof network.family === 'string' ? 'IPv4' : 4;
          if (network.family === familyV4Value && !network.internal) localIPs.push(network.address);
        });
      });
      localIPs.push(os.hostname() + os.hostname().endsWith('.local') ? '' : '.local');



      const proxy = Proxy();
      const localIPPorts = localIPs.map(ip => `${ip}:${585}`);

      proxy.onError(function (ctx, err) {
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

      proxy.onRequest(function (ctx, callback) {
        if (ctx.clientToProxyRequest.method === 'GET' && ctx.clientToProxyRequest.url === '/cert' && localIPPorts.includes(ctx.clientToProxyRequest.headers.host ?? '')) {
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

        } else if (ctx.clientToProxyRequest.method === 'POST' && ctx.clientToProxyRequest.headers.host === 'oauth.xfinity.com' && ctx.clientToProxyRequest.url === '/oauth/token') {
          ctx.use(Proxy.gunzip);

          ctx.onRequestData(function (ctx, chunk, callback) {
            return callback(undefined, chunk);
          });
          ctx.onRequestEnd(function (ctx, callback) {
            callback();
          });

          let chunks = [];
          ctx.onResponseData(function (ctx, chunk, callback) {
            chunks.push(chunk);
            return callback(undefined, chunk);
          });
          ctx.onResponseEnd(function (ctx, callback) {
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
      this.onRequest("/stopProxy", () => {
        if (proxy && typeof proxy.close === 'function') { proxy.close(); }
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
          require('qrcode').toString(`http://${address}:${port}/cert`, { type: 'svg' })
            .then(qrcode => resolve({ ip: address, port: port, qrcode: qrcode }));
        });
      });

    });
    this.ready();
  }
}

; (() => new PluginUiServer())();