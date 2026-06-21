import { describe, expect, it } from "vitest";

import {
  extractInboundUserText,
  formatContactForFlow,
  formatLocationForFlow,
} from "./extract-user-message";

function contactCtx(phone: string, firstName?: string) {
  return {
    message: {
      contact: { phone_number: phone, first_name: firstName, user_id: 1 },
    },
  } as Parameters<typeof formatContactForFlow>[0];
}

describe("extract-user-message", () => {
  it("extracts phone from contact", () => {
    expect(extractInboundUserText(contactCtx("+79991234567"))).toBe("+79991234567");
  });

  it("formats contact with name", () => {
    expect(formatContactForFlow(contactCtx("+79991234567", "Иван"))).toBe("+79991234567 (Иван)");
  });

  it("formats location coordinates", () => {
    const ctx = {
      message: { location: { latitude: 55.75, longitude: 37.62 } },
    } as Parameters<typeof formatLocationForFlow>[0];
    expect(formatLocationForFlow(ctx)).toBe("55.75,37.62");
    expect(extractInboundUserText(ctx)).toBe("55.75,37.62");
  });
});
