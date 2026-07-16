import { z } from "zod";

import { validateBearer } from "./auth.js";
import { GmailMcpError } from "./errors.js";
import { buildMimeMessage, encodeMimeForGmail } from "./mime.js";
import type {
  CreateLabelInput,
  DeleteLabelInput,
  LabelListVisibility,
  MessageListVisibility,
  SendEmailInput,
  UpdateLabelInput,
} from "./schemas.js";

const GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const providerLabelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    type: z.enum(["system", "user"]),
    labelListVisibility: z
      .enum(["labelShow", "labelShowIfUnread", "labelHide"])
      .optional(),
    messageListVisibility: z.enum(["show", "hide"]).optional(),
  })
  .passthrough();

// Gmail's labels.create response omits `type` even though labels.list returns
// it. The create endpoint can only create user labels, so accept omission but
// still fail closed if Gmail ever returns a non-user type explicitly.
const createdProviderLabelSchema = providerLabelSchema.extend({
  type: z.literal("user").optional(),
});

const providerLabelListSchema = z
  .object({ labels: z.array(providerLabelSchema) })
  .passthrough();

type ProviderLabel = z.infer<typeof providerLabelSchema>;

export type PublicLabel = {
  name: string;
  label_list_visibility: LabelListVisibility;
  message_list_visibility: MessageListVisibility;
};

function errorForStatus(status: number, outcome: "not_completed" | "not_sent" = "not_completed") {
  const options = { providerStatus: status, outcome } as const;
  if (status === 401) return new GmailMcpError("authentication_failed", options);
  if (status === 403) return new GmailMcpError("permission_denied", options);
  if (status === 404) return new GmailMcpError("not_found", options);
  if (status === 409) return new GmailMcpError("conflict", options);
  if (status === 429) return new GmailMcpError("rate_limited", options);
  if (status >= 500) return new GmailMcpError("provider_unavailable", { ...options, outcome: "unknown" });
  return new GmailMcpError("provider_rejected", options);
}

async function parseProviderJson<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new GmailMcpError("provider_invalid_response");
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new GmailMcpError("provider_invalid_response");
  }
  return parsed.data;
}

function publicLabel(
  label: Pick<ProviderLabel, "name" | "labelListVisibility" | "messageListVisibility">,
  fallback: {
    labelListVisibility: LabelListVisibility;
    messageListVisibility: MessageListVisibility;
  },
): PublicLabel {
  return {
    name: label.name,
    label_list_visibility: label.labelListVisibility ?? fallback.labelListVisibility,
    message_list_visibility: label.messageListVisibility ?? fallback.messageListVisibility,
  };
}

function resolveExactUserLabel(labels: readonly ProviderLabel[], name: string): ProviderLabel {
  const matches = labels.filter((label) => label.name === name);
  if (matches.length === 0) {
    throw new GmailMcpError("not_found");
  }
  if (matches.length > 1) {
    throw new GmailMcpError("conflict");
  }
  const label = matches[0];
  if (label.type !== "user") {
    throw new GmailMcpError("invalid_input");
  }
  return label;
}

export class GmailClient {
  readonly #bearer: string;
  readonly #fetch: FetchLike;

  constructor(bearer: string, fetcher: FetchLike = globalThis.fetch) {
    this.#bearer = validateBearer(bearer);
    this.#fetch = fetcher;
  }

  async #request(method: string, path: string, body?: Record<string, unknown>): Promise<Response> {
    try {
      return await this.#fetch(`${GMAIL_API_BASE_URL}${path}`, {
        method,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${this.#bearer}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new GmailMcpError("provider_unavailable", { outcome: "unknown" });
    }
  }

