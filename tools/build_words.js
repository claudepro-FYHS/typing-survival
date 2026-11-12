/* Builds words.js. General words come from the Digi Monster Typer bank
 * (pass its words.js path); topic words are listed here.
 *   node tools/build_words.js <path-to-old-words.js>                    */
const fs = require("fs"), path = require("path");
global.window = {};
require(path.resolve(process.argv[2]));
const B = window.WORD_BANKS;
const BLOCK = new Set("blood kill dead die death gun war bomb freeze medkit shield hell sex drug beer wine".split(" "));
const clean = (s) => [...new Set(s.toLowerCase().split(/\s+/).filter((w) => /^[a-z]{3,12}$/.test(w) && !BLOCK.has(w)))];
const join = (...ks) => clean(ks.map((k) => B[k].words).join(" "));

const topics = {
  J2: { name: "micro:bit", words: `microbit led button display show number string icon pause forever loop repeat variable input output pin radio send receive sensor shake tilt compass light temperature sound music tone melody servo motor sprite score random logic compare true false block code program download flash simulator accelerometer gesture logo touch pressed released brightness plot unplot scroll clear screen digital analog read write condition function array index item timer running start game speaker microphone bluetooth battery usb cable` },
  J3: { name: "Illustrator", words: `illustrator artboard layer path anchor stroke fill gradient swatch pen brush pencil shape rectangle ellipse polygon star line curve vector pixel align distribute group ungroup rotate reflect scale shear transform pathfinder unite minus intersect exclude divide outline expand clip mask opacity blend color palette eyedropper type font text artwork canvas zoom select direct lasso magic wand eraser scissors knife symbol pattern effect shadow glow export save print logo icon poster design sketch trace image handle corner smooth guide grid ruler` },
  S1: { name: "Excel", words: `excel workbook worksheet cell row column range formula function sum average count max min round rank lookup vlookup hlookup index match countif sumif averageif iferror concatenate left right mid len trim upper lower text value date today now year month day chart pie bar line axis legend title label table filter sort pivot format border merge wrap header footer absolute relative reference percent currency decimal number data validate condition autofill series template print` },
  S2: { name: "C 語言", words: `include stdio main printf scanf return int float double char void else switch case break default for while continue function array pointer string struct define const static sizeof null true false variable declare assign operator compare logic loop condition compile link debug error warning syntax header library source code program input output integer character decimal modulus increment decrement index element address memory value parameter argument call recursion algorithm bubble sort search swap` },
};
const out = {
  general: join("everyday", "school", "nature", "food", "sports", "actions", "describe"),
  advanced: join("science", "challenge"),
  topics: {},
};
for (const g in topics) out.topics[g] = { name: topics[g].name, words: clean(topics[g].words) };

const lines = [
  "/* Typing Survival word banks. Built by tools/build_words.js; letters a-z only.",
  " * general = every grade; advanced = added for S1-S3; topics = per grade. */",
  "window.TS_WORDS = {",
  `  general: "${out.general.join(" ")}",`,
  `  advanced: "${out.advanced.join(" ")}",`,
  "  topics: {",
  ...Object.keys(out.topics).map((g) => `    ${g}: { name: ${JSON.stringify(out.topics[g].name)}, words: "${out.topics[g].words.join(" ")}" },`),
  "  },",
  "};",
  "",
];
fs.writeFileSync(path.join(__dirname, "..", "words.js"), lines.join("\n"));
console.log("general", out.general.length, "advanced", out.advanced.length, Object.keys(out.topics).map((g) => g + ":" + out.topics[g].words.length).join(" "));
