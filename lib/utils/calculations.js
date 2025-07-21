//T

// import { BN } from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { 
  TOKEN_STANDARDS, 
  FEES, 
  CALCULATION_CONSTANTS 
} from '@/lib/constants';
import { PublicKey } from '@solana/web3.js';
import BigNumber from 'bignumber.js';

/**
 * Calculate the current price of a token in the bonding curve
 * @param {Object} poolData - Pool account data from blockchain
 * @returns {number} Current price in USD
 */
export function calculateCurrentPrice(poolData) {
  try {
    if (!poolData) return 0;
    
    const totalStable = poolData.reserveStableMint.add(poolData.stableReserveVirtual);
    const totalToken = poolData.reserveProjectMint.add(poolData.tokenReserveVirtual);
    
    if (totalToken.eq(new BN(0))) return 0;
    
    // Price = totalStable / totalToken
    // Adjust for decimals: USDC has 6, Token has 9
    const stableWithDecimals = totalStable.mul(new BN(1000));
    const price = stableWithDecimals.div(totalToken);
    
    return price.toNumber() / 1000;
  } catch (error) {
    console.error('Error calculating price:', error);
    return 0;
  }
}

/**
 * Calculate tokens out for a given USDC input (buy)
 * @param {Object} poolData - Pool account data
 * @param {number} usdcAmount - Amount of USDC to spend
 * @param {Object} config - Config account data
 * @returns {Object} { tokensOut, priceImpact, fee }
 */
export function calculateBuyTokensOut(poolData, usdcAmount, config) {
  try {
    if (!poolData || !usdcAmount || usdcAmount <= 0) {
      return { tokensOut: 0, priceImpact: 0, fee: 0 };
    }
    
    // Apply trading fee
    const tradingFee = config?.tradingFee?.toNumber() || FEES.DEFAULT_TRADING_FEE;
    const feeAmount = usdcAmount * (tradingFee / TOKEN_STANDARDS.PERCENTAGE_BASIS_POINTS);
    const amountAfterFee = usdcAmount - feeAmount;
    
    // Get current reserves
    const totalStable = Number(poolData.reserveStableMint.toString()) / Math.pow(10, TOKEN_STANDARDS.USDC_DECIMALS) +
                       Number(poolData.stableReserveVirtual.toString()) / Math.pow(10, TOKEN_STANDARDS.USDC_DECIMALS);
    const totalToken = Number(poolData.reserveProjectMint.toString()) / Math.pow(10, TOKEN_STANDARDS.TOKEN_DECIMALS) +
                      Number(poolData.tokenReserveVirtual.toString()) / Math.pow(10, TOKEN_STANDARDS.TOKEN_DECIMALS);
    
    // Calculate constant product
    const k = totalStable * totalToken;
    
    // Calculate new reserves after swap
    const newStable = totalStable + amountAfterFee;
    const newToken = k / newStable;
    const tokensOut = totalToken - newToken;
    
    // Apply buy tax
    const buyTax = (poolData.params?.buyTax || 0) / TOKEN_STANDARDS.PERCENTAGE_BASIS_POINTS;
    const taxAmount = tokensOut * buyTax;
    const netTokensOut = tokensOut - taxAmount;
    
    // Calculate price impact
    const oldPrice = totalStable / totalToken;
    const newPrice = newStable / newToken;
    const priceImpact = ((newPrice - oldPrice) / oldPrice) * 100;
    
    return {
      tokensOut: netTokensOut,
      priceImpact: Math.abs(priceImpact),
      fee: feeAmount,
      tax: taxAmount
    };
  } catch (error) {
    console.error('Error calculating buy tokens:', error);
    return { tokensOut: 0, priceImpact: 0, fee: 0, tax: 0 };
  }
}

/**
 * Calculate USDC out for a given token input (sell)
 * @param {Object} poolData - Pool account data
 * @param {number} tokenAmount - Amount of tokens to sell
 * @param {Object} config - Config account data
 * @returns {Object} { usdcOut, priceImpact, fee }
 */
