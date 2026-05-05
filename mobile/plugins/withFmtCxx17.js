const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Forces the `fmt` CocoaPod to compile with C++17.
 *
 * Why:
 *   fmt 11.0.2 (a transitive dep of React Native) uses `consteval` when
 *   compiled with C++20, which Xcode 16's clang rejects in non-constexpr
 *   call sites inside format-inl.h. With C++17, fmt's `FMT_CPLUSPLUS <
 *   201709L` branch picks the constexpr fallback and FMT_USE_CONSTEVAL
 *   is set to 0, sidestepping the build break.
 *
 * Without this plugin, the fix has to be hand-applied to ios/Podfile
 * after every `expo prebuild --clean`.
 */
const FMT_PATCH = `
    # Workaround: fmt 11.0.2 uses \`consteval\` when compiled with C++20, which
    # Xcode 16's clang rejects in non-constexpr call sites inside format-inl.h.
    # Force fmt to compile with C++17 so its \`FMT_CPLUSPLUS < 201709L\` branch
    # picks the constexpr fallback and FMT_USE_CONSTEVAL is set to 0.
    installer.pods_project.targets.each do |t|
      if t.name == 'fmt'
        t.build_configurations.each do |config|
          config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
        end
      end
    end
`;

const SENTINEL = "if t.name == 'fmt'";

module.exports = function withFmtCxx17(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        "Podfile",
      );
      let contents = fs.readFileSync(podfilePath, "utf8");

      if (contents.includes(SENTINEL)) {
        // Already patched (idempotent across re-runs).
        return cfg;
      }

      // Inject just after the `react_native_post_install(...)` call. The
      // Expo template puts that block first inside `post_install do |installer|`.
      const anchor = /react_native_post_install\([\s\S]*?\)\s*\n/;
      if (!anchor.test(contents)) {
        throw new Error(
          "withFmtCxx17: could not locate react_native_post_install in Podfile",
        );
      }
      contents = contents.replace(anchor, (match) => match + FMT_PATCH);
      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
};
