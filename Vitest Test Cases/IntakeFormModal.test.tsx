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

import { DEFAULT_FORM_VALUES } from "../../HousingApplicationForm/hooks/useHousingApplicationForm/utils";
import type { HousingApplicationForm } from "../../HousingApplicationForm/types";
import { IntakeFormModal } from "../IntakeFormModal";

const testDoubles = vi.hoisted(() => ({
  saveApplication: vi.fn(),
  setCurrentFormValues: vi.fn(),
  updateApplication: vi.fn(),
}));

const providers = [
  { name: "Provider One" },
  { name: "Provider Two" },
  { name: "Provider Three" },
];

vi.mock("~design-system", () => ({
  Icon: () => <svg />,
}));

vi.mock("react-datepicker", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    default: ({
      customInput,
      onChangeRaw,
      placeholderText,
      value,
    }: {
      customInput?: React.ReactNode;
      onChangeRaw?: (event: React.KeyboardEvent<HTMLElement>) => void;
      placeholderText?: string;
      value?: string;
    }) => {
      const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        onChangeRaw?.(event as unknown as React.KeyboardEvent<HTMLElement>);
      };

      if (React.isValidElement(customInput)) {
        return React.cloneElement(
          customInput as React.ReactElement<Record<string, unknown>>,
          {
            onChange: handleChange,
            placeholder: placeholderText,
            value: value ?? "",
          },
        );
      }

      return (
        <input
          onChange={handleChange}
          placeholder={placeholderText}
          value={value ?? ""}
        />
      );
    },
  };
});

vi.mock("../../../hooks/useIsMobile", () => ({
  default: () => ({ isTablet: false }),
}));

vi.mock("../../../datastores/IdahoTHStoreContext", () => ({
  useHousingApplicationsStore: () => ({
    currentApplicationId: undefined,
    setCurrentFormValues: testDoubles.setCurrentFormValues,
  }),
}));

vi.mock("../../../hooks/housingApplication", () => ({
  useHousingProviders: () => ({
    isPending: false,
    providers,
  }),
  useSaveHousingApplication: () => ({
    mutate: testDoubles.saveApplication,
  }),
  useUpdateHousingApplication: () => ({
    mutate: testDoubles.updateApplication,
  }),
}));

vi.mock("../../Modal/Modal", () => ({
  Modal: ({
    children,
    hideModal,
    isOpen,
  }: {
    children: ReactNode;
    hideModal: () => void;
    isOpen: boolean;
  }) =>
    isOpen ? (
      <div>
        <button type="button" onClick={hideModal}>
          Close modal
        </button>
        {children}
      </div>
    ) : null,
}));

vi.mock("../../HousingApplications/PdfViewer", () => ({
  PdfViewer: ({
    pageNumber,
    signedUrl,
  }: {
    pageNumber?: number;
    signedUrl: string | null;
  }) => (
    <div
      data-page-number={pageNumber}
      data-signed-url={signedUrl}
      data-testid="pdf-viewer"
    />
  ),
}));

vi.mock("../../assets/x.svg?react", () => ({
  default: () => <svg />,
}));

vi.mock("../../assets/tabler-icon-alert-triangle.svg?react", () => ({
  default: () => <svg />,
}));

vi.mock("../../assets/tabler-icon-check.svg?react", () => ({
  default: () => <svg />,
}));

vi.mock("../../assets/tabler-icon-information-circle.svg?react", () => ({
  default: () => <svg />,
}));

