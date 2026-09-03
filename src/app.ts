import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Request, type Response } from "express";
import hpp from "hpp";
import apiRouter from "./app/routes/index.js";
import { config } from "./config/index.js";
import { prisma } from "./lib/prisma/index.js";
import { redisClient } from "./lib/redis/index.js";
import { globalErrorHandler } from "./shared/middlewares/globalErrorHandler.js";

const app = express();

app.disable("x-powered-by");

app.use(
	cors({
		origin: config.cors.allowedOrigins.length
			? config.cors.allowedOrigins
			: true,
		credentials: true,
	}),
);

app.use(hpp());
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/", (_req: Request, res: Response) => {
	res.status(200).json({
		success: true,
		message: `${config.app.name} API is running`,
		data: {
			name: config.app.name,
			version: config.app.apiVersion,
			environment: config.app.nodeEnv,
		},
	});
});
app.use(`/api/${config.app.apiVersion}`, apiRouter);
app.get("/health", async (_req: Request, res: Response) => {
	const checks = {
		application: "healthy",
		database: "unknown",
		redis: "unknown",
	};

	try {
		await prisma.$queryRaw`SELECT 1`;
		checks.database = "healthy";
	} catch {
		checks.database = "unhealthy";
	}

	try {
		const pong = await redisClient.ping();
		checks.redis = pong === "PONG" ? "healthy" : "unhealthy";
	} catch {
		checks.redis = "unhealthy";
	}

	const healthy = checks.database === "healthy" && checks.redis === "healthy";

	res.status(healthy ? 200 : 503).json({
		success: healthy,
		message: healthy
			? "Dev-ment services are healthy"
			: "One or more Dev-ment services are unhealthy",
		data: checks,
	});
});

app.use((_req: Request, res: Response) => {
	res.status(404).json({
		success: false,
		message: "Route not found",
		errors: [],
	});
});

app.use(globalErrorHandler);

export default app;
