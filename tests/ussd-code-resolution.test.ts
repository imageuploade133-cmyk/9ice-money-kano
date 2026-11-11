import { describe, expect, it } from "bun:test";
import {
  extractCleanUssdCode,
  getUssdPrefixForBank,
  resolveUssdCode,
} from "../src/lib/ussd-resolver";

describe("USSD Bank Code Resolution & Dial Code Generation Suite", () => {
  it("Scenario 1: Resolves correct real USSD prefixes for standard Nigerian banks by 3-digit code", () => {
    expect(getUssdPrefixForBank("058")).toBe("*737*1*2*"); // GTBank
    expect(getUssdPrefixForBank("044")).toBe("*901*1*2*"); // Access Bank
    expect(getUssdPrefixForBank("057")).toBe("*966*2*"); // Zenith Bank
    expect(getUssdPrefixForBank("011")).toBe("*894*1*1*"); // First Bank
    expect(getUssdPrefixForBank("033")).toBe("*919*3*2*"); // UBA
    expect(getUssdPrefixForBank("035")).toBe("*945*1*"); // Wema Bank
    expect(getUssdPrefixForBank("214")).toBe("*329*2*"); // FCMB
    expect(getUssdPrefixForBank("070")).toBe("*770*2*"); // Fidelity Bank
    expect(getUssdPrefixForBank("221")).toBe("*909*1*2*"); // Stanbic IBTC
    expect(getUssdPrefixForBank("232")).toBe("*822*2*"); // Sterling Bank
    expect(getUssdPrefixForBank("032")).toBe("*826*2*"); // Union Bank
    expect(getUssdPrefixForBank("050")).toBe("*326*2*"); // Ecobank
    expect(getUssdPrefixForBank("076")).toBe("*833*2*"); // Polaris Bank
    expect(getUssdPrefixForBank("082")).toBe("*7111*2*"); // Keystone Bank
    expect(getUssdPrefixForBank("030")).toBe("*745*2*"); // Heritage Bank
    expect(getUssdPrefixForBank("215")).toBe("*7799*2*"); // Unity Bank
    expect(getUssdPrefixForBank("301")).toBe("*773*2*"); // Jaiz Bank
    expect(getUssdPrefixForBank("50515")).toBe("*5573*1*"); // Moniepoint
    expect(getUssdPrefixForBank("999992")).toBe("*955*2*"); // OPay
  });

  it("Scenario 2: Handles unpadded bank codes (e.g. '58' instead of '058', '35' instead of '035')", () => {
    expect(getUssdPrefixForBank("58")).toBe("*737*1*2*"); // GTBank unpadded
    expect(getUssdPrefixForBank("44")).toBe("*901*1*2*"); // Access unpadded
    expect(getUssdPrefixForBank("35")).toBe("*945*1*"); // Wema unpadded
    expect(getUssdPrefixForBank("57")).toBe("*966*2*"); // Zenith unpadded
    expect(getUssdPrefixForBank("11")).toBe("*894*1*1*"); // First Bank unpadded
    expect(getUssdPrefixForBank("33")).toBe("*919*3*2*"); // UBA unpadded
    expect(getUssdPrefixForBank("70")).toBe("*770*2*"); // Fidelity unpadded
    expect(getUssdPrefixForBank("32")).toBe("*826*2*"); // Union unpadded
    expect(getUssdPrefixForBank("50")).toBe("*326*2*"); // Ecobank unpadded
  });

  it("Scenario 3: Resolves bank prefix using bank name when bank code is unknown or missing", () => {
    expect(getUssdPrefixForBank("", "Wema Bank PLC")).toBe("*945*1*");
    expect(getUssdPrefixForBank("", "Guaranty Trust Bank")).toBe("*737*1*2*");
    expect(getUssdPrefixForBank("", "First Bank of Nigeria")).toBe("*894*1*1*");
    expect(getUssdPrefixForBank("", "Moniepoint Microfinance Bank")).toBe("*5573*1*");
    expect(getUssdPrefixForBank("", "OPay Digital Services")).toBe("*955*2*");
    expect(getUssdPrefixForBank("", "FCMB")).toBe("*329*2*");
    expect(getUssdPrefixForBank("", "Fidelity Bank")).toBe("*770*2*");
  });

  it("Scenario 4: Extracts clean USSD string (*...#) from gateway text instructions", () => {
    expect(
      extractCleanUssdCode("Please dial *737*50*000*991823# on your registered mobile phone")
    ).toBe("*737*50*000*991823#");

    expect(
      extractCleanUssdCode("Dial *901*000*123456# to approve payment of 5000 NGN")
    ).toBe("*901*000*123456#");

    expect(extractCleanUssdCode("*945*1*5000#")).toBe("*945*1*5000#");
    expect(extractCleanUssdCode("No code here")).toBeNull();
  });

  it("Scenario 5: End-to-end resolveUssdCode generates complete, accurate dial codes", () => {
    // When gateway returns a specific USSD string
    expect(
      resolveUssdCode("058", "GTBank", 5000, "Dial *737*50*000*88123# to confirm")
    ).toBe("*737*50*000*88123#");

    // Wema Bank without gateway note -> generates real Wema code *945*1*5000#
    expect(resolveUssdCode("035", "Wema Bank", 5000, null)).toBe("*945*1*5000#");

    // FCMB without gateway note -> generates real FCMB code *329*2*10000#
    expect(resolveUssdCode("214", "FCMB", 10000, null)).toBe("*329*2*10000#");

    // Access Bank without gateway note -> generates real Access code *901*1*2*2500#
    expect(resolveUssdCode("044", "Access Bank", 2500, null)).toBe("*901*1*2*2500#");

    // Zenith Bank without gateway note -> generates real Zenith code *966*2*1500#
    expect(resolveUssdCode("057", "Zenith Bank", 1500, null)).toBe("*966*2*1500#");

    // Fidelity Bank without gateway note -> generates real Fidelity code *770*2*3000#
    expect(resolveUssdCode("070", "Fidelity Bank", 3000, null)).toBe("*770*2*3000#");

    // Moniepoint without gateway note -> generates real Moniepoint code *5573*1*2000#
    expect(resolveUssdCode("50515", "Moniepoint", 2000, null)).toBe("*5573*1*2000#");
  });
});