export function calculateSellUsdcOut(poolData, tokenAmount, config) {
  try {
    if (!poolData || !tokenAmount || tokenAmount <= 0) {
      return { usdcOut: 0, priceImpact: 0, fee: 0 };
    }
    
    // Apply sell tax first
    const sellTax = (poolData.params?.sellTax || 0) / TOKEN_STANDARDS.PERCENTAGE_BASIS_POINTS;
    const taxAmount = tokenAmount * sellTax;
    const amountAfterTax = tokenAmount - taxAmount;
    
    // Get current reserves
    const totalStable = Number(poolData.reserveStableMint.toString()) / Math.pow(10, TOKEN_STANDARDS.USDC_DECIMALS) +
                       Number(poolData.stableReserveVirtual.toString()) / Math.pow(10, TOKEN_STANDARDS.USDC_DECIMALS);
    const totalToken = Number(poolData.reserveProjectMint.toString()) / Math.pow(10, TOKEN_STANDARDS.TOKEN_DECIMALS) +
                      Number(poolData.tokenReserveVirtual.toString()) / Math.pow(10, TOKEN_STANDARDS.TOKEN_DECIMALS);
    
    // Calculate constant product
    const k = totalStable * totalToken;
    
    // Calculate new reserves after swap
    const newToken = totalToken + amountAfterTax;
    const newStable = k / newToken;
    const stableOut = totalStable - newStable;
    
    // Apply trading fee
    const tradingFee = config?.tradingFee?.toNumber() || FEES.DEFAULT_TRADING_FEE;
    const feeAmount = stableOut * (tradingFee / TOKEN_STANDARDS.PERCENTAGE_BASIS_POINTS);
    const netUsdcOut = stableOut - feeAmount;
    
    // Calculate price impact
    const oldPrice = totalStable / totalToken;
    const newPrice = newStable / newToken;
    const priceImpact = ((oldPrice - newPrice) / oldPrice) * 100;
    
    return {
      usdcOut: netUsdcOut,
      priceImpact: Math.abs(priceImpact),
      fee: feeAmount,
      tax: taxAmount
    };
  } catch (error) {
    console.error('Error calculating sell USDC:', error);
    return { usdcOut: 0, priceImpact: 0, fee: 0, tax: 0 };
  }
}

/**
 * Calculate pool progress percentage
 * @param {Object} poolData - Pool account data
 * @returns {number} Progress percentage (0-100)
 */
export function calculatePoolProgress(poolData) {
  try {
    if (!poolData || poolData.totalSellAmount.eq(new BN(0))) return 100;
    
    const sold = poolData.totalSellAmount.sub(poolData.reserveProjectMint);
    const progress = sold.mul(new BN(100)).div(poolData.totalSellAmount);
    
    return Math.min(progress.toNumber(), 100);
  } catch (error) {
    console.error('Error calculating progress:', error);
    return 0;
  }
}

/**
 * Convert BN to human readable number with decimals
 * @param {BN} bn - BN value
 * @param {number} decimals - Number of decimals
 * @returns {number} Human readable number
 */
// export function bnToNumber(bn, decimals) {
//   try {
//     if (!bn) return 0;
//     const divisor = new BN(10).pow(new BN(decimals));
//     const quotient = bn.div(divisor).toNumber();
//     const remainder = bn.mod(divisor).toNumber() / Math.pow(10, decimals);
//     return quotient + remainder;
//   } catch (error) {
//     console.error('Error converting BN:', error);
//     return 0;
//   }
// }
export function bnToNumber(bn, decimals) {
  if (!bn) return 0;
  return new BigNumber(bn.toString()).div(new BigNumber(10).pow(decimals)).toNumber();
}

/**
 * Convert human readable number to BN with decimals
 * @param {number} num - Human readable number
 * @param {number} decimals - Number of decimals
 * @returns {BN} BN value
 */
export function numberToBN(num, decimals) {
  try {
    const multiplier = Math.pow(10, decimals);
    return new BN(Math.floor(num * multiplier));
  } catch (error) {
    console.error('Error converting to BN:', error);
    return new BN(0);
  }
}

