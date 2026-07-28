// Recidiviz - a data platform for criminal justice reform
// Copyright (C) 2026 Recidiviz, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
// =============================================================================

import { FIELD_KEYS } from "../../../constants/fieldKeys";
import {
  computeWarningFields,
  DEFAULT_FORM_VALUES,
  getErrorForField,
  handleInputChange,
  isDateValid,
  normalizeDefaultValues,
  normalizeExtractedPhoneFields,
} from "../utils";

describe("computeWarningFields", () => {
  it("adds plausibility warnings for out-of-range required fields", () => {
    const values = {
      ...DEFAULT_FORM_VALUES,
      dob: "01/01/1924",
      age: 101,
      tpdHousingNeededDate: "01/01/2000",
      lastUseDate: "12/31/1924",
      signatureDate: "12/31/2025",
      signatureProvided: true,
      preferredDistrict: ["D1"],
    };

    const warnings = computeWarningFields(values);

    expect(warnings.has(FIELD_KEYS.dob)).toBe(true);
    expect(warnings.has(FIELD_KEYS.age)).toBe(true);
    expect(warnings.has(FIELD_KEYS.tpdHousingNeededDate)).toBe(true);
    expect(warnings.has(FIELD_KEYS.lastUseDate)).toBe(true);
    expect(warnings.has(FIELD_KEYS.signatureDate)).toBe(true);
  });

  it("adds conditional warnings when a controlling yes field is selected", () => {
    const values = {
      ...DEFAULT_FORM_VALUES,
      militaryService: true,
      vaEnrolled: null,

      employmentOnRelease: true,
      employer: null,
      employerContact: null,

      previousTransitionalHome: true,
      previousHomeName: null,
      previousHomeCity: null,
    };

    const warnings = computeWarningFields(values);

    expect(warnings.has(FIELD_KEYS.vaEnrolled)).toBe(true);
    expect(warnings.has(FIELD_KEYS.employer)).toBe(true);
    expect(warnings.has(FIELD_KEYS.employerContact)).toBe(true);
    expect(warnings.has(FIELD_KEYS.previousHomeName)).toBe(true);
    expect(warnings.has(FIELD_KEYS.previousHomeCity)).toBe(true);
  });

  it("warns when violence discharge description is missing after a yes response", () => {
    const values = {
      ...DEFAULT_FORM_VALUES,
      priorInvoluntaryDischarge: true,
      violenceDischargeDescription: null,
    };

    const warnings = computeWarningFields(values);

    expect(warnings.has(FIELD_KEYS.violenceDischargeDescription)).toBe(true);
  });

  it("flags expected optional empty fields for warning while allowing progress", () => {
    const warnings = computeWarningFields(DEFAULT_FORM_VALUES);

    expect(warnings.has(FIELD_KEYS.cmPoName)).toBe(true);
    expect(warnings.has(FIELD_KEYS.cmPoEmail)).toBe(true);
    expect(warnings.has(FIELD_KEYS.gender)).toBe(true);
    expect(warnings.has(FIELD_KEYS.legalCurrentStatus)).toBe(true);
    expect(warnings.has(FIELD_KEYS.medicalMhSupportNeeded)).toBe(true);
    expect(warnings.has(FIELD_KEYS.clientFullName)).toBe(false);
    expect(warnings.has(FIELD_KEYS.idocNumber)).toBe(false);
    expect(warnings.has(FIELD_KEYS.preferredDistrict)).toBe(false);
    expect(warnings.has(FIELD_KEYS.signatureProvided)).toBe(false);
  });

  it("does not add conditional follow-up warnings when the controlling answer is not Yes", () => {
    const warnings = computeWarningFields({
      ...DEFAULT_FORM_VALUES,
      militaryService: false,
      vaEnrolled: null,
      employmentOnRelease: null,
      employer: null,
      childVisitationRequired: false,
      childFamilyServicesDocumentation: [],
      priorInvoluntaryDischarge: false,
      violenceHistoryDors: false,
      violenceDischargeDescription: null,
    });

    expect(warnings.has(FIELD_KEYS.vaEnrolled)).toBe(false);
    expect(warnings.has(FIELD_KEYS.employer)).toBe(false);
    expect(warnings.has(FIELD_KEYS.childFamilyServicesDocumentation)).toBe(
      false,
    );
    expect(warnings.has(FIELD_KEYS.violenceDischargeDescription)).toBe(false);
  });

  it("warns for child visitation follow-ups only when visitation is required", () => {
    const withoutYes = computeWarningFields({
      ...DEFAULT_FORM_VALUES,
      childVisitationRequired: null,
      parentGuardianNames: null,
      child1Info: null,
      childFamilyServicesDocumentation: [],
    });
    expect(withoutYes.has(FIELD_KEYS.parentGuardianNames)).toBe(false);

    const withYes = computeWarningFields({
      ...DEFAULT_FORM_VALUES,
      childVisitationRequired: true,
      parentGuardianNames: null,
      child1Info: null,
      childFamilyServicesDocumentation: [],
    });
    expect(withYes.has(FIELD_KEYS.parentGuardianNames)).toBe(true);
    expect(withYes.has(FIELD_KEYS.child1Info)).toBe(true);
    expect(withYes.has(FIELD_KEYS.childFamilyServicesDocumentation)).toBe(true);
  });
});

