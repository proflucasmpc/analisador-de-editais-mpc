import { json } from "../lib/shared.mjs";

export default async () => json({
  ok: true,
  geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  adminConfigured: Boolean(process.env.ADMIN_SECRET),
  model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
});
