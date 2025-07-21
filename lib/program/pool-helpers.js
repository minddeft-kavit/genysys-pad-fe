import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { 
  POOL_SEED, 
  AUTHORITY_SEED, 
  WALLET_BALANCE_SEED,
  LOCKED_TOKENS_SEED,
  BUNDLE_DEPOSIT_SEED,
  BUNDLE_BUY_POOL_SEED,
  RAYDIUM_SEEDS,
  PROGRAM_ID,
  RAYDIUM_CPMM_PROGRAM,
  USDC_DEVNET
} from '@/lib/constants';
import { BN } from 'bn.js';

/**
 * Derive all PDAs for a pool
 * @param {PublicKey} poolMint - Pool token mint
 * @returns {Object} All pool PDAs
 */
export async function derivePoolPDAs(poolMint) {
  const [poolPda] = PublicKey.findProgramAddressSync(
    [POOL_SEED, poolMint.toBuffer()],
    PROGRAM_ID
  );
  
  const [poolAuthorityPda] = PublicKey.findProgramAddressSync(
    [POOL_SEED, poolMint.toBuffer(), AUTHORITY_SEED],
    PROGRAM_ID
  );
  
  const [bundlePoolPda] = PublicKey.findProgramAddressSync(
    [BUNDLE_BUY_POOL_SEED, poolPda.toBuffer()],
    PROGRAM_ID
  );
  
  return {
    pool: poolPda,
    poolAuthority: poolAuthorityPda,
    bundlePool: bundlePoolPda,
  };
}

/**
 * Derive user-specific PDAs for a pool
 * @param {PublicKey} poolAddress - Pool PDA
 * @param {PublicKey} userPublicKey - User's public key
 * @returns {Object} User-specific PDAs
 */
export async function deriveUserPoolPDAs(poolAddress, userPublicKey) {
  const [walletBalancePda] = PublicKey.findProgramAddressSync(
    [WALLET_BALANCE_SEED, poolAddress.toBuffer(), userPublicKey.toBuffer()],
    PROGRAM_ID
  );
  
  const [lockedTokensPda] = PublicKey.findProgramAddressSync(
    [LOCKED_TOKENS_SEED, poolAddress.toBuffer(), userPublicKey.toBuffer()],
    PROGRAM_ID
  );
  
  const [bundleDepositPda] = PublicKey.findProgramAddressSync(
    [BUNDLE_DEPOSIT_SEED, poolAddress.toBuffer(), userPublicKey.toBuffer()],
    PROGRAM_ID
  );
  
  return {
    walletBalance: walletBalancePda,
    lockedTokens: lockedTokensPda,
    bundleDeposit: bundleDepositPda,
  };
}

/**
 * Get all token accounts for a pool
 * @param {PublicKey} poolMint - Pool token mint
 * @param {PublicKey} poolAuthority - Pool authority PDA
 * @param {PublicKey} stableMint - Stable coin mint (usually USDC)
 * @returns {Object} Token account addresses
 */
export async function getPoolTokenAccounts(poolMint, poolAuthority, stableMint = USDC_DEVNET) {
  const poolProjectAta = await getAssociatedTokenAddress(
    poolMint,
    poolAuthority,
    true // allowOwnerOffCurve
  );
  
  const poolStableAta = await getAssociatedTokenAddress(
    stableMint,
    poolAuthority,
    true
  );
  
  return {
    poolProjectAta,
    poolStableAta,
  };
}

/**
 * Derive Raydium-specific PDAs
 * @param {PublicKey} ammConfig - AMM config address
 * @param {PublicKey} token0 - Token 0 mint (ordered)
 * @param {PublicKey} token1 - Token 1 mint (ordered)
 * @returns {Object} Raydium PDAs
 */