describe("IntakeFormModal", () => {
  beforeEach(() => {
    testDoubles.saveApplication.mockReset();
    testDoubles.setCurrentFormValues.mockReset();
    testDoubles.updateApplication.mockReset();
  });

  const getTextboxValues = (label: string) =>
    screen
      .getAllByRole("textbox", { name: label })
      .map((input) => (input as HTMLInputElement).value);

  const expectTextboxValue = (label: string, value: string) => {
    expect(screen.getByRole("textbox", { name: label })).toHaveValue(value);
  };

  const expectDisplayedValue = (value: string) => {
    expect(screen.getByDisplayValue(value)).toBeInTheDocument();
  };

  const expectComboboxValue = (label: string, value: string) => {
    expect(screen.getByRole("combobox", { name: label })).toHaveValue(value);
  };

  const expectSelectDisplayValue = (label: string, value: string) => {
    expect(screen.getByRole("combobox", { name: label })).toHaveDisplayValue(
      value,
    );
  };

  const flushFormUpdates = async () => {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  };

  const clickNextPage = async (user: ReturnType<typeof userEvent.setup>) => {
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Next page" }));
    });
    await flushFormUpdates();
  };

  const renderIntakeFormModal = async (
    defaultValues?: HousingApplicationForm,
  ) => {
    await act(async () => {
      render(
        <IntakeFormModal
          isOpen
          onClose={vi.fn()}
          pdf="https://example.com/prepared-application.pdf"
          defaultValues={defaultValues}
        />,
      );
    });
    await flushFormUpdates();
  };

  const page1ValidValues: HousingApplicationForm = {
    ...DEFAULT_FORM_VALUES,
    clientFullName: "John Doe",
    dob: "06/15/1991",
    idocNumber: "123456",
    tpdHousingNeededDate: "07/01/2026",
  };

  test("disables Next page when Page 1 required fields are missing", async () => {
    await renderIntakeFormModal();

    expect(screen.getByText("Page 1 of 4")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute(
      "data-page-number",
      "1",
    );
    expect(
      await screen.findByRole("textbox", { name: "Full Name" }),
    ).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "IDOC#" })).toHaveValue("");
    expect(screen.getByLabelText("DOB")).toHaveValue("");
    expect(screen.getByLabelText("Expected Release Date")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  test("opens Page 2 when Page 1 required fields are valid", async () => {
    const user = userEvent.setup();
    await renderIntakeFormModal(page1ValidValues);

    expect(screen.getByText("Page 1 of 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();

    await clickNextPage(user);

    expect(screen.getByText("Page 2 of 4")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute(
      "data-page-number",
      "2",
    );
    expect(
      screen.getByRole("combobox", { name: "Preferred District" }),
    ).toBeInTheDocument();
  });

  test("resets the form when the modal is closed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    await act(async () => {
      render(
        <IntakeFormModal
          isOpen
          onClose={onClose}
          pdf="https://example.com/prepared-application.pdf"
        />,
      );
    });
    await flushFormUpdates();

    await act(async () => {
      await user.type(
        screen.getByRole("textbox", { name: "Full Name" }),
        "Jane Doe",
      );
      await user.type(
        screen.getByRole("textbox", { name: "IDOC#" }),
        "123456",
      );
      await user.type(screen.getByLabelText("DOB"), "06/15/1991");
      await user.type(
        screen.getByLabelText("Expected Release Date"),
        "07/01/2026",
      );
    });
    await flushFormUpdates();

    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();

    await clickNextPage(user);

    expect(screen.getByText("Page 2 of 4")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute(
      "data-page-number",
      "2",
    );

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Close modal" }));
    });
    await flushFormUpdates();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Page 1 of 4")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute(
      "data-page-number",
      "1",
    );
    expect(
      screen.getByRole("textbox", { name: "Full Name" }),
    ).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "IDOC#" })).toHaveValue("");
    expect(screen.getByLabelText("DOB")).toHaveValue("");
    expect(screen.getByLabelText("Expected Release Date")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  test("returns to Page 1 when Back is clicked from Page 2", async () => {
    const user = userEvent.setup();
    await renderIntakeFormModal(page1ValidValues);

    await clickNextPage(user);

    expect(screen.getByText("Page 2 of 4")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute(
      "data-page-number",
      "2",
    );

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Back" }));
    });
    await flushFormUpdates();

    expect(screen.getByText("Page 1 of 4")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute(
      "data-page-number",
      "1",
    );
    expect(
      screen.getByRole("textbox", { name: "Full Name" }),
    ).toBeInTheDocument();
  });

  test("opens Page 3 after Page 2 required fields are filled", async () => {
    const user = userEvent.setup();
    await renderIntakeFormModal(page1ValidValues);

    await clickNextPage(user);

    expect(screen.getByText("Page 2 of 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    await act(async () => {
      await user.selectOptions(
        screen.getByRole("combobox", { name: "Preferred District" }),
        "D1",
      );
      await user.selectOptions(
        screen.getByRole("combobox", { name: "Signature Provided" }),
        "true",
      );
      await user.type(screen.getByLabelText("Signature Date"), "06/01/2026");
    });
    await flushFormUpdates();

    expectSelectDisplayValue("Preferred District", "D1");
    expectSelectDisplayValue("Signature Provided", "Yes");
    expect(screen.getByLabelText("Signature Date")).toHaveValue("06/01/2026");
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();

    await clickNextPage(user);

    expect(screen.getByText("Page 3 of 4")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute(
      "data-page-number",
      "3",
    );
    expect(
      screen.getByRole("combobox", { name: "Accommodations" }),
    ).toBeInTheDocument();
  });

  test("opens Page 4 when Next page is clicked from Page 3", async () => {
    const user = userEvent.setup();
    await renderIntakeFormModal(page1ValidValues);

    await clickNextPage(user);

    await act(async () => {
      await user.selectOptions(
        screen.getByRole("combobox", { name: "Preferred District" }),
        "D1",
      );
      await user.selectOptions(
        screen.getByRole("combobox", { name: "Signature Provided" }),
        "true",
      );
      await user.type(screen.getByLabelText("Signature Date"), "06/01/2026");
    });
    await flushFormUpdates();

    await clickNextPage(user);

    expect(screen.getByText("Page 3 of 4")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute(
      "data-page-number",
      "3",
    );

    await clickNextPage(user);

    expect(screen.getByText("Page 4 of 4")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute(
      "data-page-number",
      "4",
    );
    expect(
      screen.getByRole("combobox", { name: "Accommodations" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Other Medical Accommodations" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Additional Medical Info" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "SSI 90-Day Care Plan" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Faith-Based Provider Info" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Finish" }),
    ).toBeInTheDocument();
  });

  test("opens with extracted default values prefilled across all pages", async () => {
    const user = userEvent.setup();
    const extractedValues: HousingApplicationForm = {
      ...DEFAULT_FORM_VALUES,
      age: 35,
      accommodations: ["Wheelchair", "Oxygen"],
      accommodationsInfo: "Needs first floor access.",
      addictions: false,
      additionalMedicalInfo: "Needs medication refrigeration.",
      benefitsDuration: "12 months",
      benefitsReinstatementDate: "07/15/2026",
      child1Info: "Child One, female, 8",
      child2Info: "Child Two, male, 6",
      child3Info: "Child Three, male, 4",
      childFamilyServicesDocumentation: [
        "Order of Guardianship",
        "Custody Agreement",
      ],
      childVisitationInfo: "Saturday visitation approved.",
      childVisitationRequired: true,
      clientFullName: "John Doe",
      cmPoEmail: "po@example.com",
      cmPoName: "Officer Smith",
      cmPoPhone: "2085550111",
      contagiousDisease: false,
      currentFacilityLocation: "Boise Facility",
      dob: "06/15/1991",
      emergencyContactName: "Jane Doe",
      emergencyContactPhone: "2085550199",
      emergencyContactRelationship: "Sister",
      employer: "Acme Warehouse",
      employerContact: "2085550177",
      employmentOnRelease: true,
      faithBasedPreferred: true,
      faithBasedProviderInfo: "Open to faith-based providers.",
      gender: "Male",
      housingProbationParoleAtRelease: true,
      idocNumber: "123456",
      idsOnFile: ["Driver's License", "Social Security Card"],
      lastUseDate: "04/01/2026",
      legalBackupForIcOrIce: false,
      legalCountyOfCrime: "Ada",
      legalCurrentStatus: "Rider",
      legalMostRecentConviction: "Burglary",
      legalSexOffenderRegistry: false,
      medicalAccommodations: [
        "Prescription Medication",
        "MOUD/MAT Program",
      ],
      medicalMhSupportNeeded: true,
      militaryService: false,
      otherAccommodations: "Ground floor unit",
      otherMedicalAccommodation: "Daily insulin storage",
      parentGuardianNames: "Jane Doe",
      paroleHearingCompleted: true,
      personalPhoneNumber: "2085551234",
      prescribedMedications: "Metformin",
      preferredDistrict: ["D1", "D3"],
      preferredProviders: ["Provider One", "Provider Two", "Provider Three"],
      previousHomeCity: "Nampa",
      previousHomeName: "Hope House",
      previousTransitionalHome: true,
      priorInvoluntaryDischarge: false,
      signatureDate: "06/01/2026",
      signatureProvided: true,
      ssi90DayCarePlan: "Care plan already requested.",
      ssiSsdiSsrbMedicareMedicaid: true,
      ssnLast4: "6789",
      substances: "Alcohol",
      tpdHousingNeededDate: "07/01/2026",
      underInfluenceAtCrime: false,
      vaEnrolled: false,
      vehicleOnSite: true,
      violenceDischargeDescription: "No discharge concerns.",
      violenceHistoryDors: false,
    };

    await act(async () => {
      render(
        <IntakeFormModal
          isOpen
          onClose={vi.fn()}
          pdf="https://example.com/prepared-application.pdf"
          defaultValues={extractedValues}
        />,
      );
    });
    await flushFormUpdates();

    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute(
      "data-signed-url",
      "https://example.com/prepared-application.pdf",
    );
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute(
      "data-page-number",
      "1",
    );
    expect(
      await screen.findByRole("textbox", { name: "Full Name" }),
    ).toHaveValue("John Doe");
    expectTextboxValue("IDOC#", "123456");
    expectComboboxValue("Gender", "Male");
    expectDisplayedValue("07/01/2026");
    expectDisplayedValue("06/15/1991");
    expectTextboxValue("Age", "35");
    expectTextboxValue("Facility", "Boise Facility");
    expectTextboxValue("SSN (last 4)", "6789");
    expectTextboxValue("CM/PO Contact Email", "po@example.com");
    expectTextboxValue("CM/PO Phone Number", "208-555-0111");
    expectTextboxValue("Name", "Jane Doe");
    expectTextboxValue("Relationship", "Sister");
    expect(getTextboxValues("Phone Number")).toEqual([
      "208-555-1234",
      "208-555-0199",
    ]);
    expectComboboxValue("Current Status", "Rider");
    expectTextboxValue("Most Recent Conviction", "Burglary");
    expectComboboxValue("County of Crime", "Ada");
    expectSelectDisplayValue("Sex Offender Registry", "No");
    expectSelectDisplayValue("Backup for IC or ICE", "No");
    expectSelectDisplayValue("Child Visitation Required", "Yes");
    expectSelectDisplayValue("Prior Involuntary Discharge", "No");
    expectSelectDisplayValue("Violence History / DORs", "No");
    expectSelectDisplayValue("Parole Hearing Completed", "Yes");
    expectSelectDisplayValue("Probation/Parole at Release", "Yes");
    expectSelectDisplayValue("Vehicle on Site", "Yes");
    expectSelectDisplayValue(
      "IDs on File",
      "Driver's License, Social Security Card",
    );
    expectSelectDisplayValue("Military Service", "No");
    expectSelectDisplayValue("VA Enrolled", "No");
    expectSelectDisplayValue("Employment on Release", "Yes");

    await clickNextPage(user);

    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute(
      "data-page-number",
      "2",
    );
    expectSelectDisplayValue("Preferred District", "D1, D3");
    expectSelectDisplayValue("Faith-Based Preferred", "Yes");
    expectComboboxValue("Preferred Provider 1", "Provider One");
    expectComboboxValue("Preferred Provider 2", "Provider Two");
    expectComboboxValue("Preferred Provider 3", "Provider Three");
    expectTextboxValue("Employer", "Acme Warehouse");
    expectTextboxValue("Employer Contact", "208-555-0177");
    expectSelectDisplayValue("Medical/MH Support Needed", "Yes");
    expectSelectDisplayValue("Contagious Disease", "No");
    expectSelectDisplayValue("SSI/SSDI/SSRB/Medicare/Medicaid", "Yes");
    expectDisplayedValue("07/15/2026");
    expectTextboxValue("Benefits Duration", "12 months");
    expectTextboxValue("Prescribed Medications", "Metformin");
    expectSelectDisplayValue("Under Influence at Crime", "No");
    expectSelectDisplayValue("Addictions", "No");
    expectTextboxValue("Substances", "Alcohol");
    expectDisplayedValue("04/01/2026");
    expectSelectDisplayValue("Previous Transitional Home", "Yes");
    expectTextboxValue("Previous Home Name", "Hope House");
    expectTextboxValue("Previous Home City", "Nampa");
    expectTextboxValue("CM/PO Name", "Officer Smith");
    expectSelectDisplayValue("Signature Provided", "Yes");
    expectDisplayedValue("06/01/2026");

    await clickNextPage(user);

    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute(
      "data-page-number",
      "3",
    );
    expectComboboxValue("Accommodations", "Wheelchair, Oxygen");
    expectTextboxValue("Other Assistance", "Ground floor unit");
    expectTextboxValue(
      "Additional Accommodations Info",
      "Needs first floor access.",
    );
    expectSelectDisplayValue(
      "Documentation",
      "Order of Guardianship, Custody Agreement",
    );
    expectTextboxValue("Parent/Guardian name(s)", "Jane Doe");
    expectTextboxValue(
      "Child 1 (name, gender, age, special info)",
      "Child One, female, 8",
    );
    expectTextboxValue(
      "Child 2 (name, gender, age, special info)",
      "Child Two, male, 6",
    );
    expectTextboxValue(
      "Child 3 (name, gender, age, special info)",
      "Child Three, male, 4",
    );
    expectTextboxValue("Additional Info", "Saturday visitation approved.");
    expectTextboxValue(
      "Violence/Discharge Description",
      "No discharge concerns.",
    );

    await clickNextPage(user);

    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute(
      "data-page-number",
      "4",
    );
    expectComboboxValue(
      "Accommodations",
      "Prescription Medication, MOUD/MAT Program",
    );
    expectTextboxValue("Other Medical Accommodations", "Daily insulin storage");
    expectTextboxValue(
      "Additional Medical Info",
      "Needs medication refrigeration.",
    );
    expectTextboxValue("SSI 90-Day Care Plan", "Care plan already requested.");
    expectTextboxValue(
      "Faith-Based Provider Info",
      "Open to faith-based providers.",
    );
  });
});
