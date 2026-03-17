import { readPublicLinkedInUrlFromClipboard, writeProfileListToClipboard } from "../lib/clipboard.js";
import { ERROR_CODES, detectProfileName, runPublicProfileExtraction } from "../lib/extractProfile.js";
import { discoverLinkedInProfileTabs } from "../lib/tabDiscovery.js";

const state = {
  rows: [],
  busy: false
};

const statusEl = document.getElementById("status");
const profileListEl = document.getElementById("profileList");
const copyButtonEl = document.getElementById("copyButton");
const selectAllButtonEl = document.getElementById("selectAllButton");

copyButtonEl.addEventListener("click", onCopyClicked);
selectAllButtonEl.addEventListener("click", onSelectAllClicked);

void loadTabs();

async function loadTabs() {
  setStatus("Scanning current window tabs...", "info");

  let tabs = [];
  try {
    tabs = await discoverLinkedInProfileTabs();
  } catch (_error) {
    setStatus("Unable to read browser tabs. Please reload the extension.", "error");
    return;
  }

  state.rows = tabs.map((tab) => ({
    tabId: tab.id,
    tabTitle: tab.title,
    profileType: tab.profileType,
    detectedName: "",
    checked: true,
    state: "loading"
  }));

  renderRows();
  updateCopyButtonState();

  if (!state.rows.length) {
    setStatus(
      "No LinkedIn profile tabs found in this window.",
      "warning"
    );
    return;
  }

  setStatus(`Found ${state.rows.length} LinkedIn profile tab(s). Resolving names...`, "info");

  await Promise.all(
    state.rows.map(async (row) => {
      const result = await detectProfileName(row.tabId);
      row.detectedName = result.name || deriveNameFromTitle(row.tabTitle);
      row.state = row.detectedName ? "ready" : "error";
    })
  );

  renderRows();
  updateCopyButtonState();
  setStatus("Select profiles and click Copy.", "info");
}

async function onCopyClicked() {
  if (state.busy) {
    return;
  }

  const selectedRows = state.rows.filter((row) => row.checked);
  if (!selectedRows.length) {
    setStatus("Select at least one profile before copying.", "warning");
    return;
  }

  state.busy = true;
  renderRows();
  updateCopyButtonState();
  setStatus("Collecting public links from selected tabs...", "info");

  const successes = [];
  const failures = [];

  for (const row of selectedRows) {
    const extraction = await runPublicProfileExtraction(row.tabId, row.profileType || "auto");
    if (extraction.success) {
      successes.push({
        name: extraction.success.name || row.detectedName || deriveNameFromTitle(row.tabTitle),
        publicUrl: extraction.success.publicUrl
      });
      continue;
    }

    const failure = extraction.failure || {
      tabId: row.tabId,
      errorCode: ERROR_CODES.SCRIPT_ERROR
    };

    if (failure.errorCode === ERROR_CODES.PUBLIC_URL_NOT_FOUND) {
      const clipboardUrl = await readPublicLinkedInUrlFromClipboard();
      if (clipboardUrl) {
        successes.push({
          name: failure.name || row.detectedName || deriveNameFromTitle(row.tabTitle),
          publicUrl: clipboardUrl
        });
        continue;
      }
    }

    failures.push({
      tabId: row.tabId,
      label: failure.name || row.detectedName || deriveNameFromTitle(row.tabTitle),
      errorCode: failure.errorCode
    });
  }

  if (!successes.length) {
    state.busy = false;
    renderRows();
    updateCopyButtonState();
    setStatus("No profiles were copied. Public links could not be extracted.", "error", failures);
    return;
  }

  try {
    await writeProfileListToClipboard(successes);
  } catch (_error) {
    state.busy = false;
    renderRows();
    updateCopyButtonState();
    setStatus("Copy failed. Check clipboard permissions for this extension.", "error");
    return;
  }

  state.busy = false;
  renderRows();
  updateCopyButtonState();

  const copiedMessage = `Copied ${successes.length} profile(s) to clipboard.`;
  if (!failures.length) {
    setStatus(copiedMessage, "success");
    return;
  }

  setStatus(`${copiedMessage} ${failures.length} tab(s) were skipped.`, "warning", failures);
}

function updateCopyButtonState() {
  const hasRows = state.rows.length > 0;
  const hasSelectedRows = state.rows.some((row) => row.checked);
  copyButtonEl.disabled = state.busy || !hasRows || !hasSelectedRows;
  copyButtonEl.textContent = state.busy ? "Copying..." : "Copy";
  updateSelectAllButtonState();
}

