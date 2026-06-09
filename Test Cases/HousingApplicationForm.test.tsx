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
  formValues: {
    clientFullName: "John Doe",
    idocNumber: "12345",
    tpdHousingNeededDate: "2026-07-01",
  },
  saveApplication: vi.fn(),
  setCurrentFormValues: vi.fn(),
  updateApplication: vi.fn(),
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
    setCurrentFormValues: testDoubles.setCurrentFormValues,
  }),
}));

vi.mock("../../../hooks/housingApplication", () => ({
  useSaveHousingApplication: () => ({
    mutate: testDoubles.saveApplication,
  }),
  useUpdateHousingApplication: () => ({
    mutate: testDoubles.updateApplication,
  }),
}));

describe("HousingApplicationForm", () => {
  test("creates a new housing application when Finish is clicked", async () => {
    const user = userEvent.setup();

    render(<HousingApplicationForm />);

    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(testDoubles.setCurrentFormValues).toHaveBeenCalledWith(
      testDoubles.formValues,
    );
    expect(testDoubles.saveApplication).toHaveBeenCalledWith(
      { formData: testDoubles.formValues },
      { onSuccess: expect.any(Function) },
    );
    expect(testDoubles.updateApplication).not.toHaveBeenCalled();
  });
});
