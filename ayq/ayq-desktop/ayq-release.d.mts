// Types for the release identity, for the test that checks it. The module
// itself is plain JavaScript because packaging runs it directly.

export type AyqReleaseManifest = {
  productName: string;
  version: string;
  ayq?: { build?: unknown };
};

export type AyqReleaseIdentity = {
  product: string;
  version: string;
  build: string;
  identification: string;
  fileName: string;
};

export function releaseIdentity(source: AyqReleaseManifest): AyqReleaseIdentity;
export function ayqRelease(): AyqReleaseIdentity;
