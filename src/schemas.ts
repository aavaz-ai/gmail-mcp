import { z } from "zod";

export const MAX_RECIPIENTS = 100;
export const MAX_SUBJECT_LENGTH = 200;
export const MAX_BODY_LENGTH = 100_000;
export const MAX_LABEL_NAME_LENGTH = 200;

const ATOM = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+";
const DOMAIN_LABEL = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
export const BARE_EMAIL_PATTERN = new RegExp(
  `^(?=.{3,254}$)(?=.{1,64}@)${ATOM}(?:\\.${ATOM})*@${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})+$`,
);

const emailAddressSchema = z
  .string()
  .max(254)
  .regex(BARE_EMAIL_PATTERN, "must be a bare ASCII email address");

const recipientArraySchema = z.array(emailAddressSchema).max(MAX_RECIPIENTS);

export const sendEmailSchema = z
  .object({
    to: recipientArraySchema.min(1).describe("Exact ordered To recipients."),
    cc: recipientArraySchema.describe("Exact ordered Cc recipients; use an empty array when absent."),
    bcc: recipientArraySchema.describe("Exact ordered Bcc recipients; use an empty array when absent."),
    subject: z
      .string()
      .max(MAX_SUBJECT_LENGTH)
      .regex(/^[^\r\n\u0000]*$/u, "must not contain CR, LF, or NUL")
      .describe("Plain-text subject, preserved exactly."),
    body: z
      .string()
      .max(MAX_BODY_LENGTH)
      .regex(/^[^\u0000]*$/u, "must not contain NUL")
      .describe("Complete plain-text body, preserved exactly."),
  })
  .strict()
  .superRefine(({ to, cc, bcc }, context) => {
    if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
      context.addIssue({
        code: "custom",
        message: `must contain at most ${MAX_RECIPIENTS} total recipients`,
        path: ["to"],
      });
    }

    const recipients = [...to, ...cc, ...bcc];
    if (new Set(recipients).size !== recipients.length) {
      context.addIssue({
        code: "custom",
        message: "must not repeat an exact recipient across to, cc, and bcc",
        path: ["to"],
      });
    }
  });

export const labelListVisibilitySchema = z.enum([
  "labelShow",
  "labelShowIfUnread",
  "labelHide",
]);
export const messageListVisibilitySchema = z.enum(["show", "hide"]);

export const labelNameSchema = z
  .string()
  .min(1)
  .max(MAX_LABEL_NAME_LENGTH)
  .regex(
    /^(?!\s)(?!.*\s$)[^\u0000-\u001f\u007f]+$/u,
    "must not contain control characters or leading/trailing whitespace",
  );

export const createLabelSchema = z
  .object({
    name: labelNameSchema.describe("Exact Gmail user-label name."),
    label_list_visibility: labelListVisibilitySchema.optional().default("labelShow"),
    message_list_visibility: messageListVisibilitySchema.optional().default("show"),
  })
  .strict();

export const updateLabelSchema = z
  .object({
    name: labelNameSchema.describe("Exact current Gmail user-label name."),
    new_name: labelNameSchema.optional(),
    label_list_visibility: labelListVisibilitySchema.optional(),
    message_list_visibility: messageListVisibilitySchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasVisibilityChange =
      value.label_list_visibility !== undefined || value.message_list_visibility !== undefined;
    if (value.new_name === undefined && !hasVisibilityChange) {
      context.addIssue({
        code: "custom",
        message: "must include at least one label update",
        path: ["new_name"],
      });
    }
    if (value.new_name === value.name && !hasVisibilityChange) {
      context.addIssue({
        code: "custom",
        message: "new_name alone must differ from the current exact name",
        path: ["new_name"],
      });
    }
  });

export const deleteLabelSchema = z
  .object({ name: labelNameSchema.describe("Exact Gmail user-label name to delete.") })
  .strict();

export const sendEmailResultSchema = z.object({ status: z.literal("sent") }).strict();

const publicLabelResultSchema = z
  .object({
    label: z
      .object({
        name: z.string(),
        label_list_visibility: labelListVisibilitySchema,
        message_list_visibility: messageListVisibilitySchema,
      })
      .strict(),
  })
  .strict();

export const createLabelResultSchema = publicLabelResultSchema.extend({
  status: z.literal("created"),
});

export const updateLabelResultSchema = publicLabelResultSchema.extend({
  status: z.literal("updated"),
});

export const deleteLabelResultSchema = z
  .object({
    status: z.literal("deleted"),
    label: z.object({ name: z.string() }).strict(),
  })
  .strict();

export type SendEmailInput = z.infer<typeof sendEmailSchema>;
export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
export type DeleteLabelInput = z.infer<typeof deleteLabelSchema>;
export type LabelListVisibility = z.infer<typeof labelListVisibilitySchema>;
export type MessageListVisibility = z.infer<typeof messageListVisibilitySchema>;
