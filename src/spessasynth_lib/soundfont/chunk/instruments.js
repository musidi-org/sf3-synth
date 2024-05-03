import { RiffChunk } from './riff_chunk.js'
import { InstrumentZone } from './zones.js'
import { readBytesAsString, readBytesAsUintLittleEndian } from '../../utils/byte_functions.js'

export class Instrument {
  /**
   * Creates an instrument
   * @param instrumentChunk {RiffChunk}
   */
  constructor(instrumentChunk) {
    this.instrumentName = readBytesAsString(instrumentChunk.chunkData, 20).trim()
    this.instrumentZoneIndex = readBytesAsUintLittleEndian(instrumentChunk.chunkData, 2)
    this.instrumentZonesAmount = 0
    /**
     * @type {InstrumentZone[]}
     */
    this.instrumentZones = []
  }

  /**
   * Loads all the instrument zones, given the amount
   * @param amount {number}
   * @param zones {InstrumentZone[]}
   */
  getInstrumentZones(amount, zones) {
    this.instrumentZonesAmount = amount
    for (
      let i = this.instrumentZoneIndex;
      i < this.instrumentZonesAmount + this.instrumentZoneIndex;
      i++
    ) {
      this.instrumentZones.push(zones[i])
    }
  }
}

/**
 * Reads the instruments
 * @param instrumentChunk {RiffChunk}
 * @param instrumentZones {InstrumentZone[]}
 * @returns {Instrument[]}
 */
export function readInstruments(instrumentChunk, instrumentZones) {
  let instruments = []
  while (instrumentChunk.chunkData.length > instrumentChunk.chunkData.currentIndex) {
    let instrument = new Instrument(instrumentChunk)
    if (instruments.length > 0) {
      let instrumentsAmount =
        instrument.instrumentZoneIndex - instruments[instruments.length - 1].instrumentZoneIndex
      instruments[instruments.length - 1].getInstrumentZones(instrumentsAmount, instrumentZones)
    }
    instruments.push(instrument)
  }
  return instruments
}
