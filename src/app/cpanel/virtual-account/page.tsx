"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type User = { uid:string; name:string; email:string; phoneNumber:string; kycStatus:string; kycDocumentType?:string|null; bvn?:string|null; nin?:string|null };
type Details = User & { account:any; history:any[] };

export default function VirtualAccountPage() {
  const [query,setQuery]=useState("");
  const [users,setUsers]=useState<User[]>([]);
  const [selected,setSelected]=useState<Details|null>(null);
  const [loading,setLoading]=useState(false);
  const [replacing,setReplacing]=useState(false);
  const [confirm,setConfirm]=useState("");
  const [showConfirm,setShowConfirm]=useState(false);

  const { isDark, toggleTheme } = useCpanelTheme();

  async function readApiResponse(response: Response, fallback: string) {
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error(response.status === 404
        ? "Virtual Account API is not deployed on the current website. Please refresh after deployment."
        : `${fallback} (HTTP ${response.status})`);
    }
    try { return JSON.parse(text); }
    catch { throw new Error(`${fallback} (invalid API response, HTTP ${response.status})`); }
  }

  async function search() {
    const q=query.trim();
    if(q.length<2){ toast.error("Enter at least 2 characters."); return; }
    setLoading(true);
    try {
      const r=await fetch(`/api/admin/virtual-accounts/search?q=${encodeURIComponent(q)}`,{
        method:"GET", headers:{Accept:"application/json"}, cache:"no-store"
      });
      const d=await readApiResponse(r,"Search failed.");
      if(!r.ok) throw new Error(d.message||d.error||`Search failed (HTTP ${r.status}).`);
      setUsers(d.users||[]);
      setSelected(null);
    } catch(e:any){ toast.error(e.message||"Search failed."); }
    finally{setLoading(false);}
  }

  async function load(uid:string) {
    setLoading(true);
    try {
      const r=await fetch(`/api/admin/virtual-accounts/${encodeURIComponent(uid)}`,{cache:"no-store"});
      const d=await r.json();
      if(!r.ok) throw new Error(d.message||"Unable to load user.");
      setSelected(d.data);
      setUsers([]);
    } catch(e:any){toast.error(e.message||"Unable to load user.");}
    finally{setLoading(false);}
  }

  async function replaceAccount() {
    if(confirm!=="GENERATE" || !selected) return;
    setReplacing(true);
    try {
      const r=await fetch(`/api/admin/virtual-accounts/${encodeURIComponent(selected.uid)}`,{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirmation:"GENERATE"})
      });
      const d=await r.json();
      if(!r.ok || !d.success) throw new Error(d.message||"Replacement failed.");
      toast.success("New virtual account generated successfully.");
      setShowConfirm(false); setConfirm("");
      await load(selected.uid);
    } catch(e:any){toast.error(e.message||"Replacement failed.");}
    finally{setReplacing(false);}
  }

  useEffect(()=>{ if(query.trim()==="") setUsers([]); },[query]);

  return (
    <CpanelRouteGuard requiredPermission="virtual_accounts.view">
    <div className={cn("min-h-screen p-4 md:p-8 font-hanken transition-colors duration-300", isDark ? "bg-[#0c0f17] text-white" : "bg-gray-50 text-gray-900")}>
      <div className="max-w-7xl mx-auto space-y-6">
      <div className={cn("sticky top-0 z-30 p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md", isDark ? "bg-[#111827] border-gray-800/80" : "bg-white border-gray-200/90")}>
        <div className="flex items-center gap-3"><Link href="/cpanel" className={cn("w-10 h-10 rounded-xl border flex items-center justify-center", isDark ? "bg-gray-900 border-gray-800" : "bg-gray-50 border-gray-200")}><span className="material-symbols-outlined text-[20px]">arrow_back</span></Link><div><div className="flex items-center gap-2"><span className="material-symbols-outlined text-orange-500 text-[22px]">account_balance_wallet</span><h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Virtual Account Management</h1></div>
        <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>Search customer funding accounts and securely replace a virtual account.</p></div></div>
        <div className="flex items-center gap-3"><button type="button" onClick={toggleTheme} className={cn("px-3 h-10 rounded-xl border font-bold text-xs flex items-center gap-2", isDark ? "bg-gray-900 border-gray-800 text-yellow-400" : "bg-gray-100 border-gray-200 text-gray-700")}><span className="material-symbols-outlined text-[18px]">{isDark?"light_mode":"dark_mode"}</span><span className="hidden sm:inline">{isDark?"Light Mode":"Dark Mode"}</span></button><Link href="/cpanel" className="px-4 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"><span className="material-symbols-outlined text-[18px]">dashboard</span><span>Control Panel</span></Link></div>
      </div>

      <div>
        <h2 className="font-extrabold text-lg">Find Customer</h2>
        <p className="text-sm text-gray-500 mt-1">Search a verified customer, inspect their current funding account, and securely replace it when required.</p>
      </div>

      <div className={cn("rounded-2xl border p-4", isDark ? "bg-[#111827] border-gray-800/80" : "bg-white border-gray-200/90")}>
        <div className="flex flex-col md:flex-row gap-3">
          <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()}
            placeholder="Search BVN, NIN, email, phone, name or UID"
            className={cn("flex-1 rounded-xl border px-4 py-3 text-xs font-semibold outline-none focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00]", isDark ? "bg-[#111827] border-gray-700 text-white" : "bg-[#F9FAFB] border-gray-300 text-gray-900")}/>
          <button onClick={search} disabled={loading}
            className="rounded-xl bg-[#FC7A00] hover:bg-[#e06600] px-6 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">
            {loading?"Searching...":"Search User"}
          </button>
        </div>
      </div>

      {users.length>0 && (
        <div className={cn("rounded-2xl border overflow-hidden", isDark ? "bg-[#111827] border-gray-800/80" : "bg-white border-gray-200/90")}>
          {users.map(u=>(
            <button key={u.uid} onClick={()=>load(u.uid)} className={cn("w-full text-left p-4 border-b last:border-b-0 transition-colors", isDark ? "border-gray-800 hover:bg-gray-800/50" : "border-gray-100 hover:bg-gray-50")}>
              <div className="font-bold">{u.name}</div>
              <div className="text-xs text-gray-500 mt-1">{u.email} · {u.phoneNumber}</div>
              <div className="text-xs mt-2">KYC: <b>{u.kycStatus}</b> · {u.kycDocumentType?.toUpperCase()||"N/A"}</div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className={cn("lg:col-span-2 rounded-2xl border p-5 space-y-5", isDark ? "bg-[#111827] border-gray-800/80" : "bg-white border-gray-200/90")}>
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-lg font-black">{selected.name}</h2><p className="text-xs text-gray-500">{selected.uid}</p></div>
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-700">{selected.kycStatus}</span>
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Email</span><div className="font-semibold">{selected.email||"—"}</div></div>
              <div><span className="text-gray-500">Phone</span><div className="font-semibold">{selected.phoneNumber||"—"}</div></div>
              <div><span className="text-gray-500">BVN</span><div className="font-semibold">{selected.bvn||"Not available"}</div></div>
              <div><span className="text-gray-500">NIN</span><div className="font-semibold">{selected.nin||"Not available"}</div></div>
            </div>

            <div className={cn("rounded-2xl border p-5 space-y-4", isDark ? "border-gray-700 bg-gray-900/40" : "border-gray-200 bg-gray-50/50")}>
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-xs uppercase font-black text-gray-400">Current Virtual Account</p>
                  {selected.account ? (
                    <>
                      <p className="text-2xl font-black mt-2 text-[#FC7A00] font-mono tracking-wider">{selected.account.accountNumber}</p>
                      <p className="font-bold text-base mt-1">{selected.account.accountName}</p>
                      <p className="text-sm text-gray-500">{selected.account.bankName} · {selected.account.currency}</p>

                      <div className="mt-3 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs font-semibold text-orange-600 dark:text-orange-400">
                        <span className="font-bold">Banking Lookup Narration:</span> {selected.name} - E-Tech
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-gray-500">No active account found.</p>
                  )}
                </div>
                {selected.account?.status==="active" && <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 h-fit">ACTIVE</span>}
              </div>
              {selected.account && (
                <button onClick={()=>setShowConfirm(true)} className="w-full sm:w-auto rounded-xl bg-[#FC7A00] hover:bg-[#e06600] px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-white transition-all shadow-md">
                  Replace & Regenerate Account
                </button>
              )}
            </div>

            <div>
              <h3 className="font-black mb-3">Account History</h3>
              <div className="space-y-2">{selected.history?.length ? selected.history.map(h=><div key={h.id} className="rounded-xl border p-3 dark:border-gray-700 text-sm flex justify-between"><span>{h.bankName} · {h.accountNumber}</span><b>{h.status}</b></div>) : <p className="text-sm text-gray-500">No previous account records.</p>}</div>
            </div>
          </div>

          <div className={cn("rounded-2xl border p-5 h-fit", isDark ? "bg-[#111827] border-gray-800/80" : "bg-white border-gray-200/90")}>
            <h3 className="font-black">Security</h3>
            <ul className="mt-3 text-sm text-gray-500 space-y-2">
              <li>• Existing verified NIN/BVN is reused server-side.</li>
              <li>• Browser cannot supply replacement identity data.</li>
              <li>• Replacement requires the management permission.</li>
              <li>• Concurrent replacement is locked.</li>
              <li>• Wallet balance and transactions are not modified.</li>
              <li>• Previous account remains in audit history.</li>
            </ul>
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className={cn("w-full max-w-md rounded-2xl p-6 shadow-2xl border", isDark ? "bg-[#111827] border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900")}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-orange-500/10 text-[#FC7A00]">
                <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
              </div>
              <div>
                <h2 className="text-lg font-black">Replace & Regenerate Virtual Account?</h2>
                <p className="text-xs text-gray-500">Customer: <strong className="text-gray-200">{selected.name}</strong></p>
              </div>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              The current account will be deactivated at Flutterwave and a new permanent account will be provisioned. The new account will display as <strong className="text-[#FC7A00] font-semibold">{selected.name} - E-Tech</strong> in external banking apps. Wallet balance will remain untouched.
            </p>

            <div className="mt-4 p-3 rounded-xl bg-gray-100 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-xs">
              <span className="font-bold text-gray-700 dark:text-gray-300">Confirmation Required:</span>
              <p className="text-gray-500 mt-0.5">Type <code className="font-mono font-bold text-[#FC7A00]">GENERATE</code> below to proceed.</p>
            </div>

            <input
              value={confirm}
              onChange={e=>setConfirm(e.target.value.toUpperCase())}
              placeholder="Type GENERATE"
              className={cn("mt-4 w-full rounded-xl border px-4 py-3 text-xs font-mono font-bold tracking-widest outline-none focus:ring-1 focus:ring-[#FC7A00]", isDark ? "bg-gray-950 border-gray-700 text-white" : "bg-gray-50 border-gray-300 text-gray-900")}
            />

            <div className="flex gap-3 mt-5">
              <button
                onClick={()=>{setShowConfirm(false);setConfirm("")}}
                disabled={replacing}
                className={cn("flex-1 rounded-xl border px-4 py-3 text-xs font-bold transition-all", isDark ? "border-gray-700 hover:bg-gray-800" : "border-gray-200 hover:bg-gray-100")}
              >
                Cancel
              </button>
              <button
                onClick={replaceAccount}
                disabled={confirm!=="GENERATE"||replacing}
                className="flex-1 rounded-xl bg-[#FC7A00] hover:bg-[#e06600] px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-40 transition-all shadow-md flex items-center justify-center gap-2"
              >
                {replacing && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>{replacing ? "Generating..." : "Generate Account"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
    </CpanelRouteGuard>
  );
}
