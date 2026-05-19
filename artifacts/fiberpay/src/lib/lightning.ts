import bolt11 from 'bolt11';

export interface DecodedInvoice {
  paymentRequest: string;
  amountMsat: number;
  description?: string;
  error?: string;
}

export function decodeInvoice(paymentRequest: string): DecodedInvoice {
  try {
    // Strip prefixes like lightning: if present
    const cleanRequest = paymentRequest.replace(/^lightning:/i, '').trim();
    
    if (!cleanRequest.toLowerCase().startsWith('lnbc') && !cleanRequest.toLowerCase().startsWith('lntb')) {
      return {
        paymentRequest,
        amountMsat: 0,
        error: "Invalid Lightning invoice format."
      };
    }

    const decoded = bolt11.decode(cleanRequest);
    
    // amount is in satoshis or millisatoshis based on millisatoshis string
    const amountMsatStr = decoded.millisatoshis;
    let amountMsat = 0;
    
    if (amountMsatStr) {
      amountMsat = parseInt(amountMsatStr, 10);
    } else {
      return {
        paymentRequest,
        amountMsat: 0,
        error: "Invoice does not specify an amount."
      };
    }

    let description = "Lightning Payment";
    
    const descTag = decoded.tags.find((t: any) => t.tagName === 'description');
    if (descTag && descTag.data) {
      description = descTag.data as string;
    }

    return {
      paymentRequest: cleanRequest,
      amountMsat,
      description
    };
  } catch (error: any) {
    return {
      paymentRequest,
      amountMsat: 0,
      error: error.message || "Failed to decode invoice"
    };
  }
}

// Fixed exchange rate for demo purposes: 1 BTC = $110,000
export const MSAT_TO_USD_RATE = 110000 / 100000000000;

export function formatUsd(msat: number): string {
  const usd = msat * MSAT_TO_USD_RATE;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(usd);
}
