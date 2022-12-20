import { CharacteristicChange, CharacteristicValue, HAPStatus, PlatformAccessory, Service } from 'homebridge';
import { Light } from 'xfinityhome';

import { EnergyUsage } from '../characteristics/EnergyData';
import { XfinityHomePlatform } from '../platform';
import { CONTEXT } from '../settings';
import Accessory from './Accessory';


export default class LightAccessory extends Accessory {
  private service: Service;
  constructor(
    private readonly platform: XfinityHomePlatform,
    private readonly accessory: PlatformAccessory<CONTEXT>,
    private readonly device: Light,
  ) {
    super(platform, accessory, device);

    this.service = this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb);
    this.service.addOptionalCharacteristic(EnergyUsage);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.device.device.name);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getIsOn.bind(this, false))
      .onSet(this.set.bind(this))
      .on('change', this.notifyIsOnChange.bind(this));

    if (this.device.device.properties.dimAllowed) {
      this.service.getCharacteristic(this.platform.Characteristic.Brightness)
        .onGet(this.getBrightness.bind(this))
        .onSet(this.set.bind(this))
        .on('change', this.notifyBrightnessChange.bind(this));
    }
    if (this.device.device.properties.energyMgmtEnabled) {
      this.service.getCharacteristic(EnergyUsage)
        .onGet((): number => device.device.properties.energyUsage / 10)
        .on('change', async (value: CharacteristicChange): Promise<void> => {
          if (value.newValue !== value.oldValue) {
            this.log(4, `Updating Energy Usage To ${value.newValue} Amps`);
          }
        });
    }

    this.device.onevent = event => {
      if (event.mediaType === 'event/lighting') {
        this.service.updateCharacteristic(this.platform.Characteristic.On, JSON.parse(event.metadata.isOn));
        this.device.device.properties.dimAllowed ?
          this.service.updateCharacteristic(this.platform.Characteristic.Brightness, JSON.parse(event.metadata.level)) : undefined;
        this.device.device.properties.energyMgmtEnabled ?
          this.service.updateCharacteristic(EnergyUsage, JSON.parse(event.metadata.energyUsage) / 10) : undefined;
      }
    };

    this.device.onchange = async (_oldState, newState) => {
      /** Normally not updated until AFTER `onchange` function execution */
      this.device.device = newState;
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.getIsOn(true));
      this.device.device.properties.level ?
        this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.getBrightness()) : undefined;

      this.accessory.context.logPath = this.logPath;
      this.accessory.context.device = device;
      this.accessory.context.refreshToken = this.platform.xhome.refreshToken;
      this.platform.api.updatePlatformAccessories([this.accessory]);

      if (this.device.device.trouble.length) {
        this.log('warn', 'Unknown trouble detected!');
        this.log('warn', 'Please open an issue about this.');
        this.log('warn', JSON.stringify(this.device.device.trouble, null, 2));
      }
    };
  }

  private getIsOn(skipUpdate?: boolean): CharacteristicValue {
    if (skipUpdate !== true) {
      this.device.get().catch(err => {
        this.log('error', 'Failed To Fetch isOn State With Error:', err);
        throw new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      });
    }
    return this.device.device.properties.isOn;
  }

  private async notifyIsOnChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(2, value.newValue ? 'Enabled' : 'Disabled');
    }
  }

  private async set(value: CharacteristicValue): Promise<void> {
    await this.device.set(value as number | boolean).catch(err => {
      this.log('error', `Failed To Set ${typeof value === 'number' ? 'Brightness' : 'IsOn'} With Error:`, err);
      throw new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  }

  private getBrightness(): CharacteristicValue {
    if (this.device.device.properties.level === undefined) {
      throw new this.StatusError(HAPStatus.RESOURCE_DOES_NOT_EXIST);
    }
    return this.device.device.properties.level;
  }

  private async notifyBrightnessChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(2, 'Set To ' + value.newValue);
    }
  }
}