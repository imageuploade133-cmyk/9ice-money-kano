export interface SavingsPlanData {
  id: string;
  name: string;
  description: string;
  type: "SAVINGS" | "FIXED_DEPOSIT";
  logoUrl?: string;
  badgeTag?: string;
  apr: number;
  interestType: "SIMPLE" | "COMPOUND";
  allowMonths: boolean;
  monthOptions: number[];
  allowYears: boolean;
  yearOptions: number[];
  allowCustom: boolean;
  minCustomDays: number;
  maxCustomDays: number;
  defaultDurationDays: number;
  isAmountRequired: boolean;
  minInvestment: number;
  maxInvestment: number;
  status: "ACTIVE" | "INACTIVE";
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_SAVINGS_PLANS: SavingsPlanData[] = [
  {
    id: "target-savings",
    name: "Target Savings Plan",
    description: "Set a goal and save systematically for rent, education, or business.",
    type: "SAVINGS",
    logoUrl: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
    badgeTag: "POPULAR",
    apr: 12.5,
    interestType: "SIMPLE",
    allowMonths: true,
    monthOptions: [1, 3, 6, 9],
    allowYears: true,
    yearOptions: [1, 2],
    allowCustom: true,
    minCustomDays: 7,
    maxCustomDays: 730,
    defaultDurationDays: 30,
    isAmountRequired: true,
    minInvestment: 1000,
    maxInvestment: 10000000,
    status: "ACTIVE",
  },
  {
    id: "fixed-deposit-vault",
    name: "Fixed Deposit Vault",
    description: "Lock capital securely and earn high guaranteed annual interest.",
    type: "FIXED_DEPOSIT",
    logoUrl: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
    badgeTag: "HIGH YIELD",
    apr: 18.0,
    interestType: "COMPOUND",
    allowMonths: true,
    monthOptions: [3, 6, 9],
    allowYears: true,
    yearOptions: [1, 2, 3],
    allowCustom: true,
    minCustomDays: 30,
    maxCustomDays: 1095,
    defaultDurationDays: 90,
    isAmountRequired: true,
    minInvestment: 5000,
    maxInvestment: 50000000,
    status: "ACTIVE",
  },
  {
    id: "emergency-flexi",
    name: "Flexi Emergency Savings",
    description: "Flexible savings with quick access and daily compounding interest.",
    type: "SAVINGS",
    logoUrl: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
    badgeTag: "RECOMMENDED",
    apr: 10.0,
    interestType: "SIMPLE",
    allowMonths: true,
    monthOptions: [1, 2, 3],
    allowYears: false,
    yearOptions: [1],
    allowCustom: true,
    minCustomDays: 3,
    maxCustomDays: 365,
    defaultDurationDays: 14,
    isAmountRequired: false,
    minInvestment: 500,
    maxInvestment: 5000000,
    status: "ACTIVE",
  }
];
