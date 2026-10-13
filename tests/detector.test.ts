import { describe, expect, it } from "vitest";
import { detectApk } from "../src/detector";

describe("APK metadata", () => {
  it.each(["game.apk", "GAME.APK", "installer.ApK", "test_file.apk"])(
    "detects %s",
    (name) => {
      expect(detectApk(name).verdict).toBe("apk");
    },
  );
  it.each(["game.zip", "archive.apk.zip", "image.jpg"])(
    "does not label %s",
    (name) => {
      expect(detectApk(name).verdict).toBe("other");
    },
  );
  it("detects MIME without filename", () => {
    expect(
      detectApk(undefined, "APPLICATION/VND.ANDROID.PACKAGE-ARCHIVE").verdict,
    ).toBe("apk");
  });
  it("records missing metadata as unknown", () => {
    expect(detectApk().verdict).toBe("unknown");
  });
});
