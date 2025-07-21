//T

import { CALCULATION_CONSTANTS, TOKEN_STANDARDS } from '@/lib/constants';

/**
 * Shorten a Solana address for display
 * @param {string} address - Full Solana address
 * @param {number} chars - Number of characters to show on each side
 * @returns {string} Shortened address
 */
export function shortenAddress(address, chars = 4) {
  if (!address) return '';
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Format a number with commas and decimals
 * @param {number} num - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted number
 */
export function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Format token amount with appropriate decimals
 * @param {number} amount - Token amount
 * @param {string} symbol - Token symbol
 * @returns {string} Formatted amount with symbol
 */
export function formatTokenAmount(amount, symbol = '') {
  if (!amount || amount === 0) return `0 ${symbol}`.trim();
  
  let formatted;
  if (amount < 0.0001) {
    formatted = '<0.0001';
  } else if (amount < 1) {
    formatted = formatNumber(amount, 4);
  } else if (amount < 1000) {
    formatted = formatNumber(amount, 2);
  } else {
    formatted = formatNumber(amount, 0);
  }
  
  return `${formatted} ${symbol}`.trim();
}

/**
 * Format USD amount
 * @param {number} amount - USD amount
 * @returns {string} Formatted USD amount
 */
export function formatUSD(amount) {
  if (!amount || amount === 0) return '$0.00';
  
  if (amount < 0.01) {
    return '<$0.01';
  } else if (amount < 1) {
    return `$${formatNumber(amount, 4)}`;
  } else {
    return `$${formatNumber(amount, 2)}`;
  }
}

/**
 * Format percentage
 * @param {number} value - Percentage value
 * @param {boolean} showSign - Whether to show + sign for positive
 * @returns {string} Formatted percentage
 */
export function formatPercentage(value, showSign = false) {
  if (!value || value === 0) return '0%';
  
  const formatted = formatNumber(Math.abs(value), 2);
  const sign = value > 0 && showSign ? '+' : value < 0 ? '-' : '';
  
  return `${sign}${formatted}%`;
}

/**
 * Format price with appropriate decimals
 * @param {number} price - Price value
 * @returns {string} Formatted price
 */
export function formatPrice(price) {
  if (!price || price === 0) return '$0.000000';
  
  if (price < 0.000001) {
    return '<$0.000001';
  } else if (price < 0.01) {
    return `$${formatNumber(price, 6)}`;
  } else if (price < 1) {
    return `$${formatNumber(price, 4)}`;
  } else {
    return `$${formatNumber(price, 2)}`;
  }
}

/**
 * Format SOL amount
 * @param {number} lamports - Amount in lamports
 * @returns {string} Formatted SOL amount
 */
export function formatSOL(lamports) {
  const sol = lamports / CALCULATION_CONSTANTS.LAMPORTS_PER_SOL;
  return `${formatNumber(sol, 4)} SOL`;
}

/**
 * Format transaction signature for display
 * @param {string} signature - Transaction signature
 * @returns {string} Shortened signature
 */
export function formatTransactionSignature(signature) {
  return shortenAddress(signature, 6);
}

/**
 * Format time remaining
 * @param {number} seconds - Seconds remaining
 * @returns {string} Formatted time
 */
export function formatTimeRemaining(seconds) {
  if (seconds <= 0) return 'Expired';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Format basis points to percentage
 * @param {number} basisPoints - Value in basis points
 * @returns {string} Formatted percentage
 */
export function formatBasisPoints(basisPoints) {
  const percentage = basisPoints / 100;
  return formatPercentage(percentage);
}

/**
 * Get explorer link for address
 * @param {string} address - Solana address
 * @param {string} type - Type of address (address, tx, token)
 * @returns {string} Explorer URL
 */
export function getExplorerLink(address, type = 'address') {
  const cluster = 'devnet'; // Change for mainnet
  const baseUrl = 'https://solscan.io';
  
  switch (type) {
    case 'tx':
      return `${baseUrl}/tx/${address}?cluster=${cluster}`;
    case 'token':
      return `${baseUrl}/token/${address}?cluster=${cluster}`;
    default:
      return `${baseUrl}/account/${address}?cluster=${cluster}`;
  }
}

/**
 * Format pool status
 * @param {Object} pool - Pool data
 * @returns {Object} Status text and color
 */
export function formatPoolStatus(pool) {
  if (pool.isRaydiumInitialized) {
    return { text: 'Live on Raydium', color: 'blue' };
  } else if (pool.isFinalized) {
    return { text: 'Finalized', color: 'yellow' };
  } else if (pool.isComplete) {
    return { text: 'Complete', color: 'green' };
  } else {
    return { text: 'Active', color: 'orange' };
  }
}

/**
 * Format error message for display
 * @param {Error|string} error - Error object or message
 * @returns {string} User-friendly error message
 */
export function formatErrorMessage(error) {
  if (typeof error === 'string') return error;
  
  // Check for common Solana errors
  if (error.message?.includes('insufficient')) {
    return 'Insufficient balance for this transaction';
  } else if (error.message?.includes('0x1771')) {
    return 'Insufficient liquidity in the pool';
  } else if (error.message?.includes('0x1787')) {
    return 'Wallet limit exceeded';
  } else if (error.message?.includes('0x1786')) {
    return 'Global price limit exceeded';
  } else if (error.message?.includes('User rejected')) {
    return 'Transaction cancelled by user';
  }
  
  return error.message || 'An unexpected error occurred';
}