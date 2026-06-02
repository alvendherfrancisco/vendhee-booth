// ─── Print page ───────────────────────────────────────────────────────────────

if (document.getElementById("print-canvas")) {
  const statusEl = document.getElementById("print-status");
  const printerEl = document.getElementById("printer-machine");
  const stripPaper = document.getElementById("strip-paper");
  const doneEl = document.getElementById("done-actions");
  const dlBtn = document.getElementById("btn-download");

  // Status messages timed to feel like real printing stages
  const statusMessages = [
    { t: 0, text: "Warming up the printer\u2026" },
    { t: 100, text: "Feeding paper\u2026" },
    { t: 300, text: "Printing\u2026" },
    { t: 2000, text: "Finishing up\u2026" },
  ];

  statusMessages.forEach(({ t, text }) => {
    setTimeout(() => {
      statusEl.innerHTML = text;
    }, t);
  });

  // Printer buzz starts when animation begins; stopped in tick() when strip is fully out
  setTimeout(() => printerEl.classList.add("printing"), 800);

  // Confetti petals on done
  function spawnPetals() {
    const colors = ["#ffdee8", "#cee289", "#f0758a", "#fff0b3", "#d4f0d4"];
    for (let i = 0; i < 18; i++) {
      const p = document.createElement("div");
      p.className = "petal";
      p.style.cssText = `
        left:${10 + Math.random() * 80}%;
        top:${-5 + Math.random() * 10}%;
        background:${colors[Math.floor(Math.random() * colors.length)]};
        animation-delay:${Math.random() * 0.8}s;
        animation-duration:${2 + Math.random() * 1.5}s;
        transform:rotate(${Math.random() * 360}deg);
      `;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 4000);
    }
  }

  async function runPrintSequence() {
    const templateId = localStorage.getItem("vendee_template") || "2";
    const photosRaw = localStorage.getItem("vendee_photos");

    const workCanvas = document.getElementById("work-canvas");
    await composeStripToCanvas(workCanvas, templateId, photosRaw);

    // 5. Copy onto visible print-canvas
    const printCanvas = document.getElementById("print-canvas");
    printCanvas.width = STRIP_W;
    printCanvas.height = STRIP_H;
    printCanvas.getContext("2d").drawImage(workCanvas, 0, 0);

    // 6. Set download link early
    const dataUrl = workCanvas.toDataURL("image/png");
    dlBtn.href = dataUrl;
    dlBtn.download = "vendees-booth-strip.png";

    // 7. Animate the strip sliding OUT of the printer slot downward.
    const PRINT_DURATION = 2000; // ms
    const STRIP_REM = 30; // visual height of strip in rem
    const REM_PX = parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    const STRIP_PX = STRIP_REM * REM_PX;

    const exitZone = document.getElementById("strip-exit-zone");
    const heatEl = document.getElementById("strip-heat");
    const progressEl = document.getElementById("progress-fill");

    // Start strip hidden above (translateY = -STRIP_PX means fully inside printer)
    stripPaper.style.transform = "translateY(" + -STRIP_PX + "px)";

    // Resume progress bar CSS animation
    progressEl.style.animationPlayState = "running";

    const startTime = performance.now();
    let lastJitter = 0;
    let jitterDir = 0;

    function tick(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / PRINT_DURATION, 1);

      // Slow ease-in (paper loads), then linear feed, gentle ease-out at end
      let eased;
      if (t < 0.1) {
        eased = (t / 0.1) * (t / 0.1) * 0.05; // slow startup
      } else if (t < 0.92) {
        eased = 0.05 + ((t - 0.1) / 0.82) * 0.88; // linear feed
      } else {
        const tail = (t - 0.92) / 0.08;
        eased = 0.93 + tail * (1 - tail) * 0.14 + tail * 0.07; // ease out
      }
      eased = Math.min(eased, 1);

      // Strip slides down: starts at -STRIP_PX, ends at 0
      const translateY = -STRIP_PX * (1 - eased);
      // How much of the strip has emerged below the printer slot
      const emerged = STRIP_PX * eased;

      // Move strip down
      stripPaper.style.transform =
        "translateY(" + translateY.toFixed(1) + "px)";
      // Grow the exit-zone so page layout expands with it
      exitZone.style.height = emerged.toFixed(1) + "px";

      // Heat line: always sits at the very tip of the emerged strip
      heatEl.style.top = (emerged - 20).toFixed(1) + "px";

      // Mechanical jitter every ~100ms — tiny Y nudge for roller feel
      if (t < 0.97 && now - lastJitter > 100) {
        jitterDir = jitterDir === 0 ? 0.8 : 0;
        stripPaper.style.transform =
          "translateY(" + (translateY + jitterDir).toFixed(1) + "px)";
        lastJitter = now;
      }

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        // Fully out — stop buzz immediately
        printerEl.classList.remove("printing");
        stripPaper.style.transform = "translateY(0)";
        exitZone.style.height = STRIP_PX + "px";
        heatEl.style.opacity = "0";

        setTimeout(() => {
          statusEl.innerHTML = "Your strip is ready!";
          stripPaper.classList.add("done");
          spawnPetals();
        }, 0);

        setTimeout(() => {
          document.body.style.transition = "opacity 0.3s ease";
          document.body.style.opacity = "0";
        }, 600);

        setTimeout(() => {
          window.location.href = "final.html";
        }, 1200);
      }
    }

    requestAnimationFrame(tick);
  }

  runPrintSequence().catch((err) => {
    console.error(err);
    statusEl.innerHTML =
      '<span style="color:var(--koi-rose)">Couldn\'t compose strip \u2014 try retaking.</span>';
  });
}
