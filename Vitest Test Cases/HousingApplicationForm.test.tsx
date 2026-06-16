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
import userEvent from "@testing-library/user-event";

import { HousingApplicationForm } from "../HousingApplicationForm";

const testDoubles = vi.hoisted(() => ({
  createdApplication: {
    id: "application-123",
  },
  formValues: {
    clientFullName: "John Doe",
    faithBasedPreferred: true,
    gender: "Male",
    idocNumber: "12345",
    legalCurrentStatus: "Rider",
    legalSexOffenderRegistry: false,
    preferredDistrict: ["D1"],
    preferredProviders: ["Provider One"],
    tpdHousingNeededDate: "2026-07-01",
    violenceHistoryDors: false,
  },
  isPending: false,
  saveApplication: vi.fn(),
  setCurrentApplication: vi.fn(),
  setCurrentFormValues: vi.fn(),
  validate: vi.fn(),
}));

vi.mock("../../assets/x.svg?react", () => ({
  default: () => <svg />,
}));

vi.mock("../FormContext/FormContext", () => ({
  useFormContext: () => ({
    canProceed: () => true,
    form: {
      state: {
        values: testDoubles.formValues,
      },
      validate: testDoubles.validate,
    },
    step: 4,
  }),
}));

vi.mock("../pages", () => ({
  Page1: () => null,
  Page2: () => null,
  Page3: () => null,
  Page4: () => null,
}));

vi.mock("../../../datastores/IdahoTHStoreContext", () => ({
  useHousingApplicationsStore: () => ({
    currentApplicationId: undefined,
    setCurrentApplication: testDoubles.setCurrentApplication,
    setCurrentFormValues: testDoubles.setCurrentFormValues,
  }),
}));

vi.mock("../../../hooks/housingApplication", () => ({
  useSaveHousingApplication: () => ({
    isPending: testDoubles.isPending,
    mutate: testDoubles.saveApplication,
  }),
}));

describe("HousingApplicationForm", () => {
  beforeEach(() => {
    testDoubles.isPending = false;
    testDoubles.saveApplication.mockReset();
    testDoubles.setCurrentApplication.mockReset();
    testDoubles.setCurrentFormValues.mockReset();
    testDoubles.validate.mockReset();
  });

  test("creates a new housing application when Finish is clicked", async () => {
    const user = userEvent.setup();

    render(<HousingApplicationForm />);

    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(testDoubles.setCurrentFormValues).toHaveBeenCalledWith(
      testDoubles.formValues,
    );
    expect(testDoubles.saveApplication).toHaveBeenCalledWith(
      {
        eligibilityParams: {
          faithBasedPreferred: true,
          gender: "Male",
          hasViolenceHistory: false,
          isRider: true,
          isSexOffender: false,
          preferredDistricts: ["D1"],
          preferredProviders: ["Provider One"],
        },
        formData: testDoubles.formValues,
      },
      { onSuccess: expect.any(Function) },
    );
  });

  test("opens review only after the housing application save succeeds", async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();

    render(<HousingApplicationForm onReview={onReview} />);

    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(onReview).not.toHaveBeenCalled();

    const [, mutationOptions] = testDoubles.saveApplication.mock.calls[0] as [
      unknown,
      { onSuccess: (application: unknown) => void },
    ];

    mutationOptions.onSuccess(testDoubles.createdApplication);

    expect(testDoubles.setCurrentApplication).toHaveBeenCalledWith(
      testDoubles.createdApplication,
    );
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  test("shows Saving and disables Finish while the application is saving", async () => {
    const user = userEvent.setup();
    testDoubles.isPending = true;

    render(<HousingApplicationForm />);

    const finishButton = screen.getByRole("button", { name: "Saving…" });

    expect(finishButton).toBeDisabled();

    await user.click(finishButton);

    expect(testDoubles.saveApplication).not.toHaveBeenCalled();
  });
});
