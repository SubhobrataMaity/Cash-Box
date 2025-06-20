"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PhoneInput } from "@/components/phone-input";
import { format } from "date-fns";
import { z } from "zod";

const ReceiptItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  price: z.number().min(0.01, "Price must be at least ₹0.01"),
  advanceAmount: z.number().min(0).optional(),
  dueAmount: z.number().min(0).optional(),
});

const PaymentDetailsSchema = z.object({
  phoneNumber: z.string().optional(),
  phoneCountryCode: z.string().optional(),
});

const ReceiptSchema = z.object({
  receiptNumber: z.string().min(1, "Receipt number is required"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  customerName: z.string().min(1, "Customer name is required"),
  customerContact: z.string().min(10, "Contact must be at least 10 digits"),
  customerCountryCode: z.string().optional(),
  paymentType: z.enum(["cash", "online"]),
  paymentStatus: z.enum(["full", "advance", "due"]),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional(),
  notes: z.string().optional(),
  total: z.number().min(0),
  dueTotal: z.number().min(0),
  items: z.array(ReceiptItemSchema).min(1, "At least one item is required"),
  paymentDetails: PaymentDetailsSchema.optional(),
  gstPercentage: z.number().min(0).max(28).nullable().optional(),
  gstAmount: z.number().min(0).optional(),
});

interface ReceiptItem {
  description: string;
  quantity: number;
  price: number;
  advanceAmount?: number;
  dueAmount?: number;
}

export default function CreateReceipt() {
  const router = useRouter();
  const [receiptData, setReceiptData] = useState({
    receiptNumber: "",
    date: format(new Date(), "yyyy-MM-dd"),
    customerName: "",
    customerContact: "",
    customerCountryCode: "+91",
    paymentType: "cash" as "cash" | "online",
    paymentStatus: "full" as "full" | "advance" | "due",
    paymentDate: format(new Date(), "yyyy-MM-dd"),
    notes: "",
    items: [{ description: "", quantity: 0, price: 0 }] as ReceiptItem[],
    total: 0,
    dueTotal: 0,
    gstPercentage: null as number | null,
    gstAmount: 0,
  });

  const [paymentDetails, setPaymentDetails] = useState<{
    phoneNumber?: string;
    phoneCountryCode?: string;
  }>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const initialize = async () => {
      const userJSON = localStorage.getItem("currentUser");
      if (!userJSON) {
        router.push("/login");
        return;
      }

      const userData = JSON.parse(userJSON);

      try {
        const profileRes = await fetch("/api/profile", {
          headers: { Authorization: `Bearer ${userData.token}` },
        });
        if (!profileRes.ok) throw new Error("Failed to fetch profile");
        const profile = await profileRes.json();

        if (!profile.isProfileComplete) {
          router.push("/profile?from=/create");
          return;
        }

        const receiptRes = await fetch("/api/receipts/next-number", {
          headers: { Authorization: `Bearer ${userData.token}` },
        });
        if (!receiptRes.ok) throw new Error("Failed to generate receipt number");
        const { receiptNumber } = await receiptRes.json();

        setReceiptData((prev) => ({ ...prev, receiptNumber }));
        setUser(profile);
      } catch (error: unknown) {
        console.error("Initialization error:", error);
        setErrors({ form: error instanceof Error ? error.message : "Initialization failed" });
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [router]);

  const generateReceiptNumber = async (token: string) => {
    try {
      const response = await fetch(
        `/api/receipts/next-number`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch last receipt number");

      const data = await response.json();
      setReceiptData((prev) => ({ ...prev, receiptNumber: data.receiptNumber }));
    } catch (error) {
      console.error("Error generating receipt number:", error);
      const timestamp = Date.now().toString().slice(-4);
      setReceiptData((prev) => ({
        ...prev,
        receiptNumber: `REC-${timestamp}`,
      }));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const subtotal = receiptData.items.reduce(
      (sum, item) => sum + 
        (typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 0) * 
        (typeof item.price === 'number' && !isNaN(item.price) ? item.price : 0),
      0
    );
    
    // Ensure gstPercentage is a valid number before calculation
    const effectiveGstPercentage = typeof receiptData.gstPercentage === 'number' && !isNaN(receiptData.gstPercentage)
      ? receiptData.gstPercentage
      : 0;

    const gstAmount = (subtotal * effectiveGstPercentage) / 100;

    const total = subtotal + gstAmount;
    let dueTotal = 0;

    if (receiptData.paymentStatus === "advance") {
      dueTotal =
        total -
        receiptData.items.reduce(
          (sum, item) => sum + (typeof item.advanceAmount === 'number' && !isNaN(item.advanceAmount) ? item.advanceAmount : 0),
          0
        );
    } else if (receiptData.paymentStatus === "due") {
      dueTotal = receiptData.items.reduce(
        (sum, item) => sum + (typeof item.dueAmount === 'number' && !isNaN(item.dueAmount) ? item.dueAmount : 0),
        0
      );
    }

    setReceiptData((prev) => ({ ...prev, total, gstAmount, dueTotal }));
  }, [receiptData.items, receiptData.paymentStatus, receiptData.gstPercentage]);

  const addItem = () => {
    setReceiptData((prev) => ({
      ...prev,
      items: [...prev.items, { description: "", quantity: 0, price: 0 }],
    }));
  };

  const removeItem = (index: number) => {
    if (receiptData.items.length <= 1) return;

    setReceiptData((prev) => {
      const newItems = [...prev.items];
      newItems.splice(index, 1);
      return { ...prev, items: newItems };
    });
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    setReceiptData((prev) => {
      const newItems = [...prev.items];
      const parsedValue =
        typeof value === "string"
          ? field === "description"
            ? value
            : field === "quantity"
            ? value === ""
              ? 0
              : Math.max(parseInt(value) || 0, 0)
            : value === ""
            ? 0
            : parseFloat(value) || 0
          : value;
      newItems[index] = { ...newItems[index], [field]: parsedValue };
      return { ...prev, items: newItems };
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setReceiptData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhoneChange = (value: string, countryCode: string) => {
    setReceiptData((prev) => ({
      ...prev,
      customerContact: value,
      customerCountryCode: countryCode,
    }));
  };

  const handlePaymentPhoneChange = (value: string, countryCode: string) => {
    setPaymentDetails((prev) => ({
      ...prev,
      phoneNumber: value,
      phoneCountryCode: countryCode,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const userJSON = localStorage.getItem("currentUser");
    if (!userJSON) {
      router.push("/login");
      return;
    }
    const user = JSON.parse(userJSON);

    if (!user?.token) {
      setErrors({ form: "Session expired. Please login again." });
      return;
    }

    if (!user) {
      router.push("/login");
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const validation = ReceiptSchema.safeParse({
        ...receiptData,
        paymentDetails:
          Object.keys(paymentDetails).length > 0 ? paymentDetails : undefined,
      });

      if (!validation.success) {
        const validationErrors: Record<string, string> = {};
        validation.error.errors.forEach((err) => {
          const path = err.path.join(".");
          validationErrors[path] = err.message;
        });
        setErrors(validationErrors);
        return;
      }

      if (
        receiptData.paymentType === "online" &&
        (!paymentDetails.phoneNumber ||
          paymentDetails.phoneNumber.length !== 10)
      ) {
        setErrors((prev) => ({
          ...prev,
          "paymentDetails.phoneNumber":
            "Invalid phone number (must be 10 digits)",
        }));
        return;
      }

      const requestBody = {
        receiptNumber: receiptData.receiptNumber,
        date: receiptData.date,
        customerName: receiptData.customerName,
        customerContact: receiptData.customerContact,
        customerCountryCode: receiptData.customerCountryCode,
        paymentType: receiptData.paymentStatus === "due" ? "cash" : receiptData.paymentType,
        paymentStatus: receiptData.paymentStatus,
        paymentDate: receiptData.paymentDate,
        notes: receiptData.notes || undefined,
        total: receiptData.total,
        dueTotal: receiptData.dueTotal,
        items: receiptData.items,
        paymentDetails:
          Object.keys(paymentDetails).length > 0 ? paymentDetails : undefined,
        gstPercentage: receiptData.gstPercentage || undefined,
        gstAmount: receiptData.gstAmount || undefined,
      };

      const response = await fetch("/api/receipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create receipt");
      }

      const result = await response.json();
      router.push(`/receipts/${result.receiptId}`);
    } catch (error: unknown) {
      setErrors((prev) => ({ ...prev, form: error instanceof Error ? error.message : "An unexpected error occurred." }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-start mb-6">
        <Link href="/accounts">
          <Button
            variant="outline"
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
        </Link>
      </div>

      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl">Create Receipt</CardTitle>
        </CardHeader>
        <CardContent>
          {errors.form && (
            <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-md">
              {errors.form}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="receiptNumber">Receipt Number</Label>
                <Input
                  id="receiptNumber"
                  name="receiptNumber"
                  value={receiptData.receiptNumber}
                  readOnly
                  className="bg-gray-50"
                />
                {errors.receiptNumber && (
                  <div className="text-xs text-red-500">{errors.receiptNumber}</div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  value={receiptData.date}
                  onChange={handleChange}
                  required
                />
                {errors.date && (
                  <div className="text-xs text-red-500">{errors.date}</div>
                )}
              </div>

              {receiptData.paymentStatus !== "due" && (
                <div className="space-y-2">
                  <Label htmlFor="gstPercentage">GST Percentage</Label>
                  <Select
                    value={receiptData.gstPercentage ? receiptData.gstPercentage.toString() : "none"}
                    onValueChange={(value) => {
                      const percentage = value === "none" ? null : parseInt(value);
                      setReceiptData(prev => ({
                        ...prev,
                        gstPercentage: percentage,
                        gstAmount: percentage ? (prev.total * percentage) / 100 : 0
                      }));
                    }}
                  >
                    <SelectTrigger id="gstPercentage">
                      <SelectValue placeholder="No GST" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No GST</SelectItem>
                      <SelectItem value="5">5%</SelectItem>
                      <SelectItem value="12">12%</SelectItem>
                      <SelectItem value="18">18%</SelectItem>
                      <SelectItem value="28">28%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {receiptData.paymentStatus !== "due" && (
                <div className="space-y-2">
                  <Label htmlFor="paymentType">Payment Type</Label>
                  <Select
                    value={receiptData.paymentType}
                    onValueChange={(value) =>
                      setReceiptData((prev) => ({
                        ...prev,
                        paymentType: value as "cash" | "online",
                      }))
                    }
                    required
                  >
                    <SelectTrigger id="paymentType">
                      <SelectValue placeholder="Select payment type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="paymentStatus">Payment Status</Label>
                <Select
                    value={receiptData.paymentStatus}
                    onValueChange={(value) => {
                      const newStatus = value as "full" | "advance" | "due";
                      setReceiptData((prev) => ({
                        ...prev,
                        paymentStatus: newStatus,
                        paymentType: newStatus === "due" ? "cash" : prev.paymentType,
                        gstPercentage: newStatus === "due" ? null : prev.gstPercentage,
                        gstAmount: newStatus === "due" ? 0 : prev.gstAmount,
                        paymentDate: newStatus === "due" ? format(new Date(), "yyyy-MM-dd") : prev.paymentDate
                      }));
                    }}
                    required
                  >
                    <SelectTrigger id="paymentStatus">
                      <SelectValue placeholder="Select payment status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full Payment</SelectItem>
                      <SelectItem value="advance">Advance Payment</SelectItem>
                      <SelectItem value="due">Due Payment</SelectItem>
                    </SelectContent>
                  </Select>
              </div>

              {receiptData.paymentStatus === "due" && (
                <div className="space-y-2">
                  <Label htmlFor="paymentDate">Expected Payment Date</Label>
                  <Input
                    id="paymentDate"
                    name="paymentDate"
                    type="date"
                    value={receiptData.paymentDate}
                    onChange={handleChange}
                    min={format(new Date(), "yyyy-MM-dd")}
                    required
                  />
                  {errors.paymentDate && (
                    <div className="text-xs text-red-500">{errors.paymentDate}</div>
                  )}
                </div>
              )}
            </div>

            {receiptData.paymentType === "online" && receiptData.paymentStatus !== "due" && (
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <PhoneInput
                  value={paymentDetails.phoneNumber || ""}
                  countryCode={paymentDetails.phoneCountryCode || "+91"}
                  onChange={handlePaymentPhoneChange}
                  placeholder="Enter phone number"
                />
                {errors["paymentDetails.phoneNumber"] && (
                  <div className="text-xs text-red-500">
                    {errors["paymentDetails.phoneNumber"]}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name</Label>
              <Input
                id="customerName"
                name="customerName"
                value={receiptData.customerName}
                onChange={handleChange}
                placeholder="Enter customer name"
                required
              />
              {errors.customerName && (
                <div className="text-xs text-red-500">{errors.customerName}</div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerContact">Customer Contact</Label>
              <PhoneInput
                value={receiptData.customerContact}
                countryCode={receiptData.customerCountryCode}
                onChange={handlePhoneChange}
                placeholder="Enter customer phone number"
              />
              {errors.customerContact && (
                <div className="text-xs text-red-500">{errors.customerContact}</div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Items</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Item
                </Button>
              </div>

              {receiptData.items.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
                >
                  <div className="md:col-span-5 space-y-2">
                    <Label htmlFor={`item-${index}-description`}>
                      Description
                    </Label>
                    <Input
                      id={`item-${index}-description`}
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        updateItem(index, "description", e.target.value)
                      }
                      placeholder="Item description"
                      required
                    />
                    {errors[`items.${index}.description`] && (
                      <div className="text-xs text-red-500">
                        {errors[`items.${index}.description`]}
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor={`item-${index}-quantity`}>Quantity</Label>
                    <Input
                      id={`item-${index}-quantity`}
                      type="number"
                      min="1"
                      value={item.quantity === 0 ? "" : item.quantity}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        updateItem(index, "quantity", isNaN(value) ? 0 : Math.max(value, 0));
                      }}
                      required
                      onKeyDown={(e) => {
                        if (e.key === "-" || e.key === "e") e.preventDefault();
                      }}
                    />
                    {errors[`items.${index}.quantity`] && (
                      <div className="text-xs text-red-500">
                        {errors[`items.${index}.quantity`]}
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor={`item-${index}-price`}>Price</Label>
                    <Input
                      id={`item-${index}-price`}
                      type="number"
                      min="0"
                      step="1"
                      value={item.price === 0 ? "" : item.price}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        updateItem(index, "price", isNaN(value) ? 0 : Math.max(value, 0));
                      }}
                      required
                      onKeyDown={(e) => {
                        if (e.key === "-") e.preventDefault();
                      }}
                    />
                    {errors[`items.${index}.price`] && (
                      <div className="text-xs text-red-500">
                        {errors[`items.${index}.price`]}
                      </div>
                    )}
                  </div>

                  {receiptData.paymentStatus === "advance" && (
                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor={`item-${index}-advance`}>
                        Advance Amount
                      </Label>
                      <Input
                        id={`item-${index}-advance`}
                        type="number"
                        min="0"
                        max={item.quantity * item.price}
                        step="0.01"
                        value={item.advanceAmount || ""}
                        onChange={(e) =>
                          updateItem(index, "advanceAmount", e.target.value)
                        }
                      />
                      {errors[`items.${index}.advanceAmount`] && (
                        <div className="text-xs text-red-500">
                          {errors[`items.${index}.advanceAmount`]}
                        </div>
                      )}
                    </div>
                  )}

                  {receiptData.paymentStatus === "due" && (
                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor={`item-${index}-due`}>Due Amount</Label>
                      <Input
                        id={`item-${index}-due`}
                        type="number"
                        min="0"
                        max={item.quantity * item.price}
                        step="0.01"
                        value={item.dueAmount || ""}
                        onChange={(e) =>
                          updateItem(index, "dueAmount", e.target.value)
                        }
                      />
                      {errors[`items.${index}.dueAmount`] && (
                        <div className="text-xs text-red-500">
                          {errors[`items.${index}.dueAmount`]}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="md:col-span-1 flex justify-end">
                    {receiptData.items.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex justify-end gap-4 mt-4">
                {receiptData.gstPercentage && receiptData.paymentStatus !== "due" && (
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Subtotal</div>
                    <div className="text-lg">
                      ₹{(receiptData.total - receiptData.gstAmount).toFixed(2)}
                    </div>
                  </div>
                )}
                
                {receiptData.gstPercentage && receiptData.paymentStatus !== "due" && (
                  <div className="text-right">
                    <div className="text-sm text-gray-500">GST ({receiptData.gstPercentage}%)</div>
                    <div className="text-lg">
                      ₹{receiptData.gstAmount.toFixed(2)}
                    </div>
                  </div>
                )}

                <div className="text-right">
                  <div className="text-sm text-gray-500">Total</div>
                  <div className="text-xl font-bold">
                    ₹{receiptData.total.toFixed(2)}
                  </div>
                </div>

                {(receiptData.paymentStatus === "advance" ||
                  receiptData.paymentStatus === "due") && (
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Due Amount</div>
                    <div className="text-xl font-bold text-red-500">
                      ₹{receiptData.dueTotal.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                value={receiptData.notes}
                onChange={handleChange}
                placeholder="Additional notes or information"
                rows={3}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Receipt"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}