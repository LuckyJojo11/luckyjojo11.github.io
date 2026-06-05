const grid = document.querySelector("#button-grid");
const nav = document.querySelector("#mainnav");
const emptyState = document.querySelector("#empty-state");
const activeFilters = document.querySelector("#active-filters");
const projectSearch = document.querySelector("#project-search");
const previewStorageKey = "linkRasterEditorDraft";
const supabaseConfig = window.SUPABASE_CONFIG || {};
let allTiles = [];
let tagRegistry = new Map();
let selectedTags = new Set();
let searchQuery = "";
let statusTimer = null;
let contentData = null;
let isEditorPreview = false;

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const renderPlainText = (value) => {
  const source = String(value ?? "");
  let output = "";

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (character === "\\") {
      if (source[index + 1] === "\\") {
        output += "\\";
        index += 1;
      } else {
        output += "<br>";
      }
    } else {
      output += escapeHtml(character);
    }
  }

  return output;
};

const textColors = {
  blue: "#69a7cf",
  cyan: "#67e8f9",
  green: "#5cd6a8",
  yellow: "#ffd166",
  orange: "#ff9f43",
  red: "#ff6b6b",
  pink: "#ff8cc6",
  purple: "#b794f4",
  white: "#ffffff",
  muted: "#a8b7c4"
};

const fontFamilies = {
  sans: '"Segoe UI", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Cascadia Code", Consolas, monospace',
  cursive: '"Comic Sans MS", cursive',
  fantasy: 'Impact, fantasy',
  system: 'system-ui, sans-serif'
};

const allowedColor = (value) => {
  const color = String(value || "").trim().toLowerCase();

  if (textColors[color]) {
    return textColors[color];
  }

  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color)) {
    return color;
  }

  return "";
};

const allowedSize = (value) => {
  const size = String(value || "").trim().toLowerCase();
  const match = size.match(/^(\d{1,2}(?:\.\d{1,2})?)(px|rem|em|%)$/);

  if (!match) {
    return "";
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit === "px" && amount >= 10 && amount <= 48) {
    return size;
  }

  if ((unit === "rem" || unit === "em") && amount >= 0.65 && amount <= 3) {
    return size;
  }

  if (unit === "%" && amount >= 65 && amount <= 300) {
    return size;
  }

  return "";
};

const allowedFont = (value) => {
  const font = String(value || "").trim().toLowerCase();
  return fontFamilies[font] || "";
};

const allowedHref = (value) => {
  const href = String(value || "").trim();

  if (/^(https?:|mailto:)/i.test(href)) {
    return href;
  }

  if (/^[./#?]?[a-z0-9/_#?.=&%+-]+$/i.test(href)) {
    return href;
  }

  return "";
};

const formatTag = (name, argument, content) => {
  const tag = String(name || "").toLowerCase();
  const value = String(argument || "");

  if (tag === "b" || tag === "bold" || tag === "strong") {
    return `<strong>${content}</strong>`;
  }

  if (tag === "i" || tag === "italic" || tag === "em") {
    return `<em>${content}</em>`;
  }

  if (tag === "u" || tag === "underline") {
    return `<span class="text-underline">${content}</span>`;
  }

  if (tag === "s" || tag === "strike" || tag === "strikethrough") {
    return `<s>${content}</s>`;
  }

  if (tag === "color") {
    const color = allowedColor(value);
    return color ? `<span class="text-color" style="--text-color: ${color}">${content}</span>` : content;
  }

  if (textColors[tag]) {
    return `<span class="text-color" style="--text-color: ${textColors[tag]}">${content}</span>`;
  }

  if (tag === "size") {
    const size = allowedSize(value);
    return size ? `<span class="text-size" style="--text-size: ${size}">${content}</span>` : content;
  }

  if (tag === "font") {
    const font = allowedFont(value);
    return font ? `<span class="text-font" style="--text-font: ${font}">${content}</span>` : content;
  }

  if (tag === "link" || tag === "url") {
    const href = allowedHref(value);
    return href ? `<a class="text-link" href="${escapeHtml(href)}">${content}</a>` : content;
  }

  return content;
};

const parseFormatTag = (tag) => {
  const trimmed = String(tag || "").trim();
  const match = trimmed.match(/^([a-z]+)(?:=([^\]]+))?$/);

  if (!match) {
    return null;
  }

  return {
    name: match[1].toLowerCase(),
    argument: match[2] || ""
  };
};

