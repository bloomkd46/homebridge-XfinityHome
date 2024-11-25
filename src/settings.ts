import { Device } from 'xfinityhome';


/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'XfinityHomePlatform';

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = 'homebridge-xfinityhome';

export type CONTEXT = {
  device: Device['device'];
  logPath?: string;
  refreshToken?: string;
};

export type CONFIG = {
  name: string;
  refreshToken: string;
  pin: string;
  temperatureSensors: boolean;
  lazyUpdates: boolean;
  logLevel: 0 | 1 | 2 | 3 | 4;
  logWatchdogErrors?: boolean;
  hideUnsupportedDeviceWarnings?: boolean;
  platform: 'XfinityHomePlatform';
};