import { Service, PlatformAccessory, CharacteristicValue, HAPStatus, CharacteristicChange } from 'homebridge';
import { XfinityHomePlatform } from '../platform';
import Accessory from './Accessory';
import { Light } from 'xfinityhome';

export default class LightAccessory extends Accessory {
  private service: Service;
  constructor(
    private readonly platform: XfinityHomePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: Light,
  ) {
    super(platform, accessory, device);

    this.service = this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.device.device.name);

    this.service.getCharacteristic(this.platform.Characteristic.On)

      .onSet(this.set.bind(this))
      .on('change', this.notifyIsOnChange.bind(this));

    if (this.device.device.properties.dimAllowed) {
      this.service.getCharacteristic(this.platform.Characteristic.Brightness)
        .onGet(this.getBrightness.bind(this))
        .onSet(this.set.bind(this))
        .on('change', this.notifyBrightnessChange.bind(this));
    }

    this.device.activityCallback = async (event) => {
      this.service.updateCharacteristic(this.platform.Characteristic.On, event.metadata.isOn === 'true');
      if (this.device.device.properties.dimAllowed) {
        this.service.updateCharacteristic(this.platform.Characteristic.Brightness, parseFloat(event.metadata.level));
      }
      this.accessory.context.logPath = this.logPath;
      this.accessory.context.device = device;
      this.accessory.context.refreshToken = this.device.xhome.refreshToken;
      this.platform.api.updatePlatformAccessories([this.accessory]);
    };
  }

  async getIsOn(): Promise<CharacteristicValue> {
    return new Promise((resolve, reject) => {
      this.device.get().then(device => {
        device.properties.level ?
          this.service.updateCharacteristic(this.platform.Characteristic.Brightness, device.properties.level) : undefined;
        resolve(device.properties.isOn);

        this.accessory.context.logPath = this.logPath;
        this.accessory.context.device = device;
        this.accessory.context.refreshToken = this.device.xhome.refreshToken;
        this.platform.api.updatePlatformAccessories([this.accessory]);
      }).catch(err => {
        this.log('error', 'Failed To Fetch IsOn State With Error:', err);
        reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
      });
    });
  }

  async notifyIsOnChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(2, value.newValue ? 'Enabled' : 'Disabled');
    }
  }

  async set(value: CharacteristicValue): Promise<void> {
    //this.service.updateCharacteristic(this.platform.Characteristic[typeof value === 'boolean' ? 'On' : 'Brightness'], value);
    return new Promise((resolve, reject) => {
      this.device.set(value as number | boolean).then(() => {
        //this.service.updateCharacteristic(this.platform.Characteristic[typeof value === 'boolean' ? 'On' : 'Brightness'], value);
        resolve();
      }).catch(err => {
        this.log('error', `Failed To Set ${typeof value === 'number' ? 'Brightness' : 'IsOn'} With Error:`, err);
        reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
      });
    });
  }

  getBrightness(): CharacteristicValue {
    if (this.device.device.properties.level === undefined) {
      throw new this.StatusError(HAPStatus.RESOURCE_DOES_NOT_EXIST);
    }
    return this.device.device.properties.level;
  }

  async notifyBrightnessChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(2, 'Set To ' + value.newValue);
    }
  }
}