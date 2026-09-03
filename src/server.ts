import app from "./app.js";
import { config } from "./config/index.js";
import { connectDatabase, disconnectDatabase } from "./lib/prisma/index.js";
import { connectRedis, disconnectRedis } from "./lib/redis/index.js";

let server: ReturnType<typeof app.listen> | undefined;

const bootstrap = async () => {
	try {
		await connectDatabase();
		console.log("PostgreSQL connected");

		await connectRedis();
		console.log("Redis connected");

		server = app.listen(config.app.port, () => {
			console.log(`${config.app.name} server running on ${config.app.baseUrl}`);
			console.log(`API base URL: ${config.app.apiBaseUrl}`);
		});
	} catch (error) {
		console.error("Application startup failed:", error);

		await disconnectDatabase().catch(() => undefined);
		await disconnectRedis().catch(() => undefined);

		process.exit(1);
	}
};

const shutdown = async (signal: string) => {
	console.log(`${signal} received`);

	if (server) {
		server.close(async () => {
			await disconnectRedis().catch(() => undefined);
			await disconnectDatabase().catch(() => undefined);

			console.log("Server shutdown completed");

			process.exit(0);
		});

		return;
	}

	await disconnectRedis().catch(() => undefined);
	await disconnectDatabase().catch(() => undefined);

	process.exit(0);
};

process.on("SIGTERM", () => {
	void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
	void shutdown("SIGINT");
});

process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error);
	void shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
	console.error("Unhandled rejection:", reason);
	void shutdown("unhandledRejection");
});

void bootstrap();
