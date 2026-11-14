import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import { CONNECTION_DISCLAIMER } from "../connections";
import { KIND_LABELS } from "../explore/filter";
import { INJECTION_LABEL, LOCATION_LABELS } from "../injection/detect";
import { VERDICT_TEXT } from "../injection/demo-result";
import { ProfileField } from "../schemas";
import { fieldLabel } from "../staff-views/ecosystem";

/**
 * C19: English stays exactly as it was. Some English texts also live in
 * modules other screens, the jobs or the e2e suite use; these tests keep the
 * English catalogue word for word the same as them.
 */
describe("the English catalogue matches the texts other modules use", () => {
  it("kinds of opportunity", () => {
    expect(en.common.kinds).toEqual(KIND_LABELS);
  });

  it("the ecosystem disclaimer", () => {
    expect(en.ecosystem.disclaimer).toBe(CONNECTION_DISCLAIMER);
  });

  it("the ecosystem's field names", () => {
    for (const field of ProfileField.options) expect(en.ecosystem.fields[field], field).toBe(fieldLabel(field));
  });

  it("the injection demo's places, verdicts and label", () => {
    expect(en.injection.locations).toEqual(LOCATION_LABELS);
    expect(en.injection.verdicts).toEqual(VERDICT_TEXT);
    expect(en.injection.detectorLabel).toBe(INJECTION_LABEL);
  });
});
