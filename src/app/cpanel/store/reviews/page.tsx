"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";

interface Review {
  id: string;
  productId: string;
  authorName: string;
  rating: number;
  comment: string;
  adminReply?: {
    message: string;
    repliedAt: string;
  } | null;
  isHidden: boolean;
  isViewed?: boolean;
  createdAt: string;
}

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

function AdminStoreReviewsPageContent() {
  const router = useRouter();
  const { isDark, toggleTheme } = useCpanelTheme();
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Paginated reviews state
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [unrepliedCount, setUnrepliedCount] = useState<number>(0);

  // Search & Tab Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "visible" | "hidden">("all");

  // Reply Drawer state
  const [replyingReview, setReplyingReview] = useState<Review | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [isSubmittingReply, setIsSubmittingReview] = useState(false);

  // Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    actionLabel: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    actionLabel: "",
    onConfirm: () => {},
  });

  const triggerConfirm = (title: string, message: string, actionLabel: string, onConfirm: () => void) => {
    setConfirmModal({ isOpen: true, title, message, actionLabel, onConfirm });
  };


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

  // Mark loaded unviewed reviews as viewed to clear slide-menu badge notification
  const markReviewsAsViewed = async (reviewIdsToMark: string[], headers: Record<string, string>) => {
    if (reviewIdsToMark.length === 0) return;
    try {
      await fetch("/api/admin/store/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action: "mark_viewed", reviewIds: reviewIdsToMark }),
      });
      // Notify sidebar layout to update notification badge
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("cpanel_reviews_updated"));
      }
    } catch {
      // Ignore errors for background mark_viewed
    }
  };

  const fetchReviews = async (cursor?: string) => {
    if (cursor) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};

      const queryUrl = cursor
        ? `/api/admin/store/reviews?limit=10&startAfterId=${cursor}`
        : `/api/admin/store/reviews?limit=10`;

      const res = await fetch(queryUrl, { headers });
      const data = await res.json();

      if (data.success) {
        const fetchedList: Review[] = data.reviews || [];
        if (cursor) {
          setReviews((prev) => [...prev, ...fetchedList]);
        } else {
          setReviews(fetchedList);
        }

        setHasMore(Boolean(data.hasMore));
        setNextCursor(data.nextCursor || null);
        setTotalCount(data.totalCount || 0);
        setUnrepliedCount(data.unrepliedCount || 0);

        // Auto mark unviewed reviews as viewed
        const unviewedIds = fetchedList.filter((r) => !r.isViewed).map((r) => r.id);
        markReviewsAsViewed(unviewedIds, headers);
      } else {
        toast.error(data.error || "Failed to load product reviews.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error fetching product reviews.");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!isLoadingSession) {
      fetchReviews();
    }
  }, [isLoadingSession]);

  const handleToggleHide = async (review: Review) => {
    const newHiddenState = !review.isHidden;
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const res = await fetch("/api/admin/store/reviews", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "toggle_hide",
          reviewId: review.id,
          isHidden: newHiddenState,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(newHiddenState ? "Review hidden from public store." : "Review published to public store.");
        setReviews(reviews.map((r) => (r.id === review.id ? { ...r, isHidden: newHiddenState } : r)));
      } else {
        toast.error(data.error || "Failed to update review visibility.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error toggling review.");
    }
  };

  const handleDeleteReview = (review: Review) => {
    triggerConfirm(
      "Delete Product Review?",
      `Are you sure you want to permanently delete review by "${review.authorName}"? This action cannot be undone.`,
      "Delete Review",
      async () => {
        try {
          const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
          const headers: Record<string, string> = isMock
            ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
            : { "Content-Type": "application/json" };

          const res = await fetch("/api/admin/store/reviews", {
            method: "POST",
            headers,
            body: JSON.stringify({
              action: "delete",
              reviewId: review.id,
            }),
          });

          const data = await res.json();
          if (res.ok && data.success) {
            toast.success("Review deleted successfully!");
            setReviews(reviews.filter((r) => r.id !== review.id));
            setTotalCount((prev) => Math.max(0, prev - 1));
            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("cpanel_reviews_updated"));
            }
          } else {
            toast.error(data.error || "Failed to delete review.");
          }
        } catch (err: any) {
          toast.error(err.message || "Network error deleting review.");
        }
      }
    );
  };

  const handleSaveReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyingReview || !replyMessage.trim()) return;

    setIsSubmittingReview(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const res = await fetch("/api/admin/store/reviews", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "reply",
          reviewId: replyingReview.id,
          reply: replyMessage,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Reply saved and published!");
        setReviews(
          reviews.map((r) =>
            r.id === replyingReview.id
              ? { ...r, isViewed: true, adminReply: { message: replyMessage, repliedAt: new Date().toISOString() } }
              : r
          )
        );
        setReplyingReview(null);
        setReplyMessage("");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("cpanel_reviews_updated"));
        }
      } else {
        toast.error(data.error || "Failed to save reply.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error replying to review.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const filteredReviews = reviews.filter((rev) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      rev.authorName.toLowerCase().includes(q) ||
      rev.comment.toLowerCase().includes(q) ||
      rev.productId.toLowerCase().includes(q);

    if (filterTab === "visible") return matchesQuery && !rev.isHidden;
    if (filterTab === "hidden") return matchesQuery && rev.isHidden;
    return matchesQuery;
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

        {/* Sticky Top Header Bar */}
        <div className={cn("sticky top-0 z-30 p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md shadow-xs", panelClass)}>
          <div className="flex items-center gap-3">
            <Link
              href="/cpanel/store"
              className={cn("w-10 h-10 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-[22px]">rate_review</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Customer Reviews Manager</h1>
                {unrepliedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500 text-white animate-pulse">
                    {unrepliedCount} Pending Replies
                  </span>
                )}
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                View all storefront product reviews, reply to customer comments, hide inappropriate reviews, or delete feedback.
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
              href="/cpanel/store"
              className="px-4 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">storefront</span>
              <span>Store Manager</span>
            </Link>
          </div>
        </div>

        {/* Filter Controls & Search */}
        <div className={cn("p-4 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-3", panelClass)}>
          <div className="flex items-center gap-2 w-full md:w-auto">
            {(["all", "visible", "hidden"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterTab(tab)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all flex-1 md:flex-none text-center",
                  filterTab === tab
                    ? "bg-[#FC7A00] text-white shadow-xs"
                    : isDark ? "bg-gray-800 text-gray-400 hover:text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {tab === "all" ? `All Reviews (${totalCount || reviews.length})` : tab === "visible" ? `Published (${reviews.filter((r) => !r.isHidden).length})` : `Hidden (${reviews.filter((r) => r.isHidden).length})`}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search author, comment, product..."
              className={cn(inputClass, "pl-10 pr-4 h-10")}
            />
          </div>
        </div>

        {/* Reviews List */}
        {isLoading ? (
          <div className={cn("p-12 rounded-2xl border text-center flex flex-col items-center justify-center gap-3", panelClass)}>
            <ButtonSpinner />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Product Reviews...</p>
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className={cn("p-12 rounded-2xl border text-center space-y-3", panelClass)}>
            <span className="material-symbols-outlined text-[48px] text-gray-400">rate_review</span>
            <p className="text-xs font-black uppercase text-gray-400">No Product Reviews Found</p>
            <p className="text-[11px] text-gray-500 max-w-md mx-auto">Customer feedback posted on product pages will appear here for admin moderation and replies.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredReviews.map((rev) => (
                <div key={rev.id} className={cn("p-5 rounded-2xl border flex flex-col justify-between space-y-4 transition-all relative", panelClass)}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 border-b border-gray-200/40 pb-2">
                      <div>
                        <span className="font-extrabold text-xs uppercase text-gray-900 dark:text-white flex items-center gap-1.5">
                          {rev.authorName}
                          {!rev.adminReply && (
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" title="Needs Admin Reply" />
                          )}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono block">Product ID: {rev.productId}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider border",
                          rev.isHidden ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                        )}>
                          {rev.isHidden ? "HIDDEN" : "PUBLISHED"}
                        </span>
                        <div className="flex items-center text-amber-400">
                          {[...Array(rev.rating)].map((_, i) => (
                            <span key={i} className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                              star
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-gray-700 dark:text-gray-300 font-medium leading-relaxed bg-gray-50/50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-200/30">
                      &ldquo;{rev.comment}&rdquo;
                    </p>

                    {/* Admin Reply Block */}
                    {rev.adminReply ? (
                      <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold uppercase text-[#FC7A00] text-[10.5px] flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">support_agent</span>
                            Official Admin Reply:
                          </span>
                          <span className="text-[9px] text-gray-400 font-mono">
                            {new Date(rev.adminReply.repliedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-gray-800 dark:text-gray-200 text-[11px] font-medium leading-relaxed">
                          {rev.adminReply.message}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider italic">No admin reply sent yet.</p>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-200/40">
                    <span className="text-[9.5px] text-gray-400 font-mono">
                      Posted: {new Date(rev.createdAt).toLocaleString()}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingReview(rev);
                          setReplyMessage(rev.adminReply?.message || "");
                        }}
                        className="px-3 py-1.5 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">reply</span>
                        <span>{rev.adminReply ? "Edit Reply" : "Reply"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleHide(rev)}
                        className={cn(
                          "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all border flex items-center gap-1",
                          rev.isHidden
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20"
                            : "bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20"
                        )}
                      >
                        <span className="material-symbols-outlined text-[14px]">{rev.isHidden ? "visibility" : "visibility_off"}</span>
                        <span>{rev.isHidden ? "Unhide" : "Hide"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteReview(rev)}
                        className="px-2.5 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all border border-red-500/20 flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">delete</span>
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Load More Button */}
            {hasMore && (
              <div className="pt-4 text-center">
                <button
                  type="button"
                  disabled={isLoadingMore}
                  onClick={() => fetchReviews(nextCursor || undefined)}
                  className="px-6 py-3 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer disabled:opacity-50 shadow-md"
                >
                  {isLoadingMore ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">expand_more</span>}
                  <span>Load More Customer Reviews</span>
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Reply Modal */}
      {replyingReview && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className={cn("w-[94vw] sm:w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-4 my-auto", panelClass)}>
            <div className="flex items-center justify-between border-b border-gray-200/40 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">reply</span>
                <h3 className="font-extrabold text-sm uppercase tracking-wider">Reply to Product Review</h3>
              </div>
              <button
                type="button"
                onClick={() => setReplyingReview(null)}
                className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-400 hover:text-black dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl space-y-1 text-xs border border-gray-200/30">
              <span className="font-bold text-gray-900 dark:text-white uppercase block">{replyingReview.authorName}</span>
              <p className="text-gray-600 dark:text-gray-300 italic">&ldquo;{replyingReview.comment}&rdquo;</p>
            </div>

            <form onSubmit={handleSaveReply} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Official Support Message *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Type your official reply to this customer..."
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  className={cn("w-full p-3 rounded-xl text-xs font-semibold outline-none border transition-all resize-none", inputClass)}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setReplyingReview(null)}
                  className="px-4 py-2.5 bg-gray-200 dark:bg-gray-800 text-xs font-bold uppercase rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReply}
                  className="px-5 py-2.5 bg-[#FC7A00] hover:bg-[#e06600] text-white text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingReply ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[16px]">send</span>}
                  <span>Save & Publish Reply</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className={cn("w-[92vw] sm:w-full max-w-sm p-6 rounded-3xl border text-center shadow-2xl space-y-4", panelClass)}>
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 border border-red-200 dark:bg-red-950/40 dark:border-red-900/50 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[24px]">delete_forever</span>
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
    </div>
  );
}

export default function AdminStoreReviewsPage() {
  return (
    <CpanelRouteGuard requiredPermission="store.view">
      <AdminStoreReviewsPageContent />
    </CpanelRouteGuard>
  );
}