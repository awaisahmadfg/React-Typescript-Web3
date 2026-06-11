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
import type { ReactNode } from "react";

import { ProviderPreviewModal } from "../ProviderPreviewModal";
import { StaffPreviewModal } from "../StaffPreviewModal";

const testDoubles = vi.hoisted(() => ({
  currentApplication: undefined as
    | {
        eligibleProviders: Array<{
          provider: {
            email: string | null;
            id: string;
            name: string;
          };
          providerLocation: {
            acceptedGenders: string[];
            acceptsRiders: boolean;
            acceptsSexOffenders: boolean;
            acceptsViolentCriminals: boolean;
            district: string;
            faithBased: boolean;
            id: string;
          };
        }>;
        sentToProvidersAt?: Date | null;
      }
    | undefined,
  currentFormValues: {
    clientFullName: "John Doe",
    cmPoEmail: "shwebb@idoc.idaho.gov",
    cmPoName: "S. Webb",
    cmPoPhone: "208-604-6619",
    currentFacilityLocation: "ISCC",
    dob: "10/23/1959",
    faithBasedPreferred: true,
    gender: "Male",
    idocNumber: "810412",
    legalCurrentStatus: "Rider",
    legalSexOffenderRegistry: false,
    preferredDistrict: ["District 1"],
    preferredProviders: ["Provider A"],
    tpdHousingNeededDate: "07/01/2026",
    violenceHistoryDors: false,
  },
  sendApplicationToProviders: vi.fn(),
  setCurrentApplication: vi.fn(),
  useProvidersWithEligibility: vi.fn(),
}));

vi.mock("../../../hooks/useIsMobile", () => ({
  breakpoints: {
    mobile: 480,
    tablet: 768,
  },
  default: () => ({ isTablet: false }),
}));

vi.mock("../../../datastores/IdahoTHStoreContext", () => ({
  useHousingApplicationsStore: () => ({
    currentApplication: testDoubles.currentApplication,
    currentApplicationId: "application-1",
    currentFormValues: testDoubles.currentFormValues,
    setCurrentApplication: testDoubles.setCurrentApplication,
  }),
}));

vi.mock("../../../hooks/housingApplication", () => ({
  useProvidersWithEligibility: testDoubles.useProvidersWithEligibility,
  useSendApplicationToProviders: () => ({
    isPending: false,
    mutate: testDoubles.sendApplicationToProviders,
  }),
  useUpdateHousingApplication: () => ({
    mutate: vi.fn(),
  }),
}));

vi.mock("../../Modal/Modal", () => ({
  Modal: ({ children, isOpen }: { children: ReactNode; isOpen: boolean }) =>
    isOpen ? <div>{children}</div> : null,
}));

vi.mock("../StaffPreviewModal/StaffApplicationDetailsView/StaffApplicationDetailsView", () => ({
  StaffApplicationDetailsView: () => <div>Application details content</div>,
}));

vi.mock("../StaffPreviewModal/EligibleProvidersView/ProviderCard/ProviderCard", () => ({
  ProviderCard: ({
    provider,
  }: {
    provider: {
      isPreferred?: boolean;
      name: string;
    };
  }) => (
    <div data-is-preferred={provider.isPreferred} data-testid="provider-card">
      {provider.name}
    </div>
  ),
}));

vi.mock("react-pdf", () => ({
  Document: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Page: () => <div />,
  pdfjs: {
    GlobalWorkerOptions: {},
  },
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "",
}));

vi.mock("react-use-clipboard", () => ({
  default: () => [false, vi.fn()],
}));

vi.mock("../../assets/arrow-down.svg?react", () => ({
  default: () => <svg />,
}));
vi.mock("../../assets/calendar.svg?react", () => ({
  default: () => <svg />,
}));
vi.mock("../../assets/document.svg?react", () => ({
  default: () => <svg />,
}));
vi.mock("../../assets/home.svg?react", () => ({
  default: () => <svg />,
}));
vi.mock("../../assets/search-icon.svg?react", () => ({
  default: () => <svg />,
}));
vi.mock("../../assets/tabler-icon-bed.svg?react", () => ({
  default: () => <svg />,
}));
vi.mock("../../assets/tabler-icon-corner-down-right.svg?react", () => ({
  default: () => <svg />,
}));
vi.mock("../../assets/tabler-icon-notes.svg?react", () => ({
  default: () => <svg />,
}));
vi.mock("../../assets/timeline.svg?react", () => ({
  default: () => <svg />,
}));
vi.mock("../../assets/x.svg?react", () => ({
  default: () => <svg />,
}));

