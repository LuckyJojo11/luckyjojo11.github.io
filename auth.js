(() => {
  const config = window.SUPABASE_CONFIG || {};
  const authRoot = document.querySelector("[data-auth-root]");
  const hasConfig = Boolean(config.url && config.anonKey);
  const editorEmails = Array.isArray(config.allowedEditorEmails)
    ? config.allowedEditorEmails.map((email) => String(email).trim().toLowerCase()).filter(Boolean)
    : [];

  let client = null;
  let session = null;
  let readyResolve;
  let modalMode = "login";

  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function isEditorAllowed(user) {
    if (!user) return false;
    if (editorEmails.length === 0) return true;
    return editorEmails.includes(String(user.email || "").toLowerCase());
  }

  const profileTable = () => config.profileTable || "profiles";

  const normalizeUsername = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const isEmail = (value) => /@/.test(String(value || ""));

  async function upsertProfile(user, details = {}) {
    if (!client || !user) return;

    const username = normalizeUsername(details.username || user.user_metadata?.username || "");
    if (!username) return;

    await client
      .from(profileTable())
      .upsert({
        id: user.id,
        username,
        email: user.email,
        avatar_url: details.avatarUrl || user.user_metadata?.avatar_url || "",
        updated_at: new Date().toISOString()
      }, { onConflict: "id" });
  }

  async function emailForIdentifier(identifier) {
    const value = String(identifier || "").trim();

    if (isEmail(value)) {
      return value;
    }

    const username = normalizeUsername(value);
    const { data, error } = await client
      .from(profileTable())
      .select("email")
      .eq("username", username)
      .maybeSingle();

    if (error || !data?.email) {
      throw new Error("No account found for this username.");
    }

    return data.email;
  }

  function ensureModal() {
    let modal = document.querySelector("#auth-modal");

    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "auth-modal-backdrop";
    modal.id = "auth-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <section class="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <h2 id="auth-title">Account</h2>
        <p id="auth-intro">Sign in or create an account with email and password.</p>
        <form class="auth-form" id="auth-form">
          <label id="auth-username-row">
            Username
            <input id="auth-username" type="text" autocomplete="username" maxlength="32" placeholder="Only needed for new accounts">
          </label>
          <label id="auth-avatar-row">
            Profile image URL
            <input id="auth-avatar" type="url" autocomplete="photo" placeholder="https://...">
          </label>
          <label id="auth-avatar-file-row">
            Upload profile image
            <input id="auth-avatar-file" type="file" accept="image/*">
          </label>
          <label id="auth-email-row">
            Username or Email
            <input id="auth-email" autocomplete="username" required>
          </label>
          <label id="auth-password-row">
            Password
            <input id="auth-password" type="password" autocomplete="current-password" minlength="6" required>
          </label>
          <p class="auth-status" id="auth-status"></p>
          <div class="auth-actions">
            <button class="auth-secondary" id="auth-cancel" type="button">Cancel</button>
            <button class="auth-secondary" id="auth-change-password" type="button">Change Password</button>
            <button class="auth-secondary" id="auth-signup" type="button">Create account</button>
            <button class="auth-button" id="auth-submit" type="submit">Sign in</button>
          </div>
        </form>
      </section>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#auth-cancel").addEventListener("click", closeModal);
    modal.querySelector("#auth-change-password").addEventListener("click", () => openModal("password"));
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });
    modal.querySelector("#auth-form").addEventListener("submit", (event) => {
      if (modalMode === "edit") {
        updateAccount(event);
      } else if (modalMode === "password") {
        updatePassword(event);
      } else {
        signIn(event);
      }
    });
    modal.querySelector("#auth-signup").addEventListener("click", signUp);

    return modal;
  }

  function openModal(mode = "login") {
    const modal = ensureModal();
    const user = session?.user;
    modalMode = mode;

    modal.querySelector("#auth-title").textContent = mode === "edit"
      ? "Edit Account"
      : mode === "password"
      ? "Change Password"
      : "Account";
    modal.querySelector("#auth-intro").textContent = mode === "edit"
      ? "Change the username shown on the site."
      : mode === "password"
      ? "Choose a new password for your account."
      : "Sign in or create an account with email and password.";
    modal.querySelector("#auth-username-row").hidden = mode === "password";
    modal.querySelector("#auth-avatar-row").hidden = mode === "password";
    modal.querySelector("#auth-avatar-file-row").hidden = mode !== "edit";
    modal.querySelector("#auth-email-row").hidden = mode !== "login";
    modal.querySelector("#auth-password-row").hidden = mode === "edit";
    modal.querySelector("#auth-signup").hidden = mode !== "login";
    modal.querySelector("#auth-change-password").hidden = mode !== "edit";
    modal.querySelector("#auth-submit").textContent = mode === "edit"
      ? "Save"
      : mode === "password"
      ? "Save Password"
      : "Sign in";
    modal.querySelector("#auth-username").required = mode === "edit";
    modal.querySelector("#auth-email").required = mode === "login";
    modal.querySelector("#auth-password").required = mode === "login" || mode === "password";
    modal.querySelector("#auth-username").value = mode === "edit" ? (user?.user_metadata?.username || "") : "";
    modal.querySelector("#auth-avatar").value = mode === "edit" ? (user?.user_metadata?.avatar_url || "") : "";
    modal.querySelector("#auth-avatar-file").value = "";
    modal.querySelector("#auth-email").value = mode === "edit" ? (user?.email || "") : "";
    modal.querySelector("#auth-password").value = "";
    modal.querySelector("#auth-password").autocomplete = mode === "password" ? "new-password" : "current-password";
    modal.querySelector("#auth-password-row").firstChild.textContent = mode === "password" ? "New Password" : "Password";
    setAuthStatus("");

    modal.hidden = false;
    modal.querySelector(mode === "edit" ? "#auth-username" : mode === "password" ? "#auth-password" : "#auth-email").focus();
  }

  function closeModal() {
    const modal = document.querySelector("#auth-modal");
    if (modal) modal.hidden = true;
  }

  function setAuthStatus(message) {
    const status = document.querySelector("#auth-status");
    if (status) status.textContent = message;
  }

  function cleanFileName(value) {
    return String(value || "image")
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function uploadImage(file, folder) {
    if (!client || !session?.user || !file) {
      return "";
    }

    if (!file.type.startsWith("image/")) {
      throw new Error("Please choose an image file.");
    }

    const bucket = config.imageBucket || "site-images";
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

  function renderAuthRoot() {
    if (!authRoot) return;

    if (!hasConfig || !client) {
      authRoot.innerHTML = `<span class="auth-user">Supabase setup missing</span>`;
      return;
    }

    const user = session?.user;

    if (user) {
      const displayName = user.user_metadata?.username || user.email;
      const avatarUrl = user.user_metadata?.avatar_url || "";
      authRoot.innerHTML = `
        <div class="account-menu">
          <button class="account-trigger" type="button" data-auth-action="menu" title="${escapeHtml(user.email)}">
            ${avatarUrl ? `<img class="account-avatar" src="${escapeHtml(avatarUrl)}" alt="">` : `<span class="account-avatar account-avatar-fallback">${escapeHtml(displayName.slice(0, 1).toUpperCase())}</span>`}
            <span>${escapeHtml(displayName)}</span>
          </button>
          <div class="account-dropdown" hidden>
            <button type="button" data-auth-action="edit-account">Edit Account</button>
            <button type="button" data-auth-action="change-password">Change Password</button>
            <button type="button" data-auth-action="logout">Logout</button>
          </div>
        </div>
      `;
    } else {
      authRoot.innerHTML = `<a class="auth-button" href="/login/">Login</a>`;
    }
  }

  async function signIn(event) {
    event.preventDefault();
    if (!client) return;

    let error;

    try {
      const email = await emailForIdentifier(document.querySelector("#auth-email").value.trim());
      const password = document.querySelector("#auth-password").value;
      ({ error } = await client.auth.signInWithPassword({ email, password }));
    } catch (caught) {
      error = caught;
    }

    if (error) {
      setAuthStatus(error.message);
      return;
    }

    const { data } = await client.auth.getSession();
    session = data.session;
    await upsertProfile(session?.user);
    setAuthStatus("Signed in.");
    closeModal();
    if (location.pathname.includes("/editor/")) location.reload();
  }

  async function signUp() {
    if (!client) return;

    const username = document.querySelector("#auth-username").value.trim();
    let avatarUrl = document.querySelector("#auth-avatar").value.trim();
    const avatarFile = document.querySelector("#auth-avatar-file").files[0];
    const email = document.querySelector("#auth-email").value.trim();
    const password = document.querySelector("#auth-password").value;

    if (!username) {
      setAuthStatus("Please enter a username for new accounts.");
      return;
    }

    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: location.href,
        data: {
          username,
          avatar_url: avatarUrl
        }
      }
    });

    if (error) {
      setAuthStatus(error.message);
      return;
    }

    const { data } = await client.auth.getSession();
    if (data.session?.user) {
      await upsertProfile(data.session.user, { username, avatarUrl });
    }

    setAuthStatus("Account created. Check your email if confirmation is enabled.");
  }

  async function updateAccount(event) {
    event.preventDefault();
    if (!client) return;

    const username = document.querySelector("#auth-username").value.trim();
    let avatarUrl = document.querySelector("#auth-avatar").value.trim();
    const avatarFile = document.querySelector("#auth-avatar-file").files[0];

    if (!username) {
      setAuthStatus("Please enter a username.");
      return;
    }

    if (avatarFile) {
      try {
        setAuthStatus("Uploading profile image...");
        avatarUrl = await uploadImage(avatarFile, "avatars");
      } catch (error) {
        setAuthStatus(error.message);
        return;
      }
    }

    const { error } = await client.auth.updateUser({
      data: {
        username,
        avatar_url: avatarUrl
      }
    });

    if (error) {
      setAuthStatus(error.message);
      return;
    }

    const { data } = await client.auth.getSession();
    session = data.session;
    await upsertProfile(session?.user, { username, avatarUrl });
    renderAuthRoot();
    setAuthStatus("Account updated.");
    closeModal();
  }

  async function updatePassword(event) {
    event.preventDefault();
    if (!client) return;

    const password = document.querySelector("#auth-password").value;

    if (password.length < 6) {
      setAuthStatus("Password must have at least 6 characters.");
      return;
    }

    const { error } = await client.auth.updateUser({ password });

    if (error) {
      setAuthStatus(error.message);
      return;
    }

    setAuthStatus("Password updated.");
    closeModal();
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    if (location.pathname.includes("/editor/")) location.reload();
  }

  function showGate(protectedElement, title, message) {
    if (protectedElement) protectedElement.hidden = true;

    const parent = protectedElement?.parentElement || document.body;
    let gate = document.querySelector("#auth-gate");

    if (!gate) {
      gate = document.createElement("section");
      gate.className = "auth-gate";
      gate.id = "auth-gate";
      parent.prepend(gate);
    }

    gate.innerHTML = `
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <div class="auth-actions">
        <a class="auth-secondary" href="../index.html">Back to site</a>
        ${hasConfig ? `<a class="auth-button" href="../login/">Login</a>` : ""}
      </div>
    `;
  }

  async function requireEditorAccess({ protectedElement } = {}) {
    await ready;

    if (!hasConfig || !client) {
      showGate(
        protectedElement,
        "Supabase setup missing",
        "Enter your Supabase URL and anon key in supabase-config.js before using the editor login."
      );
      return false;
    }

    if (!session?.user) {
      showGate(protectedElement, "Login required", "Please sign in before opening the editor.");
      return false;
    }

    if (!isEditorAllowed(session.user)) {
      showGate(protectedElement, "No editor access", "This account is signed in, but it is not allowed to edit this site.");
      return false;
    }

    if (protectedElement) protectedElement.hidden = false;
    document.querySelector("#auth-gate")?.remove();
    return true;
  }

  authRoot?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-auth-action]")?.dataset.authAction;
    if (action === "menu") {
      const menu = event.target.closest(".account-menu");
      const dropdown = menu.querySelector(".account-dropdown");
      dropdown.hidden = !dropdown.hidden;
    }
    if (action === "edit-account") openModal("edit");
    if (action === "change-password") openModal("password");
    if (action === "logout") signOut();
  });

  async function initLoginPage() {
    const form = document.querySelector("[data-login-form]");
    if (!form) return;

    const status = document.querySelector("[data-auth-page-status]");
    await ready;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "Signing in...";

      try {
        const identifier = form.querySelector("[name='identifier']").value;
        const password = form.querySelector("[name='password']").value;
        const email = await emailForIdentifier(identifier);
        const { error } = await client.auth.signInWithPassword({ email, password });

        if (error) throw error;

        const { data } = await client.auth.getSession();
        session = data.session;
        await upsertProfile(session?.user);
        status.textContent = "Signed in.";
        window.location.href = "../";
      } catch (error) {
        status.textContent = error.message;
      }
    });
  }

  async function initSignUpPage() {
    const form = document.querySelector("[data-signup-form]");
    if (!form) return;

    const status = document.querySelector("[data-auth-page-status]");
    await ready;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "Creating account...";

      try {
        const username = normalizeUsername(form.querySelector("[name='username']").value);
        const email = form.querySelector("[name='email']").value.trim();
        const password = form.querySelector("[name='password']").value;
        let avatarUrl = form.querySelector("[name='avatar']").value.trim();

        if (!username) throw new Error("Please enter a username.");

        const { error } = await client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${location.origin}/login/`,
            data: { username, avatar_url: avatarUrl }
          }
        });

        if (error) throw error;

        const { data } = await client.auth.getSession();
        const avatarFile = form.querySelector("[name='avatarFile']").files[0];

        if (data.session?.user) {
          session = data.session;
          if (avatarFile) {
            status.textContent = "Uploading profile image...";
            avatarUrl = await uploadImage(avatarFile, "avatars");
            await client.auth.updateUser({ data: { username, avatar_url: avatarUrl } });
          }
          await upsertProfile(data.session.user, { username, avatarUrl });
        }

        status.textContent = "Account created. Check your email if confirmation is enabled.";
      } catch (error) {
        status.textContent = error.message;
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".account-menu")) {
      document.querySelectorAll(".account-dropdown").forEach((dropdown) => {
        dropdown.hidden = true;
      });
    }
  });

  async function init() {
    if (hasConfig && window.supabase?.createClient) {
      client = window.supabase.createClient(config.url, config.anonKey);
      const { data } = await client.auth.getSession();
      session = data.session;
      client.auth.onAuthStateChange((_event, newSession) => {
        session = newSession;
        renderAuthRoot();
      });
    }

    renderAuthRoot();
    readyResolve();
    initLoginPage();
    initSignUpPage();
  }

  window.siteAuth = {
    ready,
    getClient: () => client,
    getSession: () => session,
    requireEditorAccess,
    openModal
  };

  init();
})();
