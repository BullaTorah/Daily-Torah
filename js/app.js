let WORD_LOOKUP = {};
let LEXICON = {};
let FREQUENCY = {};
let GLOBAL_VERSES = [];

let DIFFICULTY = 0;
let isDragging = false;

const STEPS = [0,100,200,300,400,500,1000,2000,3000,4000];

const knob = document.getElementById("difficultyKnob");
const bar = document.getElementById("difficultyBar");

/* ---------------- LOAD ---------------- */

const loadJSON = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url);
  return res.json();
};

/* ---------------- NORMALIZE ---------------- */

function normalize(w){
  return (w||"")
    .normalize("NFKD")
    .replace(/[\u0591-\u05C7]/g,"")
    .replace(/[.,:;!?()\[\]"']/g,"")
    .trim();
}

/* ---------------- LOOKUP ---------------- */

function lookup(word){
  const clean = normalize(word);

  let strongs = WORD_LOOKUP[clean];

  if(!strongs){
    strongs = WORD_LOOKUP[clean.slice(1)];
  }

  if(!strongs){
    return { gloss:"Unknown", lemma:null, strongs:null };
  }

  const entry = LEXICON[String(strongs)];

  return {
    strongs,
    lemma: entry?.lemma,
    gloss: entry?.gloss || "—"
  };
}

/* ---------------- DIFFICULTY ---------------- */

function snap(val){
  return STEPS.reduce((a,b)=>
    Math.abs(b-val)<Math.abs(a-val)?b:a
  );
}

function updateKnob(val){
  const percent = (val - STEPS[0]) / (STEPS.at(-1) - STEPS[0]);
  knob.style.left = `${percent*100}%`;
}

function setDifficulty(val){
  DIFFICULTY = val;

  updateKnob(val);

  document.getElementById("content").innerHTML = "";

  render(window.TITLE, GLOBAL_VERSES);
}

/* ---------------- RENDER ---------------- */

function renderHebrew(text){
  const container = document.createElement("span");

  const level = DIFFICULTY;

  text.split(/\s+/).forEach(raw => {

    const el = document.createElement("span");
    el.className = "word";
    el.textContent = raw;

    const info = lookup(raw);

    const rank = FREQUENCY[info.strongs]?.rank ?? Infinity;

    // ✅ FIXED LOGIC (THIS IS THE IMPORTANT PART)
    let hide = false;

    if(level === 0){
      hide = false;
    } else {
      hide = rank > level;
    }

    if(hide){
      el.classList.add("no-highlight");
    }

    container.appendChild(el);
    container.appendChild(document.createTextNode(" "));
  });

  return container;
}

function render(title, verses){
  document.getElementById("title").textContent = title;

  const c = document.getElementById("content");
  c.innerHTML = "";

  verses.forEach(v=>{
    const div = document.createElement("div");
    div.className = "verse";

    const h = document.createElement("div");
    h.className = "hebrew";
    h.appendChild(renderHebrew(v.he));

    const e = document.createElement("div");
    e.className = "english";
    e.textContent = v.en;

    div.appendChild(h);
    div.appendChild(e);
    c.appendChild(div);
  });
}

/* ---------------- SLIDER ---------------- */

knob.addEventListener("mousedown",()=>{
  isDragging = true;
  knob.classList.add("dragging");
});

document.addEventListener("mousemove",(e)=>{
  if(!isDragging) return;

  const rect = bar.getBoundingClientRect();
  const x = e.clientX - rect.left;

  const percent = Math.max(0,Math.min(1,x/rect.width));

  knob.style.left = `${percent*100}%`;
});

document.addEventListener("mouseup",(e)=>{
  if(!isDragging) return;

  isDragging = false;
  knob.classList.remove("dragging");

  const rect = bar.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const percent = Math.max(0,Math.min(1,x/rect.width));

  const raw = STEPS[0] + percent*(STEPS.at(-1)-STEPS[0]);

  const snapped = snap(raw);

  setDifficulty(snapped);
});

/* ---------------- CLICK POPUP ---------------- */

document.getElementById("content").addEventListener("click",(e)=>{
  const word = e.target.closest(".word");
  if(!word) return;

  const data = lookup(word.textContent);

  const popup = document.getElementById("popup");

  popup.style.display = "block";
  popup.innerHTML = `
    <div><b>${word.textContent}</b></div>
    <div>${data.gloss}</div>
  `;
});

/* ---------------- INIT ---------------- */

(async function init(){

  const [words,lex,freq] = await Promise.all([
    loadJSON("/data/word-lookup.json"),
    loadJSON("/data/gloss.json"),
    loadJSON("/data/lemma-frequency.json")
  ]);

  WORD_LOOKUP = words;
  LEXICON = lex;
  FREQUENCY = freq;

  const data = await loadJSON("https://www.sefaria.org/api/texts/Genesis.1.1-1.5?context=0");

  GLOBAL_VERSES = data.he.map((v,i)=>({
    he:v,
    en:data.text[i]||""
  }));

  window.TITLE = "Genesis";

  render(window.TITLE, GLOBAL_VERSES);

  setDifficulty(0);
})();
