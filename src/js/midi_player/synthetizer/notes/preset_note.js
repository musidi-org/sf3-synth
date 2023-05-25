import {Preset} from "../../../soundfont2_parser/chunk/presets.js";
import {PresetNoteModifiers} from "./preset_note/preset_note_modifiers.js";
import {SampleNode} from "./preset_note/sample_node.js";

export class PresetNote
{
    /**
     * Create a note
     * @param midiNote {number}
     * @param node {AudioNode}
     * @param preset {Preset}
     * @param vibratoOptions {{depth: number, rate: number, delay: number}}
     */
    constructor(midiNote, node, preset, vibratoOptions = {delay: 0, depth: 0, rate: 0}) {
        this.midiNote = midiNote;
        this.targetNode = node;
        this.SAMPLE_CAP = 2;
        this.ctx = this.targetNode.context;
        this.preset = preset;

        if(vibratoOptions.rate > 0) {
            this.vibratoWave = new OscillatorNode(this.ctx, {
                frequency: vibratoOptions.rate
            });
            this.vibratoDepth = new GainNode(this.ctx, {
                gain: vibratoOptions.depth
            });
            this.vibratoWave.connect(this.vibratoDepth);
            this.vibratoDelay = vibratoOptions.delay;
        }

        let samples = preset.getSampleAndGenerators(midiNote);

        // cap the samples amount... it's probably my shitty code, or maybe browser can't handle that.
        if(samples.length > this.SAMPLE_CAP)
        {
            // sort by longes samples if there are 150ms or shorter samples.
            // We don't want any additional instrument effects, just the actual samples.
            if(samples.find(s => (s.sample.sampleLength / s.sample.sampleRate) < 0.15))
            {
                samples.sort((sample1, sample2) => {
                    return sample2.sample.sampleLength - sample1.sample.sampleLength;
                }
                );
            }

            let leftSample = samples.find(s => s.sample.sampleType === "leftSample");
            if(!leftSample)
            {
                // cap normally
                samples = samples.slice(0, this.SAMPLE_CAP);
            }
            else
            {
                let rightSample = samples.find(s => s.sample.sampleType === "rightSample");
                if(!rightSample)
                {
                    // cap normally
                    samples = samples.slice(0, this.SAMPLE_CAP);
                }
                else
                {
                    samples = [leftSample, rightSample];
                }
            }
        }

        this.sampleOptions = samples.map(s => new PresetNoteModifiers(s));

        this.noteVolumeController = new GainNode(this.ctx, {
            gain: 0
        });

        /**
         * @type {SampleNode[]}
         */
        this.sampleNodes = this.sampleOptions.map(sampleOptions => {
            let sample = sampleOptions.sample;
            let bufferSource = new AudioBufferSourceNode(this.ctx, {
                buffer: sample.getBuffer(this.ctx)
            });

            if(this.vibratoDepth) {
                this.vibratoDepth.connect(bufferSource.detune);
            }

            // correct playback rate
            bufferSource.playbackRate.value = sampleOptions.getPlaybackRate(midiNote);

            // set up loop
            this.applyLoopIndexes(bufferSource, sampleOptions);

            // create attenuation
            let volumeControl = new GainNode(this.ctx);
            volumeControl.connect(this.noteVolumeController);

            bufferSource.connect(volumeControl);
            return new SampleNode(bufferSource, volumeControl);
        });
        this.noteVolumeController.connect(node);
    }

    /**
     * @param bufferSource {AudioBufferSourceNode}
     * @param sampleOptions {PresetNoteModifiers}
     */
    applyLoopIndexes(bufferSource, sampleOptions)
    {
        if (sampleOptions.sample.sampleLoopStartIndex !== sampleOptions.sample.sampleLoopEndIndex &&
            (sampleOptions.loopingMode === 1 || sampleOptions.loopingMode === 3)) {

            // (lsI - sI) / (sr * 2)
            bufferSource.loopStart =
                (sampleOptions.sample.sampleLoopStartIndex - sampleOptions.sample.sampleStartIndex) / (sampleOptions.sample.sampleRate * 2);
            bufferSource.loopEnd =
                (sampleOptions.sample.sampleLoopEndIndex - sampleOptions.sample.sampleStartIndex) / (sampleOptions.sample.sampleRate * 2);
            bufferSource.loop = true;
        }
    }

