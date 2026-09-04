import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (value: unknown) => {
	if (typeof value === "string" && value.trim() === "") {
		return undefined;
	}

	return value;
};

const optionalString = z.preprocess(
	emptyToUndefined,
	z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());

const booleanFromEnv = z.preprocess((value) => {
	if (typeof value === "boolean") {
		return value;
	}

	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();

		if (normalized === "true") {
			return true;
		}

		if (normalized === "false") {
			return false;
		}
	}

	return value;
}, z.boolean());

const rawEnvSchema = z
	.object({
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),

		PORT: z.coerce.number().int().positive().default(5001),
		APP_NAME: z.string().trim().min(1).default("Dev-ment"),
		API_VERSION: z.string().trim().min(1).default("v1"),
		APP_BASE_URL: optionalUrl,
		FRONTEND_URL: optionalUrl,
		VERCEL: optionalString,
		VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
		VERCEL_URL: optionalString,
		VERCEL_PROJECT_PRODUCTION_URL: optionalString,
		TIMEZONE: z.string().trim().min(1).default("Asia/Dhaka"),
		DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
		JWT_ACCESS_SECRET: z
			.string()
			.min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
		JWT_REFRESH_SECRET: z
			.string()
			.min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
		JWT_ACCESS_EXPIRES_IN: z.string().trim().default("15m"),
		JWT_REFRESH_EXPIRES_IN: z.string().trim().default("7d"),
		BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
		REDIS_URL: z.string().trim().min(1, "REDIS_URL is required"),
		REDIS_KEY_PREFIX: z.string().trim().default("devment:"),
		REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
		REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
		OTP_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(300),
		OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
		OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
		GOOGLE_CLIENT_ID: optionalString,
		GOOGLE_CLIENT_SECRET: optionalString,
		SMTP_HOST: z.string().trim().default("smtp.gmail.com"),
		SMTP_PORT: z.coerce.number().int().positive().default(587),
		SMTP_SECURE: booleanFromEnv.default(false),
		SMTP_USER: optionalString,
		SMTP_PASS: optionalString,
		EMAIL_FROM_NAME: z.string().trim().default("Dev-ment"),
		EMAIL_FROM_ADDRESS: optionalString,
		CLOUDINARY_CLOUD_NAME: optionalString,
		CLOUDINARY_API_KEY: optionalString,
		CLOUDINARY_API_SECRET: optionalString,
		CLOUDINARY_ROOT_FOLDER: z.string().trim().default("dev-ment"),
		STRIPE_SECRET_KEY: optionalString,
		STRIPE_PUBLISHABLE_KEY: optionalString,
		STRIPE_WEBHOOK_SECRET: optionalString,
		STRIPE_CURRENCY: z.string().trim().toLowerCase().default("usd"),
		STRIPE_SUCCESS_URL: optionalUrl,
		STRIPE_CANCEL_URL: optionalUrl,
		ALLOWED_ORIGINS: optionalString,
		RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
		RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(200),
		AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce
			.number()
			.int()
			.positive()
			.default(20),

		CRON_ENABLED: booleanFromEnv.default(true),
		CRON_TIMEZONE: z.string().trim().default("Asia/Dhaka"),
		CRON_SECRET: optionalString,
		SEED_ADMIN_NAME: z.string().trim().default("Dev-ment Admin"),
		SEED_ADMIN_EMAIL: z.email().default("admin@mostofafatin.com"),
		SEED_ADMIN_PASSWORD: z.string().min(8),
		SEED_CANDIDATE_NAME: z.string().trim().default("Demo Candidate"),
		SEED_CANDIDATE_EMAIL: z.email().default("candidate@mostofafatin.com"),
		SEED_CANDIDATE_PASSWORD: z.string().min(8),
		SEED_CANDIDATE_HEADLINE: z.string().trim().default("Full Stack Developer"),
		SEED_CANDIDATE_GITHUB_URL: optionalUrl,
		SEED_CANDIDATE_LINKEDIN_URL: optionalUrl,
		SEED_CANDIDATE_PORTFOLIO_URL: optionalUrl,
		SEED_RECRUITER_NAME: z.string().trim().default("Demo Recruiter"),
		SEED_RECRUITER_EMAIL: z.email().default("recruiter@mostofafatin.com"),
		SEED_RECRUITER_PASSWORD: z.string().min(8),
		INVITATION_EMAIL_RATE_PER_SECOND: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.default(20),

		INVITATION_EMAIL_CONCURRENCY: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.default(20),

		INVITATION_EMAIL_MAX_ATTEMPTS: z.coerce
			.number()
			.int()
			.min(1)
			.max(10)
			.default(3),

		INVITATION_EMAIL_RETRY_DELAY_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(2000),

		INVITATION_QUEUE_WORKER_ENABLED: booleanFromEnv.default(true),
		SEED_RECRUITER_JOB_TITLE: z.string().trim().default("Technical Recruiter"),
		SEED_RECRUITER_COMPANY_NAME: z
			.string()
			.trim()
			.default("Mostofa Fatin Technologies"),

		SEED_RECRUITER_COMPANY_DOMAIN: z
			.string()
			.trim()
			.default("mostofafatin.com"),

		SEED_RECRUITER_COMPANY_WEBSITE: optionalUrl,

		SEED_RECRUITER_FREE_CREDITS: z.coerce.number().int().positive().default(2),

		LOG_LEVEL: z
			.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
			.default("debug"),
	})
	.superRefine((data, ctx) => {
		if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
			ctx.addIssue({
				code: "custom",
				path: ["JWT_REFRESH_SECRET"],
				message: "Access and refresh JWT secrets must be different",
			});
		}

		const isVercel = Boolean(
			data.VERCEL ||
				data.VERCEL_ENV ||
				data.VERCEL_URL ||
				data.VERCEL_PROJECT_PRODUCTION_URL,
		);

		const isProduction =
			data.NODE_ENV === "production" || data.VERCEL_ENV === "production";

		if (!isProduction) {
			return;
		}

		if (
			!data.APP_BASE_URL &&
			!data.VERCEL_PROJECT_PRODUCTION_URL &&
			!data.VERCEL_URL
		) {
			ctx.addIssue({
				code: "custom",
				path: ["APP_BASE_URL"],
				message: "Production requires APP_BASE_URL or a Vercel deployment URL",
			});
		}

		if (
			data.REDIS_URL.includes("localhost") ||
			data.REDIS_URL.includes("127.0.0.1")
		) {
			ctx.addIssue({
				code: "custom",
				path: ["REDIS_URL"],
				message: "Production Redis cannot use localhost",
			});
		}

		const requiredValues: Array<[keyof typeof data, unknown]> = [
			["GOOGLE_CLIENT_ID", data.GOOGLE_CLIENT_ID],
			["GOOGLE_CLIENT_SECRET", data.GOOGLE_CLIENT_SECRET],
			["SMTP_USER", data.SMTP_USER],
			["SMTP_PASS", data.SMTP_PASS],
			["CLOUDINARY_CLOUD_NAME", data.CLOUDINARY_CLOUD_NAME],
			["CLOUDINARY_API_KEY", data.CLOUDINARY_API_KEY],
			["CLOUDINARY_API_SECRET", data.CLOUDINARY_API_SECRET],
			["STRIPE_SECRET_KEY", data.STRIPE_SECRET_KEY],
			["STRIPE_WEBHOOK_SECRET", data.STRIPE_WEBHOOK_SECRET],
		];

		for (const [key, value] of requiredValues) {
			if (!value) {
				ctx.addIssue({
					code: "custom",
					path: [key],
					message: `${String(key)} is required in production`,
				});
			}
		}

		if (isVercel && data.CRON_ENABLED && !data.CRON_SECRET) {
			ctx.addIssue({
				code: "custom",
				path: ["CRON_SECRET"],
				message: "CRON_SECRET is required for Vercel Cron",
			});
		}
	});

