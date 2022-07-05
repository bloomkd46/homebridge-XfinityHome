import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, APIEvent } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import PanelAccessory from './accessories/PanelAccessory';
import MotionAccessory from './accessories/MotionAccessory';
import XHome, { Panel, Motion, DryContact, Light } from 'xfinityhome';
import DryContactAccessory from './accessories/DryContactAccessory';
import LightAccessory from './accessories/LightAccessory';
import fs from 'fs';
import path from 'path';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class XfinityHomePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public xhome!: XHome;
  private refreshToken?: string;

  /** this is used to track restored cached accessories */
  private readonly cachedAccessories: PlatformAccessory[] = [];
  /** this is used to track which accessories have been restored from the cache */
  private readonly restoredAccessories: PlatformAccessory[] = [];
  /** this is used to track which accessories have been added */
  private readonly addedAccessories: PlatformAccessory[] = [];
  /** this is used to track which accessories have been configured */
  //public readonly configuredAccessories: PlatformAccessory[] = [];


  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
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
  configureAccessory(accessory: PlatformAccessory) {
    this.log.debug('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.cachedAccessories.push(accessory);
    if (!this.refreshToken) {
      //this.log.info('Loading Refresh Token From Cache');
      this.refreshToken = accessory.context.refreshToken;
      //this.log.info(this.refreshToken || 'ERROR LOADING TOKEN');
    }
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
      this.xhome = await XHome.init(this.refreshToken || this.config.refreshToken);
    } catch (err) {
      this.log.error('Failed To Login With Error:', err);
      if (this.refreshToken) {
        this.log.warn('Attempting To Login With Config Refresh Token');
        this.refreshToken = undefined;
        this.discoverDevices();
      }
    }
    this.log.info(
      `Loaded ${this.cachedAccessories.length} ${this.cachedAccessories.length === 1 ? 'Accessory' : 'Accessories'} From Cache`,
    );
    for (const device of [...this.xhome.Panel, ...this.xhome.MotionSensors, ...this.xhome.DryContactSensors, ...this.xhome.Lights]) {
      let success = true;
      const uuid = this.api.hap.uuid.generate(device.device.hardwareId);
      const existingAccessory = this.cachedAccessories.find(accessory => accessory.UUID === uuid);
      if (existingAccessory) {
        this.log.debug('Restoring existing accessory from cache:', existingAccessory.displayName);
        switch (device.device.deviceType) {
          case 'panel':
            new PanelAccessory(this, existingAccessory, device as Panel);
            break;
          case 'lightDimmer':
            continue;
          case 'lightSwitch':
            new LightAccessory(this, existingAccessory, device as Light);
            break;
          case 'sensor':
            if ((device as Motion | DryContact).device.properties.sensorType === 'dryContact') {
              new DryContactAccessory(this, existingAccessory, device as DryContact);
            } else if ((device as Motion | DryContact).device.properties.sensorType === 'motion') {
              new MotionAccessory(this, existingAccessory, device as Motion);
            } else {
              this.log.error('Unknown Device Detected: ', device.device);
              this.log.warn(
                'Please open an issue at https://github.com/bloomkd46/homebridge-XfinityHome/issues/new/choose' +
                ' using the info above so that I can add support for it');
              success = false;
            }
            break;
        }
        if (success) {
          this.restoredAccessories.push(existingAccessory);
        }
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.device.name || 'Panel');

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.device.name || 'Panel', uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device.device;

        switch (device.device.deviceType) {
          case 'panel':
            new PanelAccessory(this, accessory, device as Panel);
            break;
          case 'lightDimmer':
            continue;
          case 'lightSwitch':
            new LightAccessory(this, accessory, device as Light);
            break;
          case 'sensor':
            if ((device as Motion | DryContact).device.properties.sensorType === 'dryContact') {
              new DryContactAccessory(this, accessory, device as DryContact);
            } else if ((device as Motion | DryContact).device.properties.sensorType === 'motion') {
              new MotionAccessory(this, accessory, device as Motion);
            } else {
              this.log.error('Unknown Device Detected: ', device.device);
              this.log.warn(
                'Please open an issue at https://github.com/bloomkd46/homebridge-XfinityHome/issues/new/choose using the info above');
              success = false;
            }
            break;
        }
        if (success) {
          this.addedAccessories.push(accessory);
        }

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
    const accessoriesToRemove = this.cachedAccessories.filter(cachedAccessory =>
      !this.restoredAccessories.find(restoredAccessory => restoredAccessory.UUID === cachedAccessory.UUID));
    for (const accessory of accessoriesToRemove) {
      this.log.warn('Removing Accessory: ', accessory.displayName);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
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
