/* eslint-disable @typescript-eslint/no-explicit-any */
import { Formats, Perms } from 'homebridge';


import type { HAP } from 'homebridge';

export function createEnergyUsageCharacteristic(hap: HAP): any {
  const Characteristic: any = hap.Characteristic;
  return class EnergyUsage extends Characteristic {
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
      this.value = this.getDefaultValue();
    }
  };
}