/**
 * Calculate the required SOL for rent exemption
 * @param {number} dataSize - Size of data in bytes
 * @returns {number} Required SOL
 */
export function calculateRentExemption(dataSize) {
  // Approximate calculation - in production, fetch from connection
  const RENT_PER_BYTE_YEAR = 0.00001; // Approximate
  const RENT_EXEMPTION_YEARS = 2;
  return dataSize * RENT_PER_BYTE_YEAR * RENT_EXEMPTION_YEARS;
}

/**
 * Check if a pool is live on Raydium
 * @param {Object} poolData - Pool account data
 * @returns {boolean} True if live on Raydium
 */
export function isPoolLiveOnRaydium(poolData) {
  return poolData.isFinalized && 
         poolData.raydiumPoolState && 
         !poolData.raydiumPoolState.equals(PublicKey.default);
}



/**
 * Calculate tokens out for a given USDC input (buy)
 * @param {Object} poolData - Pool account data
 * @param {number} usdcAmount - Amount of USDC to spend
 * @param {Object} config - Config account data
 * @returns {Object} { tokensOut, priceImpact, fee, tax, pricePerToken }
 */
// export function calculateBuyTokensOut(poolData, usdcAmount, config) {
//   try {
//     if (!poolData || !usdcAmount || usdcAmount <= 0) {
//       return { 
//         tokensOut: 0, 
//         priceImpact: 0, 
//         fee: 0, 
//         tax: 0,
//         pricePerToken: 0 
//       };
//     }
    
//     // Convert USDC amount to BN with 6 decimals
//     const amountInBN = new BN(Math.floor(usdcAmount * 1e6));
    
//     // Apply trading fee using BN arithmetic
//     const tradingFee = config?.tradingFee || new BN(FEES.DEFAULT_TRADING_FEE || 100);
//     const feeAmount = amountInBN.mul(tradingFee).div(new BN(10000));
//     const amountAfterFee = amountInBN.sub(feeAmount);
    
//     // Get current reserves as BN (DO NOT CONVERT TO NUMBER!)
//     const totalStable = poolData.reserveStableMint.add(poolData.stableReserveVirtual);
//     const totalToken = poolData.reserveProjectMint.add(poolData.tokenReserveVirtual);
    
//     // Calculate constant product using BN
//     const k = totalStable.mul(totalToken);
    
//     // Calculate new reserves after swap
//     const newStable = totalStable.add(amountAfterFee);
//     const newToken = k.div(newStable);
//     const projectOut = totalToken.sub(newToken);
    
//     // Apply buy tax
//     const buyTax = new BN(poolData.params?.buyTax || 0);
//     const taxAmount = projectOut.mul(buyTax).div(new BN(10000));
//     const netProjectOut = projectOut.sub(taxAmount);
    
//     // Calculate price impact
//     // For price calculations, we need to be careful with precision
//     // oldPrice = totalStable / totalToken
//     // newPrice = newStable / newToken
    
//     // To avoid precision loss, calculate price impact using cross multiplication
//     // priceImpact = (newPrice - oldPrice) / oldPrice * 100
//     // = ((newStable/newToken) - (totalStable/totalToken)) / (totalStable/totalToken) * 100
//     // = ((newStable * totalToken - totalStable * newToken) / (newToken * totalToken)) / (totalStable/totalToken) * 100
//     // = (newStable * totalToken - totalStable * newToken) / (totalStable * newToken) * 100
    
//     const numerator = newStable.mul(totalToken).sub(totalStable.mul(newToken));
//     const denominator = totalStable.mul(newToken);
    
//     // Convert to percentage (multiply by 10000 to keep 2 decimal places in BN)
//     let priceImpactBN = numerator.mul(new BN(10000)).div(denominator);
//     let priceImpact = priceImpactBN.toNumber() / 100; // Convert back to percentage
    
