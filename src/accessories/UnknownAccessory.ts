import { PlatformAccessory } from 'homebridge';
import { Unknown } from 'xfinityhome';

import { XfinityHomePlatform } from '../platform';
import { CONTEXT } from '../settings';
import Accessory from './Accessory';


export default class UnknownAccessory extends Accessory {
  constructor(
    private readonly platform: XfinityHomePlatform,
    private readonly accessory: PlatformAccessory<CONTEXT>,
    private readonly device: Unknown,
  ) {
    super(platform, accessory, device);
    if (!this.platform.config.hideUnsupportedDeviceWarnings) {
      this.log('warn', 'Unknown accessory!');
      this.log('warn', 'Please open an issue about this.');
      this.log('warn', JSON.stringify(this.device.device, null, 2));
    }
    this.device.onchange = async (_oldState, newState) => {
      /** Normally not updated until AFTER `onchange` function execution */
      this.device.device = newState;
      this.accessory.context.logPath = this.logPath;
      this.accessory.context.device = newState;
      this.accessory.context.refreshToken = this.platform.xhome.refreshToken;
      this.platform.api.updatePlatformAccessories([this.accessory]);
    };
  }
}