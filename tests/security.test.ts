import { describe, expect, it } from "vitest";
import {
  authorizedWebhook,
  escapeHtml,
  ownerIds,
  parseGroupId,
} from "../src/security";

describe("security", () => {
  it("rejects missing and wrong webhook tokens", () => {
    expect(authorizedWebhook(null, "secret")).toBe(false);
    expect(authorizedWebhook("wrong!", "secret")).toBe(false);
    expect(authorizedWebhook("secret", "secret")).toBe(true);
  });
  it("escapes HTML payloads", () => {
    expect(escapeHtml("<img src='x'>&")).toBe(
      "&lt;img src=&#39;x&#39;&gt;&amp;",
    );
  });
  it("validates IDs", () => {
    expect(ownerIds("1, 1, nope, 2")).toEqual([1, 2]);
    expect(parseGroupId("-100123")).toBe(-100123);
    expect(parseGroupId("1 OR 1=1")).toBeNull();
  });
});
