import { CharacteristicChange, CharacteristicValue, HAPStatus, PlatformAccessory } from 'homebridge';
import { Light } from 'xfinityhome';

import { XfinityHomePlatform } from '../platform';
import { CONTEXT } from '../settings';
import Accessory from './Accessory';


export default class LightAccessory extends Accessory {
  constructor(
    private readonly platform: XfinityHomePlatform,
    private readonly accessory: PlatformAccessory<CONTEXT>,
    private readonly device: Light,
  ) {
    super(platform, accessory, device, accessory.getService(platform.Service.Lightbulb) ||
      accessory.addService(platform.Service.Lightbulb));

    this.service.addOptionalCharacteristic(this.platform.CustomCharacteristic.EnergyUsage);

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
      this.service.getCharacteristic(this.platform.CustomCharacteristic.EnergyUsage)
        .onGet(this.getEnergyUsage.bind(this))
        .on('change', this.notifyEnergyUsageChange.bind(this));
    }

    this.device.onevent = async event => {
      if (event.mediaType === 'event/lighting') {
        this.device.device.properties.isOn = JSON.parse(event.metadata.isOn);
        this.service.updateCharacteristic(this.platform.Characteristic.On, await this.getIsOn(true));
        if (this.device.device.properties.dimAllowed) {
          this.device.device.properties.level = JSON.parse(event.metadata.level);
          this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.getBrightness());
        }
        if (this.device.device.properties.energyMgmtEnabled) {
          this.device.device.properties.energyUsage = JSON.parse(event.metadata.energyUsage);
          this.service.updateCharacteristic(this.platform.CustomCharacteristic.EnergyUsage, this.getEnergyUsage());
        }
      }
    };

    this.device.onchange = async (_oldState, newState) => {
      /** Normally not updated until AFTER `onchange` function execution */
      this.device.device = newState;
      this.service.updateCharacteristic(this.platform.Characteristic.On, await this.getIsOn(true));
      this.device.device.properties.dimAllowed ?
        this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.getBrightness()) : undefined;
      this.device.device.properties.energyMgmtEnabled ?
        this.service.updateCharacteristic(this.platform.CustomCharacteristic.EnergyUsage, this.getEnergyUsage()) : undefined;

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

  private async getIsOn(skipUpdate?: boolean): Promise<CharacteristicValue> {
    if (skipUpdate !== true) {
      if (this.platform.config.lazyUpdates) {
        process.nextTick(() => {
          this.device.get().catch(err => {
            this.log('error', 'Failed To Fetch isOn State With Error:', err);
            //throw new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
          });
        });
      } else {
        try {
          const device = await this.device.get();
          return device.properties.isOn;
        } catch (err) {
          this.log('error', 'Failed To Fetch isOn State With Error:', err);
          return Promise.reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
        }
      }
    }
    return this.device.device.properties.isOn;
  }

  private async notifyIsOnChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(2, value.newValue ? 'Enabled' : 'Disabled');
    }
  }

  private async set(value: CharacteristicValue): Promise<void> {
    typeof value === 'boolean' ? this.device.device.properties.isOn = value : undefined;
    try {
      await this.device.set(value as number | boolean);
    } catch (err) {
      this.log('error', `Failed To Set ${typeof value === 'number' ? 'Brightness' : 'IsOn'} With Error:`, err);
      return Promise.reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
    }
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

  private getEnergyUsage(): CharacteristicValue {
    if (this.device.device.properties.energyUsage === undefined) {
      throw new this.StatusError(HAPStatus.RESOURCE_DOES_NOT_EXIST);
    }
    return this.device.device.properties.energyUsage / 10;
  }

  private async notifyEnergyUsageChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(4, `Updating Energy Usage To ${value.newValue} Amps`);
    }
  }
}