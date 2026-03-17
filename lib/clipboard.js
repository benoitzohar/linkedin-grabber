function escapeHtml(raw) {
  return String(raw)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function isValidPublicLinkedInUrl(url) {
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

function buildHtmlList(items) {
  const listItems = items
    .map(
      (item) =>
        `<li><a href="${escapeHtml(item.publicUrl)}">${escapeHtml(item.name)}</a></li>`
    )
    .join("");
  return `<ul>${listItems}</ul>`;
}

function buildPlainTextList(items) {
  return items.map((item) => `- ${item.name} (${item.publicUrl})`).join("\n");
}

export async function readPublicLinkedInUrlFromClipboard() {
  try {
    const clipboardText = await navigator.clipboard.readText();
    const text = String(clipboardText || "").trim();
    if (!isValidPublicLinkedInUrl(text)) {
      return "";
    }
    return text;
  } catch (_error) {
    return "";
  }
}

export async function writeProfileListToClipboard(items) {
  if (!items.length) {
    throw new Error("Cannot copy an empty profile list.");
  }

  const html = buildHtmlList(items);
  const text = buildPlainTextList(items);

  if (typeof ClipboardItem === "function" && navigator.clipboard?.write) {
    const payload = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" })
    });
    await navigator.clipboard.write([payload]);
    return;
  }

  await navigator.clipboard.writeText(text);
}
