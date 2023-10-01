import {signedInt16, readByte, readBytesAsUintLittleEndian} from "../../utils/byte_functions.js";
import { ShiftableByteArray } from '../../utils/shiftable_array.js';
import { generatorTypes } from './generators.js'
import { consoleColors } from '../../utils/other.js'
import { midiControllers } from '../../midi_parser/midi_message.js'

export const modulatorSources = {
    noController: 0,
    noteOnVelocity: 2,
    noteOnKeyNum: 3,
    polyPressure: 10,
    channelPressure: 13,
    pitchWheel: 14,
    pitchWheelRange: 16,
    channelTuning: 17,
    channelTranspose: 18,
    link: 127
}

export const modulatorCurveTypes = {
    linear: 0,
    concave: 1,
    convex: 2,
    switch: 3
}

/**
 *
 * type, polarity, direction
 * @type {Float32Array[][][]}
 */
export const precomputedTransforms = [];
for (let i = 0; i < 4; i++) {
    precomputedTransforms.push([[], []]);
}

export class Modulator{
    /**
     * Creates a modulator
     * @param dataArray {ShiftableByteArray|{srcEnum: number, secSrcEnum: number, dest:number, amt: number, transform: number}}
     */
    constructor(dataArray) {
        if(dataArray.srcEnum)
        {
            this.modulatorSource = dataArray.srcEnum;
            this.modulatorDestination = dataArray.dest;
            this.modulationSecondarySrc = dataArray.secSrcEnum;
            this.transformAmount = dataArray.amt;
            this.transformType = dataArray.transform;
        }
        else {
            this.modulatorSource = readBytesAsUintLittleEndian(dataArray, 2);
            this.modulatorDestination = readBytesAsUintLittleEndian(dataArray, 2);
            this.transformAmount = signedInt16(readByte(dataArray), readByte(dataArray));
            this.modulationSecondarySrc = readBytesAsUintLittleEndian(dataArray, 2);
            this.transformType = readBytesAsUintLittleEndian(dataArray, 2);
        }

        if(this.modulatorDestination > 58)
        {
            this.modulatorDestination = -1; // flag as invalid (for linked ones)
        }

        // decode the source
        this.sourcePolarity = this.modulatorSource >> 9 & 1;
        this.sourceDirection = this.modulatorSource >> 8 & 1;
        this.sourceUsesCC = this.modulatorSource >> 7 & 1;
        this.sourceIndex = this.modulatorSource & 127;
        this.sourceCurveType = this.modulatorSource >> 10 & 3;

        // decode the secondary source
        this.secSrcPolarity = this.modulationSecondarySrc >> 9 & 1;
        this.secSrcDirection = this.modulationSecondarySrc >> 8 & 1;
        this.secSrcUsesCC = this.modulationSecondarySrc >> 7 & 1;
        this.secSrcIndex = this.modulationSecondarySrc & 127;
        this.secSrcCurveType = this.modulationSecondarySrc >> 10 & 3;

        //this.precomputeModulatorTransform();
    }
}

function getModSourceEnum(curveType, polarity, direction, isCC, index)
{
    return (curveType << 10) | (polarity << 9) | (direction << 8) | (isCC << 7) | index;
}

export const defaultModulators = [
    // vel to attenuation
    new Modulator({
        srcEnum: getModSourceEnum(modulatorCurveTypes.concave, 0, 1, 0, modulatorSources.noteOnVelocity),
        dest: generatorTypes.initialAttenuation,
        amt: 960,
        secSrcEnum: 0x0,
        transform: 0}),
    // mod wheel to vibrato
    new Modulator({srcEnum: 0x0081, dest: generatorTypes.vibLfoToPitch, amt: 50, secSrcEnum: 0x0, transform: 0}),
    // vol to attenuation
    new Modulator({
        srcEnum: getModSourceEnum(modulatorCurveTypes.concave, 0, 1, 1, midiControllers.mainVolume),
        dest: generatorTypes.initialAttenuation,
        amt: 960,
        secSrcEnum: 0x0,
        transform: 0}),
    // pitch wheel to tuning
    new Modulator({srcEnum: 0x020E, dest: generatorTypes.fineTune, amt: 12700, secSrcEnum: 0x0010, transform: 0}),
    // pan to uhh, pan
    new Modulator({srcEnum: 0x028A, dest: generatorTypes.pan, amt: 1000, secSrcEnum: 0x0, transform: 0}),
    // expression to attenuation
    new Modulator({srcEnum: 0x058B, dest: generatorTypes.initialAttenuation, amt: 960, secSrcEnum: 0x0, transform: 0}),

    // custom modulators heck yeah
    // cc 92 (tremolo) to modLFO volume
    new Modulator({
        srcEnum: getModSourceEnum(modulatorCurveTypes.linear, 0, 0, 1, midiControllers.effects2Depth), /*linear forward unipolar cc 92 */
        dest: generatorTypes.modLfoToVolume,
        amt: 24,
        secSrcEnum: 0x0, // no controller
        transform: 0
    }),

    // cc 72 (release time) to volEnv release
    new Modulator({
        srcEnum: getModSourceEnum(modulatorCurveTypes.linear, 1, 0, 1, midiControllers.releaseTime), // linear forward bipolar cc 72
        dest: generatorTypes.releaseVolEnv,
        amt: 1200,
        secSrcEnum: 0x0, // no controller
        transform: 0
    }),

    // cc 74 (brightness) to filterFc
    new Modulator({
        srcEnum: getModSourceEnum(modulatorCurveTypes.linear, 1, 0, 1, midiControllers.brightness), // linear forwards bipolar cc 74
        dest: generatorTypes.initialFilterFc,
        amt: 5000,
        secSrcEnum: 0x0, // no controller
        transform: 0
    })
];

console.log("%cDefault Modulators:", consoleColors.recognized, defaultModulators)

/**
 * Reads the modulator chunk
 * @param modulatorChunk {RiffChunk}
 * @returns {Modulator[]}
 */
export function readModulators(modulatorChunk)
{
    let gens = [];
    while(modulatorChunk.chunkData.length > modulatorChunk.chunkData.currentIndex)
    {
        gens.push(new Modulator(modulatorChunk.chunkData));
    }
    return gens;
}