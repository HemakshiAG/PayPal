"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  RotateCw,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";

interface PayPalButtonStyle {
  layout?: "vertical" | "horizontal";
  color?: "gold" | "blue" | "silver" | "white" | "black";
  shape?: "rect" | "pill";
  label?: "paypal" | "checkout" | "buynow" | "pay" | "installment";
  height?: number;
  tagline?: boolean;
}

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: {
        style?: PayPalButtonStyle;
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onError: (err: unknown) => void;
      }) => {
        render: (selector: string | HTMLElement) => Promise<void>;
        close?: () => Promise<void>;
      };
    };
  }
}

interface PayPalErrorBoundaryProps {
  children: React.ReactNode;
}

interface PayPalErrorBoundaryState {
  hasError: boolean;
}

function PayPalCredentialsAlertCard({
  subtitle,
}: {
  subtitle?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-400/50 bg-amber-950/75 px-3.5 py-2.5 text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.16)]"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-xs font-bold tracking-tight text-amber-100">
            PayPal Sandbox Credentials Pending — Check .env.local
          </p>
          {subtitle && (
            <p className="text-[11px] text-amber-200/85 leading-snug">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

class PayPalErrorBoundary extends React.Component<
  PayPalErrorBoundaryProps,
  PayPalErrorBoundaryState
> {
  constructor(props: PayPalErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): PayPalErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[PayPalErrorBoundary] Safe fallback triggered:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <PayPalCredentialsAlertCard subtitle="Live PayPal Buttons could not initialize safely. Check .env.local credentials." />
      );
    }
    return this.props.children;
  }
}

interface PayPalCheckoutButtonProps {
  milestoneId: string;
  transactionId: string;
  amount: number;
  currency: string;
  buttonHeight?: number;
  disabled?: boolean;
  onPaymentCompleted: (payload: {
    milestoneId: string;
    orderId: string;
    captureId: string;
    isSimulated: boolean;
  }) => void;
  onPaymentError?: (message: string) => void;
}

