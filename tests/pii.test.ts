import { describe, expect, it } from "vitest";
import { redactPII, redactPIIWithReport } from "@/lib/safety/pii";

describe("redactPII", () => {
  it.each([
    ["Mail me at anna.schmidt@voltwerk.example please", "Mail me at [EMAIL] please"],
    ["Schreib an max+hr@mail.de oder an a.b@sub.example.co.uk", "Schreib an [EMAIL] oder an [EMAIL]"],
  ])("EMAIL: %s", (input, expected) => expect(redactPII(input)).toBe(expected));

  it.each([
    ["My IBAN is DE89 3704 0044 0532 0130 00 thanks", "My IBAN is [IBAN] thanks"],
    ["Meine IBAN: DE89370400440532013000", "Meine IBAN: [IBAN]"],
    ["Please pay GB29 NWBK 6016 1331 9268 19", "Please pay [IBAN]"],
  ])("IBAN: %s", (input, expected) => expect(redactPII(input)).toBe(expected));

  it.each([
    ["Call me on +49 151 12345678", "Call me on [PHONE]"],
    ["Meine Nummer ist 0151 12345678.", "Meine Nummer ist [PHONE]."],
    ["Erreichbar unter 089/1234567", "Erreichbar unter [PHONE]"],
    ["Tel. 0049 30 1234567 oder +1 (415) 555-0132", "Tel. [PHONE] oder [PHONE]"],
  ])("PHONE: %s", (input, expected) => expect(redactPII(input)).toBe(expected));

  it.each([
    ["Meine Steuer-ID ist 86095742719", "Meine Steuer-ID ist [TAX_ID]"],
    ["My tax ID: 86 095 742 719", "My tax ID: [TAX_ID]"],
  ])("TAX_ID: %s", (input, expected) => expect(redactPII(input)).toBe(expected));

  it.each([
    ["Mein Mitarbeiterausweis VW-123456 ist verloren", "Mein Mitarbeiterausweis [EMPLOYEE_ID] ist verloren"],
    ["Employee vw-004217 asks about leave", "Employee [EMPLOYEE_ID] asks about leave"],
  ])("EMPLOYEE_ID: %s", (input, expected) => expect(redactPII(input)).toBe(expected));

  it.each([
    ["Ich bin geboren am 12.03.1985 und habe eine Frage", "Ich bin [DATE_OF_BIRTH] und habe eine Frage"],
    ["I was born on 12/03/1985, how much leave?", "I was [DATE_OF_BIRTH], how much leave?"],
    ["DOB: 1985-03-12", "[DATE_OF_BIRTH]"],
    ["Geburtsdatum 5. März 1990", "[DATE_OF_BIRTH]"],
  ])("DATE_OF_BIRTH: %s", (input, expected) => expect(redactPII(input)).toBe(expected));

  it("redacts several categories at once and reports them", () => {
    const { text, found } = redactPIIWithReport(
      "I am VW-123456, mail a@b.de, phone +49 151 1234567, DE89 3704 0044 0532 0130 00",
    );
    expect(text).toBe("I am [EMPLOYEE_ID], mail [EMAIL], phone [PHONE], [IBAN]");
    expect(found.sort()).toEqual(["EMAIL", "EMPLOYEE_ID", "IBAN", "PHONE"]);
  });

  it("leaves ordinary policy questions untouched", () => {
    for (const q of [
      "How many vacation days do I get per year?",
      "Wie hoch ist der Nachtzuschlag von 25 % am 24. Dezember?",
      "Can I take 10 days after 31 March 2026?",
      "Overtime above 35 hours per week with 1.25 credit",
    ]) {
      expect(redactPII(q)).toBe(q);
    }
  });
});
