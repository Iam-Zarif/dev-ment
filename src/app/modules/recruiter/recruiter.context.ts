import { prisma } from "../../../lib/prisma/index.js";
import { AppError } from "../../../shared/errors/index.js";

type RecruiterContextClient = Pick<typeof prisma, "recruiterProfile">;

export type RecruiterContext = {
	userId: string;
	recruiterId: string;
	companyId: string;
};

export const getRecruiterContext = async (
	userId: string,
	client: RecruiterContextClient = prisma,
): Promise<RecruiterContext> => {
	const recruiterProfile = await client.recruiterProfile.findUnique({
		where: {
			userId,
		},
		select: {
			id: true,
			userId: true,
			companyId: true,
			company: {
				select: {
					isVerified: true,
					deletedAt: true,
				},
			},
		},
	});

	if (!recruiterProfile || recruiterProfile.company.deletedAt) {
		throw new AppError(403, "Recruiter profile is unavailable");
	}

	if (!recruiterProfile.company.isVerified) {
		throw new AppError(403, "Recruiter company is not verified");
	}

	return {
		userId: recruiterProfile.userId,
		recruiterId: recruiterProfile.id,
		companyId: recruiterProfile.companyId,
	};
};
