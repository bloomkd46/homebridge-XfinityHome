import { PlatformAccessory, Service } from 'homebridge';
import { XfinityHomePlatform } from '../platform';
import { PanelDevice } from 'xhome';


export default class PanelAccesory {
  private service: Service;
  private name = this.device.name || 'Panel';

  constructor(
    private readonly platform: XfinityHomePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: PanelDevice,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, device.manufacturer)
      .setCharacteristic(this.platform.Characteristic.Model, device.model)
      .setCharacteristic(this.platform.Characteristic.Name, this.name)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.serialNumber)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, device.firmwareVersion)
      .getCharacteristic(this.platform.Characteristic.Identify).on('set', () => {
        this.platform.log.info('Identifying Device:\n', device);
      });

    this.service = this.accessory.getService(this.platform.Service.SecuritySystem) ||
      this.accessory.addService(this.platform.Service.SecuritySystem);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.name);

    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .onGet(this.getTargetState.bind(this));
  }

  async getTargetState(): Promise<0 | 1 | 2 | 3> {
    return this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM;
  }
}