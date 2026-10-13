export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

export function authorizedWebhook(
  actual: string | null,
  expected: string,
): boolean {
  if (!actual || !expected || actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function ownerIds(raw: string): number[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => /^\d+$/.test(id))
        .map(Number),
    ),
  ].filter((id) => Number.isSafeInteger(id) && id > 0);
}

export function parseGroupId(raw: string | undefined): number | null {
  if (!raw || !/^-\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}
