import fs from 'fs';
//@ts-check
import { CharacteristicChange, HAPStatus, HapStatusError, PlatformAccessory, Service } from 'homebridge';
import path from 'path';
import { Device, Light, Panel } from 'xfinityhome';

import { XfinityHomePlatform } from '../platform';
import { CONTEXT } from '../settings';


export default class Accessory {
  protected temperatureService?: Service;
  protected name: string;
  protected log: (type: 'info' | 'warn' | 'error' | 'debug' | 1 | 2 | 3 | 4, message: string, ...args: unknown[]) => void;
  protected StatusError: typeof HapStatusError;
  protected projectDir: string;
  protected logPath: string;
  protected generalLogPath: string;

  constructor(
    platform: XfinityHomePlatform,
    accessory: PlatformAccessory<CONTEXT>,
    device: Device,
  ) {
    this.name = device instanceof Panel ? 'Panel' : device.device.name || device.device.model;
    this.projectDir = path.join(platform.api.user.storagePath(), 'XfinityHome');
    this.logPath = path.join(this.projectDir, this.name + '.log');
    this.generalLogPath = path.join(this.projectDir, 'General.log');

    if (!fs.existsSync(this.projectDir)) {
      fs.mkdirSync(this.projectDir);
    }
    this.log = (type: 'info' | 'warn' | 'error' | 'debug' | 1 | 2 | 3 | 4, message: string, ...args: unknown[]) => {
      const parsedArgs = args.map(arg => JSON.stringify(arg, null, 2));
      const date = new Date();
      const time = `${('0' + (date.getMonth() + 1)).slice(-2)}/${('0' + date.getDate()).slice(-2)}/${date.getFullYear()}, ` +
        `${('0' + (date.getHours() % 12)).slice(-2)}:${('0' + (date.getMinutes())).slice(-2)}:${('0' + (date.getSeconds())).slice(-2)} ` +
        `${date.getHours() > 12 ? 'PM' : 'AM'}`;

      //if (typeof type === 'number') {
      if (type < 4 || typeof type === 'string') {
        fs.appendFileSync(this.generalLogPath, `[${time}] ${this.name}: ${message} ${parsedArgs.join(' ')}\n`);
      }
      fs.appendFileSync(this.logPath, `[${time}] ${message} ${parsedArgs.join(' ')}\n`);
      if (typeof type === 'string') {
        platform.log[type](`${this.name}: ${message} `, ...parsedArgs);
      } else if (type <= (platform.config.logLevel ?? 3)) {
        platform.log.info(`${this.name}: ${message} `, ...parsedArgs);
      } else {
        platform.log.debug(`${this.name}: ${message} `, ...parsedArgs);
      }
    };
    this.log(4, 'Server Started');
    this.StatusError = platform.api.hap.HapStatusError;

    platform.api.on('shutdown', () => {
      this.log(4, 'Server Stopped');
      accessory.context.logPath = this.logPath;
      accessory.context.device = device.device;
      accessory.context.refreshToken = platform.xhome.refreshToken;
      platform.api.updatePlatformAccessories([accessory]);
    });

    const deviceInfo = device.device;
    // set accessory information
    accessory.getService(platform.Service.AccessoryInformation)!
      .setCharacteristic(platform.Characteristic.Manufacturer, deviceInfo.manufacturer)
      .setCharacteristic(platform.Characteristic.SerialNumber, 'serialNumber' in deviceInfo ? deviceInfo.serialNumber : accessory.UUID)
      .setCharacteristic(platform.Characteristic.Model, deviceInfo.model)
      .setCharacteristic(platform.Characteristic.Name, this.name)
      .setCharacteristic(platform.Characteristic.FirmwareRevision, deviceInfo.firmwareVersion);
    if ('label' in device) {
      accessory.getService(platform.Service.AccessoryInformation)!
        .getCharacteristic(platform.Characteristic.ConfiguredName).onGet(() => device.device.name).onSet(async name => {
          if ('label' in device) {
            await device.label(name as string).catch(err => {
              this.log('error', 'Failed To Change Configured Name With Error:', err);
              throw new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
            });
          } else {
            this.log('error', 'Failed To Change Configured Name With Error:', 'READ_ONLY_CHARACTERISTIC');
            throw new this.StatusError(HAPStatus.READ_ONLY_CHARACTERISTIC);
          }
        }).on('change', async (value) => {
          if (value.newValue !== value.oldValue) {
            this.log(3, `Configured Name Changed From ${value.oldValue} To ${value.newValue}`);
          }
        });
    }
    accessory.getService(platform.Service.AccessoryInformation)!.getCharacteristic(platform.Characteristic.Identify).on('set', () => {
      this.log('info', 'Identifying Device:', device.device);
      if (device instanceof Light) {
        let mode = device.device.properties.isOn;
        const startMode = mode;
        const interval = setInterval(() => {
          device.set(!mode).catch(err => {
            this.log('error', 'Failed To Toggle Light With Error:', err);
          });
          mode = !mode;
        }, 750);
        setTimeout(() => {
          clearInterval(interval);
          device.set(startMode).catch(err => {
            this.log('error', 'Failed To Toggle Light With Error:', err);
          });
        }, 5000);
      }
    });

    if ('temperature' in device.device.properties && (platform.config.temperatureSensors ?? true)) {
      this.temperatureService = accessory.getService(platform.Service.TemperatureSensor);
      if (!this.temperatureService) {
        this.log('info', 'Adding Temperature Support');
        this.temperatureService = accessory.addService(platform.Service.TemperatureSensor);
      }

      this.temperatureService.setCharacteristic(platform.Characteristic.Name, device.device.name + ' Temperature');

      this.temperatureService.getCharacteristic(platform.Characteristic.CurrentTemperature)
        .onGet((): number => {
          return device.device.properties.temperature / 100;
          /*return new Promise((resolve, reject) => {
            device.get().then(device => resolve(device.properties.temperature / 100)).catch(err => {
              this.log('error', 'Failed To Fetch Temperature With Error:', err);
              reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
            });
          });*/
        })
        .setProps({
          minStep: 0.01,
        })
        .on('change', async (value: CharacteristicChange): Promise<void> => {
          if (value.newValue !== value.oldValue) {
            this.log(4, `Updating Temperature To ${value.newValue}°C`);
          }
        });
    } else if (!(platform.config.temperatureSensors ?? true) && accessory.getService(platform.Service.TemperatureSensor)) {
      this.log('warn', 'Removing Temperature Support');
      accessory.removeService(accessory.getService(platform.Service.TemperatureSensor)!);
    }
  }
}
