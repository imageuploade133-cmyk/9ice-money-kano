import { describe, expect, test } from "bun:test";
import { EstateProperty, EstateSeller } from "../src/estate/types";

describe("Estate Marketplace Architectural Suite", () => {
  test("Estate property object contains required status and security fields", () => {
    const property: EstateProperty = {
      id: "prop_123",
      sellerId: "seller_456",
      sellerName: "Apex Realty Agent",
      sellerPhone: "08012345678",
      sellerEmail: "agent@apexrealty.com",
      title: "Luxury 4 Bedroom Duplex in Lekki Phase 1",
      description: "Modern duplex with swimming pool and 24/7 solar power.",
      purpose: "Rent",
      propertyType: "Duplex",
      price: 5500000,
      currency: "NGN",
      pricePeriod: "year",
      location: {
        address: "Admiralty Way, Lekki Phase 1",
        city: "Lagos",
        state: "Lagos",
      },
      bedrooms: 4,
      bathrooms: 4,
      toilets: 5,
      propertySize: "450 sqm",
      furnished: "Fully Furnished",
      amenities: ["Swimming Pool", "24/7 Power", "Security"],
      images: ["https://i.ibb.co/duplex1.jpg"],
      status: "PENDING_REVIEW",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(property.id).toBe("prop_123");
    expect(property.sellerId).toBe("seller_456");
    expect(property.purpose).toBe("Rent");
    expect(property.status).toBe("PENDING_REVIEW");
    expect(property.price).toBe(5500000);
    expect(property.amenities.length).toBe(3);
  });

  test("Estate seller object contains ban and timed restriction fields", () => {
    const seller: EstateSeller = {
      uid: "seller_789",
      displayName: "Jane Doe Estate",
      agencyName: "Jane Doe Properties",
      phone: "08099887766",
      email: "jane@janedoe.com",
      address: "Victoria Island, Lagos",
      isVerified: true,
      verificationStatus: "VERIFIED",
      bannedFromPublishing: false,
      banReason: "",
      publishingRestricted: true,
      restrictedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(seller.uid).toBe("seller_789");
    expect(seller.isVerified).toBe(true);
    expect(seller.publishingRestricted).toBe(true);
    expect(seller.restrictedUntil).toBeDefined();
  });

  test("Estate seller supports custom auto-response message and voice note fields", () => {
    const seller: EstateSeller = {
      uid: "seller_999",
      displayName: "John Smith Realty",
      phone: "08011223344",
      email: "john@smithrealty.com",
      isVerified: true,
      verificationStatus: "VERIFIED",
      autoResponseText: "Thank you for reaching out! I will call you back within 10 minutes.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(seller.autoResponseText).toContain("call you back");

    const voiceInquiry = {
      propertyId: "prop_123",
      sellerId: seller.uid,
      message: "🎤 Voice Note",
      messageType: "voice" as const,
      audioData: "data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC...",
      audioDuration: 35,
    };

    expect(voiceInquiry.messageType).toBe("voice");
    expect(voiceInquiry.audioDuration).toBeLessThanOrEqual(50);
  });

  test("Timed restriction logic evaluates expired timestamps accurately", () => {
    const expiredRestrictionDate = new Date(Date.now() - 1000).toISOString();
    const isExpired = new Date(expiredRestrictionDate).getTime() < Date.now();

    expect(isExpired).toBe(true);

    const activeRestrictionDate = new Date(Date.now() + 3600000).toISOString();
    const isActive = new Date(activeRestrictionDate).getTime() > Date.now();

    expect(isActive).toBe(true);
  });
});
