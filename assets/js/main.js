// Global state
let allProducts = [];
let allDistributors = [];
let filteredDistributors = [];
let distributorIndex = {};
let currentDistributorSelection = null;
let distributorAuthMode = "login";
let users = [];

const DEFAULT_USERS = [
  {
    id: "USR001",
    username: "admin",
    password: "walker33",
    fullName: "Administrator",
    email: "admin@dynapharm.com.na",
    phone: "061-300877",
    role: "admin",
    branch: "townshop",
    branches: ["townshop"]
  },
  {
    id: "USR1759829667953",
    username: "moses",
    password: "walker33",
    fullName: "MOSES MUKISA",
    email: "mosesmukisa1@gmail.com",
    phone: "0817317160",
    role: "consultant",
    branch: "townshop",
    branches: [
      "townshop",
      "khomasdal",
      "katima",
      "outapi",
      "ondangwa",
      "okongo",
      "okahao",
      "nkurenkuru",
      "swakopmund",
      "hochland-park",
      "rundu",
      "gobabis",
      "walvisbay",
      "eenhana",
      "otjiwarongo"
    ],
    createdAt: "2025-10-07T09:34:27.953Z"
  },
  {
    id: "USR1759829814781",
    username: "Geneva",
    password: "Pearl_11",
    fullName: "Jennifer Joseph",
    email: "shange1124@gmail.com",
    phone: "0852803618",
    role: "consultant",
    branch: "townshop",
    branches: [
      "townshop",
      "khomasdal",
      "katima",
      "outapi",
      "ondangwa",
      "okongo",
      "okahao",
      "nkurenkuru",
      "swakopmund",
      "hochland-park",
      "rundu",
      "gobabis",
      "walvisbay",
      "eenhana",
      "otjiwarongo"
    ],
    createdAt: "2025-10-07T09:36:54.781Z"
  },
  {
    id: "USR1759830625722",
    username: "NAEM",
    password: "PASSWORD",
    fullName: "NAEM HANGULA",
    email: "naemhangula4@gmail.com",
    phone: "0817499757",
    role: "dispenser",
    branch: "townshop",
    branches: ["townshop"],
    createdAt: "2025-10-07T09:50:25.722Z"
  },
  {
    id: "USR1759928153488",
    username: "GEINGOS",
    password: "ALBERTO99",
    fullName: "HILMA C",
    email: "geingoshilma@gmail",
    phone: "0814137106",
    role: "consultant",
    branch: "townshop",
    branches: [
      "townshop",
      "khomasdal",
      "katima",
      "outapi",
      "ondangwa",
      "okongo",
      "okahao",
      "nkurenkuru",
      "swakopmund",
      "hochland-park",
      "rundu",
      "gobabis",
      "walvisbay",
      "eenhana",
      "otjiwarongo"
    ],
    createdAt: "2025-10-08T12:55:53.488Z"
  }
];

function ensureDefaultUsersSeeded() {
  try {
    const existingRaw = localStorage.getItem("dyna_users");

    if (!existingRaw) {
      localStorage.setItem("dyna_users", JSON.stringify(DEFAULT_USERS));
      console.info("Seeded default Dynapharm users (fresh browser).");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(existingRaw);
    } catch (parseError) {
      console.warn("Failed to parse stored Dynapharm users, reseeding defaults.", parseError);
      localStorage.setItem("dyna_users", JSON.stringify(DEFAULT_USERS));
      return;
    }

    if (!Array.isArray(parsed)) {
      console.warn("Invalid Dynapharm users structure detected, reseeding defaults.");
      localStorage.setItem("dyna_users", JSON.stringify(DEFAULT_USERS));
      return;
    }

    const existingUsernames = new Set(parsed.map((user) => (user.username || "").toLowerCase()));
    let updated = false;

    DEFAULT_USERS.forEach((defaultUser) => {
      if (!existingUsernames.has(defaultUser.username.toLowerCase())) {
        parsed.push(defaultUser);
        existingUsernames.add(defaultUser.username.toLowerCase());
        updated = true;
      }
    });

    if (parsed.length === 0) {
      localStorage.setItem("dyna_users", JSON.stringify(DEFAULT_USERS));
      console.info("Seeded default Dynapharm users because none were found.");
    } else if (updated) {
      localStorage.setItem("dyna_users", JSON.stringify(parsed));
      console.info("Added missing default Dynapharm users to localStorage.");
    }
  } catch (error) {
    console.error("Error ensuring Dynapharm default users. Attempting to seed defaults.", error);
    try {
      localStorage.setItem("dyna_users", JSON.stringify(DEFAULT_USERS));
    } catch (storageError) {
      console.error("Failed to seed default Dynapharm users.", storageError);
    }
  }
}

ensureDefaultUsersSeeded();

let currentAccountUser = null;
const heroSection = document.querySelector(".hero");
const heroBadgeEl = document.getElementById("heroBadge");
const heroTitleHighlightEl = document.getElementById("heroTitleHighlight");
const heroSubtitleEl = document.getElementById("heroSubtitle");
const heroPrimaryButton = document.getElementById("heroPrimaryAction");
const heroSecondaryButton = document.getElementById("heroSecondaryAction");
const accountNavItem = document.getElementById("accountNavItem");
const accountInitialsEl = document.getElementById("accountInitials");
const accountNameEl = document.getElementById("accountName");
const accountMenu = document.getElementById("accountMenu");
const accountMenuInitials = document.getElementById("accountMenuInitials");
const accountMenuName = document.getElementById("accountMenuName");
const accountMenuRole = document.getElementById("accountMenuRole");
const accountMenuBranch = document.getElementById("accountMenuBranch");
const loginNavItem = document.getElementById("loginNavItem");
const toastEl = document.getElementById("globalToast");
const portalContentSection = document.getElementById("portalContentSection");
const portalContentFrame = document.getElementById("portalContentFrame");
const portalContentTitle = document.getElementById("portalContentTitle");
const portalContentSubtitle = document.getElementById("portalContentSubtitle");

const HERO_DEFAULTS = {
  badge: "🏥 Trusted Health Partner Since 2010",
  highlight: "Natural Solutions",
  subtitle:
    "Premium health products, expert consultations, and comprehensive wellness services designed to help you live your healthiest life.",
  primaryLabel: "🛒 Shop Products",
  secondaryLabel: "🏥 Book Consultation"
};

let toastTimeoutId = null;

const PORTAL_LABELS = {
  client: "Distributor",
  distributor: "Distributor",
  frontdesk: "Front Desk",
  consultant: "Consultant",
  sales_staff: "Consultant",
  dispenser: "Branch",
  branch_manager: "Branch",
  finance: "Finance",
  finance_manager: "Finance",
  hr: "HR",
  hr_portal: "HR",
  "hr-portal": "HR",
  hr_manager: "HR",
  hr_admin: "HR",
  mis: "MIS",
  gm: "GM",
  general_manager: "GM",
  director: "Director",
  stock: "Stock Management",
  stock_manager: "Stock Management",
  warehouse: "Stock Management",
  admin: "Admin",
  reports: "Reports",
  mlm: "MLM",
  lrp: "LRP"
};

let pendingPortalOverride = null;
const SESSION_STORAGE_KEY = "dyna_session_v1";
let lastActiveElement = null;

function loadLocalUsers() {
  try {
    const stored = localStorage.getItem("dyna_users");
    if (!stored) {
      users = [...DEFAULT_USERS];
      return users;
    }

    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      users = parsed;
      return parsed;
    }
  } catch (error) {
    console.warn("Failed to parse local Dynapharm users, using defaults.", error);
  }

  users = [...DEFAULT_USERS];
  return users;
}

function getInitials(name) {
  if (!name) return "DN";
  const cleaned = name.trim();
  if (!cleaned) return "DN";
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return (
    parts.map((part) => part.charAt(0).toUpperCase()).join("") || cleaned.charAt(0).toUpperCase()
  );
}

function toTitleCase(value) {
  if (!value) return "";
  return value
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function setHeroAction(button, label, handler) {
  if (!button) return;
  button.textContent = label;
  button.onclick = handler;
}

function renderHeroState(user) {
  if (!heroSection || !heroBadgeEl || !heroTitleHighlightEl || !heroSubtitleEl) return;

  if (user) {
    heroSection.setAttribute("data-auth-state", "signed-in");
    heroBadgeEl.textContent = "👋 Welcome back";
    heroTitleHighlightEl.textContent = user.fullName || user.username || "Dynapharm Team";
    const roleLabel = (user.role || "").toLowerCase();
    const friendlyRole = roleLabel ? toTitleCase(roleLabel) : "team member";
    heroSubtitleEl.textContent = `You’re signed in as ${friendlyRole}. Jump back into your portal or explore the latest wellness insights.`;
    setHeroAction(heroPrimaryButton, "🚀 Enter my portal", () => navigateToRolePortal());
    setHeroAction(heroSecondaryButton, "📊 View reports", () => {
      openTab("reports");
      document.getElementById("portalTabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  } else {
    heroSection.setAttribute("data-auth-state", "signed-out");
    heroBadgeEl.textContent = HERO_DEFAULTS.badge;
    heroTitleHighlightEl.textContent = HERO_DEFAULTS.highlight;
    heroSubtitleEl.textContent = HERO_DEFAULTS.subtitle;
    setHeroAction(heroPrimaryButton, HERO_DEFAULTS.primaryLabel, () => showDistributorTab("shop"));
    setHeroAction(heroSecondaryButton, HERO_DEFAULTS.secondaryLabel, () =>
      showDistributorTab("checkup")
    );
  }
}

function showToast(message, variant = "success") {
  if (!toastEl || !message) return;
  toastEl.textContent = message;
  toastEl.classList.remove("success", "error", "info");
  toastEl.classList.add(variant);
  toastEl.classList.add("show");

  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
  }

  toastTimeoutId = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 3200);
}

function getLoginTabForPortal(portalKey) {
  const normalized = (portalKey || "").toLowerCase();
  if (normalized === "admin") return "admin";
  if (["client", "distributor", "mlm", "lrp"].includes(normalized)) return "distributor";
  return "staff";
}

function activateModalTab(tabName) {
  const targetBtn = document.querySelector(`.modal-tab[data-modal-tab="${tabName}"]`);
  if (targetBtn) {
    switchModalTab(tabName, { target: targetBtn });
  } else {
    switchModalTab(tabName);
  }
}

function openDistributorLogin(portalOverride = "client") {
  if (currentAccountUser) {
    renderPortalForUser(currentAccountUser, { portalOverride });
    return;
  }
  pendingPortalOverride = portalOverride;
  openLoginModal();
  activateModalTab("distributor");
}

function resolvePortalLabel(key) {
  if (!key) return "Portal";
  const normalized = key.toLowerCase();
  if (PORTAL_LABELS[normalized]) return PORTAL_LABELS[normalized];
  return toTitleCase(normalized);
}

function normalizePortalUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      const sameOriginUrl = new URL(
        `${parsed.pathname}${parsed.search}${parsed.hash}`,
        window.location.origin
      );
      return sameOriginUrl.href;
    }
    return parsed.href;
  } catch (error) {
    console.warn("Unable to normalize portal URL, using original value.", error);
    return url;
  }
}

