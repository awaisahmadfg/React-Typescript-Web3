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

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApplicationStage,
  ApplicationStatus,
  ApplicationSubStage,
  InfoRequestSenderType,
  InfoRequestStatus,
} from "~@idaho-th/prisma/client";
import { PROVIDER_RESPONSE_TYPE } from "~@idaho-th/shared";
import { INFO_REQUEST_BAD_REQUEST } from "~@idaho-th/trpc/routes/housingApplication/services/infoRequest";
import {
  PROVIDER_RESPONSE_BAD_REQUEST,
  submitProviderApplicationResponse,
} from "~@idaho-th/trpc/routes/housingApplication/services/providerResponse";

describe("submitProviderApplicationResponse", () => {
  const applicationId = "app-1";
  const providerApplicationId = "provider-app-1";
  const providerPseudonymizedId = "provider-1";
  const infoRequestId = "info-request-1";
  const message = "Please provide additional documentation";

  let housingApplicationFindFirst: ReturnType<typeof vi.fn>;
  let housingApplicationUpdate: ReturnType<typeof vi.fn>;

  function buildApplicationRow(
    overrides: {
      subStage?: ApplicationSubStage;
      openInfoRequestId?: string | null;
      sentToProvidersAt?: Date | null;
    } = {},
  ) {
    return {
      id: applicationId,
      sentToProvidersAt:
        "sentToProvidersAt" in overrides
          ? overrides.sentToProvidersAt
          : new Date("2026-06-01T00:00:00.000Z"),
      staffApplication: {
        id: "staff-app-1",
        status: ApplicationStatus.WAITING,
      },
      providerApplications: [
        {
          id: providerApplicationId,
          stage: ApplicationStage.APPLICATION,
          subStage: overrides.subStage ?? ApplicationSubStage.PROVIDER_REVIEW,
          provider: { pseudonymizedId: providerPseudonymizedId },
          infoRequests:
            typeof overrides.openInfoRequestId === "string"
              ? [{ id: overrides.openInfoRequestId }]
              : [],
        },
      ],
    };
  }

  function buildTransaction() {
    return {
      $queryRaw: vi.fn().mockResolvedValue([{ id: applicationId }]),
      housingApplication: {
        findFirst: housingApplicationFindFirst,
        update: housingApplicationUpdate,
      },
      providerHousingApplication: { findFirst: vi.fn() },
      housingApplicationInfoRequest: {
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    };
  }

  beforeEach(() => {
    housingApplicationFindFirst = vi.fn();
    housingApplicationUpdate = vi.fn();
  });

  it("allows a provider to request more information with a message", async () => {
    housingApplicationFindFirst.mockResolvedValue(buildApplicationRow());
    housingApplicationUpdate.mockResolvedValue({
      providerApplications: [{ infoRequests: [{ id: infoRequestId }] }],
    });

    const tx = buildTransaction();
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    const result = await submitProviderApplicationResponse(
      prisma as never,
      providerPseudonymizedId,
      applicationId,
      PROVIDER_RESPONSE_TYPE.INFO_NEEDED,
      message,
    );

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(housingApplicationFindFirst).toHaveBeenCalledTimes(1);
    expect(housingApplicationUpdate).toHaveBeenCalledTimes(1);
    expect(tx.providerHousingApplication.findFirst).not.toHaveBeenCalled();
    expect(tx.housingApplicationInfoRequest.findFirst).not.toHaveBeenCalled();
    expect(tx.housingApplicationInfoRequest.create).not.toHaveBeenCalled();
    expect(housingApplicationUpdate).toHaveBeenCalledWith({
      where: { id: applicationId },
      data: {
        staffApplication: {
          update: {
            subStage: ApplicationSubStage.INFO_NEEDED,
            status: ApplicationStatus.ACTION_NEEDED,
          },
        },
        providerApplications: {
          update: {
            where: { id: providerApplicationId },
            data: {
              stage: ApplicationStage.APPLICATION,
              subStage: ApplicationSubStage.INFO_NEEDED,
              status: ApplicationStatus.WAITING,
              infoRequests: {
                create: {
                  messages: {
                    create: {
                      senderType: InfoRequestSenderType.PROVIDER,
                      senderPseudonymizedId: providerPseudonymizedId,
                      body: message,
                    },
                  },
                },
              },
            },
          },
        },
      },
      select: expect.objectContaining({
        providerApplications: expect.any(Object),
      }),
    });
    expect(result).toMatchObject({
      applicationId,
      response: PROVIDER_RESPONSE_TYPE.INFO_NEEDED,
      staffSubStage: ApplicationSubStage.INFO_NEEDED,
      staffStatus: ApplicationStatus.ACTION_NEEDED,
      message,
      infoRequestId,
    });
  });

  it("allows a provider to conditionally approve an application", async () => {
    housingApplicationFindFirst.mockResolvedValue(buildApplicationRow());
    housingApplicationUpdate.mockResolvedValue({});

    const tx = buildTransaction();
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    const result = await submitProviderApplicationResponse(
      prisma as never,
      providerPseudonymizedId,
      applicationId,
      PROVIDER_RESPONSE_TYPE.CONDITIONALLY_APPROVE,
    );

    expect(housingApplicationUpdate).toHaveBeenCalledTimes(1);
    expect(housingApplicationUpdate).toHaveBeenCalledWith({
      where: { id: applicationId },
      data: {
        staffApplication: {
          update: {
            subStage: ApplicationSubStage.OFFERS_RECEIVED,
            status: ApplicationStatus.ACTION_NEEDED,
          },
        },
        providerApplications: {
          update: {
            where: { id: providerApplicationId },
            data: {
              stage: ApplicationStage.APPLICATION,
              subStage: ApplicationSubStage.CONDITIONALLY_APPROVED,
              status: ApplicationStatus.WAITING,
              infoRequests: {
                updateMany: {
                  where: { status: InfoRequestStatus.OPEN },
                  data: expect.objectContaining({
                    status: InfoRequestStatus.CLOSED,
                    resolvedAt: expect.any(Date),
                  }),
                },
              },
            },
          },
        },
      },
    });
    expect(result).toMatchObject({
      applicationId,
      response: PROVIDER_RESPONSE_TYPE.CONDITIONALLY_APPROVE,
      staffSubStage: ApplicationSubStage.OFFERS_RECEIVED,
      staffStatus: ApplicationStatus.ACTION_NEEDED,
    });
  });

  it("allows a provider to decline an application", async () => {
    housingApplicationFindFirst.mockResolvedValue(buildApplicationRow());
    housingApplicationUpdate.mockResolvedValue({});

    const tx = buildTransaction();
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    const result = await submitProviderApplicationResponse(
      prisma as never,
      providerPseudonymizedId,
      applicationId,
      PROVIDER_RESPONSE_TYPE.DECLINE,
    );

    expect(housingApplicationUpdate).toHaveBeenCalledTimes(1);
    expect(tx.housingApplicationInfoRequest.updateMany).not.toHaveBeenCalled();
    expect(housingApplicationUpdate).toHaveBeenCalledWith({
      where: { id: applicationId },
      data: {
        staffApplication: {
          update: {
            subStage: ApplicationSubStage.DECLINED,
            status: ApplicationStatus.ACTION_NEEDED,
          },
        },
        providerApplications: {
          update: {
            where: { id: providerApplicationId },
            data: {
              stage: ApplicationStage.CLOSED,
              subStage: ApplicationSubStage.DECLINED,
              status: ApplicationStatus.DONE,
              infoRequests: {
                updateMany: {
                  where: { status: InfoRequestStatus.OPEN },
                  data: expect.objectContaining({
                    status: InfoRequestStatus.CLOSED,
                    resolvedAt: expect.any(Date),
                  }),
                },
              },
            },
          },
        },
      },
    });
    expect(result).toMatchObject({
      applicationId,
      response: PROVIDER_RESPONSE_TYPE.DECLINE,
      staffSubStage: ApplicationSubStage.DECLINED,
      staffStatus: ApplicationStatus.ACTION_NEEDED,
    });
  });

  it("rejects a provider information request without a message", async () => {
    housingApplicationFindFirst.mockResolvedValue(buildApplicationRow());

    const tx = buildTransaction();
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      submitProviderApplicationResponse(
        prisma as never,
        providerPseudonymizedId,
        applicationId,
        PROVIDER_RESPONSE_TYPE.INFO_NEEDED,
        "   ",
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "BAD_REQUEST",
        message: PROVIDER_RESPONSE_BAD_REQUEST.MESSAGE_REQUIRED,
      } satisfies Partial<TRPCError>),
    );

    expect(housingApplicationUpdate).not.toHaveBeenCalled();
  });

  it("rejects INFO_NEEDED when an open information request already exists", async () => {
    housingApplicationFindFirst.mockResolvedValue(
      buildApplicationRow({ openInfoRequestId: infoRequestId }),
    );

    const tx = buildTransaction();
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      submitProviderApplicationResponse(
        prisma as never,
        providerPseudonymizedId,
        applicationId,
        PROVIDER_RESPONSE_TYPE.INFO_NEEDED,
        message,
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "BAD_REQUEST",
        message: INFO_REQUEST_BAD_REQUEST.OPEN_INFO_REQUEST_EXISTS,
      } satisfies Partial<TRPCError>),
    );

    expect(housingApplicationUpdate).not.toHaveBeenCalled();
  });

  it("rejects provider responses before the application is sent to providers", async () => {
    housingApplicationFindFirst.mockResolvedValue(
      buildApplicationRow({ sentToProvidersAt: null }),
    );

    const tx = buildTransaction();
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      submitProviderApplicationResponse(
        prisma as never,
        providerPseudonymizedId,
        applicationId,
        PROVIDER_RESPONSE_TYPE.CONDITIONALLY_APPROVE,
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "BAD_REQUEST",
        message: "Application has not been sent to providers",
      } satisfies Partial<TRPCError>),
    );

    expect(housingApplicationUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ApplicationSubStage.DECLINED,
    ApplicationSubStage.SELECTED,
  ])(
    "rejects provider responses when the provider application is locked in %s",
    async (subStage) => {
      housingApplicationFindFirst.mockResolvedValue(
        buildApplicationRow({ subStage }),
      );

      const tx = buildTransaction();
      const prisma = {
        $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
      };

      await expect(
        submitProviderApplicationResponse(
          prisma as never,
          providerPseudonymizedId,
          applicationId,
          PROVIDER_RESPONSE_TYPE.CONDITIONALLY_APPROVE,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "BAD_REQUEST",
          message: "Application response can no longer be changed",
        } satisfies Partial<TRPCError>),
      );

      expect(housingApplicationUpdate).not.toHaveBeenCalled();
    },
  );

  it("rejects a provider response for another provider's application", async () => {
    housingApplicationFindFirst.mockResolvedValue(null);

    const tx = buildTransaction();
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      submitProviderApplicationResponse(
        prisma as never,
        providerPseudonymizedId,
        applicationId,
        PROVIDER_RESPONSE_TYPE.DECLINE,
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "NOT_FOUND",
        message: "Application not found for this provider",
      } satisfies Partial<TRPCError>),
    );

    expect(housingApplicationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: applicationId,
          providerApplications: {
            some: {
              provider: {
                pseudonymizedId: providerPseudonymizedId,
              },
            },
          },
        },
      }),
    );
    expect(housingApplicationUpdate).not.toHaveBeenCalled();
  });
});
