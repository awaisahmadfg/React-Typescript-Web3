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

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Checkbox } from "../Checkbox";

vi.mock("../../../../assets/check.svg?react", () => ({
  default: () => <svg data-testid="check-icon" />,
}));

describe("Checkbox", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the check icon when checked", () => {
    const { rerender } = render(
      <Checkbox checked={false} onChange={vi.fn()} aria-label="Accept" />,
    );
    expect(screen.queryByTestId("check-icon")).not.toBeInTheDocument();

    rerender(<Checkbox checked onChange={vi.fn()} aria-label="Accept" />);
    expect(screen.getByTestId("check-icon")).toBeInTheDocument();
  });

  it("calls onChange when clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Checkbox
        checked={false}
        onChange={onChange}
        aria-label="Accept terms"
      />,
    );

    await user.click(screen.getByLabelText("Accept terms"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("marks the input disabled and does not call onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Checkbox
        checked={false}
        onChange={onChange}
        disabled
        aria-label="Disabled terms"
      />,
    );

    const input = screen.getByLabelText("Disabled terms");
    expect(input).toBeDisabled();
    await user.click(input);
    expect(onChange).not.toHaveBeenCalled();
  });
});
