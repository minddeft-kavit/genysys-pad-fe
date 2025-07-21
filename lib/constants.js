import { PublicKey } from '@solana/web3.js';

// ===== PROGRAM IDS & ADDRESSES =====
export const PROGRAM_ID = new PublicKey('2rP4m541QcskR4V6iCZriZ4Pk25zwvXc3CsVB26PPfyy');

// ===== COMMON TOKEN ADDRESSES =====
export const USDC_DEVNET = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

// ===== RAYDIUM ADDRESSES =====
export const RAYDIUM_CPMM_PROGRAM = new PublicKey('CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW');
export const RAYDIUM_AUTHORITY = new PublicKey('7rQ1QFNosMkUCuh7Z7fPbTHvh73b68sQYdirycEzJVuw');
export const RAYDIUM_PROTOCOL_FEE_OWNER = new PublicKey('adMCyoCgfkg7bQiJ9aBJ59H3BXLY3r5LNLfPpQfMzBe');
export const CREATOR_POOL_FEE_ATA = new PublicKey('G11FKBRaAkHAKuLCgLM6K6NUc9rTjPAznRCjZifrTQe2');

// ===== RAYDIUM AMM CONFIGS =====
export const RAYDIUM_AMM_CONFIGS = {
  STABLE: new PublicKey('9zSzfkYy6awexsHvmggeH36pfVUdDGyCcwmjT3AQPBj6'),  // 0.01%
  LOW: new PublicKey('H3ozvJr19WpcUpuPBhjaMiFfhDVYqDDYjXJZ5X4XyTF'),     // 0.05%
  MEDIUM: new PublicKey('2kMr32vK9PgKF7EwLz3hJpSJQDYjzsVdPndLbBiUQPUL'), // 0.30%
  HIGH: new PublicKey('3nD9JeFHxFvatJg3bjGDgbVC8nqNxV4aK2XopDgGnr28'),   // 1.00%
};

export const RAYDIUM_FEE_TIERS = {
  0: RAYDIUM_AMM_CONFIGS.STABLE,
  1: RAYDIUM_AMM_CONFIGS.LOW,
  2: RAYDIUM_AMM_CONFIGS.MEDIUM,
  3: RAYDIUM_AMM_CONFIGS.HIGH,
};

// ===== PDA SEEDS =====
export const CONFIG_SEED = Buffer.from('config');
export const POOL_SEED = Buffer.from('pool');
export const AUTHORITY_SEED = Buffer.from('auth');
export const BUNDLE_DEPOSIT_SEED = Buffer.from('bundle_deposit');
export const LOCKED_TOKENS_SEED = Buffer.from('locked_tokens');
export const WALLET_BALANCE_SEED = Buffer.from('wallet_balance');
export const BUNDLE_BUY_POOL_SEED = Buffer.from('bundle_buy_pool');
export const TAX_SPLITTER_SEED = Buffer.from('tax_splitter');
export const TAX_SPLIT_SEED = Buffer.from('tax_split');

// ===== RAYDIUM SEEDS =====
export const RAYDIUM_SEEDS = {
  POOL: Buffer.from('pool'),
  POOL_VAULT: Buffer.from('pool_vault'),
  POOL_LP_MINT: Buffer.from('pool_lp_mint'),
  OBSERVATION: Buffer.from('observation'),
};

// ===== FEES & COSTS =====
export const FEES = {
  DEFAULT_PROTOCOL_FEE: 1000,        // 10% (basis points)
  DEFAULT_TRADING_FEE: 100,          // 1% (basis points)
  DEFAULT_BUNDLE_FEE: 250,           // 2.5% (basis points)
  TRADING_FEE_DECIMAL: 0.01,         // 1% as decimal for calculations
  CREATE_POOL_FEE_SOL: 1,            // 1 SOL
  CREATE_POOL_FEE_LAMPORTS: 1_000_000_000, // 1 SOL in lamports
  CREATE_POOL_BUFFER_SOL: 1.05,     // 1 SOL + 5% buffer
  CREATE_POOL_BUFFER_LAMPORTS: 1_050_000_000, // 1.05 SOL in lamports
};

// ===== COMPUTE UNITS =====
export const COMPUTE_UNITS = {
  DEFAULT: 800_000,
  RAYDIUM_SWAP: 600_000,
  RAYDIUM_CREATE: 400_000,
  MICROLAMPORTS_PER_UNIT: 1,
};

// ===== TOKEN STANDARDS =====
export const TOKEN_STANDARDS = {
  TOKEN_DECIMALS: 9,
  USDC_DECIMALS: 6,
  SOL_DECIMALS: 9,
  PERCENTAGE_BASIS_POINTS: 10000,   // 100% = 10000
  PERCENTAGE_DECIMALS: 100,         // 100% = 100
};

// ===== RAYDIUM LIMITS =====
export const RAYDIUM_LIMITS = {
  MIN_TICK: -443636,
  MAX_TICK: 443636,
  Q64: 1 << 64,
  MINIMUM_LIQUIDITY: 1000,
  TICK_SPACING_STABLE: 1,      // 0.01% fee tier
  TICK_SPACING_LOW: 10,        // 0.05% fee tier
  TICK_SPACING_MEDIUM: 60,     // 0.30% fee tier
  TICK_SPACING_HIGH: 200,      // 1.00% fee tier
};