//     // Calculate price per token
//     // pricePerToken = usdcAmount / tokensOut
//     // To maintain precision: pricePerToken = (usdcAmount * 1e9) / netProjectOut
//     const pricePerTokenBN = new BN(Math.floor(usdcAmount * 1e9)).mul(new BN(1e6)).div(netProjectOut);
//     const pricePerToken = pricePerTokenBN.toNumber() / 1e6;
    
//     // Convert final values to human-readable numbers
//     const tokensOut = Number(netProjectOut.toString()) / 1e9;
//     const feeInUsdc = Number(feeAmount.toString()) / 1e6;
//     const taxInTokens = Number(taxAmount.toString()) / 1e9;
    
//     return {
//       tokensOut: tokensOut,
//       priceImpact: Math.abs(priceImpact),
//       fee: feeInUsdc,
//       tax: taxInTokens,
//       pricePerToken: pricePerToken
//     };
//   } catch (error) {
//     console.error('Error calculating buy tokens:', error);
//     return { 
//       tokensOut: 0, 
//       priceImpact: 0, 
//       fee: 0, 
//       tax: 0,
//       pricePerToken: 0 
//     };
//   }
// }

/**
 * Calculate USDC out for a given token input (sell)
 * @param {Object} poolData - Pool account data
 * @param {number} tokenAmount - Amount of tokens to sell
 * @param {Object} config - Config account data
 * @returns {Object} { usdcOut, priceImpact, fee, tax, pricePerToken }
 */
// export function calculateSellUsdcOut(poolData, tokenAmount, config) {
//   try {
//     if (!poolData || !tokenAmount || tokenAmount <= 0) {
//       return { 
//         usdcOut: 0, 
//         priceImpact: 0, 
//         fee: 0, 
//         tax: 0,
//         pricePerToken: 0 
//       };
//     }
    
//     // Convert token amount to BN with 9 decimals
//     const tokenAmountBN = new BN(Math.floor(tokenAmount * 1e9));
    
//     // Apply sell tax first
//     const sellTax = new BN(poolData.params?.sellTax || 0);
//     const taxAmount = tokenAmountBN.mul(sellTax).div(new BN(10000));
//     const amountAfterTax = tokenAmountBN.sub(taxAmount);
    
//     // Get current reserves as BN (DO NOT CONVERT TO NUMBER!)
//     const totalStable = poolData.reserveStableMint.add(poolData.stableReserveVirtual);
//     const totalToken = poolData.reserveProjectMint.add(poolData.tokenReserveVirtual);
    
//     // Calculate constant product using BN
//     const k = totalStable.mul(totalToken);
    
//     // Calculate new reserves after swap
//     const newToken = totalToken.add(amountAfterTax);
//     const newStable = k.div(newToken);
//     const stableOut = totalStable.sub(newStable);
    
//     // Apply trading fee
//     const tradingFee = config?.tradingFee || new BN(FEES.DEFAULT_TRADING_FEE || 100);
//     const feeAmount = stableOut.mul(tradingFee).div(new BN(10000));
//     const netStableOut = stableOut.sub(feeAmount);
    
//     // Calculate price impact using cross multiplication to avoid precision loss
//     const numerator = totalStable.mul(newToken).sub(newStable.mul(totalToken));
//     const denominator = newStable.mul(totalToken);
    
//     let priceImpactBN = numerator.mul(new BN(10000)).div(denominator);
//     let priceImpact = priceImpactBN.toNumber() / 100;
    
//     // Calculate price per token
//     const pricePerTokenBN = netStableOut.mul(new BN(1e9)).div(tokenAmountBN);
//     const pricePerToken = pricePerTokenBN.toNumber() / 1e6;
    
//     // Convert final values to human-readable numbers
//     const usdcOut = Number(netStableOut.toString()) / 1e6;
//     const feeInUsdc = Number(feeAmount.toString()) / 1e6;
//     const taxInTokens = Number(taxAmount.toString()) / 1e9;
    
