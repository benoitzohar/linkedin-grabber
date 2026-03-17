const LINKEDIN_HOST_RE = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\//i;
const PUBLIC_PROFILE_PATH_RE = /^\/in\/[^/?#]+\/?$/i;

function hasRecruiterContext(url) {
  const lower = String(url || "").toLowerCase();
  return lower.includes("/talent/") || lower.includes("/recruiter/");
}

function hasProfileHint(url) {
  const lower = String(url || "").toLowerCase();
  const hints = ["/profile/", "/candidate/", "/view/"];
  return hints.some((hint) => lower.includes(hint));
}

function parseTabUrl(tab) {
  try {
    return new URL(tab?.url || "");
  } catch (_error) {
    return null;
  }
}

function isPublicProfileUrl(parsedUrl) {
  if (!parsedUrl) {
    return false;
  }
  return PUBLIC_PROFILE_PATH_RE.test(parsedUrl.pathname || "");
}

export function getLinkedInProfileTabType(tab) {
  if (!tab || typeof tab.id !== "number") {
    return null;
  }

  const parsedUrl = parseTabUrl(tab);
  const url = parsedUrl?.href || tab.url || "";
  if (!LINKEDIN_HOST_RE.test(url)) {
    return null;
  }

  if (isPublicProfileUrl(parsedUrl)) {
    return "public";
  }

  if (hasRecruiterContext(url) && hasProfileHint(url)) {
    return "recruiter";
  }

  const title = (tab.title || "").toLowerCase();
  if (
    hasRecruiterContext(url) &&
    title.includes("linkedin") &&
    title.includes("profile")
  ) {
    return "recruiter";
  }

  return null;
}

export function isRecruiterProfileTab(tab) {
  return getLinkedInProfileTabType(tab) === "recruiter";
}

export async function discoverLinkedInProfileTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs
    .map((tab) => ({
      ...tab,
      profileType: getLinkedInProfileTabType(tab)
    }))
    .filter((tab) => tab.profileType === "recruiter" || tab.profileType === "public")
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map((tab) => ({
      id: tab.id,
      title: tab.title || "",
      url: tab.url || "",
      profileType: tab.profileType
    }));
}

export const discoverRecruiterProfileTabs = discoverLinkedInProfileTabs;
