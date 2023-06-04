import {Synthetizer} from "../midi_player/synthetizer/synthetizer.js";

export class MidiKeyboard
{
    /**
     * Creates a new midi keyboard(keyboard)
     * @param channelColors {Array<string>}
     * @param synth {Synthetizer}
     */
    constructor(channelColors, synth) {
        this.mouseHeld = false;
        this.heldKeys = [];

        /**
         * @type {HTMLTableRowElement}
         */
        this.keyboard = document.getElementById("keyboard");

        document.onmousedown = () => this.mouseHeld = true;
        document.onmouseup = () => {
            this.mouseHeld = false;
            for(let key of this.heldKeys)
            {
                // user note off
                this.releaseNote(key);
                this.synth.NoteOff(this.channel, key);
            }
        }

        // hold pedal on
        document.addEventListener("keydown", e =>{
            if(e.key === "Shift")
            {
                this.synth.controllerChange(this.channel, "Sustain Pedal", 127);
                document.getElementById("keyboard_text").innerText = "Hold pedal on";
            }
        });

        // hold pedal off
        document.addEventListener("keyup", e => {
            if(e.key === "Shift")
            {
                this.synth.controllerChange(this.channel, "Sustain Pedal", 0);
                document.getElementById("keyboard_text").innerText = "";
            }
        });

        this.synth = synth;
        this.channel = 0;

        this.channelColors = channelColors;

        // create keyboard
        function isBlackNoteNumber(noteNumber) {
                let pitchClass = noteNumber % 12;
                return pitchClass === 1 || pitchClass === 3 || pitchClass === 6 || pitchClass === 8 || pitchClass === 10;
        }
        for (let midiNote = 0; midiNote < 128; midiNote++) {
            let noteElement = (document.createElement("td"));
            noteElement.classList.add("key");
            noteElement.id = `note${midiNote}`;
            noteElement.onmouseover = () => {
                if(!this.mouseHeld)
                {
                    return
                }

                // user note on
                this.heldKeys.push(midiNote);
                this.pressNote(midiNote, this.channel, 127, 1, 1);
                this.synth.NoteOn(this.channel, midiNote, 127, true);
            }

            noteElement.onmousedown = () =>
            {
                // user note on
                this.heldKeys.push(midiNote);
                this.pressNote(midiNote, this.channel, 127, 1, 1);
                this.synth.NoteOn(this.channel, midiNote, 127, true);
            }

            noteElement.onmouseout = () => {
                // user note off
                this.heldKeys.splice(this.heldKeys.indexOf(midiNote), 1);
                this.releaseNote(midiNote);
                this.synth.NoteOff(this.channel, midiNote);
            };
            noteElement.onmouseleave = noteElement.onmouseup;
            let isBlack = isBlackNoteNumber(midiNote);
            if(isBlack)
            {
                // short note
                noteElement.classList.add("sharp_key");
            }
            else
            {
                // long note
                noteElement.classList.add("flat_key");
                noteElement.style.backgroundColor = "white";
                noteElement.style.zIndex = "1";
                let blackNoteLeft = false;
                let blackNoteRight = false;
                if(midiNote >= 0)
                {
                    blackNoteLeft = isBlackNoteNumber(midiNote - 1);
                }
                if(midiNote < 127) {
                    blackNoteRight = isBlackNoteNumber(midiNote + 1);
                }

                if(blackNoteRight && blackNoteLeft)
                {
                    noteElement.classList.add("between_sharps");
                }
                else if(blackNoteLeft)
                {
                    noteElement.classList.add("left_sharp");
                }
                else if(blackNoteRight)
                {
                    noteElement.classList.add("right_sharp");
                }


            }
            noteElement.setAttribute("colors", `["${noteElement.style.backgroundColor}"]`);
            this.keyboard.appendChild(noteElement);
        }

        const selectorMenu = document.getElementById("keyboard_selector");

        // preset selector
        const presetSelector = document.createElement("select");

        // load the preset names
        let pNames = this.synth.soundFont.presets.map(p => p.presetName);
        pNames.sort();
        for(let pName of pNames)
        {
            let option = document.createElement("option");
            option.value = pName;
            option.innerText = pName;
            presetSelector.appendChild(option);
        }

        presetSelector.
        addEventListener("change", () => {
            // find the preset's bank and program number
            const presetName = presetSelector.value;
            const preset = this.synth.soundFont.getPresetByName(presetName);
            const bank = preset.bank;
            const program = preset.program;

            // change bank
            this.synth.controllerChange(this.channel, "Bank Select", bank);
            this.synth.programChange(this.channel, program);
            console.log("Changing user preset to:", presetName);
        });
        selectorMenu.appendChild(presetSelector);

        // channel selector
        const channelSelector = document.createElement("select");

        let channelNumber = 0;
        /**
         * @type {HTMLOptionElement[]}
         */
        const options = [];
        for(const channel of this.synth.midiChannels)
        {
            const option = document.createElement("option");

            option.value = channelNumber.toString();
            option.innerText = `Channel ${channelNumber + 1}: ${channel.preset.presetName}`;

            option.style.backgroundColor = channelColors[channelNumber];
            option.style.color = "rgb(0, 0, 0)";

            channelSelector.appendChild(option);
            channelNumber++;
            options.push(option);
        }
        channelSelector.onchange = () => {
            presetSelector.value = this.synth.midiChannels[channelSelector.value].preset.presetName;
            this.selectChannel(parseInt(channelSelector.value));
        }

        selectorMenu.appendChild(channelSelector);

        // update on program change
        this.synth.onProgramChange = (ch, p) => {
            options[ch].text = `Channel ${ch + 1}: ${p}`;
        }
    }