const parsed = rawEnvSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("Invalid environment variables:", z.treeifyError(parsed.error));

	process.exit(1);
}

const raw = parsed.data;

const normalizeHost = (value: string) =>
	value
		.trim()
		.replace(/^https?:\/\//, "")
		.replace(/\/+$/, "");

const toHttpsUrl = (value?: string) => {
	if (!value) {
		return undefined;
	}

	return `https://${normalizeHost(value)}`;
};

const isVercel = Boolean(
	raw.VERCEL ||
		raw.VERCEL_ENV ||
		raw.VERCEL_URL ||
		raw.VERCEL_PROJECT_PRODUCTION_URL,
);

const isProduction =
	raw.NODE_ENV === "production" || raw.VERCEL_ENV === "production";

const isPreview = raw.VERCEL_ENV === "preview";
const localBaseUrl = `http://localhost:${raw.PORT}`;
const vercelProductionUrl = toHttpsUrl(raw.VERCEL_PROJECT_PRODUCTION_URL);
const vercelDeploymentUrl = toHttpsUrl(raw.VERCEL_URL);
const appBaseUrl =
	raw.APP_BASE_URL ??
	(isProduction
		? (vercelProductionUrl ?? vercelDeploymentUrl)
		: isPreview
			? vercelDeploymentUrl
			: localBaseUrl);

if (!appBaseUrl) {
	throw new Error("Unable to resolve APP_BASE_URL");
}

const apiBaseUrl = `${appBaseUrl}/api/${raw.API_VERSION}`;

const configuredOrigins = raw.ALLOWED_ORIGINS
	? raw.ALLOWED_ORIGINS.split(",")
			.map((origin) => origin.trim())
			.filter(Boolean)
	: [];

const allowedOrigins =
	configuredOrigins.length > 0
		? configuredOrigins
		: raw.FRONTEND_URL
			? [raw.FRONTEND_URL]
			: isProduction
				? []
				: ["http://localhost:3000"];

const stripeSuccessUrl =
	raw.STRIPE_SUCCESS_URL ?? `${apiBaseUrl}/payments/success`;

const stripeCancelUrl =
	raw.STRIPE_CANCEL_URL ?? `${apiBaseUrl}/payments/cancel`;

const emailFromAddress = raw.EMAIL_FROM_ADDRESS ?? raw.SMTP_USER;

const useInProcessCron = raw.CRON_ENABLED && !isVercel;

export const env = Object.freeze({
	...raw,
	IS_VERCEL: isVercel,
	IS_PRODUCTION: isProduction,
	IS_PREVIEW: isPreview,
	APP_BASE_URL: appBaseUrl,
	API_BASE_URL: apiBaseUrl,
	ALLOWED_ORIGINS: allowedOrigins,
	STRIPE_SUCCESS_URL: stripeSuccessUrl,
	STRIPE_CANCEL_URL: stripeCancelUrl,
	EMAIL_FROM_ADDRESS: emailFromAddress,
	USE_IN_PROCESS_CRON: useInProcessCron,
});

export type Env = typeof env;