function renderPortalForUser(user, options = {}) {
  if (!user || !portalContentSection || !portalContentFrame) return;

  const portalKey = (options.portalOverride || user.role || "portal").toLowerCase();
  const portalLabel = resolvePortalLabel(portalKey);
  const rawPortalUrl = options.url || getRoleRedirect(user.role, options.portalOverride);
  const portalUrl = normalizePortalUrl(rawPortalUrl);

  if (portalUrl) {
    portalContentFrame.src = portalUrl;
  } else {
    portalContentFrame.src = "about:blank";
  }

  if (portalContentTitle) {
    portalContentTitle.textContent = `${portalLabel} Portal`;
  }

  if (portalContentSubtitle) {
    const name = user.fullName || user.username || portalLabel;
    portalContentSubtitle.textContent = `You’re viewing the ${portalLabel.toLowerCase()} workspace${name ? ` for ${name}` : ""}.`;
  }

  portalContentSection.style.display = "block";
  portalContentSection.classList.add("active", "highlight-section");
  setTimeout(() => portalContentSection.classList.remove("highlight-section"), 1200);
  portalContentSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearPortalContent() {
  if (!portalContentSection) return;
  portalContentSection.style.display = "none";
  portalContentSection.classList.remove("active");
  if (portalContentFrame) portalContentFrame.src = "about:blank";
  if (portalContentTitle) portalContentTitle.textContent = "Portal Access";
  if (portalContentSubtitle)
    portalContentSubtitle.textContent = "Sign in to load your workspace below.";
}

function closeAccountMenu() {
  accountMenu?.classList.remove("active");
}

function toggleAccountMenu(event) {
  event?.preventDefault();
  event?.stopPropagation();
  if (!accountMenu) return;
  if (accountMenu.classList.contains("active")) {
    accountMenu.classList.remove("active");
  } else {
    accountMenu.classList.add("active");
  }
}

function navigateToRolePortal() {
  if (!currentAccountUser) {
    openLoginModal();
    return;
  }

  closeAccountMenu();
  renderPortalForUser(currentAccountUser);
}

function findLocalUserByCredentials(username, password) {
  const localUsers = loadLocalUsers();
  return localUsers.find(
    (user) =>
      (user.username || "").toLowerCase() === username.toLowerCase() &&
      (user.password || "") === password
  );
}

async function authenticateViaApi(username, password) {
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ username, password })
    });

    if (response.ok) {
      const payload = await response.json().catch(() => null);
      if (payload?.success && payload.user) {
        return { success: true, user: payload.user };
      }
      return { success: false, message: "Unexpected authentication response." };
    }

    let message = "Unable to sign in. Please check your credentials.";
    try {
      const payload = await response.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch (parseError) {
      // ignore JSON parse errors
    }

    const result = { success: false, message, status: response.status };
    if (response.status >= 500) {
      result.networkError = true;
    }
    return result;
  } catch (error) {
    console.warn("Authentication service unreachable, falling back to local cache.", error);
    return {
      success: false,
      message: "Unable to reach authentication service. Please try again.",
      networkError: true
    };
  }
}

function normalizeUser(user) {
  if (!user) return null;

  const branches = Array.isArray(user.branches)
    ? user.branches
    : typeof user.branches === "string"
      ? (() => {
          try {
            return JSON.parse(user.branches || "[]");
          } catch {
            return [];
          }
        })()
      : [];

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName || user.full_name || user.name || user.username,
    email: user.email || null,
    phone: user.phone || null,
    role: user.role || "",
    branch: user.branch || null,
    branches
  };
}

function encodeSessionSignature(id, role, issuedAt) {
  const raw = `${id || "anon"}|${role || "guest"}|${issuedAt}`;
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(raw);
    let binary = "";
    data.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  } catch (error) {
    console.warn("Failed to encode session signature. Falling back to raw payload.", error);
    return raw;
  }
}

function buildSessionPayload(user) {
  const issuedAt = Date.now();
  return {
    version: 1,
    id: user.id || null,
    username: user.username || null,
    displayName: user.fullName || user.username || "Dynapharm User",
    role: user.role || "client",
    branch: user.branch || null,
    branches: Array.isArray(user.branches) ? user.branches : [],
    issuedAt,
    signature: encodeSessionSignature(user.id, user.role, issuedAt)
  };
}

function persistSession(user) {
  try {
    const payload = buildSessionPayload(user);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Unable to persist session payload.", error);
  }
}

function loadPersistedSession() {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return normalizeUser({
        id: parsed.id,
        username: parsed.username,
        fullName: parsed.displayName,
        role: parsed.role,
        branch: parsed.branch,
        branches: parsed.branches
      });
    }

    const legacyUser = localStorage.getItem("currentUser");
    if (!legacyUser) {
      return null;
    }

    try {
      const parsedLegacy = JSON.parse(legacyUser);
      persistSession(parsedLegacy);
      localStorage.removeItem("currentUser");
      localStorage.removeItem("currentUserRole");
      return normalizeUser(parsedLegacy);
    } catch (legacyError) {
      console.warn("Failed to migrate legacy session payload.", legacyError);
      return null;
    }
  } catch (error) {
    console.warn("Unable to read persisted session payload.", error);
    return null;
  }
}

function clearPersistedSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem("currentUser");
  localStorage.removeItem("currentUserRole");
}

function renderAuthState(user) {
  const portalTabs = document.getElementById("portalTabs");
  const distributorSubTabs = document.getElementById("distributorSubTabs");

  currentAccountUser = user;

  if (user) {
    if (loginNavItem) loginNavItem.style.display = "none";
    if (accountNavItem) accountNavItem.style.display = "flex";

    const initials = getInitials(user.fullName || user.username);
    if (accountInitialsEl) accountInitialsEl.textContent = initials;
    if (accountNameEl)
      accountNameEl.textContent = user.fullName || user.username || "Dynapharm Team";
    if (accountMenuInitials) accountMenuInitials.textContent = initials;
    if (accountMenuName)
      accountMenuName.textContent = user.fullName || user.username || "Dynapharm Team";
    if (accountMenuRole) accountMenuRole.textContent = toTitleCase(user.role || "team member");
    if (accountMenuBranch)
      accountMenuBranch.textContent = user.branch
        ? `Primary branch • ${toTitleCase(user.branch)}`
        : "";

    renderHeroState(user);

    if (portalTabs) portalTabs.style.display = "block";

    const normalizedRole = (user.role || "").toLowerCase();
    toggleLandingEditorButton(normalizedRole === "admin");
  } else {
    if (loginNavItem) loginNavItem.style.display = "flex";
    if (accountNavItem) accountNavItem.style.display = "none";
    closeAccountMenu();
    renderHeroState(null);

    if (portalTabs) portalTabs.style.display = "none";

    toggleLandingEditorButton(false);
    clearPortalContent();
  }
}

function getRoleRedirect(role, overridePortal) {
  const normalizedRole = (role || "").toLowerCase();
  const portalMap = {
    admin: "admin",
    consultant: "consultant",
    sales_staff: "consultant",
    dispenser: "dispenser",
    finance: "finance",
    finance_manager: "finance",
    hr: "hr-portal",
    hr_manager: "hr-portal",
    hr_admin: "hr-portal",
    mis: "mis",
    gm: "gm",
    general_manager: "gm",
    director: "director",
    stock_manager: "stock",
    warehouse: "stock",
    stock: "stock",
    mlm: "mlm",
    lrp: "lrp",
    frontdesk: "frontdesk",
    client: "client"
  };

  const requestedPortal = (overridePortal || "").toLowerCase();
  const resolvedPortal = requestedPortal || portalMap[normalizedRole] || "client";

  const portalRoutes = {
    client: "distributor-portal.html",
    distributor: "distributor-portal.html",
    frontdesk: "distributor-guest.html",
    consultant: "distributor-portal.html?view=consultant",
    sales_staff: "distributor-portal.html?view=consultant",
    dispenser: "branch-stock-inventory.html",
    branch_manager: "branch-stock-inventory.html",
    finance: "finance-bonus-upload.html",
    finance_manager: "finance-bonus-upload.html",
    hr: "hr-portal.html",
    hr_portal: "hr-portal.html",
    "hr-portal": "hr-portal.html",
    hr_manager: "hr-portal.html",
    hr_admin: "hr-portal.html",
    mis: "mis-portal.html",
    gm: "gm-portal.html",
    general_manager: "gm-portal.html",
    director: "director-portal.html",
    stock: "stock-management-portal.html",
    stock_manager: "stock-management-portal.html",
    warehouse: "stock-management-portal.html",
    admin: "dynapharm-complete-system.html?portal=admin",
    reports: "dynapharm-complete-system.html?portal=reports",
    mlm: "distributor-portal.html?view=mlm",
    lrp: "distributor-portal.html?view=lrp"
  };

  return portalRoutes[resolvedPortal] || portalRoutes[normalizedRole] || portalRoutes.client;
}

function finalizeUserSession(user, options = {}) {
  const normalized = normalizeUser(user);
  if (!normalized) {
    console.error("Cannot finalize session without valid user.");
    return;
  }

  persistSession(normalized);
  renderAuthState(normalized);

  if (options.closeModal !== false) {
    closeLoginModal();
  }

  showToast(`Welcome back, ${normalized.fullName || normalized.username}!`, "success");

  const redirectPortal = new URLSearchParams(window.location.search).get("redirectPortal");
  const portalOverride = pendingPortalOverride || redirectPortal;
  renderPortalForUser(normalized, { portalOverride });
  pendingPortalOverride = null;
}

// Section Navigation
function showSection(section) {
  if (section === "shop") {
    document.getElementById("shop-section").style.display = "block";
    document.getElementById("about-section").classList.remove("active");
    document.getElementById("media-section").classList.remove("active");
    showDistributorTab("shop");
    loadShopProducts();
  } else if (section === "about") {
    document.getElementById("shop-section").style.display = "none";
    document.getElementById("about-section").classList.add("active");
    document.getElementById("media-section").classList.remove("active");
  } else if (section === "media") {
    document.getElementById("shop-section").style.display = "none";
    document.getElementById("about-section").classList.remove("active");
    document.getElementById("media-section").classList.add("active");
    showDistributorTab("media");
  }
}

// Modal Functions
function openLoginModal() {
  lastActiveElement = document.activeElement;
  const modal = document.getElementById("loginModal");
  if (!modal) return;
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
  modal.focus();
  document.body.classList.add("modal-open");
  closeAccountMenu();
  loadDistributorsForLogin();
}

