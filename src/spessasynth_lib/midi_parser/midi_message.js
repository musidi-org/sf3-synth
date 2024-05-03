import { ShiftableByteArray } from '../utils/shiftable_array.js'

export class MidiMessage {
  /**
   * @param ticks {number}
   * @param byte {number} the message status byte
   * @param data {ShiftableByteArray}
   */
  constructor(ticks, byte, data) {
    // absolute ticks from the start
    this.ticks = ticks
    // message status byte (for meta it's the second byte)
    this.messageStatusByte = byte
    this.messageData = data
  }
}

/**
 * Gets the status byte's channel
 * @param statusByte
 * @returns {number} channel is -1 for system messages -2 for meta and -3 for sysex
 */
export function getChannel(statusByte) {
  const eventType = statusByte & 0xf0
  const channel = statusByte & 0x0f

  let resultChannel = channel

  switch (eventType) {
    // midi (and meta and sysex headers)
    case 0x80:
    case 0x90:
    case 0xa0:
    case 0xb0:
    case 0xc0:
    case 0xd0:
    case 0xe0:
      break

    case 0xf0:
      switch (channel) {
        case 0x0:
          resultChannel = -3
          break

        case 0x1:
        case 0x2:
        case 0x3:
        case 0x4:
        case 0x5:
        case 0x6:
        case 0x7:
        case 0x8:
        case 0x9:
        case 0xa:
        case 0xb:
        case 0xc:
        case 0xd:
        case 0xe:
          resultChannel = -1
          break

        case 0xf:
          resultChannel = -2
          break
      }
      break

    default:
      resultChannel = -1
  }

  return resultChannel
}

// all the midi statuses dictionary
export const messageTypes = {
  noteOff: 0x80,
  noteOn: 0x90,
  noteAftertouch: 0xa0,
  controllerChange: 0xb0,
  programChange: 0xc0,
  channelAftertouch: 0xd0,
  pitchBend: 0xe0,
  systemExclusive: 0xf0,
  timecode: 0xf1,
  songPosition: 0xf2,
  songSelect: 0xf3,
  tuneRequest: 0xf6,
  clock: 0xf8,
  start: 0xfa,
  continue: 0xfb,
  stop: 0xfc,
  activeSensing: 0xfe,
  reset: 0xff,
  sequenceNumber: 0x00,
  text: 0x01,
  copyright: 0x02,
  trackName: 0x03,
  instrumentName: 0x04,
  lyric: 0x05,
  marker: 0x06,
  cuePoint: 0x07,
  midiChannelPrefix: 0x20,
  midiPort: 0x21,
  endOfTrack: 0x2f,
  setTempo: 0x51,
  smpteOffset: 0x54,
  timeSignature: 0x58,
  keySignature: 0x59,
  sequenceSpecific: 0x7f
}

/**
 * Gets the event's status and channel from the status byte
 * @param statusByte {number} the status byte
 * @returns {{channel: number, status: number}} channel will be -1 for sysex and meta
 */
export function getEvent(statusByte) {
  const status = statusByte & 0xf0
  const channel = statusByte & 0x0f

  let eventChannel = -1
  let eventStatus = statusByte

  if (status >= 0x80 && status <= 0xe0) {
    eventChannel = channel
    eventStatus = status
  }

  return {
    status: eventStatus,
    channel: eventChannel
  }
}

/**
 * @type {{timbreHarmonicContent: number, omniModeOn: number, polyModeOn: number, localControlOnOff: number, NRPNLsb: number, allNotesOff: number, footController: number, effects2Depth: number, lsbForControl7MainVolume: number, expressionController: number, monoModeOn: number, balance: number, effectControl1: number, effectControl2: number, modulationWheel: number, lsbForControl1ModulationWheel: number, allSoundOff: number, pan: number, effects1Depth: number, effects3Depth: number, attackTime: number, dataEntryMsb: number, portamentoControl: number, sostenutoPedal: number, lsbForControl5PortamentoTime: number, RPNLsb: number, bankSelect: number, portamentoTime: number, mainVolume: number, hold2Pedal: number, releaseTime: number, dataDecrement: number, NRPNMsb: number, legatoFootswitch: number, sustainPedal: number, portamentoOnOff: number, lsbForControl0BankSelect: number, lsbForControl13EffectControl2: number, effects5Depth: number, generalPurposeController2: number, lsbForControl6DataEntry: number, resetAllControllers: number, generalPurposeController3: number, generalPurposeController4: number, generalPurposeController5: number, softPedal: number, generalPurposeController6: number, lsbForControl4FootController: number, lsbForControl12EffectControl1: number, generalPurposeController7: number, generalPurposeController8: number, effects4Depth: number, lsbForControl8Balance: number, soundController9: number, soundVariation: number, soundController8: number, soundController7: number, soundController6: number, soundController10: number, dataIncrement: number, generalPurposeController1: number, lsbForControl2BreathController: number, lsbForControl11ExpressionController: number, brightness: number, lsbForControl10Pan: number, RPNMsb: number, breathController: number, omniModeOff: number}}
 */
export const midiControllers = {
  bankSelect: 0,
  modulationWheel: 1,
  breathController: 2,
  footController: 4,
  portamentoTime: 5,
  dataEntryMsb: 6,
  mainVolume: 7,
  balance: 8,
  pan: 10,
  expressionController: 11,
  effectControl1: 12,
  effectControl2: 13,
  generalPurposeController1: 16,
  generalPurposeController2: 17,
  generalPurposeController3: 18,
  generalPurposeController4: 19,
  lsbForControl0BankSelect: 32,
  lsbForControl1ModulationWheel: 33,
  lsbForControl2BreathController: 34,
  lsbForControl4FootController: 36,
  lsbForControl5PortamentoTime: 37,
  lsbForControl6DataEntry: 38,
  lsbForControl7MainVolume: 39,
  lsbForControl8Balance: 40,
  lsbForControl10Pan: 42,
  lsbForControl11ExpressionController: 43,
  lsbForControl12EffectControl1: 44,
  lsbForControl13EffectControl2: 45,
  sustainPedal: 64,
  portamentoOnOff: 65,
  sostenutoPedal: 66,
  softPedal: 67,
  legatoFootswitch: 68,
  hold2Pedal: 69,
  soundVariation: 70,
  timbreHarmonicContent: 71,
  releaseTime: 72,
  attackTime: 73,
  brightness: 74,
  soundController6: 75,
  soundController7: 76,
  soundController8: 77,
  soundController9: 78,
  soundController10: 79,
  generalPurposeController5: 80,
  generalPurposeController6: 81,
  generalPurposeController7: 82,
  generalPurposeController8: 83,
  portamentoControl: 84,
  effects1Depth: 91,
  effects2Depth: 92,
  effects3Depth: 93,
  effects4Depth: 94,
  effects5Depth: 95,
  dataIncrement: 96,
  dataDecrement: 97,
  NRPNLsb: 98,
  NRPNMsb: 99,
  RPNLsb: 100,
  RPNMsb: 101,
  allSoundOff: 120,
  resetAllControllers: 121,
  localControlOnOff: 122,
  allNotesOff: 123,
  omniModeOff: 124,
  omniModeOn: 125,
  monoModeOn: 126,
  polyModeOn: 127
}

/**
 * @type {{"11": number, "12": number, "13": number, "14": number, "8": number, "9": number, "10": number}}
 */
export const dataBytesAmount = {
  0x8: 2, // note off
  0x9: 2, // note on
  0xa: 2, // note at
  0xb: 2, // cc change
  0xc: 1, // pg change
  0xd: 1, // channel aftertouch
  0xe: 2 // pitch wheel
}
