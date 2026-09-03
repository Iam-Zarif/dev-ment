import { env } from "./env.js";

export const config = Object.freeze({
	app: {
		name: env.APP_NAME,
		nodeEnv: env.NODE_ENV,
		port: env.PORT,
		apiVersion: env.API_VERSION,
		baseUrl: env.APP_BASE_URL,
		apiBaseUrl: env.API_BASE_URL,
		frontendUrl: env.FRONTEND_URL,
		timezone: env.TIMEZONE,
		isProduction: env.IS_PRODUCTION,
		isPreview: env.IS_PREVIEW,
		isVercel: env.IS_VERCEL,
	},

	database: {
		url: env.DATABASE_URL,
	},

	jwt: {
		accessSecret: env.JWT_ACCESS_SECRET,
		refreshSecret: env.JWT_REFRESH_SECRET,
		accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
		refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
	},

	bcrypt: {
		saltRounds: env.BCRYPT_SALT_ROUNDS,
	},

	redis: {
		url: env.REDIS_URL,
		keyPrefix: env.REDIS_KEY_PREFIX,
		connectTimeoutMs: env.REDIS_CONNECT_TIMEOUT_MS,
		commandTimeoutMs: env.REDIS_COMMAND_TIMEOUT_MS,
	},

	otp: {
		expiresInSeconds: env.OTP_EXPIRES_IN_SECONDS,
		resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
		maxAttempts: env.OTP_MAX_ATTEMPTS,
	},

	google: {
		clientId: env.GOOGLE_CLIENT_ID,
		clientSecret: env.GOOGLE_CLIENT_SECRET,
	},

	smtp: {
		host: env.SMTP_HOST,
		port: env.SMTP_PORT,
		secure: env.SMTP_SECURE,
		user: env.SMTP_USER,
		pass: env.SMTP_PASS,
		fromName: env.EMAIL_FROM_NAME,
		fromAddress: env.EMAIL_FROM_ADDRESS,
	},

	cloudinary: {
		cloudName: env.CLOUDINARY_CLOUD_NAME,
		apiKey: env.CLOUDINARY_API_KEY,
		apiSecret: env.CLOUDINARY_API_SECRET,
		rootFolder: env.CLOUDINARY_ROOT_FOLDER,
	},

	stripe: {
		secretKey: env.STRIPE_SECRET_KEY,
		publishableKey: env.STRIPE_PUBLISHABLE_KEY,
		webhookSecret: env.STRIPE_WEBHOOK_SECRET,
		currency: env.STRIPE_CURRENCY,
		successUrl: env.STRIPE_SUCCESS_URL,
		cancelUrl: env.STRIPE_CANCEL_URL,
	},

	cors: {
		allowedOrigins: env.ALLOWED_ORIGINS,
	},

	rateLimit: {
		windowMs: env.RATE_LIMIT_WINDOW_MS,
		maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
		authMaxRequests: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
	},

	cron: {
		enabled: env.CRON_ENABLED,
		useInProcessCron: env.USE_IN_PROCESS_CRON,
		timezone: env.CRON_TIMEZONE,
		secret: env.CRON_SECRET,
	},

	vercel: {
		enabled: env.IS_VERCEL,
		environment: env.VERCEL_ENV,
		deploymentUrl: env.VERCEL_URL,
		productionUrl: env.VERCEL_PROJECT_PRODUCTION_URL,
	},

	seed: {
		admin: {
			name: env.SEED_ADMIN_NAME,
			email: env.SEED_ADMIN_EMAIL,
			password: env.SEED_ADMIN_PASSWORD,
		},

		candidate: {
			name: env.SEED_CANDIDATE_NAME,
			email: env.SEED_CANDIDATE_EMAIL,
			password: env.SEED_CANDIDATE_PASSWORD,
			headline: env.SEED_CANDIDATE_HEADLINE,
			githubUrl: env.SEED_CANDIDATE_GITHUB_URL,
			linkedinUrl: env.SEED_CANDIDATE_LINKEDIN_URL,
			portfolioUrl: env.SEED_CANDIDATE_PORTFOLIO_URL,
		},

		recruiter: {
			name: env.SEED_RECRUITER_NAME,
			email: env.SEED_RECRUITER_EMAIL,
			password: env.SEED_RECRUITER_PASSWORD,
			jobTitle: env.SEED_RECRUITER_JOB_TITLE,
			freeCredits: env.SEED_RECRUITER_FREE_CREDITS,
			company: {
				name: env.SEED_RECRUITER_COMPANY_NAME,
				domain: env.SEED_RECRUITER_COMPANY_DOMAIN,
				website: env.SEED_RECRUITER_COMPANY_WEBSITE,
			},
		},
	},

	logging: {
		level: env.LOG_LEVEL,
	},
} as const);

export { env };

export type Config = typeof config;
