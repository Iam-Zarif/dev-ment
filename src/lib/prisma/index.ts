import { prisma } from "./client.js";

export const connectDatabase = async () => {
	await prisma.$connect();
	await prisma.$queryRaw`SELECT 1`;
};

export const disconnectDatabase = async () => {
	await prisma.$disconnect();
};

export { prisma };
