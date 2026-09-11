import { getConnection, query, notificationPool } from "../services/notificationDb.js";
import { getMailer, mailFrom, closeMailer } from "../services/mailer.js";
import { clientBaseUrl } from "../services/notificationTemplates.js";
import { processOutbox } from "../services/emailOutbox.js";

let stopping = false;
let timer;
let wake;
const stop = () => { stopping = true; clearTimeout(timer); wake?.(); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

async function run() {
  if (process.env.NOTIFICATION_EMAIL_ENABLED !== "true") {
    console.info("email_worker_disabled");
    return;
  }
  const clientUrl = clientBaseUrl(process.env.CLIENT_URL);
  const mailer = getMailer();
  do {
    let connection;
    try {
      connection = await getConnection();
      await processOutbox({
        query: (sql, values) => query(connection, sql, values),
        sendMail: (mail) => mailer.sendMail(mail),
        from: mailFrom(), clientUrl, shouldStop: () => stopping,
      });
    } catch {
      // Destroy on failure so an advisory lock can never return to the pool.
      connection?.destroy();
      console.error("email_worker_batch_failed");
      if (process.argv.includes("--once")) process.exitCode = 1;
    } finally {
      connection?.release();
    }
    if (!stopping && !process.argv.includes("--once")) {
      await new Promise((resolve) => { wake = resolve; timer = setTimeout(resolve, 10000); });
      wake = null;
    }
  } while (!stopping && !process.argv.includes("--once"));
}

run().catch(() => {
  console.error("email_worker_configuration_invalid");
  process.exitCode = 1;
}).finally(() => {
  closeMailer();
  notificationPool.end();
});
