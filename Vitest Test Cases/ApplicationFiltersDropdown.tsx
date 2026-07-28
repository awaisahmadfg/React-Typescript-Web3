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

import { ApplicationsFilterDropdown } from "../ApplicationsFilterDropdown";
import {
  type ApplicationsTableFilters,
  EMPTY_APPLICATIONS_TABLE_FILTERS,
} from "../applicationsTable.filters";

vi.mock("../../../assets/arrow-down.svg?react", () => ({
  default: () => <svg data-testid="arrow-down" />,
}));

async function expandSection(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  const header = screen.getByRole("button", { name });
  if (header.getAttribute("aria-expanded") !== "true") {
    await user.click(header);
  }
}

describe("ApplicationsFilterDropdown", () => {
  afterEach(() => {
    cleanup();
  });

  it("expands a section and toggles multi-select Stage options", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ApplicationsFilterDropdown
        filters={EMPTY_APPLICATIONS_TABLE_FILTERS}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );

    await expandSection(user, /Stage/i);
    await user.click(screen.getByRole("option", { name: "Draft" }));

    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_APPLICATIONS_TABLE_FILTERS,
      stage: ["Draft"],
    } satisfies ApplicationsTableFilters);
  });

  it("selects a single-select release date option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ApplicationsFilterDropdown
        filters={EMPTY_APPLICATIONS_TABLE_FILTERS}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );

    await expandSection(user, /Exp. release date/i);
    await user.click(screen.getByRole("option", { name: "Next 7 days" }));
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_APPLICATIONS_TABLE_FILTERS,
      releaseDate: ["Next 7 days"],
    });
  });

  it("deselects an active single-select release date option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const filters: ApplicationsTableFilters = {
      ...EMPTY_APPLICATIONS_TABLE_FILTERS,
      releaseDate: ["Next 7 days"],
    };

    render(
      <ApplicationsFilterDropdown
        filters={filters}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );

    await expandSection(user, /Exp. release date/i);
    await user.click(screen.getByRole("option", { name: "Next 7 days" }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_APPLICATIONS_TABLE_FILTERS);
  });

  it("disables Clear when empty and resets filters when active", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <ApplicationsFilterDropdown
        filters={EMPTY_APPLICATIONS_TABLE_FILTERS}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();

    rerender(
      <ApplicationsFilterDropdown
        filters={{
          ...EMPTY_APPLICATIONS_TABLE_FILTERS,
          status: ["Action Needed"],
        }}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );

    const clearButton = screen.getByRole("button", { name: "Clear" });
    expect(clearButton).toBeEnabled();
    await user.click(clearButton);
    expect(onChange).toHaveBeenCalledWith(EMPTY_APPLICATIONS_TABLE_FILTERS);
  });

  it("calls onClose when Close is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ApplicationsFilterDropdown
        filters={EMPTY_APPLICATIONS_TABLE_FILTERS}
        onChange={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
