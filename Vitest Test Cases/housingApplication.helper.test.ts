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

import {
  ApplicationStage,
  ApplicationStatus,
  ApplicationSubStage,
} from "~@idaho-th/prisma/client";
import {
  createHousingApplication,
  getProviderApplications,
  getProvidersWithEligibility,
  sendApplicationToProviders,
} from "~@idaho-th/trpc/routes/housingApplication/housingApplication.helpers";
import type {
  CreateHousingApplicationInput,
  EligibilityParams,
} from "~@idaho-th/trpc/routes/housingApplication/housingApplication.types";
import type { HousingProvider } from "~@idaho-th/trpc/routes/housingApplication/services/eligibilityEngine";

vi.mock("~@idaho-th/prisma/client", () => ({
  ApplicationStage: {
    APPLICATION: "APPLICATION",
  },
  ApplicationStatus: {
    ACTION_NEEDED: "ACTION_NEEDED",
    WAITING: "WAITING",
  },
  ApplicationSubStage: {
    INFO_NEEDED: "INFO_NEEDED",
    PROVIDER_REVIEW: "PROVIDER_REVIEW",
  },
  InfoRequestSenderType: {
    PROVIDER: "PROVIDER",
    STAFF: "STAFF",
  },
  InfoRequestStatus: {
    CLOSED: "CLOSED",
    OPEN: "OPEN",
  },
  Prisma: {
    join: vi.fn(),
    sql: vi.fn(),
  },
}));

// The shared helpers module eagerly initializes Document AI, but this
// eligibility-only test never calls it.
vi.mock("~@idaho-th/trpc/services/documentAI", () => ({
  documentAI: {},
}));

const findManyHousingProviders = vi.fn();
const countProviderHousingApplications = vi.fn();
const findManyProviderHousingApplications = vi.fn();
const findFirstStaffHousingApplication = vi.fn();
const findManyEligibleHousingProviders = vi.fn();
const createHousingApplicationRecord = vi.fn();
const createManyProviderHousingApplications = vi.fn();
const updateHousingApplication = vi.fn();
const updateStaffHousingApplication = vi.fn();
const transaction = vi.fn();
const transactionClient = {
  housingApplication: {
    update: updateHousingApplication,
  },
  providerHousingApplication: {
    createMany: createManyProviderHousingApplications,
  },
  staffHousingApplication: {
    update: updateStaffHousingApplication,
  },
};
const prisma = {
  $transaction: transaction,
  eligibleHousingProvider: {
    findMany: findManyEligibleHousingProviders,
  },
  housingApplication: {
    create: createHousingApplicationRecord,
  },
  housingProvider: {
    findMany: findManyHousingProviders,
  },
  providerHousingApplication: {
    count: countProviderHousingApplications,
    findMany: findManyProviderHousingApplications,
  },
  staffHousingApplication: {
    findFirst: findFirstStaffHousingApplication,
  },
} as unknown as Parameters<typeof getProviderApplications>[0];

const baseProvider = {
  email: null,
  locations: [],
  name: "Provider",
} satisfies Omit<HousingProvider, "id">;

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation(async (callback) =>
    callback(transactionClient),
  );
});

