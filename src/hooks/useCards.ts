"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { CardItem, CardTransaction, BillingAddress } from "@/types/cards";
import { toast } from "sonner";

export function useCards() {
  const { user } = useAuth();
  const [cards, setCards] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCards = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = user.uid === "mock-uid" ? "mock-token" : await user.getIdToken();
      const res = await fetch("/api/cards", {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCards(data.cards || []);
      } else {
        throw new Error(data.error || "Failed to load cards.");
      }
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const createCard = async (params: {
    currency: "NGN" | "USD";
    amount: number;
    billingAddress: BillingAddress;
    cardholder: string;
  }) => {
    if (!user) return;
    try {
      const idToken = user.uid === "mock-uid" ? "mock-token" : await user.getIdToken();
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Virtual Card issued successfully!");
        await fetchCards();
        return data.card;
      } else {
        throw new Error(data.error || "Failed to create card.");
      }
    } catch (err: any) {
      toast.error(err.message);
      throw err;
    }
  };

  const fundCard = async (cardId: string, amount: number) => {
    if (!user) return;
    try {
      const idToken = user.uid === "mock-uid" ? "mock-token" : await user.getIdToken();
      const res = await fetch(`/api/cards/${cardId}/fund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Card funded successfully!");
        await fetchCards();
        return data;
      } else {
        throw new Error(data.error || "Failed to fund card.");
      }
    } catch (err: any) {
      toast.error(err.message);
      throw err;
    }
  };

  const withdrawFromCard = async (cardId: string, amount: number) => {
    if (!user) return;
    try {
      const idToken = user.uid === "mock-uid" ? "mock-token" : await user.getIdToken();
      const res = await fetch(`/api/cards/${cardId}/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Withdrew card funds successfully!");
        await fetchCards();
        return data;
      } else {
        throw new Error(data.error || "Failed to withdraw from card.");
      }
    } catch (err: any) {
      toast.error(err.message);
      throw err;
    }
  };

  const toggleFreeze = async (cardId: string, isLocked: boolean) => {
    if (!user) return;
    try {
      const idToken = user.uid === "mock-uid" ? "mock-token" : await user.getIdToken();
      const res = await fetch(`/api/cards/${cardId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ isLocked }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(isLocked ? "Card frozen successfully!" : "Card activated successfully!");
        await fetchCards();
        return data;
      } else {
        throw new Error(data.error || "Failed to update freeze status.");
      }
    } catch (err: any) {
      toast.error(err.message);
      throw err;
    }
  };

  const terminateCard = async (cardId: string) => {
    if (!user) return;
    try {
      const idToken = user.uid === "mock-uid" ? "mock-token" : await user.getIdToken();
      const res = await fetch(`/api/cards/${cardId}/terminate`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Card terminated successfully!");
        await fetchCards();
        return data;
      } else {
        throw new Error(data.error || "Failed to terminate card.");
      }
    } catch (err: any) {
      toast.error(err.message);
      throw err;
    }
  };

  const viewSecureDetails = async (cardId: string) => {
    if (!user) return;
    try {
      const idToken = user.uid === "mock-uid" ? "mock-token" : await user.getIdToken();
      const res = await fetch(`/api/cards/${cardId}/details`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return data;
      } else {
        throw new Error(data.error || "Failed to fetch secure details.");
      }
    } catch (err: any) {
      toast.error(err.message);
      throw err;
    }
  };

  const getTransactions = async (cardId: string): Promise<CardTransaction[]> => {
    if (!user) return [];
    try {
      const idToken = user.uid === "mock-uid" ? "mock-token" : await user.getIdToken();
      const res = await fetch(`/api/cards/${cardId}/transactions`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return data.transactions || [];
      } else {
        throw new Error(data.error || "Failed to load card transactions.");
      }
    } catch (err: any) {
      toast.error(err.message);
      return [];
    }
  };

  return {
    cards,
    loading,
    error,
    refreshCards: fetchCards,
    createCard,
    fundCard,
    withdrawFromCard,
    toggleFreeze,
    terminateCard,
    viewSecureDetails,
    getTransactions,
  };
}
