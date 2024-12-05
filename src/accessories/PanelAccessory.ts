import { CharacteristicChange, CharacteristicValue, HAPStatus, PlatformAccessory } from 'homebridge';
import { Panel, status } from 'xfinityhome';

import { XfinityHomePlatform } from '../platform';
import { CONTEXT } from '../settings';
import Accessory from './Accessory';


export default class PanelAccessory extends Accessory {
  private readonly armModes = ['stay', 'away', 'night', 'disarmed', 'triggered'] as const;

  constructor(
    private readonly platform: XfinityHomePlatform,
    private readonly accessory: PlatformAccessory<CONTEXT>,
    private readonly device: Panel,
  ) {
    super(platform, accessory, device, accessory.getService(platform.Service.SecuritySystem) ||
      accessory.addService(platform.Service.SecuritySystem));

    this.service.addOptionalCharacteristic(this.platform.CustomCharacteristic.PanelStatus);

    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState)
      .onGet(this.getCurrentState.bind(this, false))
      .on('change', this.notifyCurrentStateChange.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .onGet(this.getTargetState.bind(this))
      .onSet(this.setTargetState.bind(this))
      .on('change', this.notifyTargetChange.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.StatusTampered)
      .onGet(this.getTampered.bind(this))
      .on('change', this.notifyTamperedChange.bind(this));
    this.service.getCharacteristic(this.platform.CustomCharacteristic.PanelStatus)
      .onGet(this.getStatus.bind(this))
      .on('change', this.notifyStatusChange.bind(this));
    this.service.getCharacteristic(this.platform.CustomCharacteristic.PanelArmType)
      .onGet(this.getArmType.bind(this))
      .on('change', this.notifyArmTypeChange.bind(this));

    this.device.onevent = async event => {
      if (event.mediaType === 'event/securityStateChange') {
        this.device.device.properties.status = event.metadata.status;
        this.service.updateCharacteristic(this.platform.CustomCharacteristic.PanelStatus, this.getStatus());
        event.metadata.armType !== null ? this.device.device.properties.armType = event.metadata.armType : undefined;
        this.service.updateCharacteristic(this.platform.CustomCharacteristic.PanelArmType, this.getArmType());
        this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemTargetState, this.getTargetState());
        this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState, await this.getCurrentState(true));
      }
    };

    this.device.onchange = async (_oldState, newState) => {
      /** Normally not updated until AFTER `onchange` function execution */
      this.device.device = newState;
      this.service.updateCharacteristic(this.platform.Characteristic.StatusTampered, this.getTampered());
      this.service.updateCharacteristic(this.platform.CustomCharacteristic.PanelStatus, this.getStatus());
      this.service.updateCharacteristic(this.platform.CustomCharacteristic.PanelArmType, this.getArmType());
      this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemTargetState, this.getTargetState());
      this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState, await this.getCurrentState(true));


      this.accessory.context.logPath = this.logPath;
      this.accessory.context.device = newState;
      this.accessory.context.refreshToken = this.platform.xhome.refreshToken;
      this.platform.api.updatePlatformAccessories([this.accessory]);

      if (this.device.device.trouble.length && !this.getTampered()) {
        this.log('warn', 'Unknown trouble detected!');
        this.log('warn', 'Please open an issue about this.');
        this.log('warn', JSON.stringify(this.device.device.trouble, null, 2));
      }
      if (!status.includes(this.device.device.properties.status)) {
        this.log('warn', 'Unknown current state:', this.device.device.properties.status);
        this.log('warn', 'Please open an issue about this.');
      }
    };
  }


  private getTargetState(): CharacteristicValue {
    return this.armModes.indexOf(this.device.device.properties.armType || 'disarmed');
  }

  private async setTargetState(state: CharacteristicValue): Promise<void> {
    if (this.platform.config.pin) {
      if (state === this.armModes.indexOf('disarmed')) {
        this.device.device.properties.armType = '';
        try {
          await this.device.disarm(this.platform.config.pin);
        } catch (err) {
          this.log('error', 'Failed To Disarm With Error:', err);
          return Promise.reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
        }
      } else {
        this.device.device.properties.armType = this.armModes[state as number] as 'stay' | 'away' | 'night';
        if (this.device.device.properties.status !== 'ready') {
          try {
            await this.device.arm(this.platform.config.pin, this.armModes[state as number] as 'stay' | 'away' | 'night');
          } catch (err) {
            this.log('error', 'Failed To Arm With Error:', 'NOT_READY');
            this.log('debug', err as string);
            this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemTargetState, this.getTargetState());
          }
          /*this.log('warn', 'Failed To Arm With Error:', 'NOT_ALLOWED_IN_CURRENT_STATE');
          throw new this.StatusError(HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE);*/
        } else {
          try {
            await this.device.arm(this.platform.config.pin, this.armModes[state as number] as 'stay' | 'away' | 'night');
          } catch (err) {
            this.log('error', 'Failed To Arm With Error:', err);
            return Promise.reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
          }
        }
      }
    } else {
      this.log('warn',
        `Failed To ${state === this.armModes.indexOf('disarmed') ? 'Disarm' : 'Arm'} With Error:`, 'No Pin Configured');
      return Promise.reject(new this.StatusError(HAPStatus.INSUFFICIENT_AUTHORIZATION));
    }
  }

  private async notifyTargetChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      const mode = this.armModes[value.newValue as number].charAt(0).toUpperCase() + this.armModes[value.newValue as number].slice(1);
      this.log(1, value.newValue === this.armModes.indexOf('disarmed') ? 'Disarming...' : `Arming ${mode}...`);
    }
  }


  private async getCurrentState(skipUpdate?: boolean): Promise<CharacteristicValue> {
    if (skipUpdate !== true) {
      if (this.platform.config.lazyUpdates) {
        process.nextTick(() => {
          this.device.get().catch(err => {
            this.log('error', 'Failed To Fetch Current State With Error:', err);
            // throw new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
          });
        });
      } else {
        try {
          const device = await this.device.get();
          return device.properties.status === 'arming' ?
            this.armModes.indexOf('disarmed') :
            ((device.properties.status === 'entryDelay' && this.platform.config.entryTrigger !== false) ||
              device.properties.status === 'alarm') ?
              this.armModes.indexOf('triggered') : this.armModes.indexOf(device.properties.armType || 'disarmed');
        } catch (err) {
          this.log('error', 'Failed To Fetch Current State With Error:', err);
          return Promise.reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
        }
      }
    }
    return this.device.device.properties.status === 'arming' ?
      this.armModes.indexOf('disarmed') :
      ((this.device.device.properties.status === 'entryDelay' && this.platform.config.entryTrigger !== false) ||
        this.device.device.properties.status === 'alarm') ?
        this.armModes.indexOf('triggered') : this.armModes.indexOf(this.device.device.properties.armType || 'disarmed');
  }

  private async notifyCurrentStateChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      const mode = this.armModes[value.newValue as number].charAt(0).toUpperCase() + this.armModes[value.newValue as number].slice(1);
      setTimeout(() => {
        if (value.newValue === this.armModes.indexOf('triggered')) {
          this.log('warn', 'Alarm Triggered');
        } else {
          this.log(1, value.newValue === this.armModes.indexOf('disarmed') ? 'Disarmed' : `Armed ${mode}`);
        }
      }, 500);
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

  private getStatus(): CharacteristicValue {
    return this.device.device.properties.status.charAt(0).toUpperCase() +
      this.device.device.properties.status.slice(1).replace(/([A-Z])/g, ' $1').trim();
  }

  private async notifyStatusChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(4, `Status Changed To ${value.newValue}`);
    }
  }

  private getArmType(): CharacteristicValue {
    return (this.device.device.properties.armType.charAt(0).toUpperCase() +
      this.device.device.properties.armType.slice(1).replace(/([A-Z])/g, ' $1').trim()) || '(Disarmed)';
  }

  private async notifyArmTypeChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      this.log(4, `Arm Type Changed To ${value.newValue}`);
    }
  }
}