describe("isDateValid", () => {
  it("accepts valid MM/DD/YYYY and ISO dates", () => {
    expect(isDateValid("06/15/1991")).toBe(true);
    expect(isDateValid("1991-06-15")).toBe(true);
  });

  it("rejects empty or impossible dates", () => {
    expect(isDateValid("")).toBe(false);
    expect(isDateValid("02/30/2020")).toBe(false);
    expect(isDateValid("13/01/2020")).toBe(false);
    expect(isDateValid("00/01/2020")).toBe(false);
    expect(isDateValid("not-a-date")).toBe(false);
  });
});

describe("getErrorForField", () => {
  it("returns the first message for a field", () => {
    expect(getErrorForField([{ dob: ["Date is required"] }], "dob")).toBe(
      "Date is required",
    );
  });

  it("returns undefined when errors are missing", () => {
    expect(getErrorForField(undefined, "dob")).toBeUndefined();
    expect(getErrorForField([{ dob: [42] }], "dob")).toBeUndefined();
    expect(getErrorForField([{ dob: "wrong shape" }], "dob")).toBeUndefined();
  });
});

describe("normalizeDefaultValues", () => {
  it("formats extracted phone fields and pads preferred provider slots", () => {
    const normalized = normalizeDefaultValues({
      ...DEFAULT_FORM_VALUES,
      age: 0,
      cmPoPhone: "2085550111",
      personalPhoneNumber: "2085551234",
      emergencyContactPhone: "2085550199",
      employerContact: "2085550177",
      preferredProviders: ["Provider One"],
    });

    expect(normalized.cmPoPhone).toBe("208-555-0111");
    expect(normalized.personalPhoneNumber).toBe("208-555-1234");
    expect(normalized.emergencyContactPhone).toBe("208-555-0199");
    expect(normalized.employerContact).toBe("208-555-0177");
    expect(normalized.age).toBeNull();
    expect(normalized.preferredProviders).toEqual(["Provider One", "", ""]);
  });

  it("handles missing preferred providers", () => {
    const normalized = normalizeDefaultValues({
      ...DEFAULT_FORM_VALUES,
      preferredProviders: null,
    } as never);
    expect(normalized.preferredProviders).toEqual(["", "", ""]);
  });
});

describe("normalizeExtractedPhoneFields", () => {
  it("coalesces null OCR text fields to empty strings while formatting phones", () => {
    const extractedValues = {
      ...DEFAULT_FORM_VALUES,
      cmPoPhone: "2085550111",
      cmPoName: null,
      clientFullName: null,
    } as unknown as Parameters<typeof normalizeExtractedPhoneFields>[0];

    const normalized = normalizeExtractedPhoneFields(extractedValues);

    expect(normalized.cmPoPhone).toBe("208-555-0111");
    expect(normalized.cmPoName).toBe("");
    expect(normalized.clientFullName).toBe("");
  });

  it("coalesces every nullable OCR string and phone field", () => {
    const normalized = normalizeExtractedPhoneFields({
      ...DEFAULT_FORM_VALUES,
      cmPoEmail: null,
      cmPoPhone: null,
      currentFacilityLocation: null,
      personalPhoneNumber: null,
      emergencyContactName: null,
      emergencyContactRelationship: null,
      emergencyContactPhone: null,
      legalMostRecentConviction: null,
      employerContact: null,
    } as never);

    expect(normalized).toMatchObject({
      cmPoEmail: "",
      cmPoPhone: "",
      currentFacilityLocation: "",
      personalPhoneNumber: "",
      emergencyContactName: "",
      emergencyContactRelationship: "",
      emergencyContactPhone: "",
      legalMostRecentConviction: "",
      employerContact: "",
    });
  });
});

describe("handleInputChange", () => {
  const event = (value: string) => ({ target: { value } }) as never;

  it("formats phone and digit fields", () => {
    const phone = { handleChange: vi.fn() };
    handleInputChange(phone as never, { type: "phone" })(event("2085550111"));
    expect(phone.handleChange).toHaveBeenCalledWith("208-555-0111");

    const digits = { handleChange: vi.fn() };
    handleInputChange(digits as never, { type: "digits", maxLen: 3 })(
      event("a12-34"),
    );
    expect(digits.handleChange).toHaveBeenCalledWith(123);
    handleInputChange(digits as never, { type: "digits", maxLen: 3 })(
      event("abc"),
    );
    expect(digits.handleChange).toHaveBeenLastCalledWith(null);
  });

  it("supports constrained text, ordinary text, and select values", () => {
    const field = { handleChange: vi.fn() };
    handleInputChange(field as never, { type: "text", maxLen: 4 })(
      event("12-345"),
    );
    expect(field.handleChange).toHaveBeenLastCalledWith("1234");
    handleInputChange(field as never, { type: "text", maxLen: 4 })(
      event("abc"),
    );
    expect(field.handleChange).toHaveBeenLastCalledWith(null);

    handleInputChange(field as never)(event("ordinary text"));
    expect(field.handleChange).toHaveBeenLastCalledWith("ordinary text");
    handleInputChange(field as never, { type: "select" })(event("selected"));
    expect(field.handleChange).toHaveBeenLastCalledWith("selected");
  });
});
