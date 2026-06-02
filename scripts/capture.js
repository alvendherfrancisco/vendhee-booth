// ─── Capture page ─────────────────────────────────────────────────────────────

if (document.getElementById("video")) {
  const templateId = localStorage.getItem("vendee_template") || "1";
  const captureMode = localStorage.getItem("vendee_mode") || "camera"; // "camera" | "upload"

  let currentFilter = "none";
  let timerSecs = 3;
  let capturedPhotos = [];
  let capturing = false;
  let liveFrameId = null;

  const video = document.getElementById("video");
  const flash = document.getElementById("flash");
  const canvas = document.getElementById("canvas");
  const countdownEl = document.getElementById("countdown");
  const btnStart = document.getElementById("btn-start");
  const shotStatus = document.getElementById("shot-status");
  const camMsg = document.getElementById("cam-msg");
  const cameraWrap = document.getElementById("camera-wrap");

  // ── Add proper touch & click event listeners to button for mobile reliability ─
  let isClickPending = false;
  const handleButtonClick = async (e) => {
    console.log(
      "handleButtonClick fired. isClickPending:",
      isClickPending,
      "button ready:",
      isButtonReady,
    );
    if (isClickPending) return;

    isClickPending = true;

    try {
      // Always route through startSession for consistent logic
      console.log("Calling startSession from handleButtonClick");
      await startSession();
    } catch (err) {
      console.error("Button click error:", err);
    } finally {
      isClickPending = false;
    }
  };

  btnStart.addEventListener("click", handleButtonClick);
  btnStart.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleButtonClick(e);
  });

  // Additional pointer event for better mobile support
  btnStart.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") {
      e.target.classList.add("btn-active");
    }
  });

  btnStart.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") {
      e.target.classList.remove("btn-active");
    }
  });

  // ── Upload mode setup ─────────────────────────────────────────────────────
  const isUploadMode = captureMode === "upload";
  let isButtonReady = !isUploadMode; // Button is ready immediately in camera mode

  const isPhoneDevice =
    /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    ) || window.matchMedia("(max-width: 768px)").matches;
  const MAX_PHOTO_DIM_PHONE = 900;
  const MAX_PHOTO_DIM_DESKTOP = 0; // no resolution degradation on larger devices
  const PHONE_SAVE_QUALITY = 0.74;
  const DESKTOP_SAVE_QUALITY = 0.92;

  function getUploadCompressionConfig() {
    return {
      maxDim: isPhoneDevice ? MAX_PHOTO_DIM_PHONE : MAX_PHOTO_DIM_DESKTOP,
      quality: isPhoneDevice ? PHONE_SAVE_QUALITY : DESKTOP_SAVE_QUALITY,
    };
  }

  async function compressAndFilterDataUrl(dataUrl, filter) {
    const img = await loadImage(dataUrl);
    let targetW = img.naturalWidth;
    let targetH = img.naturalHeight;
    const { maxDim, quality } = getUploadCompressionConfig();

    if (maxDim > 0 && (targetW > maxDim || targetH > maxDim)) {
      const aspect = targetW / targetH;
      if (aspect >= 1) {
        targetW = maxDim;
        targetH = Math.round(maxDim / aspect);
      } else {
        targetH = maxDim;
        targetW = Math.round(maxDim * aspect);
      }
    }

    const c = document.createElement("canvas");
    c.width = targetW;
    c.height = targetH;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, targetW, targetH);

    if (filter !== "none") {
      applyPixelFilter(ctx, targetW, targetH, filter);
    }

    return c.toDataURL("image/jpeg", quality);
  }

  if (isUploadMode) {
    // Hide timer panel only — keep filter panel visible
    document.querySelectorAll(".panel").forEach((p, i) => {
      if (i === 2) p.style.display = "none"; // timer panel only
    });

    // Change bottom bar button label and add disabled state (don't use disabled attribute for iOS)
    btnStart.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
      Continue
    `;
    btnStart.classList.add("disabled-state");
    btnStart.disabled = true;
    shotStatus.innerHTML = `Upload <strong>3 photos</strong> from your device`;
  }

  // ── Hide <video>, inject a live canvas in its place ───────────────────────
  video.style.display = "none";

  const liveCanvas = document.createElement("canvas");
  liveCanvas.id = "live-canvas";
  liveCanvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;";
  video.parentNode.insertBefore(liveCanvas, video.nextSibling);
  const liveCtx = liveCanvas.getContext("2d", { willReadFrequently: true });

  // ── Upload overlay inside camera-wrap ─────────────────────────────────────
  if (isUploadMode) {
    liveCanvas.style.display = "none";

    const uploadZone = document.createElement("div");
    uploadZone.id = "upload-zone";
    uploadZone.innerHTML = `
      <input type="file" id="file-input" accept="image/*" multiple style="display:none" />
      <div class="upload-zone-inner" id="upload-zone-inner">
        <div class="upload-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <p class="upload-primary">Tap to choose a photo</p>
        <p class="upload-sub">or drag and drop here</p>
        <p class="upload-count" id="upload-count">0 / 3 uploaded</p>
      </div>
    `;
    cameraWrap.appendChild(uploadZone);

    const fileInput = uploadZone.querySelector("#file-input");
    const uploadZoneInner = uploadZone.querySelector("#upload-zone-inner");

    uploadZone.addEventListener("click", (e) => {
      if (e.target !== fileInput) fileInput.click();
    });

    uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadZone.classList.add("drag-over");
    });
    uploadZone.addEventListener("dragleave", () =>
      uploadZone.classList.remove("drag-over"),
    );
    uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadZone.classList.remove("drag-over");
      handleFiles(
        Array.from(e.dataTransfer.files).filter((f) =>
          f.type.startsWith("image/"),
        ),
      );
    });

    fileInput.addEventListener("change", () => {
      handleFiles(Array.from(fileInput.files));
      fileInput.value = "";
    });
  }

  // ── Handle uploaded files ─────────────────────────────────────────────────
  const uploadedPhotos = [null, null, null];
  const uploadedPhotoFilters = [null, null, null];
  let uploadCount = 0;
  let replaceCursor = 0;

  function getNextUploadIndex() {
    const emptyIndex = uploadedPhotos.findIndex((photo) => photo === null);
    if (emptyIndex !== -1) return emptyIndex;
    const idx = replaceCursor;
    replaceCursor = (replaceCursor + 1) % 3;
    return idx;
  }

  function refreshUploadUI() {
    const countEl = document.getElementById("upload-count");
    const inner = document.getElementById("upload-zone-inner");
    const primary = document.querySelector(".upload-primary");
    const sub = document.querySelector(".upload-sub");
    const ready = uploadCount === 3 && uploadedPhotos.every((p) => p);

    if (countEl) countEl.textContent = `${uploadCount} / 3 uploaded`;
    if (inner) inner.classList.toggle("all-done", ready);
    if (primary) {
      primary.textContent =
        uploadCount === 0
          ? "Tap to choose a photo"
          : uploadCount < 3
            ? "Tap to add another photo"
            : "All 3 photos uploaded!";
    }
    if (sub) {
      sub.textContent =
        uploadCount === 0
          ? "or drag and drop here"
          : uploadCount < 3
            ? `${3 - uploadCount} more needed`
            : "🍀 Looking great";
    }

    isButtonReady = ready;
    btnStart.classList.toggle("disabled-state", !ready);
    btnStart.disabled = !ready;

    if (ready) {
      shotStatus.innerHTML = `All 3 photos ready!`;
    } else if (uploadCount > 0) {
      shotStatus.innerHTML = `${uploadCount} of 3 uploaded — <strong>${3 - uploadCount} more</strong> to go`;
    } else {
      shotStatus.innerHTML = `Upload <strong>3 photos</strong> from your device`;
    }
  }

  function deleteUploadedPhoto(idx) {
    if (!uploadedPhotos[idx]) return;
    uploadedPhotos[idx] = null;
    uploadedPhotoFilters[idx] = null;
    uploadCount = Math.max(0, uploadCount - 1);
    replaceCursor = idx;

    const slot = document.getElementById(`slot${idx}`);
    if (slot) {
      slot.innerHTML = `<div class="shot-num">${idx + 1}</div>`;
      slot.classList.remove("taken");
    }

    capturedImages[idx] = null;
    renderStripPreview();
    refreshUploadUI();
  }

  // Apply pixel filter to an image and return a filtered dataUrl
  function applyFilterToDataUrl(dataUrl, filter) {
    return compressAndFilterDataUrl(dataUrl, filter);
  }

  function handleFiles(files) {
    files.forEach((file) => {
      const idx = getNextUploadIndex();
      const wasEmpty = uploadedPhotos[idx] === null;
      if (wasEmpty) {
        uploadedPhotos[idx] = { raw: null, filtered: null };
      }
      const reader = new FileReader();
      reader.onload = async (e) => {
        const rawDataUrl = e.target.result;
        const filterAtUpload = currentFilter;
        console.log(
          `Photo ${idx} loaded (${(rawDataUrl.length / 1024).toFixed(2)} KB), applying filter: ${filterAtUpload}`,
        );

        // Apply current filter to the uploaded photo and compress image data
        const filteredDataUrl = await compressAndFilterDataUrl(
          rawDataUrl,
          filterAtUpload,
        );
        console.log(
          `Photo ${idx} filtered (${(filteredDataUrl.length / 1024).toFixed(2)} KB)`,
        );

        // Store raw, filtered, and which filter was used at upload time
        if (wasEmpty) uploadCount += 1;
        uploadedPhotos[idx] = { raw: rawDataUrl, filtered: filteredDataUrl };
        uploadedPhotoFilters[idx] = filterAtUpload;

        updateStripPreviewFromUrl(idx, filteredDataUrl);
        refreshUploadUI();
        console.log(`Upload progress: ${uploadCount}/3`);
      };
      reader.onerror = () => {
        console.error(`Failed to read file for slot ${idx}`);
        if (wasEmpty) {
          uploadedPhotos[idx] = null;
          refreshUploadUI();
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // Re-apply filter to ALL uploaded photos when filter button is clicked (only after all 3 are uploaded)
  async function reapplyFilterToAllUploaded(filter) {
    if (uploadCount !== 3) return; // Only reapply after all 3 are uploaded

    shotStatus.innerHTML = `Applying filter to all 3 photos...`;

    for (let i = 0; i < 3; i++) {
      if (uploadedPhotos[i]) {
        const filteredDataUrl = await applyFilterToDataUrl(
          uploadedPhotos[i].raw,
          filter,
        );
        uploadedPhotos[i].filtered = filteredDataUrl;
        uploadedPhotoFilters[i] = filter;
        updateStripPreviewFromUrl(i, filteredDataUrl);
      }
    }

    shotStatus.innerHTML = `All 3 photos ready`;
  }

  async function proceedWithUploads() {
    // Verify all 3 photos are ready
    if (uploadCount !== 3 || !uploadedPhotos.every((p) => p)) {
      console.error("Not all photos ready:", uploadCount, uploadedPhotos);
      shotStatus.innerHTML = `Error: Not all photos ready`;
      return;
    }

    shotStatus.innerHTML = `All done! 🍀 Composing your strip...`;

    try {
      console.log(
        "proceedWithUploads: uploadCount=",
        uploadCount,
        "uploadedPhotos=",
        uploadedPhotos,
      );

      // Extract filtered dataUrls
      const finalPhotos = uploadedPhotos.map((p) => (p ? p.filtered : null));

      // Clear any previous image payload to maximize available storage space.
      localStorage.removeItem("vendee_photos");
      localStorage.removeItem("vendee_filter");
      localStorage.removeItem("vendee_photo_filters");
      console.log("finalPhotos created, length:", finalPhotos.length);

      // Verify each photo is a valid dataUrl
      for (let i = 0; i < finalPhotos.length; i++) {
        if (!finalPhotos[i]) {
          throw new Error(`Photo ${i} is missing`);
        }
        if (
          typeof finalPhotos[i] !== "string" ||
          !finalPhotos[i].startsWith("data:image")
        ) {
          throw new Error(`Photo ${i} is not a valid dataUrl`);
        }
        console.log(`Photo ${i} size: ${finalPhotos[i].length} bytes`);
      }

      // Save to localStorage
      const photosJson = JSON.stringify(finalPhotos);
      console.log(
        "Saving vendee_photos, total size:",
        photosJson.length,
        "bytes",
      );
      localStorage.setItem("vendee_photos", photosJson);

      localStorage.setItem("vendee_filter", currentFilter);
      localStorage.setItem(
        "vendee_photo_filters",
        JSON.stringify(uploadedPhotoFilters),
      );

      // Verify data was saved before redirecting
      const savedPhotos = localStorage.getItem("vendee_photos");
      console.log(
        "Verified localStorage save, size:",
        savedPhotos?.length || 0,
        "bytes",
      );

      if (!savedPhotos) {
        throw new Error("Failed to save photos to localStorage");
      }

      // Parse to ensure it's valid JSON
      const parsedPhotos = JSON.parse(savedPhotos);
      console.log(
        "Verified localStorage parse, photos count:",
        parsedPhotos.length,
      );

      // Give a moment for storage to settle, then redirect
      console.log("About to redirect to print.html");
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Use a more explicit redirect method
      window.location.replace("print.html");
    } catch (err) {
      console.error("Error in proceedWithUploads:", err);
      const isQuota =
        err.name === "QuotaExceededError" ||
        err.message?.toLowerCase().includes("quota");
      const message = isQuota
        ? "The photo data is too large for this device. Try smaller files or use camera mode."
        : err.message;
      shotStatus.innerHTML = `Error: ${message}. Please try again.`;
    }
  }

  // ── Pixel-level filter functions ──────────────────────────────────────────
  function applyPixelFilter(ctx, w, h, filter) {
    if (filter === "none") return;
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;

    if (filter === "bw") {
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = Math.min(255, g * 1.05);
        d[i + 1] = Math.min(255, g * 1.0);
        d[i + 2] = Math.min(255, g * 0.9);
      }
    } else if (filter === "sepia") {
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i],
          g = d[i + 1],
          b = d[i + 2];
        d[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        d[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        d[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      }
    } else if (filter === "vintage") {
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i],
          g = d[i + 1],
          b = d[i + 2];
        d[i] = Math.min(255, r * 1.1 + 15);
        d[i + 1] = Math.min(255, g * 0.95 + 10);
        d[i + 2] = Math.min(255, b * 0.75);
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // ── Live preview loop ─────────────────────────────────────────────────────
  function drawLiveFrame() {
    if (video.readyState >= 2 && video.videoWidth > 0) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      if (liveCanvas.width !== vw || liveCanvas.height !== vh) {
        liveCanvas.width = vw;
        liveCanvas.height = vh;
      }

      liveCtx.save();
      liveCtx.translate(vw, 0);
      liveCtx.scale(-1, 1);
      liveCtx.drawImage(video, 0, 0, vw, vh);
      liveCtx.restore();

      applyPixelFilter(liveCtx, vw, vh, currentFilter);
    }

    liveFrameId = requestAnimationFrame(drawLiveFrame);
  }

  // ── Strip preview ─────────────────────────────────────────────────────────
  const previewCanvas = document.getElementById("strip-preview-canvas");
  const previewCtx = previewCanvas.getContext("2d");
  previewCanvas.width = STRIP_W;
  previewCanvas.height = STRIP_H;

  let templateImg = null;
  const capturedImages = [null, null, null];

  function renderStripPreview() {
    previewCtx.clearRect(0, 0, STRIP_W, STRIP_H);
    if (templateImg) previewCtx.drawImage(templateImg, 0, 0, STRIP_W, STRIP_H);
    for (let i = 0; i < 3; i++) {
      if (capturedImages[i])
        drawPhotoInSlot(previewCtx, capturedImages[i], PHOTO_SLOTS[i]);
    }
    if (templateImg) previewCtx.drawImage(templateImg, 0, 0, STRIP_W, STRIP_H);
    drawDate(previewCtx, STRIP_W, STRIP_H, templateId);
  }

  function updateStripPreviewFromUrl(idx, dataUrl) {
    const slot = document.getElementById(`slot${idx}`);
    if (slot) {
      slot.innerHTML = `
        <img src="${dataUrl}" alt="shot" />
        <button class="delete-photo" type="button" data-index="${idx}" aria-label="Remove photo">
          <span>×</span>
        </button>
      `;
      slot.classList.add("taken");
      const deleteButton = slot.querySelector(".delete-photo");
      deleteButton?.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteUploadedPhoto(idx);
      });
    }
    const img = new Image();
    img.onload = () => {
      capturedImages[idx] = img;
      renderStripPreview();
    };
    img.src = dataUrl;
  }

  async function loadTemplate() {
    templateImg = await loadImage(`assets/${getTemplatePng(templateId)}.png`);
    renderStripPreview();
  }

  loadTemplate();

  // ── Camera start ──────────────────────────────────────────────────────────
  async function startCamera() {
    if (isUploadMode) return;
    camMsg.style.display = "none";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      video.srcObject = stream;

      video.addEventListener(
        "playing",
        () => {
          if (liveFrameId) cancelAnimationFrame(liveFrameId);
          drawLiveFrame();
        },
        { once: true },
      );

      video.addEventListener(
        "canplay",
        () => {
          video.play().catch(() => {});
        },
        { once: true },
      );

      document.getElementById("camera-wrap").classList.add("live");
    } catch (e) {
      camMsg.style.display = "flex";
      document.getElementById("error-notice").style.display = "block";
      console.error("Camera error:", e);
    }
  }

  if (!isUploadMode) startCamera();

  // ── Filter / timer controls ───────────────────────────────────────────────
  function setFilter(f, btn) {
    currentFilter = f;
    document
      .querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    // In upload mode: if all 3 photos are uploaded, reapply the filter to all of them
    // Otherwise, the filter will apply to the next photos that are uploaded
    if (isUploadMode && uploadCount === 3) {
      reapplyFilterToAllUploaded(f);
    }
  }

  function setTimer(secs, btn) {
    timerSecs = secs;
    document
      .querySelectorAll(".timer-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  }

  // ── Countdown ─────────────────────────────────────────────────────────────
  function countdown(secs) {
    return new Promise((resolve) => {
      let remaining = secs;
      countdownEl.textContent = remaining;
      countdownEl.classList.add("show");
      const tick = setInterval(() => {
        remaining--;
        countdownEl.classList.remove("show");
        if (remaining > 0) {
          setTimeout(() => {
            countdownEl.textContent = remaining;
            countdownEl.classList.add("show");
          }, 200);
        } else {
          setTimeout(() => {
            countdownEl.classList.remove("show");
            clearInterval(tick);
            resolve();
          }, 200);
        }
      }, 1000);
    });
  }

  // ── Capture a single photo ────────────────────────────────────────────────
  function capturePhoto() {
    flash.classList.remove("go");
    void flash.offsetWidth;
    flash.classList.add("go");

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    applyPixelFilter(ctx, w, h, currentFilter);

    return canvas.toDataURL("image/jpeg", 0.92);
  }

  // ── Update thumbnail + strip preview (camera mode) ────────────────────────
  function updateStripPreview(idx, dataUrl) {
    const slot = document.getElementById(`slot${idx}`);
    slot.innerHTML = `<img src="${dataUrl}" alt="shot" />`;
    slot.classList.add("taken");
    const img = new Image();
    img.onload = () => {
      capturedImages[idx] = img;
      renderStripPreview();
    };
    img.src = dataUrl;
  }

  // ── Main session ──────────────────────────────────────────────────────────
  async function startSession() {
    console.log(
      "startSession called. isUploadMode:",
      isUploadMode,
      "isButtonReady:",
      isButtonReady,
      "uploadCount:",
      uploadCount,
    );

    // Upload mode
    if (isUploadMode) {
      if (!isButtonReady) {
        console.log(
          "Upload mode but not ready - continue should not upload photos",
        );
        shotStatus.innerHTML = `Upload <strong>3 photos</strong> from your device before continuing.`;
        return;
      } else {
        // Ready - verify state and proceed to print page
        console.log("Upload mode and ready - checking photo state");
        if (uploadCount === 3 && uploadedPhotos.every((p) => p)) {
          console.log("All photos verified, proceeding to uploads");
          await proceedWithUploads();
        } else {
          console.error(
            "Button ready but photos incomplete:",
            uploadCount,
            uploadedPhotos,
          );
          shotStatus.innerHTML = `Error: Photo state invalid`;
        }
        return;
      }
    }

    // Camera mode
    if (capturing) return;
    if (!video.srcObject) {
      startCamera();
      return;
    }

    capturing = true;
    capturedPhotos = [];
    btnStart.classList.add("capturing");

    capturedImages[0] = capturedImages[1] = capturedImages[2] = null;
    renderStripPreview();
    for (let i = 0; i < 3; i++) {
      const slot = document.getElementById(`slot${i}`);
      slot.innerHTML = `<div class="shot-num">${i + 1}</div>`;
      slot.classList.remove("taken");
    }

    for (let i = 0; i < 3; i++) {
      shotStatus.innerHTML = `Photo <strong>${i + 1} of 3</strong> — get ready!`;
      await countdown(timerSecs);
      const photo = capturePhoto();
      capturedPhotos.push(photo);
      updateStripPreview(i, photo);
      shotStatus.innerHTML = `✓ Photo <strong>${i + 1}</strong> taken!`;
      if (i < 2) await sleep(900);
    }

    localStorage.setItem("vendee_photos", JSON.stringify(capturedPhotos));
    localStorage.setItem("vendee_filter", currentFilter);
    shotStatus.innerHTML = `All done! 🍀 Composing your strip...`;

    await sleep(1200);
    window.location.href = "print.html";
  }

  // Expose for inline HTML handlers
  window.startCamera = startCamera;
  window.startSession = startSession;
  window.setFilter = setFilter;
  window.setTimer = setTimer;
}
