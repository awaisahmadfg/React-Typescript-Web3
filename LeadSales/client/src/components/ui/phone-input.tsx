import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatPhoneInput } from "@/lib/phone";
import type { CountryCode } from "libphonenumber-js";

type PhoneInputProps = Omit<React.ComponentProps<typeof Input>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  defaultCountry?: CountryCode;
};

export function PhoneInput({
  value,
  onChange,
  defaultCountry = "PK",
  ...props
}: PhoneInputProps) {
  return (
    <Input
      {...props}
      inputMode="tel"
      autoComplete="tel"
      value={value}
      onChange={(e) => onChange(formatPhoneInput(e.target.value, defaultCountry))}
    />
  );
}
