'use client';

import { Transaction, ComputeBudgetProgram, SystemProgram } from '@solana/web3.js';
import { createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { COMPUTE_UNITS } from '@/lib/constants';

/**
 * Base transaction builder with common functionality
 */
export class TransactionBuilder {
  constructor(connection, wallet) {
    this.connection = connection;
    this.wallet = wallet;
    this.instructions = [];
    this.signers = [];
  }

  /**
   * Add compute budget instruction
   * @param {number} units - Compute units
   * @param {number} microLamports - Price per unit
   */
  addComputeBudget(units = COMPUTE_UNITS.DEFAULT, microLamports = COMPUTE_UNITS.MICROLAMPORTS_PER_UNIT) {
    this.instructions.unshift(
      ComputeBudgetProgram.setComputeUnitLimit({ units }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports })
    );
    return this;
  }

  /**
   * Add instruction to create ATA if it doesn't exist
   * @param {PublicKey} ata - Associated token account
   * @param {PublicKey} owner - Owner of the ATA
   * @param {PublicKey} mint - Token mint
   * @param {PublicKey} payer - Transaction payer
   */
  async addCreateATAIfNeeded(ata, owner, mint, payer = null) {
    try {
      const ataInfo = await this.connection.getAccountInfo(ata);
      if (!ataInfo) {
        this.instructions.push(
          createAssociatedTokenAccountInstruction(
            payer || this.wallet.publicKey,
            ata,
            owner,
            mint
          )
        );
      }
    } catch (error) {
      console.error('Error checking ATA:', error);
    }
    return this;
  }

  /**
   * Add multiple ATAs creation
   * @param {Array} atas - Array of { ata, owner, mint }
   */
  async addMultipleATAs(atas) {
    for (const { ata, owner, mint } of atas) {
      await this.addCreateATAIfNeeded(ata, owner, mint);
    }
    return this;
  }

  /**
   * Add an instruction
   * @param {TransactionInstruction} instruction
   */
  addInstruction(instruction) {
    this.instructions.push(instruction);
    return this;
  }

  /**
   * Add a signer
   * @param {Keypair} signer
   */
  addSigner(signer) {
    this.signers.push(signer);
    return this;
  }

  /**
   * Build and sign the transaction
   * @returns {Promise<Transaction>} Signed transaction
   */
  async build() {
    const transaction = new Transaction();
    
    // Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;
    
    // Add all instructions
    transaction.add(...this.instructions);
    
    // Sign with wallet
    const signedTx = await this.wallet.signTransaction(transaction);
    
    // Sign with additional signers if any
    if (this.signers.length > 0) {
      this.signers.forEach(signer => signedTx.partialSign(signer));
    }
    
    return { signedTx, blockhash, lastValidBlockHeight };
  }

  /**
   * Build, sign, and send the transaction
   * @returns {Promise<string>} Transaction signature
   */
  async buildAndSend() {
    const { signedTx, blockhash, lastValidBlockHeight } = await this.build();
    
    // Send transaction
    const txSig = await this.connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });
    
    // Confirm transaction
    await this.connection.confirmTransaction({
      signature: txSig,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    return txSig;
  }

  /**
   * Simulate the transaction
   * @returns {Promise<boolean>} True if simulation succeeds
   */
  async simulate() {
    const transaction = new Transaction();
    transaction.add(...this.instructions);
    
    const simulation = await this.connection.simulateTransaction(transaction);
    
    if (simulation.value.err) {
      console.error('Simulation error:', simulation.value.err);
      return false;
    }
    
    return true;
  }
}

/**
 * Create a transaction builder for trading operations
 */
export function createTradingTransactionBuilder(connection, wallet, isRaydium = false) {
  const builder = new TransactionBuilder(connection, wallet);
  const computeUnits = isRaydium ? COMPUTE_UNITS.RAYDIUM_SWAP : COMPUTE_UNITS.DEFAULT;
  return builder.addComputeBudget(computeUnits);
}

/**
 * Create a transaction builder for pool operations
 */
export function createPoolTransactionBuilder(connection, wallet) {
  const builder = new TransactionBuilder(connection, wallet);
  return builder.addComputeBudget(COMPUTE_UNITS.DEFAULT);
}

/**
 * Create a transaction builder for Raydium pool creation
 */
export function createRaydiumPoolTransactionBuilder(connection, wallet) {
  const builder = new TransactionBuilder(connection, wallet);
  return builder.addComputeBudget(COMPUTE_UNITS.RAYDIUM_CREATE);
}