function closeLoginModal() {
  const modal = document.getElementById("loginModal");
  if (modal) {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("modal-open");
  // Reset forms
  document.getElementById("distributorSelect").value = "";
  document.getElementById("distributorDOB").value = "";
  const searchInput = document.getElementById("distributorSearch");
  if (searchInput) searchInput.value = "";
  document.getElementById("staffUsername").value = "";
  document.getElementById("staffPassword").value = "";
  document.getElementById("adminUsername").value = "";
  document.getElementById("adminPassword").value = "";
  // Clear errors
  document.querySelectorAll(".error-message").forEach((el) => el.classList.remove("show"));
  resetDistributorAuthFlow(true);
  pendingPortalOverride = null;

  if (lastActiveElement && typeof lastActiveElement.focus === "function") {
    lastActiveElement.focus();
    lastActiveElement = null;
  }
}

function switchModalTab(tab, evt) {
  const triggerEvent = evt || window.event;

  document.querySelectorAll(".modal-tab").forEach((btn) => btn.classList.remove("active"));
  triggerEvent?.target?.classList?.add("active");

  // Update forms
  document.querySelectorAll(".modal-form").forEach((form) => form.classList.remove("active"));
  document.getElementById(tab + "-form").classList.add("active");
}

// Load distributors for login dropdown
async function loadDistributorsForLogin(forceRefresh = false) {
  const select = document.getElementById("distributorSelect");
  const searchInput = document.getElementById("distributorSearch");
  if (!select) return;

  if (!forceRefresh && allDistributors.length > 0) {
    if (searchInput) searchInput.value = "";
    filteredDistributors = [...allDistributors];
    renderDistributorOptions(filteredDistributors);
    return;
  }

  select.innerHTML = '<option value="">Loading distributors...</option>';

  let distributors = [];
  let apiError = null;

  try {
    const response = await fetch("/api/distributors?status=active");
    if (!response.ok) {
      throw new Error(`API responded with ${response.status}`);
    }

    const payload = await response.json();
    distributors = normalizeDistributorPayload(payload);
    localStorage.setItem(
      "dyna_distributors_cache",
      JSON.stringify({
        timestamp: Date.now(),
        data: distributors
      })
    );
    console.log(`Loaded ${distributors.length} distributors from API`);
  } catch (error) {
    apiError = error;
    console.warn("Distributor API unavailable, using cached data if available", error);

    const cached = localStorage.getItem("dyna_distributors_cache");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.data)) {
          distributors = normalizeDistributorPayload(parsed.data);
          console.log(`Loaded ${distributors.length} distributors from cache`);
        }
      } catch (cacheError) {
        console.error("Error parsing distributor cache", cacheError);
      }
    }

    if (distributors.length === 0) {
      const stored = localStorage.getItem("dyna_distributors");
      if (stored) {
        try {
          const parsedStored = JSON.parse(stored);
          distributors = normalizeDistributorPayload(parsedStored);
          console.log(`Loaded ${distributors.length} distributors from localStorage fallback`);
        } catch (storedError) {
          console.error("Error parsing distributor localStorage fallback", storedError);
        }
      }
    }
  }

  allDistributors = distributors;
  filteredDistributors = [...allDistributors];
  buildDistributorIndex(allDistributors);

  if (searchInput) searchInput.value = "";

  if (allDistributors.length === 0) {
    select.innerHTML = apiError
      ? '<option value="" disabled>Unable to load distributors. Please contact support.</option>'
      : '<option value="" disabled>No distributors found. Please contact your branch manager for registration.</option>';
    return;
  }

  renderDistributorOptions(filteredDistributors);
}

function normalizeDistributorPayload(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.distributors)
        ? payload.distributors
        : [];

  return list.map(normalizeDistributorRecord).filter(Boolean);
}

function normalizeDistributorRecord(raw) {
  if (!raw) return null;

  const code = (
    raw.distributor_code ||
    raw.distributorCode ||
    raw.code ||
    raw.memberCode ||
    raw.member_code ||
    ""
  )
    .toString()
    .toUpperCase()
    .trim();
  const name = (
    raw.distributor_name ||
    raw.distributorName ||
    raw.name ||
    raw.fullName ||
    raw.full_name ||
    ""
  ).trim();

  if (!code || !name) return null;

  const dobRaw = raw.birthdate || raw.birth_date || raw.dob || raw.dateOfBirth || "";
  const dob = dobRaw ? new Date(dobRaw).toISOString().split("T")[0] : "";

  return {
    id: raw.id || raw._id || raw.distributorId || raw.uuid || code,
    code,
    name,
    branch: raw.branch || raw.branchName || raw.branch_name || raw.location || "",
    dob,
    phone: raw.phone || raw.contact || raw.phoneNumber || raw.contact_number || "",
    email: raw.email || raw.contactEmail || "",
    hasPassword: Boolean(
      raw.hasPassword ?? raw.passwordSet ?? raw.password_hash ?? raw.passwordHash
    )
  };
}

function buildDistributorIndex(list) {
  distributorIndex = {};
  list.forEach((item) => {
    distributorIndex[item.code] = item;
  });
}

function renderDistributorOptions(list) {
  const select = document.getElementById("distributorSelect");
  if (!select) return;

  select.innerHTML = '<option value="">-- Select your distributor --</option>';

  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));

  sorted.forEach((dist) => {
    const option = document.createElement("option");
    option.value = dist.code;
    option.textContent = dist.branch
      ? `${dist.code} - ${dist.name} (${dist.branch})`
      : `${dist.code} - ${dist.name}`;
    option.dataset.distributorId = dist.id;
    option.dataset.dob = dist.dob || "";
    option.dataset.hasPassword = dist.hasPassword ? "true" : "false";
    option.dataset.branch = dist.branch || "";
    select.appendChild(option);
  });

  if (sorted.length === 0) {
    select.innerHTML = '<option value="" disabled>No distributors match your search.</option>';
  }
}

function filterDistributorOptions(searchTerm = "") {
  const term = (searchTerm || "").toLowerCase().trim();
  if (!term) {
    filteredDistributors = [...allDistributors];
  } else {
    filteredDistributors = allDistributors.filter((dist) => {
      return (
        dist.code.toLowerCase().includes(term) ||
        dist.name.toLowerCase().includes(term) ||
        dist.branch.toLowerCase().includes(term)
      );
    });
  }

  renderDistributorOptions(filteredDistributors);
}

function showDistributorPasswordForm(mode = "login") {
  distributorAuthMode = mode;
  const passwordSection = document.getElementById("distributorPasswordSection");
  const loginActions = document.getElementById("distributorLoginActions");
  const heading = document.getElementById("distributorPasswordHeading");
  const subtext = document.getElementById("distributorPasswordSubtext");
  const loginFields = document.getElementById("distributorLoginFields");
  const setupFields = document.getElementById("distributorSetupFields");
  const errorDiv = document.getElementById("distributorPasswordError");
  const successDiv = document.getElementById("distributorPasswordSuccess");
  const submitButton = document.getElementById("distributorPasswordSubmit");

  if (!passwordSection) return;

  if (loginActions) loginActions.style.display = "none";
  passwordSection.style.display = "block";
  if (errorDiv) {
    errorDiv.textContent = "";
    errorDiv.classList.remove("show");
  }
  if (successDiv) successDiv.style.display = "none";

  const distributorName = currentDistributorSelection?.name || "Distributor";

  if (mode === "setup") {
    if (heading) heading.textContent = `Create a Password (${distributorName})`;
    if (subtext)
      subtext.textContent =
        "Create a strong password to access the distributor portal. Minimum 8 characters.";
    if (loginFields) loginFields.style.display = "none";
    if (setupFields) setupFields.style.display = "block";
    if (submitButton) submitButton.textContent = "Save Password & Continue";
  } else {
    if (heading) heading.textContent = `Enter Password (${distributorName})`;
    if (subtext) subtext.textContent = "Enter your distributor portal password to continue.";
    if (loginFields) loginFields.style.display = "block";
    if (setupFields) setupFields.style.display = "none";
    if (submitButton) submitButton.textContent = "Login";
  }

  const passwordInput = document.getElementById("distributorPassword");
  const newPasswordInput = document.getElementById("distributorNewPassword");
  const confirmPasswordInput = document.getElementById("distributorConfirmPassword");
  if (passwordInput) passwordInput.value = "";
  if (newPasswordInput) newPasswordInput.value = "";
  if (confirmPasswordInput) confirmPasswordInput.value = "";

  if (mode === "login" && passwordInput) passwordInput.focus();
  if (mode === "setup" && newPasswordInput) newPasswordInput.focus();
}

function resetDistributorAuthFlow(resetSelection = false) {
  const passwordSection = document.getElementById("distributorPasswordSection");
  const loginActions = document.getElementById("distributorLoginActions");
  const passwordInput = document.getElementById("distributorPassword");
  const newPasswordInput = document.getElementById("distributorNewPassword");
  const confirmPasswordInput = document.getElementById("distributorConfirmPassword");
  const errorDiv = document.getElementById("distributorPasswordError");
  const successDiv = document.getElementById("distributorPasswordSuccess");

  if (passwordSection) passwordSection.style.display = "none";
  if (loginActions) loginActions.style.display = "block";
  if (passwordInput) passwordInput.value = "";
  if (newPasswordInput) newPasswordInput.value = "";
  if (confirmPasswordInput) confirmPasswordInput.value = "";
  if (errorDiv) {
    errorDiv.textContent = "";
    errorDiv.classList.remove("show");
  }
  if (successDiv) successDiv.style.display = "none";

  if (resetSelection) {
    currentDistributorSelection = null;
    distributorAuthMode = "login";
    const select = document.getElementById("distributorSelect");
    if (select) select.selectedIndex = 0;
    const dobInput = document.getElementById("distributorDOB");
    if (dobInput) dobInput.value = "";
  }
}

