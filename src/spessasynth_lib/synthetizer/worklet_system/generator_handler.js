import { generatorTypes } from '../../soundfont/chunk/generators.js'

const EMU_ATTENUATION_CORRECTION = 0.4;

export class WorkletGeneratorHandler
{
    /**
     * Creates a new generator reader for the worklet processor to use
     * @param sampleAndGenerators {{
     *  instrumentGenerators: Generator[],
     *  presetGenerators: Generator[],
     *  sample: Sample
     * }}}
     */
    constructor(sampleAndGenerators)
    {
        this.instrumentGenerators = sampleAndGenerators.instrumentGenerators;
        this.presetGenerators = sampleAndGenerators.presetGenerators;
        this.sample = sampleAndGenerators.sample;
    }

    /**
     * @param midiNote {number}
     * @param velocity {number}
     * @param tuningRatio {number}
     * @returns {WorkletVoice}
     */
    getWorkletVoiceData(midiNote, velocity, tuningRatio)
    {
        const velocityGain = velocity / 127;
        const attenuationdB = this.sumGeneratorValue(generatorTypes.initialAttenuation, 0, 0, 1440) / 10 * EMU_ATTENUATION_CORRECTION;
        const attenuation = this.decibelsToGain(-1 * attenuationdB);

        const sustaindB = this.sumGeneratorValue(generatorTypes.sustainVolEnv, 0, 0, 1440) / 10;
        const sustain = this.decibelsToGain(-1 * (sustaindB + attenuationdB));

        // cap release time to 5s
        let release = this.timecentsToSeconds(this.getLimitedGeneratorValue(generatorTypes.releaseVolEnv, -12000, -7200, 8000));
        if(release > 5)
        {
            release = 5;
        }

        /**
         * @type {WorkletVolumeEnvelope}
         */
        const envelope = {
            delaySecs: this.timecentsToSeconds(this.getLimitedGeneratorValue(generatorTypes.delayVolEnv, -12000, -12000, 5000)),
            attackSecs: this.timecentsToSeconds(this.getLimitedGeneratorValue(generatorTypes.attackVolEnv, -12000, -12000, 8000)),
            attenuationGain: attenuation * velocityGain,
            holdSecs: this.timecentsToSeconds(this.getLimitedGeneratorValue(generatorTypes.holdVolEnv, -12000, -12000, 5000)),
            decaySecs: this.timecentsToSeconds(this.getLimitedGeneratorValue(generatorTypes.decayVolEnv, -12000, -12000, 8000)),
            sustainAbsoluteGain: sustain * velocityGain,
            releaseSecs: release,
            currentGain: 0
        };

        /**
         * @type {WorkletSample}
         */
        const sample= {
            sampleData: this.sample.getAudioData(
                this.getGeneratorValue(Math.round(this.sample.indexRatio * generatorTypes.startAddrsOffset), 0) + (32768 * this.getGeneratorValue(generatorTypes.startAddrsCoarseOffset, 0)),
                this.getGeneratorValue(Math.round(this.sample.indexRatio * generatorTypes.endAddrOffset), 0) + (32768 * this.getGeneratorValue(generatorTypes.endAddrsCoarseOffset, 0))
            ),
            sampleRate: this.sample.sampleRate,
            loopStart: this.sample.sampleLoopStartIndex / 2
                + this.getGeneratorValue(Math.round(this.sample.indexRatio * generatorTypes.startloopAddrsOffset), 0) + (32768 * this.getGeneratorValue(generatorTypes.startloopAddrsCoarseOffset, 0)),

            loopEnd: this.sample.sampleLoopEndIndex / 2
                + this.getGeneratorValue(Math.round(this.sample.indexRatio * generatorTypes.endloopAddrsOffset), 0) + (32768 * this.getGeneratorValue(generatorTypes.endloopAddrsCoarseOffset, 0)),
            playbackStep: 0,
            loopMode: this.getGeneratorValue(generatorTypes.sampleModes, 0)
        };

        // coarseTune
        const semitoneTune = this.sumGeneratorValue(generatorTypes.coarseTune, 0, -120, 120);

        // fineTune
        const centTune = this.sumGeneratorValue(generatorTypes.fineTune, 0, -99, 99);

        const semitones = semitoneTune + (centTune / 100); // calculate both to semitones
        const tune = Math.pow(2, semitones / 12);

        let notePlayback = this.sample.getPlaybackRate(midiNote, this.getGeneratorValue(generatorTypes.overridingRootKey, this.sample.samplePitch)) * tune;

        let scaleTune = this.sumGeneratorValue(generatorTypes.scaleTuning, 100, 0, 1200);
        if(scaleTune < 0)
        {
            scaleTune = 1;
        }
        scaleTune /= 100;

        // correct with scaleTuning
        const playbackRate =  1 + (notePlayback - 1) * scaleTune;

        const pan = this.sumGeneratorValue(generatorTypes.pan, 0, -500, 500) / 500; // -1 to 1

        return {
            sample: sample,
            envelope: envelope,
            panGainLeft:  Math.min(1, 1 - pan),
            panGainRight: Math.min(1, pan + 1),
            playbackRate: playbackRate,
            tuningRatio: tuningRatio,
            finished: false,
            midiNote: midiNote
        };
    }

