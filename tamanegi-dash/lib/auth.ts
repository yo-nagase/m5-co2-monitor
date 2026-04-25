import { timingSafeEqual } from "node:crypto";

export function checkApiKey(req: Request): boolean {
  const expected = process.env.API_KEY;
  if (!expected) return false;

  const got = req.headers.get("x-api-key") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