const closeTagMatches = (openTag, closeName) => {
  const opener = openTag.name;
  const closer = String(closeName || "").trim().toLowerCase();

  if (opener === closer) {
    return true;
  }

  if ((opener === "bold" || opener === "strong") && closer === "b") {
    return true;
  }

  if ((opener === "italic" || opener === "em") && closer === "i") {
    return true;
  }

  if (opener === "underline" && closer === "u") {
    return true;
  }

  if ((opener === "strike" || opener === "strikethrough") && closer === "s") {
    return true;
  }

  return false;
};

const renderFormattedText = (value) => {
  const source = String(value ?? "");
  const tokenPattern = /\[\/?[a-z]+(?:=[^\]]+)?\]/g;
  const stack = [{ tag: null, content: "" }];
  let cursor = 0;
  let match;

  while ((match = tokenPattern.exec(source)) !== null) {
    stack[stack.length - 1].content += renderPlainText(source.slice(cursor, match.index));

    const token = match[0].slice(1, -1);

    if (token.startsWith("/")) {
      const closeName = token.slice(1);
      const open = stack[stack.length - 1].tag;

      if (open && closeTagMatches(open, closeName)) {
        const current = stack.pop();
        stack[stack.length - 1].content += formatTag(open.name, open.argument, current.content);
      } else {
        stack[stack.length - 1].content += renderPlainText(match[0]);
      }
    } else {
      const openTag = parseFormatTag(token);

      if (openTag) {
        stack.push({ tag: openTag, content: "" });
      } else {
        stack[stack.length - 1].content += renderPlainText(match[0]);
      }
    }

    cursor = match.index + match[0].length;
  }

  stack[stack.length - 1].content += renderPlainText(source.slice(cursor));

  while (stack.length > 1) {
    const current = stack.pop();
    stack[stack.length - 1].content += escapeHtml(`[${current.tag.name}${current.tag.argument ? `=${current.tag.argument}` : ""}]`) + current.content;
  }

  return stack[0].content;
};

const plainSearchText = (value) =>
  String(value ?? "")
    .replace(/\[\/?[a-z]+(?:=[^\]]+)?\]/g, "")
    .replaceAll("\\", " ")
    .toLowerCase();

const cssUrl = (value) =>
  String(value || "icons/background-default.svg").replaceAll("\\", "\\\\").replaceAll('"', '\\"');

const parseReleaseDate = (value) => {
  const raw = String(value || "").trim();

  if (!raw) {
    return null;
  }

  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatReleaseDate = (date) =>
  date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

const formatCountdown = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
};

function projectStatus(status = {}) {
  const version = String(status.version || "").trim();
  const releaseDate = parseReleaseDate(status.releaseDate);
  const mode = Number(status.mode || 0);

  if (mode === 1) {
    return {
      tone: "released",
      date: releaseDate ? formatReleaseDate(releaseDate) : "",
      countdown: "",
      version: version || "released",
      manual: true,
      liveCountdown: false
    };
  }

  if (mode === 2) {
    return {
      tone: "scheduled",
      date: "",
      countdown: "",
      version,
      manual: true,
      liveCountdown: false
    };
  }

  if (mode === 3) {
    return {
      tone: "wip",
      date: "",
      countdown: "",
      version,
      manual: true,
      liveCountdown: false
    };
  }

  if (!releaseDate) {
    return {
      tone: "wip",
      date: "",
      countdown: "",
      version,
      manual: false,
      liveCountdown: false
    };
  }

  const now = new Date();
  const diff = releaseDate.getTime() - now.getTime();

  if (diff <= 0) {
    return {
      tone: "released",
      date: formatReleaseDate(releaseDate),
      countdown: "",
      version: version || "released",
      manual: false,
      liveCountdown: false
    };
  }

  if (diff <= 48 * 60 * 60 * 1000) {
    return {
      tone: "scheduled",
      date: formatReleaseDate(releaseDate),
      countdown: formatCountdown(diff),
      version,
      manual: false,
      liveCountdown: true
    };
  }

  return {
    tone: "scheduled",
    date: formatReleaseDate(releaseDate),
    countdown: "",
    version,
    manual: false,
    liveCountdown: false
  };
}