//     return {
//       usdcOut: usdcOut,
//       priceImpact: Math.abs(priceImpact),
//       fee: feeInUsdc,
//       tax: taxInTokens,
//       pricePerToken: pricePerToken
//     };
//   } catch (error) {
//     console.error('Error calculating sell USDC:', error);
//     return { 
//       usdcOut: 0, 
//       priceImpact: 0, 
//       fee: 0, 
//       tax: 0,
//       pricePerToken: 0 
//     };
//   }
// }

/**
 * Calculate the current price of a token in the bonding curve
 * @param {Object} poolData - Pool account data from blockchain
 * @returns {number} Current price in USD
 */
// export function calculateCurrentPrice(poolData) {
//   try {
//     if (!poolData) return 0;
    
//     // Use BN arithmetic to maintain precision
//     const totalStable = poolData.reserveStableMint.add(poolData.stableReserveVirtual);
//     const totalToken = poolData.reserveProjectMint.add(poolData.tokenReserveVirtual);
    
//     if (totalToken.eq(new BN(0))) return 0;
    
//     // Price = totalStable / totalToken
//     // To maintain precision: price = (totalStable * 1e9) / (totalToken * 1e6)
//     // This gives us price with proper decimal precision
//     const priceBN = totalStable.mul(new BN(1e9)).div(totalToken);
//     const price = priceBN.toNumber() / 1e6;
    
//     return price;
//   } catch (error) {
//     console.error('Error calculating price:', error);
//     return 0;
//   }
// }

/**
 * Calculate pool progress percentage
 * @param {Object} poolData - Pool account data
 * @returns {number} Progress percentage (0-100)
 */
// export function calculatePoolProgress(poolData) {
//   try {
//     if (!poolData || poolData.totalSellAmount.eq(new BN(0))) return 100;
    
//     const sold = poolData.totalSellAmount.sub(poolData.reserveProjectMint);
//     const progress = sold.mul(new BN(100)).div(poolData.totalSellAmount);
    
//     return Math.min(progress.toNumber(), 100);
//   } catch (error) {
//     console.error('Error calculating progress:', error);
//     return 0;
//   }
// }

/**
 * Convert BN to human readable number with decimals
 * @param {BN} bn - BN value
 * @param {number} decimals - Number of decimals
 * @returns {number} Human readable number
 */


/**
 * Convert human readable number to BN with decimals
 * @param {number} num - Human readable number
 * @param {number} decimals - Number of decimals
 * @returns {BN} BN value
 */


/**
 * Calculate bonding curve output with proper BN arithmetic
 * This matches the working frontend's calculation exactly
 * @param {Object} poolState - Pool state from blockchain
 * @param {number} stableAmountIn - USDC amount to spend
 * @returns {Object} { tokensOut, pricePerToken, fee }
 */
export function calculateBuyOutput(
  poolState,
  stableAmountIn
) {
  // Convert to BN with USDC decimals (6)
  const amountInBN = new BN(Math.floor(stableAmountIn * 1e6));
  
  // Apply trading fee
  const feeAmount = amountInBN.mul(new BN(poolState.tradingFee || 100)).div(new BN(10000));
  const amountInAfterFee = amountInBN.sub(feeAmount);
  
  // Calculate using bonding curve formula - all BN arithmetic
  const totalStable = poolState.reserveStableMint.add(poolState.stableReserveVirtual);
  const totalToken = poolState.reserveProjectMint.add(poolState.tokenReserveVirtual);
  
  const k = totalStable.mul(totalToken);
  const newStable = totalStable.add(amountInAfterFee);
  const newToken = k.div(newStable);
  const projectOut = totalToken.sub(newToken);
  
  // Apply buy tax
  const taxAmount = projectOut.mul(new BN(poolState.params?.buyTax || 0)).div(new BN(10000));
  const netProjectOut = projectOut.sub(taxAmount);
  
  // Convert to human readable
  const tokensOut = Number(netProjectOut.toString()) / 1e9; // 9 decimals
  const pricePerToken = stableAmountIn / tokensOut;
  
  return {
    tokensOut,
    pricePerToken,
    fee: Number(feeAmount.toString()) / 1e6
  };
}