describe("PreviewModal", () => {
  beforeEach(() => {
    testDoubles.currentApplication = {
      eligibleProviders: [],
      sentToProvidersAt: null,
    };
    testDoubles.sendApplicationToProviders.mockReset();
    testDoubles.setCurrentApplication.mockReset();
    testDoubles.useProvidersWithEligibility.mockReturnValue({
      data: { providers: [] },
      isError: false,
      isLoading: false,
    });
  });

  test("loads eligible providers with current form values when the Eligible providers tab is clicked", async () => {
    const user = userEvent.setup();

    render(<StaffPreviewModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText("Application details content")).toBeInTheDocument();
    expect(testDoubles.useProvidersWithEligibility).not.toHaveBeenCalled();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Providers" }));
    });

    expect(testDoubles.useProvidersWithEligibility).toHaveBeenCalledWith({
      faithBasedPreferred: true,
      gender: "Male",
      hasViolenceHistory: false,
      isRider: true,
      isSexOffender: false,
      preferredDistricts: ["District 1"],
      preferredProviders: ["Provider A"],
    });
    expect(
      screen.getByText("No eligible providers found."),
    ).toBeInTheDocument();
  });

  test("disables send button when there are no eligible providers", async () => {
    const user = userEvent.setup();

    render(<StaffPreviewModal isOpen onClose={vi.fn()} />);

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Providers" }));
    });

    expect(
      screen.getByRole("button", {
        name: "Send Application to all providers",
      }),
    ).toBeDisabled();
    expect(testDoubles.sendApplicationToProviders).not.toHaveBeenCalled();
  });

  test("shows preferred providers before other eligible providers and sends the application", async () => {
    const user = userEvent.setup();
    const currentApplication = {
      eligibleProviders: [
        {
          provider: {
            email: "other-provider@example.com",
            id: "other-provider",
            name: "Other Provider",
          },
          providerLocation: {
            acceptedGenders: ["MALE"],
            acceptsRiders: true,
            acceptsSexOffenders: false,
            acceptsViolentCriminals: false,
            district: "District 1",
            faithBased: true,
            id: "other-location",
          },
        },
        {
          provider: {
            email: "provider-a@example.com",
            id: "provider-a",
            name: "Provider A",
          },
          providerLocation: {
            acceptedGenders: ["MALE"],
            acceptsRiders: true,
            acceptsSexOffenders: false,
            acceptsViolentCriminals: false,
            district: "District 1",
            faithBased: true,
            id: "provider-a-location",
          },
        },
      ],
      sentToProvidersAt: null,
    };
    testDoubles.currentApplication = currentApplication;
    testDoubles.sendApplicationToProviders.mockImplementation(
      (_input, options) => {
        options?.onSuccess?.();
      },
    );

    render(<StaffPreviewModal isOpen onClose={vi.fn()} />);

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Providers" }));
    });

    expect(screen.getAllByTestId("provider-card").map((el) => el.textContent))
      .toEqual(["Provider A", "Other Provider"]);
    expect(screen.getByText("Provider A")).toHaveAttribute(
      "data-is-preferred",
      "true",
    );

    await act(async () => {
      await user.click(
        screen.getByRole("button", {
          name: "Send Application to all providers",
        }),
      );
    });

    expect(testDoubles.sendApplicationToProviders).toHaveBeenCalledWith(
      {
        applicationId: "application-1",
        providerIds: ["provider-a", "other-provider"],
      },
      { onError: expect.any(Function), onSuccess: expect.any(Function) },
    );
    expect(testDoubles.setCurrentApplication).toHaveBeenCalledWith({
      ...currentApplication,
      sentToProvidersAt: expect.any(Date),
    });
  });

  test("shows Application sent when application was already sent to providers", async () => {
    const user = userEvent.setup();
    testDoubles.currentApplication = {
      eligibleProviders: [
        {
          provider: {
            email: "provider-a@example.com",
            id: "provider-a",
            name: "Provider A",
          },
          providerLocation: {
            acceptedGenders: ["MALE"],
            acceptsRiders: true,
            acceptsSexOffenders: false,
            acceptsViolentCriminals: false,
            district: "District 1",
            faithBased: true,
            id: "provider-a-location",
          },
        },
      ],
      sentToProvidersAt: new Date("2026-06-11T00:00:00.000Z"),
    };

    render(<StaffPreviewModal isOpen onClose={vi.fn()} />);

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Providers" }));
    });

    expect(screen.getByText("Provider A")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Application sent" }),
    ).toBeDisabled();
    expect(testDoubles.sendApplicationToProviders).not.toHaveBeenCalled();
  });

  test("shows application details when provider opens a sent application", async () => {
    const user = userEvent.setup();

    render(<ProviderPreviewModal isOpen onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Application Details" }))
      .toBeInTheDocument();
    expect(screen.getByText("Application details")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Conditionally Approve" }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Request Info" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Decline" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Submit response" }),
    ).toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Expand all" }));
    });

    expect(screen.getByText("CM/PO Name")).toBeInTheDocument();
    expect(screen.getByText("S. Webb")).toBeInTheDocument();
    expect(screen.getByText("Full Name")).toBeInTheDocument();
    expect(screen.getAllByText("John Doe")).toHaveLength(2);
    expect(screen.getByText("IDOC#")).toBeInTheDocument();
    expect(screen.getByText("810412")).toBeInTheDocument();
  });
});
