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
  getProviderApplications,
  getProvidersWithEligibility,
} from "~@idaho-th/trpc/routes/housingApplication/housingApplication.helpers";
import type { HousingProvider } from "~@idaho-th/trpc/routes/housingApplication/housingApplication.services/eligibilityEngine";
import type { EligibilityParams } from "~@idaho-th/trpc/routes/housingApplication/housingApplication.types";

vi.mock("~@idaho-th/prisma/client", () => ({
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
const prisma = {
  housingProvider: {
    findMany: findManyHousingProviders,
  },
  providerHousingApplication: {
    count: countProviderHousingApplications,
    findMany: findManyProviderHousingApplications,
  },
} as unknown as Parameters<typeof getProviderApplications>[0];

const baseProvider = {
  email: null,
  locations: [],
  name: "Provider",
} satisfies Omit<HousingProvider, "id">;

beforeEach(() => {
  vi.clearAllMocks();
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
      include: { application: true },
      orderBy: { application: { createdAt: "desc" } },
      take: 8,
      where: {
        provider: { pseudonymizedId: "logged-in-provider" },
      },
    });
  });
});
