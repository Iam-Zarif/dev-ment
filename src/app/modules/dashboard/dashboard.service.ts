import { AssessmentStatus } from "../../../generated/prisma/enums.js";
import { prisma } from "../../../lib/prisma/index.js";
import { AppError } from "../../../shared/errors/index.js";

type RecruiterCounts = {
	assessments: number;
	drafts: number;
	published: number;
	applications: number;
	awaitingReview: number;
	pendingEvaluations: number;
	availableCredits: number;
};

type CandidateCounts = {
	applications: number;
	shortlisted: number;
	pendingInvitations: number;
	activeAttempts: number;
	releasedResults: number;
};

const getRecruiter = async (userId: string) => {
	const profile = await prisma.recruiterProfile.findUnique({
		where: { userId },
		select: {
			id: true, companyId: true,
			company: { select: { name: true, isVerified: true, deletedAt: true } },
		},
	});
	if (!profile || profile.company.deletedAt) {
		throw new AppError(403, "Recruiter profile is unavailable");
	}
	const scope = { recruiterId: profile.id, companyId: profile.companyId, deletedAt: null };

	const [rows, recentAssessments, recentApplications] = await Promise.all([
		prisma.$queryRaw<RecruiterCounts[]>`
			SELECT
				(SELECT COUNT(*)::int FROM assessments WHERE recruiter_id = ${profile.id}::uuid
				 AND company_id = ${profile.companyId}::uuid AND deleted_at IS NULL) AS "assessments",
				(SELECT COUNT(*)::int FROM assessments WHERE recruiter_id = ${profile.id}::uuid
				 AND company_id = ${profile.companyId}::uuid AND deleted_at IS NULL AND status = 'DRAFT') AS "drafts",
				(SELECT COUNT(*)::int FROM assessments WHERE recruiter_id = ${profile.id}::uuid
				 AND company_id = ${profile.companyId}::uuid AND deleted_at IS NULL AND status = 'PUBLISHED') AS "published",
				(SELECT COUNT(*)::int FROM applications ap JOIN assessments ass ON ass.id = ap.assessment_id
				 WHERE ass.recruiter_id = ${profile.id}::uuid AND ass.company_id = ${profile.companyId}::uuid
				 AND ass.deleted_at IS NULL) AS "applications",
				(SELECT COUNT(*)::int FROM applications ap JOIN assessments ass ON ass.id = ap.assessment_id
				 WHERE ass.recruiter_id = ${profile.id}::uuid AND ass.company_id = ${profile.companyId}::uuid
				 AND ass.deleted_at IS NULL AND ap.status = 'APPLIED') AS "awaitingReview",
				(SELECT COUNT(*)::int FROM attempts at JOIN invitations inv ON inv.id = at.invitation_id
				 JOIN applications ap ON ap.id = inv.application_id
				 JOIN assessments ass ON ass.id = ap.assessment_id
				 WHERE ass.recruiter_id = ${profile.id}::uuid AND ass.company_id = ${profile.companyId}::uuid
				 AND ass.deleted_at IS NULL AND at.status IN ('SUBMITTED', 'AUTO_SUBMITTED')
				 AND at.evaluation_status <> 'FINALIZED') AS "pendingEvaluations",
				(SELECT COALESCE(SUM(remaining_credits), 0)::int FROM credit_grants
				 WHERE recruiter_id = ${profile.id}::uuid AND remaining_credits > 0
				 AND (expires_at IS NULL OR expires_at > NOW())) AS "availableCredits"
		`,
		prisma.assessment.findMany({
			where: scope, take: 5, orderBy: { updatedAt: "desc" },
			select: {
				id: true, title: true, status: true, updatedAt: true,
				_count: { select: { applications: true } },
			},
		}),
		prisma.application.findMany({
			where: { assessment: { is: scope } },
			take: 5, orderBy: { appliedAt: "desc" },
			select: {
				id: true, status: true, appliedAt: true,
				assessment: { select: { id: true, title: true } },
				candidate: { select: { user: { select: { legalName: true } } } },
			},
		}),
	]);

	const stats = rows[0];
	if (!stats) throw new AppError(500, "Unable to load recruiter dashboard");
	return {
		company: { name: profile.company.name, isVerified: profile.company.isVerified },
		stats,
		recentAssessments,
		recentApplications: recentApplications.map((item) => ({
			id: item.id, status: item.status, appliedAt: item.appliedAt,
			candidateName: item.candidate.user.legalName,
			assessment: item.assessment,
		})),
	};
};

