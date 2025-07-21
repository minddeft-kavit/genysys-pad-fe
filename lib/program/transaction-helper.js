import { Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { COMPUTE_UNITS, UI_CONSTANTS } from '@/lib/constants';

export async function sendTransaction(connection, wallet, instructions, signers = []) {
  try {
    const transaction = new Transaction();
    
    // Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
    
    // Add compute budget
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNITS.DEFAULT })
    );
    
    // Add all instructions
    instructions.forEach(ix => transaction.add(ix));
    if (!wallet || !wallet.signTransaction) throw new Error("Wallet not ready");
    // Sign transaction
    const signedTx = await wallet.signTransaction(transaction);
    
    // Sign with additional signers if any
    if (signers.length > 0) {
      signers.forEach(signer => signedTx.partialSign(signer));
    }
    
    // Send transaction with better error handling
    console.log('Sending transaction...');
    const txSig = await connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });
    
    console.log('Transaction sent:', txSig);
    
    // Improved confirmation with timeout
    const confirmationStrategy = {
      signature: txSig,
      blockhash,
      lastValidBlockHeight,
    };
    
    try {
      const confirmation = await Promise.race([
        connection.confirmTransaction(confirmationStrategy, 'confirmed'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction confirmation timeout')), UI_CONSTANTS.TX_TIMEOUT)
        )
      ]);
      
      if (confirmation?.value?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log('Transaction confirmed:', txSig);
    } catch (confirmError) {
      // Check if transaction actually succeeded despite timeout
      console.log('Checking transaction status after timeout...');
      const status = await connection.getSignatureStatus(txSig);
      
      if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
        console.log('Transaction confirmed after timeout:', txSig);
        return txSig;
      }
      
      throw confirmError;
    }
    
    return txSig;
  } catch (error) {
    console.error('Transaction error:', error);
    
    // Add more specific error messages
    if (error.message?.includes('already processed')) {
      console.log('Transaction may have succeeded. Check your wallet.');
    }
    
    throw error;
  }
}