describe("getProvidersWithEligibility", () => {
  test("normalizes eligibility filters, tags preferred providers, and returns best provider locations", async () => {
    const eligibleProvider = {
      ...baseProvider,
      email: "eligible@example.com",
      id: "eligible-provider",
      locations: [
        {
          acceptedGenders: ["MALE"],
          acceptsRiders: true,
          acceptsSexOffenders: false,
          acceptsViolentCriminals: false,
          district: "District 1",
          faithBased: true,
          id: "eligible-location",
        },
      ],
      name: "Eligible Home",
    };
    const preferredProvider = {
      ...baseProvider,
      email: "preferred@example.com",
      id: "preferred-provider",
      locations: [
        {
          acceptedGenders: ["FEMALE"],
          acceptsRiders: false,
          acceptsSexOffenders: false,
          acceptsViolentCriminals: false,
          district: "District 2",
          faithBased: false,
          id: "preferred-location",
        },
      ],
      name: "Preferred Home",
    };
    findManyHousingProviders.mockResolvedValue([
      eligibleProvider,
      preferredProvider,
    ]);

    const params: EligibilityParams = {
      faithBasedPreferred: true,
      gender: " Male ",
      hasViolenceHistory: false,
      isRider: true,
      isSexOffender: false,
      preferredDistricts: [" District 1 "],
      preferredProviders: [" Preferred Home "],
    };

    const result = await getProvidersWithEligibility(prisma, {
      eligibilityParams: params,
    });

    expect(findManyHousingProviders).toHaveBeenCalledWith({
      include: { locations: true },
      orderBy: { name: "asc" },
      where: undefined,
    });
    expect(result.providers).toEqual([
      {
        email: "eligible@example.com",
        id: "eligible-provider",
        isPreferred: false,
        name: "Eligible Home",
        providerLocation: {
          acceptedGenders: ["MALE"],
          acceptsRiders: true,
          acceptsSexOffenders: false,
          acceptsViolentCriminals: false,
          district: "District 1",
          faithBased: true,
          id: "eligible-location",
        },
      },
      {
        email: "preferred@example.com",
        id: "preferred-provider",
        isPreferred: true,
        name: "Preferred Home",
        providerLocation: {
          acceptedGenders: ["FEMALE"],
          acceptsRiders: false,
          acceptsSexOffenders: false,
          acceptsViolentCriminals: false,
          district: "District 2",
          faithBased: false,
          id: "preferred-location",
        },
      },
    ]);
  });

  test("uses search filters when provider search is provided", async () => {
    const params: EligibilityParams = {
      faithBasedPreferred: null,
      gender: undefined,
      hasViolenceHistory: null,
      isRider: null,
      isSexOffender: null,
      preferredDistricts: [],
      preferredProviders: [],
    };
    findManyHousingProviders.mockResolvedValue([]);

    await getProvidersWithEligibility(prisma, {
      eligibilityParams: params,
      search: {
        name: {
          contains: "provider",
          mode: "insensitive",
        },
      },
    });

    expect(findManyHousingProviders).toHaveBeenCalledWith({
      include: { locations: true },
      orderBy: { name: "asc" },
      where: {
        name: {
          contains: "provider",
          mode: "insensitive",
        },
      },
    });
  });
});

