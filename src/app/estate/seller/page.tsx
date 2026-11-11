"use client";

import React, { useState, useEffect } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { RouteGuard } from "@/components/RouteGuard";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import {
  EstateProperty,
  EstateSeller,
  PropertyStatus,
} from "@/estate/types";
import {
  PropertyCard,
  PropertyDetailModal,
  AddPropertyModal,
  SellerProfileModal,
  EstateHeader,
} from "@/components/estate";
import { useModalBackHandler } from "@/lib/useModalBackHandler";

export default function EstateSellerDashboard() {
  const { userData, user } = useAuth();
  const userName = (userData?.name || user?.displayName || "Captain") as string;
  const walletPhoto = (userData?.photoURL ||
    user?.photoURL ||
    "https://lh3.googleusercontent.com/aida-public/AB6AXuAhqRElSxFDYR0JkLrL3BmoTHpcQpwcpM8xiEOnGtTcV8dqv0FIMYVAxgz7tMMChcZxMlTa2-2ynaI3jIWoLsyt_hfOq8ILk52eJHTc0Ot0_rEl9aA6fYqKikhCmWGkw82ljlEttOLSEHGqM_XrwGNTAqYcnAliKIqqx6JvmHYxWU4vMcWp1WvRiDQDhCuSfoHxXfGhX0UQSjcA9sP2F2lVFfu9_7meiyzKguVTqcrOQ7LGww0OPJgP1b8eBW81_BBVIhpF2GzeT3M") as string;

  const [sellerProfile, setSellerProfile] = useState<EstateSeller | null>(null);
  const [properties, setProperties] = useState<EstateProperty[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Status Filter
  const [activeTab, setActiveTab] = useState<PropertyStatus | "ALL">("ALL");

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<EstateProperty | null>(null);
  const [editingProperty, setEditingProperty] = useState<EstateProperty | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isSavingSeller, setIsSavingSeller] = useState(false);
  const [isSubmittingProperty, setIsSubmittingProperty] = useState(false);

  useModalBackHandler(isAddModalOpen, () => {
    setIsAddModalOpen(false);
    setEditingProperty(null);
  }, "seller-add-modal");
  useModalBackHandler(Boolean(selectedProperty), () => setSelectedProperty(null), "seller-detail-modal");
  useModalBackHandler(isProfileModalOpen, () => setIsProfileModalOpen(false), "seller-edit-profile-modal");

  const fetchSellerData = async () => {
    setIsLoading(true);
    try {
      let idToken = "";
      if (user && typeof user.getIdToken === "function") {
        idToken = await user.getIdToken();
      }

      // Fetch Seller Profile
      const sellerRes = await fetch("/api/estate/sellers", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const sellerData = await sellerRes.json();

      if (sellerData.success && sellerData.seller) {
        setSellerProfile(sellerData.seller);
      } else {
        setSellerProfile({
          uid: user?.uid || "seller-id",
          displayName: userName,
          agencyName: "Independent Agent",
          phone: String(userData?.phoneNumber || ""),
          email: String(userData?.email || user?.email || ""),
          address: "",
          isVerified: false,
          verificationStatus: "PENDING",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      // Fetch Seller Properties
      const propRes = await fetch(`/api/estate/properties?sellerId=${user?.uid || ""}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const propData = await propRes.json();

      if (propData.success && Array.isArray(propData.properties)) {
        setProperties(propData.properties);
      }
    } catch (err) {
      console.warn("Failed to load seller dashboard:", err);
      toast.error("Unable to load seller properties.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchSellerData();
    }
  }, [user]);

  const handleSaveSellerProfile = async (updated: {
    agencyName: string;
    phone: string;
    email?: string;
    address: string;
    avatarUrl?: string;
    autoResponseText?: string;
    mutedFields?: ("phone" | "email" | "address" | "avatar")[];
  }) => {
    setIsSavingSeller(true);
    try {
      let idToken = "";
      if (user && typeof user.getIdToken === "function") {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/estate/sellers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          displayName: userName,
          agencyName: updated.agencyName,
          phone: updated.phone,
          email: updated.email || userData?.email || user?.email || "",
          address: updated.address,
          avatarUrl: updated.avatarUrl || sellerProfile?.avatarUrl || "",
          autoResponseText: updated.autoResponseText,
          mutedFields: updated.mutedFields || [],
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSellerProfile(data.seller);
        toast.success("Seller profile saved successfully!");
        setIsProfileModalOpen(false);
      } else {
        toast.error(data.error || "Failed to save profile.");
      }
    } catch {
      toast.error("Network error saving seller profile.");
    } finally {
      setIsSavingSeller(false);
    }
  };

  const handleCreateProperty = async (payload: Partial<EstateProperty>) => {
    setIsSubmittingProperty(true);
    try {
      let idToken = "";
      if (user && typeof user.getIdToken === "function") {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/estate/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(data.message || "Property submitted successfully!");
        setIsAddModalOpen(false);
        fetchSellerData();
      } else {
        toast.error(data.error || "Failed to submit property.");
      }
    } catch {
      toast.error("Network error creating property listing.");
    } finally {
      setIsSubmittingProperty(false);
    }
  };

  const filteredProperties = properties.filter((p) => {
    if (activeTab === "ALL") return true;
    return p.status === activeTab;
  });

  return (
    <RouteGuard>
      <div id="estate-page-root" className="min-h-dvh bg-background text-on-background pb-32">
        {/* Dedicated Estate Top Header */}
        <EstateHeader
          title="Seller Agent Console"
          subtitle="Manage Estate Listings"
          showBackButton={true}
          onRefresh={fetchSellerData}
        />

        <main className="max-w-7xl mx-auto pt-3 px-3.5 sm:px-6 md:px-8 flex-grow pb-28 text-black space-y-4">
          {/* Action Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-gray-150 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">domain</span>
              <div>
                <h2 className="font-bodoni text-base sm:text-lg font-bold tracking-tight text-black leading-tight">
                  Property Portfolio ({properties.length})
                </h2>
                <p className="text-[11px] text-gray-500 font-medium">Manage and publish real estate listings</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                className="px-3 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer border-0 flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[17px] text-[#FC7A00]">account_circle</span>
                <span>Agent Profile</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingProperty(null);
                  setIsAddModalOpen(true);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-[#FC7A00] hover:bg-[#e06600] text-white text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer border-0 shadow-2xs flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[17px]">add</span>
                <span>Add Property</span>
              </button>
            </div>
          </div>

          {/* Seller / Agent Profile Header Banner */}
          <div
            onClick={() => setIsProfileModalOpen(true)}
            className="p-3.5 sm:p-5 bg-gradient-to-br from-[#FFF5EB] to-[#FFF0E0] border border-[#FFD0A1] rounded-3xl flex items-center justify-between gap-3 cursor-pointer hover:border-[#FC7A00] transition-all shadow-2xs"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden border-2 border-[#FC7A00] shadow-xs flex-shrink-0 bg-white">
                <img src={sellerProfile?.avatarUrl || walletPhoto} alt={userName} className="w-full h-full object-cover" />
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-extrabold text-xs sm:text-sm text-black truncate">{userName}</h3>
                  {sellerProfile?.isVerified ? (
                    <span className="px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Verified
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200">
                      Pending
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-extrabold text-[#FC7A00] uppercase truncate mt-0.5">
                  {sellerProfile?.agencyName || "Independent Real Estate Agent"}
                </p>
                <p className="text-[10px] text-gray-500 font-medium truncate mt-0.5">
                  {sellerProfile?.address || "Tap to edit office address & contact phone"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0 pl-1">
              <span className="text-[10px] font-black text-[#FC7A00] uppercase tracking-wider hidden sm:inline">
                Edit
              </span>
              <span className="material-symbols-outlined text-[#FC7A00] text-[20px]">chevron_right</span>
            </div>
          </div>

          {/* Status Tabs with Dynamic Counts */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 select-none">
            {(() => {
              const publishedCount = properties.filter((p) => p.status === "PUBLISHED" || p.status === "APPROVED").length;
              const pendingCount = properties.filter((p) => p.status === "PENDING_REVIEW").length;
              const draftCount = properties.filter((p) => p.status === "DRAFT").length;
              const rejectedCount = properties.filter((p) => p.status === "REJECTED").length;

              return [
                { id: "ALL" as const, label: `All (${properties.length})` },
                { id: "PUBLISHED" as const, label: `Published (${publishedCount})` },
                { id: "PENDING_REVIEW" as const, label: `Pending Review (${pendingCount})` },
                { id: "DRAFT" as const, label: `Drafts (${draftCount})` },
                { id: "REJECTED" as const, label: `Rejected (${rejectedCount})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-[10.5px] font-black uppercase tracking-wider whitespace-nowrap border-0 cursor-pointer transition-all ${
                    activeTab === tab.id
                      ? "bg-[#FC7A00] text-white shadow-2xs"
                      : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                  }`}
                >
                  {tab.label}
                </button>
              ));
            })()}
          </div>

          {/* My Properties Directory Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-64 bg-white rounded-2xl border border-gray-150 p-3 animate-pulse space-y-3">
                  <div className="w-full h-36 bg-gray-100 rounded-xl" />
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center space-y-3 border border-gray-150 shadow-xs">
              <span className="material-symbols-outlined text-[52px] text-gray-300">
                home_work
              </span>
              <h3 className="font-bold text-xs sm:text-sm text-gray-600 uppercase tracking-wider">
                No listings under {activeTab}
              </h3>
              <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                Submit new property listings to showcase them to buyers across the marketplace.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {filteredProperties.map((prop) => (
                <div key={prop.id} className="flex flex-col gap-2">
                  <PropertyCard
                    property={prop}
                    onOpenDetails={(p) => setSelectedProperty(p)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProperty(prop);
                      setIsAddModalOpen(true);
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-gray-900 hover:bg-black text-white text-[10.5px] font-black uppercase tracking-wider border border-gray-800 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-98"
                    title="Edit Property Listing"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#FC7A00]">edit</span>
                    <span>Edit Property</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Add / Edit Property Sheet Modal */}
        <AddPropertyModal
          isOpen={isAddModalOpen}
          editingProperty={editingProperty}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingProperty(null);
          }}
          onSubmitProperty={handleCreateProperty}
          isSubmitting={isSubmittingProperty}
        />

        {/* Full Screen App Drawer Editable Seller Profile Modal */}
        <SellerProfileModal
          isOpen={isProfileModalOpen}
          seller={sellerProfile}
          currentPhoto={sellerProfile?.avatarUrl || walletPhoto}
          isEditable={true}
          onClose={() => setIsProfileModalOpen(false)}
          onSaveProfile={handleSaveSellerProfile}
          isSaving={isSavingSeller}
        />

        {/* Property Detail View */}
        <PropertyDetailModal
          isOpen={Boolean(selectedProperty)}
          property={selectedProperty}
          onClose={() => setSelectedProperty(null)}
          onSubmitInquiry={() => {}}
          onReportProperty={() => {}}
        />

        <BottomNav />
      </div>
    </RouteGuard>
  );
}
