"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import Image from "next/image";
import { AppLogo } from "@/components/AppLogo";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function PinSetupPage() {
  const [pin, setPin] = useState("");
  const [step, setStep] = useState(1); // 1: Initial, 2: Confirm
  const [firstPin, setFirstPin] = useState("");
  const [keypadNumbers, setKeypadNumbers] = useState<string[]>([]);
  const { user, loading } = useAuth();
  const router = useRouter();

  const shuffleKeypad = () => {
    const numbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
    for (let i = numbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    setKeypadNumbers(numbers);
  };

  useEffect(() => {
    shuffleKeypad();
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login");
    }
  }, [user, loading, router]);

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      shuffleKeypad();

      if (newPin.length === 4) {
        if (step === 1) {
          setFirstPin(newPin);
          setPin("");
          setStep(2);
          toast.info("Confirm your PIN");
        } else {
          if (newPin === firstPin) {
            savePin(newPin);
          } else {
            toast.error("PINs do not match. Start over.");
            setPin("");
            setStep(1);
          }
        }
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    shuffleKeypad();
  };

  const savePin = async (finalPin: string) => {
    if (!user) return;
    try {
      const isMock = sessionStorage.getItem("mock") === "true";
      if (isMock) {
        // Mock save
        await setDoc(doc(db, "users", user.uid), {
          pin: finalPin,
        }, { merge: true });
        toast.success("PIN set successfully");
        router.push("/auth/pin");
        return;
      }

      // Production backend PIN hashing save
      const idToken = await user.getIdToken();
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action: "set",
          pin: finalPin
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("PIN set successfully");
        router.push("/auth/pin");
      } else {
        toast.error(data.error || "Failed to set PIN securely on server.");
      }
    } catch (error) {
      console.error("Save PIN Error:", error);
      toast.error("Failed to save PIN");
    }
  };

  if (loading) return null;

  return (
    <div className="flex flex-col min-h-screen bg-white p-8 items-center justify-between">
      <div className="w-full flex flex-col items-center text-center mt-10">
        <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
          <AppLogo size={56} />
        </div>
        <h1 className="font-hanken font-bold text-xl tracking-tight text-black mb-1">E-Global Pay</h1>
        <p className={cn(
          "font-hanken tracking-widest uppercase text-xs font-bold",
          step === 1 ? "text-red-500 font-extrabold animate-pulse" : "text-gray-500"
        )}>
          {step === 1 ? "SET YOUR ACCESS PIN (4-Digits)" : "Confirm Access PIN"}
        </p>
      </div>

      <div className="flex gap-4 justify-center my-10">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
              pin.length > i ? "bg-black border-black scale-125" : "bg-transparent border-gray-200"
            }`}
          />
        ))}
      </div>

      <div className="w-full max-w-xs grid grid-cols-3 gap-6 mb-10">
        {keypadNumbers.slice(0, 9).map((num) => (
          <motion.button
            whileTap={{ scale: 0.9, backgroundColor: "#000000", borderColor: "#000000", color: "#FFFFFF" }}
            whileHover={{ scale: 1.05 }}
            key={num}
            onClick={() => handleKeyPress(num)}
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-hanken border border-gray-200 text-black cursor-pointer transition-colors"
          >
            {num}
          </motion.button>
        ))}
        <div className="w-20 h-20" />
        {keypadNumbers[9] !== undefined && (
          <motion.button
            whileTap={{ scale: 0.9, backgroundColor: "#000000", borderColor: "#000000", color: "#FFFFFF" }}
            whileHover={{ scale: 1.05 }}
            onClick={() => handleKeyPress(keypadNumbers[9])}
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-hanken border border-gray-200 text-black cursor-pointer transition-colors"
          >
            {keypadNumbers[9]}
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
          onClick={handleDelete}
          className="w-20 h-20 rounded-full flex items-center justify-center text-black active:text-red-500 cursor-pointer"
        >
          <span className="material-symbols-outlined text-3xl">backspace</span>
        </motion.button>
      </div>
    </div>
  );
}