    displayDebugTable()
    {
        for(let sampleOption of this.sampleOptions)
        {
            /**
             *  create a nice info table
             *  @type {Option[]}
             */

            let dataTable = []
            class Option
            {
                Name;
                RawData;
                CalculatedData;
                constructor(name, raw, calculated) {
                    this.Name = name;
                    this.RawData = raw;
                    this.CalculatedData = calculated
                }
            }
            dataTable.push(new Option("initialAttenuation", sampleOption.attenuation, sampleOption.getAttenuation()));
            dataTable.push(new Option("pan", sampleOption.pan, sampleOption.getPan()));
            dataTable.push(new Option("rootKey", sampleOption.rootKey, null));
            dataTable.push(new Option("sustainLevel", sampleOption.sustainLowerAmount, sampleOption.getSustainLevel()));
            dataTable.push(new Option("decayTime", sampleOption.decayTime, sampleOption.getDecayTime()));
            dataTable.push(new Option("loopingMode", sampleOption.loopingMode, sampleOption.getLoopingMode()));
            dataTable.push(new Option("releaseTime", sampleOption.releaseTime, sampleOption.getReleaseTime()));
            dataTable.push(new Option("ScaleTuning", sampleOption.scaleTune, sampleOption.getScaleTuneInfluence()));
            dataTable.push(new Option("holdTime", sampleOption.holdTime, sampleOption.getHoldTime()));

            let generatorsString = sampleOption.generators.map(g => `${g.generatorType}: ${g.generatorValue}`).join("\n");
            dataTable.push(new Option("SampleAndGenerators", sampleOption.sample, generatorsString));

            console.table(dataTable);
        }
    }

    /**
     * @param velocity {number}
     * @param debug {boolean}
     * @returns {number[]} exclusiveClass numbers
     */
    startNote(velocity, debug=false){
        if(debug)
        {
            this.displayDebugTable();
        }
        let gain = velocity / 127;
        // lower the gain if a lot of notes (or not...?)
        this.noteVolumeController.gain.value = gain / 2; /*/ Math.sqrt(this.sampleNodes.length + 1);*/

        // activate vibrato
        if(this.vibratoWave)
        {
            this.vibratoWave.start(this.ctx.currentTime + this.vibratoDelay);
        }

        let exclusives = [];
        for(let i = 0; i < this.sampleOptions.length; i++)
        {
            let sample = this.sampleNodes[i];
            let sampleOptions = this.sampleOptions[i];


            // TODO: fix the exclusive class to finally fix that damn percussion
            if(sampleOptions.getExclusiveclass() !== 0)
            {
                exclusives.push(sampleOptions.getExclusiveclass());
            }

            // sample.attenuation.gain.value = sampleOptions.getAttenuation() / this.sampleNodes.length;

            sample.startSample({
                initialAttenuation: sampleOptions.getAttenuation(),
                holdTime: sampleOptions.getHoldTime(),
                decayTime: sampleOptions.getDecayTime(),
                sustainLevel: sampleOptions.getSustainLevel()
            });
        }
        return exclusives;
    }


    /**
     * @returns {Promise<boolean>}
     */
    async stopNote(){
        let maxFadeout = 0;
        // looping mode 3 and fadeout time
        for(let i = 0; i < this.sampleOptions.length; i++)
        {
            let sampleOptions = this.sampleOptions[i];
            let sampleNode = this.sampleNodes[i];
            if(sampleOptions.getLoopingMode() === 3)
            {
                sampleNode.source.loop = false;
            }
            let fadeout = sampleOptions.getReleaseTime();
            sampleNode.stopSample(fadeout);

            if(fadeout > maxFadeout) maxFadeout = fadeout;
        }
        // so .then() can be added to delete the note after it finished
        await new Promise(r => setTimeout(r, maxFadeout * 1000));
        return true;
    }

    disconnectNote(){
        if(!this.noteVolumeController)
        {
            return;
        }
        for(let sample of this.sampleNodes) {
            if(!sample.source || !sample.volumeController /*|| !sample.pan*/)
            {
                continue;
            }
            sample.disconnectSample();
            /*sample.pan.disconnect(sample.attenuation);*/
            delete sample.source;
            delete sample.volumeController;
            /*delete sample.pan;*/
            sample = undefined;
        }

        // apply vibrato if needed
        if(this.vibratoDepth) {
            this.vibratoDepth.disconnect();
            this.vibratoWave.stop();
            this.vibratoWave.disconnect();
            delete this.vibratoWave;
            delete this.vibratoDepth;
        }

        this.sampleNodes = [];
        this.noteVolumeController.disconnect();
        delete this.noteVolumeController;
    }

    /**
     * @param pitchBend {number}
     */
    bendNote(pitchBend){
        // calculate normal playback rate
        const bendRatio = pitchBend / 8192 / 2;
        for(let i = 0; i < this.sampleOptions.length; i++)
        {
            let sampleOptions = this.sampleOptions[i];
            let sampleNode = this.sampleNodes[i];

            const newPlayback = sampleOptions.getPlaybackRate(this.midiNote) * Math.pow(2, bendRatio);
            sampleNode.setPlaybackRate(newPlayback);
            //sampleNode.source.playbackRate.setTargetAtTime(newPlayback, this.drawingContext.currentTime, 0.1);
        }
    }

    /**
     * Stops the note in 0.2s
     * @returns {Promise<boolean>}
     */
    async killNote()
    {
        for (let node of this.sampleNodes)
        {
            node.stopSample(0.2);
        }
        await new Promise(r => setTimeout(r, 200));
        return true;
    }
}