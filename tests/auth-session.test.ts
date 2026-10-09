import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config/index.js", () => ({
	config: {
		jwt: {
			refreshSecret: "session-test-secret",
			accessSecret: "access-test-secret",
			accessExpiresIn: "15m",
			refreshExpiresIn: "7d",
		},
		redis: { keyPrefix: "test:" },
		app: { isProduction: true },
	},
}));
vi.mock("../src/lib/prisma/index.js", () => ({
	prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("../src/lib/redis/index.js", () => ({
	connectRedis: vi.fn(),
	redisClient: {
		isOpen: true,
		get: vi.fn(),
		getDel: vi.fn(),
		set: vi.fn(),
		sRem: vi.fn(),
		sAdd: vi.fn(),
		expire: vi.fn(),
	},
}));
vi.mock("../src/lib/email/index.js", () => ({ sendEmail: vi.fn() }));
vi.mock("../src/lib/google/index.js", () => ({ verifyGoogleIdToken: vi.fn() }));
vi.mock("../src/shared/utils/logger.js", () => ({ logger: {} }));

import { authController } from "../src/app/modules/auth/auth.controller.js";
import {
	loginSchema,
	registerCandidateSchema,
	resetPasswordSchema,
} from "../src/app/modules/auth/auth.validation.js";
import { prisma } from "../src/lib/prisma/index.js";
import { redisClient } from "../src/lib/redis/index.js";
import { validateRequest } from "../src/shared/middlewares/validateRequest.js";

const app = express();
app.use(cookieParser());
app.use(express.json());
app.post(
	"/auth/login",
	validateRequest({ body: loginSchema }),
	authController.login,
);
app.get("/auth/session", authController.getSession);
app.post("/auth/refresh", authController.refresh);
app.use(((error, _req, res, _next) => {
	res.status(error.statusCode ?? 500).json({ success: false });
}) as express.ErrorRequestHandler);
function token(secret = "session-test-secret", expiresIn = 60) {
	return jwt.sign(
		{
			userId: "user-1",
			email: "user@example.com",
			role: "CANDIDATE",
			sessionId: "session-1",
		},
		secret,
		{ expiresIn },
	);
}
function session(value = token()) {
	return request(app)
		.get("/auth/session")
		.set("Cookie", `devment_refresh_token=${value}`);
}
beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(redisClient.get).mockResolvedValue("user-1");
	vi.mocked(prisma.user.findUnique).mockResolvedValue({
		id: "user-1",
		role: "CANDIDATE",
		status: "ACTIVE",
		deletedAt: null,
	} as never);
});
describe("non-consuming refresh session route", () => {
	it.each(["CANDIDATE", "RECRUITER", "ADMIN"])(
		"returns current role %s without consuming or rotating sessions",
		async (role) => {
			vi.mocked(prisma.user.findUnique).mockResolvedValue({
				id: "user-1",
				role,
				status: "ACTIVE",
				deletedAt: null,
			} as never);
			for (let i = 0; i < 2; i++) {
				const response = await session();
				expect(response.status).toBe(200);
				expect(response.body.data).toEqual({ userId: "user-1", role });
				expect(response.headers["set-cookie"]).toBeUndefined();
				expect(response.headers["cache-control"]).toBe("no-store");
			}
			expect(redisClient.get).toHaveBeenCalledWith(
				"test:auth:refresh:session-1",
			);
			expect(redisClient.getDel).not.toHaveBeenCalled();
			expect(redisClient.set).not.toHaveBeenCalled();
			expect(redisClient.sRem).not.toHaveBeenCalled();
		},
	);
	it("rejects missing cookies", async () => {
		expect((await request(app).get("/auth/session")).status).toBe(401);
	});
	it.each([
		"malformed",
		token("wrong-secret"),
		token("session-test-secret", -1),
	])("rejects invalid or expired JWTs", async (value) => {
		expect((await session(value)).status).toBe(401);
		expect(redisClient.get).not.toHaveBeenCalled();
	});
	it.each([null, "other-user"])(
		"rejects absent/revoked sessions and owner mismatch",
		async (owner) => {
			vi.mocked(redisClient.get).mockResolvedValue(owner);
			expect((await session()).status).toBe(401);
			expect(prisma.user.findUnique).not.toHaveBeenCalled();
		},
	);
	it.each([
		null,
		{
			id: "user-1",
			role: "CANDIDATE",
			status: "ACTIVE",
			deletedAt: new Date(),
		},
		{ id: "user-1", role: "CANDIDATE", status: "SUSPENDED", deletedAt: null },
	])("rejects unavailable users", async (user) => {
		vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
		expect((await session()).status).toBe(401);
	});
	it("fails closed on Redis errors", async () => {
		vi.mocked(redisClient.get).mockRejectedValue(new Error("Unavailable"));
		expect((await session()).status).toBe(500);
	});
});

describe("existing refresh rotation", () => {
	it("still consumes the old session and issues a new cookie and tokens", async () => {
		vi.mocked(redisClient.getDel).mockResolvedValue("user-1");
		vi.mocked(prisma.user.findUnique).mockResolvedValue({
			id: "user-1",
			email: "user@example.com",
			legalName: "Test User",
			role: "CANDIDATE",
			status: "ACTIVE",
			deletedAt: null,
			imageUrl: null,
		} as never);
		const response = await request(app)
			.post("/auth/refresh")
			.set("Cookie", `devment_refresh_token=${token()}`);
		expect(response.status).toBe(200);
		expect(response.body.data.accessToken).toEqual(expect.any(String));
		expect(response.headers["set-cookie"][0]).toContain(
			"devment_refresh_token=",
		);
		expect(redisClient.getDel).toHaveBeenCalledWith(
			"test:auth:refresh:session-1",
		);
		expect(redisClient.sRem).toHaveBeenCalledWith(
			"test:auth:refresh-user:user-1",
			"session-1",
		);
		expect(redisClient.set).toHaveBeenCalledWith(
			expect.stringMatching(/^test:auth:refresh:/),
			"user-1",
			expect.objectContaining({ EX: expect.any(Number) }),
		);
	});
});

describe("login password and production cookie contract", () => {
	it.each(["a", "demo", "oldpass", " simple "])(
		"accepts existing passwords without registration policy: %s",
		(password) => {
			expect(
				loginSchema.safeParse({ email: "person@example.com", password })
					.success,
			).toBe(true);
			expect(
				loginSchema.parse({ email: "person@example.com", password }).password,
			).toBe(password);
		},
	);
	it.each(["", "a".repeat(73), null, 123])(
		"rejects empty, oversized or non-string passwords",
		(password) => {
			expect(
				loginSchema.safeParse({ email: "person@example.com", password })
					.success,
			).toBe(false);
		},
	);
	it("still requires a valid email and strong registration/reset passwords", () => {
		expect(
			loginSchema.safeParse({ email: "invalid", password: "demo" }).success,
		).toBe(false);
		expect(
			registerCandidateSchema.safeParse({
				legalName: "Test User",
				email: "person@example.com",
				password: "demo",
				confirmPassword: "demo",
			}).success,
		).toBe(false);
		expect(
			resetPasswordSchema.safeParse({
				password: "demo",
				confirmPassword: "demo",
			}).success,
		).toBe(false);
	});
	it.each(["CANDIDATE", "RECRUITER", "ADMIN"])(
		"authenticates %s with bcrypt and provides a cookie usable by the route proxy",
		async (role) => {
			const user = {
				id: "user-1",
				email: "user@example.com",
				legalName: "Test User",
				role,
				status: "ACTIVE",
				deletedAt: null,
				imageUrl: null,
				passwordHash: await bcrypt.hash("demo", 4),
			};
			vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
			const response = await request(app)
				.post("/auth/login")
				.send({ email: user.email, password: "demo" });
			expect(response.status).toBe(200);
			expect(response.body.data.user.role).toBe(role);
			const cookie = response.headers["set-cookie"][0];
			expect(cookie).toContain("Path=/");
			expect(cookie).toContain("HttpOnly");
			expect(cookie).toContain("Secure");
			expect(cookie).toContain("SameSite=Lax");
			expect(cookie).not.toContain("Domain=");
			const checked = await request(app)
				.get("/auth/session")
				.set("Cookie", cookie.split(";")[0]);
			expect(checked.status).toBe(200);
			expect(checked.body.data).toEqual({ userId: user.id, role });
		},
	);
	it("returns normal authentication errors for incorrect passwords", async () => {
		vi.mocked(prisma.user.findUnique).mockResolvedValue({
			id: "user-1",
			deletedAt: null,
			passwordHash: await bcrypt.hash("demo", 4),
			status: "ACTIVE",
		} as never);
		const response = await request(app)
			.post("/auth/login")
			.send({ email: "user@example.com", password: "wrong" });
		expect(response.status).toBe(401);
		expect(response.headers["set-cookie"]).toBeUndefined();
		expect(redisClient.set).not.toHaveBeenCalled();
	});
	it("still rejects inactive accounts with correct passwords", async () => {
		vi.mocked(prisma.user.findUnique).mockResolvedValue({
			id: "user-1",
			deletedAt: null,
			passwordHash: await bcrypt.hash("demo", 4),
			status: "SUSPENDED",
		} as never);
		const response = await request(app)
			.post("/auth/login")
			.send({ email: "user@example.com", password: "demo" });
		expect(response.status).toBe(403);
		expect(response.headers["set-cookie"]).toBeUndefined();
	});
});
