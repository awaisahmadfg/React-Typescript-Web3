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

import type { PrismaClient } from "~@idaho-th/prisma/client";
import { PDF_OUTPUT_MODE } from "~@idaho-th/trpc/pdfSorter/constants";
import { PdfProcessingError } from "~@idaho-th/trpc/pdfSorter/errors";
import {
  VertexExtractionTimeoutError,
  VertexQuotaExceededError,
  VertexResponseValidationError,
} from "~@idaho-th/trpc/routes/vertex/vertex.errors";
import { extractWithVertexAIService } from "~@idaho-th/trpc/routes/vertex/vertex.housing.extractor";
import type {
  HousingApplicationExtractedData,
  HousingVertexProcedureDeps,
  PreparedPdf,
} from "~@idaho-th/trpc/routes/vertex/vertex.types";

const mocks = vi.hoisted(() => ({
  createDraftIntakeApplication: vi.fn(),
  getHousingProviderNameOptions: vi.fn(),
  preparePdfSafely: vi.fn(),
  uploadPreparedCombinedPdfToGcs: vi.fn(),
}));

vi.mock("~@idaho-th/trpc/pdfSorter/prepare/preparePdfSafely", () => ({
  preparePdfSafely: mocks.preparePdfSafely,
}));

vi.mock("~@idaho-th/trpc/storage/gcs", () => ({
  deleteGcsObject: vi.fn(),
}));

vi.mock(
  "~@idaho-th/trpc/routes/housingApplication/services/draftIntake/draftIntake.service",
  () => ({
    createDraftIntakeApplication: mocks.createDraftIntakeApplication,
  }),
);

vi.mock(
  "~@idaho-th/trpc/routes/housingApplication/housingApplication.helpers",
  () => ({
    getHousingProviderNameOptions: mocks.getHousingProviderNameOptions,
  }),
);

vi.mock("~@idaho-th/trpc/routes/vertex/vertex.preparedPdf.upload", () => ({
  toPreparedPdfForClient: (upload: {
    signedUrl: string;
    sizeInBytes?: number;
    updatedAt?: string;
  }) => ({
    signedUrl: upload.signedUrl,
    sizeInBytes: upload.sizeInBytes,
    updatedAt: upload.updatedAt,
  }),
  uploadPreparedCombinedPdfToGcs: mocks.uploadPreparedCombinedPdfToGcs,
}));

