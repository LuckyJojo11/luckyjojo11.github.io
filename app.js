const grid = document.querySelector("#button-grid");
const nav = document.querySelector("#mainnav");
const emptyState = document.querySelector("#empty-state");

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const cssUrl = (value) =>
  String(value || "icons/background-default.svg").replaceAll("\\", "\\\\").replaceAll('"', '\\"');

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} konnte nicht geladen werden.`);
  }
  return response.json();
}

function renderNav(items) {
  nav.innerHTML = "";

  items.forEach((item) => {
    const link = document.createElement("a");
    link.className = "nav-button";
    link.href = item.url || "#";
    link.textContent = item.title || "Link";
    nav.appendChild(link);
  });
}

function renderTiles(items) {
  grid.innerHTML = "";
  emptyState.hidden = items.length > 0;

  items.forEach((item) => {
    const link = document.createElement("a");
    link.className = "tile";
    link.href = item.url || "#";
    link.style.setProperty("--tile-bg", `url("${cssUrl(item.background)}")`);
    link.innerHTML = `
      <article class="tile-content">
        <img class="tile-icon" src="${escapeHtml(item.icon || "icons/icon-default.svg")}" alt="" width="72" height="72" loading="lazy">
        <h2>${escapeHtml(item.name || "Unbenannte Seite")}</h2>
        <p>${escapeHtml(item.description || "")}</p>
      </article>
    `;
    grid.appendChild(link);
  });
}

async function boot() {
  try {
    const [tiles, navItems] = await Promise.all([
      loadJson("buttons.json"),
      loadJson("nav.json")
    ]);

    renderTiles(Array.isArray(tiles) ? tiles : []);
    renderNav(Array.isArray(navItems) ? navItems : []);
  } catch (error) {
    grid.innerHTML = "";
    emptyState.hidden = false;
    emptyState.textContent = error.message;
  }
}

boot();