async function submitDistributorPassword() {
  if (!currentDistributorSelection) {
    alert("Please select your distributor account first.");
    resetDistributorAuthFlow(true);
    return;
  }

  const errorDiv = document.getElementById("distributorPasswordError");
  const successDiv = document.getElementById("distributorPasswordSuccess");
  if (errorDiv) {
    errorDiv.textContent = "";
    errorDiv.classList.remove("show");
  }
  if (successDiv) successDiv.style.display = "none";

  const submitButton = document.getElementById("distributorPasswordSubmit");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = distributorAuthMode === "setup" ? "Saving..." : "Signing in...";
  }

  try {
    if (distributorAuthMode === "setup") {
      const newPassword = (document.getElementById("distributorNewPassword")?.value || "").trim();
      const confirmPassword = (
        document.getElementById("distributorConfirmPassword")?.value || ""
      ).trim();

      if (!newPassword || !confirmPassword) {
        throw new Error("Please enter and confirm your new password.");
      }
      if (newPassword.length < 8) {
        throw new Error("Password must be at least 8 characters long.");
      }
      if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match. Please re-enter.");
      }

      const response = await fetch(
        `/api/distributors/${encodeURIComponent(currentDistributorSelection.id)}/set-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            password: newPassword,
            distributorCode: currentDistributorSelection.code
          })
        }
      );

      if (!response.ok) {
        let message = "Failed to save password. Please try again.";
        try {
          const payload = await response.json();
          if (payload?.message) message = payload.message;
        } catch {}
        throw new Error(message);
      }

      if (successDiv) {
        successDiv.textContent = "Password created successfully. Logging you in...";
        successDiv.style.display = "block";
      }

      currentDistributorSelection.hasPassword = true;
      if (distributorIndex[currentDistributorSelection.code]) {
        distributorIndex[currentDistributorSelection.code].hasPassword = true;
      }
      distributorAuthMode = "login";
      setTimeout(() => {
        completeDistributorLogin(newPassword);
      }, 1000);
    } else {
      const password = (document.getElementById("distributorPassword")?.value || "").trim();
      if (!password) {
        throw new Error("Please enter your password.");
      }

      await completeDistributorLogin(password);
    }
  } catch (error) {
    console.error("Distributor password submission error:", error);
    if (errorDiv) {
      errorDiv.textContent = error.message || "Authentication failed. Please try again.";
      errorDiv.classList.add("show");
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent =
        distributorAuthMode === "setup" ? "Save Password & Continue" : "Login";
    }
  }
}

async function completeDistributorLogin(password) {
  const errorDiv = document.getElementById("distributorPasswordError");
  const normalizedCode = (currentDistributorSelection.code || "").toString().toUpperCase();

  const response = await fetch("/api/distributor-login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      distributorCode: normalizedCode,
      password
    })
  });

  if (!response.ok) {
    let message = "Invalid credentials. Please try again or contact support.";
    try {
      const payload = await response.json();
      if (payload?.message) message = payload.message;
    } catch {}
    throw new Error(message);
  }

  try {
    const session = await response.json();
    localStorage.setItem(
      "dyna_distributor_session",
      JSON.stringify({
        distributorCode: normalizedCode,
        distributorId: currentDistributorSelection.id,
        name: currentDistributorSelection.name,
        branch: currentDistributorSelection.branch,
        token: session?.token || null,
        expiresAt: session?.expiresAt || null
      })
    );
    localStorage.setItem(
      "distributor_portal_session",
      JSON.stringify({
        nbNumber: normalizedCode,
        distributorName: currentDistributorSelection.name,
        distributorId: currentDistributorSelection.id,
        loginTime: new Date().toISOString()
      })
    );
  } catch (sessionError) {
    console.warn("Could not parse distributor session payload", sessionError);
  }

  const distributorUser = {
    fullName: currentDistributorSelection.name,
    username: normalizedCode,
    role: "client",
    branch: currentDistributorSelection.branch
  };

  persistSession(distributorUser);

  closeLoginModal();
  renderAuthState(distributorUser);
  showToast(`Welcome back, ${currentDistributorSelection.name}!`, "success");
  const portalOverride = pendingPortalOverride || "client";
  const targetUrl = getRoleRedirect("client", portalOverride);
  const needsNb = targetUrl && targetUrl.includes("distributor-portal");
  const finalUrl = needsNb
    ? targetUrl.includes("nb=")
      ? targetUrl
      : `${targetUrl}${targetUrl.includes("?") ? "&" : "?"}nb=${encodeURIComponent(normalizedCode)}`
    : targetUrl || `distributor-portal.html?nb=${encodeURIComponent(normalizedCode)}`;

  renderPortalForUser(distributorUser, {
    portalOverride,
    url: finalUrl
  });
  pendingPortalOverride = null;
}

function showDistributorResetInfo() {
  alert(
    "Please contact your branch administrator or system admin to reset your distributor portal password."
  );
}

// Handle Distributor Login
async function handleDistributorLogin() {
  const select = document.getElementById("distributorSelect");
  const dobInput = document.getElementById("distributorDOB");
  const errorDiv = document.getElementById("distributorError");
  const dobErrorDiv = document.getElementById("distributorDOBError");

  // Clear previous errors
  errorDiv.classList.remove("show");
  dobErrorDiv.classList.remove("show");

  const selectedCode = select.value.toUpperCase();
  const dob = dobInput.value;

  if (!selectedCode) {
    errorDiv.textContent = "Please select a distributor";
    errorDiv.classList.add("show");
    return;
  }

  if (!dob) {
    dobErrorDiv.textContent = "Please enter your date of birth";
    dobErrorDiv.classList.add("show");
    return;
  }

  const selectedDistributor = distributorIndex[selectedCode];
  if (!selectedDistributor) {
    errorDiv.textContent = "Distributor not found. Please refresh and try again.";
    errorDiv.classList.add("show");
    return;
  }

  if (selectedDistributor.dob) {
    if (dob !== selectedDistributor.dob) {
      dobErrorDiv.textContent =
        "Date of birth does not match our records. Please double-check and try again.";
      dobErrorDiv.classList.add("show");
      return;
    }
  }

  currentDistributorSelection = selectedDistributor;

  const hasPassword = Boolean(selectedDistributor.hasPassword);
  showDistributorPasswordForm(hasPassword ? "login" : "setup");
}

// Handle Staff Login
async function handleStaffLogin() {
  const username = document.getElementById("staffUsername").value.trim();
  const password = document.getElementById("staffPassword").value;
  const errorDiv = document.getElementById("staffPasswordError");

  // Clear previous errors
  errorDiv.classList.remove("show");

  if (!username || !password) {
    errorDiv.textContent = "Please enter both username and password";
    errorDiv.classList.add("show");
    return;
  }

  const apiResult = await authenticateViaApi(username, password);

  if (apiResult.success && apiResult.user) {
    finalizeUserSession(apiResult.user);
    return;
  }

  if (!apiResult.networkError) {
    errorDiv.textContent =
      apiResult.message ||
      "Invalid username or password. Please check your credentials or contact your administrator.";
    errorDiv.classList.add("show");
    return;
  }

  const fallbackUser = findLocalUserByCredentials(username, password);

  if (!fallbackUser) {
    errorDiv.textContent =
      apiResult.message || "Unable to reach authentication service. Please try again.";
    errorDiv.classList.add("show");
    return;
  }

  if ((fallbackUser.role || "").toLowerCase().includes("distributor")) {
    errorDiv.textContent = "Distributors should use the Distributor login option.";
    errorDiv.classList.add("show");
    return;
  }

  console.info("Logged in using offline credential cache.");
  finalizeUserSession(fallbackUser);
}

// Handle Admin Login
async function handleAdminLogin() {
  const username = document.getElementById("adminUsername").value.trim();
  const password = document.getElementById("adminPassword").value;
  const errorDiv = document.getElementById("adminPasswordError");

  // Clear previous errors
  errorDiv.classList.remove("show");

  if (!username || !password) {
    errorDiv.textContent = "Please enter both username and password";
    errorDiv.classList.add("show");
    return;
  }

  const apiResult = await authenticateViaApi(username, password);

  if (apiResult.success && apiResult.user) {
    if ((apiResult.user.role || "").toLowerCase() !== "admin") {
      errorDiv.textContent = "This account does not have administrator access.";
      errorDiv.classList.add("show");
      return;
    }

    finalizeUserSession(apiResult.user);
    return;
  }

  if (!apiResult.networkError) {
    errorDiv.textContent =
      apiResult.message || "Invalid admin credentials. Please check your username and password.";
    errorDiv.classList.add("show");
    return;
  }

  const fallbackUser = findLocalUserByCredentials(username, password);

  if (!fallbackUser || (fallbackUser.role || "").toLowerCase() !== "admin") {
    errorDiv.textContent =
      apiResult.message || "Unable to reach authentication service. Please try again.";
    errorDiv.classList.add("show");
    return;
  }

  console.info("Admin logged in using offline credential cache.");
  finalizeUserSession(fallbackUser);
}

// Load Shop Products
async function loadShopProducts() {
  const container = document.getElementById("productsContainer");
  container.innerHTML =
    '<div class="loading"><div class="spinner"></div><p>Loading products...</p></div>';

  try {
    let products = [];

    // Method 1: Try API endpoint
    try {
      const response = await fetch("/api/products");
      if (response.ok) {
        const apiProducts = await response.json();
        if (Array.isArray(apiProducts) && apiProducts.length > 0) {
          products = apiProducts.map((p) => ({
            description: p.name || p.description || p.product_name,
            name: p.name || p.description || p.product_name,
            dp: p.dp || p.distributor_price || p.price,
            cp: p.cp || p.customer_price,
            bv: p.bv || p.business_volume,
            image: p.image || p.image_url || p.photo
          }));
        }
      }
    } catch (e) {
      console.debug("API not available, trying localStorage");
    }

    // Method 2: Try localStorage (set by main system)
    if (products.length === 0) {
      try {
        const priceList = JSON.parse(localStorage.getItem("dyna_price_list") || "[]");
        if (priceList.length > 0) {
          products = priceList;
        }
      } catch (e) {
        console.debug("localStorage price list not available");
      }
    }

    // Method 3: Try loading from main system window.PRICE_LIST
    if (products.length === 0) {
      try {
        // Check if we can access the main system
        if (window.opener && window.opener.PRICE_LIST) {
          products = window.opener.PRICE_LIST;
        } else if (window.parent !== window && window.parent.PRICE_LIST) {
          products = window.parent.PRICE_LIST;
        }
      } catch (e) {
        console.debug("Cannot access parent window");
      }
    }

    // Method 4: Try to load product images from database
    if (products.length > 0) {
      try {
        const imagesResponse = await fetch("/api/product_images");
        if (imagesResponse.ok) {
          const images = await imagesResponse.json();
          const imageMap = new Map();
          images.forEach((img) => {
            const productName = (img.product_name || "").toLowerCase();
            if (!imageMap.has(productName) || img.is_primary) {
              imageMap.set(productName, img.image_data || img.image_url);
            }
          });

          // Attach images to products
          products = products.map((p) => {
            const productName = (p.description || p.name || "").toLowerCase();
            const image = imageMap.get(productName);
            return { ...p, image: image || p.image || p.photo };
          });
        }
      } catch (e) {
        console.debug("Could not load product images");
      }
    }

    // Display products
    if (products.length > 0) {
      allProducts = products;
      displayProducts(products);
    } else {
      container.innerHTML =
        '<div class="loading"><p>No products available at the moment. Please check back later.</p></div>';
    }
  } catch (error) {
    console.error("Error loading products:", error);
    container.innerHTML =
      '<div class="loading"><p>Error loading products. Please refresh the page.</p></div>';
  }
}

// Shopping cart
let shopCart = [];
let shopCustomerTypeSelected = false;
let pendingCartItem = null;

function displayProducts(products) {
  const container = document.getElementById("productsContainer");
  if (products.length === 0) {
    container.innerHTML = '<div class="loading"><p>No products found.</p></div>';
    return;
  }

  container.innerHTML = products
    .map((product) => {
      const name = product.description || product.name || "Product";
      const cp = product.cp || product.price || 0;
      const dp = product.dp || product.cp || product.price || 0;
      const bv = product.bv || 0;
      const image = product.image || product.photo || "";
      const displayPrice =
        shopCustomerTypeSelected &&
        shopCart.length > 0 &&
        shopCart[0].customerType === "distributor"
          ? dp
          : cp;

      return `
            <div class="product-card">
                <img src="${image || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='200'%3E%3Crect fill='%23f6f8fb' width='250' height='200'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%2364748b' font-family='sans-serif' font-size='14'%3ENo Image%3C/text%3E%3C/svg%3E"}" 
                     alt="${name}" 
                     class="product-image"
                     onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'250\' height=\'200\'%3E%3Crect fill=\'%23f6f8fb\' width=\'250\' height=\'200\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%2364748b\' font-family=\'sans-serif\' font-size=\'14\'%3ENo Image%3C/text%3E%3C/svg%3E'">
                <div class="product-info">
                    <div class="product-name">${name}</div>
                    <div class="product-price">N$ ${parseFloat(displayPrice).toFixed(2)}</div>
                    <button onclick="addToShopCart('${name.replace(/'/g, "\\'")}', ${cp}, ${dp}, ${bv})" 
                            style="width: 100%; margin-top: 10px; background: var(--brand-color); color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer; font-weight: bold;">
                        ➕ Add to Cart
                    </button>
                </div>
            </div>
        `;
    })
    .join("");
}

function addToShopCart(productName, cp, dp, bv) {
  pendingCartItem = { productName, cp, dp, bv };

  if (shopCart.length === 0) {
    showCustomerTypeModal();
    return;
  }

  const firstItemCustomerType = shopCart[0].customerType;
  if (firstItemCustomerType) {
    addToCartWithCustomerType(productName, cp, dp, bv, firstItemCustomerType);
  } else {
    showCustomerTypeModal();
  }
}

function showCustomerTypeModal() {
  const modal = document.getElementById("customerTypeModal") || createCustomerTypeModal();
  modal.style.display = "flex";
}

function createCustomerTypeModal() {
  const modal = document.createElement("div");
  modal.id = "customerTypeModal";
  modal.className = "modal";
  modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <span class="modal-close" onclick="closeCustomerTypeModal()">&times;</span>
            <h2 style="color: var(--brand-color); margin-bottom: 20px;">Select Customer Type</h2>
            <p style="margin-bottom: 20px; color: var(--text-light);">Please select your customer type to continue shopping.</p>
            <div class="form-group">
                <label>Customer Type</label>
                <select id="modalCustomerType" style="padding: 12px; width: 100%; font-size: 1rem; border: 2px solid var(--border); border-radius: 8px;">
                    <option value="customer">Customer (CP Pricing)</option>
                    <option value="distributor">Distributor (DP Pricing)</option>
                </select>
            </div>
            <div style="margin-top: 20px;">
                <button class="btn-submit" onclick="confirmCustomerTypeSelection()">Confirm</button>
                <button class="btn" onclick="closeCustomerTypeModal()" style="background: var(--border); margin-top: 10px;">Cancel</button>
            </div>
        </div>
    `;
  document.body.appendChild(modal);
  return modal;
}

