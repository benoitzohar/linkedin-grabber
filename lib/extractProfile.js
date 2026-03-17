export const ERROR_CODES = Object.freeze({
  NAME_NOT_FOUND: "NAME_NOT_FOUND",
  PUBLIC_LINK_CONTROL_MISSING: "PUBLIC_LINK_CONTROL_MISSING",
  COPY_LINK_MISSING: "COPY_LINK_MISSING",
  PUBLIC_URL_NOT_FOUND: "PUBLIC_URL_NOT_FOUND",
  PUBLIC_URL_INVALID: "PUBLIC_URL_INVALID",
  SCRIPT_ERROR: "SCRIPT_ERROR"
});

function sanitizeName(name) {
  if (!name) {
    return "";
  }
  return String(name).replace(/\s+/g, " ").trim();
}

function isValidPublicLinkedInUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith("linkedin.com") &&
      /^\/in\/[^/?#]+\/?$/.test(parsed.pathname)
    );
  } catch (_error) {
    return false;
  }
}

export async function detectProfileName(tabId) {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractNameFromDocument
    });

    return {
      tabId,
      name: sanitizeName(injection?.result || "")
    };
  } catch (_error) {
    return {
      tabId,
      name: ""
    };
  }
}

export async function runPublicProfileExtraction(tabId, expectedProfileType = "auto") {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPublicProfileFromDocument,
      args: [expectedProfileType]
    });

    const result = injection?.result || {
      ok: false,
      errorCode: ERROR_CODES.SCRIPT_ERROR
    };

    if (!result.ok) {
      return {
        failure: {
          tabId,
          name: sanitizeName(result.name || ""),
          errorCode: ERROR_CODES[result.errorCode] || ERROR_CODES.SCRIPT_ERROR
        }
      };
    }

    const cleanedName = sanitizeName(result.name || "");
    const publicUrl = String(result.publicUrl || "").trim();
    if (!isValidPublicLinkedInUrl(publicUrl)) {
      return {
        failure: {
          tabId,
          name: cleanedName,
          errorCode: ERROR_CODES.PUBLIC_URL_INVALID
        }
      };
    }

    return {
      success: {
        tabId,
        name: cleanedName,
        publicUrl
      }
    };
  } catch (_error) {
    return {
      failure: {
        tabId,
        errorCode: ERROR_CODES.SCRIPT_ERROR
      }
    };
  }
}

export function extractNameFromDocument() {
  const selectors = [
    "h1",
    "[data-test-person-name]",
    "[data-control-name='profile_topcard_name']",
    "[data-anonymize='person-name']",
    ".profile-topcard-person-entity__name"
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!element) {
      continue;
    }
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    if (text && text.length >= 2) {
      return text;
    }
  }

  const title = document.title || "";
  const titleFirstPart = title.split("|")[0].split("-")[0].trim();
  return titleFirstPart;
}

