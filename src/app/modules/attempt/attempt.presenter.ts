import {
	AttemptStatus,
	QuestionType,
} from "../../../generated/prisma/enums.js";

type DecimalLike = {
	toNumber: () => number;
};

type AttemptSession = {
	id: string;
	status: AttemptStatus;
	startedAt: Date;
	expiresAt: Date;
	submittedAt: Date | null;
	isSuspicious: boolean;
	tabSwitchCount: number;
	invitation: {
		id: string;
		application: {
			id: string;
			assessment: {
				id: string;
				title: string;
				jobRole: string;
				instructionsHtml: string | null;
				durationMinutes: number;
				opensAt: Date | null;
				closesAt: Date | null;
				company: {
					id: string;
					name: string;
					logoUrl: string | null;
				};
				assessmentQuestions: Array<{
					id: string;
					sortOrder: number;
					marks: DecimalLike;
					question: {
						id: string;
						type: QuestionType;
						contentHtml: string;
						difficulty: string;
						selectionMode: string | null;
						allowedLanguages: string[];
						starterCode: unknown;
						timeLimitMs: number | null;
						memoryLimitKb: number | null;
						options: Array<{
							id: string;
							optionHtml: string;
							sortOrder: number;
						}>;
					};
				}>;
			};
		};
	};
	answers: Array<{
		id: string;
		assessmentQuestionId: string;
		answerText: string | null;
		codeAnswer: string | null;
		language: string | null;
		lastSavedAt: Date | null;
		selectedOptions: Array<{
			optionId: string;
		}>;
	}>;
};

const presentQuestion = (
	item: AttemptSession["invitation"]["application"]["assessment"]["assessmentQuestions"][number],
) => {
	const base = {
		assessmentQuestionId: item.id,
		questionId: item.question.id,
		type: item.question.type,
		contentHtml: item.question.contentHtml,
		difficulty: item.question.difficulty,
		marks: item.marks.toNumber(),
		sortOrder: item.sortOrder,
	};

	if (item.question.type === QuestionType.MCQ) {
		return {
			...base,
			selectionMode: item.question.selectionMode,
			options: item.question.options,
		};
	}

	if (item.question.type === QuestionType.CODING) {
		return {
			...base,
			allowedLanguages: item.question.allowedLanguages,
			starterCode: item.question.starterCode,
			timeLimitMs: item.question.timeLimitMs,
			memoryLimitKb: item.question.memoryLimitKb,
		};
	}

	return base;
};

export const presentAttemptSession = (
	session: AttemptSession,
	now = new Date(),
) => {
	const remainingSeconds = Math.max(
		0,
		Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000),
	);

	const assessment = session.invitation.application.assessment;

	return {
		attempt: {
			id: session.id,
			status: session.status,
			startedAt: session.startedAt,
			expiresAt: session.expiresAt,
			submittedAt: session.submittedAt,
			isSuspicious: session.isSuspicious,
			tabSwitchCount: session.tabSwitchCount,
			serverNow: now,
			remainingSeconds,
			canSubmit:
				session.status === AttemptStatus.IN_PROGRESS &&
				remainingSeconds > 0,
		},
		invitationId: session.invitation.id,
		applicationId: session.invitation.application.id,
		assessment: {
			id: assessment.id,
			title: assessment.title,
			jobRole: assessment.jobRole,
			instructionsHtml: assessment.instructionsHtml,
			durationMinutes: assessment.durationMinutes,
			opensAt: assessment.opensAt,
			closesAt: assessment.closesAt,
			company: assessment.company,
		},
		questions: assessment.assessmentQuestions.map(presentQuestion),
		answers: session.answers.map((answer) => ({
			id: answer.id,
			assessmentQuestionId: answer.assessmentQuestionId,
			answerText: answer.answerText,
			codeAnswer: answer.codeAnswer,
			language: answer.language,
			selectedOptionIds: answer.selectedOptions.map(
				(option) => option.optionId,
			),
			lastSavedAt: answer.lastSavedAt,
		})),
	};
};