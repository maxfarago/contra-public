// Log message formatting utilities
import { lamportsToSol } from "./numbers";

export const formatLogMessage = (
  message: string
): { formattedMessage: string; signature?: string; orderId?: string } => {
  // Extract signature
  const signatureMatch = message.match(/signature:\s*([A-Za-z0-9]{64,88})/i);
  
  // Extract order ID (UUID pattern)
  const orderIdMatch = message.match(/order\s+([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);

  let formattedMessage = message;
  
  // Remove signature from message
  if (signatureMatch) {
    formattedMessage = formattedMessage
      .replace(/\s*signature:\s*[A-Za-z0-9]{64,88}/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  
  // Remove order ID from message but keep the word "order"
  if (orderIdMatch) {
    formattedMessage = formattedMessage
      .replace(/\s+[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // Replace lamports with SOL amounts
  formattedMessage = formattedMessage.replace(/(\d+)\s+lamports/g, (_, lamportsStr) => {
    const lamports = parseInt(lamportsStr, 10);
    const sol = lamportsToSol(lamports);
    return `${sol.toFixed(6)} SOL`;
  });

  return {
    formattedMessage,
    signature: signatureMatch?.[1],
    orderId: orderIdMatch?.[1],
  };
};

/**
 * replace occurrences of "Order <orderId>:" with "Order <index>:"
 * orderIdToIndex should map order id strings to 1-based indices
 */
export const replaceOrderUuidWithIndex = (
  message: string,
  orderIdToIndex?: Record<string, number>
): string => {
  if (!orderIdToIndex || Object.keys(orderIdToIndex).length === 0)
    return message;

  let result = message;
  for (const [orderId, index] of Object.entries(orderIdToIndex)) {
    // perform a plain string replace for exact pattern "Order <id>:"
    const needle = `Order ${orderId}`;
    if (result.includes(needle)) {
      result = result.split(needle).join(`Order ${index}`);
    }
  }
  return result;
};

