import { Link } from 'react-router-dom';

const EMAIL = 'Eugenie.mandise@gmail.com';
const UPDATED = '27 novembre 2026';

/** Politique de confidentialité (page publique, accessible sans connexion). */
export default function Privacy() {
  return (
    <article className="legal">
      <h1 className="page-title">Politique de confidentialité</h1>
      <p className="muted">EMADECO — Décoration &amp; Événements · Dernière mise à jour : {UPDATED}</p>

      <h2>1. Qui sommes-nous ?</h2>
      <p>
        EMADECO est une application web utilisée dans Pi Browser. Elle propose une boutique de décoration d’événements, la mise en relation avec des
        prestataires, et le suivi des commandes. Elle est exploitée par <strong>Eugénie Mandise Akeumeze</strong>, dans le cadre des lois applicables au
        Canada, notamment la Loi sur la protection des renseignements personnels et les documents électroniques (LPRPDE) et, le cas échéant, les lois
        provinciales sur la protection des renseignements personnels.
      </p>
      <p>
        <strong>Responsable de la protection des renseignements personnels :</strong> Eugénie Mandise Akeumeze —{' '}
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
      </p>

      <h2>2. Renseignements que nous recueillons</h2>
      <ul>
        <li>
          <strong>Compte Pi :</strong> votre identifiant Pi et votre nom d’utilisateur Pi, reçus de Pi Network quand vous vous connectez. Nous ne
          demandons que l’autorisation « nom d’utilisateur » et celle des paiements. Nous ne recevons ni votre adresse courriel, ni votre phrase secrète
          (jamais demandée), ni votre mot de passe.
        </li>
        <li>
          <strong>Profil :</strong> nom affiché et ville, si vous les renseignez.
        </li>
        <li>
          <strong>Commandes :</strong> produit, quantité, montant en Pi, nom du destinataire, numéro de téléphone, pays, ville, adresse, point de repère
          et précisions de livraison, ainsi que les références techniques du paiement Pi (identifiant du paiement et de la transaction).
        </li>
        <li>
          <strong>Demandes aux prestataires :</strong> type et date de l’événement, lieu, nombre approximatif d’invités, thème, couleurs, détails,
          messages échangés et photos d’inspiration que vous choisissez d’envoyer.
        </li>
        <li>
          <strong>Prestataires :</strong> nom de l’entreprise, présentation, zones de service et photos de réalisations.
        </li>
        <li>
          <strong>Utilisation :</strong> notifications, favoris, signalements, et journaux techniques de sécurité (par exemple l’adresse IP traitée par
          l’hébergeur et le limiteur de débit, et les erreurs du serveur).
        </li>
      </ul>
      <p>
        Nous ne recueillons <strong>pas</strong> de numéro de carte bancaire, de coordonnées bancaires, de position GPS, ni de contacts de votre appareil.
        Les photos que vous envoyez sont converties et leurs métadonnées (par exemple la position GPS intégrée à une photo) sont supprimées.
      </p>

      <h2>3. Pourquoi nous les utilisons</h2>
      <ul>
        <li>vous connecter et reconnaître votre compte ;</li>
        <li>traiter, payer, préparer et livrer vos commandes ;</li>
        <li>transmettre vos demandes aux prestataires choisis et faire fonctionner la messagerie ;</li>
        <li>vous envoyer des notifications dans l’application sur l’état de vos commandes et demandes ;</li>
        <li>assurer la sécurité, prévenir la fraude et les abus, et modérer les contenus ;</li>
        <li>respecter nos obligations légales.</li>
      </ul>
      <p>Nous ne vendons pas vos renseignements et nous ne les utilisons pas pour de la publicité ciblée.</p>

      <h2>4. Votre consentement</h2>
      <p>
        En vous connectant et en passant une commande, vous consentez à la collecte, à l’utilisation et à la communication de ces renseignements aux fins
        décrites ici. Vous pouvez retirer votre consentement en tout temps en nous écrivant, sous réserve des obligations légales et contractuelles
        (par exemple, une commande déjà payée doit être livrée). Le retrait peut limiter l’accès à certaines fonctions.
      </p>

      <h2>5. Avec qui nous les partageons</h2>
      <ul>
        <li>
          <strong>Administrateur de la boutique :</strong> il voit vos informations de livraison pour préparer et livrer votre commande.
        </li>
        <li>
          <strong>Prestataires :</strong> un prestataire voit les demandes que vous lui envoyez, rien d’autre.
        </li>
        <li>
          <strong>Pi Network :</strong> connexion et paiements en Pi. Leur traitement est régi par leurs propres conditions et politique.
        </li>
        <li>
          <strong>Hébergement (Render) et base de données et fichiers (Supabase) :</strong> nos fournisseurs techniques, qui traitent les données
          uniquement pour faire fonctionner le service.
        </li>
        <li>
          <strong>Autorités :</strong> si la loi l’exige.
        </li>
      </ul>
      <p>
        Vos renseignements sont donc traités <strong>hors du Canada</strong>, notamment dans l’Union européenne (Allemagne pour l’hébergement, Irlande pour
        la base de données). Ils y sont soumis aux lois de ces pays, qui peuvent permettre à leurs autorités d’y accéder.
      </p>

      <h2>6. Paiements</h2>
      <p>
        Les paiements se font en Pi, depuis Pi Browser. Pour l’instant, l’application fonctionne sur le <strong>réseau d’essai (testnet)</strong> de Pi :
        les montants sont des prix de test en Pi d’essai. Le montant est toujours fixé par notre serveur. Nous ne voyons et ne conservons aucune
        information bancaire.
      </p>

      <h2>7. Combien de temps nous les conservons</h2>
      <p>
        Nous conservons vos renseignements aussi longtemps que votre compte est actif et que cela est nécessaire pour traiter vos commandes, répondre à
        vos demandes, gérer d’éventuels litiges et respecter la loi. Ensuite, nous les supprimons ou les rendons anonymes. Les journaux techniques sont
        conservés de façon limitée par nos hébergeurs.
      </p>

      <h2>8. Comment nous les protégeons</h2>
      <ul>
        <li>connexion sécurisée (HTTPS) et vérification de votre identité Pi par notre serveur ;</li>
        <li>accès limité : chaque utilisateur ne voit que ses propres commandes et demandes, et la base de données applique des règles d’accès strictes ;</li>
        <li>photos d’inspiration conservées dans un espace privé, accessibles par lien temporaire ;</li>
        <li>aucun mot de passe ni clé secrète Pi stockés ; les jetons de session sont signés.</li>
      </ul>
      <p>
        Aucun système n’est infaillible. En cas d’atteinte à la sécurité présentant un risque réel de préjudice grave, nous avertirons les personnes
        concernées et les autorités compétentes, comme la loi l’exige.
      </p>

      <h2>9. Vos droits</h2>
      <p>Vous pouvez, en nous écrivant à <a href={`mailto:${EMAIL}`}>{EMAIL}</a> :</p>
      <ul>
        <li>savoir quels renseignements nous détenons sur vous et en obtenir une copie ;</li>
        <li>faire corriger des renseignements inexacts ;</li>
        <li>retirer votre consentement ou demander la suppression de votre compte et de vos renseignements, sous réserve des obligations légales ;</li>
        <li>poser une question ou déposer une plainte sur notre façon de traiter vos renseignements.</li>
      </ul>
      <p>
        Nous répondrons dans un délai raisonnable, normalement dans les 30 jours. Votre nom d’utilisateur, votre nom affiché et votre ville peuvent aussi
        être modifiés directement dans l’onglet Profil.
      </p>
      <p>
        Si notre réponse ne vous satisfait pas, vous pouvez vous adresser au Commissariat à la protection de la vie privée du Canada (priv.gc.ca,
        1-800-282-1376). Si vous résidez au Québec, vous pouvez aussi vous adresser à la Commission d’accès à l’information du Québec.
      </p>

      <h2>10. Témoins et stockage local</h2>
      <p>
        Nous n’utilisons pas de témoins publicitaires ni d’outil de suivi. Votre navigateur conserve seulement votre jeton de connexion, pour vous garder
        connecté, et un indicateur qui évite de réafficher l’écran de bienvenue pendant la session.
      </p>

      <h2>11. Âge minimum</h2>
      <p>L’application s’adresse aux personnes majeures. Nous ne recueillons pas sciemment de renseignements sur des mineurs.</p>

      <h2>12. Modifications</h2>
      <p>
        Nous pouvons mettre à jour cette politique. La date de dernière mise à jour est indiquée en haut de cette page ; en cas de changement important,
        nous vous en informerons dans l’application.
      </p>

      <h2>13. Nous joindre</h2>
      <p>
        Eugénie Mandise Akeumeze — <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
      </p>
      <p>
        <Link to="/" className="link-btn">
          Retour à l’accueil
        </Link>
      </p>
    </article>
  );
}
