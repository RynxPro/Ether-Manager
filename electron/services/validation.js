import path from "path";

export function assertPlainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${name}. Expected an object.`);
  }
  return value;
}

export function assertString(
  value,
  name,
  { allowEmpty = false, maxLength = 4096 } = {},
) {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${name}. Expected a string.`);
  }
  if (value.includes("\0")) {
    throw new Error(`Invalid ${name}.`);
  }
  if (!allowEmpty && value.trim().length === 0) {
    throw new Error(`Invalid ${name}.`);
  }
  if (value.length > maxLength) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

export function assertOptionalString(value, name, options = {}) {
  if (value == null) return null;
  return assertString(value, name, options);
}

export function assertBoolean(value, name) {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${name}. Expected a boolean.`);
  }
  return value;
}

export function assertInteger(
  value,
  name,
  { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {},
) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new Error(`Invalid ${name}. Expected an integer.`);
  }
  return num;
}

export function assertStringArray(value, name, { maxItems = 500 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`Invalid ${name}. Expected a string array.`);
  }
  value.forEach((item, index) => {
    assertString(item, `${name}[${index}]`);
  });
  return value;
}

export function assertIntegerArray(value, name, { maxItems = 200 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`Invalid ${name}. Expected an integer array.`);
  }
  return value.map((item, index) =>
    assertInteger(item, `${name}[${index}]`, { min: 1 }),
  );
}

export function isSubPath(basePath, targetPath) {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  return (
    resolvedTarget === resolvedBase ||
    resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)
  );
}

export function assertPathValue(value, name) {
  return assertString(value, name, { maxLength: 8192 });
}

export function assertFolderName(value, name) {
  const folderName = assertString(value, name, { maxLength: 255 });
  if (
    path.basename(folderName) !== folderName ||
    folderName.includes("/") ||
    folderName.includes("\\")
  ) {
    throw new Error(`Invalid ${name}.`);
  }
  return folderName;
}
