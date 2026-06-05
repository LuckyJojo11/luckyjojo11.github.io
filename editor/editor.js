const visualEditor = document.querySelector("#visual-editor");
const rawEditor = document.querySelector("#json-editor");
const statusText = document.querySelector("#editor-status");
const fileInput = document.querySelector("#file-input");
const tabs = document.querySelectorAll(".tab-button");
const addButton = document.querySelector("#add-item");
const discardDraftButton = document.querySelector("#discard-draft");
const loadDatabaseButton = document.querySelector("#load-database");
const saveDatabaseButton = document.querySelector("#save-database");
const downloadButton = document.querySelector("#download-json");
const autosaveStatus = document.querySelector("#autosave-status");
const desktopPreview = document.querySelector("#desktop-preview");
const mobilePreview = document.querySelector("#mobile-preview");
const confirmModal = document.querySelector("#confirm-modal");
const confirmMessage = document.querySelector("#confirm-message");
const confirmDeleteButton = document.querySelector("#confirm-delete");
const cancelDeleteButton = document.querySelector("#cancel-delete");

const files = ["buttons.json", "tags.json", "nav.json"];
const storageKey = "linkRasterEditorDraft";
const supabaseConfig = window.SUPABASE_CONFIG || {};
const state = Object.fromEntries(files.map((file) => [file, []]));
let currentFile = "buttons.json";
let previewTimer = null;
let pendingDelete = null;

const setStatus = (message) => {
  statusText.textContent = message;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const csv = (value) => Array.isArray(value) ? value.join(", ") : "";
const fromCsv = (value) => String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
const titleText = (value, fallback) =>
  String(value || fallback)
    .replace(/\[\/?[a-z]+(?:=[^\]]+)?\]/gi, "")
    .replaceAll("\\\\", "\\")
    .replaceAll("\\", " ")
    .trim() || fallback;

