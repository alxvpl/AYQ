/** One package's notice, as notices.mjs writes it to notices.json. */
export interface PackageNotice {
  name: string;
  version: string;
  licence: string | null;
  source: 'file' | 'standard';
  files: string[];
  sha256: string;
}

/** dist/notices.json: the packaged set's notices, Electron's and Chromium's. */
export interface NoticeRecord {
  packages: PackageNotice[];
  electron: { version: string; licenceSha256: string };
  chromium: { file: string; sha256: string };
}

/**
 * The application bundled into a directory, as build.mjs does for dist/,
 * with the third-party notices of the packaged set written beside it.
 */
export function buildApplication(outDir: string): Promise<{ bundled: string[]; notices: NoticeRecord }>;
