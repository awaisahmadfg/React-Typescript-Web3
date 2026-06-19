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

import { USER_ROLE } from "~@idaho-th/trpc/auth/constants";
import type { createContext } from "~@idaho-th/trpc/context";

import { providerProcedure, router, staffProcedure } from "../init";

const testRouter = router({
  providerOnly: providerProcedure.query(() => "provider data"),
  staffOnly: staffProcedure.query(() => "staff data"),
});

type Context = Awaited<ReturnType<typeof createContext>>;

function createTestContext(overrides: Partial<Context>): Context {
  return {
    isAuthorized: true,
    providerPseudonymizedId: undefined,
    role: undefined,
    staffPseudonymizedId: undefined,
    ...overrides,
  } as Context;
}

describe("staffProcedure", () => {
  test("rejects unauthenticated users from staff-only APIs", async () => {
    const unauthenticatedContext = createTestContext({
      isAuthorized: false,
    });

    await expect(
      testRouter.createCaller(unauthenticatedContext).staffOnly(),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("Provider user cannot access staff-only APIs", async () => {
    const providerContext = createTestContext({
      providerPseudonymizedId: "provider-123",
      role: USER_ROLE.PROVIDER,
    });

    await expect(
      testRouter.createCaller(providerContext).staffOnly(),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Staff access required",
    });
  });
});

describe("providerProcedure", () => {
  test("rejects unauthenticated users from provider-only APIs", async () => {
    const unauthenticatedContext = createTestContext({
      isAuthorized: false,
    });

    await expect(
      testRouter.createCaller(unauthenticatedContext).providerOnly(),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("Staff user cannot access provider-only APIs", async () => {
    const staffContext = createTestContext({
      role: USER_ROLE.STAFF,
      staffPseudonymizedId: "staff-123",
    });

    await expect(
      testRouter.createCaller(staffContext).providerOnly(),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Provider access required",
    });
  });
});
