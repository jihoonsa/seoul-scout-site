// The rules behind a gap's evidence (spec 5.4, D72): the 신호 세기 level and the icon picture's scale.
// No DOM here, so the smoke test can import and check them directly; app.js draws the HTML.

// 3 passed checks = strong (강함), 2 = medium (보통), 1 or 0 = weak (약함)
export function signalLevel(checks) {
  const passed = checks.filter(Boolean).length;
  if (passed === 3) return "strong";
  if (passed === 2) return "medium";
  return "weak";
}

// How many shops one icon stands for, so no row needs more than 20 icons.
// Spec 5.4 names 1 and 5; 25 is for the few gaps above 100 (대학동 한식음식점 expects 467).
export function shopsPerIcon(expected) {
  const shops = Math.round(expected);
  if (shops <= 20) return 1;
  if (shops <= 100) return 5;
  return 25;
}

// A row of icons for `count` shops: whole icons, then the part of one more (0 to 0.99)
export function iconRow(count, perIcon) {
  const icons = count / perIcon;
  const whole = Math.floor(icons);
  return { whole, part: Math.round((icons - whole) * 100) / 100 };
}
