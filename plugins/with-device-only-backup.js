const fs = require("node:fs");
const path = require("node:path");
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

const legacyRules = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="root" path="." />
  <exclude domain="file" path="." />
  <exclude domain="database" path="." />
  <exclude domain="sharedpref" path="." />
  <exclude domain="external" path="." />
  <exclude domain="device_root" path="." />
  <exclude domain="device_file" path="." />
  <exclude domain="device_database" path="." />
  <exclude domain="device_sharedpref" path="." />
</full-backup-content>`;

const extractionRules = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="root" path="." />
    <exclude domain="file" path="." />
    <exclude domain="database" path="." />
    <exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
    <exclude domain="device_root" path="." />
    <exclude domain="device_file" path="." />
    <exclude domain="device_database" path="." />
    <exclude domain="device_sharedpref" path="." />
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" path="." />
    <exclude domain="file" path="." />
    <exclude domain="database" path="." />
    <exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
    <exclude domain="device_root" path="." />
    <exclude domain="device_file" path="." />
    <exclude domain="device_database" path="." />
    <exclude domain="device_sharedpref" path="." />
  </device-transfer>
</data-extraction-rules>`;

const networkSecurityRules = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">10.0.2.2</domain>
  </domain-config>
</network-security-config>`;

module.exports = function withDeviceOnlyBackup(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (application) {
      application.$["android:allowBackup"] = "false";
      application.$["android:fullBackupContent"] = "@xml/antigpt_backup_rules";
      application.$["android:dataExtractionRules"] = "@xml/antigpt_data_extraction_rules";
      application.$["android:networkSecurityConfig"] = "@xml/antigpt_network_security";
    }
    const permissions = modConfig.modResults.manifest["uses-permission"];
    if (permissions) {
      modConfig.modResults.manifest["uses-permission"] = permissions.filter(
        (permission) => permission.$["android:name"] !== "android.permission.SYSTEM_ALERT_WINDOW",
      );
    }
    return modConfig;
  });

  return withDangerousMod(config, ["android", async (modConfig) => {
    const xmlDirectory = path.join(modConfig.modRequest.platformProjectRoot, "app/src/main/res/xml");
    fs.mkdirSync(xmlDirectory, { recursive: true });
    fs.writeFileSync(path.join(xmlDirectory, "antigpt_backup_rules.xml"), legacyRules);
    fs.writeFileSync(path.join(xmlDirectory, "antigpt_data_extraction_rules.xml"), extractionRules);
    fs.writeFileSync(path.join(xmlDirectory, "antigpt_network_security.xml"), networkSecurityRules);

    for (const variant of ["debug", "debugOptimized"]) {
      const manifestPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        `app/src/${variant}/AndroidManifest.xml`,
      );
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = fs.readFileSync(manifestPath, "utf8");
      const secureManifest = manifest
        .replace(/\s+android:usesCleartextTraffic="true"/g, "")
        .replace(/\s+tools:replace="android:usesCleartextTraffic"/g, "");
      if (secureManifest !== manifest) fs.writeFileSync(manifestPath, secureManifest);
    }
    return modConfig;
  }]);
};
