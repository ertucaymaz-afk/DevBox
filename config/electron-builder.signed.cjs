"use strict";

const signingMode = (process.env.DEVBOX_SIGNING_MODE || "store").trim().toLowerCase();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Signed release is blocked: ${name} is required.`);
  }
  return value;
}

const base = {
  appId: "com.devbox.app",
  productName: "DevBox",
  executableName: "DevBox",
  artifactName: "DevBox-Setup.${ext}",
  npmRebuild: false,
  forceCodeSigning: true,
  directories: { output: "release" },
  files: ["dist/**/*", "package.json"],
  asar: true,
  asarUnpack: ["node_modules/node-pty/**/*"],
  extraResources: [
    { from: "vendor/microsoft-js-debug", to: "vendor/microsoft-js-debug" },
    { from: "specs/development/geliştirme-spec-task-graph.json", to: "development/geliştirme-spec-task-graph.json" },
    { from: "src", to: "development/source-template/src" },
    { from: "config", to: "development/source-template/config" },
    { from: "scripts", to: "development/source-template/scripts" },
    { from: "specs", to: "development/source-template/specs" },
    { from: "tests", to: "development/source-template/tests" },
    { from: "docs", to: "development/source-template/docs" },
    { from: ".github", to: "development/source-template/.github" },
    { from: "build", to: "development/source-template/build" },
    { from: "vendor", to: "development/source-template/vendor" },
    { from: "package.json", to: "development/source-template/package.json" },
    { from: "pnpm-lock.yaml", to: "development/source-template/pnpm-lock.yaml" },
    { from: "pnpm-workspace.yaml", to: "development/source-template/pnpm-workspace.yaml" },
    { from: "tsconfig.json", to: "development/source-template/tsconfig.json" },
    { from: "README.md", to: "development/source-template/README.md" },
    { from: "CHANGELOG.md", to: "development/source-template/CHANGELOG.md" },
    { from: "LICENSE", to: "development/source-template/LICENSE" },
    { from: "THIRD_PARTY_NOTICES.md", to: "development/source-template/THIRD_PARTY_NOTICES.md" },
    { from: ".gitignore", to: "development/source-template/.gitignore" },
    { from: ".gitattributes", to: "development/source-template/.gitattributes" }
  ],
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "DevBox",
    uninstallDisplayName: "DevBox",
    deleteAppDataOnUninstall: false
  }
};

if (signingMode === "store") {
  const thumbprint = required("DEVBOX_SIGNING_CERT_SHA1").replace(/\s+/gu, "").toUpperCase();
  if (!/^[A-F0-9]{40}$/u.test(thumbprint)) {
    throw new Error("Signed release is blocked: DEVBOX_SIGNING_CERT_SHA1 must be a 40-character SHA-1 certificate thumbprint.");
  }

  module.exports = {
    ...base,
    win: {
      icon: "build/icon.ico",
      target: ["nsis"],
      requestedExecutionLevel: "asInvoker",
      verifyUpdateCodeSignature: true,
      signtoolOptions: {
        certificateSha1: thumbprint,
        signingHashAlgorithms: ["sha256"],
        rfc3161TimeStampServer: process.env.DEVBOX_TIMESTAMP_URL?.trim() || "http://timestamp.digicert.com"
      }
    }
  };
} else if (signingMode === "azure") {
  module.exports = {
    ...base,
    win: {
      icon: "build/icon.ico",
      target: ["nsis"],
      requestedExecutionLevel: "asInvoker",
      verifyUpdateCodeSignature: true,
      azureSignOptions: {
        publisherName: required("DEVBOX_AZURE_PUBLISHER_NAME"),
        endpoint: required("DEVBOX_AZURE_SIGN_ENDPOINT"),
        certificateProfileName: required("DEVBOX_AZURE_CERT_PROFILE"),
        codeSigningAccountName: required("DEVBOX_AZURE_SIGN_ACCOUNT"),
        fileDigest: "SHA256",
        timestampRfc3161: process.env.DEVBOX_TIMESTAMP_URL?.trim() || "http://timestamp.acs.microsoft.com",
        timestampDigest: "SHA256"
      }
    }
  };
} else {
  throw new Error(`Signed release is blocked: unsupported DEVBOX_SIGNING_MODE '${signingMode}'. Use 'store' or 'azure'.`);
}