describe("getProviderApplications", () => {
  test("scopes provider applications query to the logged-in provider", async () => {
    countProviderHousingApplications.mockResolvedValue(0);
    findManyProviderHousingApplications.mockResolvedValue([]);

    const result = await getProviderApplications(prisma, "logged-in-provider", {
      pagination: { pageSize: 7 },
    });

    expect(result.items).toEqual([]);
    expect(countProviderHousingApplications).toHaveBeenCalledWith({
      where: {
        provider: { pseudonymizedId: "logged-in-provider" },
      },
    });
    expect(findManyProviderHousingApplications).toHaveBeenCalledWith({
      include: {
        application: {
          select: {
            clientName: true,
            expectedReleaseDate: true,
            id: true,
            idocNumber: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { application: { createdAt: "desc" } },
      take: 8,
      where: {
        provider: { pseudonymizedId: "logged-in-provider" },
      },
    });
  });
});

describe("createHousingApplication", () => {
  test("creates the housing application with form data, staff application, expected release date, and eligible providers", async () => {
    const formData: CreateHousingApplicationInput["formData"] = {
      accommodations: [],
      accommodationsInfo: null,
      addictions: null,
      additionalMedicalInfo: null,
      age: null,
      benefitsDuration: null,
      benefitsReinstatementDate: null,
      child1Info: null,
      child2Info: null,
      child3Info: null,
      childFamilyServicesDocumentation: [],
      childVisitationInfo: null,
      childVisitationRequired: null,
      clientFullName: "James H. Crumble",
      cmPoEmail: null,
      cmPoName: null,
      cmPoPhone: null,
      contagiousDisease: null,
      currentFacilityLocation: null,
      dob: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      emergencyContactRelationship: null,
      employer: null,
      employerContact: null,
      employmentOnRelease: null,
      faithBasedPreferred: null,
      faithBasedProviderInfo: null,
      gender: "Male",
      housingProbationParoleAtRelease: null,
      idocNumber: "810412",
      idsOnFile: [],
      lastUseDate: null,
      legalBackupForIcOrIce: null,
      legalCountyOfCrime: null,
      legalCurrentStatus: null,
      legalMostRecentConviction: null,
      legalSexOffenderRegistry: null,
      medicalAccommodations: [],
      medicalMhSupportNeeded: null,
      militaryService: null,
      otherAccommodations: null,
      otherMedicalAccommodation: null,
      parentGuardianNames: null,
      paroleHearingCompleted: null,
      personalPhoneNumber: null,
      prescribedMedications: null,
      preferredDistrict: ["D3"],
      preferredProviders: [],
      previousHomeCity: null,
      previousHomeName: null,
      previousTransitionalHome: null,
      priorInvoluntaryDischarge: null,
      signatureDate: null,
      signatureProvided: null,
      ssi90DayCarePlan: null,
      ssiSsdiSsrbMedicareMedicaid: null,
      ssnLast4: null,
      substances: null,
      tpdHousingNeededDate: "2026-06-18",
      underInfluenceAtCrime: null,
      vaEnrolled: null,
      vehicleOnSite: null,
      violenceDischargeDescription: null,
      violenceHistoryDors: null,
    };
    const eligibleProvider = {
      ...baseProvider,
      id: "provider-1",
      locations: [
        {
          acceptedGenders: ["MALE"],
          acceptsRiders: true,
          acceptsSexOffenders: false,
          acceptsViolentCriminals: false,
          district: "D3",
          faithBased: false,
          id: "provider-location-1",
        },
      ],
      name: "208 Property Management (TVH)",
    };
    createHousingApplicationRecord.mockResolvedValue({
      id: "application-123",
    });
    findManyHousingProviders.mockResolvedValue([eligibleProvider]);

    const input: CreateHousingApplicationInput = {
      eligibilityParams: {
        faithBasedPreferred: null,
        gender: "Male",
        hasViolenceHistory: false,
        isRider: true,
        isSexOffender: false,
        preferredDistricts: ["D3"],
        preferredProviders: [],
      },
      formData,
    };

    await createHousingApplication(prisma, "staff-123", input);

    expect(findManyHousingProviders).toHaveBeenCalledWith({
      include: { locations: true },
      orderBy: { name: "asc" },
      where: expect.any(Object),
    });
    expect(createHousingApplicationRecord).toHaveBeenCalledWith({
      data: {
        clientName: "James H. Crumble",
        eligibleProviders: {
          create: [
            {
              providerId: "provider-1",
              providerLocationId: "provider-location-1",
            },
          ],
        },
        expectedReleaseDate: new Date("2026-06-18"),
        formData,
        idocNumber: "810412",
        staffApplication: {
          create: { staffPseudonymizedId: "staff-123" },
        },
        stateCode: "US_ID",
      },
      include: {
        eligibleProviders: {
          include: {
            provider: true,
            providerLocation: true,
          },
        },
        staffApplication: true,
      },
    });
  });
});

describe("sendApplicationToProviders", () => {
  test("creates provider application records for eligible providers", async () => {
    findFirstStaffHousingApplication.mockResolvedValue({
      id: "staff-application",
    });
    findManyEligibleHousingProviders.mockResolvedValue([
      {
        providerId: "provider-1",
        providerLocationId: "provider-location-1",
      },
      {
        providerId: "provider-2",
        providerLocationId: "provider-location-2",
      },
    ]);

    await sendApplicationToProviders(prisma, "staff-123", {
      applicationId: "application-123",
      providerIds: ["provider-1", "provider-2"],
    });

    expect(findFirstStaffHousingApplication).toHaveBeenCalledWith({
      where: {
        applicationId: "application-123",
        staffPseudonymizedId: "staff-123",
      },
      select: { id: true },
    });
    expect(findManyEligibleHousingProviders).toHaveBeenCalledWith({
      where: {
        applicationId: "application-123",
        providerId: { in: ["provider-1", "provider-2"] },
      },
      select: { providerId: true, providerLocationId: true },
    });
    expect(createManyProviderHousingApplications).toHaveBeenCalledWith({
      data: [
        {
          applicationId: "application-123",
          providerId: "provider-1",
          providerLocationId: "provider-location-1",
          stage: ApplicationStage.APPLICATION,
          status: ApplicationStatus.ACTION_NEEDED,
          subStage: ApplicationSubStage.PROVIDER_REVIEW,
        },
        {
          applicationId: "application-123",
          providerId: "provider-2",
          providerLocationId: "provider-location-2",
          stage: ApplicationStage.APPLICATION,
          status: ApplicationStatus.ACTION_NEEDED,
          subStage: ApplicationSubStage.PROVIDER_REVIEW,
        },
      ],
      skipDuplicates: true,
    });
    expect(updateHousingApplication).toHaveBeenCalledWith({
      where: { id: "application-123" },
      data: { sentToProvidersAt: expect.any(Date) },
    });
    expect(updateStaffHousingApplication).toHaveBeenCalledWith({
      where: {
        applicationId: "application-123",
        staffPseudonymizedId: "staff-123",
      },
      data: {
        stage: ApplicationStage.APPLICATION,
        status: ApplicationStatus.WAITING,
        subStage: ApplicationSubStage.PROVIDER_REVIEW,
      },
    });
  });

  test("does not create duplicate provider application records when sent twice", async () => {
    findFirstStaffHousingApplication.mockResolvedValue({
      id: "staff-application",
    });
    findManyEligibleHousingProviders.mockResolvedValue([
      {
        providerId: "provider-1",
        providerLocationId: "provider-location-1",
      },
    ]);

    await sendApplicationToProviders(prisma, "staff-123", {
      applicationId: "application-123",
      providerIds: ["provider-1"],
    });
    await sendApplicationToProviders(prisma, "staff-123", {
      applicationId: "application-123",
      providerIds: ["provider-1"],
    });

    expect(createManyProviderHousingApplications).toHaveBeenCalledTimes(2);
    expect(createManyProviderHousingApplications).toHaveBeenNthCalledWith(1, {
      data: [
        {
          applicationId: "application-123",
          providerId: "provider-1",
          providerLocationId: "provider-location-1",
          stage: ApplicationStage.APPLICATION,
          status: ApplicationStatus.ACTION_NEEDED,
          subStage: ApplicationSubStage.PROVIDER_REVIEW,
        },
      ],
      skipDuplicates: true,
    });
    expect(createManyProviderHousingApplications).toHaveBeenNthCalledWith(2, {
      data: [
        {
          applicationId: "application-123",
          providerId: "provider-1",
          providerLocationId: "provider-location-1",
          stage: ApplicationStage.APPLICATION,
          status: ApplicationStatus.ACTION_NEEDED,
          subStage: ApplicationSubStage.PROVIDER_REVIEW,
        },
      ],
      skipDuplicates: true,
    });
  });

  test("rejects when staff does not own the application", async () => {
    findFirstStaffHousingApplication.mockResolvedValue(null);

    await expect(
      sendApplicationToProviders(prisma, "staff-123", {
        applicationId: "application-123",
        providerIds: ["provider-1"],
      }),
    ).rejects.toThrow("Not authorized to send this application");
    expect(findManyEligibleHousingProviders).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  test("rejects when selected providers are not eligible", async () => {
    findFirstStaffHousingApplication.mockResolvedValue({
      id: "staff-application",
    });
    findManyEligibleHousingProviders.mockResolvedValue([]);

    await expect(
      sendApplicationToProviders(prisma, "staff-123", {
        applicationId: "application-123",
        providerIds: ["provider-1"],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "No eligible providers found for the selected provider IDs",
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});