const getCandidate = async (userId: string) => {
	const profile = await prisma.candidateProfile.findUnique({
		where: { userId }, select: { id: true },
	});
	if (!profile) throw new AppError(403, "Candidate profile is unavailable");

	const now = new Date();
	const [rows, recentApplications, availableAssessments] = await Promise.all([
		prisma.$queryRaw<CandidateCounts[]>`
			SELECT
				(SELECT COUNT(*)::int FROM applications WHERE candidate_id = ${profile.id}::uuid)
				 AS "applications",
				(SELECT COUNT(*)::int FROM applications WHERE candidate_id = ${profile.id}::uuid
				 AND status = 'SHORTLISTED') AS "shortlisted",
				(SELECT COUNT(*)::int FROM invitations inv JOIN applications ap ON ap.id = inv.application_id
				 WHERE ap.candidate_id = ${profile.id}::uuid AND inv.status = 'PENDING'
				 AND inv.expires_at > NOW()) AS "pendingInvitations",
				(SELECT COUNT(*)::int FROM attempts at JOIN invitations inv ON inv.id = at.invitation_id
				 JOIN applications ap ON ap.id = inv.application_id
				 WHERE ap.candidate_id = ${profile.id}::uuid
				 AND at.status = 'IN_PROGRESS' AND at.expires_at > NOW()) AS "activeAttempts",
				(SELECT COUNT(*)::int FROM attempts at JOIN invitations inv ON inv.id = at.invitation_id
				 JOIN applications ap ON ap.id = inv.application_id
				 WHERE ap.candidate_id = ${profile.id}::uuid
				 AND at.result_released_at IS NOT NULL) AS "releasedResults"
		`,
		prisma.application.findMany({
			where: { candidateId: profile.id }, take: 5, orderBy: { appliedAt: "desc" },
			select: {
				id: true, status: true, appliedAt: true,
				assessment: { select: {
					id: true, title: true, company: { select: { name: true } },
				} },
				invitation: { select: {
					status: true, expiresAt: true,
					attempt: { select: {
						id: true, status: true, expiresAt: true, resultReleasedAt: true,
					} },
				} },
			},
		}),
		prisma.assessment.findMany({
			where: {
				status: AssessmentStatus.PUBLISHED, deletedAt: null,
				company: { deletedAt: null },
				AND: [
					{ OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: now } }] },
					{ OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
				],
			},
			take: 5, orderBy: { publishedAt: "desc" },
			select: {
				id: true, title: true, jobRole: true, difficulty: true,
				company: { select: { name: true } },
			},
		}),
	]);
	const stats = rows[0];
	if (!stats) throw new AppError(500, "Unable to load candidate dashboard");

	return {
		stats,
		recentApplications: recentApplications.map((item) => ({
			id: item.id, status: item.status, appliedAt: item.appliedAt,
			assessment: {
				id: item.assessment.id, title: item.assessment.title,
				companyName: item.assessment.company.name,
			},
			invitation: item.invitation,
		})),
		availableAssessments: availableAssessments.map((item) => ({
			id: item.id, title: item.title, jobRole: item.jobRole,
			difficulty: item.difficulty, companyName: item.company.name,
		})),
	};
};

export const dashboardService = { getRecruiter, getCandidate };
