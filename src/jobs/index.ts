import cron from "node-cron";
import { ATTEMPT_CONSTANTS } from "../app/modules/attempt/attempt.constant.js";
import { config } from "../config/index.js";
import { logger } from "../shared/utils/index.js";
import { autoSubmitExpiredAttempts } from "./attemptExpiry.job.js";

let attemptExpiryTask: ReturnType<typeof cron.schedule> | null = null;

export const startJobs = (): void => {
	if (
		!config.cron.enabled ||
		!config.cron.useInProcessCron ||
		attemptExpiryTask
	) {
		return;
	}

	attemptExpiryTask = cron.schedule(
		ATTEMPT_CONSTANTS.EXPIRY_CRON,
		() => {
			void autoSubmitExpiredAttempts()
				.then((count) => {
					if (count > 0) {
						logger.info(
							{
								count,
							},
							"Expired attempts auto-submitted",
						);
					}
				})
				.catch((error) => {
					logger.error(
						{
							err: error,
						},
						"Attempt expiry job failed",
					);
				});
		},
		{
			timezone: config.cron.timezone,
			noOverlap: true,
		},
	);
};

export const stopJobs = (): void => {
	if (!attemptExpiryTask) {
		return;
	}

	attemptExpiryTask.stop();
	attemptExpiryTask = null;
};
