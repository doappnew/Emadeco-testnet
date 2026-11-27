import { Asset, Horizon, Keypair, Memo, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

export interface StellarPayArgs {
  /** Seed du portefeuille de l'application (S…) : jamais journalisé. */
  seed: string;
  fromAddress: string;
  toAddress: string;
  /** Montant en Pi, chaîne décimale (≤ 7 décimales). */
  amount: string;
  /** Mémo texte : l'identifiant du paiement Pi (≤ 28 octets). */
  memo: string;
  networkPassphrase: string;
  horizonUrl: string;
}
export type StellarSubmit = (a: StellarPayArgs) => Promise<string>;

/** Réseau de test Pi : seul réseau utilisé par le test de réception. */
export const TESTNET = { passphrase: 'Pi Testnet', horizonUrl: 'https://api.testnet.minepi.com' } as const;

/** Format d'un seed Stellar : « S » + 55 caractères. */
export const isSeedFormat = (s: string | null | undefined): s is string => typeof s === 'string' && /^S[A-Z2-7]{55}$/.test(s);

/**
 * Construit, signe et envoie le paiement A2U sur la blockchain Pi (même procédure que le SDK serveur
 * officiel Pi : opération « payment » en monnaie native, mémo = identifiant du paiement). Renvoie le txid.
 */
export const submitStellarPayment: StellarSubmit = async (a) => {
  const keypair = Keypair.fromSecret(a.seed);
  if (keypair.publicKey() !== a.fromAddress) throw new Error('wallet_mismatch'); // seed d'un autre portefeuille
  const server = new Horizon.Server(a.horizonUrl);
  const account = await server.loadAccount(keypair.publicKey());
  const fee = await server.fetchBaseFee();
  const timebounds = await server.fetchTimebounds(180);
  const tx = new TransactionBuilder(account, { fee: String(fee), networkPassphrase: a.networkPassphrase, timebounds })
    .addOperation(Operation.payment({ destination: a.toAddress, asset: Asset.native(), amount: a.amount }))
    .addMemo(Memo.text(a.memo))
    .build();
  tx.sign(keypair);
  const res = await server.submitTransaction(tx);
  return res.hash;
};
