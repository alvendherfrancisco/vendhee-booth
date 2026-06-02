// ─── Shared constants & utilities ────────────────────────────────────────────

const STRIP_W = 1875;
const STRIP_H = 5625;

const PHOTO_SLOTS = [
  {
    x: Math.round(0.056 * STRIP_W),
    y: Math.round(0.024 * STRIP_H),
    w: Math.round(0.888 * STRIP_W),
    h: Math.round(0.2537 * STRIP_H),
  },
  {
    x: Math.round(0.056 * STRIP_W),
    y: Math.round(0.3024 * STRIP_H),
    w: Math.round(0.888 * STRIP_W),
    h: Math.round(0.2537 * STRIP_H),
  },
  {
    x: Math.round(0.056 * STRIP_W),
    y: Math.round(0.581 * STRIP_H),
    w: Math.round(0.888 * STRIP_W),
    h: Math.round(0.2537 * STRIP_H),
  },
];

// Templates with a reserved date zone — use the generate-date PNG as base
// and draw today's date at the precisely measured blank area
const DATE_CONFIG = {
  1: { pngId: "1-generate-date", yPct: 0.966, xPct: 0.5 },
  7: { pngId: "7-generate-date", yPct: 0.964, xPct: 0.5 },
};

function getTemplatePng(templateId) {
  const cfg = DATE_CONFIG[Number(templateId)];
  return cfg ? cfg.pngId : templateId;
}

function getDateString() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  return `${mm}.${dd}.${yy}`;
}

function drawDate(ctx, w, h, templateId) {
  const cfg = DATE_CONFIG[Number(templateId)];
  if (!cfg) return;
  const fontSize = Math.round(h * 0.015);
  ctx.save();
  ctx.font = `700 ${fontSize}px 'Poppins', 'DM Sans', sans-serif`;
  ctx.fillStyle = "#f0758a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(getDateString(), w * cfg.xPct, h * cfg.yPct);
  ctx.restore();
}

/** Cover-crop an image into a slot on a canvas context. */
function drawPhotoInSlot(ctx, img, s) {
  const srcAR = img.naturalWidth / img.naturalHeight;
  const dstAR = s.w / s.h;
  let sx = 0,
    sy = 0,
    sw = img.naturalWidth,
    sh = img.naturalHeight;
  if (srcAR > dstAR) {
    sw = img.naturalHeight * dstAR;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / dstAR;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(s.x, s.y, s.w, s.h);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, s.x, s.y, s.w, s.h);
  ctx.restore();
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function composeStripToCanvas(canvas, templateId, photosJson) {
  const ctx = canvas.getContext("2d");
  canvas.width = STRIP_W;
  canvas.height = STRIP_H;

  const templatePng = getTemplatePng(templateId);
  let bgImg = null;

  try {
    bgImg = await loadImage(`assets/${templatePng}.png`);
    ctx.drawImage(bgImg, 0, 0, STRIP_W, STRIP_H);
  } catch (e) {
    console.warn("Template image failed to load:", e);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, STRIP_W, STRIP_H);
  }

  if (photosJson) {
    const photos = JSON.parse(photosJson);
    for (let i = 0; i < Math.min(photos.length, 3); i++) {
      try {
        const img = await loadImage(photos[i]);
        drawPhotoInSlot(ctx, img, PHOTO_SLOTS[i]);
      } catch (e) {
        console.warn(`Photo ${i} failed:`, e);
      }
    }
  }

  if (bgImg) ctx.drawImage(bgImg, 0, 0, STRIP_W, STRIP_H);
  await document.fonts.ready;
  drawDate(ctx, STRIP_W, STRIP_H, templateId);
}
