// Reading and writing the interface settings, from the renderer's side.
//
// One door outwards, the same as everything else: the bridge and the contract
// (02 §3.1, §3.2). The renderer never touches a file.

import { ayqAsk } from './ayq-bridge.ts';
import type { AyqSettings } from './ayq-ipc-contract.ts';

export async function ayqReadSettings(): Promise<AyqSettings> {
  const answer = await ayqAsk({ kind: 'settings.get' });
  if (!answer.ok) throw new Error(answer.message);
  return answer.result as AyqSettings;
}

export async function ayqWriteSettings(
  settings: AyqSettings,
): Promise<AyqSettings> {
  const answer = await ayqAsk({ kind: 'settings.set', settings });
  if (!answer.ok) throw new Error(answer.message);
  return answer.result as AyqSettings;
}