const statusTagId = (status = {}, tone) => {
  const styles = status.styles || {};
  return styles[tone] || `status-${tone}`;
};

const fallbackStatusTag = (tone) => {
  const fallbacks = {
    wip: {
      id: "status-wip",
      description: "Work in Progress",
      icon: "wrench",
      background: "rgba(220, 68, 68, 0.78)",
      color: "white"
    },
    scheduled: {
      id: "status-scheduled",
      description: "Release on {date}",
      countdownDescription: "{countdown}",
      icon: "calendar-clock",
      background: "rgba(255, 209, 102, 0.86)",
      color: "#1d1603"
    },
    released: {
      id: "status-released",
      description: "Version {version}",
      icon: "badge-check",
      background: "rgba(51, 168, 111, 0.78)",
      color: "white"
    }
  };

  return fallbacks[tone] || fallbacks.wip;
};

const statusText = (tag, state) => {
  const template = state.manual && state.tone === "scheduled"
    ? (tag.manualDescription || "Scheduled")
    : state.liveCountdown
    ? (tag.countdownDescription || tag.description || "{countdown}")
    : (tag.description || "");

  return template
    .replaceAll("{version}", state.version)
    .replaceAll("{date}", state.date)
    .replaceAll("{countdown}", state.countdown);
};

function renderStatusLabel(status) {
  if (status?.hidden) {
    return "";
  }

  const state = projectStatus(status);
  const tag = tagRegistry.get(statusTagId(status, state.tone)) || fallbackStatusTag(state.tone);
  const text = statusText(tag, state);

  return `
    <div class="tile-status" style="${tagStyle(tag)}" data-live-countdown="${state.liveCountdown}" data-status='${escapeHtml(JSON.stringify(status || {}))}'>
      ${tagIcon(tag.icon, tagColor(tag.color))}
      <span class="tile-status-text">${renderFormattedText(text)}</span>
    </div>
  `;
}

const releaseVisibility = (item) => Number(item?.releaseVisibility || 0);

const isElementHiddenForRelease = (item, isReleased) =>
  !isReleased && releaseVisibility(item) === 2;

const isElementMutedForRelease = (item, isReleased) =>
  !isReleased && releaseVisibility(item) === 1;

const isTileDisabledForRelease = (item, isReleased) =>
  !isReleased && (releaseVisibility(item) === 1 || releaseVisibility(item) === 2);

const renderTileMainLink = (item, isReleased) => {
  const disabled = isTileDisabledForRelease(item, isReleased);
  const href = disabled ? "" : ` href="${escapeHtml(item.url || "#")}"`;

  return `<a class="tile-main"${href} aria-label="${escapeHtml(item.name || "Unbenannte Seite")}" aria-disabled="${disabled}"></a>`;
};

function renderBadgeLabels(badgeIds = [], isReleased = false) {
  const badges = Array.isArray(badgeIds)
    ? badgeIds
      .map((id) => tagRegistry.get(String(id)))
      .filter((tag) => tag && tag.filter === false && !isElementHiddenForRelease(tag, isReleased))
    : [];

  return badges.map((tag) => `
    <div class="tile-status-badge${isElementMutedForRelease(tag, isReleased) ? " is-muted" : ""}" style="${tagStyle(tag)}">
      ${tagIcon(tag.icon, tagColor(tag.color))}
      <span>${renderFormattedText(tagLabel(tag))}</span>
    </div>
  `).join("");
}

function renderStatusCluster(item) {
  const isReleased = projectStatus(item.status).tone === "released";
  const badges = renderBadgeLabels(item.badges, isReleased);
  const status = renderStatusLabel(item.status);

  if (!badges && !status) {
    return "";
  }

  return `
    <div class="tile-status-cluster">
      ${badges}
      ${status}
    </div>
  `;
}

