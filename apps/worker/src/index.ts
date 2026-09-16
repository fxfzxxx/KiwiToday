/**
 * Long-running worker: schedules crawls and serves a health endpoint.
 *
 * pg-boss keeps the queue in the same Postgres the app already uses — no Redis
 * to run, and the job history lives next to the data it produced.
 */
import { createServer, type Server } from "node:http";
import PgBoss from "pg-boss";
import { closeDb, db } from "@kiwi/db";
import { runSource } from "./pipeline/run";

const QUEUE = "ingest-source";

interface IngestJob { slug: string; horizonDays?: number }

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const boss = new PgBoss({ connectionString, schema: "pgboss", retryLimit: 2, retryBackoff: true });
  boss.on("error", (err) => console.error("pg-boss error", err));
  await boss.start();
  await boss.createQueue(QUEUE);

  await boss.work<IngestJob>(QUEUE, { batchSize: 1 }, async ([job]) => {
    if (!job) return;
    const { slug, horizonDays } = job.data;
    console.log(`▶ ingest ${slug}`);
    await runSource(slug, { horizonDays });
  });

  // Hourly is the right cadence: listings change through the day (sold out,
  // cancelled, time moved) but no source rewards polling harder than this.
  const sources = await db()<{ slug: string }[]>`SELECT slug FROM sources WHERE enabled ORDER BY slug`;
  for (const { slug } of sources) {
    await boss.schedule(QUEUE, "0 * * * *", { slug }, { tz: "Pacific/Auckland", singletonKey: slug });
    console.log(`scheduled hourly ingest for ${slug}`);
  }

  const port = Number(process.env.PORT ?? 8080);
  const server = serveHealth(port, boss);

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, draining`);
    server.close();
    await boss.stop({ graceful: true, timeout: 30_000 }).catch(() => {});
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

/** Fly's health check hits /health; Node's built-in http is enough for one route. */
function serveHealth(port: number, boss: PgBoss): Server {
  const server = createServer(async (req, res) => {
    if (req.url === "/health") {
      try {
        const queued = await boss.getQueueSize(QUEUE);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, queued }));
      } catch (err) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(err) }));
      }
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, () => console.log(`worker health on :${port}`));
  return server;
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
