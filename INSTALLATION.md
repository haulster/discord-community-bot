# 🚀 Installation rapide

Guide express pour lancer le bot en 5 minutes. Pour le pas-à-pas complet
(Developer Portal en détail, hébergement VPS, mises à jour, sauvegardes),
lis le **README.md**.

## Avant de commencer

1. Installe **Node.js 18.17 ou plus** (recommandé : 20 LTS) → <https://nodejs.org>
   Vérifie avec : `node -v`
2. Crée ton bot sur <https://discord.com/developers/applications> :
   - **Bot > Reset Token** → copie le token (ne le partage JAMAIS) ;
   - **General Information** → copie l'Application ID ;
   - **Bot > Privileged Gateway Intents** → active les **3 intents**
     (Presence, Server Members, Message Content) ;
   - **OAuth2 > URL Generator** → scope `bot` + permissions → invite le bot
     sur ton serveur avec l'URL générée.

## Lancer le bot

Ouvre un terminal (cmd/PowerShell sur Windows) dans le dossier du projet :

```bash
# 1. Installer les dépendances
npm install

# 2. Créer le fichier de configuration
cp .env.example .env
#    → sur Windows :  copy .env.example .env
#    Ouvre .env et remplis 3 lignes :
#    DISCORD_TOKEN=   (le token copié)
#    CLIENT_ID=       (l'Application ID)
#    ROOT_OWNER_ID=   (TON id Discord : clic droit sur ton profil > Copier l'identifiant,
#                      après avoir activé Paramètres > Avancés > Mode développeur)

# 3. Créer la base de données
npx prisma migrate dev --name init

# 4. Compiler puis démarrer
npm run build
npm start
```

Le bot est prêt quand la console affiche `✅ Connecté en tant que ...`.
Tape `+help` sur ton serveur Discord. 🎉

Astuce développement : `npm run dev` relance le bot automatiquement à chaque
modification du code.

## Le garder en ligne 24/7 (VPS Linux)

```bash
sudo npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup     # exécute la commande qu'il affiche, puis refais : pm2 save
```

Logs : `pm2 logs crow-style-bot` · Redémarrer : `pm2 restart crow-style-bot`
· Arrêter : `pm2 stop crow-style-bot`

## En cas de problème

- Le bot ne répond à aucune commande → **Message Content Intent** non activé (étape "Avant de commencer").
- `+soutien` ne fonctionne pas → **Presence Intent** non activé.
- Le bot n'arrive pas à donner un rôle ou sanctionner → monte le **rôle du bot
  plus haut** dans Paramètres du serveur > Rôles.
- Token qui a fuité → Developer Portal > Bot > **Reset Token**, puis mets à
  jour `.env` et redémarre.
