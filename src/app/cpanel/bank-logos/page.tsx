"use client";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";



import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { uploadImageSecurely } from "@/lib/image-upload";

interface BankItem {
  id: string;
  name: string;
  code: string;
  country?: string;
  type?: string;
  logoUrl?: string | null;
  isTop?: boolean;
}

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

function CpanelBankLogosPageContent() {
  const router = RouterHook();
  const { isDark, toggleTheme } = useCpanelTheme();
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [isLoadingBanks, setIsLoadingBanks] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Track editing inputs & uploading/toggling states per bankId
  const [editingLogos, setEditingLogos] = useState<Record<string, string>>({});
  const [uploadingBankId, setUploadingBankId] = useState<string | null>(null);
  const [isRepairingLogos, setIsRepairingLogos] = useState(false);
  const [savingBankId, setSavingBankId] = useState<string | null>(null);
  const [togglingBankId, setTogglingBankId] = useState<string | null>(null);

  function RouterHook() {
    try {
      return useRouter();
    } catch {
      return { push: () => {} };
    }
  }

  // Theme Syncing




  // Auth & Session Check
  useEffect(() => {
    async function checkSession() {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (isMock) {
        setIsLoadingSession(false);
        return;
      }
      try {
        const res = await fetch("/api/admin/auth/session");
        const data = await res.json();
        if (!res.ok || !data.success) {
          toast.error("Session expired. Please log in.");
          router.push("/cpanel");
          return;
        }
      } catch (err) {
        console.error("Session check failed:", err);
      } finally {
        setIsLoadingSession(false);
      }
    }
    checkSession();
  }, [router]);

  const [hasSearched, setHasSearched] = useState(false);

  // Fetch Banks List
  const fetchBanks = async (query = searchQuery) => {
    setIsLoadingBanks(true);
    setHasSearched(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};
      const res = await fetch(`/api/admin/bank-logos?search=${encodeURIComponent(query)}`, { headers });
      const data = await res.json();
      if (data.success && Array.isArray(data.banks)) {
        setBanks(data.banks);
        // Initialize editingLogos map
        const logoMap: Record<string, string> = { ...editingLogos };
        data.banks.forEach((b: BankItem) => {
          if (logoMap[b.id] === undefined) {
            logoMap[b.id] = b.logoUrl || "";
          }
        });
        setEditingLogos(logoMap);
      } else {
        toast.error(data.error || "Failed to load banks directory.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error fetching banks list.");
    } finally {
      setIsLoadingBanks(false);
    }
  };

  // LOW-COST: Do NOT auto-fetch all banks on page load. Require explicit search or button click to save reads.
  useEffect(() => {
    if (!isLoadingSession) {
      setIsLoadingBanks(false);
    }
  }, [isLoadingSession]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchBanks(searchQuery);
  };

  // Upload file to ImgBB securely
  const handleFileUpload = async (bankId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBankId(bankId);
    toast.loading(`Uploading logo image for bank...`, { id: `upload-${bankId}` });

    try {
      const result = await uploadImageSecurely(file, "bank_logo");
      if (result.success && result.url) {
        setEditingLogos((prev) => ({ ...prev, [bankId]: result.url! }));
        toast.success("Logo image uploaded and verified successfully!", { id: `upload-${bankId}` });
      } else {
        toast.error(result.error || "Failed to upload image.", { id: `upload-${bankId}` });
      }
    } catch (err: any) {
      toast.error(err.message || "Image upload failed.", { id: `upload-${bankId}` });
    } finally {
      setUploadingBankId(null);
    }
  };

  // Toggle Bank Pin to Top position
  const handleToggleTop = async (bankId: string, currentIsTop?: boolean) => {
    const nextIsTop = !currentIsTop;
    setTogglingBankId(bankId);

    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const authHeader: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};
      const res = await fetch("/api/admin/bank-logos", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ bankId, isTop: nextIsTop }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(nextIsTop ? "Bank pinned to Top!" : "Bank unpinned from Top.");
        setBanks((prev) => {
          const updated = prev.map((b) => (b.id === bankId ? { ...b, isTop: nextIsTop } : b));
          return updated.sort((a, b) => {
            const aTop = !!a.isTop;
            const bTop = !!b.isTop;
            if (aTop && !bTop) return -1;
            if (!aTop && bTop) return 1;
            return a.name.localeCompare(b.name);
          });
        });
      } else {
        toast.error(data.error || "Failed to update top bank status.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error setting top bank.");
    } finally {
      setTogglingBankId(null);
    }
  };

  // Save bank logo to Firestore
  const handleSaveLogo = async (bankId: string) => {
    const newLogoUrl = editingLogos[bankId] || "";
    setSavingBankId(bankId);

    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const authHeader: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};
      const res = await fetch("/api/admin/bank-logos", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ bankId, logoUrl: newLogoUrl }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Bank logo saved successfully!");
        setBanks((prev) =>
          prev.map((b) => (b.id === bankId ? { ...b, logoUrl: newLogoUrl } : b))
        );
      } else {
        toast.error(data.error || "Failed to save bank logo.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error saving logo.");
    } finally {
      setSavingBankId(null);
    }
  };

  const handleRepairLogos = async () => {
    setIsRepairingLogos(true);
    toast.loading("Running logo health check and repair scan...", { id: "repair-logos" });

    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const authHeader: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};
      const res = await fetch("/api/admin/bank-logos/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Health Check Complete! Scanned: ${data.scanned}, Healthy: ${data.healthy}, Repaired: ${data.repaired}, Needs Repair: ${data.needsRepair}`, { id: "repair-logos", duration: 6000 });
        if (banks.length > 0) {
          fetchBanks(searchQuery);
        }
      } else {
        toast.error(data.error || "Repair process failed.", { id: "repair-logos" });
      }
    } catch (err: any) {
      toast.error(err.message || "Network error running logo repair.", { id: "repair-logos" });
    } finally {
      setIsRepairingLogos(false);
    }
  };

  const bgClass = isDark ? "bg-[#0c0f17] text-white" : "bg-gray-50 text-gray-900";
  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full";

  if (isLoadingSession) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center p-6", bgClass)}>
        <div className="flex flex-col items-center gap-3">
          <ButtonSpinner />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Verifying Admin Access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen p-4 md:p-8 font-hanken transition-colors duration-300", bgClass)}>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Header */}
        <div className={cn("p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4", panelClass)}>
          <div className="flex items-center gap-3">
            <Link
              href="/cpanel"
              className={cn("w-10 h-10 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-[22px]">account_balance</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Bank Logos Manager</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Upload and customize high-resolution logo assets for all supported banks.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className={cn("px-3 h-10 rounded-xl border font-bold text-xs flex items-center gap-2 transition-all cursor-pointer", isDark ? "bg-gray-900 border-gray-800 text-yellow-400" : "bg-gray-100 border-gray-200 text-gray-700")}
            >
              <span className="material-symbols-outlined text-[18px]">{isDark ? "light_mode" : "dark_mode"}</span>
              <span className="hidden sm:inline">{isDark ? "Light Mode" : "Dark Mode"}</span>
            </button>
            <Link
              href="/cpanel"
              className="px-4 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">dashboard</span>
              <span>Control Panel</span>
            </Link>
          </div>
        </div>

        {/* Search Bar & Stats */}
        <div className={cn("p-5 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4", panelClass)}>
          <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-[18px]">search</span>
              <input
                type="text"
                placeholder="Search bank name or bank code (e.g. GTBank, 058, Opay)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(inputClass, "pl-10 pr-4 h-11")}
              />
            </div>
            <button
              type="submit"
              className="px-5 h-11 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              Search
            </button>
          </form>

          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
            <span>Total Banks:</span>
            <span className="px-2.5 py-1 bg-orange-500/10 text-orange-500 border border-orange-500/20 rounded-lg">{banks.length}</span>
          </div>
        </div>

        {/* Banks Directory List */}
        {isLoadingBanks ? (
          <div className={cn("p-12 rounded-2xl border text-center flex flex-col items-center justify-center gap-3", panelClass)}>
            <ButtonSpinner />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Banks Directory...</p>
          </div>
        ) : !hasSearched ? (
          <div className={cn("p-12 rounded-2xl border text-center space-y-4", panelClass)}>
            <span className="material-symbols-outlined text-[48px] text-orange-500">search</span>
            <div>
              <p className="text-xs font-black uppercase text-gray-400">Low-Read Directory Mode</p>
              <p className="text-[11px] text-gray-500 max-w-md mx-auto mt-1">
                To keep database reads low, enter a bank name or code (e.g., &quot;058&quot;, &quot;GTBank&quot;, &quot;Opay&quot;) above or click below to load all banks on demand.
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchBanks("")}
              className="px-5 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">list</span>
              <span>Load All Banks</span>
            </button>
          </div>
        ) : banks.length === 0 ? (
          <div className={cn("p-12 rounded-2xl border text-center space-y-3", panelClass)}>
            <span className="material-symbols-outlined text-[42px] text-gray-400">account_balance_wallet</span>
            <p className="text-xs font-black uppercase text-gray-400">No Banks Found</p>
            <p className="text-[11px] text-gray-500 max-w-md mx-auto">No banks matched your search query. Try searching with a different bank name or code.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {banks.map((bank) => {
              const currentUrl = editingLogos[bank.id] || "";
              const trimmedCode = (bank.code || "").trim();
              const paddedCode = trimmedCode && /^\d+$/.test(trimmedCode) ? trimmedCode.padStart(3, "0") : trimmedCode;
              const previewUrl = currentUrl || (paddedCode ? `/bank-logos/${paddedCode}.png` : null);
              const isUploading = uploadingBankId === bank.id;
              const isSaving = savingBankId === bank.id;

              return (
                <div key={bank.id} className={cn("p-5 rounded-2xl border flex flex-col justify-between space-y-4 transition-all", panelClass)}>
                  {/* Bank Info Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-12 h-12 rounded-xl border border-gray-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt={bank.name}
                            className="w-full h-full object-contain p-1"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="text-xs font-black text-gray-600">{bank.name.substring(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-extrabold text-xs uppercase tracking-tight truncate leading-tight">{bank.name}</h3>
                          {bank.isTop && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-amber-500 text-white flex items-center gap-0.5">
                              <span className="material-symbols-outlined text-[10px]">push_pin</span>
                              <span>TOP</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-orange-500/10 text-orange-500 border border-orange-500/20">
                            Code: {bank.code}
                          </span>
                          <span className="text-[10px] font-mono text-gray-400 truncate">ID: {bank.id}</span>
                        </div>
                      </div>
                    </div>

                    {/* Pin / Unpin Button */}
                    <button
                      type="button"
                      disabled={togglingBankId === bank.id}
                      onClick={() => handleToggleTop(bank.id, bank.isTop)}
                      className={cn(
                        "h-8 px-2.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 shrink-0 cursor-pointer",
                        bank.isTop
                          ? "bg-amber-500/15 border-amber-500/30 text-amber-500 hover:bg-amber-500/25"
                          : isDark ? "bg-gray-800 border-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200"
                      )}
                      title={bank.isTop ? "Unpin bank from Top position" : "Pin bank to Top position for users"}
                    >
                      {togglingBankId === bank.id ? (
                        <ButtonSpinner />
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: bank.isTop ? '"FILL" 1' : '"FILL" 0' }}>push_pin</span>
                          <span>{bank.isTop ? "Top" : "Pin"}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Logo Upload Form */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Logo Image URL or File</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Paste image URL (https://...)"
                        value={currentUrl}
                        onChange={(e) => setEditingLogos((prev) => ({ ...prev, [bank.id]: e.target.value }))}
                        className={cn("flex-1 h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all truncate", inputClass)}
                      />
                      <div className="relative flex-shrink-0">
                        <input
                          type="file"
                          accept="image/*, image/png, image/jpeg, image/webp, image/svg+xml"
                          onChange={(e) => handleFileUpload(bank.id, e)}
                          disabled={isUploading}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                        />
                        <button
                          type="button"
                          disabled={isUploading}
                          className={cn("w-10 h-10 border rounded-xl flex items-center justify-center transition-all cursor-pointer", isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-100 border-gray-200 text-gray-700")}
                          title="Upload image file"
                        >
                          {isUploading ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">upload</span>}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200/40">
                    {currentUrl ? (
                      <button
                        type="button"
                        onClick={() => setEditingLogos((prev) => ({ ...prev, [bank.id]: "" }))}
                        className="text-[10px] font-bold text-red-500 hover:underline uppercase tracking-wider"
                      >
                        Clear Custom Logo
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Using Default Asset</span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSaveLogo(bank.id)}
                      disabled={isSaving || isUploading}
                      className="px-4 h-9 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                      {isSaving ? (
                        <ButtonSpinner />
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[16px]">save</span>
                          <span>Save</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

export default function CpanelBankLogosPage() {
  return (
    <CpanelRouteGuard requiredPermission="bank_logos.manage">
      <CpanelBankLogosPageContent />
    </CpanelRouteGuard>
  );
}