async function loadJsonFile(fileName) {
  const response = await fetch(`../${fileName}?v=${Date.now()}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`${fileName} could not be loaded.`);
  }

  state[fileName] = await response.json();
}

async function loadAll() {
  try {
    await Promise.all(files.map(loadJsonFile));
    const restored = restoreDraft();
    render();
    saveDraft();
    refreshPreview();
    setStatus(restored ? "Autosaved draft restored." : "Files loaded.");
  } catch (error) {
    setStatus(error.message);
  }
}

function syncPreview() {
  rawEditor.value = JSON.stringify(state[currentFile], null, 2);
}

function saveDraft() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  autosaveStatus.textContent = `Saved automatically at ${new Date().toLocaleTimeString("de-DE")}.`;
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(storageKey) || "{}");
    let restored = false;

    files.forEach((file) => {
      if (Array.isArray(draft[file])) {
        state[file] = draft[file];
        restored = true;
      }
    });

    return restored;
  } catch {
    return false;
  }
}

function refreshPreview() {
  const stamp = Date.now();
  desktopPreview.src = `../index.html?preview=1&viewport=desktop&t=${stamp}`;
  mobilePreview.src = `../index.html?preview=1&viewport=mobile&t=${stamp}`;
}

function schedulePreviewRefresh() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(refreshPreview, 350);
}

function persistChanges() {
  saveDraft();
  schedulePreviewRefresh();
}

function cleanFileName(value) {
  return String(value || "image")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uploadEditorImage(file, folder) {
  const client = await getDatabaseClient();

  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const session = window.siteAuth.getSession();
  const bucket = supabaseConfig.imageBucket || "site-images";
  const path = `${folder}/${session.user.id}/${Date.now()}-${cleanFileName(file.name)}`;
  const { error } = await client.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });

  if (error) {
    throw error;
  }

  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function databaseSettings() {
  return {
    table: supabaseConfig.contentTable || "site_content",
    key: supabaseConfig.contentKey || "main"
  };
}

async function getDatabaseClient() {
  if (!window.siteAuth) {
    throw new Error("Auth is not ready.");
  }

  await window.siteAuth.ready;
  const client = window.siteAuth.getClient();
  const session = window.siteAuth.getSession();

  if (!client || !session?.user) {
    throw new Error("Please sign in before using the database.");
  }

  return client;
}

async function saveToDatabase() {
  try {
    const client = await getDatabaseClient();
    const { table, key } = databaseSettings();
    const { error } = await client
      .from(table)
      .upsert({
        id: key,
        content: removeEmptyValues(state),
        updated_at: new Date().toISOString()
      }, { onConflict: "id" });

    if (error) throw error;

    setStatus("Saved to Supabase database.");
  } catch (error) {
    setStatus(`Database save failed: ${error.message}`);
  }
}

async function loadFromDatabase() {
  try {
    const client = await getDatabaseClient();
    const { table, key } = databaseSettings();
    const { data, error } = await client
      .from(table)
      .select("content")
      .eq("id", key)
      .maybeSingle();

    if (error) throw error;
    if (!data?.content) throw new Error("No saved content found.");

    files.forEach((file) => {
      if (Array.isArray(data.content[file])) {
        state[file] = data.content[file];
      }
    });

    render();
    persistChanges();
    setStatus("Loaded from Supabase database.");
  } catch (error) {
    setStatus(`Database load failed: ${error.message}`);
  }
}

function deleteLabel(action, index, subindex) {
  if (action === "remove-button") {
    const project = state[currentFile][index];
    const button = project?.buttons?.[subindex];
    return `Delete button "${titleText(button?.text, `Button ${subindex + 1}`)}"?`;
  }

  if (currentFile === "buttons.json") {
    return `Delete project "${titleText(state[currentFile][index]?.name, `Project ${index + 1}`)}"?`;
  }

  if (currentFile === "tags.json") {
    return `Delete tag "${titleText(state[currentFile][index]?.id, `Tag ${index + 1}`)}"?`;
  }

  return `Delete top button "${titleText(state[currentFile][index]?.title, `Top Button ${index + 1}`)}"?`;
}

function openDeleteConfirm(action, index, subindex) {
  pendingDelete = {
    action,
    file: currentFile,
    index,
    subindex
  };
  confirmMessage.textContent = deleteLabel(action, index, subindex);
  confirmModal.hidden = false;
  confirmDeleteButton.focus();
}

function closeDeleteConfirm() {
  pendingDelete = null;
  confirmModal.hidden = true;
}

function applyPendingDelete() {
  if (!pendingDelete) return;

  const { action, file, index, subindex } = pendingDelete;

  if (action === "remove-button") {
    state[file][index]?.buttons?.splice(subindex, 1);
  } else {
    state[file].splice(index, 1);
  }

  closeDeleteConfirm();
  render();
  persistChanges();
}

function field(label, value, options = {}) {
  const type = options.type || "text";
  const extra = [
    `data-bind="${options.bind}"`,
    options.index !== undefined ? `data-index="${options.index}"` : "",
    options.subindex !== undefined ? `data-subindex="${options.subindex}"` : "",
    options.subtype ? `data-subtype="${options.subtype}"` : "",
    options.field ? `data-field="${options.field}"` : "",
    options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : ""
  ].filter(Boolean).join(" ");

  return `
    <div class="field${options.wide ? " wide" : ""}">
      <label>${escapeHtml(label)}</label>
      ${options.textarea
        ? `<textarea ${extra}>${escapeHtml(value)}</textarea>`
        : `<input type="${type}" value="${escapeHtml(value)}" ${extra}>`}
    </div>
  `;
}

function selectField(label, value, options) {
  const extra = [
    `data-bind="${options.bind}"`,
    options.index !== undefined ? `data-index="${options.index}"` : "",
    options.subindex !== undefined ? `data-subindex="${options.subindex}"` : "",
    options.field ? `data-field="${options.field}"` : ""
  ].filter(Boolean).join(" ");

  return `
    <div class="field">
      <label>${escapeHtml(label)}</label>
      <select ${extra}>
        ${options.choices.map((choice) => `<option value="${choice.value}"${String(value) === String(choice.value) ? " selected" : ""}>${choice.label}</option>`).join("")}
      </select>
    </div>
  `;
}

function section(title, content) {
  return `
    <section class="editor-section">
      <button class="section-button" type="button" data-action="toggle-section">
        <span>${escapeHtml(title)}</span>
        <span aria-hidden="true">+</span>
      </button>
      <div class="section-body">${content}</div>
    </section>
  `;
}

function projectCard(project, index) {
  const status = project.status || {};
  const buttons = Array.isArray(project.buttons) ? project.buttons : [];

  return `
    <article class="item-card">
      <div class="item-head">
        <h2 class="item-title">${escapeHtml(titleText(project.name, `Project ${index + 1}`))}</h2>
        <div class="item-tools">
          <button type="button" data-action="toggle-project">Collapse Project</button>
          <button class="danger" type="button" data-action="remove-item" data-index="${index}">Remove Project</button>
        </div>
      </div>

      <div class="project-body">
      ${section("Edit Icons, Name and Description", `
        <div class="field-grid">
        ${field("Name", project.name, { bind: "project", index, field: "name" })}
        ${field("URL", project.url, { bind: "project", index, field: "url" })}
        ${field("Icon", project.icon, { bind: "project", index, field: "icon" })}
        ${imageUploadField("Upload Icon", index, "icon")}
        ${field("Background", project.background, { bind: "project", index, field: "background" })}
        ${imageUploadField("Upload Background", index, "background")}
        ${field("Description", project.description, { bind: "project", index, field: "description", textarea: true, wide: true })}
        </div>
      `)}

      ${section("Edit Tags and Badges", `
        <div class="field-grid">
        ${field("Filter Tags", csv(project.tags), { bind: "project-csv", index, field: "tags", placeholder: "minecraft, modding" })}
        ${field("Badges", csv(project.badges), { bind: "project-csv", index, field: "badges", placeholder: "collab" })}
        ${selectField("Kachel Visibility", project.releaseVisibility ?? 0, {
          bind: "project-number",
          index,
          field: "releaseVisibility",
          choices: tileVisibilityChoices()
        })}
        </div>
      `)}

      ${section("Edit Release", `
        <div class="field-grid">
        ${field("Version", status.version, { bind: "status", index, field: "version" })}
        ${field("Release Date", status.releaseDate, { bind: "status", index, field: "releaseDate", placeholder: "2026-06-10T18:00:00+02:00" })}
        ${selectField("Mode", status.mode ?? 0, {
          bind: "status-number",
          index,
          field: "mode",
          choices: [
            { value: 0, label: "0 Dynamic" },
            { value: 1, label: "1 Released" },
            { value: 2, label: "2 Scheduled" },
            { value: 3, label: "3 Work in Progress" }
          ]
        })}
        ${selectField("Hide Release Label", status.hidden ? "true" : "false", {
          bind: "status-bool",
          index,
          field: "hidden",
          choices: [
            { value: "false", label: "Visible" },
            { value: "true", label: "Hidden" }
          ]
        })}
        </div>
      `)}

      ${section("Edit Buttons", `
        <div class="mini-list">
          <button type="button" data-action="add-button" data-index="${index}">Add Button</button>
        </div>
        ${buttons.map((button, buttonIndex) => buttonCard(button, index, buttonIndex)).join("")}
      `)}
      </div>
    </article>
  `;
}

function buttonCard(button, index, buttonIndex) {
  return `
    <div class="sub-card">
      <div class="item-head">
        <h4 class="item-title">${escapeHtml(button.text || `Button ${buttonIndex + 1}`)}</h4>
        <button class="danger" type="button" data-action="remove-button" data-index="${index}" data-subindex="${buttonIndex}">Remove Button</button>
      </div>
      <div class="field-grid">
        ${field("Text", button.text, { bind: "button", index, subindex: buttonIndex, field: "text" })}
        ${field("URL", button.url, { bind: "button", index, subindex: buttonIndex, field: "url" })}
        ${field("Icon", button.icon, { bind: "button", index, subindex: buttonIndex, field: "icon" })}
        ${field("Background", button.background, { bind: "button", index, subindex: buttonIndex, field: "background" })}
        ${field("Color", button.color, { bind: "button", index, subindex: buttonIndex, field: "color" })}
        ${selectField("Visibility", button.releaseVisibility ?? 0, {
          bind: "button-number",
          index,
          subindex: buttonIndex,
          field: "releaseVisibility",
          choices: visibilityChoices()
        })}
      </div>
    </div>
  `;
}

function imageUploadField(label, index, fieldName) {
  return `
    <div class="field">
      <label>${escapeHtml(label)}</label>
      <input type="file" accept="image/*" data-action="upload-project-image" data-index="${index}" data-field="${fieldName}">
    </div>
  `;
}

function tagCard(tag, index) {
  return `
    <article class="item-card">
      <div class="item-head">
        <h2 class="item-title">${escapeHtml(tag.id || `tag-${index + 1}`)}</h2>
        <button class="danger" type="button" data-action="remove-item" data-index="${index}">Remove Tag</button>
      </div>
      ${section("Edit Tag", `
        <div class="field-grid">
        ${field("ID", tag.id, { bind: "tag", index, field: "id" })}
        ${field("Description", tag.description, { bind: "tag", index, field: "description" })}
        ${field("Countdown Text", tag.countdownDescription, { bind: "tag", index, field: "countdownDescription" })}
        ${field("Manual Scheduled Text", tag.manualDescription, { bind: "tag", index, field: "manualDescription" })}
        ${field("Icon", tag.icon, { bind: "tag", index, field: "icon" })}
        ${field("Background", tag.background, { bind: "tag", index, field: "background" })}
        ${field("Color", tag.color, { bind: "tag", index, field: "color" })}
        ${selectField("Filter", tag.filter === false ? "false" : "true", {
          bind: "tag-bool",
          index,
          field: "filter",
          choices: [
            { value: "true", label: "Filterable" },
            { value: "false", label: "Badge / Status only" }
          ]
        })}
        ${selectField("Release Visibility", tag.releaseVisibility ?? 0, {
          bind: "tag-number",
          index,
          field: "releaseVisibility",
          choices: visibilityChoices()
        })}
        </div>
      `)}
    </article>
  `;
}

function navCard(item, index) {
  return `
    <article class="item-card">
      <div class="item-head">
        <h2 class="item-title">${escapeHtml(item.title || `Top Button ${index + 1}`)}</h2>
        <button class="danger" type="button" data-action="remove-item" data-index="${index}">Remove Top Button</button>
      </div>
      ${section("Edit Top Button", `
        <div class="field-grid">
        ${field("Title", item.title, { bind: "nav", index, field: "title" })}
        ${field("URL", item.url, { bind: "nav", index, field: "url" })}
        </div>
      `)}
    </article>
  `;
}

function visibilityChoices() {
  return [
    { value: 0, label: "0 Always visible" },
    { value: 1, label: "1 Gray if unreleased" },
    { value: 2, label: "2 Hidden if unreleased" }
  ];
}

function tileVisibilityChoices() {
  return [
    { value: 0, label: "0 Always visible" },
    { value: 1, label: "1 Gray if unreleased" },
    { value: 2, label: "2 Colorful but not clickable if unreleased" }
  ];
}

function render() {
  const data = state[currentFile];
  addButton.textContent = currentFile === "buttons.json"
    ? "Add Project"
    : currentFile === "tags.json"
    ? "Add Tag"
    : "Add Top Button";

  visualEditor.innerHTML = Array.isArray(data) && data.length
    ? data.map((item, index) => {
      if (currentFile === "buttons.json") return projectCard(item, index);
      if (currentFile === "tags.json") return tagCard(item, index);
      return navCard(item, index);
    }).join("")
    : `<div class="item-card"><p class="status">No entries yet.</p></div>`;

  syncPreview();
}

function addItem() {
  if (currentFile === "buttons.json") {
    state[currentFile].push({
      name: "New Project",
      description: "",
      url: "",
      icon: "icons/icon-default.svg",
      background: "icons/background-default.svg",
      status: { version: "", releaseDate: "", mode: 3 },
      tags: [],
      badges: [],
      releaseVisibility: 0,
      buttons: []
    });
  } else if (currentFile === "tags.json") {
    state[currentFile].push({
      id: "new-tag",
      description: "New Tag",
      icon: "tag",
      background: "rgba(255, 255, 255, 0.14)",
      color: "white",
      filter: true,
      releaseVisibility: 0
    });
  } else {
    state[currentFile].push({ title: "New Button", url: "/" });
  }

  render();
  persistChanges();
}

function removeEmptyValues(value) {
  if (Array.isArray(value)) {
    return value.map(removeEmptyValues);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== "" && entry !== undefined)
        .map(([key, entry]) => [key, removeEmptyValues(entry)])
    );
  }

  return value;
}

function updateFromField(event) {
  const target = event.target;
  const bind = target.dataset.bind;

  if (!bind) return;

  const index = Number(target.dataset.index);
  const subindex = Number(target.dataset.subindex);
  const fieldName = target.dataset.field;
  const value = target.value;
  const item = state[currentFile][index];

  if (bind === "project") item[fieldName] = value;
  if (bind === "project-csv") item[fieldName] = fromCsv(value);
  if (bind === "project-number") item[fieldName] = Number(value);
  if (bind === "status") item.status = { ...(item.status || {}), [fieldName]: value };
  if (bind === "status-number") item.status = { ...(item.status || {}), [fieldName]: Number(value) };
  if (bind === "status-bool") item.status = { ...(item.status || {}), [fieldName]: value === "true" };
  if (bind === "button") item.buttons[subindex][fieldName] = value;
  if (bind === "button-number") item.buttons[subindex][fieldName] = Number(value);
  if (bind === "tag") item[fieldName] = value;
  if (bind === "tag-number") item[fieldName] = Number(value);
  if (bind === "tag-bool") item[fieldName] = value === "true";
  if (bind === "nav") item[fieldName] = value;

  syncPreview();
  persistChanges();
}

visualEditor.addEventListener("input", updateFromField);
visualEditor.addEventListener("change", updateFromField);

visualEditor.addEventListener("change", async (event) => {
  const target = event.target;

  if (target.dataset.action !== "upload-project-image") {
    return;
  }

  const [file] = target.files;
  if (!file) return;

  try {
    setStatus("Uploading image to Supabase...");
    const index = Number(target.dataset.index);
    const fieldName = target.dataset.field;
    const folder = fieldName === "background" ? "project-backgrounds" : "project-icons";
    state[currentFile][index][fieldName] = await uploadEditorImage(file, folder);
    render();
    persistChanges();
    setStatus("Image uploaded and inserted.");
  } catch (error) {
    setStatus(`Image upload failed: ${error.message}`);
  }
});

visualEditor.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const index = Number(button.dataset.index);
  const subindex = Number(button.dataset.subindex);
  const action = button.dataset.action;

  if (action === "toggle-section") {
    button.closest(".editor-section").classList.toggle("is-collapsed");
    return;
  }

  if (action === "toggle-project") {
    const card = button.closest(".item-card");
    const collapsed = card.classList.toggle("is-project-collapsed");
    button.textContent = collapsed ? "Expand Project" : "Collapse Project";
    return;
  }

  if (action === "remove-item" || action === "remove-button") {
    openDeleteConfirm(action, index, subindex);
    return;
  }

  if (action === "add-button") {
    state[currentFile][index].buttons = state[currentFile][index].buttons || [];
    state[currentFile][index].buttons.push({
      icon: "external-link",
      background: "rgba(105, 167, 207, 0.24)",
      color: "blue",
      text: "Open",
      url: "",
      releaseVisibility: 0
    });
  }

  render();
  persistChanges();
});

confirmDeleteButton.addEventListener("click", applyPendingDelete);
cancelDeleteButton.addEventListener("click", closeDeleteConfirm);

confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal) {
    closeDeleteConfirm();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmModal.hidden) {
    closeDeleteConfirm();
  }
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    currentFile = tab.dataset.file;
    tabs.forEach((button) => button.classList.toggle("is-active", button === tab));
    render();
    setStatus(`${currentFile} selected.`);
  });
});

addButton.addEventListener("click", addItem);

discardDraftButton.addEventListener("click", async () => {
  localStorage.removeItem(storageKey);
  await loadAll();
  setStatus("Files reloaded. Autosaved draft replaced.");
});

saveDatabaseButton.addEventListener("click", saveToDatabase);
loadDatabaseButton.addEventListener("click", loadFromDatabase);

downloadButton.addEventListener("click", () => {
  const cleaned = removeEmptyValues(state[currentFile]);
  const blob = new Blob([JSON.stringify(cleaned, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = currentFile;
  link.click();
  URL.revokeObjectURL(url);
  setStatus(`${currentFile} downloaded.`);
});

fileInput.addEventListener("change", async () => {
  const [file] = fileInput.files;
  if (!file) return;

  try {
    state[currentFile] = JSON.parse(await file.text());
    render();
    persistChanges();
    setStatus(`${file.name} imported into ${currentFile}.`);
  } catch (error) {
    setStatus(`Invalid JSON: ${error.message}`);
  }
});

rawEditor.addEventListener("input", () => {
  try {
    state[currentFile] = JSON.parse(rawEditor.value);
    render();
    persistChanges();
    setStatus(`${currentFile} updated from JSON preview.`);
  } catch {
    setStatus("JSON preview is not valid yet.");
  }
});

async function startEditor() {
  if (window.siteAuth) {
    const allowed = await window.siteAuth.requireEditorAccess({
      protectedElement: document.querySelector(".editor-panel")
    });

    if (!allowed) return;
  }

  loadAll();
}

startEditor();