const tagIcons = {
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  gamepad: '<path d="M6 12h4"/><path d="M8 10v4"/><path d="M15 13h.01"/><path d="M18 11h.01"/><rect width="20" height="12" x="2" y="6" rx="6"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 4-2 4s2.74-.5 4-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22 22 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.83 8.83a2 2 0 0 0 2.83 0l7.17-7.17a2 2 0 0 0 0-2.83z"/><path d="M7 7h.01"/>'
};

const iconId = (value) => {
  const id = String(value || "tag").trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(id) ? id : "tag";
};

const libraryIconUrl = (name, color) =>
  `https://api.iconify.design/lucide/${iconId(name)}.svg?color=${encodeURIComponent(color)}`;

const tagIcon = (name, color = "rgba(255, 255, 255, 0.92)") => {
  const id = iconId(name);

  if (tagIcons[id]) {
    return `
      <svg class="tile-tag-icon" viewBox="0 0 24 24" aria-hidden="true">
        ${tagIcons[id]}
      </svg>
    `;
  }

  return `
    <img
      class="tile-tag-icon tile-tag-icon-image"
      src="${libraryIconUrl(id, color)}"
      alt=""
      loading="lazy"
      onerror="this.onerror=null; this.src='${libraryIconUrl("tag", color)}';"
    >
  `;
};

const tagBackground = (value) =>
  String(value || "rgba(255, 255, 255, 0.14)").replaceAll("\\", "\\\\").replaceAll('"', '\\"');

const tagColor = (value) => allowedColor(value) || "rgba(255, 255, 255, 0.92)";

const tagStyle = (tag) =>
  `--tag-bg: ${tagBackground(tag.background)}; --tag-color: ${tagColor(tag.color)}`;

function tagLabel(tag) {
  return tag?.description || tag?.id || "Tag";
}

function renderTagButton(tag, options = {}) {
  const active = options.active ? " is-active" : "";
  const muted = options.muted ? " is-muted" : "";
  const badge = options.disabled ? " is-badge" : "";
  const removeLabel = options.active ? " entfernen" : "";
  const disabled = options.disabled ? " disabled" : "";

  return `
    <button class="tile-tag tag-filter${active}${muted}${badge}" type="button" data-tag-id="${escapeHtml(tag.id)}" style="${tagStyle(tag)}" title="${escapeHtml(tagLabel(tag))}${removeLabel}"${disabled}>
      ${tagIcon(tag.icon, tagColor(tag.color))}
      <span>${renderFormattedText(tagLabel(tag))}</span>
    </button>
  `;
}

function renderTags(tagIds, isReleased = false) {
  const tags = Array.isArray(tagIds)
    ? tagIds
      .map((id) => tagRegistry.get(String(id)))
      .filter((tag) => tag && tag.filter !== false && !isElementHiddenForRelease(tag, isReleased))
    : [];

  if (tags.length === 0) {
    return "";
  }

  return `
    <ul class="tile-tags" aria-label="Tags">
      ${tags.map((tag) => `<li>${renderTagButton(tag, { muted: isElementMutedForRelease(tag, isReleased) })}</li>`).join("")}
    </ul>
  `;
}

function renderActiveFilters() {
  const tags = [...tagRegistry.values()].filter((tag) => tag.filter !== false);
  const hasSelection = selectedTags.size > 0;

  activeFilters.hidden = tags.length === 0;
  activeFilters.innerHTML = tags.map((tag) => renderTagButton(tag, {
    active: selectedTags.has(String(tag.id)),
    muted: hasSelection && !selectedTags.has(String(tag.id))
  })).join("");
}

