import { describe, expect, it } from "vitest";
import {
	createAssessmentDraftSchema,
	createAssessmentSchema,
	syncAssessmentDraftSchema,
} from "./assessment.validation.js";

describe("assessment draft validation", () => {
	it("allows an empty draft to be created", () => {
		expect(createAssessmentDraftSchema.parse({})).toEqual({});
	});

	it("allows incomplete values during autosave and defaults to AUTO mode", () => {
		const result = syncAssessmentDraftSchema.parse({
			title: "A",
			durationMinutes: 0,
		});

		expect(result.title).toBe("A");
		expect(result.durationMinutes).toBe(0);
		expect(result.saveMode).toBe("AUTO");
	});

	it("allows temporarily inconsistent schedule values in a draft", () => {
		const result = syncAssessmentDraftSchema.safeParse({
			opensAt: "2026-10-10T10:00:00+06:00",
			closesAt: "2026-10-10T09:00:00+06:00",
		});

		expect(result.success).toBe(true);
	});

	it("keeps the normal create flow strict", () => {
		expect(createAssessmentSchema.safeParse({}).success).toBe(false);
	});
});
