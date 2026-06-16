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

import { beforeEach, describe, expect, test, vi } from "vitest";

import { UserStore } from "../UserStore";

const STAFF_AUTH0_CONNECTION = "Username-Password-Authentication";

const testDoubles = vi.hoisted(() => ({
  createAuth0Client: vi.fn(),
  loginWithRedirect: vi.fn(),
}));

vi.mock("@auth0/auth0-spa-js", () => ({
  createAuth0Client: testDoubles.createAuth0Client,
}));

describe("UserStore", () => {
  beforeEach(() => {
    testDoubles.createAuth0Client.mockResolvedValue({
      loginWithRedirect: testDoubles.loginWithRedirect,
    });
    testDoubles.loginWithRedirect.mockReset();
  });

  test("starts login with the staff Auth0 connection for a staff email", async () => {
    const userStore = new UserStore({
      authorizationParams: {
        audience: "https://idaho-th-api",
        redirect_uri: "http://localhost:4300",
      },
      clientId: "auth0-client-id",
      domain: "example.auth0.com",
    });

    await userStore.loginWithEmail("staff.user@idoc.idaho.gov");

    expect(testDoubles.loginWithRedirect).toHaveBeenCalledWith({
      appState: { targetUrl: `${window.location.origin}/` },
      authorizationParams: {
        connection: STAFF_AUTH0_CONNECTION,
        login_hint: "staff.user@idoc.idaho.gov",
      },
    });
  });
});
