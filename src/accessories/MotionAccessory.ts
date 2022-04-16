import { Service, PlatformAccessory, CharacteristicValue, HAPStatus, CharacteristicChange } from 'homebridge';
import { XfinityHomePlatform } from '../platform';
import Accessory from './Accessory';
import { Motion } from 'xhome';

export default class MotionAccessory extends Accessory {
  private service: Service;
  constructor(
    private readonly platform: XfinityHomePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: Motion,
  ) {
    super(platform, accessory, device);

    this.service = this.accessory.getService(this.platform.Service.MotionSensor) ||
      this.accessory.addService(this.platform.Service.MotionSensor);

    this.service.getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(this.getMotionDetected.bind(this))
      .on('change', this.notifyMotionChange.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .on('change', this.notifyActiveChange.bind(this))
      ?.onSet(this.setActive.bind(this));

    this.device.activityCallback = async () => {
      this.service.updateCharacteristic(this.platform.Characteristic.MotionDetected, await this.getMotionDetected());
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.getActive());
      this.temperatureService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, device.device.properties.temperature);
    };
  }

  async getMotionDetected(): Promise<CharacteristicValue> {
    return new Promise((resolve, reject) => {
      this.device.get().then(device => {
        this.service.updateCharacteristic(this.platform.Characteristic.StatusActive, this.getActive());
        this.temperatureService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature,
          this.device.device.properties.temperature);

        resolve(device.properties.isFaulted);
      }).catch(err => {
        this.log('error', 'Failed To Fetch Motion State With Error:\n', err.response.data);
        reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
      });
    });
  }

  async notifyMotionChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(3, `Motion ${value.newValue ? 'Detected' : 'Cleared'}`);
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