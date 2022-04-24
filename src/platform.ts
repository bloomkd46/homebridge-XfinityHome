import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, APIEvent } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import PanelAccessory from './accessories/PanelAccessory';
import MotionAccessory from './accessories/MotionAccessory';
import XHome, { Panel, Motion, DryContact, Light } from 'xhome';
import DryContactAccessory from './accessories/DryContactAccessory';
import LightAccessory from './accessories/LightAccessory';

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

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

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
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
    if (!this.refreshToken) {
      this.log.info('Loading Refresh Token From Cache');
      this.refreshToken = accessory.context.refreshToken;
      this.log.info(this.refreshToken || 'ERROR LOADING TOKEN');
    }
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    try {
      this.xhome = await XHome.init(this.refreshToken || this.config.refreshToken);
      for (const device of [...this.xhome.Panel, ...this.xhome.MotionSensors, ...this.xhome.DryContactSensors, ...this.xhome.Lights]) {
        const uuid = this.api.hap.uuid.generate(device.device.hardwareId);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        if (existingAccessory) {
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
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
              }
              break;
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
              }
              break;
          }

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
      this.xhome.watchForEvents(this.config.activeInterval || 1000, this.config.activerDuration || 5000,
        this.config.inactiveInterval || 5000, err => this.log.warn('Failed To Auto-Update State With Error:', err));
    } catch (e) {
      this.log.error('Failed To Login With Error', e);
      if (this.refreshToken) {
        this.log.info('Attempting To Login With Config Refresh Token');
        this.refreshToken = undefined;
        this.discoverDevices();
      }
    }
  }
}
