// Types for the build stamp, for the test that checks it. The module itself is
// plain JavaScript because the build runs it directly.

export type AyqBuildInfo = {
  productVersion: string;
  buildNumber: string;
  identification: string;
  buildDate: string;
  revision: string | null;
  architecture: string;
  platform: string;
  development: boolean;
};

export function ayqBuildInfo(): AyqBuildInfo;
