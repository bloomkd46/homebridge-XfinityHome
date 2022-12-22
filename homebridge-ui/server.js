"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable no-console */
const debug_1 = __importDefault(require("debug"));
const events_1 = require("events");
const fs_1 = require("fs");
const http_mitm_proxy_1 = __importDefault(require("http-mitm-proxy"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const qrcode_1 = __importDefault(require("qrcode"));
const plugin_ui_utils_1 = require("@homebridge/plugin-ui-utils");
class PluginUiServer extends plugin_ui_utils_1.HomebridgePluginUiServer {
    constructor() {
        var _a, _b;
        const events = new events_1.EventEmitter();
        super();
        const plugin = 'homebridge-xfinityhome';
        const platform = 'XfinityHomePlatform';
        const storagePath = (_a = this.homebridgeStoragePath) !== null && _a !== void 0 ? _a : '';
        const configPath = (_b = this.homebridgeConfigPath) !== null && _b !== void 0 ? _b : '';
        const config = JSON.parse((0, fs_1.readFileSync)(configPath, 'utf-8')).platforms.find((plugin) => plugin.platform === platform);
        /*
          A native method getCachedAccessories() was introduced in config-ui-x v4.37.0
          The following is for users who have a lower version of config-ui-x
        */
        let cachedAccessoriesDir;
        this.onRequest('/getCachedAccessories', () => __awaiter(this, void 0, void 0, function* () {
            var _c, _d, _e;
            try {
                // Define the plugin and create the array to return
                if (cachedAccessoriesDir && (0, fs_1.existsSync)(cachedAccessoriesDir)) {
                    return JSON.parse((0, fs_1.readFileSync)(cachedAccessoriesDir, 'utf-8')).filter(accessory => accessory.plugin === plugin);
                }
                else if (!cachedAccessoriesDir) {
                    cachedAccessoriesDir = path_1.default.join(storagePath, '/accessories/cachedAccessories') +
                        (((_c = config._bridge) === null || _c === void 0 ? void 0 : _c.username) ? ('.' + ((_e = (_d = config._bridge) === null || _d === void 0 ? void 0 : _d.username) === null || _e === void 0 ? void 0 : _e.split(':').join(''))) : '');
                    return JSON.parse((0, fs_1.readFileSync)(cachedAccessoriesDir, 'utf-8')).filter(accessory => accessory.plugin === plugin);
                }
                else {
                    return [];
                }
            }
            catch (err) {
                // Just return an empty accessory list in case of any errors
                console.log(err);
                return [];
            }
        }));
        this.onRequest('/getGeneralLog', () => __awaiter(this, void 0, void 0, function* () {
            return path_1.default.join(storagePath, 'XfinityHome', 'General.log');
        }));
        this.onRequest('/getLogs', (payload) => __awaiter(this, void 0, void 0, function* () {
            try {
                return (0, fs_1.readFileSync)(payload.logPath).toString().split('\n').join('<br>');
            }
            catch (err) {
                return `Failed To Load Logs From ${payload.logPath}`;
            }
        }));
        this.onRequest('/getRelativePath', (payload) => {
            return path_1.default.relative(path_1.default.join(__dirname, '/public/index.html'), payload.path);
        });
        this.onRequest('/deleteLog', (payload) => __awaiter(this, void 0, void 0, function* () {
            try {
                return (0, fs_1.rmSync)(payload.logPath, { force: true });
            }
            catch (err) {
                return err;
            }
        }));
        this.onRequest('/watchForChanges', (payload) => __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                if (!(0, fs_1.existsSync)(payload.path)) {
                    reject('File does not exist: ' + payload.path);
                    return;
                }
                try {
                    const aborter = new AbortController();
                    const watcher = (0, fs_1.watch)(payload.path, { signal: aborter.signal });
                    watcher.once('change', () => {
                        aborter.abort();
                        resolve('');
                    });
                    watcher.once('error', err => {
                        console.error(err);
                        aborter.abort();
                        (0, fs_1.watchFile)(payload.path, () => {
                            (0, fs_1.unwatchFile)(payload.path);
                            resolve('');
                        });
                    });
                }
                catch (_a) {
                    (0, fs_1.watchFile)(payload.path, () => {
                        (0, fs_1.unwatchFile)(payload.path);
                        resolve('');
                    });
                }
            });
        }));
        this.onRequest('/proxyActive', () => __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve) => {
                events.on('proxy', () => resolve(''));
            });
        }));
        /*this.onRequest('/sslActive', async () => {
          return new Promise((resolve) => {
            events.on('ssl', () => resolve());
          });
        });*/
        this.onRequest('/token', () => __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve) => {
                events.on('token', token => resolve(token));
            });
        }));
        this.onRequest('/startProxy', () => __awaiter(this, void 0, void 0, function* () {
            // Disable debug messages from the proxy
            try {
                debug_1.default.disable();
            }
            catch (err) {
                //Do nothing
            }
            const ROOT = path_1.default.join(storagePath, 'XfinityHome');
            if (!(0, fs_1.existsSync)(ROOT)) {
                (0, fs_1.mkdirSync)(ROOT);
            }
            const pemFile = path_1.default.join(ROOT, 'certs', 'ca.pem');
            const localIPs = [];
            const ifaces = os_1.default.networkInterfaces();
            Object.keys(ifaces).forEach(name => {
                var _a;
                (_a = ifaces[name]) === null || _a === void 0 ? void 0 : _a.forEach(network => {
                    const familyV4Value = typeof network.family === 'string' ? 'IPv4' : 4;
                    if (network.family === familyV4Value && !network.internal) {
                        localIPs.push(network.address);
                    }
                });
            });
            localIPs.push(os_1.default.hostname() + os_1.default.hostname().endsWith('.local') ? '' : '.local');
            const proxy = (0, http_mitm_proxy_1.default)();
            const localIPPorts = localIPs.map(ip => `${ip}:${585}`);
            proxy.onError((ctx, err) => {
                switch (err === null || err === void 0 ? void 0 : err.name) {
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
                var _a;
                if (ctx.clientToProxyRequest.method === 'GET' && ctx.clientToProxyRequest.url === '/cert' &&
                    localIPPorts.includes((_a = ctx.clientToProxyRequest.headers.host) !== null && _a !== void 0 ? _a : '')) {
                    ctx.use(http_mitm_proxy_1.default.gunzip);
                    console.log('Intercepted certificate request');
                    ctx.proxyToClientResponse.writeHead(200, {
                        'Accept-Ranges': 'bytes',
                        'Cache-Control': 'public, max-age=0',
                        'Content-Type': 'application/x-x509-ca-cert',
                        'Content-Disposition': 'attachment; filename=cert.pem',
                        'Content-Transfer-Encoding': 'binary',
                        'Content-Length': (0, fs_1.statSync)(pemFile).size,
                        'Connection': 'keep-alive',
                    });
                    //ctx.proxyToClientResponse.end(fs.readFileSync(path.join(ROOT, 'certs', 'ca.pem')));
                    ctx.proxyToClientResponse.write((0, fs_1.readFileSync)(pemFile));
                    ctx.proxyToClientResponse.end();
                    return;
                }
                else if (ctx.clientToProxyRequest.method === 'POST' && ctx.clientToProxyRequest.headers.host === 'oauth.xfinity.com' &&
                    ctx.clientToProxyRequest.url === '/oauth/token') {
                    ctx.use(http_mitm_proxy_1.default.gunzip);
                    ctx.onRequestData((ctx, chunk, callback) => {
                        return callback(undefined, chunk);
                    });
                    ctx.onRequestEnd((ctx, callback) => {
                        callback();
                    });
                    const chunks = [];
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
                }
                else {
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
                if ((0, fs_1.existsSync)(path_1.default.join(ROOT, 'certs'))) {
                    (0, fs_1.rmSync)(path_1.default.join(ROOT, 'certs'), { recursive: true, force: true });
                }
                if ((0, fs_1.existsSync)(path_1.default.join(ROOT, 'keys'))) {
                    (0, fs_1.rmSync)(path_1.default.join(ROOT, 'keys'), { recursive: true, force: true });
                }
                return '';
            });
            return new Promise((resolve) => {
                proxy.listen({ port: 585, sslCaDir: ROOT }, (err) => __awaiter(this, void 0, void 0, function* () {
                    if (err) {
                        console.error('Error starting proxy: ' + err);
                    }
                    const address = localIPs[0];
                    const port = 585;
                    qrcode_1.default.toString(`http://${address}:${port}/cert`, { type: 'svg' })
                        .then(qrcode => resolve({ ip: address, port: port, qrcode: qrcode }));
                }));
            });
        }));
        this.ready();
    }
}
(() => new PluginUiServer())();
