// Why a request failed, in a form the renderer can word (04 A24).
//
// Until 0.4.0 the engine said what went wrong in an English sentence, the
// renderer put that sentence on the screen, and adding Dutch would have meant
// translating the engine. Now a failure a person can see carries a code and
// bounded parameters; the catalogue owns the words. The English stays, as
// `detail`, for whoever reads a log — it is never what the window shows.
//
// A failure without a code of its own — a fault inside Actual, a request the
// renderer should never have sent — travels as `unexpected`, and the renderer
// says so in its own words rather than repeating whatever was thrown.

import type {
  AyqErrorCode,
  AyqErrorParams,
  AyqImportProblem,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

export class AyqEngineError extends Error {
  readonly code: AyqErrorCode;
  readonly params: AyqErrorParams | undefined;
  readonly problems: AyqImportProblem[] | undefined;

  constructor(
    code: AyqErrorCode,
    detail: string,
    params?: AyqErrorParams,
    problems?: AyqImportProblem[],
  ) {
    super(detail);
    this.code = code;
    this.params = params;
    this.problems = problems;
  }
}

/** The code a thrown value carries, or `unexpected` when it carries none. */
export function ayqErrorCodeOf(error: unknown): {
  code: AyqErrorCode;
  params?: AyqErrorParams;
  problems?: AyqImportProblem[];
} {
  if (error instanceof AyqEngineError) {
    return {
      code: error.code,
      ...(error.params === undefined ? {} : { params: error.params }),
      ...(error.problems === undefined ? {} : { problems: error.problems }),
    };
  }
  return { code: 'unexpected' };
}
