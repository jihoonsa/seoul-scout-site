// The tour's overlay (spec 5.7): the screen dimmed except for a hole with a white ring around each thing a step
// points at, and a card with the step's words and 이전 / 다음 / ×. It knows nothing of the map: the steps, and
// what happens when the tour ends, live in app.js. The overlay never closes itself; closing is the caller's job.
import { t } from "./i18n.js";

export const HOLE_PAD = 6;   // px each target grows by on every side, for its hole and ring
const CARD_GAP = 12;         // px between the target and the card
const CARD_MARGIN = 16;      // px the card keeps from the window's edges
const DOUBLE_CLICK_MS = 500; // the longest gap between a double-click's two clicks (Windows' default)

let current = null;          // the step on screen ({ step, total, title, body, targets, onBack, onNext, onClose })
let frame = 0;               // the animation frame that measures the targets again
let drawn = "";              // the rects and window size last drawn, so an unchanged frame draws nothing
let callerClosed = false;    // true from closeTour() until the dialog's close event, which then means nothing

// Where the card goes: on the side of the target with more room if it fits there, else on the other side,
// else at the bottom of the window. With no target it sits in the middle.
export function placeCard(target, card, viewport) {
  if (!target) return { left: (viewport.width - card.width) / 2, top: (viewport.height - card.height) / 2 };
  const below = target.top + target.height + CARD_GAP;
  const above = target.top - CARD_GAP - card.height;
  const fitsBelow = below + card.height <= viewport.height - CARD_MARGIN;
  const fitsAbove = above >= CARD_MARGIN;
  const moreRoomAbove = target.top > viewport.height - (target.top + target.height);
  let top = viewport.height - CARD_MARGIN - card.height;
  if (fitsAbove && (moreRoomAbove || !fitsBelow)) top = above;
  else if (fitsBelow) top = below;
  const left = Math.min(Math.max(target.left, CARD_MARGIN), viewport.width - CARD_MARGIN - card.width);
  return { left, top };
}

export function showTourStep(step) {
  const dialog = document.getElementById("tour");
  buildOnce(dialog);
  current = step;
  drawn = "";
  dialog.querySelector(".tour-count").textContent = t("tourCount", step.step, step.total);
  dialog.querySelector("#tour-title").textContent = step.title;
  dialog.querySelector("#tour-body").textContent = step.body;
  dialog.querySelector("#tour-back").textContent = t("tourBack");
  dialog.querySelector("#tour-next").textContent = t(step.step === step.total ? "tourDone" : "tourNext");
  dialog.querySelector("#tour-close").setAttribute("aria-label", t("tourClose"));
  if (!dialog.open) dialog.showModal();
  dialog.querySelector("#tour-next").focus();
  if (!frame) draw();
}

export function closeTour() {
  cancelAnimationFrame(frame);
  frame = 0;
  current = null;
  const dialog = document.getElementById("tour");
  if (dialog.open) {
    callerClosed = true;    // the close event comes later; it must not end a tour shown again by then
    dialog.close();
    swallowSecondClick();
  }
}

// A double-click on 끝내기, × or 이전 closes the tour on its first click; its second click must not land on
// whatever the tour uncovered (a zoom button, the map). A new single click still works at once.
function swallowSecondClick() {
  const swallow = (event) => {
    if (event.type === "dblclick" || event.detail > 1) {
      event.stopPropagation();
      event.preventDefault();
    }
  };
  for (const type of ["click", "dblclick"]) document.addEventListener(type, swallow, true);
  setTimeout(() => {
    for (const type of ["click", "dblclick"]) document.removeEventListener(type, swallow, true);
  }, DOUBLE_CLICK_MS);
}

// The dim, the rings and the card, made once; each step changes only their words
function buildOnce(dialog) {
  if (dialog.querySelector(".tour-card")) return;
  dialog.innerHTML = `
    <svg class="tour-dim" aria-hidden="true">
      <defs><mask id="tour-holes"><rect width="100%" height="100%" fill="#fff"/><g class="tour-hole-shapes"></g></mask></defs>
      <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.45)" mask="url(#tour-holes)"/>
    </svg>
    <div class="tour-rings"></div>
    <div class="tour-card">
      <button type="button" class="icon-button dialog-close" id="tour-close">×</button>
      <div class="tour-text" aria-live="polite">   <!-- a screen reader hears each new step -->
        <p class="tour-count"></p>
        <h2 class="tour-title" id="tour-title"></h2>
        <p class="tour-body" id="tour-body"></p>
      </div>
      <div class="actions">
        <button type="button" class="secondary-button" id="tour-back"></button>
        <button type="button" class="primary-button" id="tour-next"></button>
      </div>
    </div>`;
  dialog.querySelector("#tour-back").addEventListener("click", () => current?.onBack());
  dialog.querySelector("#tour-next").addEventListener("click", () => current?.onNext());
  dialog.querySelector("#tour-close").addEventListener("click", () => current?.onClose());
  dialog.addEventListener("cancel", (event) => {   // ESC
    event.preventDefault();
    current?.onClose();
  });
  // A browser may close a modal dialog on ESC without asking (no recent tap): that still ends the tour
  dialog.addEventListener("close", () => {
    if (callerClosed) callerClosed = false;
    else current?.onClose();
  });
}

// Every frame: measure the targets again, so the holes follow a sliding sheet, a moving map or a resized window
function draw() {
  frame = requestAnimationFrame(draw);
  if (!current) return;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const rects = current.targets()
    .filter((rect) => rect && rect.width > 0 && rect.height > 0)
    .map((rect) => clipToWindow(padded(rect), viewport))
    .filter((rect) => rect.width > 0 && rect.height > 0);
  const card = document.querySelector("#tour .tour-card");
  const key = JSON.stringify([rects, viewport, card.offsetWidth, card.offsetHeight]);
  if (key === drawn) return;
  drawn = key;
  document.querySelector("#tour .tour-hole-shapes").innerHTML = rects.map((r) =>
    // the hole's corners match the ring's (style.css --radius): a rounder hole left dim notches inside the ring (round 4)
    `<rect x="${r.left}" y="${r.top}" width="${r.width}" height="${r.height}" rx="3" fill="#000"/>`).join("");
  document.querySelector("#tour .tour-rings").innerHTML = rects.map((r) =>
    `<span class="tour-ring" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"></span>`).join("");
  const place = placeCard(rects[0] ?? null, { width: card.offsetWidth, height: card.offsetHeight }, viewport);
  card.style.left = `${place.left}px`;
  card.style.top = `${place.top}px`;
}

function padded(rect) {
  return { left: rect.left - HOLE_PAD, top: rect.top - HOLE_PAD, width: rect.width + 2 * HOLE_PAD, height: rect.height + 2 * HOLE_PAD };
}

function clipToWindow(rect, viewport) {
  const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
  const right = Math.min(viewport.width, rect.left + rect.width), bottom = Math.min(viewport.height, rect.top + rect.height);
  return { left, top, width: right - left, height: bottom - top };
}
