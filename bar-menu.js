// The top bar's menus, the trade menu and the map view menu (top bar design 5.2, 5.3): one open at a time. A click on
// the button opens or closes its menu; Esc, a click outside or a choice closes it; the arrow keys move between items.
const buttons = new Map();   // each bound menu -> its button
const ARROW_STEPS = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

export function bindMenu(button, menu) {
  buttons.set(menu, button);
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => (menu.hidden ? openMenu(menu) : closeMenu(menu)));
  menu.addEventListener("keydown", (event) => handleMenuKey(event, menu));
  document.addEventListener("pointerdown", (event) => {
    const outside = !menu.contains(event.target) && !button.contains(event.target);
    if (!menu.hidden && outside) closeMenu(menu);
  });
}

export function closeMenu(menu) {
  const button = buttons.get(menu);
  const focusInside = menu.contains(document.activeElement);
  menu.hidden = true;
  button.setAttribute("aria-expanded", "false");
  if (focusInside) button.focus();   // a choice made with the keyboard leaves it on the button, not lost on the page
}

// Esc (app.js), wherever the focus is: closes the open menu and gives the focus back to its button; true when one closed
export function closeOpenMenu() {
  for (const [menu, button] of buttons) {
    if (menu.hidden) continue;
    closeMenu(menu);
    button.focus();
    return true;
  }
  return false;
}

function openMenu(menu) {
  for (const other of buttons.keys()) {
    if (other !== menu && !other.hidden) closeMenu(other);
  }
  menu.hidden = false;
  buttons.get(menu).setAttribute("aria-expanded", "true");
  const marked = menu.querySelector('[aria-checked="true"]');
  // no menu item (the map views are gone while an area is open): the first control that shows, such as a shop chip
  const firstControl = [...menu.querySelectorAll("button, input")].find((control) => !control.disabled && control.getClientRects().length);
  (marked ?? menuItems(menu)[0] ?? firstControl)?.focus();
}

function menuItems(menu) {
  return [...menu.querySelectorAll('[role^="menuitem"]')];
}

function handleMenuKey(event, menu) {
  const step = ARROW_STEPS[event.key];
  const items = menuItems(menu);
  const index = items.indexOf(document.activeElement);
  if (!step || index === -1) return;   // an arrow in the shop search box still moves its cursor
  event.preventDefault();
  items[(index + step + items.length) % items.length].focus();
}
