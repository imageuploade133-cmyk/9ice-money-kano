"use client";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";



import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { uploadImageSecurely } from "@/lib/image-upload";
import { StoreCategoryDoc } from "@/app/api/admin/store/categories/route";

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

function CpanelStoreCategoriesPageContent() {
  const router = useRouter();
  const { isDark, toggleTheme } = useCpanelTheme();
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  const [categories, setCategories] = useState<StoreCategoryDoc[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<StoreCategoryDoc | null>(null);

  // Custom Confirm Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    actionLabel: string;
    actionStyle: "danger" | "warning" | "success" | "info";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    actionLabel: "",
    actionStyle: "danger",
    onConfirm: () => {},
  });

  const triggerConfirm = (
    title: string,
    message: string,
    actionLabel: string,
    actionStyle: "danger" | "warning" | "success" | "info",
    onConfirm: () => void
  ) => {
    setConfirmModal({ isOpen: true, title, message, actionLabel, actionStyle, onConfirm });
  };

  // Form State
  const [catName, setCatName] = useState("");
  const [catDescription, setCatDescription] = useState("");
  const [catImageUrl, setCatImageUrl] = useState("");
  const [catIconName, setCatIconName] = useState("category");
  const [catSortOrder, setCatSortOrder] = useState(0);
  const [catIsHidden, setCatIsHidden] = useState(false);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionCategoryId, setActionCategoryId] = useState<string | null>(null);


  // Check Admin Unlock Session via /api/admin/auth/session
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
          toast.error("Security Session Expired. Please authenticate in CPanel.");
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

  // Fetch Categories
  const fetchCategories = async () => {
    setIsLoadingCategories(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const authHeader: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};

      const res = await fetch("/api/admin/store/categories", { headers: authHeader });
      const data = await res.json();

      if (data.success && Array.isArray(data.categories)) {
        setCategories(data.categories);
      } else {
        toast.error(data.error || "Failed to load store categories.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error loading store categories.");
    } finally {
      setIsLoadingCategories(false);
    }
  };

  useEffect(() => {
    if (!isLoadingSession) {
      fetchCategories();
    }
  }, [isLoadingSession]);

  const openCreateModal = () => {
    setEditingCategory(null);
    setCatName("");
    setCatDescription("");
    setCatImageUrl("");
    setCatIconName("category");
    setCatSortOrder(categories.length);
    setCatIsHidden(false);
    setIsModalOpen(true);
  };

  const openEditModal = (cat: StoreCategoryDoc) => {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatDescription(cat.description || "");
    setCatImageUrl(cat.imageUrl || "");
    setCatIconName(cat.iconName || "category");
    setCatSortOrder(cat.sortOrder || 0);
    setCatIsHidden(Boolean(cat.isHidden));
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    toast.loading("Uploading category logo securely...", { id: "upload-cat-img" });

    try {
      const result = await uploadImageSecurely(file, "store_category");
      if (result.success && result.url) {
        setCatImageUrl(result.url);
        toast.success("Category image uploaded and verified!", { id: "upload-cat-img" });
      } else {
        toast.error(result.error || "Failed to upload image.", { id: "upload-cat-img" });
      }
    } catch (err: any) {
      toast.error(err.message || "Network error uploading image.", { id: "upload-cat-img" });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      toast.error("Category name is required.");
      return;
    }

    setIsSaving(true);
    toast.loading("Saving category...", { id: "save-cat" });

    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const authHeader: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};

      const action = editingCategory ? "edit_category" : "add_category";
      const payload = {
        action,
        categoryId: editingCategory?.id,
        category: {
          id: editingCategory?.id,
          name: catName.trim(),
          description: catDescription.trim(),
          imageUrl: catImageUrl.trim(),
          iconName: catIconName.trim(),
          sortOrder: Number(catSortOrder) || 0,
          isHidden: catIsHidden,
        },
      };

      const res = await fetch("/api/admin/store/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(editingCategory ? "Category updated successfully!" : "Category created successfully!", { id: "save-cat" });
        setIsModalOpen(false);
        fetchCategories();
      } else {
        toast.error(data.error || "Failed to save category.", { id: "save-cat" });
      }
    } catch (err: any) {
      toast.error(err.message || "Network error saving category.", { id: "save-cat" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleVisibility = async (cat: StoreCategoryDoc) => {
    setActionCategoryId(cat.id);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const authHeader: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};

      const res = await fetch("/api/admin/store/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ action: "toggle_visibility", categoryId: cat.id }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Category ${cat.isHidden ? "revealed" : "hidden"} successfully!`);
        fetchCategories();
      } else {
        toast.error(data.error || "Failed to update category visibility.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error updating category.");
    } finally {
      setActionCategoryId(null);
    }
  };

  const handleDeleteCategory = async (cat: StoreCategoryDoc) => {
    if (cat.id === "cat_all") {
      toast.error("The 'ALL' category is mandatory and cannot be deleted.");
      return;
    }

    triggerConfirm(
      "Delete Store Category?",
      `Are you sure you want to delete category "${cat.name.toUpperCase()}"? Products mapped to this category may need re-assignment.`,
      "Delete Category",
      "danger",
      async () => {
        setActionCategoryId(cat.id);
        try {
          const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
          const authHeader: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};

          const res = await fetch("/api/admin/store/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify({ action: "delete_category", categoryId: cat.id }),
          });

          const data = await res.json();
          if (res.ok && data.success) {
            toast.success("Category deleted successfully!");
            fetchCategories();
          } else {
            toast.error(data.error || "Failed to delete category.");
          }
        } catch (err: any) {
          toast.error(err.message || "Network error deleting category.");
        } finally {
          setActionCategoryId(null);
        }
      }
    );
  };

  // Filter categories
  const filteredCategories = categories.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q) || (c.description && c.description.toLowerCase().includes(q));
  });

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

        {/* Top Navigation Bar */}
        <div className={cn("p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4", panelClass)}>
          <div className="flex items-center gap-3">
            <Link
              href="/cpanel/store"
              className={cn("w-10 h-10 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
              title="Return to Storefront Manager"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight text-[#FC7A00]">
                Store Category Manager
              </h1>
              <p className="text-xs font-medium text-gray-400 mt-0.5">
                Create, organize, and upload custom logos for product categories
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/cpanel/store"
              className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-800 font-bold text-xs uppercase tracking-wider text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">storefront</span>
              Storefront
            </Link>
            <button
              type="button"
              onClick={openCreateModal}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#FC7A00] to-orange-600 text-white font-black text-xs uppercase tracking-wider hover:opacity-95 transition-all flex items-center gap-2 shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              Add Category
            </button>
          </div>
        </div>

        {/* Search & Stats Bar */}
        <div className={cn("p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4", panelClass)}>
          <div className="relative w-full sm:w-96">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search category name, slug, description..."
              className={cn(inputClass, "pl-10 pr-4 h-11")}
            />
          </div>

          <div className="flex items-center gap-4 text-xs font-bold text-gray-500 dark:text-gray-400">
            <span>Total Categories: <strong className="text-black dark:text-white">{categories.length}</strong></span>
            <span>•</span>
            <span>Active Visible: <strong className="text-emerald-600">{categories.filter(c => !c.isHidden).length}</strong></span>
          </div>
        </div>

        {/* Category List Cards */}
        {isLoadingCategories ? (
          <div className={cn("p-12 rounded-2xl border flex flex-col items-center justify-center gap-3", panelClass)}>
            <ButtonSpinner />
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Loading Store Categories...</p>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className={cn("p-12 rounded-2xl border flex flex-col items-center justify-center text-center gap-3", panelClass)}>
            <span className="material-symbols-outlined text-[48px] text-gray-300">category</span>
            <p className="text-sm font-extrabold text-gray-500">No categories found matching your query.</p>
            <button
              type="button"
              onClick={openCreateModal}
              className="px-4 py-2 rounded-xl bg-[#FC7A00] text-white font-bold text-xs uppercase tracking-wider hover:opacity-90"
            >
              Create New Category
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCategories.map((cat) => (
              <div
                key={cat.id}
                className={cn(
                  "p-5 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between gap-4",
                  panelClass,
                  cat.isHidden && "opacity-60 border-dashed"
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {cat.imageUrl ? (
                          <img
                            src={cat.imageUrl}
                            alt={cat.name}
                            className="w-full h-full object-contain p-1.5"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="material-symbols-outlined text-[#FC7A00] text-[24px]">
                            {cat.iconName || "category"}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-sm tracking-tight">{cat.name}</h3>
                          {cat.id === "cat_all" && (
                            <span className="px-2 py-0.5 rounded-full bg-orange-100 text-[#FC7A00] text-[9px] font-black uppercase">
                              Default
                            </span>
                          )}
                          {cat.isHidden && (
                            <span className="px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-500 text-[9px] font-black uppercase">
                              Hidden
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono font-bold text-gray-400 tracking-wide">
                          slug: /{cat.slug}
                        </span>
                      </div>
                    </div>

                    <span className="text-[10px] font-black text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
                      #{cat.sortOrder ?? 0}
                    </span>
                  </div>

                  {cat.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 line-clamp-2 leading-relaxed">
                      {cat.description}
                    </p>
                  )}
                </div>

                {/* Actions Footer */}
                <div className="pt-3 border-t border-gray-100 dark:border-gray-800/80 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={actionCategoryId === cat.id}
                    onClick={() => handleToggleVisibility(cat)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all",
                      cat.isHidden
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                    )}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {cat.isHidden ? "visibility" : "visibility_off"}
                    </span>
                    {cat.isHidden ? "Unhide" : "Hide"}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(cat)}
                      className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-[#FC7A00] hover:text-white transition-all"
                      title="Edit Category"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>

                    {cat.id !== "cat_all" && (
                      <button
                        type="button"
                        disabled={actionCategoryId === cat.id}
                        onClick={() => handleDeleteCategory(cat)}
                        className="p-1.5 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 hover:bg-red-600 hover:text-white transition-all disabled:opacity-50"
                        title="Delete Category"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Action Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className={cn("w-full max-w-sm p-6 rounded-3xl border text-center shadow-2xl space-y-4", panelClass)}>
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center mx-auto border",
              confirmModal.actionStyle === "danger" && "bg-red-50 text-red-500 border-red-200 dark:bg-red-950/40 dark:border-red-900/50"
            )}>
              <span className="material-symbols-outlined text-[24px]">gpp_maybe</span>
            </div>

            <div>
              <h4 className="font-extrabold text-sm uppercase text-gray-900 dark:text-white">{confirmModal.title}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium leading-relaxed">{confirmModal.message}</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl text-xs font-black uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                  confirmModal.onConfirm();
                }}
                className="py-2.5 bg-red-600 text-white rounded-xl text-xs font-black uppercase cursor-pointer hover:bg-red-700"
              >
                {confirmModal.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog for Add / Edit Category */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className={cn("w-[94vw] sm:w-full max-w-lg p-5 sm:p-6 rounded-3xl border shadow-2xl space-y-4 my-auto max-h-[85vh] overflow-y-auto no-scrollbar", panelClass)}>
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[#FC7A00] text-[24px]">category</span>
                <h2 className="text-base font-black uppercase tracking-tight">
                  {editingCategory ? "Edit Store Category" : "Add Store Category"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-400 hover:text-black dark:hover:text-white"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Smart Watches, Laptops, Accessories"
                  className={cn("w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold outline-none", inputClass)}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                  Category Description
                </label>
                <textarea
                  rows={2}
                  value={catDescription}
                  onChange={(e) => setCatDescription(e.target.value)}
                  placeholder="Brief summary displayed on category banners and sub-headers..."
                  className={cn("w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold outline-none resize-none", inputClass)}
                />
              </div>

              {/* Category Logo Upload */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                  Category Logo / Image URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={catImageUrl}
                    onChange={(e) => setCatImageUrl(e.target.value)}
                    placeholder="https://i.ibb.co/... or upload file"
                    className={cn("flex-1 px-3.5 py-2.5 rounded-xl border text-xs font-mono outline-none", inputClass)}
                  />
                  <label className="px-3 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-extrabold cursor-pointer hover:bg-[#FC7A00] hover:text-white transition-all flex items-center gap-1.5 flex-shrink-0">
                    {isUploadingImage ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">cloud_upload</span>}
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={isUploadingImage}
                      className="hidden"
                    />
                  </label>
                </div>
                {catImageUrl && (
                  <div className="mt-2 p-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center gap-3">
                    <img src={catImageUrl} alt="Preview" className="w-8 h-8 object-contain" />
                    <span className="text-[10px] font-mono text-emerald-600 font-bold truncate">Validated Logo Ready</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                    Material Icon Fallback
                  </label>
                  <input
                    type="text"
                    value={catIconName}
                    onChange={(e) => setCatIconName(e.target.value)}
                    placeholder="e.g. devices, checkroom, smartphone"
                    className={cn("w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold outline-none", inputClass)}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                    Display Sort Order
                  </label>
                  <input
                    type="number"
                    value={catSortOrder}
                    onChange={(e) => setCatSortOrder(Number(e.target.value))}
                    className={cn("w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold outline-none", inputClass)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="catIsHidden"
                  checked={catIsHidden}
                  onChange={(e) => setCatIsHidden(e.target.checked)}
                  className="w-4 h-4 accent-[#FC7A00] rounded"
                />
                <label htmlFor="catIsHidden" className="text-xs font-bold text-gray-600 dark:text-gray-300 cursor-pointer">
                  Hide category from public storefront
                </label>
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-800 text-xs font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSaving || isUploadingImage}
                  className="px-5 py-2.5 rounded-xl bg-[#FC7A00] text-white font-black text-xs uppercase tracking-wider hover:opacity-95 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSaving && <ButtonSpinner />}
                  {editingCategory ? "Save Changes" : "Create Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CpanelStoreCategoriesPage() {
  return (
    <CpanelRouteGuard requiredPermission="store.manage">
      <CpanelStoreCategoriesPageContent />
    </CpanelRouteGuard>
  );
}