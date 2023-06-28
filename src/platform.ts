import fs from 'fs';
import {
  API, APIEvent, Categories, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service,
} from 'homebridge';
import path from 'path';
import { EventEmitter } from 'stream';
import XHome, { Camera, DryContact, Keyfob, Keypad, Light, Motion, Panel, Smoke, Unknown } from 'xfinityhome';
import { LegacyDryContact } from 'xfinityhome/dist/devices/LegacyDryContact';
import { Router } from 'xfinityhome/dist/devices/Router';

import DryContactAccessory from './accessories/DryContactAccessory';
import LegacyDryContactAccessory from './accessories/LegacyDryContactAccessory';
import LightAccessory from './accessories/LightAccessory';
import MotionAccessory from './accessories/MotionAccessory';
import PanelAccessory from './accessories/PanelAccessory';
import SmokeAccessory from './accessories/SmokeAccessory';
import UnknownAccessory from './accessories/UnknownAccessory';
import CustomCharacteristics from './CustomCharacteristics';
import { CONFIG, CONTEXT, PLATFORM_NAME, PLUGIN_NAME } from './settings';


/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class XfinityHomePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly CustomCharacteristic = CustomCharacteristics(this.api.hap);
  public xhome!: XHome;
  private refreshToken?: string;

  /** this is used to track restored cached accessories */
  private readonly cachedAccessories: PlatformAccessory<CONTEXT>[] = [];
  /** this is used to track which accessories have been restored from the cache */
  private readonly restoredAccessories: PlatformAccessory<CONTEXT>[] = [];
  /** this is used to track which accessories have been added */
  private readonly addedAccessories: PlatformAccessory<CONTEXT>[] = [];
  /** this is used to track which accessories have been configured */
  //public readonly configuredAccessories: PlatformAccessory[] = [];

  public config: PlatformConfig & CONFIG;
  constructor(
    public readonly log: Logger,
    config: PlatformConfig,
    public readonly api: API,
  ) {
    this.config = config as unknown as PlatformConfig & CONFIG;
    (this.api as unknown as EventEmitter).setMaxListeners(0);
    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      log.debug('Executed didFinishLaunching callback');

      const projectDir = path.join(api.user.storagePath(), 'XfinityHome');
      const generalLogPath = path.join(projectDir, 'General.log');
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir);
      }
      const date = new Date();
      const time = `${('0' + (date.getMonth() + 1)).slice(-2)}/${('0' + date.getDate()).slice(-2)}/${date.getFullYear()}, ` +
        `${('0' + (date.getHours() % 12)).slice(-2)}:${('0' + (date.getMinutes())).slice(-2)}:${('0' + (date.getSeconds())).slice(-2)} ` +
        `${date.getHours() > 12 ? 'PM' : 'AM'}`;
      fs.appendFileSync(generalLogPath, `[${time}] Server Started\n`);

      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
    this.api.on(APIEvent.SHUTDOWN, () => {
      const projectDir = path.join(api.user.storagePath(), 'XfinityHome');
      const generalLogPath = path.join(projectDir, 'General.log');
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir);
      }
      const date = new Date();
      const time = `${('0' + (date.getMonth() + 1)).slice(-2)}/${('0' + date.getDate()).slice(-2)}/${date.getFullYear()}, ` +
        `${('0' + (date.getHours() % 12)).slice(-2)}:${('0' + (date.getMinutes())).slice(-2)}:${('0' + (date.getSeconds())).slice(-2)} ` +
        `${date.getHours() > 12 ? 'PM' : 'AM'}`;
      fs.appendFileSync(generalLogPath, `[${time}] Server Stopped\n`);

    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory<CONTEXT>) {
    this.log.debug('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.cachedAccessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    if (this.refreshToken) {
      this.log.info('Using Refresh Token From Cache:', this.refreshToken);
    } else if (this.config.refreshToken) {
      this.log.info('Using Refresh Token From Config:', this.config.refreshToken);
    } else {
      this.log.error('No Refresh Token Found');
      return;
    }
    try {
      this.xhome = new XHome(this.refreshToken || this.config.refreshToken, {
        enabled: true, autoFetch: false,
        errorHandler: this.config.logWatchdogErrors ? err => this.log.warn('Watchdog Error:', err) : undefined,
      });
    } catch (err) {
      this.log.error('Failed To Login With Error:', err);
      const projectDir = path.join(this.api.user.storagePath(), 'XfinityHome');
      const generalLogPath = path.join(projectDir, 'General.log');
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir);
      }
      const date = new Date();
      const time = `${('0' + (date.getMonth() + 1)).slice(-2)}/${('0' + date.getDate()).slice(-2)}/${date.getFullYear()}, ` +
        `${('0' + (date.getHours() % 12)).slice(-2)}:${('0' + (date.getMinutes())).slice(-2)}:${('0' + (date.getSeconds())).slice(-2)} ` +
        `${date.getHours() > 12 ? 'PM' : 'AM'}`;
      fs.appendFileSync(generalLogPath, `[${time}] Error Encountered While Logging In: ${JSON.stringify(err)}\n`);
      if (this.refreshToken) {
        this.log.warn('Attempting To Login With Config Refresh Token');
        this.refreshToken = undefined;
        this.discoverDevices();
      } else {
        throw 'Setup Failed';
      }
      return;
    }
    this.log.info(
      `Loaded ${this.cachedAccessories.length} ${this.cachedAccessories.length === 1 ? 'Accessory' : 'Accessories'} From Cache`,
    );
    for (const device of await this.xhome.getDevices()) {
      if ([Keyfob, Keypad, Camera, Router].find(blockedAccessory => device instanceof blockedAccessory ||
        (device instanceof Unknown && device.device.model === 'TCHU1AL0')) === undefined) {
        const uuid = this.api.hap.uuid.generate(device.device.hardwareId);
        const existingAccessory = this.cachedAccessories.find(accessory => accessory.UUID === uuid);
        if (existingAccessory) {
          this.log.debug('Restoring existing accessory from cache:', existingAccessory.displayName);
          this.restoredAccessories.push(existingAccessory);
          switch (device.constructor) {
            case Panel:
              new PanelAccessory(this, existingAccessory, device as Panel);
              break;
            case Light:
              new LightAccessory(this, existingAccessory, device as Light);
              break;
            case Motion:
              new MotionAccessory(this, existingAccessory, device as Motion);
              break;
            case Smoke:
              new SmokeAccessory(this, existingAccessory, device as Smoke);
              break;
            case DryContact:
              new DryContactAccessory(this, existingAccessory, device as DryContact);
              break;
            case LegacyDryContact:
              new LegacyDryContactAccessory(this, existingAccessory, device as LegacyDryContact);
              break;
            case Keyfob:
            case Keypad:
            case Camera:
            case Router:
              this.restoredAccessories.slice(-1);
              break;
            default:
              switch ('model' in device.device ? device.device.model : '') {
                case 'TCHU1AL0':
                  break;
                default:
                  new UnknownAccessory(this, existingAccessory, device as Unknown);
                  break;
              }
              break;
          }
        } else {
          const name = device instanceof Panel ? 'Panel' : device.device.name ||
            ('model' in device.device ? device.device.model : 'unknown');
          // the accessory does not yet exist, so we need to create it
          this.log.info('Adding new accessory:', name);

          // create a new accessory
          let accessory: PlatformAccessory<CONTEXT>;

          switch (device.constructor) {
            case Panel:
              accessory = new this.api.platformAccessory<CONTEXT>(name, uuid, Categories.SECURITY_SYSTEM);
              new PanelAccessory(this, accessory, device as Panel);
              break;
            case Light:
              accessory = new this.api.platformAccessory<CONTEXT>(name, uuid, Categories.OUTLET);
              new LightAccessory(this, accessory, device as Light);
              break;
            case Motion:
              accessory = new this.api.platformAccessory<CONTEXT>(name, uuid, Categories.SENSOR);
              new MotionAccessory(this, accessory, device as Motion);
              break;
            case Smoke:
              accessory = new this.api.platformAccessory<CONTEXT>(name, uuid, Categories.SENSOR);
              new SmokeAccessory(this, accessory, device as Smoke);
              break;
            case DryContact:
              accessory = new this.api.platformAccessory<CONTEXT>(name, uuid,
                (device as DryContact).device.properties.type === 'door' ? Categories.DOOR : Categories.WINDOW);
              new DryContactAccessory(this, accessory, device as DryContact);
              break;
            case LegacyDryContact:
              accessory = new this.api.platformAccessory<CONTEXT>(name, uuid,
                (device as LegacyDryContact).device.properties.type === 'door' ? Categories.DOOR : Categories.WINDOW);
              new LegacyDryContactAccessory(this, accessory, device as LegacyDryContact);
              break;
            default:
              accessory = new this.api.platformAccessory<CONTEXT>(name, uuid);
              new UnknownAccessory(this, accessory, device as Unknown);
              break;
          }
          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = device.device;
          this.addedAccessories.push(accessory);
        }
      }
    }
    const accessoriesToRemove = this.cachedAccessories.filter(cachedAccessory =>
      !this.restoredAccessories.find(restoredAccessory => restoredAccessory.UUID === cachedAccessory.UUID));
    for (const accessory of accessoriesToRemove) {
      this.log.warn('Removing Accessory: ', accessory.displayName);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
    // link the accessories to your platform
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [...this.addedAccessories]);
    this.log.info(
      `Restored ${this.restoredAccessories.length} ${this.restoredAccessories.length === 1 ? 'Accessory' : 'Accessories'}`,
    );
    this.log.info(
      `Added ${this.addedAccessories.length} ${this.addedAccessories.length === 1 ? 'Accessory' : 'Accessories'}`,
    );
    this.log.info(
      `Removed ${accessoriesToRemove.length} ${accessoriesToRemove.length === 1 ? 'Accessory' : 'Accessories'}`,
    );
  }
}
