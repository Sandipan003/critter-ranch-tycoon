#!/bin/zsh
# Creates your Play Store *upload key* and android/keystore.properties.
# Run once:  zsh scripts/make-keystore.sh
# Back up the .jks file and passwords somewhere safe (password manager + cloud drive).
set -e
cd "$(dirname "$0")/.."

JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
KEYTOOL="$JAVA_HOME/bin/keytool"
KEYSTORE="android/upload-key.jks"
ALIAS="upload"

if [[ -f "$KEYSTORE" ]]; then
  echo "❌ $KEYSTORE already exists — not overwriting it."
  exit 1
fi

echo "Choose a strong password for your upload key (you'll type it twice)."
read -s "STOREPASS?Keystore password: "; echo
read -s "STOREPASS2?Repeat password: "; echo
[[ "$STOREPASS" == "$STOREPASS2" ]] || { echo "Passwords don't match"; exit 1; }
[[ ${#STOREPASS} -ge 8 ]] || { echo "Use at least 8 characters"; exit 1; }
read "CN?Your name or studio name (shown in the certificate): "

"$KEYTOOL" -genkeypair -v -keystore "$KEYSTORE" -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$STOREPASS" -keypass "$STOREPASS" -dname "CN=$CN"

cat > android/keystore.properties <<EOF
storeFile=../upload-key.jks
storePassword=$STOREPASS
keyAlias=$ALIAS
keyPassword=$STOREPASS
EOF
chmod 600 android/keystore.properties "$KEYSTORE"
echo "✅ Created $KEYSTORE and android/keystore.properties"
echo "   BACK UP BOTH FILES NOW. They are git-ignored on purpose."
