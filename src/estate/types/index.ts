export type PropertyPurpose = "Rent" | "Sale" | "Short-let";

export type PropertyType =
  | "Apartment"
  | "House"
  | "Duplex"
  | "Villa"
  | "Land"
  | "Shop"
  | "Office"
  | "Commercial property"
  | "Other";

export type PropertyStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "REJECTED"
  | "RENTED"
  | "SOLD"
  | "ARCHIVED";

export interface EstateProperty {
  id: string;
  sellerId: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  sellerAvatarUrl?: string;
  title: string;
  description: string;
  purpose: PropertyPurpose;
  propertyType: PropertyType;
  price: number;
  currency: string;
  pricePeriod?: "year" | "month" | "night" | "total" | "None" | null;
  location: {
    address: string;
    city: string;
    state: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  bedrooms?: number;
  bathrooms?: number;
  toilets?: number;
  propertySize?: string;
  furnished?: "Fully Furnished" | "Semi Furnished" | "Unfurnished";
  amenities: string[];
  images: string[];
  videos?: string[];
  status: PropertyStatus;
  verificationStatus?: "PENDING" | "VERIFIED" | "REJECTED";
  featured?: boolean;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface EstateSeller {
  uid: string;
  displayName: string;
  agencyName?: string;
  phone: string;
  email: string;
  address?: string;
  avatarUrl?: string;
  isVerified: boolean;
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED";
  idDocumentUrl?: string;
  totalListings?: number;
  bannedFromPublishing?: boolean;
  banReason?: string;
  publishingRestricted?: boolean;
  restrictedUntil?: string | null;
  autoResponseText?: string;
  mutedFields?: ("phone" | "email" | "address" | "avatar")[];
  createdAt: string;
  updatedAt: string;
}

export interface EstatePropertyEditLog {
  id: string;
  propertyId: string;
  sellerId: string;
  sellerName?: string;
  propertyTitle: string;
  previousData: Partial<EstateProperty>;
  newData: Partial<EstateProperty>;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "FLAGGED";
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EstateInquiry {
  id: string;
  propertyId: string;
  propertyTitle: string;
  sellerId: string;
  userId: string;
  userName: string;
  userPhone: string;
  userEmail: string;
  message: string;
  messageType?: "text" | "voice";
  audioData?: string;
  audioDuration?: number;
  status: "NEW" | "READ" | "CONTACTED";
  createdAt: string;
}

export interface EstateFavorite {
  id: string;
  userId: string;
  propertyId: string;
  savedAt: string;
}

export interface EstateReport {
  id: string;
  propertyId: string;
  propertyTitle: string;
  reporterUserId: string;
  reason: string;
  details?: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  createdAt: string;
}

export interface EstateCategory {
  id: string;
  name: PropertyType;
  iconName?: string;
  imageUrl?: string;
  isHidden?: boolean;
}

export interface EstateSettingsData {
  estateLogoUrl?: string;
  estateTitle?: string;
  estateSubtitle?: string;
  estateTitleColor?: string;
  estateSubtitleColor?: string;
  autoApproveListings: boolean;
  requireAgentKYC: boolean;
  maxActiveListingsPerAgent: number;
  platformCommissionPercent: number;
  maxTitleLength?: number;
  hidePropertyIcons?: boolean;
  enableVoiceNotes: boolean;
  enableAutoResponses: boolean;
  enableChat: boolean;
  enableCalls: boolean;
  enableShare: boolean;
  enableReport: boolean;
  enableCardBorder: boolean;
  cardBorderStyle: "gradient" | "solid" | "none";
  cardBorderColor: string;
  chatSecurityNoticeUser: string;
  chatSecurityNoticeAgent: string;
  updatedAt?: string;
}

export const DEFAULT_ESTATE_SETTINGS: EstateSettingsData = {
  estateLogoUrl: "",
  estateTitle: "E-Global Estate",
  estateSubtitle: "Houses, Apartments & Land",
  estateTitleColor: "#000000",
  estateSubtitleColor: "#FC7A00",
  autoApproveListings: false,
  requireAgentKYC: true,
  maxActiveListingsPerAgent: 20,
  platformCommissionPercent: 2.5,
  maxTitleLength: 100,
  hidePropertyIcons: false,
  enableVoiceNotes: true,
  enableAutoResponses: true,
  enableChat: true,
  enableCalls: true,
  enableShare: true,
  enableReport: true,
  enableCardBorder: true,
  cardBorderStyle: "gradient",
  cardBorderColor: "#FC7A00",
  chatSecurityNoticeUser:
    "Do NOT deposit or transfer funds directly to an agent's personal bank account. Fund your E-Global Wallet account and transfer directly to the agent's wallet account.",
  chatSecurityNoticeAgent:
    "Do NOT request or instruct customers to transfer funds directly to your external personal bank account. Provide ONLY your E-Global Wallet Account to receive funds.",
};

export interface EstateSettings {
  featuredFee?: number;
  agentRegistrationFee?: number;
  autoApproveVerifiedSellers?: boolean;
  supportPhone?: string;
  supportEmail?: string;
}