export async function extractPublicProfileFromDocument(expectedProfileType = "auto") {
  const localCodes = {
    NAME_NOT_FOUND: "NAME_NOT_FOUND",
    PUBLIC_LINK_CONTROL_MISSING: "PUBLIC_LINK_CONTROL_MISSING",
    COPY_LINK_MISSING: "COPY_LINK_MISSING",
    PUBLIC_URL_NOT_FOUND: "PUBLIC_URL_NOT_FOUND",
    PUBLIC_URL_INVALID: "PUBLIC_URL_INVALID"
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const isVisible = (node) => {
    if (!(node instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(node);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return false;
    }

    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const extractName = () => {
    const selectors = [
      "h1",
      "[data-test-person-name]",
      "[data-control-name='profile_topcard_name']",
      "[data-anonymize='person-name']",
      ".profile-topcard-person-entity__name"
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (!node) {
        continue;
      }
      const text = normalize(node.textContent || "");
      if (text) {
        return text;
      }
    }

    const fromTitle = normalize((document.title || "").split("|")[0].split("-")[0]);
    return fromTitle;
  };

  const getLinkedInInUrl = (raw) => {
    const text = String(raw || "");
    const match = text.match(/https:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9%_.-]+\/?/i);
    if (!match) {
      return "";
    }
    const cleaned = match[0].replace(/[),.;\s]+$/g, "");
    return cleaned;
  };

  const canonicalPublicUrlFromRaw = (raw) => {
    try {
      const parsed = new URL(String(raw || ""));
      if (
        parsed.protocol !== "https:" ||
        !parsed.hostname.endsWith("linkedin.com") ||
        !/^\/in\/[^/?#]+\/?$/i.test(parsed.pathname)
      ) {
        return "";
      }
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch (_error) {
      return "";
    }
  };

  const scanDocumentForPublicUrl = () => {
    const selectorNodes = document.querySelectorAll(
      "input[value*='linkedin.com/in/'], textarea, a[href*='linkedin.com/in/'], [data-test-public-link]"
    );

    for (const node of selectorNodes) {
      if (!isVisible(node)) {
        continue;
      }

      const value = node.value || node.href || node.textContent || "";
      const candidate = getLinkedInInUrl(value);
      if (candidate) {
        return candidate;
      }
    }

    const visibleNodes = document.querySelectorAll("div,span,p");
    for (const node of visibleNodes) {
      if (!isVisible(node)) {
        continue;
      }
      const candidate = getLinkedInInUrl(node.textContent || "");
      if (candidate) {
        return candidate;
      }
    }

    return "";
  };

  const findClickableByText = (needles) => {
    const lowerNeedles = needles.map((item) => item.toLowerCase());
    const nodes = Array.from(
      document.querySelectorAll(
        "button,[role='button'],a,[aria-label],[title],span,div"
      )
    );

    let best = null;
    let bestScore = -1;

    for (const node of nodes) {
      if (!isVisible(node)) {
        continue;
      }

      const text = normalize(
        node.innerText || node.textContent || node.getAttribute("aria-label") || node.title
      ).toLowerCase();
      if (!text) {
        continue;
      }

      const matchedNeedle = lowerNeedles.find(
        (needle) => text === needle || text.startsWith(`${needle} `) || text.includes(needle)
      );
      if (!matchedNeedle) {
        continue;
      }

      let score = matchedNeedle.length;
      if (node.tagName === "BUTTON") {
        score += 4;
      }
      if (node.getAttribute("role") === "button") {
        score += 2;
      }
      if (text === matchedNeedle) {
        score += 5;
      }
      if (node.closest("[role='dialog']")) {
        score += 3;
      }

      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
    }

    return best;
  };

  const clickElement = (element) => {
    if (!element) {
      return;
    }
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    element.click();
  };

  const name = extractName();
  if (!name) {
    return { ok: false, errorCode: localCodes.NAME_NOT_FOUND };
  }

  const publicDirectUrl = canonicalPublicUrlFromRaw(window.location.href);
  const onPublicProfilePage = Boolean(publicDirectUrl);
  if (
    (expectedProfileType === "public" && publicDirectUrl) ||
    (expectedProfileType === "auto" && onPublicProfilePage)
  ) {
    return {
      ok: true,
      name,
      publicUrl: publicDirectUrl
    };
  }

  const publicLinkControl = findClickableByText(["public link"]);
  if (!publicLinkControl) {
    return { ok: false, name, errorCode: localCodes.PUBLIC_LINK_CONTROL_MISSING };
  }

  clickElement(publicLinkControl);
  await sleep(250);

  const copyLinkControl = findClickableByText(["copy link", "copy profile link"]);
  if (!copyLinkControl) {
    return { ok: false, name, errorCode: localCodes.COPY_LINK_MISSING };
  }

  clickElement(copyLinkControl);
  await sleep(180);

  const publicUrl = scanDocumentForPublicUrl();
  const canonicalPublicUrl = canonicalPublicUrlFromRaw(publicUrl);
  if (!canonicalPublicUrl) {
    return { ok: false, name, errorCode: localCodes.PUBLIC_URL_NOT_FOUND };
  }

  return {
    ok: true,
    name,
    publicUrl: canonicalPublicUrl
  };
}
