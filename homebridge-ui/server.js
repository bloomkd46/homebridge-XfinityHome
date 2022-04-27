/* jshint node: true, esversion: 10, -W014, -W033 */
/* eslint-disable new-cap */
'use strict';

const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const { existsSync, readFileSync, writeFileSync } = require('fs');
//import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
//import { existsSync, promises, readFileSync } from 'fs';
class PluginUiServer extends HomebridgePluginUiServer {
  constructor () {
    super();

    /*
      A native method getCachedAccessories() was introduced in config-ui-x v4.37.0
      The following is for users who have a lower version of config-ui-x
    */
    this.onRequest('/getCachedAccessories', async () => {
      try {
        // Define the plugin and create the array to return
        const plugin = 'homebridge-irobot';
        const devicesToReturn = [];

        // The path and file of the cached accessories
        const accFile = this.homebridgeStoragePath + '/accessories/cachedAccessories';

        // Check the file exists
        if (existsSync(accFile)) {
          // Read the cached accessories file
          let cachedAccessories = await promises.readFile(accFile);

          // Parse the JSON
          cachedAccessories = JSON.parse(cachedAccessories);

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
    this.onRequest('/getLogs', async (payload) => {
      try {
        return readFileSync(payload.logPath);
      } catch (err) {
        return err;
      }
    });

    this.onRequest('/startProxy', async () => {
      const Proxy = require('http-mitm-proxy');
      const QRCode = require('qrcode');
      const path = require('path');
      const os = require('os');
      // Disable debug messages from the proxy
      try {
        require('debug').disable();
      } catch (ex) { }

      const ROOT = path.resolve(__dirname);

      const pemFile = path.join(ROOT, 'certs', 'ca.pem');

      const localIPs = [];
      const ifaces = os.networkInterfaces();
      Object.keys(ifaces).forEach(name => {
        ifaces[name].forEach(network => {
          if (network.family === 'IPv4' && !network.internal) localIPs.push(network.address);
        });
      });

      const proxy = Proxy();
      const localIPPorts = localIPs.map(ip => `${ip}:${8080}`);

      proxy.onError(function (ctx, err) {
        switch (err.code) {
          case 'ERR_STREAM_DESTROYED':
          case 'ECONNRESET':
            return;

          case 'ECONNREFUSED':
            console.error('Failed to intercept secure communications. This could happen due to bad CA certificate.');
            return;

          case 'EACCES':
            console.error(`Permission was denied to use port ${8080}.`);
            return;

          default:
          //console.error('Error:', err.code, err);
        }
      });

      proxy.onRequest(function (ctx, callback) {
        this.pushEvent('proxy');
        if (ctx.clientToProxyRequest.method === 'GET' && ctx.clientToProxyRequest.url === '/cert' && localIPPorts.includes(ctx.clientToProxyRequest.headers.host)) {
          ctx.use(Proxy.gunzip);
          console.log('Intercepted certificate request');

          ctx.proxyToClientResponse.writeHeader(200, {
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=0',
            'Content-Type': 'application/x-x509-ca-cert',
            'Content-Disposition': 'attachment; filename=cert.pem',
            'Content-Transfer-Encoding': 'binary',
            'Content-Length': fs.statSync(pemFile).size,
            'Connection': 'keep-alive',
          });
          //ctx.proxyToClientResponse.end(fs.readFileSync(path.join(ROOT, 'certs', 'ca.pem')));
          ctx.proxyToClientResponse.write(fs.readFileSync(pemFile));
          ctx.proxyToClientResponse.end();

          return;

        } else if (ctx.clientToProxyRequest.method === 'POST' && ctx.clientToProxyRequest.headers.host === 'oauth.xfinity.com' && ctx.clientToProxyRequest.url === '/oauth/token') {
          ctx.use(Proxy.gunzip);

          ctx.onRequestData(function (ctx, chunk, callback) {
            return callback(null, chunk);
          });
          ctx.onRequestEnd(function (ctx, callback) {
            callback();
          });

          let chunks = [];
          ctx.onResponseData(function (ctx, chunk, callback) {
            chunks.push(chunk);
            return callback(null, chunk);
          });
          ctx.onResponseEnd(function (ctx, callback) {
            this.pushEvent('token', { refreshToken: JSON.parse(Buffer.concat(chunks).toString()).refresh_token });
            //emitter.emit('tuya-config', Buffer.concat(chunks).toString());
            callback();
          });
        } else {
          ctx.onRequestData(function (ctx, chunk, callback) {
            ctx.onResponseData(function (ctx, chunk, callback) {
              this.pushEvent('sslProxy');
            });
          });
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
        if (proxy)
          proxy.close();
      });
      return new Promise((resolve) => {
        proxy.listen({ port: 8080, sslCaDir: ROOT }, async err => {
          if (err) {
            console.error('Error starting proxy: ' + err);
          }
          const address = localIPs[0];
          const port = 8080;
          const qrcode = await require('qrcode').toString(`http://${address}:${port}/cert`, { type: 'svg' });
          writeFileSync('public/qrcode.svg', qrcode);
          resolve({ ip: address, port: port });;
        });
      });

    });
    this.ready();
  }
}

; (() => new PluginUiServer())();