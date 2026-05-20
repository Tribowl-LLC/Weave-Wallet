import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Html5Qrcode } from "html5-qrcode";
import { X, Keyboard, Loader2 } from "lucide-react";
import { useWalletStore } from "@/store/wallet";
import { decodeInvoice } from "@/lib/lightning";
import { getFiberClient } from "@/lib/fiber/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function Scan() {
  const [, setLocation] = useLocation();
  const { setPendingInvoice, unlocked, selectedAsset } = useWalletStore();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualInvoice, setManualInvoice] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!unlocked) {
      setLocation("/");
      return;
    }

    const startScanner = async () => {
      try {
        scannerRef.current = new Html5Qrcode("reader");
        await scannerRef.current.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            handleInvoice(decodedText);
          },
          (errorMessage) => {
            // Ignore normal read errors
          }
        );
      } catch (err: any) {
        console.error("Scanner start error:", err);
        setError("Camera access denied or not available. Please paste invoice manually.");
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [unlocked, setLocation]);

  const handleInvoice = async (text: string) => {
    if (isProcessing) return;
    setIsProcessing(true);

    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop().catch(console.error);
    }

    const decoded = decodeInvoice(text);
    
    if (decoded.error) {
      toast.error(decoded.error);
      setIsProcessing(false);
      // Restart scanner if invalid
      if (scannerRef.current && !isManualOpen) {
        try {
          await scannerRef.current.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            handleInvoice,
            undefined
          );
        } catch (e) {}
      }
      return;
    }

    setLoadingMsg("Preparing payment...");
    
    try {
      const client = getFiberClient();
      const fiberInvoice = await client.createInvoiceFromLightning({
        lightningInvoice: decoded.paymentRequest,
        amountMsat: decoded.amountMsat,
        description: decoded.description,
        asset: selectedAsset,
      });

      setPendingInvoice({
        lightning: {
          paymentRequest: decoded.paymentRequest,
          amountMsat: decoded.amountMsat,
          description: decoded.description,
          paymentHash: decoded.paymentHash
        },
        fiber: fiberInvoice
      });
      
      setLocation("/confirm");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to prepare payment");
      setIsProcessing(false);
      setLoadingMsg(null);
      if (scannerRef.current && !isManualOpen) {
        try {
          await scannerRef.current.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            handleInvoice,
            undefined
          );
        } catch (e) {}
      }
    }
  };

  const handleManualSubmit = () => {
    if (!manualInvoice.trim()) return;
    handleInvoice(manualInvoice.trim());
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      <div className="absolute top-0 left-0 right-0 p-6 z-20 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <button 
          onClick={() => setLocation("/home")}
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-white/70">
            {error}
          </div>
        ) : loadingMsg ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white z-30 bg-black/60 backdrop-blur-sm">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <p className="font-medium text-lg">{loadingMsg}</p>
          </div>
        ) : (
          <>
            <div id="reader" className="absolute inset-0 object-cover w-full h-full" />
            
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
              <div className="w-[250px] h-[250px] border-2 border-primary/50 rounded-3xl relative overflow-hidden">
                <motion.div 
                  animate={{ y: ["0%", "100%", "0%"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  className="w-full h-1 bg-primary shadow-[0_0_10px_rgba(22,201,83,1)]"
                />
              </div>
              <p className="text-white font-medium mt-8 text-center px-6">
                Point at any Lightning invoice QR
              </p>
            </div>
          </>
        )}
      </div>

      <div className="p-8 bg-gradient-to-t from-black via-black/90 to-transparent absolute bottom-0 left-0 right-0 z-20">
        <Dialog open={isManualOpen} onOpenChange={setIsManualOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" className="w-full text-white/80 hover:text-white hover:bg-white/10 rounded-xl h-14">
              <Keyboard className="w-5 h-5 mr-2" />
              Paste invoice manually
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-card border-border/50">
            <DialogHeader>
              <DialogTitle>Paste Lightning Invoice</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Textarea 
                placeholder="lnbc1..." 
                className="min-h-[120px] font-mono text-sm resize-none focus-visible:ring-primary"
                value={manualInvoice}
                onChange={(e) => setManualInvoice(e.target.value)}
              />
            </div>
            <Button 
              onClick={handleManualSubmit} 
              className="w-full h-12 rounded-xl text-md"
              disabled={!manualInvoice.trim() || isProcessing}
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Decode Invoice"}
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </motion.div>
  );
}
