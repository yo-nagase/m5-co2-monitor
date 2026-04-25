import { listDevices } from "@/lib/db";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const devices = await listDevices();

  return (
    <main className="px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">tamanegi dash</h1>
        <p className="text-sm text-zinc-500 mt-1">
          CO2 readings from registered M5Stack Core2 devices.
        </p>
      </header>

      {devices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
          No devices have reported yet. Configure a Core2 to POST to{" "}
          <code className="font-mono text-sm">/api/ingest</code>.
        </div>
      ) : (
        <Dashboard devices={devices} />
      )}
    </main>
  );
}
