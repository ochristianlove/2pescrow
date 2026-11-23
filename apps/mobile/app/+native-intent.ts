import { resolveNativeIntentPath } from "../src/walletReturn";

export async function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    return await resolveNativeIntentPath({ path, initial });
  } catch {
    return initial ? path : "";
  }
}