  async #listLabels(): Promise<ProviderLabel[]> {
    const response = await this.#request("GET", "/labels");
    if (!response.ok) throw errorForStatus(response.status);
    return (await parseProviderJson(response, providerLabelListSchema)).labels;
  }

  async #resolveExactLabel(name: string): Promise<ProviderLabel> {
    return resolveExactUserLabel(await this.#listLabels(), name);
  }

  async sendEmail(input: SendEmailInput, date: Date): Promise<{ status: "sent" }> {
    const raw = encodeMimeForGmail(buildMimeMessage(input, date));
    let response: Response;
    try {
      response = await this.#fetch(`${GMAIL_API_BASE_URL}/messages/send`, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${this.#bearer}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      });
    } catch {
      throw new GmailMcpError("send_unknown_outcome", { outcome: "unknown" });
    }

    if (!response.ok) {
      if (response.status >= 500) {
        throw new GmailMcpError("send_unknown_outcome", {
          outcome: "unknown",
          providerStatus: response.status,
        });
      }
      throw errorForStatus(response.status, "not_sent");
    }

    return { status: "sent" };
  }

  async createLabel(input: CreateLabelInput): Promise<{ status: "created"; label: PublicLabel }> {
    const exactMatches = (await this.#listLabels()).filter((label) => label.name === input.name);
    if (exactMatches.some((label) => label.type === "system")) {
      throw new GmailMcpError("invalid_input");
    }
    if (exactMatches.length > 0) {
      throw new GmailMcpError("conflict");
    }

    const response = await this.#request("POST", "/labels", {
      name: input.name,
      labelListVisibility: input.label_list_visibility,
      messageListVisibility: input.message_list_visibility,
    });
    if (!response.ok) throw errorForStatus(response.status);
    const created = await parseProviderJson(response, createdProviderLabelSchema);
    if (created.name !== input.name) {
      throw new GmailMcpError("provider_invalid_response");
    }
    return {
      status: "created",
      label: publicLabel(created, {
        labelListVisibility: input.label_list_visibility,
        messageListVisibility: input.message_list_visibility,
      }),
    };
  }

  async updateLabel(input: UpdateLabelInput): Promise<{ status: "updated"; label: PublicLabel }> {
    const labels = await this.#listLabels();
    const current = resolveExactUserLabel(labels, input.name);
    if (input.new_name !== undefined && input.new_name !== input.name) {
      const newNameMatches = labels.filter((label) => label.name === input.new_name);
      if (newNameMatches.some((label) => label.type === "system")) {
        throw new GmailMcpError("invalid_input");
      }
      if (newNameMatches.length > 0) {
        throw new GmailMcpError("conflict");
      }
    }
    const body = {
      ...(input.new_name === undefined ? {} : { name: input.new_name }),
      ...(input.label_list_visibility === undefined
        ? {}
        : { labelListVisibility: input.label_list_visibility }),
      ...(input.message_list_visibility === undefined
        ? {}
        : { messageListVisibility: input.message_list_visibility }),
    };
    const response = await this.#request(
      "PATCH",
      `/labels/${encodeURIComponent(current.id)}`,
      body,
    );
    if (!response.ok) throw errorForStatus(response.status);
    const updated = await parseProviderJson(response, providerLabelSchema);
    const expectedName = input.new_name ?? current.name;
    if (updated.type !== "user" || updated.id !== current.id || updated.name !== expectedName) {
      throw new GmailMcpError("provider_invalid_response");
    }
    return {
      status: "updated",
      label: publicLabel(updated, {
        labelListVisibility:
          input.label_list_visibility ?? current.labelListVisibility ?? "labelShow",
        messageListVisibility:
          input.message_list_visibility ?? current.messageListVisibility ?? "show",
      }),
    };
  }

  async deleteLabel(input: DeleteLabelInput): Promise<{ status: "deleted"; label: { name: string } }> {
    const current = await this.#resolveExactLabel(input.name);
    const response = await this.#request(
      "DELETE",
      `/labels/${encodeURIComponent(current.id)}`,
    );
    if (!response.ok) throw errorForStatus(response.status);
    return { status: "deleted", label: { name: input.name } };
  }
}
