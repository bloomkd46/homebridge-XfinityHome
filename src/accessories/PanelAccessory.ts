import { CharacteristicChange, CharacteristicValue, HAPStatus, PlatformAccessory, Service } from 'homebridge';
import { XfinityHomePlatform } from '../platform';
import { Panel } from 'xhome';
import Accessory from './Accessory';


export default class PanelAccessory extends Accessory {
  private service: Service;
  private readonly armModes = ['stay', 'away', 'night', 'disarmed', 'triggered'];

  constructor(
    private readonly platform: XfinityHomePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: Panel,
  ) {
    super(platform, accessory, device);

    this.service = this.accessory.getService(this.platform.Service.SecuritySystem) ||
      this.accessory.addService(this.platform.Service.SecuritySystem);

    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .onGet(this.getTargetState.bind(this))
      .onSet(this.setTargetState.bind(this))
      .on('change', this.notifyTargetChange.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState)
      .onGet(this.getCurrentState.bind(this))
      .on('change', this.notifyCurrentStateChange.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemAlarmType)
      .onGet(() => {
        this.log('warn', 'Security Alarm Type \'Get\' triggered');
        return 0;
      });

    this.device.activityCallback = async () => {
      this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemTargetState, await this.getTargetState());
      this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState, this.getCurrentState());
    };

  }


  async getTargetState(): Promise<CharacteristicValue> {
    return new Promise((resolve, reject) => {
      this.device.get()
        .then(device => {
          this.service.updateCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState, this.getCurrentState());
          resolve(this.armModes.indexOf(device.properties.armType || 'disarmed'));
        })
        .catch(err => {
          this.log('error', 'Failed To Fetch Target State With Error:\n', err.response.data);
          reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
        });
    });
  }

  async setTargetState(state: CharacteristicValue): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.platform.config.pin) {
        if (state === this.armModes.indexOf('disarmed')) {
          this.device.disarm(this.platform.config.pin)
            .then(() => resolve()).catch(err => {
              this.log('error', 'Failed To Disarm With Error:\n', err.response.data);
              reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
            });
        } else {
          this.device.arm(this.platform.config.pin, this.armModes[state as number] as 'stay' | 'away' | 'night')
            .then(() => resolve()).catch(err => {
              this.log('error', 'Failed To Arm With Error:\n', err.response.data);
              reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
            });
        }
      } else {
        this.log('warn',
          `Failed To ${state === this.armModes.indexOf('disarmed') ? 'Disarm' : 'Arm'} With Error:\n`, 'No Pin Configured');
        reject(new this.StatusError(HAPStatus.INSUFFICIENT_AUTHORIZATION));
      }
    });
  }

  async notifyTargetChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      const mode = this.armModes[value.newValue as number].charAt(0).toUpperCase() + this.armModes[value.newValue as number].slice(1);
      this.log(1, value.newValue === this.armModes.indexOf('disarmed') ? 'Disarming...' : `Arming ${mode}...`);
    }
  }


  getCurrentState(): CharacteristicValue {
    return this.device.device.properties.status === 'arming' ?
      this.armModes.indexOf('disarmed') : this.armModes.indexOf(this.device.device.properties.armType || 'disarmed');
    /*return new Promise((resolve, reject) => {
this.device.get()
  .then(device => resolve(device.properties.status === 'arming' ?
    this.armModes.indexOf('disarmed') : this.armModes.indexOf(device.properties.armType)))

  .catch(err => {
    this.log('error', 'Failed To Fetch Current State With Error:\n', err.response.data);
    reject(new this.StatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
  });
});*/
  }

  async notifyCurrentStateChange(value: CharacteristicChange): Promise<void> {
    if (value.newValue !== value.oldValue) {
      const mode = this.armModes[value.newValue as number].charAt(0).toUpperCase() + this.armModes[value.newValue as number].slice(1);
      this.log(1, value.newValue === this.armModes.indexOf('disarmed') ? 'Disarmed' : `Armed ${mode}`);
    }
  }
}