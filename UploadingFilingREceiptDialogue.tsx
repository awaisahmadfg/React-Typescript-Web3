"use client";
import { useEffect, useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Calendar, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import dataProvider from "@/lib/dataProvider";
import { Application } from "@/utilities/interfaces";
import {
  extractReceiptUsingOCR,
  readTextFromPdf,
  PdfReaderTypes,
} from "./utils";
import { Spinner } from "@/components/ui/spinner";

interface UploadFilingReceiptDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  application: Application | null;
  onSuccess: () => void;
}

const NOT_ABLE_TO_READ_TEXT = "Not able to read text";
const PLEASE_ADD_PATENT_NUMBER = "Please add patent number";

export function UploadFilingReceiptDialog({
  isOpen,
  onOpenChange,
  application,
  onSuccess,
}: UploadFilingReceiptDialogProps) {
  const [patentNumber, setPatentNumber] = useState("");
  const [filingDate, setFilingDate] = useState("");
  const [nextFilingDate, setNextFilingDate] = useState<Date | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isOCRLoading, setIsOCRLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [extractionError, setExtractionError] = useState(false);
  const [showInsufficientFundsModal, setShowInsufficientFundsModal] = useState(false);
  const [insufficientFundsError, setInsufficientFundsError] = useState<{
    requiredGasEth?: number;
    currentBalanceEth?: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Reset fields when dialog closes or application changes
  const resetFields = () => {
    setPatentNumber("");
    setFilingDate("");
    setNextFilingDate(null);
    // setSelectedFile(null);
    setIsOCRLoading(false);
    setIsSubmitting(false);
    setExtractionError(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!isOpen) {
      resetFields();
    }
  }, [isOpen]);

  // Calculate next filing date (1 year from filing date)
  useEffect(() => {
    if (filingDate) {
      try {
        const dateParts = filingDate.split("/");
        if (dateParts.length === 3) {
          const month = Number(dateParts[0]);
          const day = Number(dateParts[1]);
          const year = Number(dateParts[2]);

          if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
            const nextDate = new Date(year, month - 1, day);
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            setNextFilingDate(nextDate);
          }
        }
      } catch (error) {
        console.error("Error calculating next filing date:", error);
      }
    } else {
      setNextFilingDate(null);
    }
  }, [filingDate]);

  // Extract using OCR (fallback method)
  const extractUsingOCR = async (file: File) => {
    try {
      const responseText = await extractReceiptUsingOCR(file);
      if (responseText) {
        const { receiptNumber = "", filingDate: extractedDate = "" } =
          responseText;
        setPatentNumber(receiptNumber);
        setFilingDate(extractedDate);

        // Set error state if extraction failed
        if (!receiptNumber || !extractedDate) {
          setExtractionError(true);
        } else {
          setExtractionError(false);
        }
      } else {
        setExtractionError(true);
      }
    } catch (err: any) {
      console.error("extractUsingOCR ~ error:", err?.message);
      setExtractionError(true);
      toast({
        title: "OCR Error",
        description:
          "Could not extract information from the PDF. Please enter manually.",
        variant: "destructive",
      });
    } finally {
      setIsOCRLoading(false);
    }
  };

  // Handle file change and trigger OCR
  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    // Validate file type
    if (file.type !== "application/pdf") {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF file only.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
    resetFields();
    setIsOCRLoading(true);
    setExtractionError(false);

    try {
      // Try reading text from PDF first
      const responseText = await readTextFromPdf(file);
      console.log("🚀 ~ handleFileChange ~ responseText:", responseText);
      if (responseText) {
        const { receiptNumber = "", filingDate: extractedDate = "" } =
          responseText;
        setPatentNumber(receiptNumber);
        setFilingDate(extractedDate);

        // Set error state if extraction failed
        if (!receiptNumber || !extractedDate) {
          setExtractionError(true);
        } else {
          setExtractionError(false);
        }
        setIsOCRLoading(false);
      }
    } catch (err: any) {
      // If text extraction fails, try OCR
      if (err === NOT_ABLE_TO_READ_TEXT || err === "Not able to read text") {
        await extractUsingOCR(file);
      } else {
        setIsOCRLoading(false);
        setExtractionError(true);
        console.error("Error reading PDF:", err?.message ?? "Internal error");
        toast({
          title: "Error",
          description: "Failed to process the PDF. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  // Submit the filing receipt
  const handleSubmit = async () => {
    // Validation
    if (!patentNumber) {
      toast({
        title: "Validation Error",
        description: PLEASE_ADD_PATENT_NUMBER,
        variant: "destructive",
      });
      return;
    }

    if (!selectedFile) {
      toast({
        title: "Validation Error",
        description: "Please upload a receipt file.",
        variant: "destructive",
      });
      return;
    }

    if (!application?.id) {
      toast({
        title: "Error",
        description: "Application ID is missing.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare form data
      const formData = new FormData();
      formData.append("file", selectedFile, selectedFile.name);
      formData.append("number", patentNumber);
      formData.append("date", filingDate);

      // Submit to API
      await dataProvider.fileApplication(application.id, formData);

      toast({
        title: "Success",
        description: `Patent for "${application.title}" has been filed successfully.`,
      });

      setIsSubmitting(false);
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error filing patent:", error);
      
      // Handle balance and gas estimate errors from file endpoint
      const errorStatus = error?.error?.status || error?.status;
      const errorMessage = error?.error?.message || error?.message;
      
      if (errorStatus === "insufficient_funds" || errorStatus === "zero_balance") {
        const errorData = error?.error || error;
        setInsufficientFundsError({
          requiredGasEth: errorData.requiredGasEth,
          currentBalanceEth: errorData.currentBalanceEth || 0,
        });
        setShowInsufficientFundsModal(true);
        setIsSubmitting(false);
        return;
      }
      
      if (errorStatus === "gas_estimation_failed") {
        toast({
          title: "Gas Estimation Failed",
          description: errorMessage || "Failed to estimate gas for transaction. Please try again later.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
      
      if (errorStatus === "invalid_recipient") {
        toast({
          title: "Invalid Recipient",
          description: errorMessage || "Invalid recipient wallet address. Please check the application owner's wallet.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
      
      toast({
        title: "Error",
        description: errorMessage || "Failed to file patent. Please try again.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "N/A";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleClose = () => {
    setPatentNumber("");
    setFilingDate("");
    setNextFilingDate(null);
    setSelectedFile(null);
    setIsOCRLoading(false);
    setExtractionError(false);
    setIsSubmitting(false);
    setShowInsufficientFundsModal(false);
    setInsufficientFundsError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="text-foreground">File Patent</DialogTitle>
          <DialogDescription>
            Upload receipt to file patent for {application?.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* File Upload Section */}
          <div className="space-y-2">
            <Label htmlFor="receipt" className="text-foreground">
              Upload Receipt (PDF only)
            </Label>
            <Input
              ref={fileInputRef}
              id="receipt"
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              disabled={isOCRLoading || isSubmitting}
            />
            {selectedFile && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {selectedFile.name}
              </p>
            )}
          </div>

          {/* OCR Loading State */}
          {isOCRLoading && (
            <div className="flex items-center justify-center py-8 space-x-2">
              <Spinner className="h-5 w-5" />
              <span className="text-sm text-muted-foreground">
                Processing PDF and extracting information...
              </span>
            </div>
          )}

          {/* Extracted Information Display */}
          {!isOCRLoading && selectedFile && patentNumber && (
            <div className="space-y-4">
              {/* Patent Number */}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-foreground mb-1">
                      Patent Number
                    </h4>
                    <p className="text-base font-semibold text-foreground">
                      {patentNumber || "Not extracted"}
                    </p>
                    {!patentNumber && (
                      <p className="text-xs text-destructive mt-1">
                        Could not extract patent number automatically
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Filing Date */}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-foreground mb-1">
                      Filing Date
                    </h4>
                    <p className="text-base font-semibold text-foreground">
                      {filingDate || "Not extracted"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Next Filing Due Date */}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-foreground mb-1">
                      Next Filing Due Date
                    </h4>
                    <p className="text-base font-semibold text-foreground">
                      {formatDate(nextFilingDate)}
                    </p>
                    {nextFilingDate && (
                      <p className="text-xs text-muted-foreground mt-1">
                        1 year from filing date
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Unable to Extract Message */}
          {extractionError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <p className="text-sm  text-destructive font-medium">
                ⚠️ Unable to extract patent information
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Please make sure you have uploaded the correct filing receipt.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isOCRLoading || isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              isOCRLoading || isSubmitting || !selectedFile || !patentNumber
            }
          >
            {isSubmitting ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Filing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                File Patent
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={showInsufficientFundsModal} onOpenChange={setShowInsufficientFundsModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">Insufficient Funds</DialogTitle>
            <DialogDescription>
              Admin wallet does not have enough funds to pay for the gas fee to mint the patent token.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {insufficientFundsError && (
              <div className="space-y-2">
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                  <p className="text-sm font-medium text-foreground mb-2">
                    Required Gas: {insufficientFundsError.requiredGasEth?.toFixed(6)} ETH
                  </p>
                  <p className="text-sm font-medium text-foreground mb-2">
                    Current Balance: {insufficientFundsError.currentBalanceEth?.toFixed(6)} ETH
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Please add funds to the admin wallet and try again.
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowInsufficientFundsModal(false);
                setIsSubmitting(false);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