function renderActionButtons(buttons, isReleased = false) {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    return "";
  }

  const visibleButtons = buttons.filter((button) => !isElementHiddenForRelease(button, isReleased));

  if (visibleButtons.length === 0) {
    return "";
  }

  return `
    <div class="tile-actions" aria-label="Kachel-Links">
      ${visibleButtons.map((button) => `
        <span class="tile-action${isElementMutedForRelease(button, isReleased) ? " is-muted" : ""}" role="link" tabindex="${isElementMutedForRelease(button, isReleased) ? "-1" : "0"}" data-url="${isElementMutedForRelease(button, isReleased) ? "" : escapeHtml(button.url || "#")}" aria-disabled="${isElementMutedForRelease(button, isReleased)}" style="--tag-bg: ${tagBackground(button.background)}; --tag-color: ${tagColor(button.color)}" aria-label="${escapeHtml(button.text || "Link")}">
          ${tagIcon(button.icon, tagColor(button.color))}
          <span>${renderFormattedText(button.text || "Link")}</span>
        </span>
      `).join("")}
    </div>
  `;
}

grid.addEventListener("click", (event) => {
  if (event.target.closest(".text-link")) {
    return;
  }

  const filterButton = event.target.closest(".tag-filter");

  if (filterButton?.dataset.tagId) {
    event.preventDefault();
    if (selectedTags.has(filterButton.dataset.tagId)) {
      selectedTags.delete(filterButton.dataset.tagId);
    } else {
      selectedTags.add(filterButton.dataset.tagId);
    }
    renderTiles(allTiles);
    return;
  }

  const action = event.target.closest(".tile-action");

  if (action?.dataset.url) {
    window.location.href = action.dataset.url;
  }
});

activeFilters.addEventListener("click", (event) => {
  const filterButton = event.target.closest(".tag-filter");

  if (!filterButton?.dataset.tagId) {
    return;
  }

  if (selectedTags.has(filterButton.dataset.tagId)) {
    selectedTags.delete(filterButton.dataset.tagId);
  } else {
    selectedTags.add(filterButton.dataset.tagId);
  }
  renderTiles(allTiles);
});

projectSearch.addEventListener("input", () => {
  searchQuery = projectSearch.value.trim().toLowerCase();
  renderTiles(allTiles);
});

grid.addEventListener("keydown", (event) => {
  const action = event.target.closest(".tile-action");

  if (!action?.dataset.url || (event.key !== "Enter" && event.key !== " ")) {
    return;
  }

  event.preventDefault();
  window.location.href = action.dataset.url;
});

async function loadJson(path) {
  if (contentData && Array.isArray(contentData[path])) {
    return contentData[path];
  }

  const url = `${path}?v=${Date.now()}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} konnte nicht geladen werden.`);
  }
  return response.json();
}

function loadEditorPreviewData() {
  const params = new URLSearchParams(window.location.search);
  isEditorPreview = params.get("preview") === "1";

  if (!isEditorPreview) {
    return null;
  }

  try {
    const stored = JSON.parse(localStorage.getItem(previewStorageKey) || "{}");
    return stored && typeof stored === "object" ? stored : null;
  } catch {
    return null;
  }
}

async function loadDatabaseContent() {
  if (isEditorPreview || !window.siteAuth) {
    return null;
  }

  try {
    await window.siteAuth.ready;
    const client = window.siteAuth.getClient();
    const table = supabaseConfig.contentTable || "site_content";
    const key = supabaseConfig.contentKey || "main";

    if (!client) {
      return null;
    }

    const { data, error } = await client
      .from(table)
      .select("content")
      .eq("id", key)
      .maybeSingle();

    if (error || !data?.content || typeof data.content !== "object") {
      return null;
    }

    return data.content;
  } catch {
    return null;
  }
}

