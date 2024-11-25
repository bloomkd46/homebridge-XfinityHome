import { CharacteristicChange, CharacteristicValue, Perms, PlatformAccessory } from 'homebridge';
import { LegacyMotion } from 'xfinityhome';

import { XfinityHomePlatform } from '../platform';
import { CONTEXT } from '../settings';
import Accessory from './Accessory';


export default class LegacyMotionAccessory extends Accessory {
  constructor(
    private readonly platform: XfinityHomePlatform,
    private readonly accessory: PlatformAccessory<CONTEXT>,
    private readonly device: LegacyMotion,
  ) {
    super(platform, accessory, device, accessory.getService(platform.Service.MotionSensor) ||
      accessory.addService(platform.Service.MotionSensor));

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
    this.service.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onGet(this.getLowBattery.bind(this))
      .on('change', this.notifyLowBatteryChange.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.StatusFault)
      .onGet(this.getFaulted.bind(this))
      .on('change', this.notifyFaultedChange.bind(this));

    this.device.onevent = event => {
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
        this.service.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.getMotionDetected(true));
      } if (event.mediaType === 'event/zoneUpdated') {
        this.device.device.properties.isBypassed = event.metadata.isBypassed === 'true';
        this.service.updateCharacteristic(this.platform.Characteristic.StatusActive, this.getActive());
      }
    };
    this.device.onchange = async (_oldState, newState) => {
      /** Normally not updated until AFTER `onchange` function execution */
      this.device.device = newState;
      this.service.updateCharacteristic(this.platform.Characteristic.StatusTampered, this.getTampered());
      this.service.updateCharacteristic(this.platform.Characteristic.StatusFault, this.getFaulted());
      this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.getLowBattery());
      this.service.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.getMotionDetected(true));
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

  private getMotionDetected(skipUpdate?: boolean): CharacteristicValue {
    if (skipUpdate !== true) {
      this.device.get().catch(err => {
        this.log('error', 'Failed To Fetch Motion State With Error:', err);
        // throw new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
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
      //throw new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
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