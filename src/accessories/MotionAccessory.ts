import { CharacteristicChange, CharacteristicValue, HAPStatus, Perms, PlatformAccessory, Service } from 'homebridge';
import { Motion } from 'xfinityhome';

import { XfinityHomePlatform } from '../platform';
import { CONTEXT } from '../settings';
import Accessory from './Accessory';


export default class MotionAccessory extends Accessory {
  private service: Service;
  protected temperatureService?: Service;

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

    if ('temperature' in this.device.device.properties && (this.platform.config.temperatureSensors ?? true)) {
      this.temperatureService = this.accessory.getService(platform.Service.TemperatureSensor);
      if (!this.temperatureService) {
        this.log('info', 'Adding Temperature Support');
        this.temperatureService = this.accessory.addService(platform.Service.TemperatureSensor);
        this.service.addLinkedService(this.temperatureService);
      }

      this.temperatureService.setCharacteristic(platform.Characteristic.Name, device.device.name + ' Temperature');

      this.temperatureService.getCharacteristic(platform.Characteristic.CurrentTemperature)
        .setProps({
          minStep: 0.01,
        })
        .onGet(this.getTemperature.bind(this))
        .on('change', this.notifyTemperatureChange.bind(this));
    } else if (!(this.platform.config.temperatureSensors ?? true) && this.accessory.getService(this.platform.Service.TemperatureSensor)) {
      this.log('warn', 'Removing Temperature Support');
      this.accessory.removeService(this.accessory.getService(this.platform.Service.TemperatureSensor)!);
    }

    this.device.onevent = event => {
      if ('sensorTemperature' in event.metadata) {
        this.device.device.properties.temperature = JSON.parse(event.metadata.sensorTemperature);
        this.temperatureService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.getTemperature());
      }
      if (event.mediaType === 'event/zoneUpdated') {
        this.device.device.properties.isBypassed = event.metadata.isBypassed === 'true';
        this.service.updateCharacteristic(this.platform.Characteristic.StatusActive, this.getActive());
      }
      if (event.name === 'isFaulted') {
        this.device.device.properties.isFaulted = event.value === 'true';
        this.service.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.getMotionDetected(true));
      }
      if (event.name === 'trouble') {
        if (event.value === 'senTamp' || event.value === 'senTampRes') {
          this.service.updateCharacteristic(this.platform.Characteristic.StatusTampered, 1);
        }
      }
    };
    this.device.onchange = async (_oldState, newState) => {
      /** Normally not updated until AFTER `onchange` function execution */
      this.device.device = newState;
      this.service.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.getMotionDetected(true));
      this.service.updateCharacteristic(this.platform.Characteristic.StatusActive, this.getActive());
      this.service.updateCharacteristic(this.platform.Characteristic.StatusTampered, this.getTampered());
      this.temperatureService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.getTemperature());

      this.accessory.context.logPath = this.logPath;
      this.accessory.context.device = newState;
      this.accessory.context.refreshToken = this.platform.xhome.refreshToken;
      this.platform.api.updatePlatformAccessories([this.accessory]);

      if (this.device.device.trouble.length && !this.getTampered()) {
        this.log('warn', 'Unknown trouble detected!');
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
    this.device.device.properties.isBypassed = !value;
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

  private getTemperature(): CharacteristicValue {
    return this.device.device.properties.temperature / 100;
  }

  private async notifyTemperatureChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(4, `Updating Temperature To ${value.newValue}°C`);
    }
  }
}