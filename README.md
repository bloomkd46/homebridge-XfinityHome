<p align="center">
 <a href="https://github.com/bloomkd46/homebridge-XfinityHome"><img alt="Homebridge XfinityHome" src="https://user-images.githubusercontent.com/75853497/164517422-300169c1-fb15-4742-a1ee-f524b9d10fe6.png" width="600px"></a>
</p>
<span align="center">

# homebridge-XfinityHome

Homebridge plugin to integrate Xfinity Home Devices into HomeKit
  
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![downloads](https://img.shields.io/npm/dt/homebridge-xfinityhome)](https://npmcharts.com/compare/homebridge-xfinityhome?log=true&interval=1&minimal=true)

[![npm](https://img.shields.io/npm/v/homebridge-xfinityhome/latest?label=latest)](https://www.npmjs.com/package/homebridge-xfinityhome)
[![npm](https://img.shields.io/npm/v/homebridge-xfinityhome/beta?label=beta)](https://github.com/bloomkd46/homebridge-XfinityHome/wiki/Beta-Version)  
 
[![build workflow](https://github.com/bloomkd46/homebridge-XfinityHome/actions/workflows/build.yml/badge.svg)](https://github.com/bloomkd46/homebridge-XfinityHome/actions/workflows/build.yml)
[![license](https://badgen.net/github/license/bloomkd46/homebridge-xfinityhome)](/LICENSE)


</span>

### Plugin Information

- This plugin allows you to view and control your Xfinity Home System within HomeKit. This plugin:
  - downloads a device list
  - listens for real-time device updates
  - Supports Doors, Windows, Motion Sensors, Lights And Panel.

## Features:
  - [x] 2FA Compatible
  - [x] Easy Setup
  - [x] Real-Time Device Updates
  - [x] Device-By-Device Logs In Custom UI
  - [x] Device-By-Device Info In Custom UI
      ## Device Features:
      |  Device Type   | Features:                                                                                  |
      | :------------: | :----------------------------------------------------------------------------------------- |
      |     Panel      | Arm/Disarm Control <br> Armed/Disarmed Notifications <br> Critical Notification If Tripped |
      | Contact Sensor | Bypass Control* <br> Opened/Closed Notifications <br> Current Temperature**                |
      | Motion Sensor  | Bypass Control* <br> Motion Detected Notification <br> Current Temperature**               |
      |  Light Switch  | On/Off Control <br> Dimming Control***                                                     |

> \*Using 3rd-Party Apps Such As [Controller For HomeKit](https://controllerforhomekit.com)<br>
> \*\*Updates When Sensor Tripped<br>
> \*\*\*If Hardware Supports It<br>
> Don't See A Device? Let Me Know By Submitting A [Feature Request](https://github.com/bloomkd46/homebridge-XfinityHome/issues/new/c)
## TODO:
  - [ ] Add First-Gen Camera Support
  - [ ] Add Next-Gen Camera HomeKit Secure Video Support
  - [ ] Add Email/Password Option

### Prerequisites

- To use this plugin, you will need to already have [Homebridge](https://homebridge.io) (at least v1.3.5) or [HOOBS](https://hoobs.org) (at least v4) installed. Refer to the links for more information and installation instructions.


### Setup

- [Installation](https://github.com/bloomkd46/homebridge-XfinityHome/wiki/Installation)
- [Configuration](https://github.com/bloomkd46/homebridge-XfinityHome/wiki/Configuration)
- [Beta Version](https://github.com/bloomkd46/homebridge-XfinityHome/wiki/Beta-Version)

### Help/About

- [Common Errors](https://github.com/bloomkd46/homebridge-XfinityHome/wiki/Common-Errors)
- [Support Request](https://github.com/bloomkd46/homebridge-XfinityHome/issues/new/choose)
- [Changelog](/CHANGELOG.md)

### Disclaimer

- I am in no way affiliated with Xfinity Home and this plugin is a personal project that I maintain in my free time.
- Use this plugin entirely at your own risk - please see license for more information.
