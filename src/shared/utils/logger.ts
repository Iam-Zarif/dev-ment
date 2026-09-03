import pino from "pino";
import { config } from "../../config/index.js";

export const logger = pino({
	level: config.logging.level,
	base: {
		service: config.app.name,
		environment: config.app.nodeEnv,
	},
	redact: {
		paths: [
			"password",
			"passwordHash",
			"token",
			"accessToken",
			"refreshToken",
			"authorization",
			"req.headers.authorization",
			"SMTP_PASS",
			"DATABASE_URL",
			"REDIS_URL",
			"STRIPE_SECRET_KEY",
		],
		remove: true,
	},
});
