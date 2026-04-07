const FORBIDDEN_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "textarea",
  "button",
  "select",
  "option",
  "link",
  "meta",
  "base",
  "svg",
  "math",
  "canvas",
]);

function isSafeUrl(url) {
  if (!url) return false;

  const normalized = String(url).trim().toLowerCase();
  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("/") ||
    normalized.startsWith("#")
  );
}

export function sanitizeHtml(html) {
  if (!html) return "";
  if (typeof document === "undefined") return String(html);

  const template = document.createElement("template");
  template.innerHTML = String(html);

  const elements = template.content.querySelectorAll("*");
  elements.forEach((element) => {
    const tagName = element.tagName.toLowerCase();

    if (FORBIDDEN_TAGS.has(tagName)) {
      element.remove();
      return;
    }

    for (const attr of [...element.attributes]) {
      const attrName = attr.name.toLowerCase();
      const attrValue = attr.value;

      if (
        attrName.startsWith("on") ||
        attrName === "style" ||
        attrName === "srcdoc" ||
        attrName === "formaction"
      ) {
        element.removeAttribute(attr.name);
        continue;
      }

      if (["href", "src", "xlink:href", "action"].includes(attrName)) {
        if (!isSafeUrl(attrValue)) {
          element.removeAttribute(attr.name);
        }
      }
    }

    if (tagName === "a") {
      const href = element.getAttribute("href");
      if (!isSafeUrl(href)) {
        element.removeAttribute("href");
      } else {
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noreferrer noopener");
      }
    }
  });

  return template.innerHTML;
}
