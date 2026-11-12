"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { uploadImageSecurely } from "@/lib/image-upload";
import { UploadProgressBar } from "@/components/UploadProgressBar";

interface ProfileHeaderSectionProps {
  userName: string;
  userEmail: string;
  currentPhoto: string;
  isProfileLoading: boolean;
  kycStatus?: string;
  isFrozen?: boolean;
  onPhotoUploaded: (url: string) => Promise<void>;
}

export function ProfileHeaderSection({
  userName,
  userEmail,
  currentPhoto,
  isProfileLoading,
  kycStatus,
  isFrozen,
  onPhotoUploaded,
}: ProfileHeaderSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imgError, setImgError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const isCustomAvatar = (url?: string) => {
    if (!url) return false;
    if (url.includes("aida-public") || url.includes("googleusercontent.com/aida-public")) return false;
    return url.includes("i.ibb.co") || url.includes("ibb.co") || url.includes("images.unsplash.com");
  };

  const hasCustomPhoto = isCustomAvatar(currentPhoto) && !imgError;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image file size should be less than 5MB");
      return;
    }

    setIsUploading(true);
    setUploadProgress(5);

    try {
      const result = await uploadImageSecurely(file, "profile_avatar", (percent) => {
        setUploadProgress(percent);
      });

      if (result.success && result.url) {
        await onPhotoUploaded(result.url);
        toast.success("Profile avatar successfully uploaded and updated!");
      } else {
        toast.error(result.error || "Failed to upload avatar image!");
      }
    } catch (err: any) {
      toast.error(err.message || "Avatar image upload failed.");
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 400);
    }
  };

  return (
    <section className="premium-gradient-card premium-gradient-border p-6 flex flex-col items-center text-center h-[230px]">
      {isProfileLoading ? (
        <div className="w-24 h-24 rounded-full skeleton-shimmer shadow-lg" />
      ) : hasCustomPhoto ? (
        <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-[#FC7A00] flex items-center justify-center bg-gray-50 shadow-lg">
          <Image
            src={currentPhoto}
            alt="Profile Avatar"
            fill
            className="object-cover"
            priority
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-[#FC7A00] to-[#FF9022] border-2 border-[#FC7A00] flex items-center justify-center text-white shadow-lg">
          <span className="material-symbols-outlined text-[48px] font-bold">person</span>
        </div>
      )}

      <UploadProgressBar
        isUploading={isUploading}
        progress={uploadProgress}
        label="Uploading Profile Avatar..."
      />

      <div className="mt-4 flex gap-2.5">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handlePhotoUpload}
          className="hidden"
        />
        <button
          disabled={isProfileLoading}
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-black text-[10px] font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-[14px]">upload_file</span>
          Upload Avatar File
        </button>
      </div>

      <div className="mt-5 w-full flex flex-col items-center">
        {isProfileLoading ? (
          <div className="space-y-2 w-full flex flex-col items-center">
            <div className="h-5 bg-gray-200 rounded skeleton-shimmer w-32" />
            <div className="h-3.5 bg-gray-100 rounded skeleton-shimmer w-44" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <h2 className="font-hanken font-bold text-xl text-black tracking-tight leading-none">{userName}</h2>
              <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-[#FC7A00]/10 text-[#FC7A00] border border-[#FC7A00]/30 rounded-full">
                {kycStatus === "VERIFIED" ? "Tier 3 VIP" : "Tier 1 Standard"}
              </span>
            </div>
            <p className="font-hanken text-xs text-gray-400 font-semibold mt-1.5 leading-none">{userEmail}</p>

            {isFrozen && (
              <div className="mt-2.5 px-3 py-1 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-1.5 text-rose-600 text-[10.5px] font-extrabold">
                <span className="material-symbols-outlined text-[14px]">ac_unit</span>
                <span>Account Suspended / Frozen</span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
