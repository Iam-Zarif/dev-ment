import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../../config/index.js";
import { PrismaClient } from "../../generated/prisma/client.js";

// Reuse a bounded number of connections per warm server instance.
const adapter = new PrismaPg({
	connectionString: config.database.url,
	max: 5,
	idleTimeoutMillis: 10_000,
	connectionTimeoutMillis: 10_000,
});

export const prisma = new PrismaClient({
	adapter,
});
