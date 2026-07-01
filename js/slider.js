
const DIFFICULTY_STEPS = [0, 100, 200, 300, 400, 500, 1000, 2000, 3000];

function setDifficulty(val) {
  difficultyValue = val;

updateKnob(val);

  window.DIFFICULTY = val;

  const content = document.getElementById("content");
  content.innerHTML = "";

  window.MATCHES = 0;
  window.MISSES = 0;

  render(window.TITLE, GLOBAL_VERSES);

  console.log("DIFFICULTY:", val);
}


function updateKnob(val) {
  const min = DIFFICULTY_STEPS[0];
  const max = DIFFICULTY_STEPS[DIFFICULTY_STEPS.length - 1];

  const percent = (val - min) / (max - min);
  knob.style.left = `${percent * 100}%`;
}

function getValueFromX(clientX) {
  const rect = bar.getBoundingClientRect();
  const x = clientX - rect.left;

  const percent = Math.max(0, Math.min(1, x / rect.width));

  const min = DIFFICULTY_STEPS[0];
  const max = DIFFICULTY_STEPS[DIFFICULTY_STEPS.length - 1];

  const rawValue = min + percent * (max - min);

  return snapToStep(rawValue);
}

function layoutTicksEvenly() {
  const ticks = document.querySelectorAll(".tick");

  ticks.forEach((tick, i) => {
    const value = DIFFICULTY_STEPS[i];

    tick.textContent = value; // ensures label matches logic

    const percent = i / (DIFFICULTY_STEPS.length - 1);
    tick.style.left = `${percent * 100}%`;
  });
}

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  const rect = bar.getBoundingClientRect();
  const x = e.clientX - rect.left;

  const percent = Math.max(0, Math.min(1, x / rect.width));

  // move smoothly WITH cursor (no snapping yet)
  knob.style.left = `${percent * 100}%`;
});

/* DRAG END */
document.addEventListener("mouseup", (e) => {
  if (!isDragging) return;

  isDragging = false;
  knob.classList.remove("dragging");

  const val = getValueFromX(e.clientX);

  setDifficulty(val);

  // 🔥 prevent accidental click-through after drag
  suppressNextClick = true;
  setTimeout(() => {
    suppressNextClick = false;
  }, 50);
});

knob.addEventListener("mousedown", (e) => {
  isDragging = true;
  knob.classList.add("dragging");
  e.preventDefault();
});
