import { Service, PlatformAccessory, CharacteristicValue, HAPStatus, CharacteristicChange, Perms } from 'homebridge';
import { XfinityHomePlatform } from '../platform';
import Accessory from './Accessory';
import { DryContact } from 'xfinityhome';

export default class DryContactAccessory extends Accessory {
  private service: Service;
  constructor(
    private readonly platform: XfinityHomePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: DryContact,
  ) {
    super(platform, accessory, device);

    this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.device.device.name);

    this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(this.getContactDetected.bind(this))
      .on('change', this.notifyContactChange.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.StatusActive)
      .onGet(this.getActive.bind(this))
      .on('change', this.notifyActiveChange.bind(this))
      .onSet(this.setActive.bind(this)).setProps({
        perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
      });

    this.device.activityCallback = async () => {
      this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, await this.getContactDetected());
    };
  }

  async getContactDetected(): Promise<CharacteristicValue> {
    return new Promise((resolve, reject) => {
      this.device.get().then(device => {
        this.service.updateCharacteristic(this.platform.Characteristic.StatusActive, this.getActive());
        this.temperatureService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature,
          this.device.device.properties.temperature / 100);
        resolve(device.properties.isFaulted ? 1 : 0);

        this.accessory.context.logPath = this.logPath;
        this.accessory.context.device = device;
        this.accessory.context.refreshToken = this.device.xhome.refreshToken;
        this.platform.api.updatePlatformAccessories([this.accessory]);
      }).catch(err => {
        this.log('error', 'Failed To Fetch Contact State With Error:', err);
        reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
      });
    });
  }

  async notifyContactChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(3, value.newValue === 0 ? 'Closed' : 'Opened');
    }
  }

  getActive(): CharacteristicValue {
    return !this.device.device.properties.isBypassed;
  }

  async setActive(value: CharacteristicValue): Promise<void> {
    this.device.bypass(!value);
  }

  async notifyActiveChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(2, value.newValue ? 'Activated' : 'Bypassed');
    }
  }
}