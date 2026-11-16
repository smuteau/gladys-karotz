# OpenKarotz / Free Rabbits

Pilotez votre lapin Karotz depuis Gladys, en local : voix, sons et webradios,
LED, oreilles, caméra, sommeil et tags RFID. Pas de compte, pas de cloud.

## Avant de commencer

- Votre Karotz doit faire tourner **OpenKarotz**, sur le firmware d'origine ou
  par-dessus [Free Rabbits OS](https://www.freerabbits.nl/fros/). Vérification
  rapide : ouvrez `http://<adresse-du-lapin>/` dans un navigateur, vous devez
  voir la page web d'OpenKarotz.
- Le lapin et Gladys doivent être sur le **même réseau local**.
- Donnez au lapin une **adresse IP fixe** (Free Rabbits OS ne gère de toute
  façon que cela), ou réservez-la dans votre box.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Saisissez l'**adresse du lapin** : son adresse IP (ex. `192.168.1.70`) ou
   son nom d'hôte. Plusieurs lapins : séparez-les par des virgules.
3. Enregistrez, puis ouvrez l'onglet **Découverte** : le lapin apparaît, ainsi
   que sa caméra. Ajoutez-les.

Vous ne connaissez pas son adresse ? Un Karotz ne s'annonce pas sur le réseau,
Gladys ne peut donc pas le trouver tout seul. Utilisez le bouton **Chercher sur
mon réseau** : saisissez les trois premiers nombres de vos adresses locales
(ex. `192.168.1`), l'intégration interroge les 254 adresses et liste les lapins
qui ont répondu. Copiez l'adresse trouvée dans le champ, enregistrez.

Les autres réglages :

- **Intervalle de rafraîchissement** — fréquence de lecture du lapin (60 s par
  défaut). Un Karotz est une petite machine : inutile de descendre trop bas.
- **Voix par défaut** — l'identifiant de voix utilisé quand le lapin parle, tel
  que listé dans la page web du Karotz (sur les firmwares récents, un nombre :
  `1` voix française masculine, `2` féminine, `5` et `6` anglais américain…).
  Vide : la voix par défaut du lapin.
- **Caméra** — ajoute un appareil caméra par lapin.

## Les appareils

Chaque lapin devient un appareil, reconnu par son adresse MAC : il garde son
historique, ses scènes et ses tableaux de bord si son adresse IP change.

| Fonctionnalité           | Ce que vous pouvez faire                |
| ------------------------ | --------------------------------------- |
| Réveillé                 | réveiller ou endormir le lapin          |
| LED, couleur de la LED   | allumer, éteindre, choisir la couleur   |
| Pulsation de la LED      | lumière fixe ou pulsée                  |
| Oreille gauche / droite  | position de 0 à 16                      |
| Volume                   | 0 à 100 %, si votre firmware le propose |
| Stockage, clé USB        | pourcentage utilisé                     |
| Tags RFID                | nombre de tags enregistrés              |
| Caméra (appareil séparé) | une photo fraîche à la demande          |

## Boutons de la configuration

- **Tester la connexion** — interroge chaque lapin et affiche sa version et son
  état.
- **Chercher sur mon réseau** — voir plus haut.
- **Identifier un lapin** — le lapin choisi clignote en bleu et bouge les
  oreilles quelques secondes.
- **Redémarrer un lapin** — il revient au bout d'une minute environ.

## Scènes

L'intégration ajoute ses propres cartes à l'éditeur de scènes (Gladys 5.1 ou
plus récent).

**Actions**

- **Faire parler le lapin** — une phrase, avec la voix de votre choix. Vous
  pouvez y glisser des variables de la scène.
- **Jouer un son ou une radio** — l'identifiant d'un son stocké sur le lapin,
  ou l'adresse `http://` d'un MP3 ou d'une webradio.
- **Arrêter la radio**.
- **Jouer une humeur** — au hasard, ou par son numéro.
- **Dire l'heure**.
- **Régler la LED** — couleur en hexadécimal (`FF0000` pour rouge), fixe ou
  pulsée, avec une seconde couleur et une vitesse.
- **Bouger les oreilles** — vers une position, au hasard, ou retour au repos.
- **Prendre une photo** — elle devient l'image de l'appareil caméra : enchaînez
  avec l'action Gladys « envoyer l'image d'une caméra » pour la recevoir.

Réveiller, endormir, allumer la LED : ce sont des fonctionnalités de
l'appareil, utilisez l'action standard « Contrôler un appareil ».

**Déclencheurs**

- **Lapin injoignable** / **Lapin de nouveau joignable**.
- **Lapin endormi ou réveillé** — quand il change d'état de lui-même (page web
  du lapin, programmation interne), pas quand c'est Gladys qui le commande.
- **Nouveau tag RFID enregistré** — avec l'identifiant, le nom et la couleur du
  tag en variables.

## Widgets du tableau de bord

- **Karotz** — état du lapin, stockage, nombre de tags, et quatre boutons :
  faire parler (un petit formulaire s'ouvre), humeur, dire l'heure, endormir.
  Quand il dort, un seul bouton : le réveiller.
- **Caméra du Karotz** — la dernière photo, un bouton pour en prendre une
  nouvelle et un bouton pour effacer les photos stockées sur le lapin.

Avec plusieurs lapins, choisissez lequel afficher dans les réglages du widget.

## Limites

- **Passer un tag RFID devant le lapin ne déclenche pas de scène.** OpenKarotz
  réagit à un tag en appelant une adresse web depuis le lapin, et une
  intégration Gladys ne peut pas être appelée de cette façon. Le déclencheur
  disponible concerne l'enregistrement d'un _nouveau_ tag.
- **Chaque photo reste sur le lapin**, dont le stockage est petit. Effacez-les
  de temps en temps avec le bouton du widget caméra.
- **Un lapin endormi refuse** LED, oreilles, sons et voix : réveillez-le
  d'abord (dans une scène, commencez par l'action « Contrôler un appareil »).
- La voix dépend du service de synthèse configuré dans votre lapin, qui a
  besoin d'Internet : si le lapin ne parle plus, testez depuis sa page web.

## Dépannage

- **« Pas de réponse »** — le lapin est-il allumé ? Sa page web s'ouvre-t-elle
  depuis un ordinateur du même réseau ? Son adresse a-t-elle changé ?
- **Le lapin n'apparaît pas dans Découverte** — il doit avoir répondu au moins
  une fois : utilisez **Tester la connexion**.
- **Pas de fonctionnalité Volume** — votre firmware n'a pas ce réglage ; c'est
  normal sur l'OpenKarotz d'origine.

Non affilié à Violet, Mindscape, OpenKarotz ni Free Rabbits.