// ===== CALCULATION CONSTANTS =====
export const CALCULATION_CONSTANTS = {
  PRICE_PRECISION: 1_000_000_000_000_000_000, // 1e18
  SQRT_PRECISION: 1_000_000,
  LAMPORTS_PER_SOL: 1_000_000_000,
  PRICE_DECIMAL_PRECISION: 6,
  TOKEN_AMOUNT_PRECISION: 4,
};

// ===== UI CONSTANTS =====
export const UI_CONSTANTS = {
  MAX_SLIPPAGE: 5000,           // 50% (basis points)
  DEFAULT_SLIPPAGE: 100,        // 1% (basis points)
  REFRESH_INTERVAL: 30000,      // 30 seconds
  TX_TIMEOUT: 60000,            // 60 seconds
  DEBOUNCE_DELAY: 500,          // 500ms for input debouncing
};

// ===== DEFAULT FORM VALUES =====
export const DEFAULT_FORM_VALUES = {
  REQUIRE_RAISE_USD: 100000,
  MIN_DEPOSIT: '1',
  MAX_DEPOSIT: '1000',
  G_LIMIT_PERIOD: '60',
  G_LIMIT_PERCENT: '10',
  W_LIMIT_PERIOD: '60',
  W_LIMIT_PERCENT: '10',
  BUY_TAX: '0',
  SELL_TAX: '0',
  CREATOR_PERCENTAGE: '50',
  RAYDIUM_FEE_TIER: '2', // MEDIUM - 0.30%
};

// ===== ALLOWED DEX ROUTERS =====
export const ALLOWED_DEX_ROUTERS = [
  RAYDIUM_CPMM_PROGRAM,
  new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'), // Whirlpool
  new PublicKey('SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ'),  // Saber
  new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'), // Raydium CPMM Mainnet
];

// ===== METADATA PROGRAM =====
export const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
export const METADATA_SEED = Buffer.from('metadata');

// ===== ERROR MESSAGES =====
export const ERROR_MESSAGES = {
  WALLET_NOT_CONNECTED: 'Please connect your wallet',
  INVALID_AMOUNT: 'Please enter a valid amount',
  INSUFFICIENT_BALANCE: 'Insufficient balance',
  TRANSACTION_FAILED: 'Transaction failed',
  POOL_NOT_FOUND: 'Pool not found',
  UNAUTHORIZED: 'Unauthorized action',
  INSUFFICIENT_LIQUIDITY: 'Insufficient liquidity in pool',
  WALLET_LIMIT_EXCEEDED: 'Wallet limit exceeded. You cannot sell this much yet.',
  GLOBAL_LIMIT_EXCEEDED: 'Global price limit exceeded. Try selling a smaller amount.',
};

// ===== SUCCESS MESSAGES =====
export const SUCCESS_MESSAGES = {
  TRANSACTION_CONFIRMED: 'Transaction confirmed!',
  POOL_CREATED: 'Pool created successfully!',
  TOKENS_PURCHASED: 'Tokens purchased successfully!',
  TOKENS_SOLD: 'Tokens sold successfully!',
  POOL_FINALIZED: 'Pool finalized successfully!',
  RAYDIUM_POOL_CREATED: 'Raydium pool created successfully!',
  BUNDLE_DEPOSITED: 'Bundle deposit successful!',
  BUNDLE_WITHDRAWN: 'Bundle withdrawal successful!',
    TOKENS_CLAIMED: 'Tokens claimed successfully!',
  LOCKED_TOKENS_CLAIMED: 'Locked tokens claimed successfully!',
};

// ===== FORM VALIDATION =====
export const VALIDATION = {
  MAX_NAME_LENGTH: 32,
  MAX_SYMBOL_LENGTH: 10,
  MAX_URL_LENGTH: 100,
  MIN_PRICE: 0.000001,
  MAX_TAX_BASIS_POINTS: 10000, // 100%
  MIN_DEPOSIT_USD: 0.01,
};

// ===== PERCENTAGE QUICK SELECTS =====
export const PERCENTAGE_PRESETS = [
  { label: '25%', value: 25 },
  { label: '50%', value: 50 },
  { label: '75%', value: 75 },
  { label: 'MAX', value: 100 },
];

// ===== RAYDIUM FEE TIER OPTIONS =====
export const RAYDIUM_FEE_OPTIONS = [
  { value: '0', label: 'STABLE - 0.01% (Best for stablecoins)', fee: 0.01 },
  { value: '1', label: 'LOW - 0.05%', fee: 0.05 },
  { value: '2', label: 'MEDIUM - 0.30% (Recommended)', fee: 0.30 },
  { value: '3', label: 'HIGH - 1.00%', fee: 1.00 },
];

// ===== EXTERNAL LINKS =====
export const EXTERNAL_LINKS = {
  RAYDIUM_SWAP: 'https://raydium.io/swap/',
  SOLSCAN: 'https://solscan.io/',
  SUPPORT: 'https://support.genysyspad.com/',
};

// ===== LOCAL STORAGE KEYS =====
export const STORAGE_KEYS = {
  SLIPPAGE_TOLERANCE: 'genysys_slippage',
  PREFERRED_STABLE: 'genysys_preferred_stable',
  WALLET_AUTO_CONNECT: 'genysys_auto_connect',
};