import type { Server } from "node:http";
import app from "./app.js";
import { config } from "./config/index.js";
import { connectDatabase, disconnectDatabase } from "./lib/prisma/index.js";
import { connectRedis, disconnectRedis } from "./lib/redis/index.js";
import { ensureSeedData } from "./seed/index.js";
import { logger } from "./shared/utils/index.js";

let server: Server | null = null;

const shutdown = async (signal: string) => {
	logger.info({ signal }, "Shutdown initiated");

	if (server) {
		await new Promise<void>((resolve, reject) => {
			server?.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	}

	await Promise.allSettled([disconnectRedis(), disconnectDatabase()]);

	process.exit(0);
};

export const bootstrap = async () => {
	try {
		await connectDatabase();
		await ensureSeedData();
		await connectRedis();

		server = app.listen(config.app.port, () => {
			logger.info(
				{
					port: config.app.port,
					apiBaseUrl: config.app.apiBaseUrl,
				},
				`${config.app.name} server running`,
			);
		});

		process.once("SIGINT", () => {
			void shutdown("SIGINT");
		});

		process.once("SIGTERM", () => {
			void shutdown("SIGTERM");
		});
	} catch (error) {
		logger.fatal({ err: error }, "Application startup failed");

		await Promise.allSettled([disconnectRedis(), disconnectDatabase()]);

		process.exit(1);
	}
};
