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

import type { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { analyzeApplicationPdfWithVertex } from "~@idaho-th/trpc/routes/vertex/vertex.gemini.transport";
import type {
  AnalyzePdfOptions,
  VertexExtractionLogger,
} from "~@idaho-th/trpc/routes/vertex/vertex.types";

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
} satisfies VertexExtractionLogger;

const baseOptions = {
  responseSchema: {
    properties: {
      name: { nullable: true, type: "string" },
      nested: {
        properties: {
          phone: { nullable: true, type: "string" },
        },
        required: ["phone"],
        type: "object",
      },
      values: {
        items: { nullable: true, type: "string" },
        type: "array",
      },
    },
    required: ["name", "nested", "values"],
    type: "object",
  },
  systemPrompt: "Extract housing application fields.",
  userPrompt: "Read this PDF.",
} satisfies AnalyzePdfOptions;

function createVertexClient(responseText: string): GoogleGenAI {
  return {
    models: {
      generateContent: vi.fn().mockResolvedValue({
        candidates: [{ finishReason: "STOP" }],
        text: responseText,
      }),
    },
  } as unknown as GoogleGenAI;
}

describe("analyzeApplicationPdfWithVertex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("rejects non-JSON LLM response", async () => {
    const responseValidator = z.object({
      name: z.string().nullable(),
    });

    await expect(
      analyzeApplicationPdfWithVertex(
        {
          client: createVertexClient("not-json"),
          config: { project: "test-project" },
          logger,
          responseValidator,
        },
        "pdf-base64",
        baseOptions,
      ),
    ).rejects.toThrow("Vertex AI returned non-JSON response");
  });

  test("sanitizes null-like values before validation", async () => {
    const responseValidator = z.object({
      name: z.string().nullable(),
      nested: z.object({
        phone: z.string().nullable(),
      }),
      values: z.array(z.string().nullable()),
    });

    const result = await analyzeApplicationPdfWithVertex(
      {
        client: createVertexClient(
          JSON.stringify({
            name: "N/A",
            nested: { phone: "unknown" },
            values: ["none", "real value"],
          }),
        ),
        config: { project: "test-project" },
        logger,
        responseValidator,
      },
      "pdf-base64",
      baseOptions,
    );

    expect(result.data).toEqual({
      name: null,
      nested: { phone: null },
      values: [null, "real value"],
    });
  });
});
