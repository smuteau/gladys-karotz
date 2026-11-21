# Karotz

Pilotez votre lapin Karotz depuis Gladys, en local : voix, sons et webradios,
LED, oreilles, caméra, sommeil et tags RFID. Pas de compte, pas de cloud.

## Avant de commencer

- Votre Karotz doit faire tourner l'un de ces systèmes :
  - **Terrier OS** ([guide d'installation](https://terrier.cyberloutre.fr/karotz)),
    construit sur LapinLibre. C'est le choix le plus sûr : Wi-Fi WPA3, SSH par
    clé seulement, page web protégée par un mot de passe ;
  - **[LapinLibre](https://github.com/sweetlilmre/LapinLibre)**, un système
    libre pour le Karotz, recompilé depuis ses sources ;
  - **OpenKarotz**, sur le firmware d'origine ou par-dessus
    [Free Rabbits OS](https://www.freerabbits.nl/fros/) (WPA2 seulement).

  Les trois exposent la même API locale, celle d'OpenKarotz : l'intégration
  les pilote de la même façon. Vérification rapide : ouvrez
  `http://<adresse-du-lapin>/` dans un navigateur, vous devez voir la page web
  du lapin.

- Le lapin et Gladys doivent être sur le **même réseau local**.
- Donnez au lapin une **adresse IP fixe** (Free Rabbits OS ne gère de toute
  façon que cela), ou réservez-la dans votre box.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Saisissez l'**adresse du lapin** : son adresse IP (ex. `192.168.1.70`) ou
   son nom d'hôte. Plusieurs lapins : séparez-les par des virgules.
3. **LapinLibre ou Terrier OS** : saisissez le **mot de passe web**, celui que
   la page web du lapin demande (utilisateur `admin`). Terrier OS l'écrit dans
   `web-password.txt` sur sa clé USB d'installation. Plusieurs lapins avec des
   mots de passe différents : séparez-les par des espaces. Laissez le champ
   vide pour OpenKarotz.
4. Enregistrez, puis ouvrez l'onglet **Découverte** : le lapin apparaît, ainsi
   que sa caméra. Ajoutez-les.

Vous ne connaissez pas son adresse ? Un Karotz ne s'annonce pas sur le réseau,
mais l'intégration peut le chercher. Cliquez sur **Chercher sur mon réseau**,
sans rien saisir : Gladys repère votre réseau local grâce aux appareils qui s'y
annoncent (box, téléviseur, NAS…), puis l'intégration interroge ses 254
adresses et liste les lapins qui ont répondu. Copiez l'adresse trouvée dans le
champ, enregistrez.

La recherche n'envoie jamais votre mot de passe aux appareils du réseau. Un
lapin LapinLibre ou Terrier OS protégé par un mot de passe apparaît donc à
part, comme une adresse qui « demande un mot de passe » : ajoutez-la, puis
utilisez **Tester la connexion**.

Si le réseau n'a pas pu être déterminé, le bouton vous le dit : saisissez alors
les trois premiers nombres de vos adresses locales (ex. `192.168.1`) dans le
champ **Réseau local** et relancez la recherche.

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

| Fonctionnalité           | Ce que vous pouvez faire                       |
| ------------------------ | ---------------------------------------------- |
| Réveillé                 | réveiller ou endormir le lapin                 |
| LED, couleur de la LED   | allumer, éteindre, choisir la couleur          |
| Pulsation de la LED      | lumière fixe ou pulsée                         |
| Oreille gauche / droite  | position de 0 à 16                             |
| Ears at random / reset   | boutons : oreilles au hasard, ou à 0           |
| Play notification        | voix de Gladys : voir « Sons, radios et voix » |
| Volume                   | 0 à 100 %, si votre firmware le propose        |
| Stockage, clé USB        | pourcentage utilisé                            |
| Tags RFID                | nombre de tags enregistrés                     |
| Caméra (appareil séparé) | une photo fraîche à la demande                 |

Le lapin ne dit pas où sont ses oreilles : l'intégration affiche la dernière
position demandée, et s'en souvient même après un redémarrage. La toute
première fois, l'oreille dont la position est inconnue revient à 0 quand vous
bougez l'autre : le bouton **Ears reset** les remet toutes les deux à 0, un point
de départ connu.

Le widget **Caméra** de Gladys affiche la dernière photo prise par
l'intégration, pendant une heure : le Karotz n'a pas de vidéo en direct.

## Sons, radios et voix

Le lapin lit les sons, les radios et la voix de Gladys depuis une adresse web.
Ce qu'il sait lire dépend de son système :

| Ce que vous faites jouer                             | OpenKarotz (Free Rabbits OS)                                 | LapinLibre, Terrier OS                 |
| ---------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| Son ou radio en `http://`                            | oui                                                          | oui                                    |
| Son ou radio en `https://`                           | non : son lecteur ne lit pas le HTTPS, l'adresse est refusée | oui                                    |
| Voix de Gladys avec une intégration de voix du store | oui : Gladys sert le son en `http://` sur votre réseau       | oui                                    |
| Voix de Gladys Plus                                  | non : elle arrive en `https://`                              | oui                                    |
| Voix du lapin lui-même (« Faire parler »)            | le service en ligne de Free Rabbits OS                       | le serveur réglé dans `lapinlibre.txt` |

**Faire parler le lapin avec la voix de Gladys.** Le lapin a une fonctionnalité
« Play notification » : dans une scène, l'action Gladys **Parler sur une
enceinte** le fait parler avec la voix choisie dans Gladys (page Intelligence
artificielle, carte Voix). Sous OpenKarotz, installez une intégration de voix du
store : hors ligne (eSpeak NG, Piper) ou en ligne (Microsoft Edge TTS, Google
Traduction, ElevenLabs…). Gladys Plus ne marche que sous LapinLibre et Terrier
OS. Gladys doit tourner en réseau hôte (l'installation standard), pour que le
lapin joigne l'adresse du son.

**Internet.** L'intégration parle au lapin sur votre réseau, sans cloud. Le
lapin, lui, a besoin d'Internet pour les radios, pour sa propre voix (le service
en ligne de Free Rabbits OS) et pour les voix en ligne de Gladys ; sous Terrier
OS, il échange aussi avec Le Terrier.

## Boutons de la configuration

- **Tester la connexion** — interroge chaque lapin et affiche sa version et son
  état.
- **Chercher sur mon réseau** — voir plus haut.
- **Identifier un lapin** — le lapin choisi clignote en bleu et bouge les
  oreilles quelques secondes.
- **Redémarrer un lapin** — il revient au bout d'une minute environ.

Un succès s'affiche en vert, une erreur en rouge.

## Scènes

L'intégration ajoute ses propres cartes à l'éditeur de scènes (Gladys 5.1 ou
plus récent).

**Actions**

- **Faire parler le lapin** — une phrase, avec la voix de votre choix. Vous
  pouvez y glisser des variables de la scène.
- **Jouer un son ou une radio** — l'identifiant d'un son stocké sur le lapin,
  ou l'adresse `http://` d'un MP3 ou d'une webradio (sans espace, « & » ni
  « # » : le lapin la reçoit telle quelle). Sous OpenKarotz, une adresse
  `https://` est refusée : son lecteur ne lit que le `http://`. LapinLibre et
  Terrier OS lisent les deux.
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
- **Photos du Karotz** — les photos stockées sur le lapin, une à une et en
  entier, de la plus récente à la plus ancienne : boutons **Précédente** et
  **Suivante**, **Prendre une photo** (elle s'affiche aussitôt) et **Effacer les
  photos**.

Avec plusieurs lapins, choisissez lequel afficher dans les réglages du widget.

La liste propose aussi la caméra du lapin : Gladys ne sait pas encore la
filtrer, et les deux choix affichent le même lapin.

## Limites

- **Passer un tag RFID devant le lapin ne déclenche pas de scène.** OpenKarotz
  réagit à un tag en appelant une adresse web depuis le lapin, et une
  intégration Gladys ne peut pas être appelée de cette façon. Le déclencheur
  disponible concerne l'enregistrement d'un _nouveau_ tag.
- **Sous OpenKarotz, chaque photo reste sur le lapin**, dont le stockage est
  petit. Effacez-les de temps en temps avec le bouton du widget caméra. Sous
  LapinLibre et Terrier OS, le lapin garde les 10 dernières en mémoire et les
  oublie à son redémarrage.
- **Un lapin endormi refuse** LED, oreilles, sons et voix : réveillez-le
  d'abord (dans une scène, commencez par l'action « Contrôler un appareil »).
- La voix dépend du service de synthèse configuré dans votre lapin, qui a
  besoin d'Internet : si le lapin ne parle plus, testez depuis sa page web.
  Sous LapinLibre et Terrier OS, ce serveur se règle dans `lapinlibre.txt`
  (`SERVER=` ou `TTS_SERVER=`) : sans lui, le lapin refuse de parler et
  l'intégration vous le dit.
  Quand ce service ne répond pas, l'intégration le dit (« Le lapin n'a pas pu
  parler ») au lieu d'annoncer que c'est fait.
- **La LED rend les couleurs à peu près** : le lapin reçoit exactement la
  couleur choisie, mais les teintes pâles ou orangées ressortent saturées.
- **L'API du lapin parle en HTTP simple**, quel que soit son système. Sous
  LapinLibre et Terrier OS, le mot de passe web passe donc lisible sur votre
  réseau local : le WPA3 le protège sur le Wi-Fi, pas sur le câble entre la
  box et Gladys. Gardez le lapin sur un réseau de confiance.
- **Un Karotz sous Terrier OS reste un lapin du Terrier** : Le Terrier et
  Gladys peuvent le piloter en même temps. S'ils lui parlent au même instant,
  il répond qu'il est occupé : réessayez.

## Dépannage

- **« Pas de réponse »** — le lapin est-il allumé ? Sa page web s'ouvre-t-elle
  depuis un ordinateur du même réseau ? Son adresse a-t-elle changé ?
- **« Demande un mot de passe web »** — le lapin est sous LapinLibre ou
  Terrier OS : saisissez le mot de passe de sa page web dans la configuration.
- **« Mot de passe web refusé »** — aucun des mots de passe saisis n'est le
  bon. Vérifiez-le en ouvrant la page web du lapin (utilisateur `admin`).
- **« Le lapin est occupé »** — une autre commande, du Terrier par exemple,
  l'occupait à cet instant : réessayez.
- **« Le lapin n'a pas pu parler »** — son service de synthèse vocale, en ligne
  sous Free Rabbits OS, n'a pas répondu. Essayez depuis la page web du lapin :
  s'il n'y parle pas non plus, le problème vient du lapin ou du service.
- **Le lapin n'apparaît pas dans Découverte** — il doit avoir répondu au moins
  une fois : utilisez **Tester la connexion**.
- **Pas de fonctionnalité Volume** — votre firmware n'a pas ce réglage ; c'est
  normal sur l'OpenKarotz d'origine et sur LapinLibre.

Non affilié à Violet, Mindscape, OpenKarotz, Free Rabbits, LapinLibre ni Le
Terrier.
