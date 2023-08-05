"use strict"

import {Manager} from "./manager.js";
import {MIDI} from "../midi_parser/midi_loader.js";

import {SoundFont2} from "../soundfont/soundfont_parser.js";
import {ShiftableByteArray} from "../utils/shiftable_array.js";

const TITLE = "SpessaSynth: SoundFont2 Javascript Synthetizer";

/**
 * @type {HTMLHeadingElement}
 */
let titleMessage = document.getElementById("title");
/**
 * @type {HTMLDivElement}
 */
let progressBar = document.getElementById("progress_bar");
/**
 * @type {HTMLInputElement}
 */
let fileInput = document.getElementById("midi_file_input");
// remove the old files
fileInput.value = "";
fileInput.focus();

/**
 * @type {{name: string, sf: SoundFont2}[]}
 */
window.loadedSoundfonts = [];


/**
 * @param midiFile {File}
 */
async function parseMidi(midiFile)
{
    const buffer = await midiFile.arrayBuffer();
    const arr = new ShiftableByteArray(buffer);
    return new MIDI(arr);
}

/**
 * @param fileName {"soundfont.sf2"|"gm.sf2"|"Touhou.sf2"|"FluidR3_GM.sf2"|"alex_gm.sf2"|"zunpet.sf2"|"pc98.sf2"|"zunfont.sf2"}
 * @param callback {function(number)}
 * @returns {Promise<ShiftableByteArray>}
 */
async function fetchFont(fileName, callback)
{
    let response = await fetch(`http://${location.host}/${fileName}`);
    if(!response.ok)
    {
        titleMessage.innerText = "Error downloading soundfont!";
        throw response;
    }
    let size = response.headers.get("content-length");
    let reader = await (await response.body).getReader();
    let done = false;
    let dataArray = new ShiftableByteArray(parseInt(size));
    let offset = 0;
    do{
        let readData = await reader.read();
        if(readData.value) {
            dataArray.set(readData.value, offset);
            offset += readData.value.length;
        }
        done = readData.done;
        let percent = Math.round((offset / size) * 100);
        callback(percent);
    }while(!done);
    return dataArray;
}

/**
 * @param midiFile {File}
 */
function startMidi(midiFile)
{
    titleMessage.innerText = `Parsing ${midiFile.name}`;
    document.getElementById("file_upload").innerText = midiFile.name;
    parseMidi(midiFile).then(parsedMidi => {
        if(parsedMidi.midiName.trim().length > 0)
        {
            titleMessage.style.fontStyle = "italic";
            titleMessage.innerText = parsedMidi.midiName;
        }
        else
        {
            titleMessage.innerText = TITLE;
        }

        manager.play(parsedMidi, true);
    });
}

/**
 * Fetches and replaces the current manager's font
 * @param fontName {string}
 */
function replaceFont(fontName)
{
    function replaceSf()
    {
        titleMessage.innerText = TITLE;

        // prompt the user to click if needed
        if(!window.audioContextMain)
        {
            titleMessage.innerText = "Press anywhere to start the app";
            return;
        }

        if(!window.manager) {
            // prepare the manager
            window.manager = new Manager(audioContextMain, soundFontParser);
        }
        else
        {
            window.manager.synth.soundFont = window.soundFontParser;
            window.manager.synth.reloadSoundFont();

            if(window.manager.seq)
            {
                // resets controllers
                window.manager.seq.currentTime -= 0.1;
            }
        }
    }

    console.log(window.loadedSoundfonts)
    if(window.loadedSoundfonts.find(sf => sf.name === fontName))
    {
        window.soundFontParser = window.loadedSoundfonts.find(sf => sf.name === fontName).sf;
        replaceSf();
        return;
    }
    titleMessage.innerText = "Downloading soundfont...";
    fetchFont(fontName, percent => progressBar.style.width = `${(percent / 100) * titleMessage.offsetWidth}px`)
        .then(data => {
            titleMessage.innerText = "Parsing soundfont...";
            setTimeout(() => {
                window.soundFontParser = new SoundFont2(data);
                progressBar.style.width = "0";

                if(window.soundFontParser.presets.length < 1)
                {
                    titleMessage.innerText = "No presets in the soundfont! Check your file?"
                    return;
                }
                window.loadedSoundfonts.push({name: fontName, sf: window.soundFontParser})
                replaceSf();
            });
        });
}

document.body.onclick = () =>
{
    // user has clicked, we can create the ui
    if(!window.audioContextMain) {
        window.audioContextMain = new AudioContext({sampleRate: 44100});
        if(window.soundFontParser) {
            titleMessage.innerText = TITLE;
            // prepare midi interface
            window.manager = new Manager(audioContextMain, soundFontParser);
        }
    }
    document.body.onclick = null;
}

/**
 * @type {{name: string, size: number}[]}
 */
let soundFonts = [];

// load the list of soundfonts
fetch("soundfonts").then(async r => {
    if(!r.ok)
    {
        titleMessage.innerText = "Error fetching soundfonts!";
        throw r.statusText;
    }
    const sfSelector = document.getElementById("sf_selector");

    soundFonts = JSON.parse(await r.text());
    for(let sf of soundFonts)
    {
        const option = document.createElement("option");
        option.innerText = sf.name;
        sfSelector.appendChild(option);
    }

    sfSelector.onchange = () => {
        fetch(`/setlastsf2?sfname=${encodeURIComponent(sfSelector.value)}`);
        if(window.manager.seq)
        {
            window.manager.seq.pause();
        }
        replaceFont(sfSelector.value);

        if(window.manager.seq)
        {
            titleMessage.innerText = window.manager.seq.midiData.midiName || TITLE;
        }

    }

    // fetch the first sf2
    replaceFont(soundFonts[0].name);

    // start midi if already uploaded
    if(!fileInput.files[0]) {
        fileInput.onchange = () => {
            if (!fileInput.files[0]) {
                return;
            }
            startMidi(fileInput.files[0]);
            fileInput.onchange = null;
        };
    }
    else
    {
        startMidi(fileInput.files[0]);
    }
})