function closeCustomerTypeModal() {
  const modal = document.getElementById("customerTypeModal");
  if (modal) modal.style.display = "none";
  pendingCartItem = null;
}

function confirmCustomerTypeSelection() {
  const customerType = document.getElementById("modalCustomerType")?.value;
  if (!customerType || !pendingCartItem) {
    alert("Please select a customer type.");
    return;
  }

  shopCustomerTypeSelected = true;
  addToCartWithCustomerType(
    pendingCartItem.productName,
    pendingCartItem.cp,
    pendingCartItem.dp,
    pendingCartItem.bv,
    customerType
  );

  closeCustomerTypeModal();
  displayProducts(allProducts); // Refresh to show correct prices
}

function addToCartWithCustomerType(productName, cp, dp, bv, customerType) {
  const price = customerType === "distributor" ? dp : cp;

  const existingItem = shopCart.find(
    (item) => item.name === productName && item.customerType === customerType
  );

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    shopCart.push({
      name: productName,
      price: price,
      cp: cp,
      dp: dp,
      bv: bv,
      quantity: 1,
      customerType: customerType
    });
  }

  updateShopCart();
}

function updateShopCart() {
  const cartSection = document.getElementById("shopCartSection");
  const cartItems = document.getElementById("shopCartItems");
  const cartTotal = document.getElementById("shopCartTotal");
  const cartCount = document.getElementById("cartCount");

  if (!cartSection || !cartItems || !cartTotal) return;

  if (shopCart.length === 0) {
    cartSection.style.display = "none";
    shopCustomerTypeSelected = false;
    if (cartCount) cartCount.textContent = "0";
    return;
  }

  cartSection.style.display = "block";

  const customerType = shopCart[0]?.customerType;
  const typeLabel =
    customerType === "distributor" ? "Distributor (DP Pricing)" : "Customer (CP Pricing)";

  cartItems.innerHTML = `
        <p style="color: var(--text-light); margin-bottom: 15px;">Customer Type: <strong>${typeLabel}</strong></p>
        ${shopCart
          .map(
            (item, index) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid var(--border); background: var(--bg-light); border-radius: 8px; margin-bottom: 10px;">
                <div style="flex: 1;">
                    <strong>${item.name}</strong>
                    <p style="color: var(--text-light); font-size: 0.9rem; margin-top: 5px;">N$${item.price.toFixed(2)} x ${item.quantity}</p>
                </div>
                <div style="text-align: right;">
                    <p style="font-size: 1.2rem; font-weight: bold; color: var(--brand-color);">N$${(item.price * item.quantity).toFixed(2)}</p>
                    <button onclick="removeFromShopCart(${index})" style="padding: 5px 10px; margin-top: 5px; background: #dc2626; color: white; border: none; border-radius: 5px; cursor: pointer;">Remove</button>
                </div>
            </div>
        `
          )
          .join("")}
    `;

  const total = shopCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  cartTotal.textContent = `N$ ${total.toFixed(2)}`;

  const countVal = shopCart.reduce((sum, item) => sum + (item.quantity || 0), 0);
  if (cartCount) cartCount.textContent = String(countVal);
}

function removeFromShopCart(index) {
  shopCart.splice(index, 1);
  updateShopCart();
  displayProducts(allProducts);
}

function openCart() {
  const cartSection = document.getElementById("shopCartSection");
  if (cartSection && shopCart.length > 0) {
    cartSection.scrollIntoView({ behavior: "smooth" });
  } else {
    alert("Your cart is empty. Add products to your cart first.");
  }
}

function checkoutShopOrder() {
  if (shopCart.length === 0) {
    alert("Your cart is empty.");
    return;
  }

  // Show checkout modal with delivery/pickup options
  showCheckoutModal();
}

function clearShopCart() {
  if (confirm("Are you sure you want to clear your cart?")) {
    shopCart = [];
    updateShopCart();
    displayProducts(allProducts);
  }
}

// Checkout Modal Functions
let allTowns = [];
let allBranches = [];
let selectedDeliveryMethod = "pickup";
let selectedTown = null;
let selectedBranch = null;
let deliveryFeeData = null;

async function showCheckoutModal() {
  const modal = document.getElementById("checkoutModal") || createCheckoutModal();
  modal.style.display = "flex";

  // Load towns and branches
  await loadTowns();
  await loadBranches();

  // Reset form
  selectedDeliveryMethod = "pickup";
  selectedTown = null;
  selectedBranch = null;
  deliveryFeeData = null;

  // Reset form fields
  const nameInput = document.getElementById("checkoutCustomerName");
  const phoneInput = document.getElementById("checkoutCustomerPhone");
  const emailInput = document.getElementById("checkoutCustomerEmail");
  const addressInput = document.getElementById("checkoutDeliveryAddress");
  const notesInput = document.getElementById("checkoutNotes");
  const branchSelect = document.getElementById("checkoutBranch");
  const townSelect = document.getElementById("checkoutTown");

  if (nameInput) nameInput.value = "";
  if (phoneInput) phoneInput.value = "";
  if (emailInput) emailInput.value = "";
  if (addressInput) addressInput.value = "";
  if (notesInput) notesInput.value = "";
  if (branchSelect) branchSelect.value = "";
  if (townSelect) townSelect.value = "";

  // Set default delivery method to pickup
  const pickupRadio = document.querySelector('input[name="deliveryMethod"][value="pickup"]');
  if (pickupRadio) pickupRadio.checked = true;

  updateCheckoutForm();
}

function createCheckoutModal() {
  const modal = document.createElement("div");
  modal.id = "checkoutModal";
  modal.className = "modal";
  modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
            <span class="modal-close" onclick="closeCheckoutModal()">&times;</span>
            <h2 style="color: var(--brand-color); margin-bottom: 20px;">Checkout</h2>
            
            <!-- Order Summary -->
            <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="margin-bottom: 10px; font-size: 1.1rem;">Order Summary</h3>
                <div id="checkoutOrderSummary"></div>
                <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>Subtotal:</span>
                        <strong id="checkoutSubtotal">N$ 0.00</strong>
                    </div>
                    <div style="display: none; justify-content: space-between; margin-bottom: 5px;" id="deliveryFeeRow">
                        <span>Delivery Fee:</span>
                        <strong id="checkoutDeliveryFee">N$ 0.00</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 1.2rem; font-weight: bold; color: var(--brand-color); margin-top: 10px; padding-top: 10px; border-top: 2px solid var(--border);">
                        <span>Total:</span>
                        <span id="checkoutTotal">N$ 0.00</span>
                    </div>
                </div>
            </div>

            <!-- Customer Information -->
            <div class="form-group">
                <label>Full Name *</label>
                <input type="text" id="checkoutCustomerName" required placeholder="Enter your full name">
            </div>
            <div class="form-group">
                <label>Phone Number *</label>
                <input type="tel" id="checkoutCustomerPhone" required placeholder="+264 81 234 5678">
            </div>
            <div class="form-group">
                <label>Email (Optional)</label>
                <input type="email" id="checkoutCustomerEmail" placeholder="your.email@example.com">
            </div>

            <!-- Delivery Method Selection -->
            <div class="form-group">
                <label>Delivery Method *</label>
                <div style="display: flex; gap: 15px; margin-top: 10px;">
                    <label style="display: flex; align-items: center; cursor: pointer; padding: 10px; border: 2px solid var(--border); border-radius: 8px; flex: 1;">
                        <input type="radio" name="deliveryMethod" value="pickup" checked onchange="handleDeliveryMethodChange('pickup')" style="margin-right: 8px;">
                        <span>📍 Branch Pickup (0% fee)</span>
                    </label>
                    <label style="display: flex; align-items: center; cursor: pointer; padding: 10px; border: 2px solid var(--border); border-radius: 8px; flex: 1;">
                        <input type="radio" name="deliveryMethod" value="delivery" onchange="handleDeliveryMethodChange('delivery')" style="margin-right: 8px;">
                        <span>🚚 Home Delivery</span>
                    </label>
                </div>
            </div>

            <!-- Branch Selection (for pickup) -->
            <div class="form-group" id="branchSelectionGroup">
                <label>Select Branch for Pickup *</label>
                <select id="checkoutBranch" required onchange="handleBranchChange()">
                    <option value="">-- Select Branch --</option>
                </select>
            </div>

            <!-- Town Selection (for delivery) -->
            <div class="form-group" id="townSelectionGroup" style="display: none;">
                <label>Select Town for Delivery *</label>
                <select id="checkoutTown" onchange="handleTownChange()">
                    <option value="">-- Select Town --</option>
                </select>
                <div id="deliveryFeeInfo" style="margin-top: 10px; padding: 10px; background: #eef6ff; border-radius: 8px; display: none;">
                    <small style="color: #0b5aa0;" id="deliveryFeeText"></small>
                </div>
            </div>

            <!-- Delivery Address (for delivery) -->
            <div class="form-group" id="deliveryAddressGroup" style="display: none;">
                <label>Delivery Address *</label>
                <textarea id="checkoutDeliveryAddress" rows="3" placeholder="Enter your full delivery address"></textarea>
            </div>

            <!-- Notes -->
            <div class="form-group">
                <label>Order Notes (Optional)</label>
                <textarea id="checkoutNotes" rows="2" placeholder="Any special instructions..."></textarea>
            </div>

            <!-- Submit Button -->
            <button class="btn-submit" onclick="submitOrder()" style="margin-top: 20px;">Place Order</button>
            <button onclick="closeCheckoutModal()" style="background: var(--border); color: var(--text-dark); padding: 12px 24px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; width: 100%; margin-top: 10px;">Cancel</button>
        </div>
    `;
  document.body.appendChild(modal);
  return modal;
}