    /**
     * Selects the channel from synth
     * @param channel {number} 0-15
     */
    selectChannel(channel)
    {
        this.channel = channel;
    }

    /**
     * presses a midi note visually
     * @param midiNote {number} 0-127
     * @param channel {number} 0-15     * @param volume {number} 0-1
     * @param expression {number} 0-1
     * @param volume {number} 0-1
     * @param velocity {number} 0-127
     */
    pressNote(midiNote, channel, velocity, volume, expression)
    {
        /**
         * @type {HTMLTableCellElement}
         */
        let key = this.keyboard.childNodes[midiNote];
        key.classList.add("pressed");

        let isSharp = key.classList.contains("sharp_key");
        let brightness = expression * volume * (velocity / 127);
        let rgbaValues = this.channelColors[channel].match(/\d+(\.\d+)?/g).map(parseFloat);

        // multiply the rgb values by brightness
        if (!isSharp) {
            // multiply the rgb values
            let newRGBValues = rgbaValues.slice(0, 3).map(value => 255 - (255 - value) * brightness);

            // create the new color
            key.style.backgroundColor = `rgba(${newRGBValues.join(", ")}, ${rgbaValues[3]})`;
        }
        else
        {
            // multiply the rgb values
            let newRGBValues = rgbaValues.slice(0, 3).map(value => value * brightness);

            // create the new color
            key.style.backgroundColor = `rgba(${newRGBValues.join(", ")}, ${rgbaValues[3]})`;
        }
        /**
         * @type {string[]}
         */
        let pressedColors = JSON.parse(key.getAttribute("colors"));
        pressedColors.push(this.channelColors[channel]);
        key.setAttribute("colors", JSON.stringify(pressedColors));
    }

    releaseNote(midiNote)
    {
        /**
         * @type {HTMLTableCellElement}
         */
        let key = this.keyboard.childNodes[midiNote];
        /**
         * @type {string[]}
         */
        let pressedColors = JSON.parse(key.getAttribute("colors"));
        if(pressedColors.length > 1) {
            pressedColors.pop();
        }
        if(pressedColors.length === 1)
        {
            key.classList.remove("pressed");
        }
        key.setAttribute("colors", JSON.stringify(pressedColors));
        key.style.backgroundColor = pressedColors[pressedColors.length - 1];
    }
}