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

import { PreviewModal } from "../PreviewModal";

const testDoubles = vi.hoisted(() => ({
  currentFormValues: {
    clientFullName: "John Doe",
    faithBasedPreferred: true,
    gender: "Male",
    legalCurrentStatus: "Rider",
    legalSexOffenderRegistry: false,
    preferredDistrict: ["District 1"],
    preferredProviders: ["Provider A"],
    tpdHousingNeededDate: "07/01/2026",
    violenceHistoryDors: false,
  },
  useEligibleProviders: vi.fn(),
}));

vi.mock("../../../hooks/useIsMobile", () => ({
  default: () => ({ isTablet: false }),
}));

vi.mock("../../../datastores/IdahoTHStoreContext", () => ({
  useHousingApplicationsStore: () => ({
    currentFormValues: testDoubles.currentFormValues,
  }),
}));

vi.mock("../../../hooks/housingApplication", () => ({
  useEligibleProviders: testDoubles.useEligibleProviders,
}));

vi.mock("../../Modal/Modal", () => ({
  Modal: ({ children, isOpen }: { children: ReactNode; isOpen: boolean }) =>
    isOpen ? <div>{children}</div> : null,
}));

vi.mock("../ApplicationDetailsView/ApplicationDetailsView", () => ({
  ApplicationDetailsView: () => <div>Application details content</div>,
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
    testDoubles.useEligibleProviders.mockReturnValue({
      data: { providers: [] },
      isError: false,
      isLoading: false,
    });
  });

  test("loads eligible providers with current form values when the Eligible providers tab is clicked", async () => {
    const user = userEvent.setup();

    render(<PreviewModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText("Application details content")).toBeInTheDocument();
    expect(testDoubles.useEligibleProviders).not.toHaveBeenCalled();

    await act(async () => {
      await user.click(
        screen.getByRole("button", { name: "Eligible providers" }),
      );
    });

    expect(testDoubles.useEligibleProviders).toHaveBeenCalledWith(
      testDoubles.currentFormValues,
    );
    expect(
      screen.getByText("No eligible providers found."),
    ).toBeInTheDocument();
  });
});
