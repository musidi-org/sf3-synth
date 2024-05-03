import { VoiceGroup } from './voice_group.js'
import { Preset } from '../../soundfont/chunk/presets.js'
import { consoleColors } from '../../utils/other.js'
import { midiControllers } from '../../midi_parser/midi_message.js'

const CHANNEL_LOUDNESS = 0.3

const dataEntryStates = {
  Idle: 0,
  RPCoarse: 1,
  RPFine: 2,
  NRPCoarse: 3,
  NRPFine: 4,
  DataCoarse: 5,
  DataFine: 6
}

export class MidiChannel {
  /**
   * creates a midi channel
   * @param targetNode {AudioNode}
   * @param targetReverbNode {AudioNode}
   * @param targetChorusNode {AudioNode}
   * @param defaultPreset {Preset}
   * @param channelNumber {number}
   * @param percussionChannel {boolean}
   */
  constructor(
    targetNode,
    targetReverbNode,
    targetChorusNode,
    defaultPreset,
    channelNumber = -1,
    percussionChannel = false
  ) {
    this.ctx = targetNode.context
    this.outputNode = targetNode
    this.channelNumber = channelNumber
    this.percussionChannel = percussionChannel
    this.defaultGain = CHANNEL_LOUDNESS

    this.preset = defaultPreset
    this.bank = this.preset.bank

    /**
     * The recevied notes (always deleted on nofe off(
     * @type {Set<number>}
     */
    this.receivedNotes = new Set()
    /**
     * holds the actual amount of currently plaing notes (removed only when actual samples stop playing)
     * @type {Set<number>}
     */
    this.notes = new Set()

    /**
     * @type {number[]}
     */
    this.heldNotes = []

    this.panner = new StereoPannerNode(this.ctx)

    this.gainController = new GainNode(this.ctx, {
      gain: CHANNEL_LOUDNESS
    })

    this.reverb = new GainNode(this.ctx, {
      gain: 0
    })
    this.reverb.connect(targetReverbNode)

    // note -> panner -> chorus -> gain -> reverb + passthrough)     -> out

    //const dummy = new GainNode(this.ctx, {gain: 1});
    this.chorus = new GainNode(this.ctx, {
      gain: 0
    })
    this.chorus.connect(targetChorusNode)
    //this.reverb.input.connect(dummy);
    //this.reverb.connectOutput(this.gainController);

    this.panner.connect(this.gainController)
    this.gainController.connect(this.outputNode)
    this.gainController.connect(this.reverb)
    this.gainController.connect(this.chorus)

    this.resetControllers()

    /**
     * Current playing notes
     * @type {VoiceGroup[]}
     */
    this.playingNotes = []
    /**
     * Notes that are stopping and are about to get deleted
     * @type {VoiceGroup[]}
     */
    this.stoppingNotes = []

    /**
     * In semitones, does not get affected by resetControllers()
     * @type {number}
     */
    this.channelTranspose = 0

    /**
     * Controls if the channel will be affected by progam change
     * @type {boolean}
     */
    this.lockPreset = false
    this.lockVibrato = false
  }

  /**
   * Kills the channel, disconnecting everything
   */
  killChannel() {
    this.gainController.disconnect()
    this.stopAll(true)
    this.muteChannel()
    this.playingNotes = []
    this.stoppingNotes = []
  }

