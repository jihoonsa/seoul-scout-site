// The desktop report panel: its width (dragged, keyed, remembered) and the fold button (D69).
// The width lives in the CSS variable --panel-width on .app; style.css places the other floating controls by it.
import { t } from "./i18n.js";

export const PANEL_DEFAULT = 0.36;          // share of the window the panel opens at (D75: docked at full height, so Seoul keeps room)
export const PANEL_STEP = 0.05;             // one arrow-key press
export const PANEL_KEY = "seoulScout.panelWidth";
const SMALLEST = 0.25, WIDEST = 0.70;       // the user's choice is kept between these
const MIN_PX = 320;                         // narrower than this the report boxes get cramped
// Left of the panel: 16 + 360 (search and layer cards) + 16; right of the free map: 16 + 56 (zoom) + 12 + 24 (credit) + 16
const KEEP_FREE_PX = 520;

let chosen = PANEL_DEFAULT;                 // the user's last choice, before fitting it to this window
let notifyChange = () => {};

export function panelLimits(windowWidth) {
  return { min: Math.max(SMALLEST, MIN_PX / windowWidth), max: Math.min(WIDEST, (windowWidth - KEEP_FREE_PX) / windowWidth) };
}

export function clampPanel(fraction, windowWidth) {
  const { min, max } = panelLimits(windowWidth);
  return Math.min(Math.max(fraction, min), Math.max(min, max));
}

function readStoredFraction() {
  try {
    const stored = Number(localStorage.getItem(PANEL_KEY));
    return Number.isFinite(stored) && stored >= SMALLEST && stored <= WIDEST ? stored : PANEL_DEFAULT;
  } catch {
    return PANEL_DEFAULT;  // storage blocked: the panel still works, it just forgets
  }
}

function storeFraction(fraction) {
  try { localStorage.setItem(PANEL_KEY, String(Math.round(fraction * 1000) / 1000)); } catch { /* storage blocked */ }
}

function shownFraction() {
  return clampPanel(chosen, window.innerWidth);
}

function applyWidth() {
  const fraction = shownFraction();
  document.querySelector(".app").style.setProperty("--panel-width", `${Math.round(fraction * window.innerWidth)}px`);
  document.getElementById("panel-handle").setAttribute("aria-valuenow", String(Math.round(fraction * 100)));
  notifyChange();
}

function choose(fraction) {
  chosen = Math.min(Math.max(fraction, SMALLEST), WIDEST);
  applyWidth();
}

function isFolded() {
  return document.querySelector(".app").classList.contains("panel-folded");
}

function setFolded(folded) {
  document.querySelector(".app").classList.toggle("panel-folded", folded);
  renderPanelLabels();
  notifyChange();
}

// The left column (search, trade, map view) folds the same way, into one button (D83)
function isLeftFolded() {
  return document.querySelector(".app").classList.contains("left-folded");
}

function setLeftFolded(folded) {
  document.querySelector(".app").classList.toggle("left-folded", folded);
  renderPanelLabels();
}

export function showLeftColumn() {
  if (isLeftFolded()) setLeftFolded(false);
}

export function showPanel() {
  if (isFolded()) setFolded(false);
}

export function renderPanelLabels() {
  const fold = document.getElementById("panel-fold");
  const folded = isFolded();
  fold.textContent = folded ? t("panelShow") : "›";
  fold.setAttribute("aria-label", folded ? t("panelShow") : t("panelHide"));
  fold.setAttribute("aria-expanded", String(!folded));
  document.getElementById("panel-handle").setAttribute("aria-label", t("panelResize"));
  const leftFold = document.getElementById("left-fold");
  const leftFolded = isLeftFolded();
  leftFold.textContent = leftFolded ? t("leftShow") : "‹";
  leftFold.setAttribute("aria-label", leftFolded ? t("leftShow") : t("leftHide"));
  leftFold.setAttribute("aria-expanded", String(!leftFolded));
}

function bindHandle(handle) {
  handle.addEventListener("pointerdown", (event) => {
    handle.setPointerCapture(event.pointerId);
    document.querySelector(".app").classList.add("panel-dragging");
  });
  handle.addEventListener("pointermove", (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    choose(clampPanel((window.innerWidth - event.clientX) / window.innerWidth, window.innerWidth));   // docked at the right edge
  });
  handle.addEventListener("pointerup", (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    handle.releasePointerCapture(event.pointerId);
    document.querySelector(".app").classList.remove("panel-dragging");
    storeFraction(chosen);
  });
  // The handle sits on the panel's left edge: moving it left makes the panel wider
  handle.addEventListener("keydown", (event) => {
    const step = { ArrowLeft: PANEL_STEP, ArrowRight: -PANEL_STEP }[event.key];
    if (!step) return;
    event.preventDefault();
    choose(clampPanel(shownFraction() + step, window.innerWidth));
    storeFraction(chosen);
  });
  handle.addEventListener("dblclick", () => {
    choose(PANEL_DEFAULT);
    storeFraction(chosen);
  });
}

export function initPanel(onChange) {
  notifyChange = onChange;
  chosen = readStoredFraction();
  bindHandle(document.getElementById("panel-handle"));
  document.getElementById("panel-fold").addEventListener("click", () => setFolded(!isFolded()));
  document.getElementById("left-fold").addEventListener("click", () => setLeftFolded(!isLeftFolded()));
  window.addEventListener("resize", applyWidth);
  renderPanelLabels();
  applyWidth();
}