function isEditorHref(href) {
  return /(^|\/)editor\/?($|[?#])/i.test(href);
}

function canShowEditorLink() {
  const allowedEmails = Array.isArray(supabaseConfig.allowedEditorEmails)
    ? supabaseConfig.allowedEditorEmails.map((email) => String(email).trim().toLowerCase()).filter(Boolean)
    : [];
  const userEmail = window.siteAuth?.getSession()?.user?.email?.toLowerCase() || "";

  return Boolean(userEmail && allowedEmails.includes(userEmail));
}

function renderNav(items) {
  nav.innerHTML = "";

  items.forEach((item) => {
    const href = String(item.url || "#");

    if (isEditorHref(href) && (isEditorPreview || !canShowEditorLink())) {
      return;
    }

    const link = document.createElement("a");
    link.className = "nav-button";
    link.href = href;
    link.textContent = item.title || "Link";
    nav.appendChild(link);
  });
}

function renderTiles(items) {
  grid.innerHTML = "";
  renderActiveFilters();

  const visibleItems = items.filter((item) => {
    const matchesTags = selectedTags.size === 0
      ? true
      : (() => {
      const itemTags = Array.isArray(item.tags) ? item.tags.map(String) : [];
      return itemTags.some((id) => selectedTags.has(id));
      })();

    if (!matchesTags) {
      return false;
    }

    if (!searchQuery) {
      return true;
    }

    const itemTags = Array.isArray(item.tags)
      ? item.tags.map((id) => tagRegistry.get(String(id))).filter(Boolean)
      : [];
    const searchable = [
      item.name,
      item.description,
      itemTags.map(tagLabel).join(" ")
    ].map(plainSearchText).join(" ");

    return searchable.includes(searchQuery);
  });

  emptyState.hidden = visibleItems.length > 0;
  emptyState.textContent = selectedTags.size > 0 || searchQuery ? "Keine passenden Projekte gefunden." : "It is quiet here. Too quiet.";

  visibleItems.forEach((item) => {
    const isReleased = projectStatus(item.status).tone === "released";
    const tileMuted = isElementMutedForRelease(item, isReleased);
    const tile = document.createElement("article");
    tile.className = `tile${tileMuted ? " is-muted" : ""}`;
    tile.style.setProperty("--tile-bg", `url("${cssUrl(item.background)}")`);
    tile.innerHTML = `
      ${renderTileMainLink(item, isReleased)}
      <div class="tile-content">
        <div>
          <img class="tile-icon" src="${escapeHtml(item.icon || "icons/icon-default.svg")}" alt="" width="72" height="72" loading="lazy">
          ${renderTags(item.tags, isReleased)}
        </div>
        <div>
          <h2>${renderFormattedText(item.name || "Unbenannte Seite")}</h2>
          <p>${renderFormattedText(item.description || "")}</p>
        </div>
      </div>
      ${renderStatusCluster(item)}
      ${renderActionButtons(item.buttons, isReleased)}
    `;
    grid.appendChild(tile);
  });

  updateStatusTimer();
}

function updateStatusTimer() {
  const needsTimer = allTiles.some((item) => projectStatus(item.status).liveCountdown);

  if (needsTimer && !statusTimer) {
    statusTimer = window.setInterval(updateLiveCountdowns, 1000);
  }

  if (!needsTimer && statusTimer) {
    window.clearInterval(statusTimer);
    statusTimer = null;
  }
}

function updateLiveCountdowns() {
  const liveLabels = document.querySelectorAll('.tile-status[data-live-countdown="true"]');

  liveLabels.forEach((label) => {
    try {
      const status = JSON.parse(label.dataset.status || "{}");
      const state = projectStatus(status);
      const tag = tagRegistry.get(statusTagId(status, state.tone)) || fallbackStatusTag(state.tone);
      const text = statusText(tag, state);
      const textNode = label.querySelector(".tile-status-text");

      if (textNode) {
        textNode.innerHTML = renderFormattedText(text);
      }
    } catch {
      // Ignore malformed embedded status data; the next full render will recover it.
    }
  });

  if (!allTiles.some((item) => projectStatus(item.status).liveCountdown)) {
    window.clearInterval(statusTimer);
    statusTimer = null;
  }
}

async function boot() {
  try {
    contentData = loadEditorPreviewData();
    contentData = contentData || await loadDatabaseContent();
    const [tiles, navItems, tags] = await Promise.all([
      loadJson("buttons.json"),
      loadJson("nav.json"),
      loadJson("tags.json")
    ]);

    allTiles = Array.isArray(tiles) ? tiles : [];
    tagRegistry = new Map(
      (Array.isArray(tags) ? tags : [])
        .filter((tag) => tag?.id)
        .map((tag) => [String(tag.id), tag])
    );

    renderTiles(allTiles);
    renderNav(Array.isArray(navItems) ? navItems : []);
  } catch (error) {
    grid.innerHTML = "";
    emptyState.hidden = false;
    emptyState.textContent = error.message;
  }
}

boot();
