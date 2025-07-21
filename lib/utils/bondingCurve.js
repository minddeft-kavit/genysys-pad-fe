export function calculateBondingCurvePrice(pool) {
  try {
    // Use the same calculation as the program
    const totalStable = BigInt(pool.reserveStable) + BigInt(pool.stableReserveVirtual || 0);
    const totalToken = BigInt(pool.reserveProject) + BigInt(pool.tokenReserveVirtual || 0);
    
    if (totalToken === BigInt(0)) return 0;
    
    // Price = stable / token (accounting for decimals)
    // USDC has 6 decimals, Token has 9 decimals
    // So we multiply by 10^3 to normalize
    const price = Number(totalStable * BigInt(1000) / totalToken) / 1000;
    
    return price;
  } catch (error) {
    console.error('Error calculating price:', error);
    return 0;
  }
}

export function calculateTokensOut(pool, usdcIn) {
  try {
    const tradingFee = 0.01; // 1% fee
    const amountAfterFee = usdcIn * (1 - tradingFee);
    
    const totalStable = Number(pool.reserveStable) / 1e6 + Number(pool.stableReserveVirtual) / 1e6;
    const totalToken = Number(pool.reserveProject) / 1e9 + Number(pool.tokenReserveVirtual) / 1e9;
    
    const k = totalStable * totalToken;
    const newStable = totalStable + amountAfterFee;
    const newToken = k / newStable;
    const tokensOut = totalToken - newToken;
    
    // Apply buy tax
    const buyTax = (pool.buyTax || 0) / 10000;
    const taxAmount = tokensOut * buyTax;
    
    return tokensOut - taxAmount;
  } catch (error) {
    console.error('Error calculating tokens out:', error);
    return 0;
  }
}