// @ayq/analytical-contract — public API.
//
// One type model and one runtime validator for the AYQ → AYQ Analyses
// analytical snapshot, contract 1.0 (A2 exchange 016 as corrected by 017;
// 03_DATA r017 §13). Synthetic fixture helpers live under `fixtures/` and are
// not part of this production surface.

export * from './types.ts';
export {
  CONTRACT_MAJOR,
  CONTRACT_MINOR,
  ContractValidationError,
  FORBIDDEN_KEYS,
  parseContractVersion,
  validateAnalyticalSnapshot,
} from './validate.ts';
export type { ContractIssue } from './validate.ts';
