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

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import toast from "react-hot-toast";
import ReactModal from "react-modal";

import { UploadPdfApplicationModal } from "../UploadPdfApplicationModal";

const mocks = vi.hoisted(() => ({
  extractWithDocumentAI: vi.fn(),
  extractWithVertexAI: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("../../assets/arrow-down.svg?react", () => ({
  default: () => <svg data-testid="arrow-down-icon" />,
}));

vi.mock("../../assets/cloud-upload.svg?react", () => ({
  default: () => <svg data-testid="upload-icon" />,
}));

vi.mock("../../assets/sparkle.svg?react", () => ({
  default: () => <svg data-testid="sparkle-icon" />,
}));

vi.mock("../../assets/x.svg?react", () => ({
  default: () => <svg data-testid="close-icon" />,
}));

vi.mock("../../../trpc/client", () => ({
  trpc: {
    housingApplication: {
      extractContent: {
        useMutation: () => ({
          mutateAsync: mocks.extractWithDocumentAI,
        }),
      },
    },
    vertex: {
      extractWithVertexAI: {
        useMutation: () => ({
          mutateAsync: mocks.extractWithVertexAI,
        }),
      },
    },
  },
}));

describe("UploadPdfApplicationModal", () => {
  beforeEach(() => {
    ReactModal.setAppElement(document.createElement("div"));
    vi.mocked(toast.error).mockReset();
    mocks.extractWithDocumentAI.mockReset();
    mocks.extractWithVertexAI.mockReset();
  });

  test("Calls onCompletion with extracted application data when a valid PDF is processed successfully", async () => {
    const hideModal = vi.fn();
    const onCompletion = vi.fn();
    const extractedApplication = {
      clientFullName: "John Doe",
      idocNumber: "12345",
    };
    const preparedPdf = {
      signedUrl: "https://example.com/application.pdf",
      sizeInBytes: 1234,
      updatedAt: "2026-06-03T00:00:00.000Z",
    };
    mocks.extractWithVertexAI.mockResolvedValue({
      application: extractedApplication,
      preparedPdf,
    });

    render(
      <UploadPdfApplicationModal
        isOpen
        hideModal={hideModal}
        onCompletion={onCompletion}
      />,
    );

    fireEvent.drop(
      screen.getByRole("button", { name: /choose a file/i }),
      {
        dataTransfer: {
          files: [
            new File(["valid pdf content"], "application.pdf", {
              type: "application/pdf",
            }),
          ],
        },
      },
    );

    expect(await screen.findByText("Analyzing document")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.extractWithVertexAI).toHaveBeenCalledWith({
        pdfBase64: "dmFsaWQgcGRmIGNvbnRlbnQ=",
      });
    });

    await waitFor(() => {
      expect(onCompletion).toHaveBeenCalledWith(
        extractedApplication,
        preparedPdf,
      );
    });
    expect(hideModal).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(mocks.extractWithDocumentAI).not.toHaveBeenCalled();
  });

  test("Rejects non-PDF files without calling extraction APIs", async () => {
    const onCompletion = vi.fn();

    render(
      <UploadPdfApplicationModal
        isOpen
        hideModal={vi.fn()}
        onCompletion={onCompletion}
      />,
    );

    fireEvent.drop(
      screen.getByRole("button", { name: /choose a file/i }),
      {
        dataTransfer: {
          files: [
            new File(["not a pdf"], "application.txt", {
              type: "text/plain",
            }),
          ],
        },
      },
    );

    expect(toast.error).toHaveBeenCalledWith("Please upload a PDF file.");
    expect(mocks.extractWithVertexAI).not.toHaveBeenCalled();
    expect(mocks.extractWithDocumentAI).not.toHaveBeenCalled();
    expect(onCompletion).not.toHaveBeenCalled();
  });

  test("Rejects PDFs larger than 10 MB without calling extraction APIs", async () => {
    const onCompletion = vi.fn();
    const oversizedPdf = new File(["pdf"], "application.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(oversizedPdf, "size", {
      value: 10 * 1024 * 1024 + 1,
    });

    render(
      <UploadPdfApplicationModal
        isOpen
        hideModal={vi.fn()}
        onCompletion={onCompletion}
      />,
    );

    fireEvent.drop(
      screen.getByRole("button", { name: /choose a file/i }),
      {
        dataTransfer: {
          files: [oversizedPdf],
        },
      },
    );

    expect(toast.error).toHaveBeenCalledWith("File must be 10 MB or smaller.");
    expect(mocks.extractWithVertexAI).not.toHaveBeenCalled();
    expect(mocks.extractWithDocumentAI).not.toHaveBeenCalled();
    expect(onCompletion).not.toHaveBeenCalled();
  });

  test("Allows selecting the same PDF file twice", async () => {
    mocks.extractWithVertexAI.mockRejectedValue(new Error("Extraction failed"));

    render(
      <UploadPdfApplicationModal
        isOpen
        hideModal={vi.fn()}
        onCompletion={vi.fn()}
      />,
    );

    const file = new File(["valid pdf content"], "application.pdf", {
      type: "application/pdf",
    });

    const selectPdf = async (expectedCallCount: number) => {
      const input = screen.getByLabelText("PDF application file");

      Object.defineProperty(input, "value", {
        configurable: true,
        value: "C:\\fakepath\\application.pdf",
        writable: true,
      });
      fireEvent.change(input, {
        target: { files: [file] },
      });

      expect(input).toHaveValue("");

      await waitFor(() => {
        expect(mocks.extractWithVertexAI).toHaveBeenCalledTimes(
          expectedCallCount,
        );
      });
      await waitFor(() => {
        expect(screen.getByText("Upload PDF application")).toBeInTheDocument();
      });
    };

    await selectPdf(1);
    await selectPdf(2);

    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenNthCalledWith(
      1,
      "We couldn't process this PDF. Please try again or upload a different file.",
    );
    expect(toast.error).toHaveBeenNthCalledWith(
      2,
      "We couldn't process this PDF. Please try again or upload a different file.",
    );
    expect(mocks.extractWithVertexAI).toHaveBeenNthCalledWith(1, {
      pdfBase64: "dmFsaWQgcGRmIGNvbnRlbnQ=",
    });
    expect(mocks.extractWithVertexAI).toHaveBeenNthCalledWith(2, {
      pdfBase64: "dmFsaWQgcGRmIGNvbnRlbnQ=",
    });
    expect(mocks.extractWithDocumentAI).not.toHaveBeenCalled();
  });

  test("Shows an error toast when extraction fails for a valid PDF", async () => {
    const onCompletion = vi.fn();
    let rejectExtraction: (reason?: unknown) => void = () => undefined;
    mocks.extractWithVertexAI.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectExtraction = reject;
        }),
    );

    render(
      <UploadPdfApplicationModal
        isOpen
        hideModal={vi.fn()}
        onCompletion={onCompletion}
      />,
    );

    fireEvent.drop(
      screen.getByRole("button", { name: /choose a file/i }),
      {
        dataTransfer: {
          files: [
            new File(["valid pdf content"], "application.pdf", {
              type: "application/pdf",
            }),
          ],
        },
      },
    );

    expect(await screen.findByText("Analyzing document")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.extractWithVertexAI).toHaveBeenCalledWith({
        pdfBase64: "dmFsaWQgcGRmIGNvbnRlbnQ=",
      });
    });

    await act(async () => {
      rejectExtraction(new Error("Extraction failed"));
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "We couldn't process this PDF. Please try again or upload a different file.",
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Upload PDF application")).toBeInTheDocument();
    });
    expect(mocks.extractWithDocumentAI).not.toHaveBeenCalled();
    expect(onCompletion).not.toHaveBeenCalled();
  });
});
