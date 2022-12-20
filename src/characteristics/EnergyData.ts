import { Formats, Perms } from 'homebridge';


export = (homebridge) => {
  const Charact = homebridge.hap.Characteristic;
  return class EnergyUsage extends Charact {
    static readonly UUID: string = '000000A4-0000-1000-8000-0026BB765298';

    constructor() {
      super('Energy Usage', EnergyUsage.UUID, {
        format: Formats.FLOAT,
        maxValue: 15,
        minValue: 0,
        minStep: 0.1,
        unit: 'Amps',
        perms: [Perms.PAIRED_READ, Perms.NOTIFY],
      });
      //this.value = this.getDefaultValue();
    }
  };
};