  /**
   * @param number {number}
   * @param value
   */
  controllerChange(number, value) {
    switch (number) {
      case midiControllers.pan:
        this.setPan((value - 64) / 64)
        break

      case midiControllers.modulationWheel:
        this.setModulation(value)
        break

      case midiControllers.mainVolume:
        this.setVolume(value)
        break

      case midiControllers.lsbForControl7MainVolume:
        let nevVol = ((this.channelVolume & 0x7f) << 7) | value
        this.setVolume(nevVol / 128)
        break

      case midiControllers.sustainPedal:
        if (value < 64) {
          this.releaseHoldPedal()
        } else {
          this.pressHoldPedal()
        }
        break

      case midiControllers.expressionController:
        this.setExpression(value / 127)
        break

      case midiControllers.lsbForControl11ExpressionController:
        const expression = ((this.channelExpression & 0x7f) << 7) | value
        this.setExpression(expression / 16384)
        break

      case midiControllers.effects3Depth:
        this.setChorus(value)
        break

      case midiControllers.effects1Depth:
        this.setReverb(value)
        break

      case midiControllers.NRPNMsb:
        this.setNRPCoarse(value)
        break

      case midiControllers.NRPNLsb:
        this.setNRPFine(value)
        break

      case midiControllers.RPNMsb:
        this.setRPCoarse(value)
        break

      case midiControllers.RPNLsb:
        this.setRPFine(value)
        break

      case midiControllers.dataEntryMsb:
        this.dataEntryCoarse(value)
        break

      case midiControllers.resetAllControllers:
        this.resetControllers()
        break

      default:
        console.log(
          `%cUnrecognized controller: %c${Object.keys(midiControllers).find((v) => midiControllers[v] === number)}%c set to: %c${value}%c on channel: %c${this.channelNumber}`,
          consoleColors.warn,
          consoleColors.unrecognized,
          consoleColors.warn,
          consoleColors.value,
          consoleColors.warn,
          consoleColors.recognized
        )
        break
    }
  }

  pressHoldPedal() {
    this.holdPedal = true
  }

  releaseHoldPedal() {
    this.holdPedal = false
    for (let note of this.heldNotes) {
      this.stopNote(note)
      this.notes.delete(note)
    }
    this.heldNotes = []
  }

  /**
   * Changes preset
   * @param preset {Preset}
   */
  setPreset(preset) {
    if (this.lockPreset) {
      return
    }
    this.preset = preset
    if (this.preset.bank === 128) {
      this.channelTranspose = 0
    }
  }

  /**
   * Dummy function, only for compatibility reasons
   */
  requestNoteRemoval() {
    // pass
  }

  /**
   * Changes audio pan
   * @param pan {number}
   */
  setPan(pan) {
    this.panner.pan.setTargetAtTime(pan, this.outputNode.context.currentTime, 0.001)
  }

  setExpression(val) {
    //val = Math.min(1, val);
    this.channelExpression = val
    this.updateGain()
  }

  /**
   * @param midiNote {number} 0-127
   * @param velocity {number} 0-127
   * @param debugInfo {boolean} for debugging set to true
   * @returns {number} the amount of voices the note adds
   */
  playNote(midiNote, velocity, debugInfo = false) {
    if (velocity === 0) {
      // stop if velocity 0
      this.stopNote(midiNote)
      return 0
    }

    if (this.defaultGain === 0) {
      return 0
    }

    this.notes.add(midiNote)
    this.receivedNotes.add(midiNote)
    let note = new VoiceGroup(
      midiNote,
      velocity,
      this.panner,
      this.preset,
      this.vibrato,
      this.channelTuningRatio,
      this.modulation
    )

    let exclusives = note.startNote(debugInfo)
    const bendRatio = (this.pitchBend / 8192) * this.channelPitchBendRange
    note.bendNote(bendRatio + this.channelTranspose)

    for (const exclusive of exclusives) {
      if (exclusive === 0) {
        continue
      }

      // playing notes
      this.playingNotes.forEach((n) => {
        if (n.exclusives.has(exclusive)) {
          n.disconnectNote()
          this.playingNotes.splice(this.playingNotes.indexOf(n), 1)
        }
      })

      // stopping notes
      this.stoppingNotes.forEach((n) => {
        if (n.exclusives.has(exclusive)) {
          n.disconnectNote()
          this.stoppingNotes.splice(this.stoppingNotes.indexOf(n), 1)
        }
      })
    }

    this.playingNotes.push(note)
    return note.sampleNodes.length
  }