const extractedApplication = {
  benefits: {
    benefitsDuration: "12 months",
    benefitsReinstatementDate: "2026-07-15",
    ssiSsdiSsrbMedicareMedicaid: true,
  },
  caseManager: {
    cmPoEmail: "swebb@idoc.idaho.gov",
    cmPoName: "S. Webb",
    cmPoPhone: "208-604-6619",
    currentFacilityLocation: "ISCC",
  },
  childVisitation: {
    child1Info: null,
    child2Info: null,
    child3Info: null,
    childFamilyServicesDocumentation: ["None"],
    childVisitationInfo: null,
    parentGuardianNames: null,
  },
  clientIdentity: {
    age: 66,
    clientFullName: "James H. Crumble",
    dob: "1959-10-23",
    gender: "Male",
    idocNumber: "810412",
    personalPhoneNumber: "208-555-0100",
    ssnLast4: "1234",
  },
  emergencyContact: {
    emergencyContactName: "Jane Crumble",
    emergencyContactPhone: "208-555-0101",
    emergencyContactRelationship: "Sister",
  },
  employment: {
    employer: "Warehouse",
    employerContact: "Boss",
    employmentOnRelease: true,
  },
  housingPreferences: {
    faithBasedPreferred: true,
    preferredDistrict: ["D3"],
    preferredProviders: ["208 Property Management (TVH)"],
    previousHomeCity: "Boise",
    previousHomeName: "Previous Home",
    previousTransitionalHome: true,
  },
  identification: {
    idsOnFile: ["State ID"],
  },
  legalStatus: {
    childVisitationRequired: false,
    housingProbationParoleAtRelease: true,
    legalBackupForIcOrIce: false,
    legalCountyOfCrime: "Ada",
    legalCurrentStatus: "Rider",
    legalMostRecentConviction: "Burglary",
    legalSexOffenderRegistry: false,
    paroleHearingCompleted: true,
    priorInvoluntaryDischarge: false,
    tpdHousingNeededDate: "2026-06-18",
    vehicleOnSite: false,
    violenceHistoryDors: false,
  },
  medicalSupport: {
    additionalMedicalInfo: "Needs regular medication",
    assistanceCbrs: false,
    assistanceCbrsCompany: null,
    contagiousDisease: false,
    contagiousDiseaseCompany: null,
    medicalAccommodations: [],
    medicalMhSupportNeeded: true,
    moudMatProgram: false,
    moudMatProgramCompany: null,
    ongoingMedicalMhTreatment: true,
    ongoingMedicalMhTreatmentCompany: "Clinic",
    otherMedicalAccommodation: null,
    prescriptionMedication: true,
    prescriptionMedicationCompany: "Pharmacy",
  },
  military: {
    militaryService: false,
    vaEnrolled: false,
  },
  reasonableAccommodations: {
    accommodations: ["Walker"],
    accommodationsInfo: "Lower bunk",
    otherAccommodations: null,
  },
  signature: {
    signatureDate: "2026-06-01",
    signatureProvided: true,
  },
  substanceUse: {
    addictions: false,
    lastUseDate: "2025-12-01",
    prescribedMedications: "Medication list",
    substances: null,
    underInfluenceAtCrime: false,
  },
  supportPlan: {
    faithBasedProviderInfo: "Open to faith-based provider",
    ssi90DayCarePlan: "Plan in place",
  },
  violenceAndDischarge: {
    violenceDischargeDescription: null,
  },
} satisfies HousingApplicationExtractedData;

