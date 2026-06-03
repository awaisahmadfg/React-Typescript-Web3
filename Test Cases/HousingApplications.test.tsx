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

import { HousingApplications } from "../HousingApplications";

vi.mock("~design-system", () => ({
  Button: ({
    children,
    onClick,
    type = "button",
  }: {
    children?: ReactNode;
    onClick?: () => void;
    type?: "button" | "submit" | "reset";
  }) => (
    <button onClick={onClick} type={type}>
      {children}
    </button>
  ),
}));

type ExtractedFormValues = {
  clientFullName: string;
  idocNumber: string;
};

const testDoubles = vi.hoisted(() => ({
  clearCurrentApplication: vi.fn(),
  currentFormValues: undefined as ExtractedFormValues | undefined,
  extractedFormValues: {
    clientFullName: "John Doe",
    idocNumber: "12345",
  } satisfies ExtractedFormValues,
  preparedPdf: {
    signedUrl: "https://example.com/prepared-application.pdf",
  },
  setCurrentApplication: vi.fn(),
  setCurrentFormValues: vi.fn(),
}));

vi.mock("../AppHeader/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header" />,
}));

vi.mock("../ApplicationsTable/ApplicationsTable", () => ({
  ApplicationsTable: () => <div data-testid="applications-table" />,
}));

vi.mock("../SearchBar", () => ({
  SearchBar: () => <input aria-label="Search clients by name" />,
}));

vi.mock("../../IntakeFormModal", () => ({
  IntakeFormModal: ({
    defaultValues,
    isOpen,
    pdf,
  }: {
    defaultValues?: ExtractedFormValues;
    isOpen: boolean;
    pdf: string | null;
  }) =>
    isOpen ? (
      <div
        data-client-name={defaultValues?.clientFullName}
        data-pdf-url={pdf}
        data-testid="intake-form-modal"
      />
    ) : null,
}));

vi.mock("../../PreviewModal", () => ({
  PreviewModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="preview-modal" /> : null,
}));

vi.mock("../../UploadPdfApplicationModal/UploadPdfApplicationModal", () => ({
  UploadPdfApplicationModal: ({
    onCompletion,
  }: {
    onCompletion?: (formValues: unknown, preparedPdf?: unknown) => void;
  }) => (
    <div data-testid="upload-pdf-application-modal">
      <button
        type="button"
        onClick={() =>
          onCompletion?.(
            testDoubles.extractedFormValues,
            testDoubles.preparedPdf,
          )
        }
      >
        Complete extraction
      </button>
    </div>
  ),
}));

vi.mock("../../../datastores/IdahoTHStoreContext", () => ({
  useHousingApplicationsStore: () => ({
    clearCurrentApplication: testDoubles.clearCurrentApplication,
    currentFormValues: testDoubles.currentFormValues,
    setCurrentApplication: testDoubles.setCurrentApplication,
    setCurrentFormValues: testDoubles.setCurrentFormValues,
  }),
}));

vi.mock("../../../hooks/housingApplication", () => ({
  useHousingApplications: () => ({
    data: { items: [], totalCount: 0 },
    isFetching: false,
    isLoading: false,
  }),
}));

describe("HousingApplications", () => {
  beforeEach(() => {
    testDoubles.clearCurrentApplication.mockReset();
    testDoubles.currentFormValues = undefined;
    testDoubles.setCurrentApplication.mockReset();
    testDoubles.setCurrentFormValues.mockReset();
    testDoubles.setCurrentFormValues.mockImplementation((formValues) => {
      testDoubles.currentFormValues = formValues;
    });
  });

  test("opens the upload modal when clicking Upload PDF application", async () => {
    const user = userEvent.setup();

    render(<HousingApplications />);

    expect(
      screen.queryByTestId("upload-pdf-application-modal"),
    ).not.toBeInTheDocument();

    await act(async () => {
      await user.click(
        screen.getByRole("button", { name: "Upload PDF application" }),
      );
    });

    expect(
      await screen.findByTestId("upload-pdf-application-modal"),
    ).toBeInTheDocument();
  });

  test("opens the intake form modal after successful extraction", async () => {
    const user = userEvent.setup();

    render(<HousingApplications />);

    await act(async () => {
      await user.click(
        screen.getByRole("button", { name: "Upload PDF application" }),
      );
    });
    await act(async () => {
      await user.click(
        screen.getByRole("button", { name: "Complete extraction" }),
      );
    });

    expect(testDoubles.setCurrentFormValues).toHaveBeenCalledWith(
      testDoubles.extractedFormValues,
    );
    expect(await screen.findByTestId("intake-form-modal")).toHaveAttribute(
      "data-pdf-url",
      testDoubles.preparedPdf.signedUrl,
    );
    expect(screen.getByTestId("intake-form-modal")).toHaveAttribute(
      "data-client-name",
      testDoubles.extractedFormValues.clientFullName,
    );
  });
});