    /**
     * @param generatorType {number}
     * @param defaultValue {number}
     * @returns {number}
     */
    getGeneratorValue(generatorType, defaultValue)
    {
        let val = defaultValue;
        let searchedVal = this.instrumentGenerators.find(g => g.generatorType === generatorType)
        if(searchedVal)
        {
            return searchedVal.generatorValue;
        }
        return val;
    }

    /**
     * @param generatorType {number}
     * @param defaultValue {number} - will default to this if no generator is found or out of range
     * @param minAllowed {number}
     * @param maxAllowed {number}
     * @returns {number}
     */
    getLimitedGeneratorValue(generatorType, defaultValue, minAllowed, maxAllowed)
    {
        let val = defaultValue;
        let searchedVal = this.instrumentGenerators.find(g => g.generatorType === generatorType)
        if(searchedVal)
        {
            return this.limitValue(searchedVal.generatorValue, minAllowed, maxAllowed);
        }
        return val;
    }

    /**
     * Gets generator from the preset level (defaults to 0)
     * @param generatorType {number}
     * @returns {number}
     */
    _getPresetGenerator(generatorType)
    {
        let val = 0;
        let searchedVal = this.presetGenerators.find(g => g.generatorType === generatorType)
        if(searchedVal)
        {
            return searchedVal.generatorValue;
        }
        return val;
    }

    /**
     * @param generatorType {number}
     * @param defaultValue {number} - will default to this if no generator is found or out of range
     * @param minAllowed {number}
     * @param maxAllowed {number}
     * @returns {number}
     */
    sumGeneratorValue(generatorType, defaultValue, minAllowed, maxAllowed)
    {
        const preset = this._getPresetGenerator(generatorType);
        let gen = this.instrumentGenerators.find(g => g.generatorType === generatorType);
        if(gen)
        {
            const val = gen.generatorValue + preset;
            return this.limitValue(val, minAllowed, maxAllowed)
        }

        return this.limitValue(defaultValue + preset, minAllowed, maxAllowed);
    }

    /**
     * @param val {number}
     * @param minAllowed {number}
     * @param maxAllowed {number}
     * @return {number}
     */
    limitValue(val, minAllowed, maxAllowed)
    {
        if(val < minAllowed)
        {
            return minAllowed;
        }
        else if(val > maxAllowed) {
            return maxAllowed;
        }
        return val
    }

    /**
     * @param timecents {number} timecents
     * @returns {number} seconds
     */
    timecentsToSeconds(timecents)
    {
        return Math.pow(2, timecents / 1200);
    }

    decibelsToGain(decibels)
    {
        return Math.pow(10, decibels / 20);
    }
}