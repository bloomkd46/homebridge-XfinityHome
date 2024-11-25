import { CharacteristicChange, CharacteristicValue, HAPStatus, Perms, PlatformAccessory } from 'homebridge';
import { LegacyDryContact } from 'xfinityhome';

import { XfinityHomePlatform } from '../platform';
import { CONTEXT } from '../settings';
import Accessory from './Accessory';


export default class LegacyDryContactAccessory extends Accessory {
  constructor(
    private readonly platform: XfinityHomePlatform,
    private readonly accessory: PlatformAccessory<CONTEXT>,
    private readonly device: LegacyDryContact,
  ) {
    super(platform, accessory, device, accessory.getService(platform.Service.ContactSensor) ||
      accessory.addService(platform.Service.ContactSensor));

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.device.device.name);

    this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(this.getContactDetected.bind(this, false))
      .on('change', this.notifyContactChange.bind(this));

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
    this.service.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onGet(this.getLowBattery.bind(this))
      .on('change', this.notifyLowBatteryChange.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.StatusFault)
      .onGet(this.getFaulted.bind(this))
      .on('change', this.notifyFaultedChange.bind(this));

    this.device.onevent = async event => {
      if (event.name === 'trouble') {
        if (event.value === 'senTamp') {
          this.service.updateCharacteristic(this.platform.Characteristic.StatusTampered, 1);
        } else if (event.value === 'senTampRes') {
          this.service.updateCharacteristic(this.platform.Characteristic.StatusTampered, 0);
        }
        if (event.value === 'senPreLowBat' || event.value === 'senLowBat') {
          this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, 1);
          if (event.value === 'senLowBat') {
            this.service.updateCharacteristic(this.platform.Characteristic.StatusFault, 1);
          } else {
            this.service.updateCharacteristic(this.platform.Characteristic.StatusFault, 0);
          }
        }
      }
      if (event.name === 'isFaulted') {
        this.device.device.properties.isFaulted = event.value === 'true';
        this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, await this.getContactDetected(true));
      }
      if (event.mediaType === 'event/zoneUpdated') {
        this.device.device.properties.isBypassed = event.metadata!.isBypassed === 'true';
        this.service.updateCharacteristic(this.platform.Characteristic.StatusActive, this.getActive());
      }
    };
    this.device.onchange = async (_oldState, newState) => {
      /** Normally not updated until AFTER `onchange` function execution */
      this.device.device = newState;
      this.service.updateCharacteristic(this.platform.Characteristic.StatusTampered, this.getTampered());
      this.service.updateCharacteristic(this.platform.Characteristic.StatusFault, this.getFaulted());
      this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.getLowBattery());
      this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, await this.getContactDetected(true));
      this.service.updateCharacteristic(this.platform.Characteristic.StatusActive, this.getActive());

      this.accessory.context.logPath = this.logPath;
      this.accessory.context.device = newState;
      this.accessory.context.refreshToken = this.platform.xhome.refreshToken;
      this.platform.api.updatePlatformAccessories([this.accessory]);

      if (this.device.device.trouble.length && (!this.getTampered() && !this.getLowBattery())) {
        this.log('warn', 'Unknown trouble detected!');
        this.log('warn', 'Please open an issue about this.');
        this.log('warn', JSON.stringify(this.device.device.trouble, null, 2));
      }
    };
  }

  private async getContactDetected(skipUpdate?: boolean): Promise<CharacteristicValue> {
    if (skipUpdate !== true) {
      if (this.platform.config.lazyUpdates) {
        process.nextTick(() => {
          this.device.get().catch(err => {
            this.log('error', 'Failed To Fetch Contact State With Error:', err);
            //throw new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
          });
        });
      } else {
        try {
          const device = await this.device.get();
          return device.properties.isFaulted ? 1 : 0;
        } catch (err) {
          this.log('error', 'Failed To Fetch Contact State With Error:', err);
          return Promise.reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
        }
      }

    }
    return this.device.device.properties.isFaulted ? 1 : 0;
  }

  private async notifyContactChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(3, value.newValue === 0 ? 'Closed' : 'Opened');
    }
  }

  private getActive(): CharacteristicValue {
    return !this.device.device.properties.isBypassed;
  }

  private async setActive(value: CharacteristicValue): Promise<void> {
    this.device.device.properties.isBypassed = !value;
    try {
      await this.device.bypass(!value);
    } catch (err) {
      this.log('error', `Failed To ${!value ? 'Bypass' : 'Activate'} With Error:`, err);
      return Promise.reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
    }
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

  private getFaulted(): CharacteristicValue {
    return this.device.device.trouble.find(trouble => trouble.name === 'senLowBat') ? 1 : 0;
  }

  private async notifyFaultedChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      if (value.newValue) {
        this.log('warn', 'Faulted (Battery Level Is Very Low)');
      } else {
        this.log(2, 'Fault Restored');
      }
    }
  }

  private getLowBattery(): CharacteristicValue {
    return this.device.device.trouble.find(trouble => trouble.name === 'senPreLowBat' || trouble.name === 'senLowBat') ? 1 : 0;
  }

  private async notifyLowBatteryChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      if (value.newValue) {
        this.device.device.trouble.forEach(trouble => {
          if (trouble.name === 'senPreLowBat') {
            this.log(1, 'Low Battery');
          }
          if (trouble.name === 'senLowBat') {
            this.log('warn', 'Critically Low Battery');
          }
        });
        this.log('warn', this.device.device.trouble[0].name === 'senPreLowBat' ? 'Low' : 'Critically Low', 'Battery');
      } else {
        this.log(2, 'Fixed');
      }
    }
  }
}