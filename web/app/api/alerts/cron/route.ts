import { changes } from "@/lib/changes/data";
import { getDataset } from "@/lib/data";
import { handleCron } from "@/lib/alerts/cron";
import { lifeDataFrom } from "@/lib/alerts/lifecycle";
import { closedTest, mailerFromEnv } from "@/lib/alerts/mail";
import { storeFromEnv } from "@/lib/alerts/store";

/*
  GET /api/alerts/cron[?date=YYYY-MM-DD][&dry=1]   Authorization: Bearer <CRON_SECRET | DEMO_TOKEN>
  The daily lifecycle alert run (web/vercel.json, 14:00 UTC: after local midnight in Los Angeles and New York).
  Events due today and in 30 days from the build-time data, one digest per subscriber (lib/alerts/daily.ts).
  DRY RUN unless ALERTS_CRON_SEND=1; ?date= (simulated day) and ?dry=1 always dry. See lib/alerts/cron.ts.
*/
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleCron(req, process.env, () => {
    const ds = getDataset();
    return {
      store: storeFromEnv(),
      mailer: mailerFromEnv(),
      data: ds ? lifeDataFrom(ds as unknown as Parameters<typeof lifeDataFrom>[0], changes) : null,
      closed: closedTest(),
      now: new Date(),
    };
  });
}
