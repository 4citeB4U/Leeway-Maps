# Install and package LeeWay

Both web applications remain available on GitHub Pages and Vercel. The in-app
**Install app** button invokes the browser's own install prompt when available,
or explains Android, iPhone/iPad, Safari and desktop installation. Live data
requires a connection; the service worker provides the saved-trip offline page.

## Desktop packages

In `packaging/desktop`, run `npm ci`, then `npm run build -- logistics` or
`npm run build -- maps` on Windows, macOS or Linux. Explicit final arguments
`win`, `mac`, `linux` select a target; macOS packages require a macOS runner.
Outputs are Windows portable EXE, macOS DMG/ZIP and Linux AppImage. These clients
load the corresponding approved HTTPS application; no host Node APIs are exposed
to web content. Other links open in the system browser. The desktop shell needs
the network and preserves the hosted app's updates.

The manual **Build downloadable apps** GitHub Actions workflow builds artifacts;
it does not publish releases or submit to stores. Local dependency installation
and generated source are not proof of a successfully built or tested installer.
Unsigned desktop artifacts require signing/notarization before normal consumer
distribution. Supply the appropriate developer certificates through the build
provider's protected signing mechanism; never commit them.

## Android and iOS

Build the relevant repository's web app with `VITE_BASE_PATH=/` and an explicit
public `VITE_LEEWAY_WORLD_API_URL`, then in `packaging/mobile` run `npm ci`,
`npm run configure -- logistics` (or `maps`), and `npx cap add android` /
`npx cap add ios`. This bundles the web assets; it does not use Capacitor's
development-only remote-server URL. Run `npx cap sync` after rebuilding the web app.

Android uses JDK 21 and Android SDK 36; run `./gradlew assembleDebug` inside
`android`. A debug APK is for development, not a Play Store release. iOS requires
macOS and Xcode. The manual workflow creates a simulator build without device
signing; installing on iPhones or App Store submission requires Apple's signing,
provisioning and review. No enrollment, signing key creation or store submission
is performed by this workflow.

Before mobile release, configure the public API's explicit CORS allowlist for
`https://localhost` (Android) and `capacitor://localhost` (iOS), retaining existing
authentication on private operations. Add platform microphone/location usage
descriptions and permissions as those capabilities are enabled, then verify
real-device voice, location, WebGL, routing and camera playback. A generated
native project does not establish those runtime capabilities.

PWA installation remains the usable cross-platform option while native signing
and device verification are outstanding. Browser support and permissions vary;
this project does not claim every device has been tested.