export async function deriveRaydiumPDAs(ammConfig, token0, token1) {
  const [poolState] = PublicKey.findProgramAddressSync(
    [
      RAYDIUM_SEEDS.POOL,
      ammConfig.toBuffer(),
      token0.toBuffer(),
      token1.toBuffer()
    ],
    RAYDIUM_CPMM_PROGRAM
  );
  
  const [token0Vault] = PublicKey.findProgramAddressSync(
    [
      RAYDIUM_SEEDS.POOL_VAULT,
      poolState.toBuffer(),
      token0.toBuffer()
    ],
    RAYDIUM_CPMM_PROGRAM
  );
  
  const [token1Vault] = PublicKey.findProgramAddressSync(
    [
      RAYDIUM_SEEDS.POOL_VAULT,
      poolState.toBuffer(),
      token1.toBuffer()
    ],
    RAYDIUM_CPMM_PROGRAM
  );
  
  const [lpMint] = PublicKey.findProgramAddressSync(
    [RAYDIUM_SEEDS.POOL_LP_MINT, poolState.toBuffer()],
    RAYDIUM_CPMM_PROGRAM
  );
  
  const [observationState] = PublicKey.findProgramAddressSync(
    [RAYDIUM_SEEDS.OBSERVATION, poolState.toBuffer()],
    RAYDIUM_CPMM_PROGRAM
  );
  
  return {
    poolState,
    token0Vault,
    token1Vault,
    lpMint,
    observationState,
  };
}

/**
 * Determine token ordering for Raydium
 * @param {PublicKey} mintA - First mint
 * @param {PublicKey} mintB - Second mint
 * @returns {Object} { token0, token1, isProjectToken0 }
 */
export function getTokenOrder(mintA, mintB) {
  const comparison = mintA.toBuffer().compare(mintB.toBuffer());
  
  if (comparison < 0) {
    return {
      token0: mintA,
      token1: mintB,
      isFirstToken0: true
    };
  } else {
    return {
      token0: mintB,
      token1: mintA,
      isFirstToken0: false
    };
  }
}

/**
 * Check if a pool has wallet limits enabled
 * @param {Object} poolData - Pool account data
 * @returns {boolean} True if wallet limits are enabled
 */
export function hasWalletLimits(poolData) {
  return poolData.limits?.wLimitPercent && 
         Number(poolData.limits.wLimitPercent) > 0;
}

/**
 * Check if a pool is ready for Raydium
 * @param {Object} poolData - Pool account data
 * @returns {Object} { ready: boolean, reason?: string }
 */
export function checkRaydiumReadiness(poolData) {
  if (!poolData.isComplete) {
    return { ready: false, reason: 'Pool must be complete first' };
  }
  
  if (!poolData.isFinalized) {
    return { ready: false, reason: 'Pool must be finalized first' };
  }
  
  if (poolData.isRaydiumInitialized) {
    return { ready: false, reason: 'Raydium pool already created' };
  }
  
  if (!poolData.params.useRaydium) {
    return { ready: false, reason: 'Pool not configured for Raydium' };
  }
  
  return { ready: true };
}

/**
 * Calculate bundle buy share
 * @param {number} userDeposit - User's deposit amount
 * @param {number} totalDeposits - Total bundle deposits
 * @param {number} availableTokens - Tokens available for distribution
 * @returns {number} User's share of tokens
 */
export function calculateBundleShare(userDeposit, totalDeposits, availableTokens) {
  if (!totalDeposits || totalDeposits === 0) return 0;
  
  const sharePercentage = userDeposit / totalDeposits;
  return availableTokens * sharePercentage;
}

/**
 * Check if user can perform initial buy
 * @param {Object} poolData - Pool account data
 * @param {PublicKey} userPublicKey - User's public key
 * @returns {boolean} True if user can perform initial buy
 */
export function canPerformInitialBuy(poolData, userPublicKey) {
  return poolData.params.creator.equals(userPublicKey) &&
         poolData.reserveStableMint.eq(new BN(0)) &&
         !poolData.isComplete;
}

/**
 * Get pool phase
 * @param {Object} poolData - Pool account data
 * @returns {string} Current phase of the pool
 */
export function getPoolPhase(poolData) {
  if (poolData.isRaydiumInitialized) {
    return 'LIVE_ON_RAYDIUM';
  } else if (poolData.isFinalized) {
    return 'FINALIZED';
  } else if (poolData.isComplete) {
    return 'COMPLETE';
  } else if (poolData.reserveStableMint.gt(new BN(0))) {
    return 'ACTIVE';
  } else {
    return 'INITIALIZED';
  }
}