// ─── Menu page ────────────────────────────────────────────────────────────────

if (document.getElementById("grid")) {
  const templates = [
    { id: 1, name: "Koi Kiss", tag: " T1" },
    { id: 2, name: "Clover Charm", tag: " T2" },
    { id: 3, name: "Bubble Koi", tag: " T3" },
    { id: 4, name: "Petal Puff", tag: " T4" },
    { id: 5, name: "Sakura Koi", tag: " T5" },
    { id: 6, name: "Pond Whisper", tag: " T6" },
    { id: 7, name: "Lucky Tide", tag: " T7" },
    { id: 8, name: "Clover Pond ", tag: " T8" },
  ];

  let selected = null;
  const grid = document.getElementById("grid");
  const info = document.getElementById("selected-info");
  const btnNext = document.getElementById("btn-next");

  function buildGrid() {
    templates.forEach((t) => {
      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = t.id;
      card.innerHTML = `
        <div class="card-check">✓</div>
        <img class="template-preview" src="assets/${t.id}.png" alt="${t.name}" loading="lazy" />
        <div class="card-name">${t.name}</div>
        <span class="card-tag">${t.tag}</span>
      `;
      card.addEventListener("click", () => selectCard(t.id, t.name));
      grid.appendChild(card);
    });
  }

  function selectCard(id, name) {
    document
      .querySelectorAll(".card")
      .forEach((c) => c.classList.remove("selected"));
    document.querySelector(`.card[data-id="${id}"]`).classList.add("selected");
    selected = id;
    info.innerHTML = `Selected: <strong>${name}</strong>`;
    btnNext.disabled = false;
  }

  function goNext() {
    if (!selected) return;
    localStorage.setItem("vendee_template", selected);
    window.location.href = "mode.html";
  }

  // Expose goNext for the inline onclick in index.html
  window.goNext = goNext;

  buildGrid();
}
