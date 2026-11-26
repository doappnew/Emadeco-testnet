import { Link } from 'react-router-dom';

const EMAIL = 'Eugenie.mandise@gmail.com';
const UPDATED = '27 novembre 2026';

/** Conditions d'utilisation (page publique, accessible sans connexion). */
export default function Terms() {
  return (
    <article className="legal">
      <h1 className="page-title">Conditions d’utilisation</h1>
      <p className="muted">EMADECO — Décoration &amp; Événements · Dernière mise à jour : {UPDATED}</p>

      <h2>1. Acceptation</h2>
      <p>
        En vous connectant à EMADECO ou en l’utilisant, vous acceptez ces conditions et notre{' '}
        <Link to="/confidentialite">politique de confidentialité</Link>. Si vous ne les acceptez pas, n’utilisez pas l’application. L’application est
        exploitée par Eugénie Mandise Akeumeze (<a href={`mailto:${EMAIL}`}>{EMAIL}</a>), dans le cadre des lois applicables au Canada.
      </p>

      <h2>2. Le service</h2>
      <p>EMADECO propose, dans Pi Browser :</p>
      <ul>
        <li>une boutique d’articles et de services de décoration d’événements, que vous pouvez commander et payer en Pi ;</li>
        <li>la mise en relation avec des prestataires indépendants, à qui vous pouvez envoyer des demandes ;</li>
        <li>le suivi de vos commandes et de vos demandes.</li>
      </ul>
      <p>
        EMADECO n’est pas affilié à Pi Network et n’est pas approuvé par lui. Les prestataires sont des professionnels indépendants : EMADECO ne fait que
        les mettre en relation avec vous et n’est pas partie aux accords que vous concluez directement avec eux.
      </p>

      <h2>3. Compte et accès</h2>
      <ul>
        <li>Vous devez être majeur et avoir un compte Pi valide. La connexion se fait uniquement avec Pi ; nous ne gérons pas de mot de passe.</li>
        <li>Vous êtes responsable de l’usage de votre compte Pi et de l’exactitude des informations que vous donnez (nom, téléphone, adresse).</li>
        <li>Une connexion est obligatoire pour accéder à la boutique et aux autres sections de l’application.</li>
      </ul>

      <h2>4. Réseau d’essai (testnet), prix et paiement</h2>
      <ul>
        <li>
          <strong>Version d’essai :</strong> pour l’instant, l’application fonctionne sur le réseau d’essai de Pi. Les prix affichés sont des{' '}
          <strong>prix de test</strong> en Pi d’essai, sans valeur monétaire réelle, et peuvent changer à tout moment.
        </li>
        <li>Le prix et le montant total d’une commande sont fixés par notre serveur au moment de la commande. Vous les voyez avant de payer.</li>
        <li>Le paiement s’effectue en Pi, depuis Pi Browser, et est confirmé par Pi. Une commande n’est prise en charge qu’une fois le paiement reçu.</li>
        <li>Nous ne recueillons aucune information bancaire.</li>
        <li>
          Le passage à un fonctionnement réel (mainnet), avec des prix réels, sera annoncé dans l’application et pourra entraîner de nouvelles
          conditions.
        </li>
      </ul>

      <h2>5. Livraison et exécution</h2>
      <ul>
        <li>Vous devez fournir une adresse et un numéro de téléphone exacts pour permettre la livraison ou l’exécution.</li>
        <li>L’administrateur prépare puis livre la commande à l’adresse indiquée. Les étapes (payée, en préparation, livrée) sont visibles dans « Commandes ».</li>
        <li>Les délais sont indicatifs. Une adresse incomplète ou un destinataire injoignable peut retarder ou empêcher la livraison.</li>
      </ul>

      <h2>6. Annulation et remboursement</h2>
      <p>
        Vous pouvez annuler vous-même une commande tant qu’elle n’est pas payée. Après le paiement, écrivez-nous rapidement à{' '}
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a> : nous examinons chaque demande d’annulation ou de remboursement selon l’état de la commande. Un
        remboursement éventuel se fait hors de l’application. Ces conditions ne limitent pas les droits que la loi vous reconnaît comme consommateur.
      </p>

      <h2>7. Règles d’utilisation</h2>
      <p>Vous vous engagez à ne pas :</p>
      <ul>
        <li>fournir de fausses informations ou usurper l’identité d’une autre personne ;</li>
        <li>publier ou envoyer des contenus illégaux, offensants, trompeurs ou qui portent atteinte aux droits d’autrui ;</li>
        <li>envoyer des photos dont vous n’avez pas les droits ;</li>
        <li>tenter de contourner la sécurité, de perturber le service ou d’y accéder de façon automatisée ;</li>
        <li>utiliser l’application pour du harcèlement, de la fraude ou du spam.</li>
      </ul>
      <p>Vous pouvez signaler un contenu ou un prestataire avec le bouton « Signaler » prévu à cet effet.</p>

      <h2>8. Contenus et prestataires</h2>
      <ul>
        <li>Les prestataires s’engagent à présenter des informations et des photos exactes, et à respecter leurs engagements envers les clients.</li>
        <li>Les photos et textes que vous publiez restent à vous. Vous nous autorisez à les afficher dans l’application pour faire fonctionner le service.</li>
        <li>Nous pouvons modérer, refuser ou retirer un contenu, un produit ou un compte qui ne respecte pas ces conditions.</li>
        <li>Les photos et textes de présentation d’EMADECO sont protégés. Vous ne pouvez pas les copier ni les réutiliser sans autorisation.</li>
      </ul>

      <h2>9. Disponibilité et responsabilité</h2>
      <p>
        L’application est fournie en l’état. Elle est en phase d’essai : des interruptions, des erreurs ou des remises à zéro de données peuvent survenir.
        Dans la mesure permise par la loi, EMADECO n’est pas responsable des dommages indirects, ni des retards ou interruptions dus à Pi Network, à nos
        hébergeurs ou à des événements hors de notre contrôle. Cela ne limite pas une responsabilité qui ne peut pas être exclue par la loi.
      </p>

      <h2>10. Suspension</h2>
      <p>
        Nous pouvons suspendre ou fermer un compte en cas de non-respect de ces conditions ou d’abus. Vous pouvez demander la fermeture de votre compte en
        nous écrivant.
      </p>

      <h2>11. Modifications</h2>
      <p>
        Nous pouvons modifier ces conditions. La date de mise à jour figure en haut de cette page. Continuer à utiliser l’application après une
        modification vaut acceptation.
      </p>

      <h2>12. Droit applicable et contact</h2>
      <p>
        Ces conditions sont régies par les lois en vigueur au Canada. Pour toute question : Eugénie Mandise Akeumeze —{' '}
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
      </p>
      <p>
        <Link to="/" className="link-btn">
          Retour à l’accueil
        </Link>
      </p>
    </article>
  );
}
