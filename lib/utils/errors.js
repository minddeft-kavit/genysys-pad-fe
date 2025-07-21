//T

import { ERROR_MESSAGES } from '@/lib/constants';
import toast from 'react-hot-toast';

/**
 * Parse Anchor/Solana program errors
 * @param {Error} error - Error from transaction
 * @returns {string} User-friendly error message
 */
export function parseProgramError(error) {
  if (!error) return ERROR_MESSAGES.TRANSACTION_FAILED;
  
  const errorString = error.toString();
  const errorMessage = error.message || errorString;
  
  // Check for custom program errors (from error.rs)
  const errorMap = {
    'OwnerAlreadySet': 'Owner has already been set',
    'Unauthorized': ERROR_MESSAGES.UNAUTHORIZED,
    'NoStableCoins': 'No stable coins provided',
    'CoinNotFound': 'Stable coin not found',
    'TokenAlreadyMinted': 'Token has already been minted',
    'InvalidTax': 'Invalid tax value (must be 0-100%)',
    'NoCreator': 'No creator specified',
    'InvalidRouter': 'Invalid DEX router selected',
    'UnsupportedStableCoin': 'Unsupported stable coin',
    'InvalidAmount': ERROR_MESSAGES.INVALID_AMOUNT,
    'InsufficientLiquidity': ERROR_MESSAGES.INSUFFICIENT_LIQUIDITY,
    'MathOverflow': 'Mathematical overflow occurred',
    'GlobalLimitExceeded': ERROR_MESSAGES.GLOBAL_LIMIT_EXCEEDED,
    'WalletLimitExceeded': ERROR_MESSAGES.WALLET_LIMIT_EXCEEDED,
    'PoolNotComplete': 'Pool is not complete yet',
    'PoolAlreadyFinalized': 'Pool has already been finalized',
    'NoTokensToAdd': 'No tokens available to add',
    'UnsupportedDex': 'Unsupported DEX',
    'PoolClosed': 'Pool is closed for trading',
    'InsufficientOutputAmount': 'Output amount too low',
    'PriceLimitExceeded': 'Price limit exceeded',
    'InsufficientTokens': 'Insufficient token balance',
    'TooManyReceivers': 'Too many tax receivers',
    'InvalidPercentages': 'Invalid percentage values',
    'PoolNotClosed': 'Pool is not closed yet',
    'NoLockedTokens': 'No locked tokens found',
    'NoTaxToDistribute': 'No tax available to distribute',
    'BundleAlreadyExecuted': 'Bundle buy already executed',
    'InvalidFee': 'Invalid fee amount',
    'PoolAlreadyActive': 'Pool is already active',
    'BundleNotExecuted': 'Bundle buy not executed yet',
    'InvalidRaydiumConfig': 'Invalid Raydium configuration',
    'RaydiumPoolCreationFailed': 'Failed to create Raydium pool',
    'RaydiumSwapFailed': 'Raydium swap failed',
    'InvalidFeeTier': 'Invalid fee tier selected',
    'TokenOrderingMismatch': 'Token ordering mismatch',
    'InsufficientLiquidityForPool': 'Insufficient liquidity for Raydium pool',
    'InvalidSqrtPrice': 'Invalid sqrt price',
    'PoolNotFinalized': 'Pool not finalized to DEX yet',
    'RaydiumAlreadyInitialized': 'Raydium pool already initialized',
    'RaydiumPoolNotCreated': 'Raydium pool not created',
  };
  
  // Check for error codes
  const errorCodeMatch = errorMessage.match(/0x[0-9a-fA-F]+/);
  if (errorCodeMatch) {
    const errorCode = errorCodeMatch[0];
    switch (errorCode) {
      case '0x1771': return ERROR_MESSAGES.INSUFFICIENT_LIQUIDITY;
      case '0x1786': return ERROR_MESSAGES.GLOBAL_LIMIT_EXCEEDED;
      case '0x1787': return ERROR_MESSAGES.WALLET_LIMIT_EXCEEDED;
      default: break;
    }
  }
  
  // Check for mapped errors
  for (const [key, value] of Object.entries(errorMap)) {
    if (errorMessage.includes(key)) {
      return value;
    }
  }
  
  // Check for common Solana errors
  if (errorMessage.includes('insufficient')) {
    return ERROR_MESSAGES.INSUFFICIENT_BALANCE;
  } else if (errorMessage.includes('User rejected')) {
    return 'Transaction cancelled';
  } else if (errorMessage.includes('Simulation failed')) {
    return 'Transaction simulation failed. Please try again.';
  } else if (errorMessage.includes('Blockhash not found')) {
    return 'Network error. Please try again.';
  }
  
  // Return original message if no mapping found
  return errorMessage.length > 100 
    ? ERROR_MESSAGES.TRANSACTION_FAILED 
    : errorMessage;
}

/**
 * Handle and display transaction error
 * @param {Error} error - Error object
 * @param {string} fallbackMessage - Fallback message if parsing fails
 */
export function handleTransactionError(error, fallbackMessage = null) {
  console.error('Transaction error:', error);
  
  const message = parseProgramError(error) || fallbackMessage || ERROR_MESSAGES.TRANSACTION_FAILED;
  toast.error(message);
  
  return message;
}

/**
 * Create a safe error handler for async functions
 * @param {Function} fn - Async function to wrap
 * @param {string} fallbackMessage - Fallback error message
 * @returns {Function} Wrapped function
 */
export function createSafeHandler(fn, fallbackMessage = null) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleTransactionError(error, fallbackMessage);
      throw error;
    }
  };
}

/**
 * Validate transaction simulation
 * @param {Connection} connection - Solana connection
 * @param {Transaction} transaction - Transaction to simulate
 * @returns {Promise<boolean>} True if simulation succeeds
 */
export async function validateTransaction(connection, transaction) {
  try {
    const simulation = await connection.simulateTransaction(transaction);
    
    if (simulation.value.err) {
      console.error('Simulation error:', simulation.value.err);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Failed to simulate transaction:', error);
    return false;
  }
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in ms
 * @returns {Promise} Result of function
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if user rejected
      if (error.message?.includes('User rejected')) {
        throw error;
      }
      
      // Wait before retrying
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}