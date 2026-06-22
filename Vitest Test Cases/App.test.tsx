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

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import App from "./App";

const testDoubles = vi.hoisted(() => ({
  sessionResult: {
    data: {
      providerPseudonymizedId: undefined as string | undefined,
      role: "provider",
    },
    isLoading: false,
  },
  userStore: {
    isAuthorized: true,
    user: {},
    userIsLoading: false,
  },
}));

vi.mock("~@idaho-th/client", () => ({
  HousingApplications: () => <div>Staff applications</div>,
  LoginPage: () => <div>Login page</div>,
  ProviderApplications: () => <div>Provider applications</div>,
  Spinner: () => <div>Loading</div>,
}));

vi.mock("~@idaho-th/client/trpc", () => ({
  trpc: {
    auth: {
      getSession: {
        useQuery: () => testDoubles.sessionResult,
      },
    },
  },
}));

vi.mock("./datastores/StoreProvider", () => ({
  StoreProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useRootStore: () => ({
    userStore: testDoubles.userStore,
  }),
  useUserStore: () => testDoubles.userStore,
}));

vi.mock("./hooks/useAuth", () => ({
  default: () => undefined,
}));

describe("App", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
    testDoubles.sessionResult = {
      data: {
        providerPseudonymizedId: undefined,
        role: "provider",
      },
      isLoading: false,
    };
    testDoubles.userStore = {
      isAuthorized: true,
      user: {},
      userIsLoading: false,
    };
  });

  test("blocks provider users without a provider ID", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      render(<App />);

      expect(
        screen.getByText(
          "Something went wrong. Please refresh the page and try again.",
        ),
      ).toBeTruthy();
      expect(screen.queryByText("Provider applications")).toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });
});