function closeCheckoutModal() {
  const modal = document.getElementById("checkoutModal");
  if (modal) modal.style.display = "none";
}

async function loadTowns() {
  try {
    const response = await fetch("/api/towns");
    if (response.ok) {
      allTowns = await response.json();
    } else {
      // Fallback: use default towns
      allTowns = [
        { id: "town_windhoek", name: "Windhoek" },
        { id: "town_oshakati", name: "Oshakati" },
        { id: "town_ondangwa", name: "Ondangwa" },
        { id: "town_rundu", name: "Rundu" },
        { id: "town_walvis_bay", name: "Walvis Bay" },
        { id: "town_swakopmund", name: "Swakopmund" },
        { id: "town_katima_mulilo", name: "Katima Mulilo" },
        { id: "town_gobabis", name: "Gobabis" },
        { id: "town_otjiwarongo", name: "Otjiwarongo" }
      ];
    }

    // Populate town dropdown
    const townSelect = document.getElementById("checkoutTown");
    if (townSelect) {
      townSelect.innerHTML = '<option value="">-- Select Town --</option>';
      allTowns.forEach((town) => {
        const option = document.createElement("option");
        option.value = town.id;
        option.textContent = town.name;
        townSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Error loading towns:", error);
  }
}

async function loadBranches() {
  try {
    const response = await fetch("/api/branches");
    if (response.ok) {
      allBranches = await response.json();
    } else {
      // Fallback: use localStorage
      const stored = localStorage.getItem("dyna_branches");
      if (stored) {
        allBranches = JSON.parse(stored);
      } else {
        allBranches = [
          { id: "townshop", name: "TOWNSHOP (Head Office)" },
          { id: "khomasdal", name: "KHOMASDAL DPC" },
          { id: "katima", name: "KATIMA DPC" },
          { id: "ondangwa", name: "ONDANGWA DPC" },
          { id: "swakopmund", name: "SWAKOPMUND DPC" },
          { id: "rundu", name: "RUNDU DPC" }
        ];
      }
    }

    // Populate branch dropdown
    const branchSelect = document.getElementById("checkoutBranch");
    if (branchSelect) {
      branchSelect.innerHTML = '<option value="">-- Select Branch --</option>';
      allBranches.forEach((branch) => {
        const option = document.createElement("option");
        option.value = branch.id;
        option.textContent = branch.name || branch.branch_name;
        branchSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Error loading branches:", error);
  }
}

function handleDeliveryMethodChange(method) {
  selectedDeliveryMethod = method;
  updateCheckoutForm();
}

function handleBranchChange() {
  const branchSelect = document.getElementById("checkoutBranch");
  selectedBranch = branchSelect ? branchSelect.value : null;
  updateCheckoutTotals();
}

async function handleTownChange() {
  const townSelect = document.getElementById("checkoutTown");
  selectedTown = townSelect ? townSelect.value : null;

  if (selectedTown && selectedDeliveryMethod === "delivery") {
    await calculateDeliveryFee();
  } else {
    deliveryFeeData = null;
    updateCheckoutTotals();
  }
}

async function calculateDeliveryFee() {
  if (!selectedTown || shopCart.length === 0) return;

  const subtotal = shopCart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  try {
    const response = await fetch("/api/delivery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        town_id: selectedTown,
        branch_id: selectedBranch || null,
        subtotal: subtotal
      })
    });

    if (response.ok) {
      deliveryFeeData = await response.json();
      updateDeliveryFeeDisplay();
      updateCheckoutTotals();
    } else {
      // Fallback: use default calculation
      const distance = 60; // Assume far distance
      deliveryFeeData = {
        delivery_fee_percentage: distance >= 50 ? 20.0 : 15.0,
        delivery_fee: (subtotal * (distance >= 50 ? 20.0 : 15.0)) / 100,
        distance_km: distance
      };
      updateDeliveryFeeDisplay();
      updateCheckoutTotals();
    }
  } catch (error) {
    console.error("Error calculating delivery fee:", error);
    // Fallback calculation
    const distance = 60;
    deliveryFeeData = {
      delivery_fee_percentage: 20.0,
      delivery_fee: (subtotal * 20.0) / 100,
      distance_km: distance
    };
    updateDeliveryFeeDisplay();
    updateCheckoutTotals();
  }
}

function updateDeliveryFeeDisplay() {
  const feeInfo = document.getElementById("deliveryFeeInfo");
  const feeText = document.getElementById("deliveryFeeText");

  if (feeInfo && feeText && deliveryFeeData) {
    const distance = deliveryFeeData.distance_km;
    const percentage = deliveryFeeData.delivery_fee_percentage;
    const feeType = distance >= 50 ? "far" : "near";

    if (distance !== null) {
      feeText.textContent = `Distance: ${distance}km from nearest branch. Delivery fee: ${percentage}% (${feeType === "far" ? "50km+" : "<50km"})`;
    } else {
      feeText.textContent = `Delivery fee: ${percentage}% (estimated)`;
    }
    feeInfo.style.display = "block";
  }
}

function updateCheckoutForm() {
  const branchGroup = document.getElementById("branchSelectionGroup");
  const townGroup = document.getElementById("townSelectionGroup");
  const addressGroup = document.getElementById("deliveryAddressGroup");
  const branchSelect = document.getElementById("checkoutBranch");
  const townSelect = document.getElementById("checkoutTown");
  const addressInput = document.getElementById("checkoutDeliveryAddress");

  if (selectedDeliveryMethod === "pickup") {
    if (branchGroup) branchGroup.style.display = "block";
    if (townGroup) townGroup.style.display = "none";
    if (addressGroup) addressGroup.style.display = "none";
    if (branchSelect) branchSelect.required = true;
    if (townSelect) townSelect.required = false;
    if (addressInput) addressInput.required = false;
    deliveryFeeData = null;
  } else {
    if (branchGroup) branchGroup.style.display = "none";
    if (townGroup) townGroup.style.display = "block";
    if (addressGroup) addressGroup.style.display = "block";
    if (branchSelect) branchSelect.required = false;
    if (townSelect) townSelect.required = true;
    if (addressInput) addressInput.required = true;
    if (selectedTown) {
      calculateDeliveryFee();
    }
  }

  updateCheckoutTotals();
}

function updateCheckoutTotals() {
  // Update order summary
  const summaryDiv = document.getElementById("checkoutOrderSummary");
  if (summaryDiv) {
    summaryDiv.innerHTML = shopCart
      .map(
        (item) => `
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
                <span>${item.name} x ${item.quantity}</span>
                <strong>N$ ${(item.price * item.quantity).toFixed(2)}</strong>
            </div>
        `
      )
      .join("");
  }

  // Calculate totals
  const subtotal = shopCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = deliveryFeeData ? deliveryFeeData.delivery_fee : 0;
  const total = subtotal + deliveryFee;

  // Update display
  const subtotalEl = document.getElementById("checkoutSubtotal");
  const deliveryFeeEl = document.getElementById("checkoutDeliveryFee");
  const deliveryFeeRow = document.getElementById("deliveryFeeRow");
  const totalEl = document.getElementById("checkoutTotal");

  if (subtotalEl) subtotalEl.textContent = `N$ ${subtotal.toFixed(2)}`;
  if (deliveryFeeEl) deliveryFeeEl.textContent = `N$ ${deliveryFee.toFixed(2)}`;
  if (deliveryFeeRow) {
    deliveryFeeRow.style.display =
      selectedDeliveryMethod === "delivery" && deliveryFee > 0 ? "flex" : "none";
  }
  if (totalEl) totalEl.textContent = `N$ ${total.toFixed(2)}`;
}

async function submitOrder() {
  // Validate form
  const customerName = document.getElementById("checkoutCustomerName")?.value.trim();
  const customerPhone = document.getElementById("checkoutCustomerPhone")?.value.trim();
  const customerEmail = document.getElementById("checkoutCustomerEmail")?.value.trim();
  const deliveryAddress = document.getElementById("checkoutDeliveryAddress")?.value.trim();
  const notes = document.getElementById("checkoutNotes")?.value.trim();

  if (!customerName || !customerPhone) {
    alert("Please fill in your name and phone number.");
    return;
  }

  if (selectedDeliveryMethod === "pickup" && !selectedBranch) {
    alert("Please select a branch for pickup.");
    return;
  }

  if (selectedDeliveryMethod === "delivery") {
    if (!selectedTown) {
      alert("Please select a town for delivery.");
      return;
    }
    if (!deliveryAddress) {
      alert("Please enter your delivery address.");
      return;
    }
  }

  // Prepare order data
  const subtotal = shopCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = deliveryFeeData ? deliveryFeeData.delivery_fee : 0;
  const total = subtotal + deliveryFee;

  const orderItems = shopCart.map((item) => ({
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    customer_type: item.customerType,
    cp: item.cp,
    dp: item.dp,
    bv: item.bv
  }));

  const customerType = shopCart[0]?.customerType || "customer";

  const orderData = {
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail || null,
    customer_type: customerType,
    delivery_method: selectedDeliveryMethod,
    branch_id: selectedDeliveryMethod === "pickup" ? selectedBranch : null,
    town_id: selectedDeliveryMethod === "delivery" ? selectedTown : null,
    delivery_address: selectedDeliveryMethod === "delivery" ? deliveryAddress : null,
    subtotal: subtotal,
    items: orderItems,
    notes: notes || null
  };

  // Submit order
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData)
    });

    if (response.ok) {
      const order = await response.json();

      // Save to localStorage as fallback
      try {
        const existingOrders = JSON.parse(localStorage.getItem("dyna_online_orders") || "[]");
        existingOrders.push(order);
        localStorage.setItem("dyna_online_orders", JSON.stringify(existingOrders));
      } catch (e) {
        console.error("Error saving to localStorage:", e);
      }

      // Show success message
      alert(
        `Order placed successfully! Order Number: ${order.order_number}\n\nTotal: N$ ${order.total_amount.toFixed(2)}\n\nWe will contact you shortly to confirm your order.`
      );

      // Clear cart
      shopCart = [];
      updateShopCart();

      // Close modal
      closeCheckoutModal();

      // Refresh products display
      displayProducts(allProducts);
    } else {
      const error = await response.json();
      alert(`Error placing order: ${error.error || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error submitting order:", error);

    // Fallback: save to localStorage only
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const fallbackOrder = {
      id: `order_${Date.now()}`,
      order_number: orderNumber,
      ...orderData,
      delivery_fee: deliveryFee,
      delivery_fee_percentage: deliveryFeeData ? deliveryFeeData.delivery_fee_percentage : 0,
      total_amount: total,
      distance_km: deliveryFeeData ? deliveryFeeData.distance_km : null,
      status: "pending",
      payment_status: "pending",
      created_at: new Date().toISOString()
    };

    try {
      const existingOrders = JSON.parse(localStorage.getItem("dyna_online_orders") || "[]");
      existingOrders.push(fallbackOrder);
      localStorage.setItem("dyna_online_orders", JSON.stringify(existingOrders));

      alert(
        `Order saved locally! Order Number: ${orderNumber}\n\nTotal: N$ ${total.toFixed(2)}\n\nNote: Order saved offline. Please contact us to confirm.`
      );

      // Clear cart
      shopCart = [];
      updateShopCart();
      closeCheckoutModal();
      displayProducts(allProducts);
    } catch (e) {
      alert("Error saving order. Please try again or contact us directly.");
    }
  }
}

function filterProducts() {
  const searchTerm = document.getElementById("productSearch").value.toLowerCase();
  const filtered = allProducts.filter((product) => {
    const name = (product.description || product.name || "").toLowerCase();
    return name.includes(searchTerm);
  });
  displayProducts(filtered);
}

// Consultation Booking Functionality
const CONSULT_STORAGE_KEY = "dyna_consult_appointments";

function loadConsultAppointments() {
  try {
    return JSON.parse(localStorage.getItem(CONSULT_STORAGE_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

function saveConsultAppointments(list) {
  localStorage.setItem(CONSULT_STORAGE_KEY, JSON.stringify(list));
  try {
    if (window.cloudAutoSaveAll) {
      window.cloudAutoSaveAll("Cloud sync: new consultation request");
    }
  } catch (_) {}
}

function renderConsultList() {
  const listWrap = document.getElementById("consult-appt-list");
  if (!listWrap) return;

  const appts = loadConsultAppointments();
  const visible = appts.filter((a) => a.status !== "completed");

  if (!visible.length) {
    listWrap.innerHTML =
      '<div style="text-align: center; padding: 40px; color: var(--text-light);">No upcoming appointments yet.</div>';
    return;
  }

  listWrap.innerHTML = visible
    .map(
      (a) => `
        <div style="padding: 15px; border: 1px dashed var(--border); border-radius: 10px; background: var(--bg-light); margin-bottom: 15px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 8px;">
                <div style="font-weight: 700; color: var(--text-dark);">${a.fullName}</div>
                <span style="background: #eef6ff; color: #0b5aa0; padding: 4px 12px; border-radius: 999px; font-size: 0.85rem; font-weight: 600;">${a.type || "Consultation"} • ${a.branch}</span>
            </div>
            <div style="color: var(--text-light); font-size: 0.9rem; margin-top: 6px;">
                ${a.date} at ${a.time} • ${a.phone || a.email || ""}
            </div>
            ${a.notes ? `<div style="margin-top: 8px; padding: 8px; background: white; border-radius: 6px; color: var(--text-dark);">${a.notes.replace(/[<>]/g, "")}</div>` : ""}
        </div>
    `
    )
    .join("");
}

function handleConsultationSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());

  const errs = [];
  if (!data.fullName || data.fullName.trim().length < 2) errs.push("Full name");
  if (!data.phone && !data.email) errs.push("Phone or Email");
  if (!data.date) errs.push("Preferred date");
  if (!data.time) errs.push("Preferred time");
  if (!data.branch) errs.push("Branch");

  if (errs.length) {
    alert("Please provide: " + errs.join(", "));
    return;
  }

  const appts = loadConsultAppointments();
  const appt = {
    id: "appt_" + Date.now(),
    createdAt: new Date().toISOString(),
    status: "pending",
    fullName: data.fullName.trim(),
    phone: (data.phone || "").trim(),
    email: (data.email || "").trim(),
    date: data.date,
    time: data.time,
    branch: data.branch,
    type: data.type,
    notes: (data.notes || "").trim()
  };

  appts.push(appt);
  saveConsultAppointments(appts);

  const successBox = document.getElementById("consultation-success-box");
  if (successBox) successBox.classList.remove("hidden");

  renderConsultList();
  form.reset();
}

// Tab Management Functions
function openTab(tabName, event) {
  event?.preventDefault?.();

  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.style.background = "transparent";
    btn.style.color = "var(--text-dark)";
  });

  if (event?.currentTarget) {
    event.currentTarget.style.background = "var(--brand-color)";
    event.currentTarget.style.color = "white";
  }

  if (tabName === "client") {
    showDistributorTab("shop");
    document
      .getElementById("distributorSubTabs")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (!currentAccountUser) {
    pendingPortalOverride = tabName;
    openLoginModal();
    activateModalTab(getLoginTabForPortal(tabName));
    return;
  }

  renderPortalForUser(currentAccountUser, { portalOverride: tabName });
  pendingPortalOverride = null;
}

function showDistributorTab(tabName, evt) {
  evt?.preventDefault?.();

  const sections = {
    shop: document.getElementById("shop-section"),
    checkup: document.getElementById("checkup-section"),
    media: document.getElementById("media-section"),
    testimonials: document.getElementById("testimonials-section")
  };

  document
    .querySelectorAll(".distributor-tab-btn")
    .forEach((btn) => btn.classList.remove("active"));
  if (evt?.currentTarget) {
    evt.currentTarget.classList.add("active");
  } else {
    document.querySelector(`.distributor-tab-btn[data-tab="${tabName}"]`)?.classList.add("active");
  }

  if (sections.media) {
    if (tabName === "media") {
      sections.media.classList.add("active");
    } else {
      sections.media.classList.remove("active");
    }
  }

  const targetSection = sections[tabName] || sections.shop;
  if (targetSection) {
    targetSection.classList.add("highlight-section");
    targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => targetSection.classList.remove("highlight-section"), 1200);
  }

  if (tabName === "testimonials") {
    loadTestimonials();
  }

  if (tabName === "shop") {
    loadShopProducts();
  }
}

function toggleLandingEditorButton(visible) {
  const button = document.getElementById("landingEditorButton");
  if (!button) return;
  button.style.display = visible ? "inline-block" : "none";
}

function openLandingEditorFromButton(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  openLandingPageEditor();
}

async function logout() {
  closeAccountMenu();

  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include"
    });
  } catch (error) {
    console.warn("Logout request failed (continuing with client-side sign-out).", error);
  }

  clearPersistedSession();

  renderAuthState(null);
  showToast("Signed out successfully.", "info");
  showSection("shop");
}

// Testimonials Functions
function loadTestimonials() {
  const contentDiv = document.getElementById("testimonialsContent");
  if (!contentDiv) return;

  try {
    let testimonials = JSON.parse(localStorage.getItem("dyna_testimonials") || "[]");

    if (testimonials.length === 0) {
      const defaultTestimonials = [
        {
          id: "TEST001",
          name: "Sarah M.",
          location: "Windhoek, Namibia",
          text: "Two years ago, I was dying… today, I am healthy and 6 months pregnant! Dynapharm products have truly transformed my life. I am so grateful for the natural solutions they provide.",
          date: new Date().toISOString(),
          approved: true
        },
        {
          id: "TEST002",
          name: "Maria K.",
          location: "Ondangwa, Namibia",
          text: "I had cancer of the ovaries stage 3… I have an option to treat it by taking Dynapharm products… The natural approach combined with my medical treatment has been life-changing. I feel stronger and more hopeful every day.",
          date: new Date().toISOString(),
          approved: true
        },
        {
          id: "TEST003",
          name: "John D.",
          location: "Swakopmund, Namibia",
          text: "My arthritic pain was unbearable… After using Dynapharm's natural relief products for just a few weeks, I noticed a significant improvement. I can now move freely without constant pain.",
          date: new Date().toISOString(),
          approved: true
        },
        {
          id: "TEST004",
          name: "Anna T.",
          location: "Rundu, Namibia",
          text: "I WAS A WALKING MEDICINE BOX, UNTIL DYNAPHARM. Now I take natural supplements and feel better than I have in years. The products are effective and I trust them completely.",
          date: new Date().toISOString(),
          approved: true
        },
        {
          id: "TEST005",
          name: "Grace L.",
          location: "Katima Mulilo, Namibia",
          text: "I HAD BREAST CANCER …NOW I AM HEALED! Dynapharm products have been an essential part of my healing journey. The support and quality products have given me hope and strength.",
          date: new Date().toISOString(),
          approved: true
        }
      ];
      localStorage.setItem("dyna_testimonials", JSON.stringify(defaultTestimonials));
      displayTestimonials(defaultTestimonials);
    } else {
      const approved = testimonials.filter((t) => t.approved !== false);
      displayTestimonials(approved);
    }
  } catch (error) {
    console.error("Error loading testimonials:", error);
    contentDiv.innerHTML =
      '<p style="text-align: center; color: #666; padding: 40px; grid-column: 1/-1;">Error loading testimonials.</p>';
  }
}

function displayTestimonials(testimonials) {
  const contentDiv = document.getElementById("testimonialsContent");
  if (!contentDiv) return;

  const sortedTestimonials = [...testimonials].sort(
    (a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)
  );

  contentDiv.innerHTML = "";

  if (sortedTestimonials.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.style.textAlign = "center";
    emptyMessage.style.color = "#666";
    emptyMessage.style.padding = "40px";
    emptyMessage.style.gridColumn = "1/-1";
    emptyMessage.textContent = "No testimonials yet. Be the first to share your story!";
    contentDiv.appendChild(emptyMessage);
    return;
  }

  sortedTestimonials.forEach((testimonial) => {
    const card = document.createElement("div");
    card.className = "testimonial-card-modern";

    const iconBg = document.createElement("div");
    iconBg.className = "testimonial-icon-bg";
    iconBg.textContent = "💬";

    const header = document.createElement("div");
    header.className = "testimonial-header-modern";

    const avatar = document.createElement("div");
    avatar.className = "testimonial-avatar";
    avatar.textContent = (testimonial.name || "").charAt(0).toUpperCase() || "•";

    const info = document.createElement("div");
    info.className = "testimonial-info-modern";

    const nameEl = document.createElement("h4");
    nameEl.textContent = testimonial.name || "Anonymous";

    const locationEl = document.createElement("p");
    locationEl.textContent = testimonial.location || "Namibia";

    info.appendChild(nameEl);
    info.appendChild(locationEl);

    header.appendChild(avatar);
    header.appendChild(info);

    const textEl = document.createElement("p");
    textEl.className = "testimonial-text-modern";
    textEl.textContent = `"${testimonial.text || ""}"`;

    const rating = document.createElement("div");
    rating.className = "testimonial-rating-modern";

    const stars = document.createElement("span");
    stars.textContent = "⭐⭐⭐⭐⭐";

    const dateEl = document.createElement("span");
    dateEl.className = "testimonial-date-modern";
    const testimonialDate = testimonial.date || testimonial.createdAt;
    dateEl.textContent = testimonialDate
      ? new Date(testimonialDate).toLocaleDateString("en-US", { year: "numeric", month: "long" })
      : "";

    rating.appendChild(stars);
    rating.appendChild(dateEl);

    card.appendChild(iconBg);
    card.appendChild(header);
    card.appendChild(textEl);
    card.appendChild(rating);

    contentDiv.appendChild(card);
  });
}

function submitTestimonial(event) {
  event.preventDefault();
  const name = document.getElementById("testimonialName").value.trim();
  const location = document.getElementById("testimonialLocation").value.trim();
  const text = document.getElementById("testimonialText").value.trim();

  if (!name || !text) {
    alert("Please fill in your name and testimonial.");
    return;
  }

  const testimonials = JSON.parse(localStorage.getItem("dyna_testimonials") || "[]");
  const newTestimonial = {
    id: "TEST" + Date.now(),
    name: name,
    location: location || "Namibia",
    text: text,
    date: new Date().toISOString(),
    approved: true
  };

  testimonials.push(newTestimonial);
  localStorage.setItem("dyna_testimonials", JSON.stringify(testimonials));

  document.getElementById("testimonialName").value = "";
  document.getElementById("testimonialLocation").value = "";
  document.getElementById("testimonialText").value = "";

  loadTestimonials();
  alert("Thank you for sharing your story! Your testimonial has been submitted.");
}

// Landing Page Content Management
function loadLandingPageContent() {
  try {
    const content = JSON.parse(localStorage.getItem("landingPageContent") || "{}");

    // Hero Section
    if (content.heroBadge) document.getElementById("heroBadge").textContent = content.heroBadge;
    if (content.heroTitleHighlight)
      document.getElementById("heroTitleHighlight").textContent = content.heroTitleHighlight;
    if (content.heroSubtitle)
      document.getElementById("heroSubtitle").textContent = content.heroSubtitle;
    if (content.statCustomers)
      document.getElementById("statCustomers").textContent = content.statCustomers;
    if (content.statProducts)
      document.getElementById("statProducts").textContent = content.statProducts;
    if (content.statBranches)
      document.getElementById("statBranches").textContent = content.statBranches;
    if (content.statSupport)
      document.getElementById("statSupport").textContent = content.statSupport;

    // Features Section
    if (content.featuresTitle)
      document.getElementById("featuresTitle").textContent = content.featuresTitle;
    if (content.featuresSubtitle)
      document.getElementById("featuresSubtitle").textContent = content.featuresSubtitle;
    if (content.feature1Title)
      document.getElementById("feature1Title").textContent = content.feature1Title;
    if (content.feature1Desc)
      document.getElementById("feature1Desc").textContent = content.feature1Desc;
    if (content.feature2Title)
      document.getElementById("feature2Title").textContent = content.feature2Title;
    if (content.feature2Desc)
      document.getElementById("feature2Desc").textContent = content.feature2Desc;
    if (content.feature3Title)
      document.getElementById("feature3Title").textContent = content.feature3Title;
    if (content.feature3Desc)
      document.getElementById("feature3Desc").textContent = content.feature3Desc;
    if (content.feature4Title)
      document.getElementById("feature4Title").textContent = content.feature4Title;
    if (content.feature4Desc)
      document.getElementById("feature4Desc").textContent = content.feature4Desc;
  } catch (e) {
    console.error("Error loading landing page content:", e);
  }
}

function saveLandingPageContent() {
  const content = {
    heroBadge: document.getElementById("editHeroBadge").value,
    heroTitleHighlight: document.getElementById("editHeroTitleHighlight").value,
    heroSubtitle: document.getElementById("editHeroSubtitle").value,
    statCustomers: document.getElementById("editStatCustomers").value,
    statProducts: document.getElementById("editStatProducts").value,
    statBranches: document.getElementById("editStatBranches").value,
    statSupport: document.getElementById("editStatSupport").value,
    featuresTitle: document.getElementById("editFeaturesTitle").value,
    featuresSubtitle: document.getElementById("editFeaturesSubtitle").value,
    feature1Title: document.getElementById("editFeature1Title").value,
    feature1Desc: document.getElementById("editFeature1Desc").value,
    feature2Title: document.getElementById("editFeature2Title").value,
    feature2Desc: document.getElementById("editFeature2Desc").value,
    feature3Title: document.getElementById("editFeature3Title").value,
    feature3Desc: document.getElementById("editFeature3Desc").value,
    feature4Title: document.getElementById("editFeature4Title").value,
    feature4Desc: document.getElementById("editFeature4Desc").value
  };

  localStorage.setItem("landingPageContent", JSON.stringify(content));
  loadLandingPageContent();
  alert("Landing page content saved successfully!");
}

function openLandingPageEditor() {
  const content = JSON.parse(localStorage.getItem("landingPageContent") || "{}");

  // Populate form fields
  document.getElementById("editHeroBadge").value =
    content.heroBadge || "🏥 Trusted Health Partner Since 2010";
  document.getElementById("editHeroTitleHighlight").value =
    content.heroTitleHighlight || "Natural Solutions";
  document.getElementById("editHeroSubtitle").value =
    content.heroSubtitle ||
    "Premium health products, expert consultations, and comprehensive wellness services designed to help you live your healthiest life.";
  document.getElementById("editStatCustomers").value = content.statCustomers || "10,000+";
  document.getElementById("editStatProducts").value = content.statProducts || "85+";
  document.getElementById("editStatBranches").value = content.statBranches || "5+";
  document.getElementById("editStatSupport").value = content.statSupport || "24/7";
  document.getElementById("editFeaturesTitle").value =
    content.featuresTitle || "Why Choose Dynapharm?";
  document.getElementById("editFeaturesSubtitle").value =
    content.featuresSubtitle || "Comprehensive health solutions tailored to your needs";
  document.getElementById("editFeature1Title").value =
    content.feature1Title || "Expert Consultations";
  document.getElementById("editFeature1Desc").value =
    content.feature1Desc ||
    "Book appointments with our experienced health consultants for personalized wellness guidance";
  document.getElementById("editFeature2Title").value = content.feature2Title || "Premium Products";
  document.getElementById("editFeature2Desc").value =
    content.feature2Desc ||
    "Browse our extensive catalog of 85+ health and wellness products from trusted brands";
  document.getElementById("editFeature3Title").value =
    content.feature3Title || "Distributor Program";
  document.getElementById("editFeature3Desc").value =
    content.feature3Desc ||
    "Join our network and earn while helping others achieve their wellness goals";
  document.getElementById("editFeature4Title").value =
    content.feature4Title || "Full Body Check-ups";
  document.getElementById("editFeature4Desc").value =
    content.feature4Desc ||
    "Comprehensive health assessments available at all our branch locations";

  // Show editor modal
  document.getElementById("landingPageEditorModal").style.display = "flex";
}

function closeLandingPageEditor() {
  document.getElementById("landingPageEditorModal").style.display = "none";
}

// Initialize on load
document.addEventListener("DOMContentLoaded", function () {
  loadLandingPageContent();
  toggleLandingEditorButton(false);

  // Ensure products section is active on load
  showDistributorTab("shop");
  const shopSectionEl = document.getElementById("shop-section");
  if (shopSectionEl) {
    requestAnimationFrame(() => {
      shopSectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
      shopSectionEl.classList.add("highlight-section");
      setTimeout(() => shopSectionEl.classList.remove("highlight-section"), 1200);
    });
  }

  const url = new URL(window.location.href);
  const requestedSection = url.searchParams.get("section");
  const requestedTab = url.searchParams.get("tab");
  const requestedModal = url.searchParams.get("modal");
  const hash = window.location.hash;

  const activateDistributorButton = (tabName) => {
    const subTabs = document.getElementById("distributorSubTabs");
    if (!subTabs) return;
    const tabButtons = subTabs.querySelectorAll("button.distributor-tab-btn");
    tabButtons.forEach((btn) => {
      btn.style.background = "transparent";
      btn.style.color = "var(--text-dark)";
    });
    const targetBtn = Array.from(tabButtons).find((btn) => {
      const onClick = btn.getAttribute("onclick") || "";
      return onClick.includes("'" + tabName + "'");
    });
    if (targetBtn) {
      targetBtn.style.background = "var(--brand-color)";
      targetBtn.style.color = "white";
    }
  };

  const validSections = ["shop", "about", "media"];
  const sectionToActivate =
    requestedSection && validSections.includes(requestedSection)
      ? requestedSection
      : hash === "#about-section"
        ? "about"
        : hash === "#media-section"
          ? "media"
          : hash === "#shop-section"
            ? "shop"
            : null;

  if (sectionToActivate) {
    showSection(sectionToActivate);
    const targetId = sectionToActivate === "shop" ? "shop-section" : `${sectionToActivate}-section`;
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.classList.add("active");
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const validTabs = ["shop", "checkup", "media", "testimonials"];
  const tabToActivate =
    requestedTab && validTabs.includes(requestedTab)
      ? requestedTab
      : hash === "#checkup"
        ? "checkup"
        : hash === "#media"
          ? "media"
          : hash === "#testimonials"
            ? "testimonials"
            : null;

  if (tabToActivate) {
    openTab("client");
    showDistributorTab(tabToActivate);
    document.getElementById("portalTabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
    activateDistributorButton(tabToActivate);
  }

  if (requestedModal === "login" || hash === "#loginModal") {
    openLoginModal();
  }

  const persistedUser = loadPersistedSession();
  renderAuthState(persistedUser);

  document.addEventListener("click", (event) => {
    if (!accountMenu || !accountNavItem) return;
    if (!accountNavItem.contains(event.target)) {
      closeAccountMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAccountMenu();
      if (document.getElementById("loginModal")?.classList.contains("active")) {
        closeLoginModal();
      }
    }
  });

  // Consultation booking form
  const consultForm = document.getElementById("consultation-booking-form");
  if (consultForm) {
    consultForm.addEventListener("submit", handleConsultationSubmit);
  }

  const resetConsultBtn = document.getElementById("reset-consult-form");
  if (resetConsultBtn) {
    resetConsultBtn.addEventListener("click", function () {
      if (consultForm) consultForm.reset();
      const successBox = document.getElementById("consultation-success-box");
      if (successBox) successBox.classList.add("hidden");
    });
  }

  const viewConsultBtn = document.getElementById("view-consult-appointments");
  if (viewConsultBtn) {
    viewConsultBtn.addEventListener("click", function () {
      const listCard = document.getElementById("consult-list-card");
      if (listCard) {
        listCard.classList.remove("hidden");
        renderConsultList();
        listCard.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  // Close modal on outside click
  document.getElementById("loginModal")?.addEventListener("click", function (e) {
    if (e.target === this) {
      closeLoginModal();
    }
  });

  // Close checkout modal on outside click
  document.getElementById("checkoutModal")?.addEventListener("click", function (e) {
    if (e.target === this) {
      closeCheckoutModal();
    }
  });

  // Allow Enter key to submit forms
  document.getElementById("distributorDOB")?.addEventListener("keypress", function (e) {
    if (e.key === "Enter") handleDistributorLogin();
  });
  document.getElementById("staffPassword")?.addEventListener("keypress", function (e) {
    if (e.key === "Enter") handleStaffLogin();
  });
  document.getElementById("adminPassword")?.addEventListener("keypress", function (e) {
    if (e.key === "Enter") handleAdminLogin();
  });
});

if (typeof window !== "undefined") {
  window.DynapharmApp = Object.freeze({
    loadShopProducts,
    loadTestimonials,
    loadPersistedSession,
    clearPersistedSession,
    persistSession
  });
}