  setPitchBend(bendMSB, bendLSB) {
    // bend all the notes
    this.pitchBend = (bendLSB | (bendMSB << 7)) - 8192
    const semitones = (this.pitchBend / 8192) * this.channelPitchBendRange
    for (let note of this.playingNotes) {
      note.bendNote(semitones + this.channelTranspose)
    }
  }

  /**
   * @param value {number} 0-127
   */
  setModulation(value) {
    this.modulation = value
    const cents = (value / 128) * 50 // sf default modulator
    // change vibrato depth
    this.playingNotes.forEach((n) => {
      n.sampleNodes.forEach((s) => {
        s.setVibratoDepth(cents)
      })
    })
  }

  get voicesAmount() {
    return (
      this.playingNotes.reduce((amt, voice) => amt + voice.sampleNodes.length, 0) +
      this.stoppingNotes.reduce((amt, voice) => amt + voice.sampleNodes.length, 0)
    )
  }

  /**
   * @param chorus {number} 0-127
   */
  setChorus(chorus) {
    this.chorus.gain.value = chorus / 127
  }

  setReverb(reverbLevel) {
    this.reverb.gain.value = reverbLevel / 127
  }

  setVolume(volume) {
    volume = Math.min(127, volume)
    this.channelVolume = volume / 127
    this.updateGain()
  }

  setRPCoarse(value) {
    this.RPValue = value
    this.dataEntryState = dataEntryStates.RPCoarse
  }

  setRPFine(value) {
    this.RPValue = (this.RPValue << 7) | value
    this.dataEntryState = dataEntryStates.RPFine
  }

  setNRPCoarse(value) {
    this.NRPCoarse = value
    this.dataEntryState = dataEntryStates.NRPCoarse
  }

  setNRPFine(value) {
    this.NRPFine = value
    this.dataEntryState = dataEntryStates.NRPFine
  }

  /**
   * Executes a data entry for an NRP for a sc88pro NRP (because touhou yes) and RPN tuning
   * @param dataValue {number} dataEntryCoarse MSB
   */
  dataEntryCoarse(dataValue) {
    let addDefaultVibrato = () => {
      if (this.vibrato.delay === 0 && this.vibrato.rate === 0 && this.vibrato.depth === 0) {
        this.vibrato.depth = 50
        this.vibrato.rate = 8
        this.vibrato.delay = 0.6
      }
    }

    switch (this.dataEntryState) {
      default:
      case dataEntryStates.Idle:
        break

      //https://cdn.roland.com/assets/media/pdf/SC-88PRO_OM.pdf
      case dataEntryStates.NRPFine:
        switch (this.NRPCoarse) {
          default:
            break

          case 1:
            if (this.lockVibrato) {
              return
            }
            switch (this.NRPFine) {
              default:
                break

              // vibrato rate
              case 8:
                if (dataValue === 64) {
                  return
                }
                addDefaultVibrato()
                this.vibrato.rate = (dataValue / 64) * 8
                console.log(
                  `%cVibrato rate for channel %c${this.channelNumber}%c is now set to %c${this.vibrato.rate}%cHz.`,
                  consoleColors.info,
                  consoleColors.recognized,
                  consoleColors.info,
                  consoleColors.value,
                  consoleColors.info
                )
                break

              // vibrato depth
              case 9:
                if (dataValue === 64) {
                  return
                }
                addDefaultVibrato()
                this.vibrato.depth = dataValue / 2
                console.log(
                  `%cVibrato depth for %c${this.channelNumber}%c is now set to %c${this.vibrato.depth} %ccents range of detune.`,
                  consoleColors.info,
                  consoleColors.recognized,
                  consoleColors.info,
                  consoleColors.value,
                  consoleColors.info
                )
                break

              // vibrato delay
              case 10:
                if (dataValue === 64) {
                  return
                }
                addDefaultVibrato()
                this.vibrato.delay = dataValue / 64 / 3
                console.log(
                  `%cVibrato delay for %c${this.channelNumber}%c is now set to %c${this.vibrato.delay} %cseconds.`,
                  consoleColors.info,
                  consoleColors.recognized,
                  consoleColors.info,
                  consoleColors.value,
                  consoleColors.info
                )
                break
            }
            break
        }
        break

      case dataEntryStates.RPCoarse:
      case dataEntryStates.RPFine:
        switch (this.RPValue) {
          default:
            break

          // pitch bend range
          case 0x0000:
            this.channelPitchBendRange = dataValue
            console.log(`Channel ${this.channelNumber} bend range. Semitones:`, dataValue)
            break

          // coarse tuning
          case 0x0002:
            // semitones
            this.channelTuningRatio = Math.pow(2, (dataValue - 64) / 12)
            console.log(`Channel ${this.channelNumber} coarse tuning. Semitones:`, dataValue - 64)
            break

          case 0x3fff:
            this.resetParameters()
            break
        }
    }
  }
  updateGain() {
    this.gainController.gain.value =
      this.defaultGain *
      this.channelVolume *
      this.channelVolume *
      this.channelExpression *
      this.channelExpression
    //* (1 - this.chorus.getChorusLevel() / 381); // lower the volume to min 2/3 to compensate for delay line (it doubles the volume)
  }

