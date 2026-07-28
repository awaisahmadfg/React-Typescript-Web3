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

import {
  FIRST_STEP,
  LAST_STEP,
  nextStep,
  previousStep,
} from "../steps";

describe("form step helpers", () => {
  it("advances until the last step and then stays put", () => {
    expect(nextStep(1)).toBe(2);
    expect(nextStep(3)).toBe(4);
    expect(nextStep(LAST_STEP)).toBe(LAST_STEP);
  });

  it("moves backward until the first step and then stays put", () => {
    expect(previousStep(4)).toBe(3);
    expect(previousStep(2)).toBe(1);
    expect(previousStep(FIRST_STEP)).toBe(FIRST_STEP);
  });
});
