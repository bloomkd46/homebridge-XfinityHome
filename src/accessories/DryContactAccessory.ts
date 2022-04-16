import { Service, PlatformAccessory, CharacteristicValue, HAPStatus, CharacteristicChange } from 'homebridge';
import { XfinityHomePlatform } from '../platform';
import Accessory from './Accessory';
import { DryContact } from 'xhome';

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

    this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(this.getContactDetected.bind(this))
      .on('change', this.notifyContactChange.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .on('change', this.notifyActiveChange.bind(this))
      ?.onSet(this.setActive.bind(this));

    this.device.activityCallback = async () => {
      this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, await this.getContactDetected());
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.getActive());
      this.temperatureService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, device.device.properties.temperature);
    };
  }

  async getContactDetected(): Promise<CharacteristicValue> {
    return new Promise((resolve, reject) => {
      this.device.get().then(device => {
        this.service.updateCharacteristic(this.platform.Characteristic.StatusActive, this.getActive());
        this.temperatureService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature,
          this.device.device.properties.temperature);

        resolve(device.properties.isFaulted ? 1 : 0);
      }).catch(err => {
        this.log('error', 'Failed To Fetch Contact State With Error:\n', err.response.data);
        reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
      });
    });
  }

  async notifyContactChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(3, `Contact ${value.newValue === 0 ? 'Detected' : 'Not Detected'}`);
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
      this.log(3, value.newValue ? 'Activated' : 'Bypassed');
    }
  }
}