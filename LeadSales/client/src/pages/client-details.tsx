import { useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { type Client, type ClientInvoiceEntry, type ClientInvoiceEntryHistory, type User } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { userBelongsToTeam } from "@/lib/team-utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function ClientDetailsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, params] = useRoute("/clients/:id");
  const clientId = params?.id;

  const [invoiceForm, setInvoiceForm] = useState({
    invoiceDate: "",
    invoiceNumber: "",
    invoiceAmount: 0,
    receivedAmount: 0,
    notes: "",
  });
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  const { data: client, isLoading: isLoadingClient } = useQuery<Client>({
    queryKey: [`/api/clients/${clientId}`],
    enabled: !!clientId,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: invoiceEntries = [] } = useQuery<ClientInvoiceEntry[]>({
    queryKey: ["/api/clients", clientId, "invoices"],
    enabled: !!clientId,
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/invoices`);
      if (!res.ok) throw new Error("Failed to load invoice history");
      return res.json();
    },
  });

  const { data: invoiceHistory = [] } = useQuery<ClientInvoiceEntryHistory[]>({
    queryKey: ["/api/clients", clientId, "invoices", "history"],
    enabled: !!clientId,
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/invoices/history`);
      if (!res.ok) throw new Error("Failed to load invoice edit history");
      return res.json();
    },
  });

  const createInvoiceEntryMutation = useMutation({
    mutationFn: async (payload: Omit<ClientInvoiceEntry, "id" | "clientId" | "createdAt" | "updatedAt">) => {
      const res = await fetch(`/api/clients/${clientId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to add invoice entry");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "invoices", "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}`] });
    },
  });

  const updateInvoiceEntryMutation = useMutation({
    mutationFn: async (payload: { id: string; updates: Partial<ClientInvoiceEntry> & { receivedAmountDelta?: number } }) => {
      const res = await fetch(`/api/clients/${clientId}/invoices/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.updates),
      });
      if (!res.ok) throw new Error("Failed to update invoice entry");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "invoices", "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}`] });
    },
  });

  const canEditClient = useMemo(() => {
    if (!user || !client) return false;
    if (user.role === "ADMIN") return true;
    if (user.role === "TEAM_LEAD") return userBelongsToTeam(user, client.teamId);
    return client.ownerId === user.id;
  }, [user, client]);

  const invoiceSerialById = useMemo(() => {
    const toTimestamp = (value?: string | null) => {
      if (!value) return 0;
      const ts = new Date(value).getTime();
      return Number.isNaN(ts) ? 0 : ts;
    };

    const sortedByCreatedOldestFirst = [...invoiceEntries].sort(
      (a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt),
    );
    return sortedByCreatedOldestFirst.reduce<Record<string, number>>((acc, entry, index) => {
      acc[entry.id] = index + 1;
      return acc;
    }, {});
  }, [invoiceEntries]);

  const groupedInvoices = useMemo(() => {
    const toTimestamp = (value?: string | null) => {
      if (!value) return 0;
      const ts = new Date(value).getTime();
      return Number.isNaN(ts) ? 0 : ts;
    };

    const sortedByInvoiceDateNewestFirst = [...invoiceEntries].sort((a, b) => {
      const byInvoiceDate = toTimestamp(b.invoiceDate) - toTimestamp(a.invoiceDate);
      if (byInvoiceDate !== 0) return byInvoiceDate;
      return toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
    });

    const monthKeyFromInvoiceDate = (value?: string | null) => {
      if (!value) return "Unknown Month";
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleString("en-US", { month: "long", year: "numeric" });
      }
      const [year, month] = value.split("-").map(Number);
      if (year && month) {
        return new Date(year, month - 1, 1).toLocaleString("en-US", {
          month: "long",
          year: "numeric",
        });
      }
      return "Unknown Month";
    };

    const groups = new Map<string, ClientInvoiceEntry[]>();
    sortedByInvoiceDateNewestFirst.forEach((entry) => {
      const key = monthKeyFromInvoiceDate(entry.invoiceDate);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(entry);
    });

    return Array.from(groups.entries());
  }, [invoiceEntries]);

  const editingInvoiceEntry = useMemo(
    () => invoiceEntries.find((e) => e.id === editingInvoiceId) ?? null,
    [invoiceEntries, editingInvoiceId],
  );

  const editingRemainingDelta = useMemo(() => {
    if (!editingInvoiceEntry) return 0;
    return Math.max(Number(editingInvoiceEntry.invoiceAmount || 0) - Number(editingInvoiceEntry.receivedAmount || 0), 0);
  }, [editingInvoiceEntry]);

  const invoiceTotals = useMemo(() => {
    const invoiced = invoiceEntries.reduce((sum, e) => sum + Number(e.invoiceAmount || 0), 0);
    const received = invoiceEntries.reduce((sum, e) => sum + Number(e.receivedAmount || 0), 0);
    const delta = Math.max(invoiced - received, 0);
    return { invoiced, received, delta };
  }, [invoiceEntries]);

  const usersById = useMemo(
    () => users.reduce<Record<string, User>>((acc, u) => ({ ...acc, [u.id]: u }), {}),
    [users],
  );

  const formatCurrency = (value: unknown) => `$${Number(value ?? 0).toLocaleString()}`;

  const getHistorySummary = (h: ClientInvoiceEntryHistory) => {
    if (h.action === "CREATED") {
      const invoicedValue = Number(h.snapshot?.invoiceAmount || 0);
      const receivedValue = Number(h.snapshot?.receivedAmount || 0);
      const deltaValue = Math.max(invoicedValue - receivedValue, 0);
      const paymentState = deltaValue === 0 ? "Payment cleared" : "Partial payment";
      return `Initial values at creation: Invoiced ${formatCurrency(invoicedValue)}, Received ${formatCurrency(receivedValue)}, Delta ${formatCurrency(deltaValue)} (${paymentState})`;
    }
    const before = h.snapshot?.before ?? {};
    const after = h.snapshot?.after ?? {};
    const beforeInvoiced = Number(before.invoiceAmount || 0);
    const beforeReceived = Number(before.receivedAmount || 0);
    const afterInvoiced = Number(after.invoiceAmount || 0);
    const afterReceived = Number(after.receivedAmount || 0);
    const beforeDelta = Math.max(beforeInvoiced - beforeReceived, 0);
    const afterDelta = Math.max(afterInvoiced - afterReceived, 0);
    if (beforeReceived !== afterReceived || beforeInvoiced !== afterInvoiced) {
      const paymentState = afterDelta === 0 ? "Payment cleared" : `Outstanding ${formatCurrency(afterDelta)}`;
      return `Payment update: Received ${formatCurrency(beforeReceived)} -> ${formatCurrency(afterReceived)} | Delta ${formatCurrency(beforeDelta)} -> ${formatCurrency(afterDelta)} (${paymentState})`;
    }
    return "Updated invoice details";
  };

  if (isLoadingClient) {
    return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }
  if (!client) {
    return <div className="p-8 text-center">Client not found</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/clients">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{client.projectName} - Invoice Ledger</h1>
            <p className="text-muted-foreground mt-1">{client.company}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Ledger Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Total Invoiced</span><span className="font-semibold">${invoiceTotals.invoiced.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total Received</span><span className="font-semibold text-green-600">${invoiceTotals.received.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Outstanding Delta</span><span className={cn("font-semibold", invoiceTotals.delta > 0 ? "text-red-500" : "text-green-600")}>${invoiceTotals.delta.toLocaleString()}</span></div>
            <div className="text-xs text-muted-foreground pt-2 border-t">POC: {client.clientPOC} | Billing: {client.billingFrequency}</div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{editingInvoiceId ? "Edit Invoice Entry" : "Add Invoice Entry"}</CardTitle>
            <CardDescription>{editingInvoiceId ? "Invoice amount is locked after creation. Add received payment only." : "Create a new invoice row."}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input type="date" value={invoiceForm.invoiceDate} onChange={(e) => setInvoiceForm((p) => ({ ...p, invoiceDate: e.target.value }))} />
            <Input placeholder="Invoice number (optional)" value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm((p) => ({ ...p, invoiceNumber: e.target.value }))} />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Invoice Amount</Label>
              <Input type="number" min={0} disabled={!!editingInvoiceId} value={invoiceForm.invoiceAmount === 0 ? "" : String(invoiceForm.invoiceAmount)} onKeyDown={(e) => { if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }} onChange={(e) => setInvoiceForm((p) => ({ ...p, invoiceAmount: Number(e.target.value || 0) }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{editingInvoiceId ? `Receive Payment (max ${formatCurrency(editingRemainingDelta)})` : "Received Amount"}</Label>
              <Input type="number" min={0} max={editingInvoiceId ? editingRemainingDelta : undefined} value={invoiceForm.receivedAmount === 0 ? "" : String(invoiceForm.receivedAmount)} onKeyDown={(e) => { if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }} onChange={(e) => setInvoiceForm((p) => ({ ...p, receivedAmount: Number(e.target.value || 0) }))} />
            </div>
            <div className="md:col-span-2"><Textarea placeholder="Notes (optional)" value={invoiceForm.notes} onChange={(e) => setInvoiceForm((p) => ({ ...p, notes: e.target.value }))} /></div>
            <div className="md:col-span-2 flex justify-end gap-2">
              {editingInvoiceId && <Button variant="outline" onClick={() => { setEditingInvoiceId(null); setInvoiceForm({ invoiceDate: "", invoiceNumber: "", invoiceAmount: 0, receivedAmount: 0, notes: "" }); }}>Cancel Edit</Button>}
              <Button
                disabled={!canEditClient}
                onClick={() => {
                  if (!invoiceForm.invoiceDate) return toast({ title: "Invoice date required", description: "Please select an invoice date.", variant: "destructive" });
                  const payload = { invoiceDate: invoiceForm.invoiceDate, invoiceNumber: invoiceForm.invoiceNumber || null, invoiceAmount: invoiceForm.invoiceAmount || 0, receivedAmount: invoiceForm.receivedAmount || 0, notes: invoiceForm.notes || null };
                  if (editingInvoiceId) {
                    if (invoiceForm.receivedAmount < 0) return toast({ title: "Invalid received amount", description: "Received amount cannot be negative.", variant: "destructive" });
                    if (invoiceForm.receivedAmount > editingRemainingDelta) return toast({ title: "Received exceeds remaining delta", description: `You can receive up to ${formatCurrency(editingRemainingDelta)} for this invoice.`, variant: "destructive" });
                    updateInvoiceEntryMutation.mutate({ id: editingInvoiceId, updates: { invoiceDate: payload.invoiceDate, invoiceNumber: payload.invoiceNumber, notes: payload.notes, receivedAmountDelta: payload.receivedAmount } }, { onSuccess: () => { toast({ title: "Invoice entry updated" }); setEditingInvoiceId(null); setInvoiceForm({ invoiceDate: "", invoiceNumber: "", invoiceAmount: 0, receivedAmount: 0, notes: "" }); } });
                  } else {
                    if (payload.invoiceAmount < 0 || payload.receivedAmount < 0) return toast({ title: "Invalid amount", description: "Invoice and received amounts cannot be negative.", variant: "destructive" });
                    if (payload.receivedAmount > payload.invoiceAmount) return toast({ title: "Invalid received amount", description: "Received amount cannot exceed invoice amount.", variant: "destructive" });
                    createInvoiceEntryMutation.mutate(payload, { onSuccess: () => { toast({ title: "Invoice entry added" }); setInvoiceForm({ invoiceDate: "", invoiceNumber: "", invoiceAmount: 0, receivedAmount: 0, notes: "" }); } });
                  }
                }}
              >
                {editingInvoiceId ? "Save Entry" : "Add Entry"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Invoice Timeline</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {groupedInvoices.length === 0 && <div className="text-sm text-muted-foreground border rounded-md p-4">No invoice history yet.</div>}
          {groupedInvoices.map(([monthKey, items]) => (
            <div key={monthKey} className="border rounded-md p-3">
              <h4 className="font-semibold text-sm mb-2">{monthKey}</h4>
              <div className="space-y-2">
                {items.map((entry) => {
                  const rowDelta = Math.max(Number(entry.invoiceAmount || 0) - Number(entry.receivedAmount || 0), 0);
                  const invoiceSpecificHistory = [...invoiceHistory].filter((h) => h.invoiceEntryId === entry.id).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                  return (
                    <div key={entry.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <div className="font-medium">{entry.invoiceNumber ? `Invoice ${entry.invoiceNumber}` : `Invoice ${invoiceSerialById[entry.id] ?? "-"}`}</div>
                          <div className="text-xs text-muted-foreground">{new Date(entry.invoiceDate).toLocaleDateString()}</div>
                        </div>
                        <div className="text-right">
                          <div>Invoiced: ${Number(entry.invoiceAmount || 0).toLocaleString()}</div>
                          <div className="text-green-600">Received: ${Number(entry.receivedAmount || 0).toLocaleString()}</div>
                          <div className={rowDelta > 0 ? "text-red-500 font-semibold" : "text-green-600 font-semibold"}>Delta: ${rowDelta.toLocaleString()}</div>
                        </div>
                      </div>
                      {entry.notes && <div className="text-xs text-muted-foreground mt-2">{entry.notes}</div>}
                      <div className="mt-3 border-t pt-2">
                        <div className="text-xs font-medium text-muted-foreground mb-2">Edit History</div>
                        {invoiceSpecificHistory.length === 0 ? (
                          <div className="text-xs text-muted-foreground">No history yet.</div>
                        ) : (
                          <div className="space-y-2">
                            {invoiceSpecificHistory.map((h) => {
                              const actorName = usersById[h.changedByUserId]?.name || "Unknown user";
                              const actionBadge = h.action === "CREATED" ? "Created (Initial)" : "Updated";
                              const summary = getHistorySummary(h);
                              return (
                                <div key={h.id} className="rounded-md bg-muted/40 px-2 py-1.5">
                                  <div className="flex justify-between gap-2">
                                    <div className="text-xs font-medium">{summary}</div>
                                    <Badge variant="outline" className="text-[10px] h-5">{actionBadge}</Badge>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground mt-0.5">By {actorName} on {new Date(h.createdAt).toLocaleString()}</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {canEditClient && (
                        <div className="flex justify-end mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="transition-all hover:bg-primary/10 hover:text-primary active:scale-95"
                            onClick={() => {
                              setEditingInvoiceId(entry.id);
                              setInvoiceForm({
                                invoiceDate: entry.invoiceDate,
                                invoiceNumber: entry.invoiceNumber || "",
                                invoiceAmount: Number(entry.invoiceAmount || 0),
                                receivedAmount: 0,
                                notes: entry.notes || "",
                              });
                            }}
                          >
                            Edit
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