function PayPalCheckoutButtonInner({
  milestoneId,
  transactionId,
  amount,
  currency,
  buttonHeight = 38,
  disabled = false,
  onPaymentCompleted,
  onPaymentError,
}: PayPalCheckoutButtonProps) {
  const rawClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() || "";
  const hasRealPayPalKey = Boolean(
    rawClientId &&
      !rawClientId.includes("your-paypal") &&
      rawClientId.toLowerCase() !== "undefined"
  );

  const safeCurrency = (currency || "USD").toUpperCase();
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const currencySymbol = safeCurrency === "INR" ? "₹" : "$";
  const safeButtonHeight = Math.min(55, Math.max(25, Number(buttonHeight) || 38));

  const [isProcessing, setIsProcessing] = React.useState(false);
  const [sdkLoaded, setSdkLoaded] = React.useState(false);
  const [sdkInitFailed, setSdkInitFailed] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const shouldRenderLiveSdk = hasRealPayPalKey && !sdkInitFailed;

  // Load real PayPal JS SDK script when real client ID is configured
  React.useEffect(() => {
    if (!shouldRenderLiveSdk || disabled || typeof document === "undefined") {
      return;
    }

    try {
      const existingScript = document.querySelector(
        'script[data-pact-paypal-sdk="true"]'
      );
      if (existingScript) {
        if (window.paypal && typeof window.paypal.Buttons === "function") {
          const frame = requestAnimationFrame(() => setSdkLoaded(true));
          return () => cancelAnimationFrame(frame);
        }
        const handleLoad = () => setSdkLoaded(true);
        const handleErr = () => setSdkInitFailed(true);
        existingScript.addEventListener("load", handleLoad);
        existingScript.addEventListener("error", handleErr);
        return () => {
          existingScript.removeEventListener("load", handleLoad);
          existingScript.removeEventListener("error", handleErr);
        };
      }

      const script = document.createElement("script");
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
        rawClientId
      )}&currency=${encodeURIComponent(safeCurrency)}&enable-funding=paylater`;
      script.async = true;
      script.dataset.pactPaypalSdk = "true";
      script.onload = () => setSdkLoaded(true);
      script.onerror = () => {
        setSdkInitFailed(true);
      };
      document.body.appendChild(script);
    } catch {
      const frame = requestAnimationFrame(() => setSdkInitFailed(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [shouldRenderLiveSdk, rawClientId, safeCurrency, disabled]);

  // Render PayPal Smart Buttons once SDK is loaded
  React.useEffect(() => {
    if (
      !shouldRenderLiveSdk ||
      !sdkLoaded ||
      typeof window === "undefined" ||
      !window.paypal ||
      typeof window.paypal.Buttons !== "function" ||
      !containerRef.current ||
      disabled
    ) {
      return;
    }

    const el = containerRef.current;
    el.innerHTML = "";

    let buttons:
      | {
          render: (selector: string | HTMLElement) => Promise<void>;
          close?: () => Promise<void>;
        }
      | null = null;

    try {
      buttons = window.paypal.Buttons({
        style: {
          layout: "horizontal",
          color: "blue",
          shape: "rect",
          label: "paypal",
          height: safeButtonHeight,
        },
        createOrder: async () => {
          setLocalError(null);
          setIsProcessing(true);
          const res = await fetch("/api/payments/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ milestoneId, transactionId }),
          });
          const data = await res.json();
          if (!res.ok) {
            setIsProcessing(false);
            const msg = data.error || "Failed to initialize PayPal order";
            setLocalError(msg);
            onPaymentError?.(msg);
            throw new Error(msg);
          }
          return data.orderId;
        },
        onApprove: async (data) => {
          try {
            const capRes = await fetch("/api/payments/capture-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: data.orderID,
                milestoneId,
                transactionId,
              }),
            });
            const capData = await capRes.json();
            if (!capRes.ok) {
              throw new Error(capData.error || "PayPal server capture failed");
            }

            onPaymentCompleted({
              milestoneId,
              orderId: capData.orderId,
              captureId: capData.captureId,
              isSimulated: Boolean(capData.isSimulated),
            });
          } catch (err) {
            const msg =
              err instanceof Error
                ? err.message
                : "Payment verification failed";
            setLocalError(msg);
            onPaymentError?.(msg);
          } finally {
            setIsProcessing(false);
          }
        },
        onError: (err) => {
          console.error("PayPal SDK error:", err);
          setIsProcessing(false);
          const msg = "PayPal checkout window encountered an error.";
          setLocalError(msg);
          onPaymentError?.(msg);
        },
      });

      buttons.render(el).catch((err) => {
        console.error("PayPal Buttons render error:", err);
        setSdkInitFailed(true);
      });
    } catch (err) {
      console.error("PayPal Buttons init error:", err);
      const frame = requestAnimationFrame(() => setSdkInitFailed(true));
      return () => cancelAnimationFrame(frame);
    }

    return () => {
      if (buttons && typeof buttons.close === "function") {
        buttons.close().catch(() => {});
      }
    };
  }, [
    shouldRenderLiveSdk,
    sdkLoaded,
    milestoneId,
    transactionId,
    safeButtonHeight,
    disabled,
    onPaymentCompleted,
    onPaymentError,
  ]);

  // Dev Simulation Checkout Handler (when Sandbox API keys are missing/unavailable)
  const handleSimulatedCheckout = async () => {
    setLocalError(null);
    setIsProcessing(true);

    try {
      const createRes = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestoneId, transactionId }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createData.error || "Failed to create PayPal order");
      }

      await new Promise((resolve) => setTimeout(resolve, 600));

      const captureRes = await fetch("/api/payments/capture-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: createData.orderId,
          milestoneId,
          transactionId,
        }),
      });

      const captureData = await captureRes.json();
      if (!captureRes.ok) {
        throw new Error(captureData.error || "Failed to capture payment");
      }

      onPaymentCompleted({
        milestoneId,
        orderId: captureData.orderId,
        captureId: captureData.captureId,
        isSimulated: Boolean(captureData.isSimulated),
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to complete payment flow";
      setLocalError(msg);
      onPaymentError?.(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-2 w-full sm:w-auto">
      {shouldRenderLiveSdk ? (
        <div className="space-y-2">
          <div
            className={
              disabled ? "pointer-events-none opacity-45 select-none" : ""
            }
            aria-disabled={disabled}
          >
            <div ref={containerRef} className="min-w-[200px]" />
          </div>
          {!sdkLoaded && (
            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <RotateCw className="h-3 w-3 animate-spin" />
              Loading PayPal Checkout...
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <PayPalCredentialsAlertCard subtitle="Using server-verified Sandbox simulation flow below." />
          <Button
            type="button"
            size="sm"
            onClick={handleSimulatedCheckout}
            disabled={disabled || isProcessing}
            className="w-full sm:w-auto bg-[#0070ba] hover:bg-[#005ea6] disabled:bg-zinc-800 disabled:text-zinc-400 disabled:border-zinc-700 disabled:shadow-none disabled:cursor-not-allowed border border-sky-400/25 shadow-lg shadow-[#0070ba]/20 text-white font-semibold text-xs gap-2 cursor-pointer transition-all duration-200 active:scale-95"
          >
            {isProcessing ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CreditCard className="h-3.5 w-3.5" />
            )}
            <span>
              {isProcessing ? (
                "Verifying Server Capture..."
              ) : (
                <>
                  Release PayPal Milestone Payout{" "}
                  <span className="font-mono tabular-nums tracking-tight">
                    ({currencySymbol}
                    {safeAmount.toFixed(2)})
                  </span>
                </>
              )}
            </span>
          </Button>
          <div className="text-[10px] text-zinc-400 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-sky-400" />
            <span>Dev Sandbox Mode • Server-Verified Order & Capture Flow</span>
          </div>
        </div>
      )}

      {localError && (
        <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{localError}</span>
        </div>
      )}
    </div>
  );
}

export function PayPalCheckoutButton(props: PayPalCheckoutButtonProps) {
  return (
    <PayPalErrorBoundary>
      <PayPalCheckoutButtonInner {...props} />
    </PayPalErrorBoundary>
  );
}
