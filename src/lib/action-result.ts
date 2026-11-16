export type ActionResult =
  | { ok: true; message?: string; id?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export function fieldErrorsFromZod(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}): Record<string, string> {
  const flat = error.flatten().fieldErrors;
  const result: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages.length) result[key] = messages[0];
  }
  return result;
}