describe("extractWithVertexAIService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDraftIntakeApplication.mockResolvedValue({
      applicationId: "application-123",
    });
  });

  test("returns extracted application data and prepared PDF on success", async () => {
    const preparedPdf = {
      combinedBase64: "prepared-combined-pdf-base64",
      missingPageNumbers: [],
      perPageBase64: [],
    } satisfies PreparedPdf;
    const preparedPdfUpload = {
      bucketName: "test-bucket",
      contentType: "application/pdf",
      objectKey: "prepared/application.pdf",
      signedUrl: "https://example.com/prepared/application.pdf",
      sizeInBytes: 1234,
      updatedAt: "2026-06-18T00:00:00.000Z",
    };
    const analyzeApplicationPdf = vi.fn().mockResolvedValue({
      data: extractedApplication,
    });
    const prisma = {} as PrismaClient;
    const log = {
      error: vi.fn(),
      info: vi.fn(),
    };

    mocks.getHousingProviderNameOptions.mockResolvedValue([
      "208 Property Management (TVH)",
    ]);
    mocks.preparePdfSafely.mockResolvedValue(preparedPdf);
    mocks.uploadPreparedCombinedPdfToGcs.mockResolvedValue(preparedPdfUpload);

    const result = await extractWithVertexAIService(
      "original-pdf-base64",
      {
        procedureName: "vertex.extractWithVertexAI",
        staffPseudonymizedId: "staff-123",
        traceId: "trace-123",
      },
      {
        extractor: { analyzeApplicationPdf },
        log,
        prisma,
      } satisfies HousingVertexProcedureDeps,
      {
        fileName: "application.pdf",
        perPageExtraction: false,
      },
    );

    expect(mocks.preparePdfSafely).toHaveBeenCalledWith(
      "original-pdf-base64",
      {
        outputMode: PDF_OUTPUT_MODE.COMBINED,
        testOutputDir: undefined,
        writeTestFiles: false,
      },
    );
    expect(analyzeApplicationPdf).toHaveBeenCalledWith(
      "prepared-combined-pdf-base64",
      expect.objectContaining({
        perPageExtraction: false,
      }),
    );
    expect(mocks.uploadPreparedCombinedPdfToGcs).toHaveBeenCalledWith(
      preparedPdf,
      {
        procedureMeta: {
          prisma,
          procedureName: "vertex.extractWithVertexAI.uploadPreparedPdf",
          staffPseudonymizedId: "staff-123",
          traceId: "trace-123",
        },
      },
    );
    expect(result).toEqual({
      applicationId: expect.any(String),
      application: expect.objectContaining({
        clientFullName: "James H. Crumble",
        dob: "10/23/1959",
        gender: "Male",
        idocNumber: "810412",
        legalCountyOfCrime: "Ada",
        medicalAccommodations: [
          "Prescription Medication",
          "Ongoing Medical/MH Treatment",
        ],
        preferredDistrict: ["D3"],
        signatureDate: "06/01/2026",
        tpdHousingNeededDate: "06/18/2026",
      }),
      preparedPdf: {
        signedUrl: "https://example.com/prepared/application.pdf",
        sizeInBytes: 1234,
        updatedAt: "2026-06-18T00:00:00.000Z",
      },
    });
  });

  test("maps timeout errors to TIMEOUT", async () => {
    const preparedPdf = {
      combinedBase64: "prepared-combined-pdf-base64",
      missingPageNumbers: [],
      perPageBase64: [],
    } satisfies PreparedPdf;
    const analyzeApplicationPdf = vi
      .fn()
      .mockRejectedValue(
        new VertexExtractionTimeoutError("Vertex extraction timed out"),
      );

    mocks.getHousingProviderNameOptions.mockResolvedValue([
      "208 Property Management (TVH)",
    ]);
    mocks.preparePdfSafely.mockResolvedValue(preparedPdf);
    mocks.uploadPreparedCombinedPdfToGcs.mockResolvedValue({
      bucketName: "test-bucket",
      contentType: "application/pdf",
      objectKey: "prepared/application.pdf",
      signedUrl: "https://example.com/prepared/application.pdf",
    });

    await expect(
      extractWithVertexAIService(
        "original-pdf-base64",
        {
          procedureName: "vertex.extractWithVertexAI",
          staffPseudonymizedId: "staff-123",
          traceId: "trace-123",
        },
        {
          extractor: { analyzeApplicationPdf },
          log: {
            error: vi.fn(),
            info: vi.fn(),
          },
          prisma: {} as PrismaClient,
        } satisfies HousingVertexProcedureDeps,
        {
          perPageExtraction: false,
        },
      ),
    ).rejects.toMatchObject({
      code: "TIMEOUT",
      message: "Vertex extraction timed out",
    });
  });

  test("maps quota errors to TOO_MANY_REQUESTS", async () => {
    const preparedPdf = {
      combinedBase64: "prepared-combined-pdf-base64",
      missingPageNumbers: [],
      perPageBase64: [],
    } satisfies PreparedPdf;
    const analyzeApplicationPdf = vi
      .fn()
      .mockRejectedValue(new VertexQuotaExceededError());

    mocks.getHousingProviderNameOptions.mockResolvedValue([
      "208 Property Management (TVH)",
    ]);
    mocks.preparePdfSafely.mockResolvedValue(preparedPdf);
    mocks.uploadPreparedCombinedPdfToGcs.mockResolvedValue({
      bucketName: "test-bucket",
      contentType: "application/pdf",
      objectKey: "prepared/application.pdf",
      signedUrl: "https://example.com/prepared/application.pdf",
    });

    await expect(
      extractWithVertexAIService(
        "original-pdf-base64",
        {
          procedureName: "vertex.extractWithVertexAI",
          staffPseudonymizedId: "staff-123",
          traceId: "trace-123",
        },
        {
          extractor: { analyzeApplicationPdf },
          log: {
            error: vi.fn(),
            info: vi.fn(),
          },
          prisma: {} as PrismaClient,
        } satisfies HousingVertexProcedureDeps,
        {
          perPageExtraction: false,
        },
      ),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "Vertex AI quota exceeded",
    });
  });

  test("maps invalid PDF errors to BAD_REQUEST", async () => {
    const analyzeApplicationPdf = vi.fn();

    mocks.getHousingProviderNameOptions.mockResolvedValue([
      "208 Property Management (TVH)",
    ]);
    mocks.preparePdfSafely.mockRejectedValue(
      new PdfProcessingError("Invalid PDF"),
    );

    await expect(
      extractWithVertexAIService(
        "invalid-pdf-base64",
        {
          procedureName: "vertex.extractWithVertexAI",
          staffPseudonymizedId: "staff-123",
          traceId: "trace-123",
        },
        {
          extractor: { analyzeApplicationPdf },
          log: {
            error: vi.fn(),
            info: vi.fn(),
          },
          prisma: {} as PrismaClient,
        } satisfies HousingVertexProcedureDeps,
        {
          perPageExtraction: false,
        },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Invalid PDF",
    });
    expect(analyzeApplicationPdf).not.toHaveBeenCalled();
    expect(mocks.uploadPreparedCombinedPdfToGcs).not.toHaveBeenCalled();
  });

  test("maps invalid LLM response errors to BAD_REQUEST", async () => {
    const preparedPdf = {
      combinedBase64: "prepared-combined-pdf-base64",
      missingPageNumbers: [],
      perPageBase64: [],
    } satisfies PreparedPdf;
    const analyzeApplicationPdf = vi
      .fn()
      .mockRejectedValue(
        new VertexResponseValidationError(
          "Vertex AI response validation failed",
        ),
      );

    mocks.getHousingProviderNameOptions.mockResolvedValue([
      "208 Property Management (TVH)",
    ]);
    mocks.preparePdfSafely.mockResolvedValue(preparedPdf);
    mocks.uploadPreparedCombinedPdfToGcs.mockResolvedValue({
      bucketName: "test-bucket",
      contentType: "application/pdf",
      objectKey: "prepared/application.pdf",
      signedUrl: "https://example.com/prepared/application.pdf",
    });

    await expect(
      extractWithVertexAIService(
        "original-pdf-base64",
        {
          procedureName: "vertex.extractWithVertexAI",
          staffPseudonymizedId: "staff-123",
          traceId: "trace-123",
        },
        {
          extractor: { analyzeApplicationPdf },
          log: {
            error: vi.fn(),
            info: vi.fn(),
          },
          prisma: {} as PrismaClient,
        } satisfies HousingVertexProcedureDeps,
        {
          perPageExtraction: false,
        },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Vertex AI response validation failed",
    });
  });

  test("includes missingPages when prepared PDF has missing pages", async () => {
    const preparedPdf = {
      combinedBase64: "prepared-combined-pdf-base64",
      missingPageNumbers: [3],
      perPageBase64: ["page-1-base64", "page-2-base64", undefined, undefined],
    } satisfies PreparedPdf;
    const analyzeApplicationPdf = vi.fn().mockResolvedValue({
      data: extractedApplication,
    });

    mocks.getHousingProviderNameOptions.mockResolvedValue([
      "208 Property Management (TVH)",
    ]);
    mocks.preparePdfSafely.mockResolvedValue(preparedPdf);
    mocks.uploadPreparedCombinedPdfToGcs.mockResolvedValue({
      bucketName: "test-bucket",
      contentType: "application/pdf",
      objectKey: "prepared/application.pdf",
      signedUrl: "https://example.com/prepared/application.pdf",
    });

    const result = await extractWithVertexAIService(
      "original-pdf-base64",
      {
        procedureName: "vertex.extractWithVertexAI",
        staffPseudonymizedId: "staff-123",
        traceId: "trace-123",
      },
      {
        extractor: { analyzeApplicationPdf },
        log: {
          error: vi.fn(),
          info: vi.fn(),
        },
        prisma: {} as PrismaClient,
      } satisfies HousingVertexProcedureDeps,
      {
        perPageExtraction: false,
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        missingPages: [3],
      }),
    );
  });
});
