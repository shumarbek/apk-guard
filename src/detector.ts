export type Detection = {
  verdict: "apk" | "other" | "unknown";
  reason: string;
};

export function detectApk(fileName?: string, mimeType?: string): Detection {
  const name = fileName?.trim();
  const mime = mimeType?.trim().toLowerCase();
  const extension = !!name && /\.apk$/i.test(name);
  const apkMime = mime === "application/vnd.android.package-archive";
  if (extension && apkMime)
    return { verdict: "apk", reason: "kengaytma va MIME" };
  if (extension) return { verdict: "apk", reason: "kengaytma" };
  if (apkMime) return { verdict: "apk", reason: "MIME" };
  if (!name && !mime) return { verdict: "unknown", reason: "metadata yo‘q" };
  return { verdict: "other", reason: "APK dalili yo‘q" };
}
