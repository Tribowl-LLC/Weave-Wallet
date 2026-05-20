import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Fingerprint, Wallet } from "lucide-react";
import { useWalletStore } from "@/store/wallet";
import { registerPasskey, authenticatePasskey, isBiometricsAvailable } from "@/lib/passkey";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function SplashAuth() {
  const [, setLocation] = useLocation();
  const { credentialId, unlocked, setCredential, setUnlocked } = useWalletStore();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (credentialId && unlocked) {
      setLocation("/home");
    }
  }, [credentialId, unlocked, setLocation]);

  const handleCreateWallet = async () => {
    setIsLoading(true);
    try {
      const userHandle = crypto.randomUUID();
      const newCredentialId = await registerPasskey(userHandle);
      setCredential(newCredentialId, userHandle);
      setUnlocked(true);
      toast.success("Wallet created securely");
      setLocation("/home");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to create wallet");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnlockWallet = async () => {
    if (!credentialId) return;
    setIsLoading(true);
    try {
      await authenticatePasskey(credentialId);
      setUnlocked(true);
      setLocation("/home");
    } catch (err: any) {
      console.error(err);
      toast.error("Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoMode = () => {
    setUnlocked(true);
    setLocation("/home");
  };

  const biometricsAvailable = isBiometricsAvailable();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-screen flex flex-col items-center justify-center p-6 bg-background relative overflow-hidden"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm z-10">
        <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mb-8 border border-primary/20 shadow-[0_0_40px_rgba(22,201,83,0.2)]">
          <Wallet className="w-10 h-10 text-primary" />
        </div>
        
        <h1 className="text-3xl font-bold tracking-tight mb-2">FiberPay</h1>
        <p className="text-muted-foreground text-center mb-12">
          Pay any Lightning invoice with Fiber stablecoins — using your own Fiber node.
        </p>

        {!biometricsAvailable ? (
          <div className="w-full space-y-4">
            <div className="p-4 bg-muted/50 rounded-2xl border text-center text-sm text-muted-foreground">
              Biometrics not available on this device.
            </div>
            <Button 
              size="lg" 
              className="w-full h-14 rounded-2xl text-lg font-medium" 
              onClick={handleDemoMode}
            >
              Continue in demo mode
            </Button>
          </div>
        ) : !credentialId ? (
          <Button 
            size="lg" 
            className="w-full h-14 rounded-2xl text-lg font-medium flex items-center gap-3" 
            onClick={handleCreateWallet}
            disabled={isLoading}
          >
            <Fingerprint className="w-5 h-5" />
            {isLoading ? "Creating..." : "Create your wallet"}
          </Button>
        ) : (
          <Button 
            size="lg" 
            className="w-full h-14 rounded-2xl text-lg font-medium flex items-center gap-3" 
            onClick={handleUnlockWallet}
            disabled={isLoading}
          >
            <Fingerprint className="w-5 h-5" />
            {isLoading ? "Authenticating..." : "Unlock with Face ID"}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
