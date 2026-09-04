import { prisma } from "../../../lib/prisma/index.js";
import { AppError } from "../../../shared/errors/index.js";

type CandidateContextClient = Pick<typeof prisma, "candidateProfile">;

export type CandidateContext = {
	userId: string;
	candidateId: string;
};

export const getCandidateContext = async (
	userId: string,
	client: CandidateContextClient = prisma,
): Promise<CandidateContext> => {
	const candidate = await client.candidateProfile.findUnique({
		where: {
			userId,
		},
		select: {
			id: true,
			userId: true,
		},
	});

	if (!candidate) {
		throw new AppError(403, "Candidate profile is unavailable");
	}

	return {
		userId: candidate.userId,
		candidateId: candidate.id,
	};
};