function updateSelectAllButtonState() {
  const hasRows = state.rows.length > 0;
  const allSelected = hasRows && state.rows.every((row) => row.checked);
  const shouldShow = hasRows && !allSelected;

  selectAllButtonEl.hidden = !shouldShow;
  selectAllButtonEl.disabled = state.busy;
}

function renderRows() {
  profileListEl.textContent = "";

  for (const row of state.rows) {
    const listItem = document.createElement("li");
    listItem.className = "profile-row";
    listItem.tabIndex = 0;
    listItem.setAttribute("role", "checkbox");
    listItem.setAttribute("aria-checked", String(row.checked));

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = row.checked;
    checkbox.disabled = state.busy;
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    checkbox.addEventListener("change", (event) => {
      row.checked = Boolean(event.target.checked);
      applyRowVisualState();
      updateCopyButtonState();
    });

    const details = document.createElement("div");
    details.className = "profile-main";

    const nameEl = document.createElement("div");
    nameEl.className = "profile-name";
    const fallbackName = deriveNameFromTitle(row.tabTitle);
    if (row.state === "loading") {
      nameEl.textContent = "Loading profile name...";
    } else if (row.detectedName) {
      nameEl.textContent = row.detectedName;
    } else {
      nameEl.textContent = fallbackName;
    }

    const subtitle = document.createElement("div");
    subtitle.className = "profile-subtitle";
    subtitle.textContent = row.tabTitle || `LinkedIn tab #${row.tabId}`;

    const badge = document.createElement("div");
    badge.className = "profile-badge";
    badge.textContent = row.profileType === "recruiter" ? "Recruiter" : "Public";

    details.appendChild(nameEl);
    details.appendChild(badge);
    details.appendChild(subtitle);

    const toggleRow = () => {
      if (state.busy) {
        return;
      }
      row.checked = !row.checked;
      checkbox.checked = row.checked;
      applyRowVisualState();
      updateCopyButtonState();
    };

    const applyRowVisualState = () => {
      listItem.classList.toggle("profile-row-selected", row.checked);
      listItem.classList.toggle("profile-row-disabled", state.busy);
      listItem.setAttribute("aria-checked", String(row.checked));
    };

    listItem.addEventListener("click", toggleRow);
    listItem.addEventListener("keydown", (event) => {
      if (event.key !== " " && event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      toggleRow();
    });

    applyRowVisualState();

    listItem.appendChild(checkbox);
    listItem.appendChild(details);
    profileListEl.appendChild(listItem);
  }
}

function setStatus(message, level, failures = []) {
  const levelClassMap = {
    info: "status-info",
    success: "status-success",
    warning: "status-warning",
    error: "status-error"
  };

  const levelClass = levelClassMap[level] || levelClassMap.info;
  statusEl.className = `status ${levelClass}`;
  statusEl.textContent = message;

  if (!failures.length) {
    return;
  }

  const list = document.createElement("ul");
  list.className = "warning-list";
  for (const failure of failures) {
    const item = document.createElement("li");
    item.textContent = `${failure.label}: ${humanizeErrorCode(failure.errorCode)}`;
    list.appendChild(item);
  }
  statusEl.appendChild(list);
}

function deriveNameFromTitle(tabTitle) {
  const title = String(tabTitle || "").trim();
  if (!title) {
    return "Unknown Profile";
  }

  const firstCut = title.split("|")[0].trim();
  const secondCut = firstCut.split(" - ")[0].trim();
  const withoutNotificationCount = secondCut.replace(/^(\(\d+\)\s*)+/u, "").trim();
  return withoutNotificationCount || "Unknown Profile";
}

function humanizeErrorCode(errorCode) {
  const lookup = {
    [ERROR_CODES.NAME_NOT_FOUND]: "name not found",
    [ERROR_CODES.PUBLIC_LINK_CONTROL_MISSING]: "Public Link control not found",
    [ERROR_CODES.COPY_LINK_MISSING]: "Copy link control not found",
    [ERROR_CODES.PUBLIC_URL_NOT_FOUND]: "public URL not found",
    [ERROR_CODES.PUBLIC_URL_INVALID]: "public URL is invalid",
    [ERROR_CODES.SCRIPT_ERROR]: "script execution failed"
  };

  return lookup[errorCode] || "unknown error";
}

function onSelectAllClicked() {
  if (state.busy) {
    return;
  }
  for (const row of state.rows) {
    row.checked = true;
  }
  renderRows();
  updateCopyButtonState();
}
