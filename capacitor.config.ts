import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "org.usna.hopperstudio",
  appName: "USNA Hopper Studio",
  webDir: "student-build",
  ios: {
    contentInset: "always",
    preferredContentMode: "desktop",
    scrollEnabled: true,
  },
};

export default config;