  muteChannel() {
    this.defaultGain = 0
    this.updateGain()
  }

  unmuteChannel() {
    this.defaultGain = CHANNEL_LOUDNESS
    this.updateGain()
  }

  /**
   * Stops the note
   * @param midiNote {number} 0-127
   * @param highPerf {boolean} if set to true, the note will be silenced in 50ms
   */
  stopNote(midiNote, highPerf = false) {
    this.receivedNotes.delete(midiNote)
    // TODO: fix holdPedal
    if (this.holdPedal) {
      this.heldNotes.push(midiNote)
      return
    }

    let note = this.playingNotes.findLast((n) => n.midiNote === midiNote)
    if (!note) {
      return
    }

    // add note as a fading one
    this.stoppingNotes.push(note)

    // and remove it from the main array
    this.playingNotes.splice(this.playingNotes.indexOf(note), 1)

    if (highPerf) {
      note.killNote().then(() => {
        this.notes.delete(midiNote)
        note.disconnectNote()
        delete this.stoppingNotes.splice(this.stoppingNotes.indexOf(note), 1)
      })
    } else {
      note.stopNote().then(() => {
        this.notes.delete(midiNote)
        note.disconnectNote()
        delete this.stoppingNotes.splice(this.stoppingNotes.indexOf(note), 1)
      })
    }
  }

  stopAll(force = false) {
    if (force) {
      this.holdPedal = false
    }
    for (let midiNote = 0; midiNote < 128; midiNote++) {
      this.stopNote(midiNote)
    }
    this.playingNotes.forEach((n) => {
      this.stopNote(n.midiNote)
    })
    if (force) {
      this.stoppingNotes.forEach((n) => {
        n.disconnectNote()
      })
      this.stoppingNotes = []
    }
  }

  resetControllers() {
    /**
     * @type {number}
     */
    this.channelVolume = 100 / 127 // per midi spec
    /**
     * @type {number}
     */
    this.channelExpression = 1
    this.channelTuningRatio = 1
    this.channelPitchBendRange = 2
    this.chorus.gain.value = 0
    this.holdPedal = false
    this.updateGain()
    this.panner.pan.value = 0
    this.pitchBend = 0
    this.modulation = 0

    this.vibrato = { depth: 0, rate: 0, delay: 0 }
    this.resetParameters()
  }

  transposeChannel(semitones) {
    if (this.percussionChannel) {
      return
    }
    this.channelTranspose = semitones
    const semi = (this.pitchBend / 8192) * this.channelPitchBendRange
    for (let note of this.playingNotes) {
      note.bendNote(semi + this.channelTranspose)
    }
  }

  resetParameters() {
    /**
     * @type {number}
     */
    this.NRPCoarse = 0
    /**
     * @type {number}
     */
    this.NRPFine = 0
    /**
     * @type {number}
     */
    this.RPValue = 0
    /**
     * @type {string}
     */
    this.dataEntryState = dataEntryStates.Idle
  }
}
