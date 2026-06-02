// ─── Final page ───────────────────────────────────────────────────────────────

if (document.getElementById("strip-canvas")) {
  const templateId = localStorage.getItem("vendee_template") || "2";
  const photosRaw = localStorage.getItem("vendee_photos");

  async function compose() {
    const canvas = document.getElementById("strip-canvas");
    await composeStripToCanvas(canvas, templateId, photosRaw);

    document.getElementById("loading").style.display = "none";
    canvas.style.display = "block";
    canvas.classList.add("revealed");

    const dataUrl = canvas.toDataURL("image/png");
    const dl = document.getElementById("btn-download");
    dl.href = dataUrl;
    dl.download = "vendees-booth-strip.png";
  }

  compose().catch((e) => {
    console.error(e);
    document.getElementById("loading").innerHTML =
      '<span style="color:#c97b74">Couldn\'t compose strip.<br>Try retaking photos.</span>';
  });
}
