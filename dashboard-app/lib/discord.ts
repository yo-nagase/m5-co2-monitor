export async function sendDiscord(content: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[discord] webhook returned ${res.status}`);
    }
  } catch (err) {
    console.error("[discord] webhook failed:", err);
  } finally {
    clearTimeout(timer);
  }
}
