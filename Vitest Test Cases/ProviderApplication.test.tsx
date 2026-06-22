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

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProviderApplications } from "../ProviderApplications";

const testDoubles = vi.hoisted(() => ({
  clearCurrentApplication: vi.fn(),
  setCurrentApplication: vi.fn(),
}));

vi.mock("../../assets/users.svg?react", () => ({
  default: () => <svg />,
}));

vi.mock("../../HousingApplications/AppHeader/AppHeader", () => ({
  AppHeader: () => null,
}));

vi.mock("../../HousingApplications/ApplicationsTable/ApplicationsTable", () => ({
  ApplicationsTable: ({
    applications,
    onClick,
    pagination,
  }: {
    applications: Array<{
      clientName: string;
      formData: { idocNumber?: string };
      id: string;
      status: string;
    }>;
    onClick?: (application: {
      clientName: string;
      formData: { idocNumber?: string };
      id: string;
      status: string;
    }) => void;
    pagination: { totalCount: number };
  }) => (
    <div>
      <div>Clients: {pagination.totalCount}</div>
      {applications.map((application) => (
        <div key={application.clientName}>
          <button type="button" onClick={() => onClick?.(application)}>
            {application.clientName}
          </button>
          <div>
            {application.status === "ACTION_NEEDED"
              ? "Action Needed"
              : application.status}
          </div>
          <div>{application.formData.idocNumber}</div>
        </div>
      ))}
    </div>
  ),
}));

vi.mock("../../PreviewModal", () => ({
  ProviderPreviewModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="provider-preview-modal" /> : null,
}));

vi.mock("../../../datastores/IdahoTHStoreContext", () => ({
  useHousingApplicationsStore: () => ({
    clearCurrentApplication: testDoubles.clearCurrentApplication,
    setCurrentApplication: testDoubles.setCurrentApplication,
  }),
}));

vi.mock("../../../hooks/housingApplication", () => ({
  useCurrentProvider: () => ({
    data: { id: "provider-1", name: "208 Property Management (TVH)" },
    isLoading: false,
  }),
  useProviderHousingApplications: () => ({
    data: {
      items: [
        {
          clientName: "James H. Crumble",
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
          expectedReleaseDate: new Date("2026-06-18T00:00:00.000Z"),
          formData: {
            idocNumber: "810412",
          },
          id: "application-1",
          idocNumber: "810412",
          providerApplicationId: "provider-application-1",
          sentToProvidersAt: new Date("2026-06-10T00:00:00.000Z"),
          stage: "APPLICATION",
          status: "ACTION_NEEDED",
          subStage: "PROVIDER_REVIEW",
        },
      ],
      nextCursor: null,
      total: 1,
    },
    isFetching: false,
    isLoading: false,
  }),
}));

vi.mock("../../../hooks/useDelayedTrue", () => ({
  useDelay: (value: boolean) => value,
}));

describe("ProviderApplications", () => {
  beforeEach(() => {
    testDoubles.clearCurrentApplication.mockReset();
    testDoubles.setCurrentApplication.mockReset();
  });

  test("shows applications sent to the logged-in provider", () => {
    render(<ProviderApplications />);

    expect(
      screen.getByText("208 Property Management (TVH)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Provider Portal")).toBeInTheDocument();
    expect(screen.getByText("Clients: 1")).toBeInTheDocument();
    expect(screen.getByText("James H. Crumble")).toBeInTheDocument();
    expect(screen.getByText("Action Needed")).toBeInTheDocument();
    expect(screen.getByText("810412")).toBeInTheDocument();
  });

  test("opens the provider preview modal when clicking an application row", async () => {
    const user = userEvent.setup();

    render(<ProviderApplications />);

    expect(
      screen.queryByTestId("provider-preview-modal"),
    ).not.toBeInTheDocument();

    await act(async () => {
      await user.click(
        screen.getByRole("button", { name: "James H. Crumble" }),
      );
    });

    expect(testDoubles.setCurrentApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        clientName: "James H. Crumble",
        id: "application-1",
      }),
    );
    expect(screen.getByTestId("provider-preview-modal")).toBeInTheDocument();
  });
});
