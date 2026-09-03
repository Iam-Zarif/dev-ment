import { config } from "../config/index.js";
import { UserRole } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma/index.js";
import { hashPassword } from "../shared/utils/index.js";

export const seedAdmin = async () => {
	const email = config.seed.admin.email.trim().toLowerCase();

	const existingAdmin = await prisma.user.findUnique({
		where: {
			email,
		},
		select: {
			id: true,
		},
	});

	if (existingAdmin) {
		return;
	}

	const passwordHash = await hashPassword(config.seed.admin.password);

	await prisma.user.create({
		data: {
			legalName: config.seed.admin.name,
			email,
			passwordHash,
			emailVerifiedAt: new Date(),
			role: UserRole.ADMIN,
		},
	});
};
