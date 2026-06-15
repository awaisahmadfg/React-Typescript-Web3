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

import type { createContext } from "~@idaho-th/trpc/context";

import { authRouter } from "../auth.route";

type Context = Awaited<ReturnType<typeof createContext>>;

function createTestContext(ip: string, findFirst = vi.fn()): Context {
  return {
    isAuthorized: false,
    prisma: {
      housingProvider: {
        findFirst,
      },
    },
    providerPseudonymizedId: undefined,
    req: {
      headers: {},
      ip,
    },
    role: undefined,
    staffPseudonymizedId: undefined,
  } as unknown as Context;
}

describe("authRouter", () => {
  test("Email check returns correct result for staff, provider, and unregistered provider", async () => {
    const findProviderByEmail = vi
      .fn()
      .mockResolvedValueOnce({ id: "provider-id-123" })
      .mockResolvedValueOnce(null);

    await expect(
      authRouter
        .createCaller(createTestContext("203.0.113.1", findProviderByEmail))
        .checkSignInEmail({ email: "staff.user@idoc.idaho.gov" }),
    ).resolves.toEqual({ flow: "staff", ok: true });
    expect(findProviderByEmail).not.toHaveBeenCalled();

    await expect(
      authRouter
        .createCaller(createTestContext("203.0.113.2", findProviderByEmail))
        .checkSignInEmail({ email: "provider@example.com" }),
    ).resolves.toEqual({ flow: "provider", ok: true });

    await expect(
      authRouter
        .createCaller(createTestContext("203.0.113.3", findProviderByEmail))
        .checkSignInEmail({ email: "missing-provider@example.com" }),
    ).resolves.toEqual({ flow: "provider", ok: false });
    expect(findProviderByEmail).toHaveBeenNthCalledWith(1, {
      select: { id: true },
      where: {
        email: { equals: "provider@example.com", mode: "insensitive" },
      },
    });
    expect(findProviderByEmail).toHaveBeenNthCalledWith(2, {
      select: { id: true },
      where: {
        email: {
          equals: "missing-provider@example.com",
          mode: "insensitive",
        },
      },
    });
  });
});
