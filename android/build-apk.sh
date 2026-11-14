#!/usr/bin/env bash
# Builds a signed release APK with the Android SDK command line tools only (no Gradle, no Maven).
#   ANDROID_HOME=/path/to/sdk ./build-apk.sh [output.apk]
# Needs: JDK 17+, SDK "platforms;android-35" and "build-tools;35.0.0", and the web bundle (cd ../web && npm run build).
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}"
BT="$SDK/build-tools/${BUILD_TOOLS:-35.0.0}"
JAR="$SDK/platforms/android-${PLATFORM:-35}/android.jar"
OUT="${1:-build/WorldWar.apk}"
PKG=com.worldwar.genshtab
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"
WEB=../web/dist/www
[ -f "$WEB/app/index.html" ] || { echo "Web bundle missing: run (cd ../web && npm install && npm run build)"; exit 1; }
[ -f "$JAR" ] || { echo "android.jar not found: $JAR"; exit 1; }

B=build/apk
rm -rf "$B"; mkdir -p "$B/gen" "$B/classes" "$B/dex" "$(dirname "$OUT")"

# 1. resources
"$BT/aapt2" compile --dir app/src/main/res -o "$B/res.zip"
sed "s#<manifest #<manifest package=\"$PKG\" #" app/src/main/AndroidManifest.xml > "$B/AndroidManifest.xml"
"$BT/aapt2" link -o "$B/base.apk" -I "$JAR" --manifest "$B/AndroidManifest.xml" --java "$B/gen" \
  --min-sdk-version 24 --target-sdk-version 35 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  -A "$WEB" "$B/res.zip" --auto-add-overlay

# 2. code
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$JAR" -d "$B/classes" \
  $(find app/src/main/java "$B/gen" -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$B/dex" $(find "$B/classes" -name '*.class')
cp "$B/base.apk" "$B/unaligned.apk"
(cd "$B/dex" && zip -q -X "../unaligned.apk" classes.dex)

# 3. align + sign
"$BT/zipalign" -f -p 4 "$B/unaligned.apk" "$B/aligned.apk"
"$BT/apksigner" sign --ks keystore/worldwar.jks --ks-pass pass:worldwar1936 --key-pass pass:worldwar1936 \
  --ks-key-alias worldwar --out "$OUT" "$B/aligned.apk"
"$BT/apksigner" verify "$OUT"
echo "APK: $OUT ($(du -h "$OUT" | cut -f1))"
