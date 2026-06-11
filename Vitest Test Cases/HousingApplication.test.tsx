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

type PreparedPdf = {
  signedUrl?: string;
};

const testDoubles = vi.hoisted(() => ({
  currentFormValues: undefined as ExtractedFormValues | undefined,
  extractedFormValues: {
    clientFullName: "John Doe",
    idocNumber: "12345",
  } satisfies ExtractedFormValues,
  preparedPdf: {
    signedUrl: "https://example.com/prepared-application.pdf",
  } as PreparedPdf,
  setCurrentFormValues: vi.fn(),
}));

vi.mock("../AppHeader/AppHeader", () => ({
  AppHeader: () => null,
}));

vi.mock("../ApplicationsTable/ApplicationsTable", () => ({
  ApplicationsTable: () => null,
}));

vi.mock("../SearchBar", () => ({
  SearchBar: () => null,
}));

vi.mock("../../IntakeFormModal", () => ({
  IntakeFormModal: ({
    defaultValues,
    isOpen,
    onReview,
    pdf,
  }: {
    defaultValues?: ExtractedFormValues;
    isOpen: boolean;
    onReview?: () => void;
    pdf: string | null;
  }) =>
    isOpen ? (
      <div
        data-client-name={defaultValues?.clientFullName}
        data-pdf-url={pdf}
        data-testid="intake-form-modal"
      >
        <button type="button" onClick={onReview}>
          Finish
        </button>
      </div>
    ) : null,
}));

vi.mock("../../PreviewModal", () => ({
  StaffPreviewModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="preview-modal" /> : null,
}));

vi.mock("../../UploadPdfApplicationModal/UploadPdfApplicationModal", () => ({
  UploadPdfApplicationModal: ({
    hideModal,
    onCompletion,
  }: {
    hideModal: () => void;
    onCompletion?: (formValues: unknown, preparedPdf?: unknown) => void;
  }) => (
    <div data-testid="upload-pdf-application-modal">
      <button
        type="button"
        onClick={() => {
          onCompletion?.(
            testDoubles.extractedFormValues,
            testDoubles.preparedPdf,
          );
          hideModal();
        }}
      >
        Complete extraction
      </button>
    </div>
  ),
}));

vi.mock("../../../datastores/IdahoTHStoreContext", () => ({
  useHousingApplicationsStore: () => ({
    currentFormValues: testDoubles.currentFormValues,
    setCurrentFormValues: testDoubles.setCurrentFormValues,
  }),
}));

vi.mock("../../../hooks/housingApplication", () => ({
  useStaffHousingApplications: () => ({
    data: { items: [], totalCount: 0 },
    isFetching: false,
    isLoading: false,
  }),
}));

describe("HousingApplications", () => {
  beforeEach(() => {
    testDoubles.currentFormValues = undefined;
    testDoubles.preparedPdf = {
      signedUrl: "https://example.com/prepared-application.pdf",
    };
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
      screen.getByTestId("upload-pdf-application-modal"),
    ).toBeInTheDocument();
  });

  test("opens the intake form with extracted values and prepared PDF after successful extraction", async () => {
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
    expect(screen.getByTestId("intake-form-modal")).toHaveAttribute(
      "data-pdf-url",
      testDoubles.preparedPdf.signedUrl,
    );
    expect(screen.getByTestId("intake-form-modal")).toHaveAttribute(
      "data-client-name",
      testDoubles.extractedFormValues.clientFullName,
    );
  });

  test("does not open the intake form when extracted PDF response has no signed URL", async () => {
    const user = userEvent.setup();
    testDoubles.preparedPdf = {};

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
    expect(screen.queryByTestId("intake-form-modal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("preview-modal")).not.toBeInTheDocument();
  });

  test("opens the preview modal after review", async () => {
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

    expect(screen.getByTestId("intake-form-modal")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-modal")).not.toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Finish" }));
    });

    expect(screen.queryByTestId("intake-form-modal")).not.toBeInTheDocument();
    expect(screen.getByTestId("preview-modal")).toBeInTheDocument();
  });
});
