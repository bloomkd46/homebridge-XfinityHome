import { CharacteristicChange, CharacteristicValue, HAPStatus, Perms, PlatformAccessory, Service } from 'homebridge';
import { Motion } from 'xfinityhome';

import { XfinityHomePlatform } from '../platform';
import { CONTEXT } from '../settings';
import Accessory from './Accessory';


export default class MotionAccessory extends Accessory {
  private service: Service;
  constructor(
    private readonly platform: XfinityHomePlatform,
    private readonly accessory: PlatformAccessory<CONTEXT>,
    private readonly device: Motion,
  ) {
    super(platform, accessory, device);

    this.service = this.accessory.getService(this.platform.Service.MotionSensor) ||
      this.accessory.addService(this.platform.Service.MotionSensor);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.device.device.name);

    this.service.getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(this.getMotionDetected.bind(this))
      .on('change', this.notifyMotionChange.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.StatusActive)
      .setProps({
        perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY],
      })
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this))
      .on('change', this.notifyActiveChange.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.StatusTampered)
      .onGet(this.getTampered.bind(this))
      .on('change', this.notifyTamperedChange.bind(this));

    this.device.onchange = async (_oldState, newState) => {
      /** Normally not updated until AFTER `onchange` function execution */
      this.device.device = newState;
      this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, this.getMotionDetected(true));
      this.service.updateCharacteristic(this.platform.Characteristic.StatusActive, this.getActive());
      this.service.updateCharacteristic(this.platform.Characteristic.StatusTampered, this.getTampered());
      this.temperatureService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, newState.properties.temperature / 100);

      this.accessory.context.logPath = this.logPath;
      this.accessory.context.device = newState;
      this.accessory.context.refreshToken = this.platform.xhome.refreshToken;
      this.platform.api.updatePlatformAccessories([this.accessory]);

      if (this.device.device.trouble.length && !this.getTampered()) {
        this.log('warn', 'Trouble detected!');
        this.log('warn', 'Please open an issue about this.');
        this.log('warn', JSON.stringify(this.device.device.trouble, null, 2));
      }
    };
  }

  private getMotionDetected(skipUpdate?: boolean): CharacteristicValue {
    if (skipUpdate !== true) {
      this.device.get().catch(err => {
        this.log('error', 'Failed To Fetch Motion State With Error:', err);
        throw new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      });
    }
    return this.device.device.properties.isFaulted;
  }

  private async notifyMotionChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(3, `Motion ${value.newValue ? 'Detected' : 'Cleared'}`);
    }
  }

  private getActive(): CharacteristicValue {
    return !this.device.device.properties.isBypassed;
  }

  private async setActive(value: CharacteristicValue): Promise<void> {
    await this.device.bypass(!value).catch(err => {
      this.log('error', `Failed To ${!value ? 'Bypass' : 'Activate'} With Error:`, err);
      throw new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  }

  private async notifyActiveChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(2, value.newValue ? 'Activated' : 'Bypassed');
    }
  }

  private getTampered(): CharacteristicValue {
    return this.device.device.trouble.find(trouble => trouble.name === 'senTamp') ? 1 : 0;
  }

  private async notifyTamperedChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      if (value.newValue) {
        this.log('warn', 'Tampered');
      } else {
        this.log(2, 'Fixed');
      }
    }
  }
}